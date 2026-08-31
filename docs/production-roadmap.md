# Production Roadmap: Catechism Voice

Status: IN PROGRESS — updated 2026-08-31
Companion to [`design.md`](design.md). Where the design doc describes the target,
this describes how to get there from what exists in the repo today.

**Live:** <https://sc-learning-app.vercel.app/> — see [Deployment](#deployment) for
how it's wired (and the follow-up to hand off to `PieterT2000`).

## Where we actually are

The former `prototype/` is now the product at the repo root, on Tailwind,
deployed, with a real fallback chain. What works end-to-end:

| Design-doc piece | State |
| --- | --- |
| Core loop: record → transcribe → diff → score | ✅ all three modes |
| Groq Whisper STT proxy with archaic prompt hint | ✅ `app/api/transcribe` |
| TTS reads the question aloud | ✅ **better than planned** — Azure `en-GB` neural voice (`app/api/tts`), browser `speechSynthesis` fallback + watchdog |
| Hands-free full session loop, screen untouched | ✅ screen wake lock, spoken feedback, Next-question button to skip it |
| **Failure handling** | ✅ no-mic / Groq-down / repeated misses all fall back to type-the-answer (PR #8) |
| Three grading modes | ⚠️ Easy / **Medium** / Hard — design wants Easy / **Learning** / Hard |
| Word-level visual diff | ✅ `lib/wordDiff.ts` + chip UI matching the wireframe |
| Streaks / mastery / badges | ⚠️ works, but `localStorage` only and a single 0–100 track, not per-mode |
| Question selection | ✅ **bonus** — 46 named sets (number blocks + WSC themes/topics), not in the design |
| Wireframe-aligned UI, Noto Serif, Tailwind | ✅ (PR #5) |
| App icon / favicon | ✅ (PR #9) |
| Deployed to Vercel + CI | ✅ CI on every PR (PR #7); auto-deploys — via a sync step, see below |

What the design doc calls for that **does not exist yet**:

- **PWA** — not installable; no manifest, service worker, or offline shell (next up)
- **Persistence, auth, cross-device sync** — no Supabase, no accounts (Phase 2)
- **Per-mode mastery** — Easy vs Hard tracked independently, "90%+ in 3 sessions"
- **"Why This Matters" reflections** — parked (decision 6)
- **Learning mode** — whispered prompts on a stall (Phase 5)
- **Groups + leaderboards** — the social layer (Phase 5)
- **Ops** — Groq/Azure quota monitoring, error tracking
- **Launch hygiene** — privacy policy (mic audio leaves the device), a11y pass, onboarding
- **Direct autodeploy from `PieterT2000/sc-learning-app`** — see [Deployment](#deployment)

## Decisions (locked 2026-08-29)

1. **Promote the prototype in place.** Move the app out of `prototype/` to the
   repo root; drop the throwaway framing. The hard parts (iOS MediaRecorder,
   VAD, word diff) already work on real phones — keep them.

2. **Migrate to Tailwind CSS.** Replace the inline `CSSProperties` style objects
   with Tailwind utility classes, screen by screen, as part of Phase 1. Keep the
   `@keyframes pulse` in `globals.css`.

3. **Anonymous-first auth.** Play stores to `localStorage` with no account.
   Signing in (magic link / Google via Supabase Auth) migrates that local
   history into Supabase and turns on cross-device sync.

4. **Infra: the maintainer's own Vercel + Supabase accounts.** Projects live
   there; env vars set in the Vercel dashboard.

5. **v1 keeps every prototype feature** — all three grading modes (incl.
   Medium), question sets, hands-free, feedback levels, local streaks/badges.
   Nothing gets cut for v1. Learning mode, groups, and leaderboards are *new*
   work deferred to v1.1.

6. **"Why This Matters" reflections: parked.** Revisit after the persistence
   structure lands (end of Phase 2). Phase 3 as written below is on hold.

## Deployment

The live site is served by a Vercel project connected to a **private copy Vercel
made when the project was created**, `Damunns/sc-learning-app` — not the source
of record, `PieterT2000/sc-learning-app`. So a merge to the real `main` does not
auto-deploy on its own; the copy has to be pushed first.

**Sync step (run after every merge into `PieterT2000/main`):**

```bash
git remote add deploy https://github.com/Damunns/sc-learning-app.git   # one-time
git fetch origin && git push deploy origin/main:main                   # (--force the first time)
# alias:  git config alias.syncdeploy '!git fetch origin && git push deploy origin/main:main'
```

**Follow-up (needs `PieterT2000`, who has repo admin):** repoint the Vercel
project's Git connection to `PieterT2000/sc-learning-app` (Vercel → Project →
Settings → Git). Then delete `Damunns/sc-learning-app` and drop the sync step.

## Phased plan

### Phase 0 — Housekeeping — DONE

- [x] Resolve the decisions above (locked 2026-08-29)
- [x] Update the root [`README.md`](../README.md) to match reality
- [x] Get the prototype work merged to `main` (PR #3, after PR #2 was closed for a
      conflicting head branch)

### Phase 1 — Promote + make it deployable

Goal: the current app, at the repo root, on Tailwind, live on a URL, installable,
honest about failure.

**1a — Promote to the repo root — DONE (PR #4)**
- [x] `git mv prototype/* .`; `.gitignore` merged (+ `.claude/`, `.vercel/`)
- [x] Package renamed `catechism-voice-prototype` → `catechism-voice`
- [x] `prototype/README.md` folded into the root `README.md`
- [x] `build` / `test:scoring` / `tsc --noEmit` pass from the new root

**1b — Tailwind — DONE (PR #5)**
- [x] `tailwindcss` 3.4 + `postcss` + `autoprefixer`; `tailwind.config.ts`, `postcss.config.js`
- [x] Design tokens in the Tailwind theme; Noto Serif via a CSS variable; `animate-micpulse`
- [x] All six components migrated; every `styles: Record<string, CSSProperties>` object gone
- [x] `globals.css` reduced to the `@tailwind` layers

**1c — Deployability**
- [x] `next.config.js`: `poweredByHeader: false` + baseline security headers (PR #7)
- [x] GitHub Actions on every PR: `tsc --noEmit` + `test:scoring` + `next build` (PR #7)
- [x] `.env.example` complete and documented (`GROQ_API_KEY`, `AZURE_SPEECH_*`)
- [x] Deployed to Vercel with env vars set; smoke-tested on a Pixel over real HTTPS
- [x] App icon / favicon — `app/icon.png` + `app/apple-icon.png`, `scripts/gen-icons.mjs` (PR #9)
- [x] Fallback chain (design §"Fallback & Error Handling") — PR #8:
  - [x] Groq error / rate-limit → persistent notice + type-the-answer for the rest of the session
  - [x] No mic → type-the-answer mode (questions still read aloud); diff identical
  - [x] Two misses in a row → offer the type box instead of re-asking forever
  - [x] `speechSynthesis` watchdog so a hung TTS engine can't stall the loop
  - Deviation: **no** auto-fallback to browser `SpeechRecognition` for scoring
    (poor on archaic vocab — the reason Groq was chosen). Type instead.
- [ ] **PWA** — `manifest.webmanifest`, full icon set (192 / 512 / 512-maskable via
      `scripts/gen-icons.mjs`), a service worker (`@ducanh2912/next-pwa` or
      hand-rolled) caching the app shell + `seed.json`; verify "Add to Home
      Screen" on iOS + Android. Will touch `next.config.js`.
- [ ] CSP header — deferred from PR #7; add and test against the live deploy
      (`connect-src 'self'`; App Router needs care with inline scripts).
- [ ] Remove the CI `next build` dependency on network for `next/font` if it ever
      flakes (Noto Serif is fetched at build) — currently fine.

### Phase 2 — Persistence & auth (1 week)

- [ ] Supabase project; schema from the design data model: `questions`, `attempts`, `streaks`, `badges`, `user_badges` (+ keep `question_sets` if retaining the picker)
- [ ] Seed migration: `seed.json` → `questions` table; JSON stays the repo source of truth
- [ ] Supabase Auth: anonymous session, upgrade via magic link / Google
- [ ] Row-level security on every user-scoped table
- [ ] Refactor `progressStore.ts` into a storage interface: `localStorage` when logged out, write-through to Supabase when logged in, reconcile local → remote on sign-in
- [ ] Per-mode mastery: Easy and Hard tracked independently; "90%+ in 3 sessions" (design §"Mastery Definition")

### Phase 3 — Formation content (PARKED — revisit after Phase 2)

Deferred by decision 6 until the persistence structure lands. When resumed:

- [ ] Author "Why This Matters" for Q1–Q20; draft Q21–Q107
- [ ] Store in `questions.reflection_text`
- [ ] Render on the Diff Result screen (wireframe slot already exists) and speak it in hands-free per the feedback-level setting

### Phase 4 — v1 launch to one church group (3–4 days + soak)

- [ ] Usage instrumentation: Groq requests/day, Azure characters/month, client error rate (Vercel logs + a small `events` table, or PostHog free tier)
- [ ] Privacy policy: mic audio is sent to Groq (and Azure for TTS), not stored; what lives in `localStorage` / Supabase. Basic terms.
- [ ] Accessibility pass: focus states, `aria-live` on the transcript, `prefers-reduced-motion` for the pulse ring, contrast check on the diff chips
- [ ] First-run onboarding: one screen explaining the voice loop, prime the mic permission
- [ ] Share the link with one church group; set up a feedback channel
- [ ] Watch the [Success Criteria](design.md#success-criteria) for two weeks

### Phase 5 — v1.1: social + Learning mode (after real usage)

- [ ] Learning mode: VAD stall → transcribe partial → diff → whisper next 3–5 words → resume (design §"Learning Mode — Whispered Prompt Architecture"); replaces or joins "Medium"
- [ ] Groups via invite code; `groups`, `group_members`
- [ ] Per-group, per-mode leaderboards (rank, name, total score, streak, badges)
- [ ] Badge-earned notifications

## Cross-cutting / ongoing

- **STT cost & backup.** Watch the Groq free tier (2,000 req/day). If it
  changes, Deepgram Nova-3 with keyterm prompting (~$58/mo) is the documented
  fallback. TTS: Azure F0 is 500k chars/month, far above one group's usage.
- **Tune `handsFreeConfig.ts`** silence thresholds against real recordings in
  the rooms people actually use.
- **Grow `scoringConfig.ts`** `FUNCTION_WORDS` / `NORMALISE_RULES` from real
  Groq transcripts, not guesses.
- **Test coverage** beyond `scoring.selftest.ts`: component tests for the state
  machine in `HandsFreeMode`, one Playwright happy-path.

## Suggested next action

**PWA** (the last open item in Phase 1c): add `manifest.webmanifest` + a full
icon set + a service worker so the app installs to a phone home screen and the
shell works offline. Its own branch/PR — it modifies `next.config.js`. After
that, Phase 1 is done and Phase 2 (Supabase) begins.

## Merged so far

| PR | What |
| --- | --- |
| #3 | Prototype work to `main` — grading modes, question sets, hands-free polish, Azure TTS |
| #4 | Promote `prototype/` → repo root |
| #5 | Tailwind migration (all screens) |
| #6 | Remove voice "next question" skip; fix the feedback-TTS endless loop on mobile Chrome |
| #7 | CI workflow + baseline security headers |
| #8 | Type-the-answer fallback for mic / Groq failures + TTS watchdog |
| #9 | App icon / favicon + live deploy link |
