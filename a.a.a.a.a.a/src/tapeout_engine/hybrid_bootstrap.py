from __future__ import annotations

from pathlib import Path
import json
import os
import re
import subprocess
import time

_ENV_RE=re.compile(r"\$\{([A-Z0-9_]+)(?::-(.*?))?\}")
_BAD_MARKERS=("YOUR_", "0x...", "CHANGE_ME", "REPLACE_ME", "<")
_ADAPTER_ENV=(
    "TAPEOUT_TASK_COLLECTOR",
    "TAPEOUT_CHAIN_COLLECTOR",
    "TAPEOUT_PROTOCOL_HELPER",
)

def _raw_config(path:str|Path)->dict:
    return json.loads(Path(path).read_text())

def required_env(path:str|Path)->list[str]:
    """
    Only variables without a ${VAR:-default} fallback are mandatory.

    Optional failover settings such as ${BNB_RPC_URLS:-} must not make local
    readiness false when the primary BNB_RPC_URL is already healthy.
    """
    raw=Path(path).read_text()
    return sorted(set(
        m.group(1) for m in _ENV_RE.finditer(raw)
        if m.group(2) is None
    ))

def _is_adapter_ready(value:str|None)->tuple[bool,str]:
    if not value:
        return False,"not configured"
    if any(x in value for x in _BAD_MARKERS):
        return False,"contains placeholder marker"
    p=Path(value)
    exists=p.is_file()
    executable=exists and os.access(p,os.X_OK)
    placeholder=False
    if exists:
        try:
            head=p.read_text(errors="ignore")[:4096].lower()
            placeholder="fail-closed placeholder" in head
        except Exception:
            pass
    if placeholder:
        return False,f"{value} is the bundled fail-closed placeholder; replace with audited live adapter"
    return (
        bool(exists and executable),
        f"{value} exists={exists} executable={executable}"
    )

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
        _raw_config(path)
        add("config_json",True,"valid JSON")
    except Exception as e:
        add("config_json",False,repr(e))
        return {
            "ready":False,"status":"SETUP_REQUIRED","checks":checks,
            "blockers":[repr(e)]
        }

    missing=[]
    placeholders=[]
    for name in required_env(path):
        value=os.environ.get(name)
        if value is None or not str(value).strip():
            missing.append(name)
        elif any(x in str(value) for x in _BAD_MARKERS):
            placeholders.append(name)
    add("required_env",not missing,f"missing={missing}" if missing else "present")
    add(
        "no_placeholder_env",not placeholders,
        f"placeholder={placeholders}" if placeholders else "no obvious placeholders"
    )

    root=os.environ.get("HYBRID_ROOT")
    runtime=os.environ.get("HYBRID_RUNTIME")
    add("hybrid_root",bool(root and Path(root).is_dir()),root or "HYBRID_ROOT not set")
    if runtime:
        try:
            Path(runtime).mkdir(parents=True,exist_ok=True)
            probe=Path(runtime)/".write-test"
            probe.write_text("ok")
            probe.unlink()
            add("runtime_writable",True,runtime)
        except Exception as e:
            add("runtime_writable",False,repr(e))
    else:
        add("runtime_writable",False,"HYBRID_RUNTIME not set")

    for env_name in _ADAPTER_ENV:
        value=os.environ.get(env_name)
        ok,detail=_is_adapter_ready(value)
        add(env_name,ok,detail if ok or "bundled fail-closed" in detail else f"{env_name} {detail}")

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

    Dashboard HTTP does not depend on live RPC/adapters being ready. Network and
    protocol components are built lazily. Doctor results are cached separately
    from daemon cycle state so stale failures cannot reappear after a newer
    successful doctor run.
    """
    DOCTOR_TTL_SECONDS=180

    def __init__(self,config_path:str|Path,builder):
        self.config_path=str(config_path)
        self.builder=builder
        self._ctl=None
        self._last_build_error=None
        self._last_build_at=None
        self._last_doctor_report=None
        self._last_doctor_at=None

    def _runtime(self)->Path|None:
        raw=os.environ.get("HYBRID_RUNTIME")
        if not raw:
            return None
        p=Path(raw)
        p.mkdir(parents=True,exist_ok=True)
        return p

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

    def _save_doctor(self,report:dict)->None:
        now=time.time()
        self._last_doctor_report=dict(report)
        self._last_doctor_at=now
        runtime=self._runtime()
        if runtime is None:
            return
        payload={
            "generated_at":now,
            "doctor":report,
        }
        tmp=runtime/"doctor-latest.json.tmp"
        dst=runtime/"doctor-latest.json"
        tmp.write_text(json.dumps(payload,indent=2,sort_keys=True))
        tmp.replace(dst)

    def _load_fresh_doctor(self)->tuple[dict|None,float|None]:
        now=time.time()
        if self._last_doctor_report is not None and self._last_doctor_at is not None:
            age=max(0.0,now-self._last_doctor_at)
            if age<=self.DOCTOR_TTL_SECONDS:
                return dict(self._last_doctor_report),age

        runtime=self._runtime()
        if runtime is None:
            return None,None
        p=runtime/"doctor-latest.json"
        if not p.is_file():
            return None,None
        try:
            d=json.loads(p.read_text())
            generated=float(d.get("generated_at",p.stat().st_mtime))
            age=max(0.0,now-generated)
            report=d.get("doctor")
            if isinstance(report,dict) and age<=self.DOCTOR_TTL_SECONDS:
                return report,age
        except Exception:
            pass
        return None,None

    def light_status(self)->dict:
        """Fast no-network status used by browser polling."""
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
        doctor,doctor_age=self._load_fresh_doctor()
        live_ready=False
        live_status="NOT_CHECKED"
        live_detail=None
        if doctor is not None:
            live_ready=bool(doctor.get("ready",False))
            live_status=str(doctor.get("status","UNKNOWN"))
            live_detail={
                "source":"doctor-latest",
                "age_seconds":doctor_age,
                "doctor":doctor,
            }

        local_names={
            "config_file","config_json","required_env","no_placeholder_env",
            "hybrid_root","runtime_writable","engine_constructs",
        }
        local_checks=[x for x in checks if x["name"] in local_names]
        local_ready=all(x["ok"] for x in local_checks) if local_checks else False

        return {
            "ready":live_ready,
            "local_ready":local_ready,
            "live_ready":live_ready,
            "status":"LIVE_READY" if live_ready else "SETUP_REQUIRED",
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
        by_name={x["name"]:x for x in checks}

        ctl=None
        try:
            ctl=self._build(force=True)
            checks.append({
                "name":"engine_constructs","ok":True,
                "detail":"HybridController constructed"
            })
        except Exception as e:
            checks.append({
                "name":"engine_constructs","ok":False,
                "detail":f"{type(e).__name__}: {e}"
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

            task_adapter_ok=bool(by_name.get("TAPEOUT_TASK_COLLECTOR",{}).get("ok"))
            if task_adapter_ok:
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
        report={
            "ready":not blockers,
            "status":"READY" if not blockers else "SETUP_REQUIRED",
            "checks":checks,
            "blockers":blockers,
            "last_build_error":self._last_build_error,
            "last_build_at":self._last_build_at,
        }
        self._save_doctor(report)
        return report

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

    def _evidence_dir(self)->Path:
        runtime=Path(os.environ.get("HYBRID_RUNTIME",""))
        if not str(runtime):
            root=Path(os.environ.get("HYBRID_ROOT",""))
            runtime=root/".runtime"
        outdir=runtime/"live-evidence"
        outdir.mkdir(parents=True,exist_ok=True)
        return outdir

    def _ensure_evidence_files(self,status:str="NOT_COLLECTED",error:str|None=None)->Path:
        outdir=self._evidence_dir()
        ep=outdir/"evidence.json"
        cp=outdir/"frontend-clues.json"
        pp=outdir/"protocol-candidates.json"
        if not ep.is_file():
            payload={
                "collector_version":"7.9",
                "status":status,
                "generated_at":time.time(),
            }
            if error:
                payload["error"]=error
            ep.write_text(json.dumps(payload,indent=2))
        if not cp.is_file():
            cp.write_text("[]\n")
        if not pp.is_file():
            pp.write_text("[]\n")
        return outdir

    def collect_public_evidence(self)->dict:
        """
        Execute the read-only public evidence collector.

        Files are guaranteed to exist after this call, including timeout/error
        cases, so browser download endpoints never degrade into a 404.
        """
        root=Path(os.environ.get("HYBRID_ROOT",""))
        script=root/"macos/collect_live_evidence.sh"
        if not root.is_dir() or not script.is_file():
            outdir=self._ensure_evidence_files(
                "COLLECTOR_UNAVAILABLE",
                "Hybrid root/evidence collector unavailable",
            )
            return {
                "ok":False,"partial":True,"returncode":None,
                "stdout":"","stderr":"collector unavailable",
                "files_ready":True,"output_dir":str(outdir),
            }
        stdout=""
        stderr=""
        rc=None
        timed_out=False
        try:
            p=subprocess.run(
                [str(script)],cwd=str(root),capture_output=True,text=True,timeout=120
            )
            stdout=p.stdout or ""
            stderr=p.stderr or ""
            rc=p.returncode
        except subprocess.TimeoutExpired as e:
            timed_out=True
            stdout=(e.stdout.decode(errors="replace") if isinstance(e.stdout,bytes) else (e.stdout or ""))
            stderr=(e.stderr.decode(errors="replace") if isinstance(e.stderr,bytes) else (e.stderr or ""))
            stderr=(stderr+"\ncollector reached 120s dashboard limit; partial evidence preserved").strip()
        except Exception as e:
            stderr=repr(e)

        outdir=self._ensure_evidence_files(
            "PARTIAL_TIMEOUT" if timed_out else ("PARTIAL_ERROR" if rc not in (0,None) else "PARTIAL"),
            stderr[-4000:] if stderr else None,
        )
        files={}
        for name in ("evidence.json","frontend-clues.json","protocol-candidates.json"):
            fp=outdir/name
            try:
                files[name]=json.loads(fp.read_text())
            except Exception:
                files[name]={"path":str(fp),"parse_error":True}
        return {
            "ok":(rc==0 and not timed_out),
            "partial":(rc!=0 or timed_out),
            "timed_out":timed_out,
            "returncode":rc,
            "stdout":stdout[-6000:],
            "stderr":stderr[-6000:],
            "files_ready":all((outdir/n).is_file() for n in ("evidence.json","frontend-clues.json","protocol-candidates.json")),
            "files":files,
            "output_dir":str(outdir),
        }

    def evidence_file(self,name:str)->bytes:
        if name not in {"evidence.json","frontend-clues.json","protocol-candidates.json"}:
            raise ValueError("unsupported evidence file")
        outdir=self._ensure_evidence_files()
        return (outdir/name).read_bytes()

    def get_package(self,package_id:str):
        return self._build().store.get_package(package_id)

    def run_cycle(self):
        return self._build(force=True).run_cycle()

    def poll_monitoring(self):
        return self._build().poll_monitoring()

    def recheck(self,package_id):
        return self._build(force=True).recheck(package_id)

    def record_manual_tx(self,package_id,tx_hash):
        return self._build().record_manual_tx(package_id,tx_hash)

    def record_realized(self,package_id,bem,usd,sale_tx_hash=None):
        return self._build().record_realized(package_id,bem,usd,sale_tx_hash)
