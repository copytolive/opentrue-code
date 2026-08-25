#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
: "${AUTH_SIGNING_SECRET:?AUTH_SIGNING_SECRET is required}"
: "${BILLING_WEBHOOK_SECRET:?BILLING_WEBHOOK_SECRET is required}"
TENANT_ID="${TENANT_ID:-11111111-1111-4111-8111-111111111111}"
OWNER_ID="${OWNER_ID:-22222222-2222-4222-8222-222222222222}"
WORKER_ID="${WORKER_ID:-33333333-3333-4333-8333-333333333333}"
DEPLOY_WORKER_ID="${DEPLOY_WORKER_ID:-44444444-4444-4444-8444-444444444444}"

json_field(){ node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const v=JSON.parse(s);const p=process.argv[1].split(".");let x=v;for(const k of p)x=x?.[k];if(x===undefined||x===null)process.exit(2);process.stdout.write(typeof x==="object"?JSON.stringify(x):String(x));});' "$1"; }
assert_json(){ node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const v=JSON.parse(s);const [path,expected]=process.argv.slice(1);let x=v;for(const k of path.split("."))x=x?.[k];if(String(x)!==expected){console.error(`assertion failed ${path}: ${x} != ${expected}`);process.exit(1)}});' "$1" "$2"; }

for i in $(seq 1 30); do
  if curl -fsS "$BASE_URL/health" >/tmp/opentrue-health.json 2>/dev/null; then break; fi
  sleep 1
  [ "$i" -lt 30 ] || { echo "control-plane did not become healthy" >&2; exit 1; }
done
cat /tmp/opentrue-health.json | assert_json status ok

OWNER_JSON="$(TENANT_ID="$TENANT_ID" USER_ID="$OWNER_ID" ROLE=owner PLAN=free TTL_SECONDS=3600 AUTH_SIGNING_SECRET="$AUTH_SIGNING_SECRET" node scripts/mint-token.mjs)"
OWNER_TOKEN="$(printf '%s' "$OWNER_JSON" | json_field token)"
WORKER_JSON="$(TENANT_ID="$TENANT_ID" USER_ID="$WORKER_ID" ROLE=worker WORKER_TARGET=sandbox TTL_SECONDS=3600 AUTH_SIGNING_SECRET="$AUTH_SIGNING_SECRET" node scripts/mint-token.mjs)"
WORKER_TOKEN="$(printf '%s' "$WORKER_JSON" | json_field token)"
DEPLOY_WORKER_JSON="$(TENANT_ID="$TENANT_ID" USER_ID="$DEPLOY_WORKER_ID" ROLE=worker WORKER_TARGET=deploy-production TTL_SECONDS=3600 AUTH_SIGNING_SECRET="$AUTH_SIGNING_SECRET" node scripts/mint-token.mjs)"
DEPLOY_WORKER_TOKEN="$(printf '%s' "$DEPLOY_WORKER_JSON" | json_field token)"

ME="$(curl -fsS -H "authorization: Bearer $OWNER_TOKEN" "$BASE_URL/v1/me")"
printf '%s' "$ME" | assert_json role owner
printf '%s' "$ME" | assert_json plan free

WS="$(curl -fsS -X PUT -H "authorization: Bearer $OWNER_TOKEN" -H 'content-type: application/json' \
  --data '{"state":{"files":{"README.md":"# smoke"}},"expectedVersion":0}' "$BASE_URL/v1/workspace/smoke")"
printf '%s' "$WS" | assert_json version 1
WS_GET="$(curl -fsS -H "authorization: Bearer $OWNER_TOKEN" "$BASE_URL/v1/workspace/smoke")"
printf '%s' "$WS_GET" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const v=JSON.parse(s);if(v.state?.files?.["README.md"]!=="# smoke"){console.error("workspace filename assertion failed");process.exit(1)}})'

JOB="$(curl -fsS -X POST -H "authorization: Bearer $OWNER_TOKEN" -H 'content-type: application/json' \
  --data '{"target":"sandbox","task":"test","args":["."],"requiresApproval":false,"maxAttempts":2,"timeoutMs":30000}' "$BASE_URL/v1/jobs")"
JOB_ID="$(printf '%s' "$JOB" | json_field id)"
printf '%s' "$JOB" | assert_json status QUEUED

CLAIM="$(curl -fsS -X POST -H "authorization: Bearer $WORKER_TOKEN" -H 'content-type: application/json' \
  --data '{"target":"sandbox","workerId":"smoke-worker","leaseMs":30000}' "$BASE_URL/v1/workers/claim")"
printf '%s' "$CLAIM" | assert_json id "$JOB_ID"
printf '%s' "$CLAIM" | assert_json status RUNNING

HEARTBEAT="$(curl -fsS -X POST -H "authorization: Bearer $WORKER_TOKEN" -H 'content-type: application/json' \
  --data '{"workerId":"smoke-worker","leaseMs":30000}' "$BASE_URL/v1/workers/jobs/$JOB_ID/heartbeat")"
printf '%s' "$HEARTBEAT" | assert_json ok true

DONE="$(curl -fsS -X POST -H "authorization: Bearer $WORKER_TOKEN" -H 'content-type: application/json' \
  --data '{"exitCode":0,"timedOut":false,"durationMs":12,"outputHash":"smoke-sha256","output":[{"stream":"stdout","text":"SMOKE_PASS"}]}' "$BASE_URL/v1/workers/jobs/$JOB_ID/complete")"
printf '%s' "$DONE" | assert_json status SUCCEEDED
printf '%s' "$DONE" | assert_json receipt.outputHash smoke-sha256

# Deployment targets are always approval-gated, even when a client requests requiresApproval=false.
DEPLOY_JOB="$(curl -fsS -X POST -H "authorization: Bearer $OWNER_TOKEN" -H 'content-type: application/json' \
  --data '{"target":"deploy-production","task":"deploy","args":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"requiresApproval":false,"maxAttempts":1,"timeoutMs":30000}' "$BASE_URL/v1/jobs")"
DEPLOY_JOB_ID="$(printf '%s' "$DEPLOY_JOB" | json_field id)"
printf '%s' "$DEPLOY_JOB" | assert_json status WAITING_APPROVAL

# A sandbox credential cannot claim a production deployment queue.
WRONG_TARGET_STATUS="$(curl -sS -o /tmp/opentrue-wrong-target.json -w '%{http_code}' -X POST -H "authorization: Bearer $WORKER_TOKEN" -H 'content-type: application/json' \
  --data '{"target":"deploy-production","workerId":"smoke-worker","leaseMs":30000}' "$BASE_URL/v1/workers/claim")"
[ "$WRONG_TARGET_STATUS" = "403" ] || { cat /tmp/opentrue-wrong-target.json >&2; echo "expected worker target mismatch 403, got $WRONG_TARGET_STATUS" >&2; exit 1; }

APPROVED="$(curl -fsS -X POST -H "authorization: Bearer $OWNER_TOKEN" "$BASE_URL/v1/jobs/$DEPLOY_JOB_ID/approve")"
printf '%s' "$APPROVED" | assert_json status QUEUED
DEPLOY_CLAIM="$(curl -fsS -X POST -H "authorization: Bearer $DEPLOY_WORKER_TOKEN" -H 'content-type: application/json' \
  --data '{"target":"deploy-production","workerId":"deploy-smoke-worker","leaseMs":30000}' "$BASE_URL/v1/workers/claim")"
printf '%s' "$DEPLOY_CLAIM" | assert_json id "$DEPLOY_JOB_ID"
printf '%s' "$DEPLOY_CLAIM" | assert_json status RUNNING
DEPLOY_DONE="$(curl -fsS -X POST -H "authorization: Bearer $DEPLOY_WORKER_TOKEN" -H 'content-type: application/json' \
  --data '{"exitCode":0,"timedOut":false,"durationMs":20,"outputHash":"deploy-smoke-sha256","output":[],"metadata":{"environment":"production","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","previous":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","health":"https://example.test/health","rolledBack":false}}' "$BASE_URL/v1/workers/jobs/$DEPLOY_JOB_ID/complete")"
printf '%s' "$DEPLOY_DONE" | assert_json status SUCCEEDED
printf '%s' "$DEPLOY_DONE" | assert_json receipt.metadata.environment production
printf '%s' "$DEPLOY_DONE" | assert_json receipt.metadata.rolledBack false

EVENT_ID="smoke-$(date +%s)-$$"
PAYLOAD="{\"provider\":\"smoke\",\"eventId\":\"$EVENT_ID\",\"tenantId\":\"$TENANT_ID\",\"plan\":\"pro\",\"status\":\"active\"}"
SIGNATURE="$(PAYLOAD="$PAYLOAD" BILLING_WEBHOOK_SECRET="$BILLING_WEBHOOK_SECRET" node -e 'const {createHmac}=require("crypto");process.stdout.write(createHmac("sha256",process.env.BILLING_WEBHOOK_SECRET).update(process.env.PAYLOAD).digest("hex"))')"
BILLING1="$(curl -fsS -X POST -H 'content-type: application/json' -H "x-opentrue-signature: sha256=$SIGNATURE" --data "$PAYLOAD" "$BASE_URL/v1/billing/webhook")"
BILLING2="$(curl -fsS -X POST -H 'content-type: application/json' -H "x-opentrue-signature: sha256=$SIGNATURE" --data "$PAYLOAD" "$BASE_URL/v1/billing/webhook")"
printf '%s' "$BILLING1" | assert_json duplicate false
printf '%s' "$BILLING2" | assert_json duplicate true

ME_PRO="$(curl -fsS -H "authorization: Bearer $OWNER_TOKEN" "$BASE_URL/v1/me")"
printf '%s' "$ME_PRO" | assert_json plan pro
AUDIT="$(curl -fsS -H "authorization: Bearer $OWNER_TOKEN" "$BASE_URL/v1/audit")"
AUDIT_COUNT="$(printf '%s' "$AUDIT" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(String(JSON.parse(s).items.length)))')"
[ "$AUDIT_COUNT" -ge 8 ] || { echo "expected audit events, got $AUDIT_COUNT" >&2; exit 1; }

echo "CONTROL_PLANE_HTTP_SMOKE_PASS job=$JOB_ID deploy=$DEPLOY_JOB_ID audit=$AUDIT_COUNT"
