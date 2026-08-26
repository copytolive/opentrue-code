from __future__ import annotations
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import json

HTML=r"""<!doctype html>
<html><head><meta charset="utf-8"><title>TapeOut Hybrid Control</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:0;background:#0b1020;color:#e9eefb}
main{max-width:1250px;margin:auto;padding:24px}.card{background:#151d33;border:1px solid #2b385a;border-radius:14px;padding:18px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.good{color:#67e8a4}.bad{color:#ff8c8c}.muted{color:#9ba9c9}
table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #2b385a;text-align:left}
button{padding:9px 13px;border:0;border-radius:9px;cursor:pointer}input{padding:9px;border-radius:8px;border:1px solid #445273;background:#0e1629;color:white}
</style></head><body><main>
<h1>TapeOut Hybrid Control</h1><p class="muted">Machine searches and verifies. Wallet execution stays manual.</p><div id="app">Loading…</div>
<script>
async function api(path,method="GET",body=null){const r=await fetch(path,{method,headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):null});const j=await r.json();if(!r.ok)throw new Error(j.error||JSON.stringify(j));return j}
function money(x){return "$"+Number(x||0).toFixed(2)}function pct(x){return (100*Number(x||0)).toFixed(1)+"%"}
function esc(x){return String(x??"").replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[s]))}
async function refresh(){
 const d=await api("/api/summary"),l=d.latest||{},b=l.best_opportunity_now||{},k=d.kpis||{};
 const boot=d.bootstrap||{};
 const moneyReady=(boot.live_ready===true && b.action==="MANUAL TAPEOUT");
 const moneyState=moneyReady?"MANUAL OPPORTUNITY READY":(boot.live_ready===true?"WAIT FOR QUALIFIED OPPORTUNITY":"LIVE DATA NOT READY");
 let html=`<div class="grid"><div class="card"><b>STATUS</b><h2>${esc(l.status||"SEARCHING")}</h2></div>
 <div class="card"><b>MONEY READINESS</b><h2 class="${moneyReady?"good":"bad"}">${esc(moneyState)}</h2></div>
 <div class="card"><b>REALIZED NET</b><h2>${money(k.realized_net_usd)}</h2></div>
 <div class="card"><b>CAPITAL DEPLOYED</b><h2>${money(k.deployed_capital_usd)}</h2></div>
 <div class="card"><b>NET / CAPITAL / DAY</b><h2>${pct(k.realized_net_usd_per_capital_per_day)}</h2></div>
 <div class="card"><b>WIN RATE</b><h2>${pct(k.win_rate)}</h2></div>
 <div class="card"><b>PREDICTION MAE</b><h2>${k.prediction_mae_usd==null?"—":money(k.prediction_mae_usd)}</h2></div></div>`;
 if(boot.status==="SETUP_REQUIRED"){
   html+=`<div class="card"><h2 class="bad">SETUP_REQUIRED</h2>
   <p>Dashboard hidup, tetapi engine live belum siap. Ini lebih baik daripada service mati.</p>
   <button onclick="doctor()">RUN DOCTOR</button>
   <pre>${esc((boot.blockers||[]).join("\n"))}</pre></div>`;
 }else if(boot.status){
   html+=`<div class="card"><h2 class="good">${esc(boot.status)}</h2>
   <p>Local app/bootstrap passed. Live readiness: <b>${esc(boot.live_status||"NOT_CHECKED")}</b>.</p>
   <button onclick="doctor()">RUN LIVE DOCTOR</button></div>`;
 }
 html+=`<div class="card"><h2>BEST OPPORTUNITY NOW</h2>`;
 if(b.task_id){html+=`<div class="grid"><div>Task<br><b>#${esc(b.task_id)} ${esc(b.task_name)}</b></div><div>Processor<br><b>${esc(b.processor)}</b></div>
 <div>C ours / incumbent<br><b>${esc(b.design_cost_c)} / ${esc(b.incumbent_c)}</b></div><div>Capital required<br><b>${money(b.capital_required_usd)}</b></div>
 <div>Expected net<br><b>${money(b.expected_net_usd)}</b></div><div>Stress net<br><b>${money(b.stress_net_usd)}</b></div>
 <div>Raw P(profit)<br><b>${pct(b.probability_positive)}</b></div><div>Calibration<br><b>${esc(b.calibration_status)}</b></div>
 <div>Expires in<br><b>${b.expires_at?Math.max(0,Math.round(b.expires_at-Date.now()/1000))+"s":"—"}</b></div>
 <div>ACTION<br><b class="${b.action==="MANUAL TAPEOUT"?"good":"bad"}">${esc(b.action||"WAIT")}</b></div></div>`}else html+=`<p>No qualified opportunity.</p>`;html+=`</div>`;
 html+=`<div class="card"><h2>TOP 10 WATCHLIST</h2><table><tr><th>#</th><th>Task</th><th>Processor</th><th>C</th><th>Capital</th><th>Net</th><th>Stress</th><th>P+</th><th>L</th></tr>`;
 for(const x of (l.watchlist||[])){html+=`<tr><td>${x.rank}</td><td>#${esc(x.task_id)} ${esc(x.task_name)}</td><td>${esc(x.processor)}</td><td>${esc(x.design_cost_c)} / ${esc(x.incumbent_c)}</td><td>${money(x.capital_required_usd)}</td><td>${money(x.expected_net_usd)}</td><td>${money(x.stress_net_usd)}</td><td>${pct(x.probability_positive)}</td><td>L${x.maturity_level}</td></tr>`}html+=`</table></div>`;
 html+=`<div class="card"><h2>MANUAL PACKAGES</h2>`;
 for(const p of (d.packages||[]).slice(0,12)){const e=p.economics||{};html+=`<div class="card"><b>${esc(p.package_id)}</b> — ${esc(p.status)}<br>Task #${esc(p.task_id)} / ${esc(p.processor)} — expected ${money(e.expected_net_usd)} — stress ${money(e.stress_net_usd)}
 <div style="margin-top:10px"><button onclick="recheck('${esc(p.package_id)}')">RECHECK NOW</button> <input id="tx-${esc(p.package_id)}" placeholder="0x tx hash"> <button onclick="recordTx('${esc(p.package_id)}')">RECORD TX</button></div>
 <div style="margin-top:10px"><input id="bem-${esc(p.package_id)}" placeholder="realized BEM"> <input id="usd-${esc(p.package_id)}" placeholder="realized USD"> <input id="sale-${esc(p.package_id)}" placeholder="sale tx hash (optional)"> <button onclick="realize('${esc(p.package_id)}')">RECORD REALIZED</button></div></div>`}html+=`</div>`;
 const pc=(d.learning||{}).probability||{};
 html+=`<div class="card"><h2>LEARNING / L6</h2><div class="grid"><div>Status<br><b>${esc(pc.status||"PREDICTION_UNCERTIFIED")}</b></div><div>Qualified samples<br><b>${esc(pc.qualified_samples||0)}</b></div><div>Observed win rate<br><b>${pct(pc.observed_profit_rate)}</b></div><div>95% lower bound<br><b>${pct(pc.wilson_lower_bound)}</b></div><div>Recent lower bound<br><b>${pct(pc.recent_wilson_lower_bound)}</b></div><div>Brier<br><b>${Number(pc.brier_score||0).toFixed(4)}</b></div><div>ECE<br><b>${Number(pc.expected_calibration_error||0).toFixed(4)}</b></div></div></div>`;
 html+=`<div class="card"><h2>PREDICTED VS REALIZED</h2><table><tr><th>Package</th><th>Task</th><th>Processor</th><th>Predicted net</th><th>Realized net</th><th>Error</th></tr>`;
 for(const x of (d.learning_rows||[]).slice(0,30)){html+=`<tr><td>${esc(x.package_id)}</td><td>#${esc(x.task_id)}</td><td>${esc(x.processor)}</td><td>${money(x.predicted_net_usd)}</td><td>${money(x.realized_net_usd)}</td><td>${money(x.prediction_error_usd)}</td></tr>`}html+=`</table></div>`;
 html+=`<div class="card"><h2>CALIBRATION CURVE</h2><table><tr><th>Bucket</th><th>Samples</th><th>Mean predicted</th><th>Observed profit rate</th></tr>`;
 for(const x of (d.calibration_curve||[])){html+=`<tr><td>${pct(x.lower)}–${pct(x.upper)}</td><td>${x.samples}</td><td>${x.mean_predicted==null?"—":pct(x.mean_predicted)}</td><td>${x.observed_profit_rate==null?"—":pct(x.observed_profit_rate)}</td></tr>`}html+=`</table></div>`;
 document.getElementById("app").innerHTML=html;
}
async function doctor(){try{alert(JSON.stringify(await api("/api/doctor"),null,2));await refresh()}catch(e){alert(e)}}
async function recheck(id){try{alert(JSON.stringify(await api("/api/recheck/"+id,"POST"),null,2));await refresh()}catch(e){alert(e)}}
async function recordTx(id){try{const v=document.getElementById("tx-"+id).value;alert(JSON.stringify(await api("/api/record-tx/"+id,"POST",{tx_hash:v}),null,2));await refresh()}catch(e){alert(e)}}
async function realize(id){try{const bem=Number(document.getElementById("bem-"+id).value),usd=Number(document.getElementById("usd-"+id).value),sale=document.getElementById("sale-"+id).value||null;alert(JSON.stringify(await api("/api/record-realized/"+id,"POST",{realized_bem:bem,realized_usd:usd,sale_tx_hash:sale}),null,2));await refresh()}catch(e){alert(e)}}
refresh();setInterval(refresh,15000);
</script></main></body></html>"""

def serve(controller,host:str="127.0.0.1",port:int=8787):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,fmt,*args): return
        def _json(self,status,obj):
            raw=json.dumps(obj,indent=2,sort_keys=True).encode();self.send_response(status)
            self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(raw)));self.end_headers();self.wfile.write(raw)
        def _body(self):
            n=int(self.headers.get("Content-Length","0") or 0)
            return json.loads(self.rfile.read(n)) if n else {}
        def do_GET(self):
            path=urlparse(self.path).path
            if path=="/":
                raw=HTML.encode();self.send_response(200);self.send_header("Content-Type","text/html; charset=utf-8");self.send_header("Content-Length",str(len(raw)));self.end_headers();self.wfile.write(raw);return
            if path=="/api/summary": self._json(200,controller.dashboard_summary());return
            if path=="/api/doctor":
                try:
                    result=controller.doctor() if hasattr(controller,"doctor") else {"ready":True,"status":"READY"}
                    self._json(200,result)
                except Exception as e:
                    self._json(500,{"ready":False,"status":"SETUP_REQUIRED","error":repr(e)})
                return
            if path.startswith("/api/package/"):
                try:
                    if hasattr(controller,"get_package"):
                        data=controller.get_package(path.rsplit("/",1)[-1])
                    else:
                        data=controller.store.get_package(path.rsplit("/",1)[-1])
                    self._json(200,data)
                except Exception as e:self._json(404,{"error":repr(e)})
                return
            self._json(404,{"error":"not found"})
        def do_POST(self):
            path=urlparse(self.path).path
            try:
                if path=="/api/run-cycle": self._json(200,controller.run_cycle());return
                if path=="/api/poll-monitoring": self._json(200,controller.poll_monitoring());return
                if path.startswith("/api/recheck/"): self._json(200,controller.recheck(path.rsplit("/",1)[-1]));return
                if path.startswith("/api/record-tx/"):
                    b=self._body();self._json(200,controller.record_manual_tx(path.rsplit("/",1)[-1],b["tx_hash"]).to_dict());return
                if path.startswith("/api/record-realized/"):
                    b=self._body();self._json(200,controller.record_realized(path.rsplit("/",1)[-1],float(b["realized_bem"]),float(b["realized_usd"]),b.get("sale_tx_hash")));return
                self._json(404,{"error":"not found"})
            except Exception as e:self._json(400,{"error":repr(e)})
    server=ThreadingHTTPServer((host,int(port)),Handler);print(f"Hybrid dashboard: http://{host}:{port}");server.serve_forever()
