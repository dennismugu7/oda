# oda: instructions for Claude Code

oda gives Kenyan social sellers a free shop link. Sellers run their shop from an **Android app**; buyers order through a **mobile web shop**, paying the seller directly on M-Pesa. Read `docs/spec.md` first.

## Source of truth (read before any work)
1. `docs/spec.md`: what we're building
2. `docs/order-lifecycle.md`: order state machine + money rules
3. `docs/data-model.md`: database design
4. `docs/design-changes.md`: screen index + where to deviate from the images (**overrides the images**)
5. `design/app/*.png`, `design/web/*.png`: visual reference. Open the relevant images before building any screen.
6. `docs/milestones.md`: build order + acceptance criteria
7. `docs/decisions.md`: why things are the way they are (append-only)
8. `docs/progress.md`: running log; update it at the end of every task

If these conflict or are unclear, **stop and ask**. Don't guess on product behaviour.

## Stack
pnpm + Turborepo · Expo (Android) · Next.js + Tailwind · Neon Postgres + Drizzle · Better Auth (email + password + email OTP) · Cloudflare R2 (presigned uploads) · Resend · Expo push · Sentry · GitHub Actions (CI, cron, backups) · Vercel · EAS. **No Supabase.** See `docs/decisions.md` #10 and #16.

## Repo layout
```
apps/web        Next.js (App Router) + Tailwind: buyer shop, order pages, /admin, legal pages
apps/seller     Expo (React Native, Expo Router): Android seller app
packages/shared zod schemas, types, pricing, order state machine, phone/money/slug utils
packages/ui-tokens  colours, typography, spacing, radii (shared by web + app)
packages/db      Drizzle schema, migrations, seed (Postgres on Neon; Docker Postgres locally)
design/         screen images (read-only)
docs/           specs (keep updated)
```

## Non-negotiable rules
- **Money** is integer KES. Only `packages/shared/pricing.ts` computes totals, and only on the server from DB prices.
- **Order status** changes only through the shared state machine, run through `transitionOrder()` in Next.js API route handlers (see `docs/data-model.md` → "Where logic runs"). Never a raw status UPDATE anywhere else.
- **The database is server-only.** Every access goes through the authorization layer (`apps/web/server/authz.ts` + shop-scoped repositories), with automated authorization tests. Never spread request bodies into DB writes; whitelist fields with zod.
- **Buyer order access** only via `public_token`. Never expose sequential IDs in URLs.
- **Phones** stored in E.164 (+254…). **Timezone** Africa/Nairobi for any date bucketing.
- **No secrets in git.** Use `.env.local` + `.env.example`. DB URL, R2 keys and auth secrets are server-side only, never in the app bundle.
- **Base shop URL** comes from config (`PUBLIC_SHOP_BASE_URL`). Never hardcode a domain.
- Validate every input with zod at the boundary. Friendly, specific error messages in the UI.
- Every screen handles loading, empty and error states.
- Don't add dependencies casually. Prefer well-maintained, popular packages; note significant ones in `docs/decisions.md`.

## Working style
- Work milestone by milestone (`docs/milestones.md`). Start each task by proposing a short plan, and wait for approval on anything that changes the spec or data model.
- Small, focused commits with clear messages. One milestone = one branch → PR into `main`.
- Write tests alongside code (Vitest for logic, authorization tests against a real Postgres, Playwright for web flows).
- After building a screen, compare it to its design image and list any visible differences.
- End every task by updating `docs/progress.md`: done, deviations, open questions, next step.

## Commands
(Fill these in during M0 and keep them current.)
- `pnpm dev`: …
- `pnpm test`: …
- `pnpm lint` / `pnpm typecheck`: …
- `pnpm db:up` / `pnpm db:reset` / `pnpm db:migrate`: …
