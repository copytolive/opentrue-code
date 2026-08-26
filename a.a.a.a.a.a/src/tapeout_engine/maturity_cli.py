from __future__ import annotations
from dataclasses import fields
from pathlib import Path
import argparse
import json
import shlex
import time

from .allocation import AllocationPolicy
from .config import load_config as load_config_file, validate_l0_l8_config
from .chain_intel import ConfiguredRpcChainReader, StrictSnapshotFileChainReader, ExternalCommandChainReader
from .competitor import CompetitorHistory
from .economics import EconomicAssumptions
from .evm_market import PancakeV3SellQuoteProvider
from .execution import BudgetLedger, ExecutionEngine, ExecutionPolicy, ExternalSigner
from .learning import LearningStore
from .live_tasks import TapeOutOfficialTaskScanner, StrictSnapshotTaskScanner, ExternalCommandTaskScanner
from .market_intel import StrictHttpSellQuoteProvider, StrictSnapshotSellQuoteProvider
from .maturity_agent import L0L8Agent, MaturityPolicy
from .monitoring import PostTapeoutMonitor
from .portfolio import PortfolioConfig
from .probability import ProbabilityConfig
from .protocol_driver import ExternalCommandProtocolDriver
from .risk import RiskPolicy, StressConfig
from .rpc import JsonRpcClient
from .runtime import SingleInstanceLock, Heartbeat
from .swap_execution import ExternalSwapExecutor, ExternalSettlementExecutor
from .search_farm import LiveSearchFarm, SearchFarmPolicy
from .outcome_monitor import PersistentOutcomeMonitor

def _dc(cls,d):
    allowed={f.name for f in fields(cls)}
    return cls(**{k:v for k,v in (d or {}).items() if k in allowed})

def load_config(path):
    return load_config_file(path)

def build_agent(config_path:str):
    c=load_config(config_path)
    if c.get("mode","live")!="live":
        raise ValueError("production maturity CLI requires mode='live'")

    ts=c["task_source"]
    if ts["type"]=="official_http":
        tasks=TapeOutOfficialTaskScanner(
            url=ts.get("url",TapeOutOfficialTaskScanner.DEFAULT_URL),
            max_age_seconds=ts.get("max_age_seconds",900),
            timeout=ts.get("timeout",15),
            cache_file=ts.get("cache_file"),
            allow_cache=bool(ts.get("allow_cache",False)),
            mapping=ts.get("mapping"),
        )
    elif ts["type"]=="verified_snapshot":
        tasks=StrictSnapshotTaskScanner(ts["path"],ts.get("max_age_seconds",900))
    elif ts["type"]=="external_command":
        tasks=ExternalCommandTaskScanner(
            shlex.split(ts["command"]),
            verified=bool(ts.get("verified",False)),
            max_age_seconds=ts.get("max_age_seconds",900),
            timeout=ts.get("timeout",30),
        )
    else:
        raise ValueError("unsupported task_source.type")

    ch=c["chain"]
    rpc=None
    if ch["type"]=="rpc":
        chain=ConfiguredRpcChainReader(ch["rpc_url"],ch,ch.get("max_age_seconds",120))
        rpc=chain.rpc
    elif ch["type"]=="verified_snapshot":
        chain=StrictSnapshotFileChainReader(ch["path"],ch.get("max_age_seconds",120))
        if ch.get("rpc_url"): rpc=JsonRpcClient(ch["rpc_url"])
    elif ch["type"]=="external_command":
        chain=ExternalCommandChainReader(
            shlex.split(ch["command"]),
            verified=bool(ch.get("verified",False)),
            max_age_seconds=ch.get("max_age_seconds",120),
            timeout=ch.get("timeout",30),
            expected_chain_id=ch.get("expected_chain_id",56),
        )
        if ch.get("rpc_url"): rpc=JsonRpcClient(ch["rpc_url"])
    else:
        raise ValueError("unsupported chain.type")

    mk=c["market"]
    if mk["type"]=="http_quote":
        market=StrictHttpSellQuoteProvider(mk,mk.get("max_age_seconds",60))
    elif mk["type"]=="verified_snapshot":
        market=StrictSnapshotSellQuoteProvider(mk["path"],mk.get("max_age_seconds",60))
    elif mk["type"]=="pancake_v3":
        if rpc is None:
            rpc=JsonRpcClient(mk["rpc_url"])
        market=PancakeV3SellQuoteProvider(
            rpc=rpc,token_in=mk["bem_token"],token_out=mk["stable_token"],
            token_in_decimals=mk["bem_decimals"],
            token_out_decimals=mk["stable_decimals"],
            fee=mk["fee"],quoter=mk.get("quoter"),
            token_out_usd=mk.get("stable_usd",1.0),
            verified_route=bool(mk.get("verified_route",False)),
            max_age_seconds=mk.get("max_age_seconds",30),
        )
    else:
        raise ValueError("unsupported market.type")

    pr=c["protocol"]
    protocol=ExternalCommandProtocolDriver(
        shlex.split(pr["command"]),verified=bool(pr.get("verified",False)),
        timeout=pr.get("timeout",30),
    )

    learning=LearningStore(c.get("learning_db","state/learning.sqlite"))
    competitors=CompetitorHistory(c.get("competitor_db","state/competitors.sqlite"))

    exec_engine=None; post=None
    mp=_dc(MaturityPolicy,c.get("maturity",{}))
    if c.get("execution") and bool(c.get("execution",{}).get("policy",{}).get("enabled",False)):
        ex=c["execution"]
        if rpc is None:
            rpc=JsonRpcClient(ex["rpc_url"])
        ep=_dc(ExecutionPolicy,ex.get("policy",{}))
        if not ex.get("signer_command"):
            raise ValueError("enabled execution requires signer_command")
        signer=ExternalSigner(shlex.split(ex["signer_command"]),ex.get("signer_timeout",30))
        ledger=BudgetLedger(ex.get("ledger_db","state/budget.sqlite"))
        exec_engine=ExecutionEngine(rpc,signer,ledger,ep,ex.get("arm_token"))

        if c.get("post_tapeout"):
            pt=c["post_tapeout"]
            settle=pt.get("settlement_execution")
            if settle:
                settlement=ExternalSettlementExecutor(
                    shlex.split(settle["command"]),
                    bool(settle.get("verified",False)),
                    settle.get("timeout",180),
                )
                post=PersistentOutcomeMonitor(
                    pt.get("outcome_db","state/outcomes.sqlite"),
                    protocol,learning,settlement,
                )
            else:
                s=pt.get("swap_execution")
                swap=None
                if s:
                    swap=ExternalSwapExecutor(
                        shlex.split(s["command"]),bool(s.get("verified",False)),
                        s.get("timeout",90)
                    )
                post=PostTapeoutMonitor(protocol,learning,swap)

    search_farm=None
    if c.get("search_farm",{}).get("enabled",False):
        sf=c["search_farm"]
        search_farm=LiveSearchFarm(
            sf.get("state_dir","state/search-farm"),
            _dc(SearchFarmPolicy,sf.get("policy",{})),
        )

    return L0L8Agent(
        tasks,chain,market,protocol,learning,competitors,
        portfolio_config=_dc(PortfolioConfig,c.get("portfolio",{})),
        economics=_dc(EconomicAssumptions,c.get("economics",{})),
        stress_config=_dc(StressConfig,c.get("stress",{})),
        risk_policy=_dc(RiskPolicy,c.get("risk",{})),
        probability_config=_dc(ProbabilityConfig,c.get("probability",{})),
        allocation_policy=_dc(AllocationPolicy,c.get("allocation",{})),
        maturity_policy=mp,
        execution_engine=exec_engine,post_monitor=post,search_farm=search_farm,
    )

def run_daemon(agent,state_dir,interval,max_cycles):
    state=Path(state_dir); state.mkdir(parents=True,exist_ok=True)
    n=0
    latest_payload=None
    with SingleInstanceLock(state/"maturity-daemon.lock"), Heartbeat(
        state/"maturity-heartbeat.json",interval=min(15.0,max(2.0,float(interval)/4))
    ):
        while max_cycles<=0 or n<max_cycles:
            n+=1
            try:
                rep=agent.run_once().to_dict()
            except Exception as e:
                rep={
                    "run_id":f"daemon-error-{time.time_ns()}",
                    "started_at":None,"finished_at":None,
                    "required_level":8,"tasks_scanned":0,"candidates":[],
                    "best":None,"decision":"WAIT_DAEMON_EXCEPTION",
                    "execution":None,"post_tapeout":None,
                    "errors":[{"stage":"DAEMON","error":repr(e)}],
                    "calibration":{},
                }
            rep["daemon_cycle"]=n
            rep["written_at"]=time.time()
            tmp=state/"maturity-latest.json.tmp"
            tmp.write_text(json.dumps(rep,indent=2,sort_keys=True))
            tmp.replace(state/"maturity-latest.json")
            with (state/"maturity-history.jsonl").open("a") as f:
                f.write(json.dumps(rep,sort_keys=True)+"\n")
                f.flush()
            latest_payload=rep
            if max_cycles>0 and n>=max_cycles:
                return rep
            time.sleep(interval)
    return latest_payload

def main(argv=None):
    p=argparse.ArgumentParser(prog="tapeout-maturity")
    sub=p.add_subparsers(dest="cmd",required=True)

    v=sub.add_parser("validate-config"); v.add_argument("config")
    v.add_argument("--autonomous",action="store_true")
    r=sub.add_parser("run-once"); r.add_argument("config"); r.add_argument("--out",default="state/maturity-latest.json")
    d=sub.add_parser("daemon"); d.add_argument("config"); d.add_argument("--state-dir",default="state")
    d.add_argument("--interval",type=float,default=60); d.add_argument("--max-cycles",type=int,default=0)
    c=sub.add_parser("calibration-status"); c.add_argument("--db",default="state/learning.sqlite")
    c.add_argument("--target",type=float,default=.90); c.add_argument("--min-samples",type=int,default=100)
    dr=sub.add_parser("doctor"); dr.add_argument("config")
    args=p.parse_args(argv)

    if args.cmd=="calibration-status":
        st=LearningStore(args.db)
        print(json.dumps(st.probability_calibration(args.target,args.min_samples).to_dict(),indent=2))
        return 0

    raw_config=load_config(args.config)
    static_blockers=validate_l0_l8_config(
        raw_config,
        autonomous=bool(getattr(args,"autonomous",False)),
    )
    agent=build_agent(args.config)
    if args.cmd=="doctor":
        checks={}
        try:
            rows=agent.tasks.scan()
            checks["task_source"]={"ok":True,"active_tasks":len(rows)}
        except Exception as e:
            checks["task_source"]={"ok":False,"error":repr(e)}
        try:
            if hasattr(agent.chain,"probe"):
                checks["chain"]={"ok":True,**agent.chain.probe()}
            else:
                checks["chain"]={"ok":True,"note":"snapshot reader checked during task evaluation"}
        except Exception as e:
            checks["chain"]={"ok":False,"error":repr(e)}
        checks["protocol"]={
            "ok":bool(getattr(agent.protocol,"verified",False)),
            "verified":bool(getattr(agent.protocol,"verified",False)),
            "driver":agent.protocol.__class__.__name__,
        }
        try:
            q=agent.market.quote("BEM",0.001)
            q.freshness.require(require_verified=True)
            checks["market"]={
                "ok":True,
                "route":q.route,
                "effective_price_usd":q.effective_price_usd,
                "slippage_fraction":q.slippage_fraction,
                "block_number":q.freshness.block_number,
            }
        except Exception as e:
            checks["market"]={"ok":False,"error":repr(e)}
        cal=agent.learning.probability_calibration(
            agent.policy.min_probability_positive,
            agent.policy.calibration_min_samples,
            agent.policy.calibration_max_brier,
            agent.policy.calibration_max_ece,
        )
        checks["calibration"]={"ok":cal.calibrated,**cal.to_dict()}
        if agent.execution_engine is None:
            checks["execution"]={"ok":False,"note":"execution engine not configured"}
        else:
            ep=agent.execution_engine.policy
            checks["execution"]={
                "ok":bool(ep.enabled and ep.allowed_contracts and ep.allowed_selectors),
                "enabled":ep.enabled,
                "allowed_contracts":list(ep.allowed_contracts),
                "allowed_selectors":list(ep.allowed_selectors),
                "expected_chain_id":ep.expected_chain_id,
            }
        checks["feedback_loop"]={
            "ok":bool(
                agent.post_monitor is not None
                and getattr(agent.post_monitor,"feedback_ready",False)
            ),
            "monitor":None if agent.post_monitor is None else agent.post_monitor.__class__.__name__,
            "status":(
                agent.post_monitor.status()
                if agent.post_monitor is not None and hasattr(agent.post_monitor,"status")
                else {}
            ),
        }
        ok=all(x.get("ok",False) for x in checks.values())
        print(json.dumps({"ok":ok,"checks":checks},indent=2))
        return 0
    if args.cmd=="validate-config":
        ok=not static_blockers
        print(json.dumps({
            "ok":ok,
            "blockers":static_blockers,
            "note":"Static L0-L8 configuration check only. Use doctor for live freshness/chain/market/calibration checks."
        },indent=2))
        return 0 if ok else 2
    if args.cmd=="run-once":
        rep=agent.run_once().to_dict()
        out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(rep,indent=2,sort_keys=True))
        print(json.dumps({
            "decision":rep["decision"],
            "tasks_scanned":rep["tasks_scanned"],
            "best_level":None if not rep["best"] else rep["best"]["maturity"]["achieved_level"],
            "report":str(out),
        },indent=2))
        return 0
    rep=run_daemon(agent,args.state_dir,args.interval,args.max_cycles)
    print(json.dumps({"decision":rep["decision"],"report":str(Path(args.state_dir)/"maturity-latest.json")},indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
