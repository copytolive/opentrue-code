from __future__ import annotations
from pathlib import Path
import json
import os
import re
import time
import traceback

_ENV_RE=re.compile(r"\$\{([A-Z0-9_]+)(?::-(.*?))?\}")
_BAD_MARKERS=("YOUR_", "0x...", "CHANGE_ME", "REPLACE_ME", "<")

def _raw_config(path:str|Path)->dict:
    return json.loads(Path(path).read_text())

def required_env(path:str|Path)->list[str]:
    raw=Path(path).read_text()
    return sorted(set(m.group(1) for m in _ENV_RE.finditer(raw)))

def diagnose_config(path:str|Path)->dict:
    path=Path(path)
    checks=[]
    def add(name,ok,detail):
        checks.append({"name":name,"ok":bool(ok),"detail":str(detail)})

    add("config_file",path.is_file(),path)
    if not path.is_file():
        return {
            "ready":False,"status":"SETUP_REQUIRED","checks":checks,
            "blockers":[f"missing config: {path}"]
        }

    try:
        raw=_raw_config(path)
        add("config_json",True,"valid JSON")
    except Exception as e:
        add("config_json",False,repr(e))
        return {"ready":False,"status":"SETUP_REQUIRED","checks":checks,"blockers":[repr(e)]}

    missing=[]
    placeholders=[]
    for name in required_env(path):
        value=os.environ.get(name)
        if value is None or not str(value).strip():
            missing.append(name)
        elif any(x in str(value) for x in _BAD_MARKERS):
            placeholders.append(name)
    add("required_env",not missing,f"missing={missing}" if missing else "present")
    add("no_placeholder_env",not placeholders,
        f"placeholder={placeholders}" if placeholders else "no obvious placeholders")

    root=os.environ.get("HYBRID_ROOT")
    runtime=os.environ.get("HYBRID_RUNTIME")
    if root:
        add("hybrid_root",Path(root).is_dir(),root)
    else:
        add("hybrid_root",False,"HYBRID_ROOT not set")
    if runtime:
        try:
            Path(runtime).mkdir(parents=True,exist_ok=True)
            probe=Path(runtime)/".write-test"
            probe.write_text("ok"); probe.unlink()
            add("runtime_writable",True,runtime)
        except Exception as e:
            add("runtime_writable",False,repr(e))
    else:
        add("runtime_writable",False,"HYBRID_RUNTIME not set")

    for env_name in ("TAPEOUT_TASK_COLLECTOR","TAPEOUT_CHAIN_COLLECTOR","TAPEOUT_PROTOCOL_HELPER"):
        value=os.environ.get(env_name)
        if value and not any(x in value for x in _BAD_MARKERS):
            p=Path(value)
            exists=p.is_file() and os.access(p,os.X_OK)
            placeholder=False
            if p.is_file():
                try:
                    head=p.read_text(errors="ignore")[:4096].lower()
                    placeholder=("fail-closed placeholder" in head)
                except Exception:
                    pass
            add(
                env_name,
                exists and not placeholder,
                (
                    f"{value} is the bundled fail-closed placeholder; replace with audited live adapter"
                    if placeholder else
                    f"{value} exists={p.is_file()} executable={os.access(p,os.X_OK)}"
                )
            )
        else:
            add(env_name,False,f"{env_name} not configured")

    blockers=[x["detail"] for x in checks if not x["ok"]]
    return {
        "ready":not blockers,
        "status":"READY_TO_BUILD_ENGINE" if not blockers else "SETUP_REQUIRED",
        "checks":checks,
        "blockers":blockers,
        "required_env":required_env(path),
    }

class ResilientHybridFacade:
    """
    Always-start dashboard boundary.

    The HTTP server can bind even when live RPC/adapters are missing. Engine-only
    operations lazily build the real HybridController and fail with actionable
    diagnostics instead of killing the dashboard process.
    """
    def __init__(self,config_path:str|Path,builder):
        self.config_path=str(config_path)
        self.builder=builder
        self._ctl=None
        self._last_build_error=None
        self._last_build_at=None

    def _build(self,force:bool=False):
        if self._ctl is not None and not force:
            return self._ctl
        self._last_build_at=time.time()
        try:
            self._ctl=self.builder(self.config_path)
            self._last_build_error=None
            return self._ctl
        except Exception as e:
            self._ctl=None
            self._last_build_error=f"{type(e).__name__}: {e}"
            raise

    def light_status(self)->dict:
        """Fast, no-network status used by the 15s browser refresh."""
        base=diagnose_config(self.config_path)
        checks=list(base["checks"])
        if self._ctl is not None:
            checks.append({
                "name":"engine_constructs","ok":True,
                "detail":"HybridController constructed"
            })
        elif self._last_build_error:
            checks.append({
                "name":"engine_constructs","ok":False,
                "detail":self._last_build_error
            })
        blockers=[x["detail"] for x in checks if not x["ok"]]
        live_ready=False
        live_status="NOT_CHECKED"
        live_detail=None
        runtime=os.environ.get("HYBRID_RUNTIME")
        if runtime:
            latest=Path(runtime)/"hybrid-latest.json"
            if latest.is_file():
                try:
                    payload=json.loads(latest.read_text())
                    boot=payload.get("bootstrap",{})
                    age=time.time()-latest.stat().st_mtime
                    live_ready=bool(boot.get("ready",False)) and age<=180
                    live_status=boot.get("status","UNKNOWN")
                    live_detail={"age_seconds":age,"bootstrap":boot}
                except Exception as e:
                    live_detail={"error":repr(e)}
        return {
            "ready":not blockers,
            "local_ready":not blockers,
            "live_ready":live_ready,
            "status":"LOCAL_READY" if not blockers else "SETUP_REQUIRED",
            "live_status":live_status,
            "live_detail":live_detail,
            "checks":checks,
            "blockers":blockers,
            "last_build_error":self._last_build_error,
            "last_build_at":self._last_build_at,
        }

    def doctor(self)->dict:
        base=diagnose_config(self.config_path)
        checks=list(base["checks"])
        engine_ok=False
        engine_error=None
        ctl=None
        try:
            ctl=self._build(force=True)
            engine_ok=True
        except Exception as e:
            engine_error=f"{type(e).__name__}: {e}"
        checks.append({
            "name":"engine_constructs",
            "ok":engine_ok,
            "detail":"HybridController constructed" if engine_ok else (engine_error or "waiting for setup")
        })

        if ctl is not None:
            try:
                cid=int(ctl.rpc.chain_id())
                checks.append({
                    "name":"bnb_chain_id","ok":cid==56,
                    "detail":f"chain_id={cid} (expected 56)"
                })
            except Exception as e:
                checks.append({"name":"bnb_chain_id","ok":False,"detail":repr(e)})

            try:
                rows=ctl.agent.tasks.scan()
                checks.append({
                    "name":"live_tasks","ok":len(rows)>0,
                    "detail":f"active_tasks={len(rows)}"
                })
            except Exception as e:
                checks.append({"name":"live_tasks","ok":False,"detail":repr(e)})

            try:
                q=ctl.market.quote("BEM",0.001)
                q.freshness.require(require_verified=True)
                checks.append({
                    "name":"market_quote","ok":bool(q.executable),
                    "detail":(
                        f"route={q.route} effective_price_usd={q.effective_price_usd} "
                        f"slippage={q.slippage_fraction}"
                    )
                })
            except Exception as e:
                checks.append({"name":"market_quote","ok":False,"detail":repr(e)})

        blockers=[x["detail"] for x in checks if not x["ok"]]
        return {
            "ready":not blockers,
            "status":"READY" if not blockers else "SETUP_REQUIRED",
            "checks":checks,
            "blockers":blockers,
            "last_build_error":self._last_build_error,
            "last_build_at":self._last_build_at,
        }

    def dashboard_summary(self)->dict:
        try:
            ctl=self._build()
            data=ctl.dashboard_summary()
            data["bootstrap"]=self.light_status()
            return data
        except Exception:
            d=self.light_status()
            return {
                "mode":"HYBRID_MANUAL_EXECUTION",
                "latest":{
                    "status":"SETUP_REQUIRED",
                    "best_opportunity_now":None,
                    "watchlist":[],
                    "errors":[{"stage":"BOOTSTRAP","error":self._last_build_error}],
                },
                "packages":[],
                "accounting":[],
                "learning":{"probability":{"status":"PREDICTION_UNCERTIFIED"}},
                "learning_rows":[],
                "calibration_curve":[],
                "kpis":{
                    "realized_count":0,"win_rate":0.0,
                    "deployed_capital_usd":0.0,"realized_net_usd":0.0,
                    "realized_net_usd_per_capital_per_day":0.0,
                    "prediction_mae_usd":None,"payback_mae_days":None,
                },
                "bootstrap":d,
                "generated_at":time.time(),
            }

    def get_package(self,package_id:str):
        return self._build().store.get_package(package_id)
    def run_cycle(self): return self._build(force=True).run_cycle()
    def poll_monitoring(self): return self._build().poll_monitoring()
    def recheck(self,package_id): return self._build(force=True).recheck(package_id)
    def record_manual_tx(self,package_id,tx_hash):
        return self._build().record_manual_tx(package_id,tx_hash)
    def record_realized(self,package_id,bem,usd,sale_tx_hash=None):
        return self._build().record_realized(package_id,bem,usd,sale_tx_hash)
