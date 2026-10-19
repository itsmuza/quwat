# Quwat database environments

Completed 2026-10-17 under the user's explicit full-copy deployment-preparation request.

## Current state

| Environment | Database | Application database user | Role |
| --- | --- | --- | --- |
| Development | `Quwat` | `quwat_dev_app` | `readWrite` only on `Quwat` |
| Production | `quwat_prod` | `quwat_prod_app` | `readWrite` only on `quwat_prod` |

Both databases share the existing Atlas `Cluster0` and its resources. Both application users are restricted to that cluster. The existing operator/admin credential remains available for operator tasks and is no longer the active development application credential.

The frozen copy contains 12 collections and 176 documents: members 7, products 27, sales 7, attendances 6, comments 18, likes 43, views 46, saved_products 8, guest_likes 11, sale_notification_reads 3, and empty boardArticles/follows collections. All BSON, IDs, stored password hashes, dates, statuses, reservations, indexes and collection options matched during verification. Old empty collections do not restore their APIs.

Copies are independent from the recorded backup instant. New development changes do not propagate to production. Existing historical missing references were preserved and recorded, including identities/products retained in historical receipts; no data-repair or status-change operation was applied.

## Environment loading

- API and batch use the same environment selector and ConfigService URI validation.
- Development loads `.env.development.local` before `.env`. The local override selects the restricted development user and original database. Existing development JWT secret/ports are retained.
- Production loads only `.env.production.local`; it does not load the legacy `.env`. `MONGO_PROD` and `SECRET_TOKEN` must be present. The production file names `quwat_prod`, uses the restricted production user and has a different signing secret.
- Externally supplied environment variables override file values. A missing production URI/secret, system database or equal configured development/production namespace causes startup failure rather than fallback.
- `npm run start:prod` and `npm run start:prod:batch` both set `NODE_ENV=production`. API/batch builds must be run sequentially because they share the output directory.
- Both local env files are already Git-ignored and have 0600 permissions. Connection strings/passwords must not be copied into tracked examples, logs or command-line arguments. The original tracked `.env` was not edited by this task.

Production database/config preparation is complete. Hosting, frontend API URLs, domain/TLS, a production server and persistent upload delivery remain a separate deployment task. A production server needs the production configuration and the `uploads` tree at its existing relative paths. Users log into the production site with their copied account credentials; development JWTs do not authenticate against the separate production secret.

## Backup and operator tools

Verified private backup directory:

`/Users/muzaffar/.local/share/quwat/backups/2026-10-17T05-44-53-747Z-q4FJoA`

It contains `Quwat.archive.gz`, `uploads/`, `manifest.json`, restricted tool logs and the access-verification record. The directory has 0700 permissions and files 0600. The manifest stores per-collection raw-BSON SHA-256/counts/options/indexes, all 55 upload file hashes and the archive checksum. Upload references had zero missing local files. Keep this backup private; it contains account/profile/history data and password hashes.

Official MongoDB Database Tools 100.19.1 for Apple Silicon are installed in:

`~/.local/share/quwat/database-tools/100.19.1/`

`node scripts/verify-database-isolation.cjs` is read-only. It checks the actual local environment files, verifies each user's exact readWrite role/own database access, and requires the other database to deny reads. Atlas can report authorization denial as code 8000 rather than MongoDB's usual code 13.

`node --test scripts/production-database.test.cjs` tests guard/integrity behavior without connecting to a database.

The operator copy script is deliberately fixed to `Quwat` -> `quwat_prod`. It requires `copy --writers-stopped` and an empty destination. It now refuses to run against the populated production database. It never uses --drop, merges existing target collections or automatically retries a partial restore. It uses the original operator URI from `.env` (or an explicitly provided MIGRATION_SOURCE_URI), and supports MONGODB_TOOLS_BIN for an alternate official-tools installation.

For a separately approved future copy, stop all API/batch/other writers first. The script captures a private BSON/uploads backup, verifies the source remained stable around the dump, restores namespaces with MongoDB Database Tools, then compares source/target and file digests. On failure, preserve the source and the partial target for review and resume the original development service; do not delete or overwrite production as a recovery shortcut.

## Service status and verification

The API was paused only for the frozen copy and later restarted to activate the development credential. It is running in development mode on port 3007 against `Quwat`; the previously stopped batch remains stopped. The restarted API is a detached `npm run start:dev` watcher; its restricted log is `development-api.log` in the backup directory. The final supervisor PID at handoff was 17802. Frontend port 3000 was left running.

Validation passed: frontend typecheck, both backend typechecks, all 322 backend tests (11 new environment cases), 4 migration guard/integrity tests, non-autofix lint, sequential API/batch builds in an isolated copy and whitespace checks. Actual ConfigModule checks confirmed file selection and external-variable precedence. Development GraphQL returned HTTP 200 with Query, and production BSON/indexes plus uploaded-file backup matched the frozen manifest again after credential activation.

No live sale, stock, attendance, profile or login mutation was used for validation. No production application process or database setup/repair script was started.
