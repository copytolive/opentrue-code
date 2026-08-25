import test from "node:test";
import assert from "node:assert/strict";
import {validateTargetReceipt} from "../src/receipts.mjs";

test("target receipt requires observed PASS evidence",()=>{
  assert.equal(validateTargetReceipt({schemaVersion:1,status:"PASS",target:"mac",observedAt:"2026-08-25T00:00:00Z",evidence:[{check:"reboot",ok:true}]}).valid,true);
  assert.equal(validateTargetReceipt({schemaVersion:1,status:"PASS",target:"mac",observedAt:"invalid",evidence:[]}).valid,false);
});

test("target receipt rejects secret-like fields",()=>{
  const secretField=`api${"Key"}`;
  const result=validateTargetReceipt({schemaVersion:1,status:"PASS",target:"gpu",observedAt:"2026-08-25T00:00:00Z",evidence:[{[secretField]:"redacted-fixture"}]});
  assert.equal(result.valid,false);assert.match(result.errors.join(" "),/secret/);
});
