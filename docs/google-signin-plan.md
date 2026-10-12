# Google sign-in for the seller app: plan (for the owner's approval)

Status: **approved by the owner at review stop A (2026-10-11), decision #107**, with the §7
answers and the additions now in §1.5 (empty name) and §2.2 (time limit). Written 2026-10-11
from `main` at `a0ae70e`.

**Earlier wording.** The Handoff once said "Google sign-in: plan approved" before any plan
existed. This document and decision #107 are the record. #4 ("no social login") and spec §5.1
are amended by #107.

---

## 1. Approach

### 1.1 Recommendation: your approach, with three changes

I agree with the flow: Android's own Google account chooser, an ID token for the **Web** client
ID, and Better Auth's `signIn.social({ provider: 'google', idToken: { token } })` without a
browser redirect. It's the shortest path, it has no web views or deep-link callbacks, and it
leaves the cookie session (#43 e) as it is.

Three changes:

1. **No client secret.** For an ID token, Better Auth (1.7.6) only checks Google's signature,
   issuer and audience (the Web client ID) against Google's public keys. The secret is used only
   by the redirect flow, which we refuse. Storing it would add a secret with nothing to protect.
   If the provider config won't start without one, Claude stops and tells the owner (owner's
   answer 2). Checked in 1.7.6: the secret is required only in `createAuthorizationURL`
   (the redirect flow).
2. **The free "original" library sits on a deprecated Google API.**
   `@react-native-google-signin/google-signin` (free, ~16.1.x) uses the legacy
   `play-services-auth` Google Sign-In for Android. Google has deprecated it in favour of
   Credential Manager. It still works today (the library's own docs and recent issues confirm
   it), but Google announced removal "in 2025" and that date has already slipped once. The
   account chooser in your screenshot ("Choose an account · to continue to oda") is exactly this
   legacy dialog. The library's Credential Manager version ("Universal") is paid.
   **Recommendation:** use the free original API now, but keep every call in one file,
   `src/auth/google.ts` (`googleSignIn(): Promise<{ kind: 'token', idToken } | { kind:
   'cancelled' } | { kind: 'error', code }>`). If Google turns it off, the swap to Credential
   Manager is one file plus a native build, and the screens and server don't change. v2-ideas
   gets a line: "Move Google sign-in to Credential Manager".
3. **Don't opt into Play's post-quantum (beta) app signing.** A recent library issue (#1525)
   reports `DEVELOPER_ERROR` that won't go away with it on.

### 1.2 Server (`apps/web/server/auth.ts`)

- `socialProviders.google`: `clientId` = the Web client ID from env **`GOOGLE_WEB_CLIENT_ID`**
  (server-only name, set by name in Vercel). Without it, the Google route answers 404 and
  everything else works as now, so staging and production don't depend on the owner steps.
  - `mapProfileToUser`: `name: ''` and `image: null`. We don't keep the Google name or photo:
    the seller's name stays what they type in Settings → Your details (minimum data, KDPA).
- `AUTH_ROUTES.POST` adds **only `/sign-in/social`**. `/link-social`, `/callback/:id` and
  `/list-accounts` stay 404.
- Before hook, `/sign-in/social`:
  - Refuse (400 `GOOGLE_ONLY_ID_TOKEN`) unless `provider === 'google'` and
    `idToken.token` is a string (≤ 4 KB).
  - Rebuild the body as `{ provider, idToken: { token } }` only. That drops `accessToken`,
    `refreshToken`, `user`, `callbackURL`, `requestSignUp`, `disableRedirect` and so on (no
    request body spread into the DB; the zod whitelist rule).
  - Per-IP limit `signInPerIp` (the same `signin-ip:` key as email sign-in, 100 per 15 min).
- Google must say the email is verified: the provider's `mapProfileToUser` refuses `email_verified !==
  true` with "Your Google account's email isn't verified. Sign in with your email and password
  instead." (Better Auth already won't *link* an unverified email; this also stops a new account
  from one.)
- **Don't store Google's token:** `databaseHooks.account.create.before` sets `idToken`,
  `accessToken` and `refreshToken` to `null` when `providerId === 'google'`. Better Auth would
  otherwise keep the ID token (name, email, picture URL) in `auth_account`. We only need
  `accountId` (Google's `sub`).
- **New Google user:** Better Auth creates `auth_user` (email verified) and the existing
  `user.create.after` hook runs `ensureProfile`. `requireUser` repairs a missed one as now.
  `/api/me` returns `onboarding.done: false`, so the app routes to onboarding step 1, like an
  email sign-up.
- **Deleted account (#75):** the existing `session.create.before` hook already refuses with
  `ACCOUNT_DELETED`. Linking happens just before that hook, so a deleted account may get a
  Google row. The purge removes it with the user (CP1 test checks the cascade).
- **`/api/me`** gains `hasPassword: boolean` (a `credential` row in `auth_account`) for the
  screens in §1.4.
- **Logs:** Better Auth logs "Invalid id token" with the provider name only (no token). CP1 test:
  a refused token never appears in captured logs, and Sentry's `beforeSend` scrubber already
  drops them: any key containing "token" is removed, and each part of a JWT is masked as an opaque string (CP1 adds a test).

### 1.3 Same email already has an account → link, no duplicate

Better Auth's `handleOAuthUserInfo` finds the user by email and links a `google` account row
when Google says the email is verified and the local user is verified. Every oda account is
verified (#49), and linking is on by default. Result: one `auth_user`, two `auth_account` rows
(`credential` + `google`), same shop, and both sign-in methods work afterwards. A later
email sign-up attempt for that address still gets "This email already has a shop. Sign in?".

Pre-account takeover (#49) stays closed: a Google account can only claim an email Google has
verified. An email sign-up attempt that is pending on another phone never becomes an account
once the email exists (`verify` already answers `HAS_SHOP`). On this phone, a Google success
clears any pending sign-up (`clearPendingSignup`), so the start gate doesn't reopen Verify.

"Sign up with Google" for an email that already has a shop just signs in (no error). "Continue
with Google" for a new email creates the account. Both buttons call the same thing.

### 1.4 Accounts with no password (Google only)

| Screen / flow | Today | For a Google-only account |
| --- | --- | --- |
| Sign in (05) with email + password | Better Auth: `INVALID_EMAIL_OR_PASSWORD` | Same answer, with one generic line added for everyone (no account leak): "Incorrect email or password. If you signed up with Google, use Continue with Google." |
| Forgot password → reset page (07/08) | Emails a reset link | Works unchanged: Better Auth's reset **creates** the `credential` account when it's missing (checked in 1.7.6 source; CP1 test). So a Google seller can add a password by proving the email. |
| Settings → **Change your password** (21) | Needs the current password | Row reads **Set a password** when `hasPassword` is false. The screen says "You sign in with Google. To also sign in with a password, we'll email you a link to set one." with a **Send link** button (the existing request-password-reset, own email, same cooldowns). No new server route. |
| Settings → **Log out** alert | "You'll need your email and password to sign in again." | "You'll need to sign in again with Google." when `hasPassword` is false. |
| Settings → **Delete account** (app) | Type DELETE; no password | Unchanged (session-based). |
| Web `/delete-account` | Email link | Unchanged (the email works for every account). |
| Help guide "Your account" (`guides.ts` + `docs/help-guides.md`, word for word) | "change … your password" | Adds: "If you sign in with Google, **Set a password** emails you a link to add one." |
| Password-changed email | Sent on change | Unchanged (reset sends none today; no change). |

### 1.5 Empty name (owner's addition a)

Google sellers have no name: `auth_user.name` is `''` and `profiles.first_name` / `last_name`
are `null` until they type one in Settings → Your details. That's the same state every email
seller starts in today (oda's sign-up sets `name: ''`, decision #49), so each place below
already copes. Each one gets a Google-seller test anyway.

| Where the seller's name is read | Today with no name | Fix / test |
| --- | --- | --- |
| `auth_user.name` | Never read by oda (only written as `''` at sign-up, and by the seed) | `mapProfileToUser` writes `''`. CP1 test: a Google sign-up leaves `name = ''` and `image = null` |
| `GET /api/home` → `firstName` (`repos/sellerHome.ts`) → Home greeting (`(tabs)/home.tsx`) | `null` → "Good morning" with no ", name" (`name ? \`, ${name}\` : ''`) | No change. CP1: a Google seller's `/api/home` has `firstName: null`. CP2: Home renders the greeting without a comma |
| Settings row "Your details" (`settings/index.tsx`, `displayName`) | Falls back to the email's local part (`amani.styles`) | No change. CP2: shows the email part for a Google seller |
| Settings → Your details header + avatar (`settings/details.tsx`, `displayName` + `initials`) | Email local part; initials from it; `'?'` if empty | No change. CP2: no blank name and no empty avatar |
| Seller emails (code, reset link, password changed, delete-account link, `templates.ts`) | Don't greet by name (no "Hi ,") | No change. CP1 test: every seller email rendered for a Google seller contains no `Hi ,` and no empty name |
| Support digest (`digest.ts`) | Shop names and counts only, no seller names | No change |
| Ops audit (`accountDeletion.ts` → `ops_events`) | Shop slug and shop name only | No change |
| Web (shop pages, link previews, order and review pages) | Show the **shop** name and its initials (`shopAvatar`, `opengraph-image`), never the seller's | No change; the shop name is required at onboarding step 3 |
| Sentry | No user name set (no `setUser`) | No change |
| Buyer names (`firstName()` in `sellerOrders.ts`, WhatsApp texts, buyer emails) | Buyers, not sellers: a buyer name is required at checkout | Out of scope |

---

## 2. UI

### 2.1 Layout (02 sign-up, 05 sign-in)

Same layout as the original design images (which had the Google button), in oda's tokens:
Bricolage/Inter, Phosphor, `Button` sizes and radii.

- **Sign up:** title → **"Sign up with Google"** (full width, white `surface` with a 1 px
  `border`, navy label, the Google "G" on the left) → a thin **"or"** divider (two hairlines
  plus "or" in `textSecondary`) → the existing email + password form and "Create my account".
- **Sign in:** **"Continue with Google"** in the same place, then "or", then the email form.
  Under the Google button: "By continuing, you agree to oda's **Terms** and **Privacy
  notice**." (both are links, same style as sign-up; owner's answer 3), because this button can
  create an account.
- **The "G" mark:** Google's official multicolour "G" SVG, unmodified (no recolouring, no
  outline, correct proportions), as `react-native-svg`, like the WhatsApp glyph rule (#55/#56).
  Follow Google's Sign-in branding guidelines: white button with the standard "G", the label
  "Sign up with Google" / "Continue with Google", oda's font allowed. Source file and its terms
  are noted beside it in the repo.
- Button text and the divider stay visible when the keyboard is open. The email form keeps
  its pinned footer button (#49 layout).

### 2.2 Loading, with no frozen or flashing screen

One state machine per screen (`idle → picking → signing-in → done | error`) in a hook,
`useGoogleSignIn()`, so both screens behave the same and it can be unit-tested.

- **a) Tap.** The Google button shows `Button`'s `loading` spinner straight away (same frame,
  state set before any `await`). Every other control is disabled: email/password fields
  (`editable={false}`), the email button, Forgot password, the switch link and Back. Android
  back is ignored while busy (`BackHandler`). A second tap does nothing.
- **b) Google's sheet** opens over the screen. Our screen stays as it is underneath (button
  spinner on), so nothing flashes when the sheet closes.
- **c) Account picked.** A full-screen overlay on the same screen (`surface` at 96 % opacity,
  `ActivityIndicator` in `primary`, **"Signing you in…"**, `accessibilityLiveRegion`) appears
  as the sheet closes. It stays through:
  1. `authCall(() => authClient.signIn.social({ provider: 'google', idToken: { token } }))`
     (15 s `guardedCall`);
  2. the session cookie stored (Better Auth Expo client, SecureStore);
  3. `fetchMe()` and the same routing as the start gate (`startRoute` / `landing()`), moved
     into a shared `routeAfterSignIn()` that `index.tsx` and email sign-in use too;
  4. **priming the next screen's data** before navigating: `/api/me` into a small in-memory
     cache that `useMe` reads first, plus Home's first request (or the onboarding state for a
     new seller). Steps 3 and 4 **together** are capped at 5 s. If the next screen's data is late,
     we go anyway and that screen shows its own loading state, never blank. If `/api/me`
     itself isn't back, `router.replace('/')` hands over to the start gate, which has its own
     20 s limit and messages.

  **Time limit (owner's addition b):** after an account is picked, nothing waits longer than
  **15 s (the `guardedCall` sign-in call) + 5 s (me + priming) = 20 s**. Before the sheet,
  `hasPlayServices` and the offline check get 3 s each (`withTimeout`). The only wait we don't
  limit is the seller choosing in Google's own sheet, which is theirs to close (case d). A
  jest-expo test with fake timers checks that every hanging stage ends in a message or a
  navigation by 20 s.

  Then `router.replace(target)` (`dismissAll` first, so Welcome isn't left underneath and
  Back doesn't return to it). The overlay is removed only by unmounting the screen, so there's
  no frame of the sign-in form, Welcome or the start gate's wordmark. Email sign-in moves to the
  same `routeAfterSignIn()` (today it does `replace('/')`, which flashes the gate's wordmark
  and spinner). A small extra fix, same PR.
- **d) Sheet cancelled / back pressed** (`statusCodes.SIGN_IN_CANCELLED` / `type: 'cancelled'`):
  back to idle at once. Spinner off, controls enabled, no message.
- **e) Errors:** one `ErrorMessage` on the same screen, the overlay gone and the button usable:

  | Cause | Message |
  | --- | --- |
  | Offline (`OFFLINE`, checked **before** opening the sheet, so we don't pick an account and then fail) | the existing `OFFLINE_MESSAGE` |
  | 15 s timeout / unreachable | the existing `UNREACHABLE_MESSAGE` |
  | Play services missing or too old (`PLAY_SERVICES_NOT_AVAILABLE`) | "Google sign-in needs Google Play services on this phone. Sign in with your email instead." |
  | `IN_PROGRESS` | ignored (a second tap is already blocked) |
  | `DEVELOPER_ERROR` / other native error | "Google sign-in isn't working right now. Sign in with your email instead." (Sentry gets the code, no token) |
  | Server 401 invalid token / link refused | "We couldn't sign you in with Google. Try again or use your email." |
  | Unverified Google email | the §1.2 text |
  | `ACCOUNT_DELETED` | the existing deleted-account text |
  | 429 | the server's "Too many sign-in attempts. Try again in N minutes." |

  After any server error, `GoogleSignin.signOut()` (local only) runs so the next tap shows the
  chooser again instead of silently reusing the last account.
- Signing out of oda also runs `GoogleSignin.signOut()` in `signOutLocal()`, so the next
  sign-in asks which account. That suits shared phones.
- **Build without the env value** (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` unset): the button and the
  "or" divider are hidden, so the screens look as they do now.

### 2.3 jest-expo UI tests (`src/test/screens/google-signin.ui.test.tsx`; the native module mocked)

1. **a:** pressing "Continue with Google" shows the button's busy state before the mocked
   `signIn` resolves; email, password, Continue, Forgot password and "Open your free shop" are
   disabled; a second press doesn't call `signIn` twice.
2. **a (sign-up):** same for "Sign up with Google" and "Create my account".
3. **b/c:** `signIn` resolves with a token → "Signing you in…" is shown while
   `signIn.social` is pending, still shown while `fetchMe` is pending, and `router.replace` is
   called once, only after `fetchMe` and the priming resolve, with the onboarding route for a
   new seller and the Home tab for a finished one. `replace('/')` and `/welcome` are never
   called.
4. **c (no flash):** the sign-in form isn't re-rendered between the overlay appearing and
   `replace` (the overlay stays on screen until navigation).
5. **d:** `signIn` returns `cancelled` → no error text, the button isn't busy, every control
   is enabled, no server call.
6. **e offline:** `isOnline` false → the offline message, `signIn` never called, button enabled.
7. **e timeout:** `signIn.social` never resolves → after the fake-timer 15 s, the unreachable
   message, overlay gone, button enabled.
8. **e Play services:** `hasPlayServices` throws `PLAY_SERVICES_NOT_AVAILABLE` → that message.
9. **e server refusal:** 401 → the message and `GoogleSignin.signOut` called; 403
   `ACCOUNT_DELETED` → the deleted text.
10. **Hidden without config:** no `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` → no Google button, no
    divider.
11. **Settings:** `hasPassword: false` → "Set a password" row and its screen sends the link;
    the Log out text changes. `hasPassword: true` → unchanged.
12. **Email sign-in** now goes through `routeAfterSignIn` (no `replace('/')`).
13. **Time limit:** with fake timers, `signIn.social` hanging ends in the unreachable message
    by 15 s; `fetchMe` or priming hanging ends in navigation by 15 + 5 s; `hasPlayServices`
    hanging ends in a message by 3 s.
14. **Terms line** on Sign in: present, with links to `/terms` and `/privacy`.
15. **Empty name (§1.5):** Home greeting with `firstName: null` has no ", "; Settings and Your
    details show the email part and non-empty initials.

Server tests (Vitest, real Postgres; Google's key check stubbed with a local test key): new user
gets a profile and onboarding; an existing email gets linked (one user, two account rows);
twice in a row makes no new rows; unverified Google email refused; no `idToken` → 400; another
provider → 400; extra body fields dropped; the per-IP limit; no tokens stored in `auth_account`;
deleted account refused; reset on a Google-only account creates a `credential` row; `/api/me`
`hasPassword`; `/callback/google` and `/link-social` still 404; route answers 404 without
`GOOGLE_WEB_CLIENT_ID`. Authorization tests: the new `hasPassword` read is the caller's own only.

### 2.4 As built in CP2 (differences from §2.2, owner to confirm at review stop B)

- **Where the code is:** `src/auth/google.ts` (every native call), `googleFlow.ts` (pure: tap →
  checks → sheet → server → finish, with the time limits), `useGoogleSignIn.ts` (the screen state),
  `afterSignIn.ts` (pure: next screen + preloading, 5 s) and `finishSignIn.ts` (its real calls,
  caches and `router.replace`), `ui/auth.tsx` (`Button` variant `google`, `OrDivider`,
  `SigningInOverlay`, `AuthScreen` `locked` / `overlay`, `Link` `disabled`), `ui/brandIcons.tsx`
  `GoogleMark` (`assets/brands/google-g.svg`).
- **/api/me fails after signing in:** the seller stays on the sign-in screen with one message
  (offline / "Couldn't reach oda" / "You're signed in, but we couldn't open your shop. Try
  again."); nothing navigates. §2.2 said the start gate would take over, but that would show its
  wordmark, which the owner ruled out. Trying again signs in again (a new session).
- **No `dismissAll`:** it would animate back through Welcome (a visible flash). `router.replace`
  alone leaves the stack as email sign-in always has (Welcome under the tabs).
- **Email sign-in** uses the same `finishSignIn` (no more `replace('/')` through the gate), and
  its call is held to 15 s too (`capCall`), so it also ends within 20 s.
- **The only wait without a limit is Google's own sheet**, which waits for the seller (adding a
  new Google account there can take minutes). Before it, the network and Play services checks
  get 3 s each; after it, 15 s + 5 s.
- **Google sign-out** runs in `signOutOnThisPhone` (Log out, delete account), not in
  `signOutLocal`, which stays free of native code for the Vitest logic tests.
- **Set a password** uses `settingsApi`'s `sendPasswordLink` (the reset link). Settings reads
  `hasPassword` from `/api/me`; without an answer it assumes a password.
- **The G mark** is Google's published standard "G" path data (`assets/brands/README.md`); compare
  it with Google's "Sign in with Google" pack before the public launch.

---

## 3. Owner steps (exact clicks; one at a time; values never in chat)

Use the **existing Firebase project's** Google Cloud project, the one behind
`google-services.json`. No new project, and the consent screen has one home. The console's
current names are "Google Auth Platform → Branding / Audience / Clients".

**Step G1: consent screen (branding)**
1. https://console.cloud.google.com → project picker (top left) → pick the oda Firebase project.
2. ☰ → **Google Auth Platform** → **Branding** (if it asks "Get started": App name **oda**, User
   support email **support@mugu-labs.com**, Audience **External**, contact email yours → Create).
3. Branding: App name **oda**, support email **support@mugu-labs.com**. **No logo for now**:
   uploading one starts Google's brand verification, which isn't needed for these scopes.
   App home page `https://oda.mugu-labs.com`, Privacy policy `https://oda.mugu-labs.com/privacy`,
   Terms `https://oda.mugu-labs.com/terms`. Authorised domains: **mugu-labs.com**. Save.
4. **Data access:** add nothing. The default `openid`, `email` and `profile` are non-sensitive,
   so no Google review is needed.
5. **Audience** → **Publish app** → Confirm (status "In production"). In "Testing", only listed
   test users could sign in.

**Step G2: Web client (its ID is the token's audience)**
1. Google Auth Platform → **Clients** → **Create client** → Application type **Web application**,
   Name **oda web (ID tokens)**. No JavaScript origins, no redirect URIs → **Create**.
2. Copy the **Client ID** (it ends `.apps.googleusercontent.com`). It isn't a secret but
   **don't paste it in the chat anyway**. Ignore the client secret: don't download or store it
   (§1.1).

**Step G3: SHA-1 fingerprints (read them, don't send them)**
1. **Upload key:** https://expo.dev → oda → **Credentials** → Android → `com.mugulabs.oda` →
   keystore **wZQg7G2ndc** → **SHA-1 Fingerprint**.
2. **Play app signing key:** Play Console → oda → **Test and release → App integrity** →
   **Play app signing** → *App signing key certificate* → **SHA-1 certificate fingerprint**.
   This is the one that matters for every Play install (Internal, closed, production).
3. **Preview app:** expo.dev → Credentials → Android → `com.mugulabs.oda.preview` → its
   keystore → **SHA-1 Fingerprint**.

**Step G4: Android clients** (Clients → Create client → **Android**, one per line; package name
and SHA-1 exactly as read)
| Name | Package name | SHA-1 |
| --- | --- | --- |
| oda android (Play signing) | `com.mugulabs.oda` | Play app signing key (G3.2) |
| oda android (upload key) | `com.mugulabs.oda` | EAS upload key wZQg7G2ndc (G3.1) |
| oda staging android | `com.mugulabs.oda.preview` | preview keystore (G3.3) |

You don't copy anything from these: Google matches the app by package + signature. If Google
refuses a second client with the same package name, tell me and we'll use the Firebase route
(Firebase → Project settings → the Android app → **Add fingerprint**), which takes several SHA-1s
for one package.

**Step G5: where the Web client ID goes (by name; I verify by name only)**
| Where | Name | Environments |
| --- | --- | --- |
| Vercel project **oda** (staging) → Settings → Environment Variables | `GOOGLE_WEB_CLIENT_ID` | Production + Preview |
| Vercel project **oda-production** | `GOOGLE_WEB_CLIENT_ID` | Production |
| expo.dev → oda → **Environment variables** | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (visibility *Plain text*; it ships inside the app) | `preview` and `production` (and `development` if you want it in dev builds) |

Then redeploy staging (I start migrate-staging, or it happens on the next merge). Production
picks it up with the next release-production. No GitHub secret is needed. One Web client
serves both staging and production: same audience, two servers.

---

## 4. Build impact (only on your go)

- **Native module:** `@react-native-google-signin/google-signin`, added with
  `pnpm exec expo install` from `apps/seller` (npm tarball ≈ 1–2 MB on the laptop; I'll check the
  exact size and that SDK 57's `expo install` accepts it before asking). Its config plugin goes
  in `app.config.ts` `plugins` (Android needs no options; `google-services.json` is already
  wired). Gradle pulls `play-services-auth` on **EAS (cloud)**, not the laptop.
- **Version 0.5.0** (runtime 0.5.0, decision #48): `version` bump +
  `node scripts/check-native-runtime.mjs --write` (new module + changed `appConfigSha256`).
  `deps:check` and expo-doctor have to pass offline.
- **Builds (EAS cloud, after your go, each its own ask):**
  1. **Production AAB** `--profile production` → versionCode **4** (EAS remote counter),
     arm64-v8a + armeabi-v7a. The last one was 52.0 MB; expect ≈ 53–54 MB. Upload to Internal
     testing first (#106), then closed testing.
  2. **Preview APK** `--profile preview` ("oda staging", arm64-v8a). The last was ≈ 45–50 MB.
     Optional: only if you want to try staging with Google before production.
  - Queue: up to ~2 h on the free tier each.
- **Update channels:** EAS Updates follow the runtime. Once `main` is 0.5.0, eas-update-production
  publishes for 0.5.0 and the 0.4.0 testers stop getting JS updates. So, as with 0.3.0 (#70 e),
  **the app branch merges only once the 0.5.0 build exists and goes to testers in the same
  sitting**. The server part (CP1) merges first; it has no app impact.
- **Closed testing:** uploading a new versionCode to the closed track during the 14 days is
  normal; it doesn't restart the 12-tester count.

---

## 5. Docs to change (in the PRs that ship the code)

- **`docs/decisions.md` #107** (new, append-only): "Google sign-in for sellers", amending #4 and
  spec §5.1 "No Google or Facebook sign-in in v1". It records the library and its deprecation
  risk, ID token only, no secret, no Google tokens/name/photo stored, linking by verified email,
  the no-password screens, version 0.5.0, the env names, and that this plan's checkpoints are
  approved. (#4 itself isn't edited.)
- **`docs/spec.md` §5.1:** "Sign in: email + password, or Google (Android account chooser; an
  existing email links)". Remove the "No Google…" line (link to #107). §9: "Google/Facebook
  sign-in" becomes "Facebook sign-in".
- **`docs/design-changes.md`** 02 and 05: "Google button kept (Facebook removed), above an 'or'
  divider; the official G mark; Facebook and 'or continue with' removed" (02), and "'Continue
  with Google' kept, Facebook removed" (05). The screen comments in `sign-up.tsx` /
  `sign-in.tsx` change to match.
- **Privacy policy** (`apps/web/app/privacy/page.tsx`): under "If you sell on oda": "Your email
  and password, **or, if you sign in with Google, your Google account's email and an ID Google
  gives us for it (we don't receive your Google password, contacts or anything else, and we
  don't keep your Google name or photo)**." Processors list: Google already appears (Play); add
  "Google (sign-in)". Changes reach production with the next release. Terms: no change.
- **`docs/play-data-safety.md`:** account creation → **"Username and password"** *and*
  **"OAuth"** (Sign in with Google). Email address row: "from the seller or their Google
  account". No new data type.
- **`docs/help-guides.md` + `guides.ts`:** the §1.4 line (word for word; a test checks).
- **`docs/v2-ideas.md`:** "Move Google sign-in to Credential Manager (if Google removes the
  legacy API)".
- `docs/progress.md` Handoff at each checkpoint; fix the "plan approved" wording once this
  is approved.

---

## 6. Checkpoints and review stops

| CP | What | Ends with |
| --- | --- | --- |
| **CP0** | This plan → your answers → decision #107 + spec/design-changes edits (docs PR) | 🛑 **Review stop A:** you approve the plan |
| **CP1** | Server: provider (env-gated), route, hooks, no tokens stored, `/api/me` `hasPassword`, Sentry key list, server/authz tests; privacy + data-safety text. PR, CI green, merge (staging; button not visible anywhere yet) | you do owner steps G1–G5 (any time from here) |
| **CP2** | App (on a branch, **not merged**): native module install (asks first, size given), `google.ts`, `useGoogleSignIn`, buttons + G mark + divider, overlay, `routeAfterSignIn`, Settings/Log out/Help changes, jest-expo tests §2.3, version 0.5.0, `native-runtime.json`; `check:all` green | 🛑 **Review stop B:** screenshots of both screens in every state (jest render + a dev-build check if you want one) against 02/05; you approve the look |
| **CP3** | On your go: EAS production AAB 0.5.0 (and preview APK if wanted) → Internal testing → phone test list (numbered: new Google seller → onboarding; existing email → same shop; cancel; airplane mode; sign out → chooser again; Set a password; Forgot password for a Google-only account) | 🛑 **Review stop C:** your phone test passes → merge the app PR, eas-update-production only on your go, release-production for the privacy text |

Timing (Handoff): build after the closed-testing review, before the public launch. CP0–CP2 can
run now. CP3 waits for your call.

---

## 7. Owner's answers (review stop A, 2026-10-11)

1. **Library:** the free original library, with every call kept in `src/auth/google.ts`; the
   v2-ideas line is added.
2. **Client secret:** none. If Better Auth won't start the provider without one, Claude stops and
   tells the owner.
3. **Terms on Sign in:** yes: "By continuing, you agree to oda's Terms and Privacy notice."
   (links, sign-up's style).
4. **Google name:** not stored (§1.5 lists every place that reads the seller's name).

Sources on the library's status:
[original API docs](https://react-native-google-signin.github.io/docs/original),
[migration issue #1373](https://github.com/react-native-google-signin/google-signin/issues/1373),
[DEVELOPER_ERROR with post-quantum signing #1525](https://github.com/react-native-google-signin/google-signin/issues/1525).
