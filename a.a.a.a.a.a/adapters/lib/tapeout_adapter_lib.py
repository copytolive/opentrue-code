from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
SRC=ROOT/"src"
if str(SRC) not in sys.path:
    sys.path.insert(0,str(SRC))

from tapeout_engine.abi import calldata, decode_words, hex_to_bytes
from tapeout_engine.model import Circuit
from tapeout_engine.netlist import ManifestNetlistEncoder

MANIFEST_PATH=HERE/"tapeout_protocol_manifest.json"
MANIFEST=json.loads(MANIFEST_PATH.read_text())

CHAIN_ID=int(MANIFEST["chain_id"])
CONTRACTS={k:str(v) for k,v in MANIFEST["contracts"].items()}
CPUS={k:dict(v) for k,v in MANIFEST["cpus"].items()}
TASKS={str(x["task_id"]):dict(x) for x in MANIFEST["tasks"]}

SEL={
    "totalVerifWeight":"0xef6aff46",
    "totalUnverWeight":"0x63967742",
    "dailyEmission":"0xa335fd36",
    "UNVERIFIED_BPS":"0xd8d56ffb",
    "bestSlot":"0x11d5a55c",
    "bonusOf":"0x500446c4",
    "processorMultiplier":"0x0f03daba",
    "transistors":"0x6fbd1719",
    "mintPrice":"0x6817c76c",
    "protocolFee":"0xb0e21e8a",
    "supplyCap":"0x8f770ad0",
    "minted":"0x4f02c420",
    "NAND":"0x3bcce6c9",
    "LATCH":"0x15f47f4f",
    "tapeout":"0x7bd3ac1d",
    "circuitInfo":"0x084d60f1",
    "netlist":"0x3fc4be56",
    "minerKey":"0x10eafa00",
    "getMiner":"0x0527edc2",
    "pendingLive":"0x62b9360d",
}
TAPED_OUT_TOPIC="0xc11215e417669c143c8a07aeb778034c0a0a85ebdf305d64a629b19a7a9ce031"


def canonical_hash(obj)->str:
    return hashlib.sha256(
        json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    ).hexdigest()


def _curl(args:list[str],input_bytes:bytes|None=None,timeout:float=25)->bytes:
    curl=shutil.which("curl") or "/usr/bin/curl"
    p=subprocess.run([curl,*args],input=input_bytes,capture_output=True,timeout=timeout)
    if p.returncode!=0:
        raise RuntimeError("public/network request failed")
    return p.stdout


def http_json(url:str,timeout:float=25):
    u=urlparse(url)
    if u.scheme!="https" or not u.hostname:
        raise RuntimeError("HTTPS URL required")
    raw=_curl([
        "--fail-with-body","--location","--silent","--show-error",
        "--connect-timeout","4","--max-time",str(max(5,int(timeout))),
        "-A","tapeout-hybrid-live-adapter/8.2",url,
    ],timeout=timeout+5)
    return json.loads(raw)


def rpc_urls()->list[str]:
    rows=[]
    multi=os.environ.get("BNB_RPC_URLS","")
    single=os.environ.get("BNB_RPC_URL","")
    for raw in ([single] + multi.split(";")):
        s=str(raw).strip()
        if s and s not in rows:
            rows.append(s)
    if not rows:
        raise RuntimeError("BNB RPC is not configured")
    return rows


def rpc_call(method:str,params:list,timeout:float=8):
    payload=json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params},separators=(",",":")).encode()
    errors=0
    for endpoint in rpc_urls():
        try:
            raw=_curl([
                "--fail-with-body","--silent","--show-error",
                "--connect-timeout","3","--max-time",str(max(4,int(timeout))),
                "-H","Content-Type: application/json","--data-binary","@-",endpoint,
            ],input_bytes=payload,timeout=timeout+4)
            d=json.loads(raw)
            if "error" in d:
                errors+=1; continue
            if "result" not in d:
                errors+=1; continue
            return d["result"]
        except Exception:
            errors+=1
    raise RuntimeError(f"all configured BNB RPC endpoints failed for {method} ({errors} attempts)")


def eth_call(to:str,data:str):
    return rpc_call("eth_call",[{"to":to,"data":data},"latest"])


def require_chain()->tuple[int,int,int]:
    cid=int(rpc_call("eth_chainId",[]),16)
    if cid!=CHAIN_ID:
        raise RuntimeError(f"wrong chain id {cid}; expected {CHAIN_ID}")
    block=int(rpc_call("eth_blockNumber",[]),16)
    gas=int(rpc_call("eth_gasPrice",[]),16)
    if block<=0 or gas<=0:
        raise RuntimeError("invalid BNB live block/gas data")
    for address in CONTRACTS.values():
        code=rpc_call("eth_getCode",[address,"latest"])
        if code in ("0x","0x0",""):
            raise RuntimeError("audited TapeOut contract has no bytecode")
    return cid,block,gas


def uint_call(to:str,selector:str,types:list[str]|None=None,values:list|None=None)->int:
    data=calldata(selector,types or [],values or [])
    words=decode_words(eth_call(to,data))
    if not words:
        raise RuntimeError("missing uint return word")
    return int(words[0])


def words_call(to:str,selector:str,types:list[str]|None=None,values:list|None=None)->list[int]:
    data=calldata(selector,types or [],values or [])
    return [int(x) for x in decode_words(eth_call(to,data))]


def address_call(to:str,selector:str,types:list[str]|None=None,values:list|None=None)->str:
    raw=eth_call(to,calldata(selector,types or [],values or []))
    b=hex_to_bytes(raw)
    if len(b)<32:
        raise RuntimeError("missing address return word")
    return "0x"+b[12:32].hex()


def public_bnb_usd()->tuple[float,str]:
    quoter=os.environ.get("PANCAKE_V3_QUOTER","").strip()
    stable=os.environ.get("STABLE_TOKEN_ADDRESS","").strip()
    wbnb=os.environ.get("WBNB_TOKEN_ADDRESS","0xbb4CdB9CBd36B01d1cBaEBF2De08d9173bc095c").strip()
    if quoter and stable:
        try:
            stable_dec=uint_call(stable,"0x313ce567")
            if stable_dec<0 or stable_dec>36:
                raise RuntimeError("invalid stablecoin decimals")
            for fee in (100,500,2500,10000):
                try:
                    data=calldata(
                        "0xc6a5026a",
                        ["address","address","uint256","uint24","uint160"],
                        [wbnb,stable,10**18,fee,0],
                    )
                    words=decode_words(eth_call(quoter,data))
                    if words:
                        value=float(words[0])/(10**int(stable_dec))
                        if value>0 and value<1_000_000:
                            return value,f"pancake-v3:WBNB/stable fee={fee}"
                except Exception:
                    continue
        except Exception:
            pass

    sources=[
        ("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT",
         lambda d: float(d["price"]),"binance:BNBUSDT"),
        ("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd",
         lambda d: float(d["binancecoin"]["usd"]),"coingecko:binancecoin/usd"),
    ]
    for url,parse,label in sources:
        try:
            value=parse(http_json(url,timeout=10))
            if value>0 and value<1_000_000:
                return value,label
        except Exception:
            continue
    raise RuntimeError("fresh BNB/USD price unavailable")


def bits_lsb_bytes(hex_value:str,width:int)->list[int]:
    s=str(hex_value)
    if s.startswith("0x"): s=s[2:]
    b=bytes.fromhex(s) if s else b""
    out=[]
    for byte in b:
        out.extend((byte>>i)&1 for i in range(8))
    if len(out)<int(width):
        raise RuntimeError("official vector byte width too short")
    return out[:int(width)]


def parse_netlist(netlist_hex:str)->dict:
    b=hex_to_bytes(netlist_hex)
    i=0; nand=0; latch=0
    while i<len(b):
        op=b[i]
        if op==0:
            if i+7>len(b): raise RuntimeError("truncated NAND record")
            nand+=1; i+=7
        elif op==1:
            if i+4>len(b): raise RuntimeError("truncated LATCH record")
            latch+=1; i+=4
        else:
            raise RuntimeError(f"unsupported/REF netlist opcode 0x{op:02x}")
    if nand+latch<=0:
        raise RuntimeError("mining candidate must burn at least one transistor")
    return {"nand":nand,"latch":latch,"bstar":nand+latch,"bytes":len(b)}


def normalize_candidate(circuit_dict:dict)->Circuit:
    c=Circuit.from_dict(circuit_dict)
    cfg={"name":"tapeout-bnb-mainnet-v8.1","trusted":True,**MANIFEST["netlist"]}
    return ManifestNetlistEncoder(cfg).encode(c).circuit


def encode_candidate(circuit_dict:dict)->str:
    c=Circuit.from_dict(circuit_dict)
    cfg={"name":"tapeout-bnb-mainnet-v8.1","trusted":True,**MANIFEST["netlist"]}
    enc=ManifestNetlistEncoder(cfg).encode(c)
    parsed=parse_netlist(enc.hex)
    if parsed["nand"]!=enc.circuit.n_nand or parsed["latch"]!=enc.circuit.n_latch:
        raise RuntimeError("netlist burn counts mismatch normalized circuit")
    return enc.hex


def task_meta(task_id)->dict:
    x=TASKS.get(str(task_id))
    if not x:
        raise RuntimeError("task not present in audited v8.1 manifest")
    return x


def processor_meta(name:str)->dict:
    x=CPUS.get(str(name))
    if not x:
        raise RuntimeError("processor not present in audited v8.1 manifest")
    return x


def normalize_address(v:str)->str:
    s=str(v or "").lower()
    if not s.startswith("0x") or len(s)!=42:
        raise RuntimeError("invalid address")
    int(s[2:],16)
    return s


def tx_data(tx:dict)->str:
    return str(tx.get("input") or tx.get("data") or "0x")


def hex_int(v)->int:
    if v is None: return 0
    if isinstance(v,int): return v
    s=str(v)
    return int(s,16) if s.startswith("0x") else int(s)


def decode_tapeout_calldata(data:str)->dict:
    b=hex_to_bytes(data)
    if len(b)<4+96 or "0x"+b[:4].hex()!=SEL["tapeout"]:
        raise RuntimeError("not audited tapeout calldata")
    args=b[4:]
    off=int.from_bytes(args[0:32],"big")
    n_in=int.from_bytes(args[32:64],"big")
    n_out=int.from_bytes(args[64:96],"big")
    if off%32 or off+32>len(args):
        raise RuntimeError("invalid dynamic bytes offset")
    ln=int.from_bytes(args[off:off+32],"big")
    start=off+32; end=start+ln
    if end>len(args):
        raise RuntimeError("truncated tapeout netlist")
    nl=args[start:end]
    return {"netlist_hex":"0x"+nl.hex(),"n_in":n_in,"n_out":n_out}


def find_tapedout(receipts:list[dict],expected_processor:str|None=None)->dict|None:
    exp=normalize_address(expected_processor) if expected_processor else None
    for receipt in receipts:
        for log in receipt.get("logs",[]) or []:
            try:
                addr=normalize_address(log.get("address"))
                topics=[str(x).lower() for x in (log.get("topics") or [])]
                if exp and addr!=exp: continue
                if not topics or topics[0]!=TAPED_OUT_TOPIC: continue
                if len(topics)<3: continue
                circuit_id=int(topics[1],16)
                author="0x"+topics[2][-40:]
                data_words=decode_words(log.get("data","0x"))
                gate_count=int(data_words[0]) if data_words else None
                n_state=int(data_words[1]) if len(data_words)>1 else None
                return {"processor":addr,"circuit_id":circuit_id,"author":author,
                        "gate_count":gate_count,"n_state":n_state}
            except Exception:
                continue
    return None


def miner_key(circuits:str,circuit_id:int)->str:
    raw=eth_call(CONTRACTS["mining"],calldata(
        SEL["minerKey"],["address","uint256"],[circuits,int(circuit_id)]
    ))
    b=hex_to_bytes(raw)
    if len(b)<32: raise RuntimeError("minerKey missing bytes32")
    return "0x"+b[:32].hex()


def mining_record(key:str)->dict:
    words=words_call(CONTRACTS["mining"],SEL["getMiner"],["bytes32"],[key])
    if len(words)<22:
        raise RuntimeError("getMiner tuple shorter than audited ABI")
    return {
        "circuits":"0x"+int(words[0]).to_bytes(32,"big")[-20:].hex(),
        "circuit_id":words[1],"task_id":words[2],"gate_count":words[3],
        "state_count":words[4],"depth":words[5],"area":words[6],"mult":words[7],
        "since":words[8],"status":words[9],
        "registrant":"0x"+int(words[10]).to_bytes(32,"big")[-20:].hex(),
        "nand_burn":words[11],"latch_burn":words[12],"bstar":words[13],
        "bonus":words[14],"optimal":bool(words[15]),"commit_block":words[16],
        "first_unused_id":words[17],"stop_block":words[18],
        "verif_weight":words[19],"unver_weight":words[20],"debt":words[21],
    }


def claimable_bem(key:str)->float:
    raw=uint_call(CONTRACTS["lens"],SEL["pendingLive"],["bytes32"],[key])
    return raw/1e8
