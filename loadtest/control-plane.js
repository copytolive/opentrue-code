import http from "k6/http";
import {check,sleep} from "k6";

const vus=Number(__ENV.VUS||100);
const duration=__ENV.DURATION||"30s";
export const options={
  scenarios:{api:{executor:"constant-vus",vus,duration}},
  thresholds:{
    http_req_failed:["rate<0.01"],
    http_req_duration:["p(95)<500","p(99)<1000"]
  }
};

const base=(__ENV.BASE_URL||"http://127.0.0.1:8787").replace(/\/$/,"");
const tokens=__ENV.TOKENS_FILE?JSON.parse(open(__ENV.TOKENS_FILE)):[{token:__ENV.TOKEN||""}];
if(!Array.isArray(tokens)||!tokens.length)throw Error("At least one load-test token is required");

export default function(){
  const credential=tokens[(__VU-1)%tokens.length]?.token||"";
  const r=http.get(`${base}/v1/me`,{headers:{authorization:`Bearer ${credential}`},tags:{name:"GET /v1/me"}});
  check(r,{"200":x=>x.status===200,"tenant isolated":x=>Boolean(x.json("tenantId"))});
  sleep(1);
}
