# GPU worker runbook

OpenTrue Code can use a Vast.ai instance or another Linux GPU host without exposing Ollama directly to the public Internet.

## Worker contract

The GPU host runs Ollama plus `workers/vast-worker.mjs`. The worker authenticates to the control-plane with a tenant-scoped token whose `workerTarget` is `vast`, claims only that tenant's queue, heartbeats the lease, and returns a hashed receipt.

## Model selection and fallback

Set a comma-separated model order. The worker tries the primary model first and falls back when an attempt errors or times out.

```bash
export OLLAMA_MODELS='qwen3-coder:30b,qwen2.5-coder:14b'
export MODEL_ATTEMPT_TIMEOUT_MS=60000
```

Pull every configured model before registering the worker. Never route public traffic directly to port 11434.

## Benchmark

Run on the actual GPU host:

```bash
OLLAMA_MODELS="$OLLAMA_MODELS" \
BENCHMARK_OUTPUT="$HOME/opentrue-model-benchmark.json" \
node scripts/model-benchmark.mjs
```

Record at minimum: GPU type, VRAM, model, wall time, load time, prompt tokens/s, output tokens/s, task-success result, and GPU-hours consumed during the test. Do not compare GPUs only by tokens/s; code-edit success and queue latency matter.

## Failure drill

1. Start two workers for the same tenant/target.
2. Submit an inference job with multiple attempts enabled.
3. Kill worker A after it claims the job.
4. Wait for its Redis lease to expire.
5. Verify the job returns to the tenant queue and worker B claims it.
6. Require a terminal receipt and confirm no cross-tenant claim occurred.

The gate is `PASS` only with evidence from the real workers and control-plane, not because the failover code exists.

## Cost evidence

For each benchmark window record instance hourly price, active GPU seconds, successful tasks, failed tasks, average output tokens/s and cost per successful task/user-hour. Subscription pricing can be user-facing, but the operator must still enforce compute/fair-use limits internally.
