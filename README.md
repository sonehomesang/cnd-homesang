# CND-HomeSang — standalone app

**CND ("Home Hardware shop & services")** — a partner store, now split into its **own
independent product**: its own Firebase project, its own database, its own code/repo.
Serves **https://cnd.homesang.pro**.

> Previously CND lived *inside* `D:/myApp/homesang-v2` (under `app/cnd`, `lib/cnd`,
> `components/cnd`, shared functions/rules, shared Firebase project `homesang-v2-prod`).
> As of the split it is a separate app here at `D:/myApp/cnd`. HomeSang stays in
> `homesang-v2` on the `homesang-v2-prod` Firebase project.

## Stack
- Expo Router / React Native Web (cloned from the HomeSang mobile app as a build-safe baseline).
- **Firebase project: `cnd-homesang`** (separate from HomeSang) — Firestore + Auth + Functions + Hosting.
- Maps: Leaflet + OpenStreetMap (no Google). OTP: Twilio (via Cloud Function).

## Migration status (split project)
- [x] **Stage 1a — scaffold**: cloned `apps/mobile` → here; repointed identity to CND
      (`package.json` name+deploy scripts, `.firebaserc`, `app.json`) and `.env.local` to
      placeholders for the **new** Firebase project (does NOT point at homesang-v2-prod).
- [x] **Stage 1b — prune (app/lib/components)**: `isCndHost()` returns true; root `/`
      re-exports the CND storefront; CND-only `app/_layout.tsx` (Auth+i18n+Theme only);
      removed the `(tabs)` group; deleted 260 HomeSang-only files via transitive import
      closure. Remaining: app/=19, lib/=62, components/=13. `tsc --noEmit` clean.
      Subpage URLs still `/cnd/*` (clean-URL promotion deferred). Functions/rules NOT yet
      pruned (Stage 2). Runtime not yet verified (needs real Firebase config).
- [ ] **Stage 2 — backend**: keep only the 4 CND functions + OTP; CND-only `firestore.rules`;
      set up Hosting (Firebase site or Hostinger VPS).
- [ ] **Stage 3 — data**: re-seed mock into the new project (discard old test order CND-20017).
- [ ] **Stage 4 — cutover**: point `cnd.homesang.pro` at the new hosting; delete CND from `homesang-v2`.
- [ ] **Stage 5 — verify + docs**.

## ⚠️ Before running / deploying
1. Put the real Firebase config (6 values) from the `cnd-homesang` project into `.env.local`
   (replace every `REPLACE_ME`). Get them from Firebase console → Project settings → Your apps.
2. `firebase use cnd-homesang` (after the project exists and you have CLI access).
3. `npm install` (node_modules is not cloned).

## Notes
- This is a **build-safe baseline clone** — it still contains HomeSang code that Stage 1b prunes.
- Local dev docs / daily notes are kept in the HomeSang repo's `docs/cnd-split/` for now.
