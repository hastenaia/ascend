# Ascend — Become better, one phase at a time.

> **Ascend is a phase-based personal development RPG.** Goal → Phase → Milestones → Quests → XP → Skills → Stats → Final Challenge → Phase Complete → Next Phase.  
> _Make users feel like they're developing a character — not filling out another boring habit tracker._

---

## Live Application

**GitHub Pages (`https://hastenaia.github.io/ascend/`) is a documentation landing page — it does NOT host the Next.js app.**

The real Ascend application requires a server (Next.js SSR, Supabase Auth, middleware, server actions, RLS) and is currently live on **Vercel** (you provided `ascend-q3pvbcks0-tigididing.vercel.app` — Netlify was requested but no Netlify deployment was discoverable):

**→ https://ascend-q3pvbcks0-tigididing.vercel.app** _(verified 2026-08-25: renders Next.js, X-Matched-Path /login, login markers found)_

*If you deploy to Netlify, replace above with `https://<your-netlify-domain>.netlify.app`. This Pages site will never use `output: "export"`.*


* This Pages site will never attempt `output: "export"` — that would break `middleware.ts`, `src/lib/supabase/server.ts`, `src/app/auth/callback/route.ts`, and server-side phase/XP logic.*

> **Why not GitHub Pages?** Pages serves only static files. Ascend needs `middleware.ts` session refresh, SSR cookies, protected routes, and Phase 3 `src/lib/phases/actions.ts` server actions.

---

## Deployment — Netlify + Vercel

**Source:** `hastenaia/ascend` · **Branch:** `main` · **Framework:** `Next.js`

`netlify.toml` is now minimal (`command="next build"` only — Netlify auto-detects Next.js 16 Runtime, no `publish`/`plugins` needed). **Actual live host verified is Vercel** `ascend-q3pvbcks0-tigididing.vercel.app` — Netlify is secondary/backup.

**For Netlify (if you deploy there):**
1. Netlify → Add new site → Import `hastenaia/ascend` → Build `next build`.
2. Env vars: `NEXT_PUBLIC_SUPABASE_URL=https://fpspwpmxlnfsegcwqeir.supabase.co` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_f66j5apLYTqJs7IE1vHAlw_ZphpVRTI`
3. Supabase → Auth → URL Configuration: `Site URL: https://<netlify>.netlify.app`, Redirect: `https://<netlify>.netlify.app/auth/callback` + `http://localhost:3000/auth/callback`

**For Vercel (currently live):**
Same 2 env vars in Vercel → Settings → Environment Variables; Supabase Site URL: `https://ascend-q3pvbcks0-tigididing.vercel.app`, Redirect: `https://ascend-q3pvbcks0-tigididing.vercel.app/auth/callback` + `http://localhost:3000/auth/callback`.

---

## Getting Started (local)

```bash
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY
npm run dev                  # http://localhost:3000
npm run build                # must pass before Netlify deploy
npm run lint && npx tsc --noEmit
```

Migrations: `supabase/migrations/0001_ascend_foundation.sql` + `0002_phase_system.sql` → paste into Supabase Dashboard → SQL Editor.

---

## Architecture (Phases 1–3)

* **Phase 1** — Next.js 16 + Tailwind + shadcn + `framer-motion` shell (`src/app/(app)/layout.tsx`, `src/components/layout/*`).
* **Phase 2** — Supabase Auth (email/password + Google OAuth stub), `profiles` + `handle_new_user()` + `ensureProfile()` (`src/lib/supabase/get-profile.ts`), RLS, `phase_templates` global read-only.
* **Phase 3** — `phases` (`locked|available|active|completed|archived`), progress = `completed milestones / total`, `milestones.is_final_challenge`, strict `locked→available→active`, explicit `Start Journey` idempotent, XP = `phase.reward_xp + Σ milestone xp_reward`, `PhaseCard`/`PhaseTimeline`/`PhaseCompleteDialog`.

`GOAL → PHASE → MILESTONES → QUESTS → XP → SKILLS → STATS → FINAL CHALLENGE → COMPLETION → NEXT PHASE`

---

## Security

`.env`, `.env.local`, `.env.*.local` gitignored (`.gitignore:34`). Only `NEXT_PUBLIC_*` in browser. RLS `auth.uid() = user_id`.

---

## Verify after Netlify deploy

Landing → `/auth/login` → `/auth/sign-up` (email confirm ON) → `/auth/callback` → `/dashboard` → `/phase` Start Journey → Foundation `active` rest `locked` → milestones → `Complete Phase` → `+XP` → Foundation `completed` Discipline `available` → `Begin Next Phase` → Discipline `active`. RLS: User A cannot read User B `phases`.

---

## Learn More

* [Next.js Docs](https://nextjs.org/docs) · [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs)

## Deploy on Netlify

`https://app.netlify.com/start` → Import `hastenaia/ascend`. Do not use `output: "export"`.
