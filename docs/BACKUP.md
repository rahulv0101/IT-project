# EduQuest backups

## Native PostgreSQL

Against real PostgreSQL, use the native custom-format dump and restore commands:

```powershell
npm run backup:pg -- backups/eduquest.dump
npm run restore:pg -- backups/eduquest.dump
```

`backup:pg` reads `DATABASE_URL` and invokes `pg_dump`. `restore:pg` invokes
`pg_restore --clean --if-exists`; it is destructive to the target database and
must only be run against an intentionally selected EduQuest database. These
commands require PostgreSQL client binaries (`pg_dump` and `pg_restore`) on PATH.

## JSON fallback

PGlite/local environments without those binaries can use:

```powershell
npm run db:backup -- backups/eduquest.json
npm run db:restore -- backups/eduquest.json
npm run test:backup
```

This fallback is an application-level round trip and is not equivalent to a
native PostgreSQL backup for NFR13.

The JSON snapshot includes database rows, not the binary files under `uploads/`
or the secrets in `.env`; back those up separately. Restore only a trusted
backup into a database with the same tables and columns. The command validates
metadata before truncation and rolls back the entire restore on failure.
It temporarily disables user triggers to avoid recreating quiz/game side effects,
then restores their original states. Foreign keys and normal check/unique
constraints remain enabled. The executing database role must own the tables.

`npm run test:backup` now seeds its test database and verifies every row in all
44 tables, including JSON lab definitions. It also checks reordered backup
columns, rollback on an invalid foreign key, and seed idempotence. The check never
resets the development database.
