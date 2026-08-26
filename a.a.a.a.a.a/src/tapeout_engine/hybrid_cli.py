from __future__ import annotations
from dataclasses import fields, replace
from pathlib import Path
import argparse,json,time
from .config import load_config
from .maturity_cli import build_agent
from .rpc import JsonRpcClient
from .hybrid import HybridController,HybridPolicy,HybridStore
from .hybrid_dashboard import serve
from .hybrid_bootstrap import ResilientHybridFacade, diagnose_config

def _filter(dc,raw):
    allowed={f.name for f in fields(dc)}
    return {k:v for k,v in (raw or {}).items() if k in allowed}

def build_hybrid(config_path:str)->HybridController:
    c=load_config(config_path);agent=build_agent(config_path)
    agent.policy=replace(agent.policy,required_level=int(c.get("hybrid",{}).get("required_maturity_level",5)),execute=False)
    rpc_url=c.get("hybrid",{}).get("rpc_url") or c.get("chain",{}).get("rpc_url") or c.get("execution",{}).get("rpc_url")
    if not rpc_url: raise ValueError("hybrid manual tx recorder requires BNB rpc_url")
    rpc=JsonRpcClient(rpc_url);h=c.get("hybrid",{})
    store=HybridStore(h.get("state_db","state/hybrid.sqlite"),h.get("manual_package_dir","state/manual-packages"))
    return HybridController(agent,store,agent.learning,agent.protocol,rpc,agent.market,HybridPolicy(**_filter(HybridPolicy,h)))

def main(argv=None):
    p=argparse.ArgumentParser(prog="tapeout-hybrid");sub=p.add_subparsers(dest="cmd",required=True)
    v=sub.add_parser("validate-config");v.add_argument("config")
    r=sub.add_parser("run-once");r.add_argument("config");r.add_argument("--out",default="state/hybrid-latest.json")
    d=sub.add_parser("daemon");d.add_argument("config");d.add_argument("--interval",type=float,default=60);d.add_argument("--out",default="state/hybrid-latest.json");d.add_argument("--max-cycles",type=int,default=0)
    ds=sub.add_parser("dashboard");ds.add_argument("config");ds.add_argument("--host",default="127.0.0.1");ds.add_argument("--port",type=int,default=8787)
    rc=sub.add_parser("recheck");rc.add_argument("config");rc.add_argument("package_id")
    tx=sub.add_parser("record-tx");tx.add_argument("config");tx.add_argument("package_id");tx.add_argument("tx_hash")
    rr=sub.add_parser("record-realized");rr.add_argument("config");rr.add_argument("package_id");rr.add_argument("--bem",type=float,required=True);rr.add_argument("--usd",type=float,required=True);rr.add_argument("--sale-tx-hash")
    mon=sub.add_parser("poll-monitoring");mon.add_argument("config")
    st=sub.add_parser("status");st.add_argument("config")
    doc=sub.add_parser("doctor");doc.add_argument("config")
    args=p.parse_args(argv)
    if args.cmd=="validate-config":
        c=load_config(args.config);blockers=[]
        if bool(c.get("maturity",{}).get("execute",False)):blockers.append("hybrid requires maturity.execute=false")
        if bool(c.get("execution",{}).get("policy",{}).get("enabled",False)):blockers.append("hybrid requires execution.policy.enabled=false")
        if int(c.get("hybrid",{}).get("required_maturity_level",5))>5:blockers.append("hybrid bootstrap maturity level must be <=5")
        print(json.dumps({"ok":not blockers,"blockers":blockers},indent=2));return 0 if not blockers else 2
    if args.cmd=="dashboard":
        facade=ResilientHybridFacade(args.config,build_hybrid)
        serve(facade,args.host,args.port)
        return 0
    if args.cmd=="doctor":
        facade=ResilientHybridFacade(args.config,build_hybrid)
        result=facade.doctor()
        print(json.dumps(result,indent=2,sort_keys=True))
        return 0 if result["ready"] else 2
    if args.cmd=="daemon":
        facade=ResilientHybridFacade(args.config,build_hybrid)
        n=0
        pth=Path(args.out);pth.parent.mkdir(parents=True,exist_ok=True)
        while args.max_cycles<=0 or n<args.max_cycles:
            n+=1
            try:
                out=facade.run_cycle()
                mon=facade.poll_monitoring()
                payload={"cycle":out,"monitoring":mon,"bootstrap":facade.doctor()}
            except Exception as e:
                payload={
                    "cycle":{
                        "run_id":f"bootstrap-{time.time_ns()}",
                        "generated_at":time.time(),
                        "status":"SETUP_REQUIRED",
                        "best_opportunity_now":None,
                        "watchlist":[],
                        "manual_package":None,
                        "errors":[{"stage":"BOOTSTRAP","error":f"{type(e).__name__}: {e}"}],
                    },
                    "monitoring":[],
                    "bootstrap":facade.doctor(),
                }
            pth.write_text(json.dumps(payload,indent=2,sort_keys=True))
            if args.max_cycles>0 and n>=args.max_cycles:
                break
            time.sleep(args.interval)
        return 0

    ctl=build_hybrid(args.config)
    if args.cmd=="run-once":
        out=ctl.run_cycle();ctl.poll_monitoring();pth=Path(args.out);pth.parent.mkdir(parents=True,exist_ok=True);pth.write_text(json.dumps(out,indent=2,sort_keys=True));print(json.dumps(out,indent=2,sort_keys=True));return 0
    if args.cmd=="recheck":print(json.dumps(ctl.recheck(args.package_id),indent=2,sort_keys=True));return 0
    if args.cmd=="record-tx":print(json.dumps(ctl.record_manual_tx(args.package_id,args.tx_hash).to_dict(),indent=2,sort_keys=True));return 0
    if args.cmd=="record-realized":print(json.dumps(ctl.record_realized(args.package_id,args.bem,args.usd,args.sale_tx_hash),indent=2,sort_keys=True));return 0
    if args.cmd=="poll-monitoring":print(json.dumps(ctl.poll_monitoring(),indent=2,sort_keys=True));return 0
    if args.cmd=="status":print(json.dumps(ctl.dashboard_summary(),indent=2,sort_keys=True));return 0
    return 2
if __name__=="__main__":raise SystemExit(main())
