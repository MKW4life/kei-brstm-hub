# Kei Projects — Firebase Hosting entry

This directory contains a standalone static landing page for Firebase Hosting on the free Spark plan. It does not replace the current Next.js apps or their APIs.

## Deploy

From this directory:

```sh
npx firebase-tools login
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

Create a Firebase project with the **Spark (free)** plan first. Replace `YOUR_FIREBASE_PROJECT_ID` with that project's ID. Deployment has not been performed by this change.

## Current destinations

- Kei BRSTM Hub: https://kei-brstm-hub.vercel.app/
- Kei Lounge Card: https://kei-lounge-cards.vercel.app/
- Item Counter: https://kei-lounge-cards.vercel.app/item-counter
- MKW Course Stats: https://mkw-trackstats.hasumimihate.chatgpt.site/

The Course Stats link is based on the previously shared deployment and should be tested before going live.

## Migration safety

This is **phase 1: a unified entry point**, not a single-origin migration. Links currently open the existing services.

Keep the Vercel-backed Next.js APIs running while migrating interfaces; Firebase Hosting on the Spark plan cannot run these Node.js route handlers. BRSTM Hub uses Supabase and Cloudflare R2; Lounge Card uses Next.js API routes and the Item Counter prefers Upstash Redis.

Do not change existing OBS URLs, Windows hotkey API URLs, or Item Counter connection keys during this phase. The Item Counter secret is stored in the existing domain's browser localStorage; changing the domain can otherwise create a different key. A later same-domain integration will require a deliberate key-migration path.

Do not add billing, Blaze-only features, or new paid services without separate authorization.
