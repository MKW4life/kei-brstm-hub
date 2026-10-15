# Kei Projects — Firebase Spark Hosting

A static portal for Kei BRSTM Hub, Kei Lounge Card (including MKW Item Counter), and MKW Course Stats. This is a **shared entry point**, not yet a merged Next.js application. Existing services and APIs remain on their original hosts.

## Free deployment

1. Use the existing Firebase project `kei-projects-33b53` on the **Spark (no-cost)** plan. Do not attach a billing account.
2. Open a terminal in `kei-projects-site/`.
3. Run:

```sh
npx firebase-tools login
npx firebase-tools deploy --only hosting --project kei-projects-33b53
```

The Firebase portal is already live; use the manual GitHub Actions workflow for updates.

Do not run `firebase init` over the existing `firebase.json` unless you intend to regenerate it.

## Stable portal routes

Firebase Hosting uses **temporary 302 redirects** so the portal URLs can be retained when services are migrated later:

| Portal path | Current destination |
| --- | --- |
| `/music` | `https://kei-brstm-hub.vercel.app/` |
| `/lounge` | `https://kei-lounge-cards.vercel.app/` |
| `/lounge/item-counter` | `https://kei-lounge-cards.vercel.app/item-counter` |

These are redirects; the browser **leaves the Firebase origin**. Do not claim this is a single-domain runtime.

MKW Course Stats is already live at `https://mkw-trackstats.pages.dev/` with Cloudflare Pages and a D1 binding. The `/stats` portal route redirects to that existing application in the browser; its card is visible on the portal. Cloudflare and D1 remain unchanged.

The verified Course Stats URL is set in `public/projects-config.js`. Run `node scripts/check.mjs` and deploy the portal when that URL needs updating.

This is a client-side redirect, not a Firebase proxy or a copy of MKW Course Stats. The original Cloudflare Pages Functions, D1 binding, admin secret, and historical data stay where they are.

## Validation

Run `node scripts/check.mjs` from `kei-projects-site/`. The script uses only Node.js built-in modules and checks Spark-only configuration, service redirects, conditional Stats links, and blocked executable file extensions.

The pull request also has a GitHub Actions check. It does **not** deploy anything or require Firebase credentials. A passing static check is not a replacement for a browser smoke test.

## Link the existing service navigation

After the Firebase URL is live, set **public, nonsecret** environment variables on both existing Vercel projects:

- `NEXT_PUBLIC_KEI_PROJECTS_URL=https://kei-projects-33b53.web.app/` (optional override)
- `NEXT_PUBLIC_MKW_COURSE_STATS_URL=https://mkw-trackstats.pages.dev/` (optional override)

The verified links are enabled by default in BRSTM Hub and Lounge Card. No Vercel variable is required; redeploy only if an override is changed.

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

- [x] Verify live MKW Course Stats and enable its portal card.
- [ ] Run `node scripts/check.mjs` and confirm GitHub Actions.
- [x] Set `public/projects-config.js` to the verified Cloudflare Pages destination.
- [x] Review and merge original portal/navigation PRs.
- [x] Create a Spark project with billing **off**.
- [x] Publish the initial static portal.
- [ ] Test `/music`, `/lounge`, `/lounge/item-counter` redirects.
- [ ] Test Lounge Card and Item Counter OBS overlays and Windows hotkeys on their original URLs.
- [x] Enable working portal links in BRSTM Hub and Lounge Card without extra variables.
- [ ] Only after verification consider a separate same-origin migration plan.
