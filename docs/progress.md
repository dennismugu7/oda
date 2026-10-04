# Progress log

Newest entries at the top.

## 2026-10-04 · M4 CP1 + CP2 (storefront data, shop home, demo seed), at review stop A (branch `m4-storefront`, owner Step 63)

- **M3 closed:** PR #18 merged (`5430412`), tag `m3-done`. **M4 plan approved** with the owner's decisions (decision #59).
- **CP1** (`3d19c7a`): shared `storefront.ts` (visit sources, query parsing, badges, Nairobi day, `oda_v` cookie); `publicRepo` gains `catalog()` (filters, sorts, badges, covers), non-empty visible `categories()`, `lookup()`, `recordVisit()`, and `mpesaChecked` / `logoUrl` on the shop; public endpoints `POST /api/shops/:slug/visit` and `/cart`.
- **CP2:** shop home `app/[slug]/page.tsx` (states: paused, not taking orders, branded 404 for unknown/suspended/deleted; old links redirect), link-preview image `app/[slug]/opengraph-image.tsx`, landing page `/` (draft wording, `APP_DOWNLOAD_URL`), `/privacy` + `/terms` placeholders, cart/favourites on the device (`lib/store/cart.ts`, `components/store/`), demo seed `server/demoSeed/` + manual workflow `demo-seed-staging.yml`.
- **Tests:** storefront data 6 (filters, sorts incl. popular/newest/price, search in name and description with `%` literal, badges, hidden/deleted/other-shop products never listed, categories only visible and non-empty, till tick only when verified, cart lookup leaves out hidden/deleted/other shops and checks ids, visits once per browser per day by source, unknown tags direct, old link counts for the new shop, unknown/suspended 404); shared storefront 6; cart logic 3. Totals: web 212, shared 177, seller 76, db 23, ui-tokens 3. `check:all` passed.
- **Tried locally** (demo seed run twice: second run added nothing): shop page at 390 px, quick add → green tick + cart bar (kept after reload), favourites, search, bad `?c=` ignored, no browser errors; preview image renders; landing, privacy, terms, 404. Fixed on the way: links nested in links (hydration error) and the visit beacon firing twice in development.
- **Design comparison (01):** same header, search, chips, grid, badges, heart, tick/"+", cart bar; design-changes applied (no "order in 3h" banner, no stock badges, WhatsApp Chat in the header); "Popular this week / See all" heading → the category name or "All products"; the filter button on the search box comes with the search page (CP3); the delivery line shows only when the shop has delivery areas or pickup.
- **Not yet built:** product page, cart page, search filters (CP3): product taps and "View cart" show the 404 until then.
- **CI caught what `check:all` didn't:** the M0 Playwright smoke test expected the orange wordmark on `/`; the landing draft had made it navy. The landing keeps the brand orange (as the app icon), the test now covers the landing (store placeholder, support email) and is renamed `e2e/landing.spec.ts`. **`check:all` gains a last step, web build + Playwright (`pnpm test:e2e`)**, so it runs everything CI runs (CLAUDE.md updated).

**Review stop A — owner steps**

1. **Add the GitHub secret** (never in the chat): Vercel → Storage → `oda-staging-images` → its settings/`.env.local` tab → copy the **read-write token** (`BLOB_READ_WRITE_TOKEN`) → GitHub → `dennismugu7/oda` → Settings → Secrets and variables → Actions → New repository secret → name `STAGING_IMAGES_BLOB_READ_WRITE_TOKEN`, paste, Add. Tell me when it's done.
2. I run **Actions → demo-seed-staging → Run workflow** and check the shop.
3. On the phone, open **https://oda-eta.vercel.app/demo-duka**: header, Chat, Share, search, chips, badges, heart, "+" on products without options (green tick, cart bar), Sold out card. Paste the link into WhatsApp to see the preview image.
4. Review the landing page **https://oda-eta.vercel.app/** wording and **/privacy**, **/terms**.

## 2026-10-04 · M3 gate passed (owner Step 62)

**Owner's review stop B on the Redmi: items 1–18 passed**, including drag to reorder for photos and categories, no crashes.

**Gate (milestones.md M3 + definition of done)**

- ✅ **All catalogue actions persist and show at once:** owner's phone test 1–18 (create, edit, status by form and long-press, search, filters, photos add/remove/reorder/cover, delete + Undo, categories add/rename/hide/reorder/assign/delete); the Shop tab and categories reload on focus. API: `server/catalogue.test.ts` checks every write by reading it back.
- ✅ **Presigned upload authorization tests:** `server/uploads.test.ts` — keys always under the seller's own `products/`/`logos/` prefix chosen by the server; other types, empty and oversized (> 5 MB) files and unknown kinds refused; local signed URLs refuse a changed signature, type, size or an expired URL; stored bytes checked (fake image, PNG under `.jpg`, GPS in JPEG/PNG/WebP → rejected and deleted). `server/catalogue.test.ts` — another shop's photo files 403, fake and GPS files 422, 0 or 6 photos 422. Storage drivers: upload URLs locked to key, type and size, 10 minutes (Blob and S3 tests).
- ✅ **Seller isolation for products, categories and photos:** `server/catalogue.test.ts` "a seller never reaches another shop's products or categories" (get, edit, delete, restore, photos, category edit/delete/assign/reorder → 404/422, nothing changes for the owner), 401 signed out, 404 without a shop; `server/authz.test.ts` (M1) for the repositories.
- ✅ **Server-owned fields:** create/edit with `unitsSold`, `shopId`, `deletedAt`, `ratingAvg` → 422 and nothing written; category `position` only through the order endpoint.
- ✅ **`pnpm check:all` green** on `main`'s code (this branch only adds docs): format, lint, typecheck, tests (web 203, seller 76, shared 171, db 23, ui-tokens 3), repo root, Expo deps + native runtime (0.2.0 unchanged), Android bundle.
- ✅ **CI green:** PRs #16, #17 and `main` (`8797ec9`); `migrate-staging` success.
- ✅ **Staging health:** `/api/health` → `{"ok":true,"db":"up","commit":"8797ec9"}`.
- ✅ New logic has unit tests (catalogue API 12 + 1 updated, shared catalogue 3, seller list/form 9); new endpoints have authorization tests; no new buyer web flows (Playwright 6 still pass in CI).
- ✅ Screens compared with 18-edit-product, 19-shop-tab, 20b-categories, 20b1 (CP3–CP5 entry; differences in decision #58) and checked on the Redmi.
- ✅ App on a device via the EAS preview build 0.2.0 + EAS Updates; web deployed to staging.
- ✅ progress.md updated (this entry).

**Tag `m3-done`** on `main` after this entry is merged.

**Carried forward (all milestones so far)**

- M4: Terms / Privacy pages (sign-up links 404 until then); "See what buyers see" on step 6 and "View" / "View in shop" in the app (19b-preview); staging demo seed.
- M8: `/api/cron/purge` — `signup_attempts` older than 7 days, leftover `storage_deletions`, unreferenced keys under `products/`/`logos/` (photos picked but never saved); decide whether soft-deleted products are ever purged (past orders keep their own snapshot).
- M10: automated UI tests (jest-expo/Maestro) for screens now checked by hand.
- M11: Cloudflare R2 with a custom image domain (replacing Vercel Blob, decision #54); `armeabi-v7a`; production keystore and EAS environment; production Neon and Resend; Vercel Hobby is non-commercial (decision #10); `vercel logout` on the laptop.
- `react-native-draggable-flatlist` 4.0.3 (last release May 2025) works with reanimated 4.5 today; re-check on every Expo SDK / reanimated upgrade (error boundaries fall back to buttons/arrows).
- Not built: dragging products within a category (20b1; not in the spec, no per-category order in the data).
- The Shop tab's shop card shows the initial, not the logo (`/api/me` has no logo URL yet).
- Categories screen: the drag list sits inside a ScrollView (a dev-only "nested VirtualizedList" warning; fine for a handful of categories).
- TikTok logo only with TikTok's written permission (neutral icon until then); whether "My status" shows from the Status button (owner to confirm).
- Blob usage: check the Hobby usage page (estimate in the CP0 entry).
- eas-cli 24.8.0 (24.10.0 available), not upgraded; `.wslconfig` proposed, not applied.

**Next:** M4 plan (proposed in the chat) for approval; M4 not started.

## 2026-10-04 · M3 CP3–CP5 (Shop tab, Add/Edit product, categories), at review stop B (branch `m3-catalogue-2`, owner Step 61)

- **Review stop A:** owner approved CP1/CP2 on paper; PR #16 merged (`28f21a1`), staging health OK, EAS Update `a33550ba` (tab bar).
- **`pnpm check:all`** added (decision #58 a) and used for every check run since.
- **CP3 Shop tab, CP4 Add/Edit product, CP5 categories** (decision #58 b–d). New app code: `src/catalogue/` (API client, list/form logic, photo strip, product form, undo store), `src/ui/sheet.tsx`, `src/ui/screenHeader.tsx`, `src/ui/dragBoundary.tsx`, routes `app/products/new`, `app/products/[id]`, `app/categories/index`, `app/categories/[id]`. Server: category list returns up to three `thumbUrls`; `/api/me` returns `businessType`; product list includes `unitsSold`. `apiJson` handles PATCH/PUT/DELETE and 204.
- **Drag library:** `react-native-draggable-flatlist` 4.0.3 installed (0.5 MB, JS only; `deps:check`: native runtime unchanged for 0.2.0). Used for photos and categories, each inside an error boundary with a non-drag fallback (photo actions / arrows). **Its real test is the phone** (review stop B, items 9 and 15).
- **Tests:** seller 76 (Shop list chips/filters/search/row text, buyer filter preview, form money/validation/changed fields/photo order/colours), shared 171, web 203 (category thumbnails), db 23, ui-tokens 3. `check:all` passed (one earlier run stopped at lint: setState in an effect, a ref read during render, two unused imports; fixed).

**Design comparison (from the code; the phone check is review stop B)**
- 19: same header, shop card, chips, list, badges; "View" hidden until M4; chips also include Sold out / Hidden; no Orders badge yet.
- 18-edit-product: same cards and order; "Was price" added under Price (design-changes); Category is a sheet, not a dropdown; "View in shop" hidden until M4; sizes add "+ Size", colours "+ Colour" (sheet with swatches).
- 20b-categories: same; arrows replace the drag handle if dragging fails.
- 20b1: same, without dragging products inside a category (decision #58 d).

**Review stop B: phone test (Redmi, staging, after the EAS Update)**

1. Close and reopen the app twice. → Home tab; tab bar Home · Orders · + · Shop · More.
2. Shop tab. → Your shop card (initial, name, link, Share), chip "All 1", your onboarding product with its cover, price and sizes line. Share → share sheet with your link.
3. Tap "+" (Add product) with no photo, tap Add product. → "Add a photo of your product…".
4. Add 3 photos (camera + gallery) → spinners, then thumbnails, the first marked COVER. Name `Kitenge top`, Price `1500`, Was price `1200`, Add product. → "The was-price must be higher than the price." Was price `1800` → Add product → back on Shop, "All 2", the new product at the top.
5. Status: Sold out in the form, Save. → Row shows "Sold out", a "Sold out 1" chip appears; tap the chip → only that product.
6. Long-press a row → "Available" / "Hidden" sheet; Hidden → "Hidden" badge and chip.
7. Search (magnifier) `kit` → only Kitenge top; × clears.
8. Open Kitenge top → change price to `1,600`, add sizes (presets + "+ Size" `One size`), colours (Maroon, Gold, custom `Sunset print`), description; Save. → Back on Shop, the row shows the new price and sizes. Back arrow with unsaved changes → "Leave without saving?".
9. **Drag test:** in the product, hold a photo and drag it to the first place → it becomes COVER; Save; reopen → order kept. If dragging misbehaves (no movement, jumps, crash), note it; tap a photo → Make cover / Move left / Move right / Remove must still work.
10. Remove one photo (tap → Remove photo), Save. → 2 photos remain.
11. ⋮ → Delete product. → Shop tab, "Kitenge top deleted · Undo" for ~5 s; tap Undo → it's back. Delete again and wait → gone for good from the list.
12. Shop → Categories ›. → Empty list text and "Add a category". Add `Dresses`, `Tops`, `Bags`. → Three rows, "No products yet", the note about empty categories.
13. Open Dresses → "Add products" → pick your onboarding product. → It's listed with ×; preview chips show "All · Dresses".
14. Turn off "Show in my shop" → preview text says it's hidden; back → "Hidden" badge on Dresses. Turn it on again.
15. **Drag test:** hold a category and drag it to another place → order kept after leaving and reopening. If dragging misbehaves, note it (arrows appear only if it fails to load).
16. Rename Tops → `Shirts` (leave the field) → the header and list update. ⋮ → Delete category `Bags` → confirm → gone; its products stay.
17. Shop tab chips now show the categories with products (e.g. "Dresses 1").
18. More → Sign out → Welcome. Sign in again → Home.

- **Shipped:** PR #17 merged (`8797ec9`); main CI and `migrate-staging` passed; `/api/health` → `{"ok":true,"db":"up","commit":"8797ec9"}`. EAS Update to `preview`, runtime 0.2.0: group `bd21e850-3d3e-47cf-bd85-a38cb003c2c3` ("M3: Shop tab, add/edit product, categories"); no native build.

**Next:** owner's review stop B (list above).

## 2026-10-04 · M2 tagged; M3 CP1 + CP2, at review stop A (branch `m3-catalogue`, owner Step 60)

- **GPS read-back passed** (entry below), PR #15 merged (`348435f`), **`main` tagged `m2-done`**.
- **M3 plan approved** with the owner's answers (decision #57).
- **CP1 catalogue API** (`dc29870`): `apps/web/server/repos/catalogue.ts` (on `sellerRepo`), `server/catalogueRoutes.ts`, 8 route files under `/api/products` and `/api/categories`; shared `catalogue.ts` (photo list 1–5 without repeats, category order/assignment inputs, 15 colour presets, 10-minute undo window).
- **CP2 app shell:** tabs Home · Orders · + · Shop · More (`app/(tabs)/`), raised navy "+" opening `/products/new` (a placeholder until CP4), placeholders with one line each ("Your orders will show here", …), Sign out in More, the start gate and step 6 now go to `/home`; `app/start.tsx` removed. Expo Router's own tabs (JS only; `deps:check`: native runtime unchanged for 0.2.0).
- **Tests:** catalogue API 12 (create with ordered photos and cover; bad input incl. server-owned fields, was-price, unknown/foreign category, writes nothing; edit status only; was-price against the stored price; filters and counts; photo reorder/cover/remove with files deleted; another shop's file 403, fake file and GPS 422 (deleted), more than 5 / none 422; delete + undo, undo after 10 minutes 404; categories order, counts, thumbnail, rename/hide, position only via order, exact-set reorder, assignment, delete keeps products; full seller isolation (404) and 401/404); shared catalogue 3; seller start gate updated. Totals: web 203, shared 171, seller 67.
- **Flaky test fixed (M2a):** "lets a locked seller reset their password" failed once: rate limits use clock-aligned windows (`floor(epoch / 900) * 900`) and the run hit 13:30 UTC, so the 5 wrong passwords straddled two windows and no lock happened. The two lockout tests now wait out a window edge first (`awayFromWindowEdge`, at most ~11 s, timeout 30 s). The limit itself is unchanged (fixed windows, decision #44 a).
- **Checks** (one at a time, apart from one slip: typecheck and lint were sent in one message and ran in parallel; both passed): typecheck, lint, tests (all packages green after the fix), `deps:check`, Android bundle.
- **Drag library check (desk only):** `react-native-draggable-flatlist` 4.0.3 allows reanimated ≥ 2.8 and gesture-handler ≥ 2, so 4.5.1 / 2.32 fit its peer ranges; last release May 2025, and past reanimated majors broke it (issues #466, #389), so it is tried on the phone at CP4 before relying on it.
- **Not on staging yet:** CP1/CP2 are on the branch (not merged, no EAS Update). For the review stop A phone check: merge (the API is additive, no migration) and publish an update — owner to say.

**Design comparison (tab bar vs 15/19):** same five slots with the raised navy "+" and "Add product" label; Feather line icons close to the images; no Orders badge yet (M5). Placeholders: navy header with the tab title (and shop name/email), one card with an icon, a title and one line.

**Next:** review stop A (owner): API + tab bar; then CP3 Shop tab.

## 2026-10-04 · Official brand marks shipped; M2b gate report (owner Step 59)

- **Brand marks (decision #56):** WhatsApp green glyph SVG, Instagram black glyph SVG and the Facebook primary logo PNG, copied byte for byte from the owner's downloads of Meta's packs into `apps/seller/assets/brands/` (README: source, pack, rules). Used on step 2 and the step 6 share buttons; TikTok keeps the neutral icon, Status the green ring. The packs had no guideline PDFs, so the rules are those of the brand pages (decision #55). Temporary unzip folder deleted; the full packs are not in the repo. Tests: brand marks 2 (embedded SVG identical to the files; colours unchanged).
- **PR #14 merged** (`652464f`, includes the Windows quoting fix for `update:preview`). **EAS Update** to `preview`, runtime 0.2.0: group `4346b7e8-6246-47b1-8202-3f40202f16c8` (assets only, no native build; `deps:check`: native runtime unchanged). EAS reported "no new assets" to upload although the Facebook PNG is new to the update's asset list (54 assets, was 53): check on the phone that the Facebook logo appears.
- **Checks** (one at a time): seller typecheck, lint, tests (67), `deps:check`, Android bundle, format; CI on PR #14 and `main`.

**M2b gate (milestones.md M2 + definition of done)**

- ✅ A backup file appears in the private store: `staging/oda-staging-20261004T1009Z.dump.gpg` (run 37194410152), restore drill passed (entry below). The nightly schedule runs from `main`.
- ✅ One EAS cloud build finishes and installs on the Redmi 15c: `b22e1133` (0.2.0), installed and tested by the owner (plus `e21b8131` for M2a).
- ✅ A new email can sign up, verify, finish onboarding and land on the app: owner's review stop B (1–22, 24, 25) and retests; the landing screen is the shop placeholder until Home in M6 (decision #53 f).
- ✅ The shop exists with 1 product: the onboarding flow and API tests (`server/onboarding.test.ts`, 26) and the owner's run; photos uploaded to Blob on staging.
- ✅ Killing the app mid-onboarding resumes at the same step: owner's test at steps 2, 3 and 5; start-gate tests (`auth-logic.test.ts`).
- ✅ Reset password end to end and the welcome side-by-side check: M2a gate (`m2a-done`).
- ✅ Camera and gallery photos with real Blob uploads; Skip payment: owner's review stop B.
- ✅ **One uploaded staging photo has no GPS EXIF (read back, owner Step 60):** `products/ab93a03c-…/e1ba0ade-….jpg` (227,705 bytes, 1077 × 1600, the phone's re-encoded full photo). Its only metadata: a JFIF header (APP0) and an ICC colour profile (APP2, 472 bytes). No EXIF segment, no XMP, no "GPS" bytes anywhere; the server's `hasLocationData` returns false.
- ✅ Lint, typecheck, tests locally and in CI (web 191, seller 67, shared 168, db 23, ui-tokens 3).
- ✅ New logic has unit tests; new endpoints have authorization tests (onboarding 26 incl. seller isolation, uploads 22 incl. another shop's prefix, wrong type/size, GPS). No new buyer web flows in M2b (Playwright 6 from M2a still pass in CI).
- ✅ Screens compared with the designs: 09–14 on the Redmi at review stop B and the step 6 retest; differences listed in the CP4/CP5 entry, decisions #53, #55, #56.
- ✅ Web deployed to staging (`652464f`, health OK); the app runs on the Redmi via the EAS preview build + updates.
- ✅ progress.md updated.

**Gate passed:** all items ✅; `main` tagged `m2-done` after this entry is merged.

**Carried forward**

- Terms / Privacy links open `/terms` and `/privacy`, which 404 until M4.
- Vercel CLI logged in on the laptop and `apps/web/.vercel` linked: `vercel logout` before M11.
- `.wslconfig` (12 GB cap) proposed, not applied.
- M8 purge: `signup_attempts` older than 7 days; leftover `storage_deletions`; unreferenced keys under `products/` and `logos/` (photos picked but never saved).
- M10: automated UI tests (jest-expo/Maestro) for the screens, now checked by hand.
- M11: production object storage on Cloudflare R2 (replacing Vercel Blob) with a custom image domain; `armeabi-v7a`; production keystore and EAS environment; production Neon and Resend; Vercel Hobby is non-commercial (decision #10).
- eas-cli 24.8.0 (24.10.0 available), not upgraded.
- TikTok logo only with TikTok's written permission (neutral icon until then).
- Whether "My status" shows in WhatsApp's list from the Status button: owner to confirm on the phone (decision #55 b).
- Blob usage: check the Hobby usage page after the first week (estimate in the CP0 entry).

**Next:** M3 (plan approved, Step 60) on branch `m3-catalogue`: CP1 catalogue API → CP2 app shell → review stop A.

## 2026-10-04 · Review stop B fixes (owner Step 58; branch `m2b-review-b`)

**Owner's phone test:** passed 1–22, 24, 25; uploads work on staging. Fixes (decision #55):

1. **Shop links were `localhost:3000/…` (critical).** Cause: Vercel had no `PUBLIC_SHOP_BASE_URL`; the server fell back to its local default. Set **`PUBLIC_SHOP_BASE_URL=https://oda-eta.vercel.app`** on Vercel (Config, Production + Preview) with the CLI. The app's EAS `preview` values were already right (`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SHOP_BASE_URL` = `https://oda-eta.vercel.app`). Guards: the server refuses a non-public base URL on Vercel and `/api/health` answers 503 `config: invalid` (so the deploy check fails); `pnpm update:preview` refuses to publish and EAS refuses to build (non-development) with localhost URLs. Tests: env 1, shared 4 (`isPublicBaseUrl`, `postForShare`), seller 2.
2. **Brand icons: partly done, blocked.** TikTok's guidelines forbid using its logo without written permission → neutral music-note icon labelled "TikTok". Meta's WhatsApp/Instagram/Facebook packs only download from their brand pages in a browser (signed links; the plain links answer 403), so the owner downloads them; until then the placeholder glyphs stay. Status is now WhatsApp's green ring.
3. **Share buttons open their targets:** WhatsApp and Status → WhatsApp with the post filled in (+ "Choose My status" hint); TikTok/Instagram/Facebook → caption copied, app (or website) opened, "Caption copied — paste it in your bio or post"; More → share sheet; no WhatsApp → share sheet with a message. Tests: 6.
4. **Labels on one line:** four equal columns; labels shrink instead of wrapping (font scale capped at 1.4×).
5. **Done:** white and bold in the header, plus "Go to my shop" at the bottom.
6. **Editable post:** EN/SW and "Try another" ask before replacing edited text; the shared text always carries the tagged https link (added back at the end if deleted, with a warning under the box).
7. **Checklist:** "Finish setting up · x of 7" right under the share buttons; "Test your WhatsApp link" first, with "See what buyers see when they tap Chat on WhatsApp." and "Open WhatsApp".

- **JS only:** `deps:check` says the native runtime is unchanged for 0.2.0 (react-native-svg and expo-clipboard are in build `b22e1133`), so this ships as an EAS Update.
- **Checks** (one at a time): format, lint, typecheck, tests (web 191, seller 65, shared 168, db 23, ui-tokens 3), `deps:check`, Android bundle. Slip: twice I sent several check commands in one message, so they ran in parallel; each was re-run on its own and passed.
- **Limits:** no app can post straight to WhatsApp Status; TikTok, Instagram and Facebook don't take prefilled text from other apps (by their design). Whether "My status" appears in WhatsApp's list from the WhatsApp button needs the phone.

- **Shipped:** PR #13 merged (`88abeef`); main CI and `migrate-staging` passed; `/api/health` → `{"ok":true,"db":"up","commit":"88abeef"}` (the new guard answers 503 when the shop base URL isn't a public https URL, so this also confirms `PUBLIC_SHOP_BASE_URL` is live). **EAS Update** published to `preview`, runtime 0.2.0: update group `0b671df9-0145-4030-a136-889f827913ce` ("Step 6: https shop links, …"). The first publish attempt failed before uploading anything: the update script passed the message unquoted to the Windows shell, so it split at the spaces; fixed (branch `m2b-icons`).

**Next:** owner retests step 6 (close and reopen the app twice to get the update) and decides on the icons: download Meta's WhatsApp, Instagram and Facebook packs from their brand pages (I add the glyphs as given); TikTok: ask TikTok for written permission or keep the neutral icon.

## 2026-10-04 · Restore drill passed (owner Step 57)

- **Backup:** `staging/oda-staging-20261004T1009Z.dump.gpg` from `oda-staging-backups` (17 KB encrypted, 91,829 bytes decrypted), from manual run 37194410152. The owner downloaded and decrypted it (passphrase never in chat).
- **Restore:** `pg_restore --no-owner --no-acl --exit-on-error` into a separate database `oda_restore_drill` in the local `oda-postgres` (Postgres 18); exit 0, about 1 s. The main local database wasn't touched.
- **Checks** (same as the local database built from the same migrations):
  - Tables: 26 in `public` (20 data-model tables, the 4 `auth_*` tables, `signup_attempts`, `storage_deletions`) + `drizzle.__drizzle_migrations`.
  - 15 functions, 24 triggers, 19 enums.
  - Migrations: 5 rows (`0000`–`0004`); the latest hash matches local `0004_storage_deletions`.
  - Rows: `auth_user` 2, `auth_account` 2, `profiles` 2, `auth_session` 1, `auth_verification` 2, `rate_limits` 20; `shops`, `products`, `product_photos`, `payment_accounts`, `orders` and the rest 0 (staging has only the hand-test accounts; no shop yet).
- **Clean-up:** `oda_restore_drill` dropped; the unencrypted dump deleted from Downloads and from the container. The `.gpg` file stays for the owner to delete.
- **Time:** about 3 minutes from download to checked restore (owner's download + decrypt ≈ 1 min, restore and checks ≈ 1 min, clean-up < 1 min).
- **Acceptance:** "a backup file appears in R2" (milestones M2, moved from M1 by decision #31) is met with the private Vercel Blob store (decision #54), with a tested restore.

**Next:** the owner runs the review stop B phone test (list in the entry below).

## 2026-10-04 · Storage live on staging, first backup; at review stop B (owner Step 56)

- **Dashboard setup (owner):** public Blob store `oda-staging-images` (fra1) connected to the project for Production + Preview; private `oda-staging-backups` (fra1) not connected. Names checked, no values: Vercel has `STORAGE_DRIVER`, `STORAGE_PUBLIC_BASE_URL`, `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`, `BLOB_WEBHOOK_PUBLIC_KEY` (Production + Preview; the webhook key isn't used: no upload callbacks); GitHub has `BACKUP_BLOB_READ_WRITE_TOKEN`, `BACKUP_PASSPHRASE` (plus `NEON_STAGING_DATABASE_URL_UNPOOLED`, `VERCEL_DEPLOY_HOOK_STAGING`).
- **PR #12 merged** (`19a53fa`) after green CI; main CI and `migrate-staging` passed; `/api/health` → `{"ok":true,"db":"up","commit":"19a53fa"}`, so the new env vars are live.
- **First backup** (manual run 37194410152): dump 92 KB, readable by `pg_restore`; uploaded `staging/oda-staging-20261004T1009Z.dump.gpg`; log: "Kept (1)", "Deleted (0)". The size printed as "0.0 MB"; small files now show in KB (branch `m2b-review-b`).
- **No EAS Update needed:** nothing under `apps/seller`, `packages/shared` or `packages/ui-tokens` changed since build `b22e1133` (`97d9812`).
- **Restore drill:** waiting for the owner's OK (download ≈ 92 KB; restored into a separate database in the running local `oda-postgres`, no image download).
- **Not checked yet on real storage:** a phone upload through the Blob presigned URL (no staging account on this machine); the phone test below covers it.

**Review stop B: phone test (Redmi, staging)**

1. Install the 0.2.0 APK over 0.1.0. → It opens; a signed-in account without a shop lands on "What do you sell?" (step 1 of 6, one segment filled).
2. Sign up with a new email, enter the code. → Step 1.
3. Step 1: pick "Clothes & fashion", Next. → Step 2 ("Where do you sell today?"). (Optional: Skip on a second account → step 2, and its shop preview later says "Something else".)
4. Step 2: tick WhatsApp chats and TikTok, then tap "I'm just starting out". → The other ticks clear. Tick WhatsApp chats and TikTok again, Next. → Step 3.
5. **Kill and resume at step 2:** go Back to step 2, kill the app (swipe away), reopen. → Opens on step 3 (step 2 was already saved: steps only move forward); Back shows step 2 with WhatsApp chats and TikTok ticked.
6. Step 3: type a shop name. → "Checking your link…", then "✓ <domain>/<link> is yours". Tap Edit, type `admin`. → "That link is taken" (or a reserved-link message) with suggestions; tap one. → "is yours".
7. **Kill and resume at step 3:** kill before tapping Next, reopen. → Opens on step 3 (nothing saved yet, fields empty).
8. Step 3 again: name, WhatsApp number `712 345 678` (also try `0712…`), tap the avatar, pick a logo from the gallery, Next. → Step 4; the logo is kept (going Back shows it).
9. Step 4: tap "Add a cover photo" → "Take a photo". → Camera permission prompt the first time; after the shot, the tile shows a spinner, then the photo with "Retake" and "Cover photo".
10. "Add more" → "Choose from gallery", pick 2. → Both upload (spinners, then thumbnails with ×). Remove one with ×. "Retake" the cover from the gallery. → The cover changes.
11. Sizes: the chips are XS S M L XL XXL Free size; tick M and L; "+ Other" → `One size` → Add. → It appears ticked. Name `Ankara wrap dress`, price `2500` (shows `2,500`), Add product. → Step 5.
12. Step 4 without a photo (second account, or try before adding one): Add product. → "Add a photo of your product. Buyers want to see it."
13. **Kill and resume at step 5:** kill on step 5, reopen. → Opens on step 5.
14. Step 5: Till with `12` → Continue. → "Enter the Till number: 5 to 7 digits." Then **Skip for now**. → Step 6.
15. Step 6: "Your shop is live", the link with Copy (→ "Copied"; paste somewhere to check), share buttons WhatsApp · TikTok · Status · More (your channels first). WhatsApp → WhatsApp's chat picker with the post and a link ending `?s=wa`; send it to yourself. → Back in oda, "Share your link" is ticked.
16. EN/SW and "Try another" change the post. "Open WhatsApp" under "Test your WhatsApp link" → your own chat opens; back in oda the item is ticked. No "See what buyers see".
17. Done. → The placeholder with your shop name and link. Kill and reopen. → The placeholder again (onboarding finished).
18. Anything odd (a stuck spinner, a message you didn't expect, a photo that didn't show): note the step and the time.

## 2026-10-04 · M2b CP0 + CP2 code: Vercel Blob storage and nightly backup (branch `m2b-storage`, owner Step 55)

- **Storage approved (owner):** Vercel Blob for staging (public images store, private backups store) and `@vercel/blob` (2.8.0, in `apps/web`). Local dev keeps the local driver; production → R2 in M11. Decision #54.
- **CP0 driver `vercel-blob`** (`apps/web/server/storage.ts`): upload URL locked to the server-chosen key, type and size, **10 minutes** (delegation token and URL both carry the limits; no random suffix, no overwrite); `get()` for the byte check, `del()` for deletions, public CDN URLs from `STORAGE_PUBLIC_BASE_URL`. All drivers now expire upload URLs after 10 minutes. `.env.example` documents the staging variables.
- **CP2 nightly backup** (`.github/workflows/backup-staging.yml`, `apps/web/scripts/backup/`): `pg_dump` 18 → `pg_restore --list` → gpg AES-256 (decryption checked before the plain dump is removed) → private store `staging/oda-staging-<UTC>.dump.gpg` → delete backups older than 14 days; the log lists kept and deleted files. Restore steps are in the workflow's header comment. The restore drill comes after the first real backup (download size given first).
- **Tests:** Blob driver 3 (exact presign options incl. 10 min, path, type, size, no overwrite; signing key not returned; read/missing/delete; config errors; local driver also 10 min); retention 5 (14-day boundary both sides, the newest and just-uploaded file are never deleted, non-backup files ignored, empty store). Totals: web 190, seller 57, shared 164, db 23, ui-tokens 3.
- **Checks:** format, lint, typecheck, tests. Slip: I started the four checks in one batch and, with format:check moved to the background, they ran in parallel; under that load (plus two busy bookflow Expo web servers on ports 8099/8100, left alone) 3 seller and 3 web password-hash tests timed out at 5 s and one seller test saw attempts out of order. Re-run one at a time: seller 57/57, web 190/190.
- **Nothing has run against staging** (owner: wait until the dashboard setup is done).

**Blob operations per month (staging estimate, Hobby: 2,000 advanced, 10,000 simple, 1 GB, 10 GB transfer)**

| What | Advanced | Simple |
|---|---|---|
| Product photo: 2 PUTs (full + thumbnail); logo: 1 | 2 per photo | – |
| Byte/EXIF check: `get()` of each new file (always a cache miss) | – | 2 per photo |
| Signed-token issue per upload (not listed as a billed operation in Vercel's pricing; counted to be safe) | (2 per photo) | – |
| Shop pages: first view of each image (later views are cache hits, free) | – | ≤ 2 per photo |
| Deletes (replaced photos, rejected files, old backups) | free | – |
| Backup: 1 PUT + 1 `list` per night | 60 | – |
| Dashboard browsing (counts as advanced) | ~50 | – |

At 300 photos a month (heavy hand testing): 710–1,310 advanced (limit 2,000) and ≤ 1,200 simple (limit 10,000); storage ≈ 300 × 350 KB ≈ 105 MB plus 14 backups of a few MB each (limit 1 GB). The limit allows about 470 photos a month if token issues count (about 940 if they don't). If Blob hits a limit it stops for 30 days (no charge): uploads would then fail on staging. Check the Blob usage page after the first week.

**Carried forward (new):** production object storage on Cloudflare R2 (M11), replacing Vercel Blob; the M8 purge must also sweep unreferenced keys (picked but never saved photos).

**Next:** owner does the dashboard setup (Step 54 list) and says when it's complete; then a first upload on staging, a manual backup run, the restore drill, and review stop B.

## 2026-10-04 · PR #11 merged; app 0.2.0 built on EAS; storage proposal (owner Steps 53–54)

- **expo-doctor can't download any more:** `expo-doctor` 1.20.4 is an exact dev dependency of `apps/seller`; the `doctor` script and CI's Expo doctor step run it through pnpm (`fc3094c`). CLAUDE.md notes it, and native modules are added with `pnpm exec expo install`.
- **PR #11 merged** (`97d9812`) after green CI: main CI passed, `migrate-staging` migrated Neon staging (`0004_storage_deletions`), deployed, and `/api/health` shows `{"ok":true,"db":"up","commit":"97d9812"}`. Staging has no storage driver yet, so photo uploads answer "Photo uploads aren't switched on yet" until CP0 (expected).
- **EAS build 0.2.0** (preview profile, APK, cloud, arm64-v8a): build `b22e1133-bc90-4961-b44d-71c13a0214e1`, commit `97d9812`, channel `preview`, runtime `0.2.0`, version code 1 (installs over 0.1.0). From now on `pnpm update:preview` publishes to runtime 0.2.0; the 0.1.0 build stops receiving updates.
  - Build page: https://expo.dev/accounts/dennisxenonxavier/projects/oda/builds/b22e1133-bc90-4961-b44d-71c13a0214e1
  - APK: https://expo.dev/artifacts/eas/S5abHonyOfgsyRAIj1hW0lJNrjI0_oCVVRsijOTUxZo.apk
- **Storage decision (owner, Step 54): no card on Cloudflare.** Proposed **Vercel Blob (Hobby)** for staging: a public store for images and a private one for backups (blocked, never charged, at the free limit; public CDN URLs; presigned PUT with content type and size enforced; one new dependency `@vercel/blob`; backups deleted after 14 days by the workflow). Backblaze B2 was compared: card-free and S3-compatible, but a public bucket needs payment history or a card fee, so images would need a proxy route. Production still goes to R2 in M11. Waiting for the owner's approval; **CP0 not started**.
- **Checks** (one at a time): expo-doctor 21/21, `deps:check`, format, lint; CI on the PR and on `main`.
- Slip: the `eas build` command's output was filtered through `grep` to hide the eas-cli upgrade notice (the build started and finished fine). Not repeated.

**Next:** owner installs the 0.2.0 APK (steps 1–3 can be tried on staging; step 4 needs CP0, and steps 5–6 come after it) and approves the storage proposal; then CP0 + CP2 and review stop B.

## 2026-10-04 · M2b CP1, CP4, CP5 done; stopped before the 0.2.0 EAS build and CP0 (branch `m2b-onboarding`, PR #11)

- **Review stop A answers (owner, Step 52):** photo required on step 4; size presets (decision #52); 60 link checks/min; option A (CP0 storage just before review stop B, after the owner's Cloudflare card decision); 0.2.0 native modules approved; EXIF: reject only location data.
- **CP1 uploads** (`923b510`, decision #52): storage interface (local / s3 / disabled), `POST /api/uploads`, server byte checks (real JPEG/PNG/WebP matching the key, ≤ 5 MB, no GPS in EXIF (JPEG, PNG, WebP) or XMP; orientation-only EXIF accepted), replaced photos/logos queued in `storage_deletions` (migration `0004`) and deleted. Tests: uploads 19, image checks 16 (fixtures for each format: GPS rejected, none accepted, orientation-only accepted), onboarding updated (photo replace deletes the old objects).
- **CP4/CP5 screens** (decision #53): onboarding steps 09–14 under `apps/seller/app/onboarding/` (what-you-sell, where-you-sell, name-shop, first-product, payment, live), shared pieces in `src/ui/onboarding.tsx` (navy header with back, Skip on steps 1–2, 6-segment progress; choice cards, check rows, chips), state and submit hooks in `src/onboarding/useOnboarding.ts`, words/icons/error wording in `src/onboarding/labels.ts`. Photos: camera or gallery, re-encoded on the phone and uploaded at once (`src/onboarding/photos.ts`, `nativePhotos.ts`). Step 6: link + Copy, share buttons from the seller's channels with `?s=` tags, EN/SW post with "Try another", 7-item checklist, "Test your WhatsApp link", Done → complete. The start gate now opens the step reached; finished sellers get the placeholder (shop name + link) until M6. The shared field gained a prefix (`+254`, `KSh`) and a label hint ("Optional").
- **0.2.0 prepared** (CP5): `version` 0.2.0, the 8 native modules from Step 52 installed with `pnpm exec expo install`, image-picker permission texts, `native-runtime.json` rewritten. `deps:check` green; expo-doctor 21/21; Android bundle exported (`pnpm exec expo export`, 5 MB Hermes bundle).
- **Tests:** web 182, shared 164 (share links/buttons/captions 6), seller 57 (steps ↔ screens, size chips, photo re-encoding: never the picked file, full + thumbnail, uploads off, failed upload, logo; start gate to the reached step; error wording), db 23, ui-tokens 3.
- **Checks** (one at a time): format, lint, typecheck, tests, `deps:check`, expo-doctor, Android bundle.

**Design comparison (from the code; not yet seen on a phone, that's review stop B)**
- All steps: progress = step number (decision #32); lowercase "oda" in step 5's subtitle; icons are Material Community line icons close to the images (TikTok uses a music note, Status a ring).
- 11: the link domain comes from config; "Checking your link…" while typing; a taken link shows the reason and up to 3 suggestions; Edit opens a link field; once a logo is set, "remove it" appears. The flag is a simplified three-band flag.
- 12: before a photo there's an "Add a cover photo" tile (camera or gallery); extra photos show as a row of thumbnails with ×; "+ Other" opens an inline size field; fashion presets are XS–XXL + Free size (the image shows S–XL).
- 13: wording from design-changes ("M-Pesa till checked by oda", Skip line); Paybill adds "Account number buyers enter: a fixed number / the order number" (not in the image).
- 14: no "See what buyers see" (#41 b); the checklist has 7 items ("x of 7"), help text and a button only on the two items that can be done here; share buttons follow the seller's channels.

**Open / carried forward**
- **Staging has no bucket yet** (`STORAGE_DRIVER` unset → uploads answer 503 "Photo uploads aren't switched on yet"): step 4 can't be finished on staging until CP0. The owner decides on the Cloudflare card first.
- Photos uploaded but never saved (picked, then removed or retaken before "Add product", or an abandoned onboarding) aren't referenced by any row: the M8 purge must also sweep unreferenced keys under `products/` and `logos/`, not only `storage_deletions`.
- The local `expo-doctor` script runs `npx expo-doctor@1`, which fetched expo-doctor 1.20.4 (a few MB) into the npx cache this time.
- The Supabase stacks `bookflow` and `dashboardx-local` are running again (they restarted with Docker); left as they are.

**Next:** owner: approve starting the 0.2.0 EAS build (preview profile) and decide on the Cloudflare card; then CP0 + CP2, review stop B.

## 2026-10-04 · M2b CP3 onboarding API, at review stop A (branch `m2b-onboarding`)

- PR #10 (M2a gate docs) merged (`babb927`). M2b plan approved with changes (decision #51): order CP3 → review stop A → CP1 → CP4 → CP5 → review stop B → CP0 + CP2 → hand test → gate; storage behind one interface; EXIF stripping with a test and byte-checked file types; `r2.dev` staging only.
- **CP3 built** (decision #51): `packages/shared/src/onboarding.ts` (step inputs, the six channels from #41, size presets per business type, the 7-item "Finish your shop" checklist), `apps/web/server/repos/onboarding.ts` (scoped to the user / their shop; steps move forward only; redo updates instead of duplicating), `apps/web/server/onboardingRoutes.ts` and 8 routes under `/api/onboarding`. `shops.channels` now validated against the six values; seed updated (`tt`/`wa`/`ig` → `tiktok`/`whatsapp`/`instagram`).
- **Tests:** onboarding API 26 (draft and resume via `/api/me`, Skip values, going back, bad values and extra fields write nothing, link check incl. another shop's current and old link, own link free, reserved, rate limit, shop creation from the draft, link clash 409, no duplicate shop, product with ordered photos and replace-on-redo, photo keys only under the seller's own prefix (403), payment pending/active, replace-on-redo, Skip → pay on delivery, step order 409, server-owned fields 422, checklist + complete, writes closed after completion, 401 anon, 404 without a shop, seller isolation); shared onboarding 10. Totals: web 147, shared 157, seller 45, db 23, ui-tokens 3; Playwright 6.
- **Fixed on the way:** the "30 sign-up starts per IP" test ran 31 real password hashes and hit Vitest's 5 s limit under load (its leftovers then broke the cleanup test); it now prefills the counter.
- **Checks** (one at a time): format, lint, typecheck, tests, web build, Playwright, root check, `db:reset` (migration + seed).
- **Carried forward (new):** production images on a custom domain instead of `r2.dev` (M11).

**Next:** review stop A (owner), then CP1 uploads with the local storage driver.

## 2026-10-04 · M2a gate passed, tag `m2a-done`

**Owner's phone retest A–E passed**; the M2a hand test (1–18) is complete after the fixes.

**Safe EAS updates (decision #50):** `pnpm update:preview "What changed"` always publishes from `apps/seller` (`apps/seller/scripts/eas-update.mjs`), needs a message, and refuses to run, or fails, when `app.json`/`app.config.*`/`eas.json` exist at the repo root; CI step **No stray Expo files at the repo root** (`scripts/check-repo-root.mjs`). Tested: clean root passes, a stray `app.json` fails, the update script refuses with it or without a message. CLAUDE.md Commands updated.

**PR #9 merged** (`0ea9631`): CI → `migrate-staging` → deploy hook → `/api/health` `{"ok":true,"db":"up","commit":"0ea9631"}`. No app code changed since the last EAS Update (only the update script), so no new update.

**Gate (milestones.md M2, auth parts + definition of done):**

- ✅ CI green: PR #9 and `main` `0ea9631` (lint, typecheck, tests, web build, Playwright, Expo checks, root check, staging migrate install); `migrate-staging` success.
- ✅ Unit + authorization tests: web 121 (auth flows incl. rate limits, lockout, reset, origin plugin, IP header, no secrets in logs; sign-up attempts 18 incl. takeover, cross-attempt code, races, cleanup, limits, HMAC), seller 45 (start gate, offline/timeouts, session after the code, attempt resume), shared 147, db 23, ui-tokens 3.
- ✅ Playwright for the web reset pages: 6 (reset end to end through the emailed link, expired/made-up/query tokens, no referrer, local outbox).
- ✅ Screens compared with the designs: web 07/08 and emails 04/06 at review stop A (Playwright/rendered screenshots); app 01–05, forgot password and placeholder on the Redmi by the owner (m2a-preview-1 check, hand test). Agreed differences: no Google/Facebook buttons; Poppins and brand colours everywhere; sentence case; labels above fields; password rules listed under the field (app + web); 6-digit code (email image shows 8); lowercase "oda"; no social icons or "Contact us" in emails; 06 has a button + plain link; 08 brand-green tick, "Open oda app" and the laptop line; new screens (forgot password, "link expired", placeholder, offline/error states); welcome card per the approved preview (Nairobi · Kilimani, product tiles, no badge, tick on the baseline, ring visible from the start as in the preview); "Finish signing up" state; main button pinned above the keyboard, terms/links hidden while typing.
- ✅ Staging deployed with real Resend email: `mail.oda.mugu-labs.com` verified; the owner received codes and reset links on staging during the hand test.
- ✅ Phone test on the Redmi via EAS: build `e21b8131` + updates `d40eb07a`, `ed5a8506`, `ee61fb7a`; 1–18 and A–E passed (owner).
- ✅ progress.md updated (this entry).
- **Tag `m2a-done`** on `0ea9631`, pushed.

**Carried forward:**

- Terms / Privacy links on sign up open `/terms` and `/privacy`, which 404 until M4.
- Vercel CLI logged in on the laptop as `dennismugu7-6048` and `apps/web/.vercel` linked: `vercel logout` before M11 (or when no longer needed).
- `.wslconfig` (12 GB cap, gradual reclaim) proposed, not applied.
- Supabase stacks `bookflow` and `dashboardx-local` stopped (data kept); restart with `supabase start` in `C:/Users/denni/projects/bookflow`, and in the folder holding dashboardx-local's `supabase/config.toml` (not found under `~/projects`).
- npx cache folder from the accidental Expo download (322 MB) can be deleted: `%LocalAppData%/npm-cache/_npx/249ca9fcd30c476a`.
- M8: `/api/cron/purge` must also delete `signup_attempts` older than 7 days (only the lazy cleanup runs now).
- M10: automated UI tests (jest-expo/Maestro) for keyboard/scroll/announce behaviour, now checked by hand only.
- M11: release builds add `armeabi-v7a` (#23); production keystore and EAS environment; production Neon project; Resend production key.
- eas-cli 24.8.0 installed (24.10.0 available; not upgraded: no downloads without asking).
- Staging holds the owner's hand-test accounts (disposable).

**Next:** M2b plan for the owner's approval (not started).

## 2026-10-04 · Retest passed; form messages no longer hidden behind the keyboard (branch `m2a-followup-2`, PR #9)

- **Owner's retest of 3, 4, 7, 8, 10, 18: passed.** One issue: on Sign in a wrong password (and "You're offline…") showed behind the keyboard.
- **Fix (Step 49, app-only JS, `4927793`):**
  1. Every submit (sign up, sign in, forgot password, the code, Resend) closes the keyboard first.
  2. Form-level messages use one component, `FormMessage` (`src/ui/auth.tsx`): it scrolls itself into view whenever it appears or its text changes (after the keyboard has closed and the view has grown), for errors and info ("We sent you a new code.").
  3. Announced by screen readers: `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"`.
  - Fields now report blur, so a closing keyboard doesn't scroll back to the last field over a new message. Field-level errors still stay in view with the focused field (Step 47, fix 1). The code screen no longer re-opens the keyboard over its own error (tap the boxes to type again) and closes it when the attempt has expired.
- **Checks** (one at a time): format, lint, typecheck, tests (web 121, seller 45, shared 147, db 23, ui-tokens 3), `deps:check`, Android bundle (`pnpm exec expo`). No new automated test for the scroll/announce behaviour: it's React Native UI (no jest-expo until M10, decision #40), checked by the owner on the phone.
- **EAS Update published:** `preview`, runtime 0.1.0, update group `ee61fb7a-d50a-475f-9f59-2831304d02c7`. The first publish attempt failed ("EAS project not configured") and left an empty `app.json` at the repo root (that attempt apparently didn't start in `apps/seller`); the file was removed and the retry, from `apps/seller` with the real config, succeeded (its commit shows `*` only because of that stray file).

**Next:** owner checks the messages on the phone; then the M2a gate.

## 2026-10-04 · Fix 2 built (sign-up attempts), PR #8 merged, EAS Update published (branch `m2a-followup-2`)

- **Design approved with changes** (owner): no user row until the code is entered; attempt id in SecureStore; row lock on verify; HMAC-SHA256 codes; lazy cleanup; all limits kept. Built as decision #49 (`apps/web/server/signup.ts`, `signup_attempts`, migration `0003_signup_attempts`, `/api/signup/start|resend|verify`; app `src/auth/signup.ts`, code screen, start gate resume). Better Auth's sign-up and email-OTP endpoints and plugin removed.
- **Not through Better Auth's internal adapter:** it runs its own transaction and can't hold our locks, so the account is inserted directly in the verify transaction, mirroring Better Auth's own sign-up (user + `credential` account, password hashed by Better Auth's configured hasher via `auth.$context`) plus the profile; a test signs in through Better Auth with the result.
- **One behaviour adjusted while testing:** a successful verify deletes only its own attempt (not every attempt for the email), so a racing or later attempt for the same email always gets "This email already has a shop. Sign in?" and is deleted when used (your race rule), instead of sometimes "expired" depending on timing.
- **Tests:** web 121 (sign-up 18: takeover, cross-attempt code, two-attempt race and same-attempt race, resume from the same phone with the newest password, forgot password on a mid-sign-up email sends nothing, cleanup incl. batches, all limits, HMAC storage, expiry; race tests run 3× clean), seller 45 (sign-up on the phone 8: killed app resumes on the code screen, resume vs new attempt, cleared on verify/expiry/sign-out, password never stored, offline), shared 147, db 23, ui-tokens 3; Playwright 6. Format, lint, typecheck, web build, `deps:check`, Android bundle (`pnpm exec expo`), `db:reset` (migration + seed) — each run on its own.
- **PR #8 merged** (`e61c31b`): CI → `migrate-staging` → deploy hook → `/api/health` `{"ok":true,"db":"up","commit":"e61c31b"}`. Staging smoke without sending email: bad email 422, weak password 422, unknown attempt 404, Better Auth `sign-up/email` and `email-otp/verify-email` 404.
- **EAS Update published** after the deploy (the update needs the new routes): `preview`, runtime 0.1.0, update group `ed5a8506-e91e-412c-bd24-6cf2cdf6c422`, commit `b704b14`.
- Supabase stacks `bookflow` and `dashboardx-local` still stopped (data kept).

**Next:** owner retests test 4 (and the sign-up flow) on the Redmi; fixes go on `m2a-followup-2`.

## 2026-10-04 · Phone test fixes 1, 3, 4, 5 shipped as EAS Update; fix 2 proposed (branch `m2a-eas-preview`, PR #8)

Owner's phone test of build `e21b8131` on staging: passed 1, 2, 5, 6, 9–17. Fixes (all app-side JS, `bfe7e90`):
1. **Keyboard covered the password rules.** `AuthScreen` now pins the main button in a footer above the keyboard (`KeyboardAvoidingView` with `padding` on Android too: Android draws edge to edge, so the window no longer shrinks); the focused field, its error and its rules scroll into view (`revealOffset`, 5 tests); terms and links (`note`) hide while the keyboard is open. All four auth screens.
3. **Correct code → Welcome.** Cause (confirmed by a test with the real Better Auth Expo client, React Native mocked): the verify call stores the session cookie, but Better Auth's session atom only refreshes ~10 ms later in a timer; the start gate read the atom right away, saw "signed out" and went to Welcome. Signing in afterwards worked because the atom had refreshed by then. Fix: the gate reads the stored cookie and asks `GET /api/me` (`src/auth/start.ts`), never the atom. Tests (`session.test.ts`, 4): cookie stored before `verifyEmail` resolves; gate → placeholder (and the atom is still empty at that moment, which is what broke the old gate); still signed in after a simulated kill/reopen; no session → Welcome; a session the server rejects is removed from SecureStore. Not reproduced end to end on staging from the laptop (needs a real mailbox for the code); the client side was reproduced with staging-shaped responses (`__Secure-` cookie).
4. **Endless spinner offline.** Every API call goes through `guardedCall`/`authCall`: network check first (`expo-network`) → "You're offline. Check your connection and try again."; 15 s timeout or a thrown network error → "Couldn't reach oda. Try again."; it never throws. The start gate has its own 20 s limit and offline/unreachable/error screens with Try again. `signOutLocal` clears the stored session even without network. Tests (`call.test.ts`, 7).
5. **"Incorrect email or password. Try again."** replaces the old wording (only in the app; the web's "The passwords don't match." compares the two new-password fields and stays).

**Checks:** format, lint, typecheck, tests (web 118, seller 37, shared 147, db 23, ui-tokens 3), `deps:check` (native runtime unchanged for 0.1.0), Android bundle (4.7 MB) — each run on its own after a parallel run caused the incident below.
**EAS Update published** to `preview` (runtime 0.1.0, update group `d40eb07a-c312-41c8-bf5d-95bfb1006943`, staging URLs from the EAS `preview` environment, bundle checked): https://expo.dev/accounts/dennisxenonxavier/projects/oda/updates/d40eb07a-c312-41c8-bf5d-95bfb1006943

**Incident (download rule broken again):** checks were run in parallel; `npx expo export` didn't find the local Expo CLI (most likely while `expo install --check` was rewriting packages at the same moment) and installed `expo@57.0.26` from npm into the npx cache (283 packages, 322 MB on disk, est. 80–110 MB downloaded over the hotspot). From now on checks run strictly one after another, and Expo commands use `pnpm exec expo …` (never `npx`, which falls back to downloading). The two earlier unexplained `deps:check` exit 1s were probably the same overlap. The npx cache folder can be deleted (`%LocalAppData%
pm-cache\_npx9ca9fcd30c476a`).

**Fix 2 (sign-up after going back from the code screen): design proposed, not built** (waiting for the owner's OK; needs a migration).

**Next:** owner retests 3, 4, 7, 8, 10, 18 after the update; decision on fix 2.

## 2026-10-03 · M2a merged to staging; phone testing moves to EAS preview + EAS Update (branch `m2a-eas-preview`, draft PR #8)

- **Local route stopped** (owner): no more local Gradle builds or wireless adb for review stop B. The local debug build never finished; it downloaded ~391 MB (entry below). The phone still has `m2a-preview-1` installed.
- **PR #7 merged** (`2ae5ad8`, CI green). CI on `main` → `migrate-staging` → Deploy Hook → `/api/health` = `{"ok":true,"db":"up","commit":"2ae5ad8"}`. Staging smoke (no email sent): `/api/auth/get-session` 200, `/dev/outbox` 404, `/reset-password` 200, `/api/me` 401 without a session, blocked Better Auth endpoint 404.
- **EAS Update** (decision #47): `expo-updates` 57.0.24 via `npx expo install` (pnpm reused its store, nothing downloaded); updates URL; channels `preview`/`development`; preview builds arm64-v8a only; `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SHOP_BASE_URL` = `https://oda-eta.vercel.app` as plain-text EAS variables in the `preview` environment; `pnpm --filter @oda/seller update:preview -m "…"`. `eas whoami`: `dennisxenonxavier` (already logged in).
- **Runtime version:** fingerprint first; build `849248cb` failed because laptop and EAS fingerprints differ (pnpm folder names on Windows vs Linux, 292 path-only differences). Switched to **appVersion** with a CI guard (decision #48, `check-native-runtime.mjs` in `deps:check`, `native-runtime.json` snapshot; failure path tested). Runtime version `0.1.0`.
- **CLAUDE.md:** no network downloads (Gradle, npm/pnpm, Docker images, NDK) without asking first with a size estimate.
- Second EAS preview build `e21b8131` (upload 17.3 MB, commit `3f903f3`, app version / runtime 0.1.0, build 1): **finished**, APK 44.9 MB: https://expo.dev/accounts/dennisxenonxavier/projects/oda/builds/e21b8131-ff13-41a2-8149-f8b63fda883a. Channel `preview` active, branch `preview`, no update published yet.
- Checks: format, lint, typecheck, seller tests, `deps:check` (incl. the new guard), expo-doctor 21/21.
- **Phone install note:** the EAS build is signed with EAS's keystore, the installed `m2a-preview-1` with the local debug keystore, so Android refuses to install over it: uninstall oda first.
- Supabase stacks `bookflow` and `dashboardx-local` still stopped (data kept).

**Next:** owner installs the EAS preview build and runs the phone test against staging (real emails via Resend); fixes go in PR #8.

## 2026-10-03 · Review stop B: dev build paused after an unexpected ~391 MB download (branch `m2a-auth`)

- Redmi connected over wireless debugging (`172.16.160.1:43691`, paired by the owner): model 25078RA3EA, arm64-v8a, 720×1600 @ 320 dpi. `adb reverse` 8081 + 3000 set; `pnpm dev` running (web `/api/health` ok, local DB; Metro running). App `.env.local` → `http://localhost:3000`.
- Free RAM 15.2 GB → debug build with `-Dorg.gradle.workers.max=4` (command line only), arm64-v8a.
- First try `--offline` (to avoid hotspot downloads) failed: `androidx.lifecycle:lifecycle-extensions:2.2.0` and `io.github.lukmccall:radix-ui-colors:1.0.1` not cached. Claude judged that small and went online without asking. **Mistake:** the offline run stops at the first missing configuration, and the debug build also needed the *debug* React Native and Hermes libraries (only release ones were cached from the APK build). Before the build was stopped (on seeing them), `react-android-0.86.3-debug.aar` (279 MB) and `hermes-android-250829098.0.17-debug.aar` (112 MB) had fully downloaded, plus ~400 small `.pom`/`.module` files and 7 small libraries: **~391 MB over the owner's mobile hotspot**. Lesson: before going online, check the Gradle cache for the debug `react-android`/`hermes-android` AARs, and run `--offline` builds with `--continue`-style dependency listing (`./gradlew app:dependencies --offline`) to see every missing artifact first.
- Build stopped (no Gradle process left). Nothing installed yet. Everything big is now cached; resuming should only need small files. Waiting for the owner's go.
- Supabase stacks `bookflow` and `dashboardx-local` still stopped (data kept).

## 2026-10-03 · Review stop B prep: RAM freed, phone not paired yet (branch `m2a-auth`)

- Pairing the Redmi failed twice (`adb pair 172.16.160.1:39079` → `protocol fault`, also after restarting adb; `adb connect 172.16.160.1:42089` failed). Waiting for new pairing details.
- Owner-approved: `supabase stop` (default, data kept) for `bookflow` (from its folder) and `dashboardx-local` (no folder under `~/projects`; stopped with `--project-id dashboardx-local`). Both reported `backup: true`; volumes kept; only `oda-postgres` runs. **Both stacks stay stopped until the owner restarts them.**
- Owner-approved: `sync; echo 3 > /proc/sys/vm/drop_caches` in the `docker-desktop` WSL distro (no container stopped). Free RAM 3.8 → 5.2 (stacks stopped) → **14.5 GB** 3 min after dropping the cache; `vmmemWSL` 13.7 → 3.6 GB.
- Build rule for this run (owner): ≥ 8 GB free → build with `-Dorg.gradle.workers.max=4` on the command line (no change to `~/.gradle/gradle.properties`). Not built yet: waiting for the phone.
- Proposed (not applied): a `%UserProfile%\.wslconfig` capping WSL at 12 GB with gradual memory reclaim (WSL 2.7.11 supports it); applying needs Docker Desktop quit + `wsl --shutdown`.

## 2026-10-03 · CP3 complete; review stop B paused (low RAM) (branch `m2a-auth`)

- **CP3 complete.** Owner removed Preview from `BETTER_AUTH_URL`. `vercel env ls` (names/types/environments only): `BETTER_AUTH_SECRET` Secret (Preview) + Secret (Production); `BETTER_AUTH_URL` Config (Production); `EMAIL_FROM` Config (Preview, Production); `RESEND_API_KEY` Secret (Production) + Secret (Preview); `DATABASE_URL` Secret (Production, Preview); `ENABLE_EXPERIMENTAL_COREPACK` Secret (Production, Preview). Previews now build reset links from their own URL (`authBaseUrl()`).
- **Review stop B not started:** free RAM 3.8 of 31.7 GB, under the owner's ~10 GB limit for a native build with Docker running. Largest user: the WSL VM behind Docker Desktop (`vmmemWSL`, 13.7 GB), running 25 containers, mostly the `bookflow` and `dashboardx-local` Supabase stacks (another project); Chrome 4.1 GB. Nothing was stopped (owner: don't quit Docker). The owner's message also still had the placeholder `<IP:PORT>` instead of the Redmi's address. Laptop LAN IP: 172.16.160.236 (Wi-Fi).
- No build, no deployment, PR #7 not merged.

## 2026-10-03 · Owner: skip the Vercel CLI login (arrived after the secrets were set)

- The owner asked to stop the CLI login attempts and set `BETTER_AUTH_SECRET` (Production + Preview) themselves in the dashboard. By then the third device code had been approved and both values were already set (entry below). No `vercel login` (or any Vercel CLI) process is running (checked).
- **CP3 env: done**, including `BETTER_AUTH_SECRET` (Production and Preview, separate values). If the owner prefers values they generated themselves, overwriting them in the dashboard before review stop B is fine; sessions signed with the old value just end once.
- The CLI stays logged in on the laptop (`dennismugu7-6048`); `vercel logout` removes that if wanted.
- No deployment, PR #7 not merged.

## 2026-10-03 · CP3 env done (Resend verified, Vercel env vars set) (branch `m2a-auth`)

- **Owner:** Resend domain `mail.oda.mugu-labs.com` verified (DKIM + 2 CNAMEs via Cloudflare auto-configure); in Vercel: `RESEND_API_KEY` (Secret, Production + Preview), `EMAIL_FROM` (Config, Production + Preview), `BETTER_AUTH_URL` = `https://oda-eta.vercel.app` (Config).
- **Claude:** Vercel CLI 62.2.0 installed globally and logged in as `dennismugu7-6048` (device login approved by the owner; two earlier codes expired after their 10 minutes). `apps/web` linked to the existing project `oda` (scope `dennismugu7-6048s-projects`, no new project). `BETTER_AUTH_SECRET` added as **Secret**, with **different values for Production and Preview** (all preview branches): each generated by `openssl rand -base64 48`, `
` stripped, piped through stdin into `vercel env add … --sensitive`; never printed, logged or written to a file. (The first Production value kept a stray `
` from Windows `openssl`; it was replaced with `--force` by a clean new value.)
- `vercel link` also wrote a `VERCEL_OIDC_TOKEN` into `apps/web/.env.local` (removed; the app doesn't use it) and created `apps/web/.gitignore` with `.vercel` and `.env*`; it now holds only `.vercel`, because `.env*` also matched the tracked `.env.example` and the root `.gitignore` already covers env files.
- `vercel env ls` (names/types/environments only): `BETTER_AUTH_SECRET` Secret (Preview) and Secret (Production); `BETTER_AUTH_URL` Config (Preview, Production); `EMAIL_FROM` Config (Preview, Production); `RESEND_API_KEY` Secret (Production) and Secret (Preview); `DATABASE_URL` Secret (Production, Preview); `ENABLE_EXPERIMENTAL_COREPACK` Secret (Production, Preview).
- **Open question:** `BETTER_AUTH_URL` is set on Preview too (planned: Production only). With it, a Preview deployment's reset emails link to `https://oda-eta.vercel.app` instead of the preview's own URL. Both share the staging DB, so links still work; removing it from Preview makes previews use their own URL (`authBaseUrl()`).
- No deployment, PR #7 not merged.

**Next:** review stop B (dev build on the Redmi), the hand test, then the M2a gate (merge → staging deploy → real sign-up email on staging).

## 2026-10-03 · Redmi check of m2a-preview-1: passed, two input fixes (branch `m2a-auth`)

**Owner's phone check passed:** animation, ring, tick on the baseline, Remove animations, form errors, offline/error state. Two fixes:
1. **Placeholders sat ~8 dp above centre** in every text field (typed text was fine). Fixed once in the shared field (`apps/seller/src/ui/auth.tsx`): no `lineHeight` on the TextInput, `includeFontPadding: false`, `textAlignVertical: 'center'`, `paddingVertical: 0`, stretched to a fixed 52 dp box. The focus border grows inwards (padding compensated), so typed text, placeholder and the eye icon stay on one centre line.
2. **Password placeholder** on sign up is now "At least 8 characters". The app's sign-up screen didn't list the rules yet (only the web reset page did), so a rules list now sits under the field and ticks as you type ("At least 8 characters", "At least one number"). One shared `passwordChecks()` in `@oda/shared` feeds both the app and the web page (2 new tests).

**Checks:** format, lint, typecheck, tests (web 118, seller 21, shared 147, db 23, ui-tokens 3), web build, Playwright 6, Metro Android export: all green. No new APK (owner checks both at review stop B on the dev build).

## 2026-10-03 · Owner away: ring as in the preview, preview APK m2a-preview-1 (branch `m2a-auth`)

- **Ring (owner):** matches the approved preview: it sits on the food tile at 0.9 opacity from the start (fading in with the card), then expands to 1.6 and fades at 1320–1920 ms. `design-changes.md` and the timeline test updated (`4835d1c`). Checks green: format, lint, typecheck, tests (web 118, seller 21, shared 145, db 23, ui-tokens 3).
- **Preview APK:** free RAM 12.7 of 31.7 GB before the build (Docker left running, as asked). `expo prebuild --clean` (new native modules) then `gradlew assembleRelease --no-daemon` with `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_SHOP_BASE_URL` = `https://oda-eta.vercel.app` in the build's environment: BUILD SUCCESSFUL in 16 m 28 s, no memory trouble. APK 43 MB, `lib/arm64-v8a` only, debug-keystore signed; the bundle contains the staging URL (the one `localhost:3000` string is the unused fallback in `config.ts`). Published as pre-release **m2a-preview-1** on `4835d1c`: https://github.com/dennismugu7/oda/releases/tag/m2a-preview-1 (notes: visual check only; sign in / sign up show an error because the auth API isn't on staging yet).
- **BETTER_AUTH_SECRET:** not set. The Vercel CLI isn't installed on the laptop, so this waits for the owner (CP3 steps, part D).
- PR #7 not merged.

**Next (owner):** look at m2a-preview-1 on the Redmi (welcome animation side by side with the preview, Remove animations, sign-up/sign-in layouts); CP3 Resend + DNS + Vercel env vars. Then review stop B with a dev build against the local server, and the hand test.

## 2026-10-03 · M2a CP5 welcome card + animation in code (branch `m2a-auth`)

- `app/welcome.tsx` rebuilt from the approved preview's measurements: "Nairobi · Kilimani", three product tiles (`#FBE3DA` / `#FBF0D2` / `#E2F1E8`, images at max 78%), no badge; Poppins 800 for the logo and headline like the preview; the green tick is an inline view inside the "oda" text, so it sits on the baseline like a full stop.
- Animation: one UI-thread clock (0 → 2850 ms, `withTiming`, linear) and every element sampled from the preview's own keyframes, offsets and easing curves (`src/welcome/timeline.ts`, worklets): card spring with tilt (0–650), finger glide + press (700–1450), tile press/pop + pre-rendered warm glow (1300–2000), orange ring (1320–1920), order card bounce (1550–2250), headline (2250–2850). Only transform and opacity animate; no JS timers; buttons work from the first frame. `useReducedMotion()` → the final state at once.
- Pre-rendered images: `dot@3x.png` (the board's dot grid, tiled; replaces ~500 views) and `glow@3x.png` (the tile's warm glow; only its opacity animates).
- Tests: timeline 9 (curves against a brute-force reference, the five windows, start hidden, final state, spring overshoot, finger press 0.78, tile 0.92 → 1.06, ring 1 → 1.6, order bounce −8 / +3). Seller total 21. Lint, typecheck, Metro Android export green.
- **Question for the owner:** in the preview the orange ring is visible on the food tile from the start until 1.32 s (a side effect of the preview's backwards fill), but design-changes.md describes it only expanding at 1320–1920 ms. Built as the text says (hidden until 1.32 s).
- **Not yet seen on a device.** Review stop B needs a dev build on the Redmi (Gradle, Docker Desktop quit) and screenshots.

## 2026-10-03 · M2a CP3 started, CP4 app auth screens in code (branch `m2a-auth`, draft PR #7)

**CP3 (Resend + DNS):** owner steps sent (Resend domain `mail.oda.mugu-labs.com` in eu-west-1, click/open tracking off, Cloudflare MX/SPF/DKIM/DMARC records DNS only, API key `oda-staging`, Vercel env vars with a separate `BETTER_AUTH_SECRET` per environment, generated with `node … | clip`). Code: auth links use a Preview's own URL when `BETTER_AUTH_URL` is unset; Production fails loudly without it (tests). Waiting for the owner.

**CP4 (app):**
- Better Auth Expo client (cookie in SecureStore, `expo-origin: oda://`), `fetchMe()` for `GET /api/me`. Decision #46.
- Screens: start gate (`/`: session → `/api/me` → Welcome / code screen / placeholder; offline and error states with Try again), Welcome buttons wired (+ an "API: local · localhost:3000" label in dev builds), 02 sign up, 03 code (6 boxes on one real input so paste/autofill work, auto-submit, 60 s countdown that also follows the server's `retryAfter`, spam hint), 05 sign in (unverified → code screen with a fresh code), forgot password (new; neutral "Check your email" state), placeholder `/start` with Sign out.
- Friendly wording for Better Auth errors; server-worded messages (rate limits, password rules, existing email + Sign in link) shown as they are.
- `apps/seller/.env.example` (and the local `.env.local`) default to `http://localhost:3000` for the Redmi over `adb reverse`.
- Checks: seller Vitest 12, typecheck, lint, `deps:check`, expo-doctor 21/21, Metro Android export bundles (3.7 MB). **Not yet run on a device**: the new native modules need a dev build on the Redmi (hand-test stop).

**Known gaps:** the Terms / Privacy links on sign up open `/terms` and `/privacy`, which are built in M4 (404 until then). The welcome card and animation are CP5.

**Tests:** web 118, seller 12, shared 145, db 23, ui-tokens 3; Playwright 6.

**Next:** CP5 welcome card + animation + tick fix; then review stop B (Redmi screenshots), which needs the phone connected and a dev build (Docker Desktop quit during the Gradle build).

## 2026-10-03 · M2a review stop A approved; owner's changes done (branch `m2a-auth`, draft PR #7)

**Review stop A: approved** (screenshots, and #44's fetch to Resend, oda:// origin plugin, direct reset link), with changes, all done (decision #45):
- Per-IP limits: sign-in 100 per 15 min, sign-ups 30 per hour; per-email limits unchanged.
- Client IP only from `x-vercel-forwarded-for` / `x-real-ip`, never `x-forwarded-for` (unit test).
- Lock message "Too many tries. Wait 15 minutes or reset your password."; forgot password works while locked and a reset clears the lock (test).
- Origin tests: `oda://` accepted; a made-up Origin, a made-up `expo-origin`, `expo-origin` trying to override a real Origin, and a browser request with cookies but no Origin are rejected.
- Resend: 10 s timeout, redacted errors, clear `[email] <kind> → @domain failed: …` log, plain text alongside HTML (tests).
- 08: "Or open the oda app on your phone and sign in."
- No secrets in logs: emails logged by kind + domain only; a test runs sign-up → wrong code → code → wrong password → reset and checks no code, token or password appears in any console output. **The reset token moved to the URL fragment** (`/reset-password#token=…`), because Vercel logs request URLs including query strings; the page reads it in the browser, clears it from the address bar and checks it with `POST /api/reset-password/check`. CLAUDE.md rule added.

**Tests:** web 114, shared 145, db 23, ui-tokens 3; Playwright 6. Format, lint, typecheck, build green.

**Next:** CP3 Resend + DNS (owner steps sent), CP4 app auth screens in parallel.

## 2026-10-03 · M2a CP1–CP2, at review stop A (branch `m2a-auth`)

**Done**
- M2 plan approved; decisions #40–#43 recorded (split, onboarding answers, private R2 buckets, auth/email rules); `data-model.md` File storage, session and onboarding wording; `milestones.md` M2 split.
- CP1 server auth (`apps/web/server/auth.ts`): `/api/auth` with 8 allowlisted endpoints, 6-digit email code (10 min, 3 tries, hashed), verification required, auto sign-in after the code, 60-day sessions renewed daily, reset revokes every session, Postgres rate limits, friendly existing-email message, neutral forgot password. Emails 04/06 (`server/email/`), Resend via `fetch`, local file outbox at `/dev/outbox` (404 on Vercel). `GET /api/me` (onboarding step to resume, shop). Shared rules in `@oda/shared` (`auth.ts`). Decision #44.
- CP2 web pages `/reset-password` (07) and `/reset-password/done` (08) + Playwright.

**Tests:** web 99 (auth flows 30, email/outbox 16), shared 145 (auth 9), db 23, ui-tokens 3; Playwright 6 (reset end to end, expired/made-up token, no referrer, local outbox). Format, lint, typecheck green.

**Design comparison (07, 08)**
- Same structure: wordmark + "Your free shop link" on grey, white band, two fields with eye icons, orange pill button; 08 tick circle, title, two lines.
- Differences, on purpose: Poppins everywhere (the images mix fonts); sentence case ("Choose a new password", "Password changed!"); labels above the fields instead of placeholders (accessibility); the password rules listed under the field and ticking as you type; 08 tick is brand green (image: orange, design-changes.md); 08 adds "Open oda app" (`oda://sign-in`) and one line saying every phone was signed out; new "This link has expired" state.
- Emails: 6-digit code (image: 8), lowercase "oda", no social icons or "Contact us" (decision #43), button + plain link in 06 (image: a text link).

**Deviations**
- `resend` SDK not used (REST via `fetch`); `@better-auth/expo` not installed in the web app (small origin plugin instead). Decision #44.
- `/api/me` shipped in CP1 (planned with CP4) because the tests needed it.

**Next:** review stop A (owner), then CP3 Resend + DNS (owner steps) in parallel with CP4 app screens.

## 2026-10-03 · M1 closed; staging migration fix

- PR #4 merged as `78423e0`, tag `m1-done`.
- First `migrate-staging` run after the merge failed at Migrate (`Cannot find package 'zod'`): the reduced install skipped `@oda/shared`'s dependencies. Nothing migrated or deployed; staging stayed on `5eb5d31`.
- Fix (decision #39): install with `--filter "@oda/db..."`, plus a CI job that runs the same install and migration on a clean runner. Reproduced and verified locally in a clean worktree.
- PR #5 merged as `25d0739`. CI green (incl. the new **Staging migrate install** job, "migrations applied"). `migrate-staging` run 37096082312: Migrate 04:18:36–04:19:01 UTC → Deploy Hook 04:19:06 → `/api/health` showed `25d0739` at 04:20:09. Vercel's Production deployment was created at 04:19:59, after the migration. The M1 merge `78423e0` has no deployment at all (automatic `main` deployments are off), so the race fix holds.
- Neon staging checked by the owner: 24 tables in `public`, 3 rows in `drizzle.__drizzle_migrations`, 0 shops.
- **M1 closed** (tag `m1-done` on `78423e0`; staging fix `25d0739`).
- **Next:** M2 (Seller auth & onboarding), starting with a short plan for approval.

## 2026-10-02 · M1 checkpoints 4–5, at review stop B (branch `m1-database-security`, draft PR #4)

**Done**
- Laptop now 32 GB: `~/.gradle/gradle.properties` → `-Xmx6g`, `workers.max=6`, `parallel=true` (owner's correction), other keys kept; decision #35 (amends #29/#30). Low-memory stop stays on. Health check after the restart: Docker + `oda-postgres` up, branch clean, the four checks green.
- CP4 authorization layer: write whitelists (`packages/shared/src/schemas`), `errors.ts`, `authz.ts` (branded contexts, missing-profile repair), `uploads.ts`, repositories (user, seller, public, order-token, admin), ESLint guard on `@oda/db`/`drizzle-orm`/`pg` outside `apps/web/server/**` (also the seller app, shared, ui-tokens). 24 authorization tests.
- CP5 `apps/web/server/orders.ts`: `nextOrderNumber()`, `insertOrder()` (prices, fees, payment-account snapshot and cover from the DB; idempotency key; shop rules), `transitionOrder()` (scoped load, machine, optimistic update → 409, events, payment claims, duplicate-code flag). 23 tests incl. the confirm/confirm and cancel/confirm races and concurrent numbering.
- Both suites were mutation-checked: removing the shop filter or the status condition makes them fail.

**Deviations**
- Paused shops stay browsable (`isPaused`, spec §6); only suspended/deleted shops are not found.
- Order `status` is server-owned on every schema except products (their own `status`).
- Validation limits chosen (to confirm): Till/Paybill 5–7 digits, Pochi stored in E.164, price ≥ KSh 1, shop name 2–40 chars; channel values open until M2.
- Lines for products with sizes/colours must name one; manual orders may use sold-out products and pickup even when pickup is off.

**Review stop B: approved** with changes (decision #36): pay on delivery on; 13 products (earrings in a visible Accessories, new Leather tote); history on soft-deleted older stock; order numbers follow the 126 deliveries.

**CP6 seed** (`apps/web/server/seed/`, through Better Auth, the repositories, `insertOrder()` and `transitionOrder()`): `pnpm db:reset` builds 13 products, 142 orders, 126 delivered, 38 reviews (33/3/1/1 → 4.76, shown 4.8, 2 need a reply), 42 customers; to-do 2 to confirm / 4 to send / 3 new; this week KSh 18,250 from 6 sales, 12 orders of which 8 TikTok; sold counts 5/3/2/4; a duplicate M-Pesa code, refund_due, refunded, expired, buyer- and seller-cancelled and an unresolved claim. Fixed on the way: the shop checklist update failed when nothing was unticked (new test).

**CP7 (code ready, waiting for the secret):** `apps/web/vercel.json` stops automatic `main` deployments; `migrate-staging` runs after green CI on `main`: migrate → Deploy Hook → wait for `/api/health` to show the commit (decision #37); CLAUDE.md migration rule (backward compatible, expand → deploy → contract).

Secret `VERCEL_DEPLOY_HOOK_STAGING` added by the owner (confirmed with `gh secret list`). The flow is proven by the M1 merge itself.

**CP8** `scripts/setup-android-windows.ps1` (`pnpm setup:android`, `-Check` to only report): ninja 1.12+ in CMake 3.22.1 (installs CMake 3.31.6 if needed, keeps the old ninja), Gradle limits from RAM (≥ 30 GB visible → `-Xmx6g`, 6 workers, parallel; else the #29 values; other lines kept, `.bak` written), long paths reported. On this laptop: everything in place (31.7 GB → 32 GB tier, Gradle file unchanged); ninja deliberately reverted to 1.10.2 → `-Check` exit 1 → repaired to 1.12.1 → re-run all OK; Gradle repair tested on a scratch `GRADLE_USER_HOME`.

**CP9 docs:** milestones.md (M1 status, M4 staging demo seed note), data-model.md (where the authorization layer and order functions live), CLAUDE.md Commands (seed logins, `setup:android`, migrate-then-deploy) and the migration rule.

**M1 gate review: passed** (decision #38): customers list = buyers with a sale (changed and tested); cancel reason not note, and the deleted-shop order page, recorded for M5; `decisions.md` strictly append-only. Owner's hand test in Drizzle Studio passed.

**Next:** merge PR #4, tag `m1-done`. After the merge: confirm migrate → Deploy Hook → `/api/health` shows the merge commit, and Neon staging has all tables.

## 2026-10-01 · M1 Database & security: checkpoints 1–3, at review stop A (branch `m1-database-security`, draft PR #4)

**Done**
- CP1 `packages/shared`: order state machine (every transition in order-lifecycle.md, exhaustive sweep of 3,640 combinations), pricing, Kenyan phones, M-Pesa code extraction (all-letters codes accepted), slugs. Decision #33.
- CP2 schema `0001`: all 20 data-model tables + Better Auth's 4 (`auth_*`, uuid), enums, constraints, indexes. Better Auth 1.7.6 server core in apps/web (email + password, bearer sessions, profile hook). Tests run on throwaway databases created and migrated automatically (also in CI): `oda_test` for apps/web, `oda_db_test` for packages/db. They are separate because Turbo runs both suites in parallel; sharing one caused migration races.
- CP3 `0002`: updated_at, status guard, sale aggregates, ratings, payment-verification reset, slug history/guards, same-shop composite foreign keys, `rate_limit_hit()`. Decision #34; data-model.md aligned.

**Deviations**
- `better-auth` 1.7.6, not 1.7.7 (pnpm's release-age guard; 1.7.7 is under a day old).
- Auth schema verified by a test against Better Auth's `getSchema()` instead of the CLI (the CLI can't load a config that imports `server-only`).
- Added beyond the plan: same-shop composite foreign keys (decision #34 f).

**Review stop A: approved** by the owner, including decision #34 (c)–(j), the Better Auth 1.7.6 pin and `unverified` as the default payment-account status.

**Next:** CP4 authorization layer (after the owner's go-ahead; the laptop is getting a RAM upgrade, 16 → 32 GB).

**Change to CP8:** `scripts/setup-android-windows.ps1` sizes the Gradle limits from the detected RAM instead of hardcoding them: at 16 GB today's values (`-Xmx2560m`, `workers.max=1`); at 32 GB e.g. `-Xmx4g`, `workers.max=3`. It prints the chosen tier, and decisions #23/#29/#30 get updated with the RAM-based rule.

## 2026-10-01 · Approved welcome animation added for M2 (branch `design/welcome-animation`)

- Owner-approved assets added (owner's request; `design/` is otherwise read-only): `design/app/welcome-animation/01-welcome-animation-preview.html` (exact reference for timing, feel and card content) and three transparent PNGs (fashion 360×290, food 360×304, accessories 360×214), also copied to `apps/seller/assets/welcome/` for the app. Checked before copying: the preview contains "Nairobi · Kilimani" and no "M-Pesa till checked"; the PNGs are RGBA with transparent corners at the expected sizes; the preview embeds the same three images (scaled to 240 px wide).
- `design-changes.md`: 01-welcome section replaced by the approved spec (card content, 5-step choreography ~2.85 s, reduce-motion = final state, smooth on the Redmi 15c). `milestones.md` M2 acceptance: side-by-side check against the preview on the Redmi 15c.
- Not built yet (M2). One implementation note added to keep it smooth: the tile's glow is an opacity/scale-animated layer, not an animated shadow.

## 2026-10-01 · M0 closed

- PR #1 merged into `main` as `e24fd42` (merge commit); annotated tag **`m0-done`**. CI green on `main`.
- `migrate-staging`, first run on `e24fd42`: success, "migrations applied". Neon staging now holds the M0 baseline only (`drizzle.__drizzle_migrations`, 1 row; the baseline is `SELECT 1`, tables arrive in M1). Owner can confirm in the Neon console.
- **Production (staging) web: https://oda-eta.vercel.app**, public. `/api/health` → `{"ok":true,"db":"up","commit":"e24fd42"}` (owner + curl), home page 200. Region confirmed: `X-Vercel-Id: cpt1::fra1::…` (edge Cape Town, function Frankfurt next to Neon). Recorded in CLAUDE.md → Commands.
- Gate outcomes (decision #31) and the answers to the 18 open doc questions (decision #32) recorded; spec.md, design-changes.md, order-lifecycle.md, milestones.md (M0 status closed; Firebase in M6) and CLAUDE.md (pricing path, env names, source-of-truth rule) updated.
- **Next:** M1 (Database & security), not started; it begins with a short plan for approval.

## 2026-10-01 · M0 Foundations: complete, ready for the gate review (branch `m0-foundations`, PR #1)

**Acceptance (milestones.md M0)**
- `pnpm dev` runs web + app locally: **pass**. Web 200, `/api/health` `db: up`, Metro running and serving the Android bundle (6.4 MB). Not yet exercised: a dev-client build on the phone loading from Metro (the device check used release APKs).
- Web staging URL shows the placeholder in Poppins and brand colours: **pass** on the Preview deployment https://oda-git-m0-foundations-dennismugu7-6048s-projects.vercel.app (owner's check: Poppins, brand orange, peach card, both buttons; `/api/health` `db: up` against Neon). The public Production deployment only exists after the merge.
- App opens on Android showing the welcome screen (static): **pass**. Pre-release `m0-preview-2` on the Redmi 15c (owner's check): matches design 01 closely; "oda · now" fully visible; splash wordmark and tick inside Android 12+'s circular safe zone.
- CI green: **pass**, `467d162` (format, lint, typecheck, migrate, unit tests, web build, Playwright smoke, Expo SDK dependency check, expo-doctor).

**Done today (after the machine crash)**
- Recovery check: no repo damage; `oda-postgres` restarted; all checks green.
- EAS build `8add4aac` failure explained and fixed: auto-installed Reanimated 4.7.0 vs the forced Worklets 0.10.1. Reanimated, Worklets and Gesture Handler are now direct deps at SDK 57 versions; Worklets override removed; new CI step `deps:check` catches transitive mismatches (#24).
- Android builds moved from EAS cloud to local Gradle (#23), EAS kept as fallback. Windows build fixes: NDK 27.1 reinstalled (the crashed build had left it empty); ninja 1.12.1 for paths over 260 characters (#28); memory limits 2560m heap, 1 worker, Kotlin in-process (#29, #30). APKs are published as GitHub pre-releases (`m0-preview-1`, `m0-preview-2`).
- Postgres 18 everywhere to match Neon (#25). Neon `oda-staging` (Frankfurt). Vercel project `oda` (root `apps/web`, Node 24.x, `fra1`, corepack on for Production + Preview); Production and Preview share the staging DB until M11 (#26). Workflow `migrate-staging` with secret `NEON_STAGING_DATABASE_URL_UNPOOLED` (#27).
- Welcome screen fixes from the device check: clipped "oda · now" label; splash `imageWidth` 200 → 160 dp (farthest pixel 0.293 of the canvas vs 0.333 safe radius, measured inside the APK).
- Dev-loop fixes: `oda-postgres` restarts with Docker; `pnpm dev:stop`; Expo's generated `expo-env.d.ts` excluded from Prettier.
- Docs: CLAUDE.md Commands (local APK build, wireless debugging, `deps:check`, `dev:stop`, staging migrations) and a Working-style rule against hiding check exit codes; design-changes.md + M2 acceptance for the animated welcome illustration and the tick-on-baseline fix.

**Deviations**
- No EAS cloud build; the device check used locally built release APKs signed with the debug keystore (testing only).
- R2 staging bucket moved to M2 (#22).
- Postgres 18 instead of 17 (#25).

**Carried forward**
- On merge: first `migrate-staging` run (Neon has no tables until then); check the public Production `/api/health` and confirm `fra1` from the `x-vercel-id` header.
- `PUBLIC_SHOP_BASE_URL` not set in Vercel (not used before M4).
- Before M1's tables are used on staging: Vercel deploys and `migrate-staging` run in parallel (#27).
- M2: welcome animation; green tick on the "oda" baseline; Sign in / Create new shop wired; first dev-client build with Metro on the phone.
- M11: release builds add `armeabi-v7a` (#23) and a real signing key; production Neon project on Postgres 18.
- `packages/shared` holds only money formatting; state machine, pricing, phone and slug utils are M1 scope.

**Gate review (owner): M0 passed.** Outcomes in decision #31: backup + R2 check moved to M2; preview URL accepted for M0 (Production checked after merge); one EAS cloud build in M2; M1 adds the Android setup script and the migrate/deploy race fix. `milestones.md` updated.

**Open questions**
- Doc ambiguities from the M0 plan (§10): the owner answers them before M2.

**Next:** merge PR #1, tag `m0-done`, check `migrate-staging`, Neon and the Production deployment; then M1.

## 2026-09-30 · M0 Foundations (in progress, branch `m0-foundations`, PR #1)

**Done**
- pnpm 12 + Turborepo workspace: `apps/web`, `apps/seller`, `packages/shared`, `packages/ui-tokens`, `packages/db`. Strict TS 6, ESLint 9, Prettier, Vitest 5, Playwright 1.63.
- `@oda/ui-tokens`: colours, type, radii, sizes measured from `design/` (method + sample coordinates in `packages/ui-tokens/README.md`); Tailwind 4 theme generated from the same file, with a drift test.
- `@oda/db`: Drizzle 0.45 + `pg`, migration pipeline (baseline migration only; tables are M1), Docker Postgres 17 on port 5442 with an extra `oda_test` database. `pnpm db:reset` rebuilds from zero.
- `apps/web`: Next 16 + Tailwind 4, Poppins, placeholder page, `/api/health` (`select 1`; 503 when the DB is down, verified). Playwright smoke at 390×844 checks the font, brand colour and health.
- `apps/seller`: Expo SDK 57 + Expo Router, Android only, light only, Poppins; static welcome screen (01); adaptive icon, icon and splash generated from `design/app/app-icon.png`; `eas.json` with development + preview profiles. expo-doctor 21/21. Metro bundles for Android with pnpm's isolated layout.
- `pnpm dev` starts web (3000) and Metro (8081) together (verified).
- GitHub repo `dennismugu7/oda` (private), CI workflow (format, lint, typecheck, migrate, tests, web build, Playwright, expo-doctor).
- CLAUDE.md Commands filled in; decisions 17–21 appended.

**Deviations**
- ESLint 9, not 10 (Next's lint plugins don't support 10 yet).
- Local Postgres on port 5442: a native Postgres already listens on 127.0.0.1:5433 on this machine.
- Welcome screen: "Payment checked" chip → "M-Pesa till checked", "KES 2,500" → "KSh 2,500" (plan Q4 default). Buttons are static until M2.
- Web spacing uses Tailwind's numeric 4px scale instead of named tokens (named ones collide with `max-w-md` etc.; decision 19).
- Playwright saves a screenshot for design comparison instead of a pixel baseline (font rendering differs between Windows and CI Linux).

**Design comparison**
- Web placeholder: no design exists for it (landing page is M4); it uses the tokens and matches the brand in 01-welcome/web 01.
- Welcome (01): pending the Android run.

**Open**
- Staging: Neon `oda-staging`, Vercel project, Expo account / `eas init`.
- Android run: EAS cloud development build (the local Gradle build was stopped when the machine ran low on memory; not retried).
- Cloudflare R2 bucket `oda-staging` is deferred to M2, where uploads first need it.
- Doc ambiguities listed in the M0 plan (§10) still need answers before M2–M8.

## 2026-09-30 · Planning complete
- Spec, lifecycle, data model, design changes, milestones and decisions written.
- Backend switched from Supabase to Neon + Better Auth + Cloudflare R2 (decision 16).
- Next: M0 Foundations.
