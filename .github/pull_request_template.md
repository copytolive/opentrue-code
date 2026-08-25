## Change summary

Describe what changes and why.

## Risk classification

- [ ] UI/docs only
- [ ] Authentication / authorization / tenant isolation
- [ ] Database / migration
- [ ] Queue / worker / sandbox
- [ ] Deployment / infrastructure
- [ ] Billing / entitlement
- [ ] Secrets / credentials / GitHub permissions

## Required evidence

- [ ] No secret, private workspace, backup, or model weight is included
- [ ] Relevant unit/integration tests pass
- [ ] Security workflow passes
- [ ] Diff reviewed before merge
- [ ] Migration has rollback/restore path when applicable
- [ ] Deployment change has health check and rollback path when applicable
- [ ] Production-impacting action still requires explicit approval

## Runtime truth boundary

Do not mark Mac/VPS/Vast.ai/domain/payment/capacity gates as PASS without a receipt from the real target that executed the operation.
