# Production Roadmap: Catechism Voice

Status: DRAFT — 2026-08-29
Companion to [`design.md`](design.md). Where the design doc describes the target,
this describes how to get there from what exists in the repo today (the former
`prototype/`, promoted to the repo root in Phase 1a).

## Where we actually are

The "throwaway prototype" has quietly grown into roughly **70% of the design
doc's client experience** (Approach B). What already works end-to-end:

| Design-doc piece | Prototype state |
| --- | --- |
| Core loop: record → transcribe → diff → score | ✅ Done, all three modes |
| Groq Whisper STT proxy with archaic prompt hint | ✅ `app/api/transcribe` |
| TTS reads the question aloud | ✅ **Better than planned** — Azure `en-GB` neural voice (`app/api/tts`) with browser `speechSynthesis` fallback, not just SpeechSynthesis |
| Hands-free full session loop, screen untouched | ✅ Incl. screen wake lock, spoken feedback, a Next-question button to skip it |
| Three grading modes | ⚠️ Easy / **Medium** / Hard — design wants Easy / **Learning** / Hard |
| Word-level visual diff | ✅ `lib/wordDiff.ts` + chip UI matching the wireframe |
| Streaks / mastery / badges | ⚠️ Works, but `localStorage` only and a single 0–100 track, not per-mode |
| Question selection | ✅ **Bonus** — 46 named sets (number blocks + WSC themes/topics), not in the design |
| Wireframe-aligned UI, Noto Serif | ✅ |

What the design doc calls for that **does not exist yet**:

- **Persistence, auth, cross-device sync** — no Supabase, no accounts
- **PWA** — not installable, no manifest, no service worker, no offline shell
- **Deployment** — never deployed; no Vercel project, no CI
- **"Why This Matters" reflections** — the formation payload; wireframe has the slot, content and wiring are absent
- **Learning mode** — whispered prompts on a stall (design §"Whispered Prompt Architecture")
- **Per-mode mastery** — Easy vs Hard tracked independently, "90%+ in 3 sessions"
- **Groups + leaderboards** — the social layer
- **Fallback chain** — Groq-down banner, Web Speech fallback, text-input fallback
- **Ops** — Groq/Azure quota monitoring, error tracking
- **Launch hygiene** — privacy policy (mic audio leaves the device), a11y pass, onboarding

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

## Phased plan

### Phase 0 — Housekeeping (½ day)

- [x] Resolve the decisions above (locked 2026-08-29)
- [x] Update the root [`README.md`](../README.md) status table + roadmap to match reality
- [ ] Get the current prototype branch merged to `main` (PR #2)

### Phase 1 — Promote + make it deployable (5–8 days)

Goal: the current app, restructured to the repo root and styled with Tailwind,
live on a URL, installable, honest about failure.

**1a — Promote (one PR, mechanical) — DONE**
- [x] `git mv prototype/* .` and the dotfiles
- [x] `prototype/.gitignore` → root `.gitignore` (+ `.claude/`, `.vercel/`)
- [x] Rename the package (`catechism-voice-prototype` → `catechism-voice`)
- [x] Merge `prototype/README.md` into the root `README.md`
- [x] Verify: `npm run build`, `npm run test:scoring`, `tsc --noEmit` from the new root

**1b — Tailwind (one PR, then screen-by-screen)**
- [ ] Add `tailwindcss`, `postcss`, `autoprefixer`; `tailwind.config.ts`, `postcss.config.js`
- [ ] `@tailwind base/components/utilities` in `globals.css`; keep `@keyframes pulse`
- [ ] Port the design tokens (steel-blue `#3d5a80`, warm `#faf9f6`, etc.) into the Tailwind theme
- [ ] Migrate components one at a time, verifying each in the browser: `SettingsScreen` → `QuestionSetPicker` → `HomeScreen` → `DiffResult` → `ManualMode` → `HandsFreeMode`
- [ ] Drop the per-file `styles: Record<string, CSSProperties>` objects as each is ported

**1c — Deployability**
- [ ] PWA: `manifest.webmanifest`, icon set, `next-pwa` (or a hand-rolled service worker) caching the app shell + `seed.json`; verify "Add to Home Screen" on iOS + Android
- [ ] `next.config.js`: security headers, `poweredByHeader: false`
- [ ] Fallback chain (design §"Fallback & Error Handling"):
  - [ ] Groq error / rate-limit → visible banner + fall back to Web Speech STT
  - [ ] No mic / STT unavailable → text-input path (diff still works)
  - [ ] Empty/garbage transcript → "Didn't catch that — try again?" with retry
- [ ] `.env.example` complete and documented (`GROQ_API_KEY`, `AZURE_SPEECH_*`)
- [ ] Deploy to Vercel (maintainer's account); set env vars; **smoke-test on a physical phone over real HTTPS**
- [ ] GitHub Actions on PR: `tsc --noEmit`, `npm run test:scoring`, `next build`

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

Phase 1a: get PR #2 merged, then a mechanical "promote to root" PR — `git mv`
`prototype/` up a level, merge the READMEs and `.gitignore`, prove the build
still passes. Small, reviewable, unblocks everything after it.
