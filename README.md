# Ascend — Become better, one phase at a time.

> **Ascend is a phase-based personal development RPG.** Goal → Phase → Milestones → Quests → XP → Skills → Stats → Final Challenge → Phase Complete → Next Phase.  
> _Make users feel like they're developing a character — not filling out another boring habit tracker._

---

## Live Application

**GitHub Pages (`https://hastenaia.github.io/ascend/`) is a documentation landing page — it does NOT host the Next.js app.**

The real Ascend application requires a server (Next.js SSR, Supabase Auth, middleware, server actions, RLS) and is deployed on **Vercel**:

**→ https://<your-vercel-domain>.vercel.app** _(replace after Vercel import; see Deployment below)_

* After you deploy to Vercel, update this link. Example: `https://ascend-xxx.vercel.app` or `https://ascend.vercel.app`.*
* This Pages site will then automatically redirect/clarify — it will never attempt to run `output: "export"`.*

> **Why not GitHub Pages for the app?** GitHub Pages only serves static files. Ascend needs `middleware.ts`, `src/lib/supabase/server.ts` SSR, `src/app/auth/callback/route.ts`, and server-side XP/phase logic (`src/lib/phases/actions.ts`). Static export would break auth, protected routes, and Phase 3 completion.

---

## Deployment — Vercel (production target)

**Source:** `hastenaia/ascend` · **Branch:** `main` · **Framework:** `Next.js` (auto-detected)

1. **Vercel** → `Add New Project` → Import `hastenaia/ascend` → Framework `Next.js` → Build `npm run build` (default).
2. **Environment variables** (Project → Settings → Environment Variables):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://fpspwpmxlnfsegcwqeir.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_f66j5apLYTqJs7IE1vHAlw_ZphpVRTI
   ```
   *Do NOT add `SUPABASE_SERVICE_ROLE_KEY` to Vercel. Do NOT commit `.env.local`.*
3. **Supabase** → Project `fpspwpmxlnfsegcwqeir` → Authentication → URL Configuration:
   * Site URL: `https://<your-vercel-domain>.vercel.app`
   * Additional Redirect URLs: `https://<your-vercel-domain>.vercel.app/auth/callback` and `http://localhost:3000/auth/callback` (keep local dev)
4. Deploy → verify `https://<your-vercel-domain>.vercel.app` → `/auth/login`.

Netlify `netlify.toml` is preserved as an **alternative** target (`publish = ".next"` + `@netlify/plugin-nextjs`) but Vercel is the production target.

---

## Getting Started (local)

```bash
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY
npm run dev                  # http://localhost:3000
npm run build                # must pass before Vercel deploy
npm run lint && npx tsc --noEmit
```

Supabase templates/migrations: `supabase/migrations/0001_ascend_foundation.sql` + `0002_phase_system.sql` — paste into Supabase Dashboard → SQL Editor.

---

## Architecture (Phases 1–3)

* **Phase 1** — Next.js 16 + Tailwind + shadcn + `framer-motion` shell (`src/app/(app)/layout.tsx`, `src/components/layout/*`), placeholders distinctly marked.
* **Phase 2** — Supabase Auth (email/password + Google OAuth stub), `profiles` + `handle_new_user()` trigger + `ensureProfile()` (`src/lib/supabase/get-profile.ts`), RLS on all user tables, `phase_templates` global read-only (6 templates, not auto-assigned).
* **Phase 3** — Core phase system: `phases` (`locked|available|active|completed|archived`, `objective/phase_number/start_date/target_date/completed_at/difficulty/focus_areas/final_challenge jsonb/reward_xp`), progress = `completed milestones / total` dynamic, `milestones.is_final_challenge`, strict `locked→available→active` unlocking, explicit `Start Journey` idempotent (`src/lib/phases/actions.ts: initializeJourney/completePhase/beginNextPhase`), XP = `phase.reward_xp + Σ milestone xp_reward`, `PhaseCard` / `PhaseTimeline` / `PhaseCompleteDialog` with premium minimal RPG aesthetics.

`GOAL → PHASE → MILESTONES → QUESTS → XP → SKILLS → STATS → FINAL CHALLENGE → COMPLETION → NEXT PHASE`

---

## Security

* `.env`, `.env.local`, `.env.*.local` are gitignored (`.gitignore:35`). Only `NEXT_PUBLIC_*` is browser-exposed. No `service_role` in client. RLS is the authorization boundary (`auth.uid() = user_id`).

---

## Verify after Vercel deploy

Landing → `/auth/login` → `/auth/sign-up` (email confirm ON: check email → `/auth/callback` → `ensureProfile` → `/dashboard`) → `/phase` Start Journey → Foundation `active`, rest `locked` → toggle milestones → `Complete Phase` → `+XP` → Foundation `completed`, Discipline `available` → `Begin Next Phase` → Discipline `active`. Test RLS: User A cannot read User B `phases`.

---

## Learn More

* [Next.js Docs](https://nextjs.org/docs)
* [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs)
* This project uses `next/font` Geist.

## Deploy on Vercel

Use the Vercel Platform — `https://vercel.com/new` — import `hastenaia/ascend`.
