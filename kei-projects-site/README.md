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

The MKW Course Stats tile currently uses `https://mkw-trackstats.hasumimihate.chatgpt.site/`, based on earlier project history. The URL could not be independently verified. Confirm its active deployment before publishing the homepage. Once confirmed, replace the tile URL; only then set a stable `/stats` redirect if desired.

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

- [ ] Verify MKW Course Stats destination with a browser before publishing.
- [ ] Review both draft PRs and confirm production apps remain unchanged.
- [ ] Create a Spark project with billing **off**.
- [ ] Publish the static portal.
- [ ] Test `/music`, `/lounge`, `/lounge/item-counter` redirects.
- [ ] Test Lounge Card and Item Counter OBS overlays and Windows hotkeys on their original URLs.
- [ ] Set the opt-in `NEXT_PUBLIC_KEI_PROJECTS_URL` variable and redeploy both Vercel apps.
- [ ] Only after verification consider a separate same-origin migration plan.
