# MKW Course Stats integration notes

The Course Stats application is currently **not migrated**. The source archive was provided in the conversation but could not be opened in the current execution environment. Do not replace the original application or import historical scores from guessed data.

## Confirmed from the prior design, not yet verified against the deployed source

The approved design calls for:
- A React/Vinext frontend with Cloudflare Workers backend and D1 persistence.
- Anonymous public results viewing and JSON submissions.
- Server-side MKW Lounge player ID resolution.
- Global de-duplication by `rxx` identifier and a 12-player validity check.
- Admin-only deletion, replacement and restoration.
- Atomic writes, accurate course averages and preservation of original player identities.

These are **design requirements**, not claims that every feature currently works in the uploaded ZIP or production.

## Spark-compatible migration

Do not move a D1-backed application directly to Firebase Hosting: Spark static hosting alone cannot run Worker routes or D1 queries.

Phase 1 (implemented here):
1. Expose `/stats` as a stable portal path.
2. Leave the Course Stats card hidden until the real HTTPS deployment is verified.
3. Put the verified URL in `public/projects-config.js`. The portal then makes a client-side redirect.
4. Keep all existing API endpoints, data and admin permissions at the original service.

Later migration, only after source audit:
1. Inventory `app/api/**`, Worker bindings and D1 migrations.
2. Confirm existing data ownership, export and backup procedures before changes.
3. Choose whether to keep the Worker/D1 API (recommended when Spark billing must remain off).
4. If porting the frontend to Firebase static hosting, update API CORS/security and route configuration *without exposing any privileged tokens*.
5. Preserve all `rxx` uniqueness and player-ID mappings.
6. Validate import, duplicate prevention, mobile layout and administrator permissions against live-like test data.
7. Migrate URLs only after confirming existing history, and never silently overwrite the live database.

The contents of the old design and the original app must be compared before production changes.

## External dependencies

- Cloudflare Workers and D1 quotas, limits and any charges are independent from the Firebase Spark plan.
- The application may need its existing ChatGPT Sites authentication functionality for admin controls; authentication must be re-evaluated if the frontend or backend moves.
- A redirect through `/stats` is not a reverse proxy, so the browser origin and cookies remain those of the destination.
