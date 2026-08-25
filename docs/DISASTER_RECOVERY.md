# Disaster recovery runbook

Repository CI proves that PostgreSQL can be dumped and restored. Production DR is accepted only after the same procedure is executed against staging/production-like infrastructure and measured.

## Recovery assets

Keep these outside the public repository:

- PostgreSQL backups and encryption keys;
- production `.env`/secret-manager values;
- DNS/domain provider credentials;
- deployment SSH/host credentials;
- tenant-scoped worker tokens;
- any private application repository credentials.

The public repository should be sufficient to recreate stateless application containers, but not production secrets/data.

## Backup policy baseline

- automated PostgreSQL backup at least daily during beta; increase frequency to match measured RPO needs;
- retain multiple restore points and protect backups from the same credentials used by the application;
- verify backup freshness and size automatically;
- test restore on a clean database regularly;
- treat Redis as recoverable queue/coordination state: use AOF/persistence for short outages, but design jobs so PostgreSQL/audit state remains the durable source for business history.

## Restore drill

1. Provision a clean PostgreSQL target.
2. Run `scripts/backup-restore-drill.sh` with source and restore URLs.
3. Verify migrations/schema plus critical table counts/data probes.
4. Start a replacement Redis/control-plane from repository code.
5. Reconnect one synthetic worker and execute an acceptance job.
6. Verify browser workspace/billing/audit reads on the restored DB.
7. Record start time, recovery-complete time and newest durable record recovered.

`RTO = recovery-complete - incident/drill start`.
`RPO = newest expected durable record - newest recovered durable record`.

Only measured values may be placed in production status documents.

## Server-loss simulation

A complete DR exercise removes the original application host from the path. Recreate edge/control-plane on a replacement host, restore database/configuration from approved sources, reconnect workers, run health and an approved job, then switch traffic. Do not call a same-host container restart a disaster-recovery drill.

## Deployment rollback

`deploy-approved.sh` captures the previous Git revision, deploys the requested revision, repeatedly probes `HEALTH_URL`, and returns to the previous revision if health does not recover within the gate. Production validation must deliberately deploy a safe failing test revision in staging and retain both deployment and rollback receipts.

## Failure ownership

Database restore failure, lost tenant data, unapproved production change, cross-tenant recovery exposure or inability to revoke a compromised worker is a launch blocker.
