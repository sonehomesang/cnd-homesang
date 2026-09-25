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
- [x] **Stage 2 — backend (functions)**: `functions/src/index.ts` 1932→589 lines — kept 9
      exports (5 OTP over Twilio + 4 CND triggers) + their helpers; removed ~24 HomeSang
      functions. functions build (tsc) clean. Hosting not set up yet.
- [x] **Stage 2a — firestore.rules trim (CND + shared only)**: 1243→614 lines, 112→48 match
      blocks (23 `cnd*` + 25 shared that CND client code actually reads: users/userCards/
      techContact/techCards/userGroups/translations/settings/secureConfig/otpCodes/referrals/
      auditLogs/errorLogs/userActivity/riders/deliveryTasks/jobs/bids/products/orders/
      walletTransactions/techApplications/techQuiz*). Removed 64 HomeSang/MK-Plan/B2B-org/
      marketplace-social blocks + 8 now-dead helpers. Keep set derived from a client-code grep
      of every `collection()/doc()` ref (rules only govern the client; functions use admin SDK
      which bypasses them). Verified: emulator compiles + `npm run test:rules:cnd` 61/0.
      **Deployed to cnd-homesang** (2026-09-25) + live-verified: storefront on served dist
      still loads 9 products / config / categories with no permission-denied.
- [x] **Auth — Email/Password enabled** (owner, 2026-09-25): unblocks admin login + client-SDK seeding.
- [ ] **Stage 2b (later) — hosting** after runtime verification.
- [x] **Stage 3 — data (full demo seed done, 2026-09-25)**: ran the real client seeder
      `lib/cnd/mockSeed.ts::seedCndDemo` against cnd-homesang by esbuild-bundling it for Node
      and signing in as the admin (email/pw) so `isAdmin()` authorizes writes under the trimmed
      rules (no service-account key / IAM). Seeded: cndTechs 8, cndBranches 2, cndRoles/cndStaff
      4/4, cndSuppliers 4, cndExpenses 4, cndCoupons 3, cndBanners 4, cndZones 5, cndBanks 2,
      cndOrders 30 (online+POS), cndShifts 3 (X/Z), cndPurchaseOrders 3, + rebuilt cndReviewCards
      2 / cndCustomerCards 5. (cndProducts 9 / cndCategories 4 pre-existing, so catalog re-seed
      skipped.) Visual-verified: storefront shows branded products + a customer-reviews section,
      no permission-denied. All rows are `__mock`-stamped → the go-live clear removes them.
- [x] **Stage 4a — Firebase Hosting live (2026-09-25)**: deployed `dist` to the cnd-homesang
      default site → **https://cnd-homesang.web.app** / **cnd-homesang.firebaseapp.com**. Verified
      (via the firebaseapp.com mirror; `.web.app` curl fails with QUIC on this machine): CND title,
      SPA rewrite `/cnd/admin`→200, hashed assets 200. `npm run deploy` = fresh build + hosting
      deploy. Does NOT touch cnd.homesang.pro (still on homesang-v2-prod).
- [ ] **Stage 4b — custom-domain cutover**: (1) OLD project console `homesang-v2-prod` → Hosting →
      remove custom domain `cnd.homesang.pro` (a domain lives on one site only); (2) NEW project
      console `cnd-homesang` → Hosting → Add custom domain `cnd.homesang.pro`; (3) update DNS TXT
      `hosting-site` from `homesang-v2-prod` → `cnd-homesang` (A stays 199.36.158.100). This is the
      production switch. Then delete CND from `homesang-v2` (app/cnd, lib/cnd, components/cnd, 4 fn,
      rules blocks, 3 reverse refs).
- [ ] **Stage 5 — verify both prod + docs**.

## ⚠️ Before running / deploying
1. Put the real Firebase config (6 values) from the `cnd-homesang` project into `.env.local`
   (replace every `REPLACE_ME`). Get them from Firebase console → Project settings → Your apps.
2. `firebase use cnd-homesang` (after the project exists and you have CLI access).
3. `npm install` (node_modules is not cloned).

## Notes
- Stage 1b done: HomeSang code pruned; this is now a CND-only app (see the tracker above).
- **Local dev docs, daily/handover notes, setup guides, UAT** live in `docs/` in THIS repo
  (gitignored — local only). Start with `docs/cnd-note <DD-MM-YY>.md` (latest handover) and
  `docs/01-firebase-project-setup-LAO.md`.
