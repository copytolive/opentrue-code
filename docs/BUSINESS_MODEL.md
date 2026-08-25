# Subscription business model

## Promise

Customers buy access by day or month. Paid plans have no token balance, per-token charge, or daily conversation/job quota. The product promise is **unlimited conversations and tasks under managed compute**, not an unlimited dedicated GPU. Concurrency, runtime, queue priority, safety and abuse controls remain enforceable.

## Why managed compute is mandatory

GPU rental is metered by time. A literal unlimited plan without concurrency, queueing, abuse controls or fair-use compute can lose money when one customer runs continuous agents. OpenTrue Code therefore uses:

- no visible token meter;
- plan-based priority and concurrent-agent limits;
- dynamic routing between fast and deep models;
- context caching and repository indexing;
- idle suspension and scale-to-zero workers;
- interruptible GPUs for retryable batch jobs;
- on-demand/reserved GPUs for interactive work;
- transparent fair-use policy based on agent time, not tokens.

## Suggested launch plans

| Plan | Price | Positioning | Concurrent agents | Priority |
|---|---:|---|---:|---|
| Day Pass | US$2.49/day | Trial and occasional use | 1 | Standard |
| Builder | US$19/month | Individual light use | 1 | Standard |
| Pro | US$39/month | Daily professional work | 2 | High |
| Business | US$99/month | Small team pooled access | 4 | High |
| Dedicated | From US$1,099/month | Reserved GPU/workspace | Custom | Reserved |

Prices are launch hypotheses, not guarantees. The editable financial model is the source of truth for margin testing.

## Cost controls

1. Route autocomplete and small edits to the smallest adequate model.
2. Reserve deep reasoning models for complex tasks.
3. Batch embeddings and indexing separately from interactive inference.
4. Never keep an empty GPU online without a warm-pool requirement.
5. Record GPU-seconds, queue time, task success, retry count and user-level cost internally.
6. Alert when rolling contribution margin falls below target.

## Sector strategy

One shared agent platform supports sector-specific tool packs and rules. Healthcare, legal, finance and live trading require additional review and cannot run unrestricted autonomous actions.
