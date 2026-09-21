# Self-hosted operations

The supported installation is the repository-root `docker-compose.yml`, or
`docker-compose.prod.yml` for prebuilt images. See [self-hosting](../docs/self-hosting.md)
and [updating](../docs/updating.md). The former hosted stack, wildcard routing,
SaaS development compose and hosted deployment script have been removed.

Keep the existing database, storage directory and secrets when updating an
installation. Retiring the hosted software is not a database migration or an
instruction to delete any volumes.

## Scheduled jobs

`cron-call.sh` calls the token-protected scheduler endpoints. Configure
`CRON_SECRET` privately (an unquoted value), set `ENV_FILE` to that private file,
and set `PHAROS_URL` to your own instance origin. Pass `alerts` or `prices` to the script. The price and alert routes
are `/api/cron/prices` and `/api/cron/alerts`.

## Existing backup installations

`backup.sh` and `restore.sh` remain for installations already using them. Supply
`ENV_FILE`, `MONGO_CONTAINER` and `STORAGE_DIR` for your actual instance; their
legacy defaults must not be assumed to match a new installation. Back up both
MongoDB and the stored files, and verify a restore into a separate instance before
relying on a backup. See [backup and restore](../docs/backup-and-restore.md).

All environment files, archives and live storage remain private and gitignored.
