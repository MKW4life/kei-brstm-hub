# Kei Projects — Firebase Spark Hosting

A static portal for Kei BRSTM Hub, Kei Lounge Card (including MKW Item Counter), and MKW Course Stats. This is a **shared entry point**, not yet a merged Next.js application. Existing services and APIs remain on their original hosts.

## Free deployment

1. Create a Firebase project on the **Spark (no-cost)** plan. Do not attach a billing account.
2. Open a terminal in `kei-projects-site/`.
3. Run:

```sh
npx firebase-tools login
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

Replace `YOUR_FIREBASE_PROJECT_ID` with the actual project ID. Firebase has **not** been deployed by this pull request.

Do not run `firebase init` over the existing `firebase.json` unless you intend to regenerate it.

## Stable portal routes

Firebase Hosting uses **temporary 302 redirects** so the portal URLs can be retained when services are migrated later:

| Portal path | Current destination |
| --- | --- |
| `/music` | `https://kei-brstm-hub.vercel.app/` |
| `/lounge` | `https://kei-lounge-cards.vercel.app/` |
| `/lounge/item-counter` | `https://kei-lounge-cards.vercel.app/item-counter` |

These are redirects; the browser **leaves the Firebase origin**. Do not claim this is a single-domain runtime.

MKW Course Stats is assigned the stable portal route `/stats`. Until its destination can be verified, **the Stats card is hidden**. `/stats` serves a simple back-navigation page when no destination is set.

When a real MKW Course Stats deployment has been verified:
1. Edit `public/projects-config.js` and set `courseStatsUrl` to that HTTPS URL.
2. Run `node scripts/check.mjs` from `kei-projects-site/` before deployment.
3. Deploy the static portal. Its Stats card will now appear and `/stats` will redirect to the configured URL.

This is a client-side redirect, not a Firebase proxy or a copy of MKW Course Stats. Do not use an unverified legacy deployment URL. The source ZIP could not be inspected in the current environment, so the Course Stats application's original functionality has not yet been ported.

## Validation

Run `node scripts/check.mjs` from `kei-projects-site/`. The script uses only Node.js built-in modules and checks Spark-only configuration, service redirects, conditional Stats links, and blocked executable file extensions.

The pull request also has a GitHub Actions check. It does **not** deploy anything or require Firebase credentials. A passing static check is not a replacement for a browser smoke test.

## Link the existing service navigation

After the Firebase URL is live, set **public, nonsecret** environment variables on both existing Vercel projects:

- `NEXT_PUBLIC_KEI_PROJECTS_URL=https://YOUR_FIREBASE_PROJECT_ID.web.app/`
- `NEXT_PUBLIC_MKW_COURSE_STATS_URL=...` (only if the Course Stats URL is confirmed)

The corresponding GitHub branches add these opt-in navigation links. Redeploy existing Next.js apps after updating public environment variables.

## Compatibility and safety

- Firebase Spark Hosting serves static assets; it does not run the existing Next.js API handlers. Keep these endpoints on Vercel for now.
- BRSTM files and data remain on Cloudflare R2 and Supabase.
- Item Counter remains under the Lounge Card origin, uses its existing `/api/item-counter`, and prefers Upstash Redis.
- Existing OBS browser source URLs and Windows hotkey API URLs **must not be changed** during this phase.
- The Item Counter connection key is stored in localStorage under the current domain; changing origins without migration would produce a different key.
- Firebase Spark Hosting restricts uploads of some executable file types, including `.bat`. Keep the hotkey helper download on the existing Vercel site.
- Never put Upstash, R2, or Supabase privileged keys in a public Firebase asset or `NEXT_PUBLIC_*` value.
- Neither a Firebase upgrade nor a paid service is required for this portal.

## Release checklist

- [ ] Keep the unverified MKW Course Stats card hidden.
- [ ] Run `node scripts/check.mjs` and confirm GitHub Actions.
- [ ] Verify the Course Stats deployment and update `public/projects-config.js` before enabling its card.
- [ ] Review both draft PRs and confirm production apps remain unchanged.
- [ ] Create a Spark project with billing **off**.
- [ ] Publish the static portal.
- [ ] Test `/music`, `/lounge`, `/lounge/item-counter` redirects.
- [ ] Test Lounge Card and Item Counter OBS overlays and Windows hotkeys on their original URLs.
- [ ] Set the opt-in `NEXT_PUBLIC_KEI_PROJECTS_URL` variable and redeploy both Vercel apps.
- [ ] Only after verification consider a separate same-origin migration plan.
