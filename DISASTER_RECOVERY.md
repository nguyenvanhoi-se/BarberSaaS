# Disaster recovery

This document records repository capabilities separately from account-level configuration. Production D1 and R2 resources have not been verified from this workspace.

| Area | Status | Notes |
| --- | --- | --- |
| D1 Time Travel | AVAILABLE | Cloudflare provides point-in-time recovery for supported production D1 databases; verify account plan, database version and actual retention. |
| D1 backup/export automation | NOT CONFIGURED | No scheduled export or independent backup pipeline is present in this repository. |
| R2 recovery/versioning | NOT CONFIGURED | No bucket versioning/replication/export process is configured here. |
| Worker rollback | AVAILABLE after a deployment | Cloudflare dashboard deployment/version controls can restore a prior Worker version; production deployment is not yet configured from this workspace. |
| DNS/custom hostname recovery | NOT CONFIGURED | Account/zone routing and Custom Hostnames are not verified. |

## D1 recovery

1. Declare an incident owner and pause risky writes/deployments.
2. Confirm the correct production account/database and obtain the current D1 version/bookmark with Wrangler.
3. Check available Time Travel points and choose the recovery point with the data owner.
4. Rehearse on an isolated database if possible. `wrangler d1 time-travel restore` overwrites database state; it is not a routine rollback.
5. Record the current bookmark before restoring. Restore, verify schema/migrations and tenant data boundaries, then verify application behavior before reopening writes.
6. Record the incident and establish an independent export process if recovery objectives require one.

Cloudflare references: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) and [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## R2 recovery

Do not claim media is backed up until bucket-level recovery is enabled and tested. D1 rows reference R2 keys, so recovery must reconcile metadata and objects together. Preserve the bucket and its access policy during an incident; do not make it public. If account-level versioning, replication, or exports are configured later, document the tested restore path and retention here.

## Worker and domain recovery

For application regressions, use the Cloudflare dashboard to restore a known-good Worker deployment and verify `/api/health` and `/api/health/ready`. A code rollback does not undo D1 changes. Review backward compatibility before restoring an older Worker after migrations. For hostname incidents, keep the platform hostname available, preserve domain verification records, and do not claim a domain is active until Cloudflare reports both ownership and SSL as active.
