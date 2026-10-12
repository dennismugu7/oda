# Release 0.5.0: merge plan for the whole stack (#109 → #116)

**Status:** plan for the owner's review (review stop D, 2026-10-12). Nothing merged yet.
**Owner decisions it follows:**
- Release 0.5.0 goes out as release APKs. `main` takes the whole stack in order once everything is done; there is no split (decision #110 Q8, superseded in `progress.md`).
- Every PR merges only after all its checks have passed (owner Step 83/84).
- release-production runs only on the owner's go (#95).

## The stack

Each PR's base is the one before it. This repo merges with merge commits and doesn't delete branches on merge, so after each merge the next PR is retargeted to `main` by hand.

| # | Branch | What | Decision |
|---|---|---|---|
| #109 | `google-signin-app` | Google sign-in in the app; **version 0.5.0** (new native module, new runtime) | #107 |
| #110 | `google-signin-tiktok-logo` | TikTok's official icon in the app; the file also under `apps/web/public/brands/` | #108 |
| #111 | `app-fixes-1` | ConfirmSheet; Kenya's flag (app + web checkout); the shared ordering rule, `/api/home` `ordering.blockers`, the Home banner | #109, #110 h |
| #112 | `optional-delivery-plan` | `docs/optional-delivery-plan.md` only | #110 |
| #113 | `optional-delivery-cp1` | **Migration 0010** (`fulfilment` + `arranged`); the ordering rule without delivery; arranged checkout / quote / manual orders; emails, push, WhatsApp texts; the old-app mapping (`X-Oda-App-Features`); decision #110 | #110 |
| #114 | `optional-delivery-cp2` | Buyer web: checkout, order page, pay page, shop / product / cart, privacy text | #110 |
| #115 | `optional-delivery-cp3` | Seller app: arranged orders, Mark as sent, New order, Delivery "optional", the checklist tap; `/api/delivery` `arrangeDelivery` | #110 |
| #116 | `optional-delivery-cp4` | Demo seed (10th sample, arranged); staging regression for the stack; docs (this plan) | #110 |

## Before the first merge (owner)

1. **The 0.5.0 release APK** for testers is the trigger for merging #109: once `main` is 0.5.0, 0.4.0 installs stop getting JS updates (#107 plan rule). The APK must carry the JS of the whole stack. Either:
   - build it from `main` after #116, or
   - build earlier and send the rest by EAS Update to runtime 0.5.0.

   Each native build and each EAS Update needs your go. Claude starts neither.
2. **Google sign-in configuration (#107):** on staging, the server's `GOOGLE_WEB_CLIENT_ID` (Vercel `oda`) and the app's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (EAS environment for the APK). Without them the Google button stays hidden and the endpoint answers "off". Check by name only.
3. Nothing else has to be set before merging. The Resend key below is needed only for staging-regression.

## Merge order, and what to check on staging after each

For each PR, in order:
1. Retarget it to `main` (`gh pr edit <n> --base main`), so its diff is only its own commits.
2. Mark it ready, wait for every check to finish and pass, then merge (merge commit).
3. Wait for **migrate-staging**: CI on `main`, then the migration, then the staging deploy.
4. Check that https://oda-eta.vercel.app/api/health shows the merge commit.

| After merging | Check on staging | Expected |
|---|---|---|
| #109 | `/api/health` shows the commit; migrate-staging green | No web change (the Google sign-in server is already on `main`, #108). `main` is now 0.5.0: JS updates go to runtime 0.5.0 only. |
| #110 | `https://oda-eta.vercel.app/brands/tiktok-icon-black-circle.png` | 200, the PNG (18,423 bytes). |
| #111 | Checkout of a shop with an area: the phone field | Kenya's whole flag before +254 (20 × 15). A staging shop with **no** delivery option still shows "Not taking orders yet" here: the old rule, until #113. |
| #112 | none (docs only) | none |
| #113 | migrate-staging's log: "migrations applied" (0010) | The `fulfilment` enum has `arranged`. A shop with no delivery option now counts as taking orders, but the **browser checkout** for it can't place the order until #114. So **merge #114 straight after** (a staging-only window of minutes). |
| #114 | A staging shop with no area and pickup off (e.g. a fresh test shop): checkout | "The seller will contact you to arrange delivery", optional note, "Not included", an order goes through. Demo Duka's checkout unchanged. |
| #115 | `/api/delivery` (through the app) | It returns `arrangeDelivery`; nothing changes on the web. |
| #116 | Run **Actions → demo-seed-staging** | 10 sample links in the job summary, including "Arranged with the buyer (pay on delivery, ready to collect)". |

## The staging regression

Run it after #116 is merged and deployed, and after demo-seed-staging: step 2.24b needs the new demo sample.

1. You create the Resend key and the GitHub secret (next section). Claude confirms the secret **by name**.
2. Run **Actions → staging-regression** from `main`.
3. The job summary lists every step ✅ / ❌. The manual phone steps (M.1–M.8, including Google sign-in) are printed at the end. Screenshots are kept 7 days. The run deletes and purges its own test accounts.
4. Do the manual phone steps with the 0.5.0 APK (`docs/regression-script.md` → Manual on the phone).
5. Delete the Resend key and the GitHub secret again (#92 b). Claude confirms by name that the secret is gone.

### The Resend key (owner; Claude creates nothing)

The run signs test sellers up on Resend test addresses (`delivered+<run>-a@resend.dev`). It reads their emails back through Resend's API: the sign-up code, the reset link and the delete-account link.

1. **Resend:** sign in to the Resend account that sends staging's emails, the same one that holds staging's own sending key; emails can only be read with a key from the account that sent them. Go to **API Keys → Create API key**:
   - **Name:** `oda-staging-regression`.
   - **Permission:** **Full access**. Reading emails (`GET /emails`) needs it; a "Sending access" key can't read. Full access can't be limited to one domain.
2. **GitHub:** go to repository `dennismugu7/oda` → **Settings → Environments → `staging` → Environment secrets → Add environment secret**. Name it **`RESEND_API_KEY`** and paste the key there, never in the chat.
   - Why an environment secret (last time it was a repository secret): staging-regression runs in the `staging` environment, so only `staging` jobs can read it. No other workflow uses a secret with this name.
3. Tell Claude "done". Claude checks with `gh secret list --env staging` (names only).
4. After the run, delete the key in Resend (API Keys → `oda-staging-regression` → Delete), then the environment secret.

The run sends about 5 emails to `@resend.dev` test addresses (two sign-ups and a resent code, the reset link, the delete link). They count toward the Resend quota, but nobody receives them.

## release-production (owner's go, after the regression and the phone steps)

**Actions → release-production** fast-forwards `production` to `main`, migrates `oda-production` and deploys oda-production. What changes on https://oda.mugu-labs.com:

- **Migration 0010:** `ALTER TYPE fulfilment ADD VALUE 'arranged'`.
  - It only adds a value. The running deployment never writes it, so the old code works on the new schema for the moments between migrating and deploying.
  - There is no later contract step.
- **Every production shop that is not paused and has a way to get paid starts taking orders at once, with or without a delivery option.** Today only the owner's test shops are on production (#110 Q9). faraja-styles is one of them: it has Pay now and no delivery option, so it starts taking orders. Its checkout then offers only "The seller will contact you to arrange delivery".
- **Shops that are paused or have no way to get paid** still show "taking a break" or "Not taking orders yet". The seller's Home shows the banner, once the seller has the 0.5.0 app.
- **Buyer web:**
  - the arranged checkout, order page, pay page and receipt;
  - Kenya's flag on checkout;
  - "Delivery arranged with the seller after you order" on the shop and product pages of shops without options;
  - free delivery shown only with an eligible area;
  - the privacy page, "Updated 12 October 2026", which adds the arranged-delivery note.
- **Seller API:**
  - `/api/home` `ordering.blockers`, `/api/delivery` `arrangeDelivery`, the `arrange_delivery` checklist item;
  - "Arrange with buyer" in the manual-order quote;
  - the `new_order` push adds "· Arrange delivery", and buyer emails mention arranged delivery.
- **Old apps:** the 0.4.0 Play install gets arranged orders as a delivery "Arranged with buyer". It shows "Delivery · Free" in its money row, which only the 0.5.0 app fixes.
- **Google sign-in** stays hidden on production until `GOOGLE_WEB_CLIENT_ID` is set on oda-production and in the production app build (#107). That's a separate step.
- **Rollback:** releasing the previous commit is safe. The migration only adds a value, and the older code treats any non-pickup order as a delivery, so arranged orders show as "Delivery" with no area.

After release-production, the production app's JS (0.5.0) goes out by **eas-update-production** or with the Play build, each on your go.
