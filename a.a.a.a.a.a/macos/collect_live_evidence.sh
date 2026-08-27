#!/bin/bash
set -u

ROOT='/Users/Shared/WorkspaceBersama/opentrue.org (loading ke antigravity)/a.a.a.a.a.a'
source "$ROOT/.hybrid.env"
OUT="${HYBRID_RUNTIME:-$ROOT/.runtime}/live-evidence"
mkdir -p "$OUT/assets"
chmod 700 "$OUT"

echo "=== TapeOut public evidence collector v7.9 ==="
echo "Read-only evidence only. No wallet/private key is read."

# v7.9 security rule: RPC credentials/paths/query strings must never be persisted
# into downloadable evidence. The raw endpoint is used only for the live curl call.
redact_rpc_url() {
  python3 - "$1" <<'PY'
import sys, urllib.parse
raw=sys.argv[1]
try:
    u=urllib.parse.urlsplit(raw)
    host=u.hostname or "unknown"
    port=f":{u.port}" if u.port else ""
    scheme=u.scheme or "https"
    path="/" if not u.path or u.path=="/" else "/<redacted>"
    print(f"{scheme}://{host}{port}{path}")
except Exception:
    print("<redacted-rpc-endpoint>")
PY
}

# Always create downloadable JSON before any network call. Even a later timeout
# leaves truthful partial evidence rather than a browser 404.
python3 - "$OUT" <<'PY'
from pathlib import Path
import json,sys,time
out=Path(sys.argv[1])
base={
    "collector_version":"7.9",
    "status":"COLLECTING",
    "started_at":time.time(),
    "official_http":{},
    "rpc_failover":[],
    "security":{"rpc_urls_redacted":True,"wallet_boundary":"MANUAL_ONLY"},
}
(out/"evidence.json").write_text(json.dumps(base,indent=2))
(out/"frontend-clues.json").write_text("[]\n")
(out/"protocol-candidates.json").write_text("[]\n")
PY

fetch() {
  local name="$1"
  local url="$2"
  local tmp="$OUT/$name.tmp"
  rm -f "$tmp"
  if /usr/bin/curl --fail-with-body --location --silent --show-error \
      --connect-timeout 3 --max-time 7 \
      -A 'tapeout-hybrid-evidence/7.9' "$url" -o "$tmp"; then
    mv "$tmp" "$OUT/$name"
    printf 'PASS %-24s %s bytes\n' "$name" "$(wc -c < "$OUT/$name" | tr -d ' ')"
    return 0
  fi
  rm -f "$tmp"
  printf 'FAIL %-24s official endpoint unavailable\n' "$name"
  return 1
}

# Official sources only. Failures are evidence too and never abort the script.
fetch tasks.json 'https://www.tapeout.net/tasks.json' || \
  fetch tasks.json 'https://tapeout.net/tasks.json' || true
fetch pod-mainnet.json 'https://www.tapeout.net/pod/pod-mainnet.json' || true
fetch tapeout-home.html 'https://www.tapeout.net/' || true
fetch tapeout-pod.html 'https://www.tapeout.net/pod/' || true

# BSC reachability evidence. Raw URLs remain in process memory only. Persisted
# endpoint labels are redacted and curl stderr is not persisted because it can
# echo credential-bearing URLs.
: > "$OUT/rpc-failover.tsv"
RPC_LIST="${BNB_RPC_URLS:-${BNB_RPC_URL:-}}"
OLD_IFS="$IFS"; IFS=';'
count=0
for endpoint in $RPC_LIST; do
  IFS="$OLD_IFS"
  [[ -z "$endpoint" ]] && { IFS=';'; continue; }
  count=$((count+1))
  [[ "$count" -gt 6 ]] && break
  started="$(date +%s)"
  safe_endpoint="$(redact_rpc_url "$endpoint")"
  tmp_rpc="$OUT/.rpc-result-$count.tmp"
  rm -f "$tmp_rpc"
  if printf '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' |
      /usr/bin/curl --fail-with-body --silent \
        --connect-timeout 2 --max-time 4 \
        -H 'Content-Type: application/json' --data-binary @- "$endpoint" >"$tmp_rpc" 2>/dev/null; then
    result="$(cat "$tmp_rpc" 2>/dev/null || true)"
    printf '%s\tPASS\t%s\t%s\n' "$safe_endpoint" "$started" "$result" >> "$OUT/rpc-failover.tsv"
  else
    printf '%s\tFAIL\t%s\tRPC_REQUEST_FAILED\n' "$safe_endpoint" "$started" >> "$OUT/rpc-failover.tsv"
  fi
  rm -f "$tmp_rpc"
  IFS=';'
done
IFS="$OLD_IFS"

# Parse official files and write evidence regardless of fetch success.
python3 - "$OUT" <<'PY'
from pathlib import Path
import json,re,sys,time,urllib.parse
out=Path(sys.argv[1])
e={
  "collector_version":"7.9",
  "status":"PARTIAL",
  "finished_core_at":time.time(),
  "official_http":{},
  "rpc_failover":[],
  "security":{"rpc_urls_redacted":True,"wallet_boundary":"MANUAL_ONLY"},
}
for filename in ("tasks.json","pod-mainnet.json","tapeout-home.html","tapeout-pod.html"):
    p=out/filename
    e["official_http"][filename]={
        "available":p.exists() and p.stat().st_size>0,
        "bytes":p.stat().st_size if p.exists() else 0,
    }
rf=out/"rpc-failover.tsv"
if rf.exists():
    for line in rf.read_text(errors="replace").splitlines():
        parts=line.split("\t",3)
        if len(parts)==4:
            e["rpc_failover"].append({
                "endpoint":parts[0],"status":parts[1],
                "started":parts[2],"detail":parts[3],
            })
tasks=out/"tasks.json"
if tasks.exists() and tasks.stat().st_size:
    try:
        d=json.loads(tasks.read_text())
        items=d.get("tasks") if isinstance(d,dict) and isinstance(d.get("tasks"),list) else d
        e["tasks_type"]=type(d).__name__
        e["task_count"]=len(items) if isinstance(items,list) else None
        if isinstance(items,list) and items:
            first=items[0]
            e["first_task_keys"]=sorted(first.keys()) if isinstance(first,dict) else None
            # Keep schema discovery but do not persist an arbitrary complete
            # production task object before it has been audited.
            if isinstance(first,dict):
                e["first_task_sample"]={k:first[k] for k in sorted(first)[:40]}
    except Exception as ex:
        e["tasks_parse_error"]=type(ex).__name__
script_urls=[]
for html_name in ("tapeout-home.html","tapeout-pod.html"):
    p=out/html_name
    if not p.exists():
        continue
    text=p.read_text(errors="replace")
    scripts=re.findall(r"<script[^>]+src=['\"]([^'\"]+)",text,re.I)
    e[html_name+"_scripts"]=scripts
    e[html_name+"_addresses"]=sorted(set(re.findall(r"0x[a-fA-F0-9]{40}",text)))
    for s in scripts:
        u=urllib.parse.urljoin("https://www.tapeout.net/",s)
        if u.startswith("https://www.tapeout.net/") or u.startswith("https://tapeout.net/"):
            script_urls.append(u)
urls=list(dict.fromkeys(script_urls))[:12]
(out/"asset-urls.txt").write_text("\n".join(urls)+("\n" if urls else ""))
e["frontend_asset_count_planned"]=len(urls)
(out/"evidence.json").write_text(json.dumps(e,indent=2,ensure_ascii=False))
PY

# Download at most 12 same-origin JS assets. Each is bounded; individual errors
# do not abort evidence production.
n=0
while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  n=$((n+1)); [[ "$n" -gt 12 ]] && break
  dest="$OUT/assets/asset-$n.js"
  /usr/bin/curl --fail-with-body --location --silent \
    --connect-timeout 2 --max-time 5 \
    -A 'tapeout-hybrid-evidence/7.9' "$url" -o "$dest" 2>/dev/null || rm -f "$dest"
done < "$OUT/asset-urls.txt"

# Extract candidates only from official same-origin frontend assets. These are
# clues, not trusted deployment facts.
python3 - "$OUT" <<'PY'
from pathlib import Path
import json,re,sys,time
out=Path(sys.argv[1])
clues=[]
keywords=(
    "previewScore","commitDesign","circuitInfo","netlist","minerCount",
    "totalVerifWeight","totalUnverWeight","claim","processor","task",
    "contract","address","abi"
)
all_addresses=set()
for p in sorted((out/"assets").glob("*.js")):
    text=p.read_text(errors="replace")
    addrs=sorted(set(re.findall(r"0x[a-fA-F0-9]{40}",text)))
    all_addresses.update(a.lower() for a in addrs)
    words=[w for w in keywords if w in text]
    selectors=sorted(set(re.findall(r"0x[a-fA-F0-9]{8}\b",text)))
    if addrs or words:
        clues.append({
            "file":p.name,"source":"official_same_origin_frontend",
            "addresses":addrs,"keywords":words,"selectors":selectors[:200],
            "trust":"DISCOVERY_ONLY_UNVERIFIED",
        })
(out/"frontend-clues.json").write_text(json.dumps(clues,indent=2))
(out/"candidate-addresses.txt").write_text("\n".join(sorted(all_addresses)[:24])+("\n" if all_addresses else ""))

ep=out/"evidence.json"
try: e=json.loads(ep.read_text())
except Exception: e={"collector_version":"7.9"}
e["status"]="COMPLETE" if any(x.get("available") for x in e.get("official_http",{}).values()) else "PARTIAL_NO_OFFICIAL_HTTP"
e["frontend_assets_downloaded"]=len(list((out/"assets").glob("*.js")))
e["frontend_clue_files"]=len(clues)
e["candidate_addresses_discovered"]=len(all_addresses)
e["finished_at"]=time.time()
ep.write_text(json.dumps(e,indent=2,ensure_ascii=False))
PY

# Read-only eth_getCode probe for official-frontend candidate addresses. A code
# hit proves only that an address is a contract on chain 56; it does NOT prove
# that the contract is TapeOut or that any selector/schema is correct.
: > "$OUT/protocol-candidates.tsv"
probe_endpoint=""
OLD_IFS="$IFS"; IFS=';'
for endpoint in $RPC_LIST; do
  IFS="$OLD_IFS"
  [[ -z "$endpoint" ]] && { IFS=';'; continue; }
  if printf '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' |
      /usr/bin/curl --fail-with-body --silent --connect-timeout 2 --max-time 4 \
        -H 'Content-Type: application/json' --data-binary @- "$endpoint" 2>/dev/null |
      grep -qi '"0x38"'; then
    probe_endpoint="$endpoint"; break
  fi
  IFS=';'
done
IFS="$OLD_IFS"

if [[ -n "$probe_endpoint" && -f "$OUT/candidate-addresses.txt" ]]; then
  i=0
  while IFS= read -r addr; do
    [[ -z "$addr" ]] && continue
    i=$((i+1)); [[ "$i" -gt 24 ]] && break
    payload="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"]}"
    if code_json="$(printf '%s' "$payload" | /usr/bin/curl --fail-with-body --silent \
         --connect-timeout 2 --max-time 4 -H 'Content-Type: application/json' \
         --data-binary @- "$probe_endpoint" 2>/dev/null)"; then
      printf '%s\t%s\n' "$addr" "$code_json" >> "$OUT/protocol-candidates.tsv"
    else
      printf '%s\t{"error":"RPC_REQUEST_FAILED"}\n' "$addr" >> "$OUT/protocol-candidates.tsv"
    fi
  done < "$OUT/candidate-addresses.txt"
fi

python3 - "$OUT" <<'PY'
from pathlib import Path
import json,sys
out=Path(sys.argv[1]); rows=[]
p=out/"protocol-candidates.tsv"
if p.exists():
    for line in p.read_text(errors="replace").splitlines():
        if "\t" not in line: continue
        addr, raw=line.split("\t",1)
        try: d=json.loads(raw)
        except Exception: d={"error":"UNPARSEABLE_RPC_RESULT"}
        code=d.get("result") if isinstance(d,dict) else None
        rows.append({
            "address":addr,
            "source":"official_same_origin_frontend",
            "chain_id":56,
            "has_bytecode":bool(isinstance(code,str) and code not in ("0x","0x0","")),
            "bytecode_bytes":max(0,(len(code)-2)//2) if isinstance(code,str) and code.startswith("0x") else None,
            "trust":"CONTRACT_EXISTENCE_ONLY_NOT_PROTOCOL_VERIFIED",
            "error":d.get("error") if isinstance(d,dict) else None,
        })
(out/"protocol-candidates.json").write_text(json.dumps(rows,indent=2))
PY

rm -f "$OUT"/.rpc-result-*.tmp "$OUT/protocol-candidates.tsv"

echo
echo "Evidence output:"
echo "  $OUT/evidence.json"
echo "  $OUT/frontend-clues.json"
echo "  $OUT/protocol-candidates.json"
echo "Collector finished. Partial evidence remains downloadable."
exit 0
