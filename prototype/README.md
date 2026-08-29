# Catechism Voice — Core Loop Prototype

Proves the record → transcribe → diff → score loop end-to-end, on a phone,
before any database, auth, or UI polish. All 107 questions of the Westminster
Shorter Catechism are in `lib/seed.json`, parsed programmatically from
[thewestminsterstandard.org](https://thewestminsterstandard.org/westminster-shorter-catechism/)
(public domain, 1647) rather than transcribed by hand, to minimize the risk
of a wrong word slipping into the answer key.

## Sessions, not all 107 at once

`lib/progressStore.ts` picks a 5-question batch per session, starting at the
first not-yet-mastered question (by id order) and wrapping back to the start
once everything's mastered. This is a simple sequential picker, not real
spaced repetition - good enough to prove the loop, not a finished study
algorithm.

The **QUESTIONS** selector on the Home screen narrows the pool the batch is
drawn from: the whole catechism, a block of ten (`Q1-10`, `Q11-20`, …), one of
the seven standard themes (`Foundations & Nature of God`, `The Fall, Sin &
Human Misery`, …), or a finer topic (`The three offices of Christ`, `4th
Commandment - the Sabbath`, …). The sets are contiguous id ranges defined in
`lib/questionSets.ts`; the choice is remembered in `localStorage`. If a set has
fewer than five questions the session is just that set.

## Settings

Feedback verbosity (what the app says out loud after each attempt) now lives on
a separate **Settings** screen (`components/SettingsScreen.tsx`), reached from
the ⚙ link on the Home screen, rather than cluttering the Home screen itself.
Both the feedback level and the question set are stored under the same
`catechism-voice-settings-v1` key.

## Setup

```bash
npm install
cp .env.example .env.local
# put your real Groq API key in .env.local
```

Get a Groq API key at https://console.groq.com/keys (free tier: 2,000
requests/day, plenty for this test).

## Running locally (desktop browser)

```bash
npm run dev
```

Open http://localhost:3000. `getUserMedia` (microphone access) is allowed on
`localhost` without HTTPS, so this works out of the box.

## Testing on a physical phone (the part that actually matters)

**`getUserMedia` requires a secure context.** Your phone hitting your laptop's
IP over plain `http://192.168.x.x:3000` will silently fail — no mic prompt at
all on iOS Safari. Two options:

**Option A — Next.js experimental HTTPS (simplest, self-signed cert):**
```bash
npm run dev:https
```
Then on your phone, visit `https://<your-laptop-ip>:3000`. You'll get a
certificate warning — tap through it ("Advanced" → "Proceed"). iOS Safari
will let you accept a self-signed cert for a session.

**Option B — ngrok (if the self-signed cert prompt gives you trouble on iOS):**
```bash
npx ngrok http 3000
```
Use the `https://*.ngrok-free.app` URL it gives you on your phone.

## Look & feel

The default typeface is **Noto Serif**, loaded with `next/font/google` in
`app/layout.tsx` (downloaded at build time and self-hosted — the first
`npm run build` / `npm run dev` needs network; after that it works offline).
The keyframes it can't express inline live in `app/globals.css`.

The **Listening** and **Diff Result** screens follow
[`../docs/wireframe.html`](../docs/wireframe.html): a pulsing mic ring (its
glyph scales with your live input level), a warm `#faf9f6` transcript panel,
chip-style green/red word diff, and — in Hard mode — a colour-banded score
circle. Easy/Medium show the verdict large and centred instead of a circle
(they have no percentage), with the written feedback in a left-accented callout.

## Two input modes

- **Manual** — tap to start/stop recording. Use this first to sanity-check
  mic + Groq + diff on a given device before trusting hands-free. Has an
  Easy / Medium / Hard toggle so you can eyeball all three graders on one
  question without starting a session.
- **Hands-Free** — reads the question aloud (Web Speech API), listens, and
  auto-detects when you've stopped talking to submit for scoring. Loops
  through all five questions automatically.

## Three grading modes

Picked on the Home screen; the grader lives in `lib/scoring.ts`, with the
function-word list and Groq-Whisper equivalence rules in `lib/scoringConfig.ts`.
Judgment (pass/fail, which key ideas are missing / extra / out of order) is
fully deterministic in every mode.

- **Easy** — every *key* word (anything not a small connecting word) must be
  present. Order doesn't matter; missing/fumbled small words don't matter.
  No percentage — you get a sentence or two explaining how your answer
  differed from the catechism answer.
- **Medium** — every key word must be present *and in the answer's order*.
  Small connecting words still don't matter. Also no percentage, same style
  of written explanation.
- **Hard** — exact word-for-word, in order, after a light normalisation pass
  that folds harmless Groq Whisper spelling choices onto the answer key
  ("for ever" ↔ "forever", "Holy Spirit" ↔ "Holy Ghost", "3" ↔ "three",
  punctuation, casing) so they never cost you. You get a percentage plus a
  one-line breakdown of the missing/incorrect words.

All three modes show the green/red word-by-word comparison against the answer.
Easy/Medium add a written verdict on top: **"Word perfect"** when you recited
it exactly, or credit for getting every key idea (and, in Easy, for getting
them in order too) when you didn't.

When more than a handful of key words are missing (`MAX_LISTED_MISSING` in
`lib/scoringConfig.ts`), feedback stops quoting them one by one — a long
`"you didn't say X, Y, Z…"` list is noise once a whole chunk is gone — and
says how much was missing instead.

The Easy/Medium explanation is **hybrid**: the deterministic result is
handed to a small Groq LLM (`/api/feedback`, model in `lib/scoringConfig.ts`)
purely to phrase it naturally. If that call fails or `GROQ_API_KEY` is unset,
it silently falls back to a templated sentence built from the same facts —
the grade itself never depends on the model.

## Feedback level (hands-free)

**Hands-free is built to work with the screen off** — it reads the result
aloud before moving on. How much it says is set on the **Settings** screen
(⚙ from Home) and remembered in `localStorage`
(`lib/feedbackLevels.ts`, `progressStore.ts`):

- **Brief** — one spoken line: where you stand, no word list.
- **Full** — the comprehensive feedback: what you missed and how to fix it
  (the Hard-mode score + breakdown, or the generated Easy/Medium explanation).
- **Say answer** — a brief line, then the correct answer read back slowly.
- **Full + answer** — full feedback, then the answer read back.

While any of these is playing, saying **"next question"** (or "skip", or
tapping **Next question**) cuts it short and moves on. The listener for that
is `lib/skipListener.ts` — same on-device `SpeechRecognition` as the live
captions, with the same iOS caveats; if it can't start, the result just plays
to the end and the button still works. The question is always on screen, but
you shouldn't need to look.

Run the grader's checks with:

```bash
npm run test:scoring
```

## What to actually test on the phone

1. **iOS Safari mic + MediaRecorder.** Confirm recording starts/stops and
   produces a Blob at all — this is the flakiest part of the whole stack on
   iOS. Check the browser console for the `mimeType` your `getSupportedMimeType()`
   picked (should be `audio/mp4` on iOS, `audio/webm;codecs=opus` on Chrome/Android).
2. **Groq transcription accuracy on archaic vocabulary.** Say Q1's answer
   ("Man's chief end is to glorify God, and to enjoy him forever") aloud and
   check the transcript — this validates the design doc's core premise before
   you build anything else on top of it.
3. **Diff / grader correctness.** In Hard mode, deliberately misspeak a word
   or drop "and" and confirm the word-level diff highlights whole words, not
   fragments like "glorify" vs "glorif|y" — and that saying "forever" for the
   answer key's "for ever" still scores 100%. Then switch to Easy/Medium and
   confirm order (Easy ignores it, Medium doesn't) and small dropped words
   (both ignore them) behave as described above, with a written explanation
   instead of a score.
4. **Round-trip latency.** Design doc target is <500ms for the Groq call
   itself; total perceived latency (stop tap → diff on screen) will be higher
   client-side. Worth timing on real phone hardware, not just localhost.

### Hands-free specific

5. **iOS TTS unlock.** `speechSynthesis.speak()` on iOS Safari needs to fire
   from (or right after) a user gesture the first time — the "Start
   Listening" button tap is that gesture. If you add any delay before the
   first `speak()` call, this can silently break on iOS.
6. **Silence-detection thresholds — the main thing to tune.** All of them
   live in `lib/handsFreeConfig.ts` with comments on what each one does.
   The one most likely to need adjusting first is `speechRmsThreshold`:
   too low and background noise never reads as "silence" (never triggers
   submit); too high and quiet speech never reads as "speaking" (never
   detects that you've started). Test in whatever room you'll actually use
   this in — a quiet room and a noisy kitchen will likely need different
   values.
7. **"I'm done" escape hatch.** If VAD misfires in a noisy environment, the
   manual "I'm done — check it" button should always work as a fallback.
   Confirm it does before trusting auto-detection alone.
8. **Full session loop, hands untouched.** Confirm you can go start-to-finish
   across a 5-question session without touching the phone once it starts.
9. **Result read aloud, screen ignored.** With the phone face-down, confirm
   you can still follow along: in Easy/Medium the generated feedback is spoken
   in full; in Hard the score and the missing/incorrect words are spoken.
   There's a brief wait before the Easy/Medium audio while the phrasing call
   runs — it should fall back to the plainer wording if that call is slow or
   the key is unset, never hang the loop.

### Live captions

10. **Live caption box is best-effort, not authoritative.** It's powered by
   the browser's built-in `SpeechRecognition` (`lib/liveCaption.ts`), which
   runs independently of the Groq transcription used for actual scoring.
   Expect it to stumble on archaic vocabulary ("sanctification", "effectual
   calling") — that's fine, it's just a live visual, not what gets scored.
   Confirm on iOS Safari specifically: `SpeechRecognition` support there is
   less consistent than Chrome's, and if it fails to start at all, the
   caption box should just stay empty (recording and scoring should be
   completely unaffected — worth confirming that isolation holds).

## Known gaps (intentionally out of scope for this prototype)

- No database, auth, or user accounts (per the plan — this only proves the loop)
- All three grading modes (Easy / Medium / Hard) now behave differently — but
  progress is still a single 0-100 mastery track, not the per-mode mastery the
  design doc describes. In Easy/Medium a pass is recorded as 100 and a
  near-miss is pinned just below the mastery threshold.
- `FUNCTION_WORDS` and `NORMALISE_RULES` in `lib/scoringConfig.ts` are a
  hand-picked starting point, not tuned against a corpus of real recitations
- Easy/Medium feedback wording depends on a Groq LLM call when the key is set;
  the deterministic template fallback is plainer but always correct
- "Next question" voice-skip relies on `SpeechRecognition` (same support gaps
  as live captions); in a very echoey room it could in principle trip on the
  TTS itself. The on-screen Next button is the reliable path.
- The "Learning" mode from the design doc (whispered prompts when you stall)
  is not built — the third slot is "Medium" instead
- Session picking is sequential-with-wraparound, not spaced repetition
- "Why this matters" reflection content (in the wireframe) isn't implemented
- No offline handling or fallback if Groq is unreachable mid-session
- Silence thresholds are untested guesses (see `lib/handsFreeConfig.ts`) —
  treat them as a starting point, not a finished tuning
- Badge thresholds in `lib/progressStore.ts` are placeholder numbers with no
  real usage data behind them

## Files

```
app/
  page.tsx                     — view switcher (Home / Settings / Hands-Free / Manual)
  layout.tsx                   — root layout; loads Noto Serif via next/font
  globals.css                  — @keyframes pulse (the one thing inline styles can't do)
  api/transcribe/route.ts      — proxies audio to Groq Whisper large-v3
  api/feedback/route.ts        — phrases the Easy/Medium result via a Groq LLM
components/
  HomeScreen.tsx                — mode + question-set selectors, streak, badges, progress
  SettingsScreen.tsx            — feedback-level selector (reached via ⚙ from Home)
  ManualMode.tsx                 — tap-to-record flow + mode toggle (dev/testing)
  HandsFreeMode.tsx              — speak → listen → silence → score → read result aloud → loop
  DiffResult.tsx                 — mode-aware result display (score+diff, or prose+diff)
lib/
  scoring.ts                    — the Easy/Medium/Hard grader + brief verdict (deterministic)
  scoringConfig.ts              — function-word list, STT equivalence rules, list cap, LLM model
  scoring.selftest.ts           — `npm run test:scoring` checks for the grader
  feedbackLevels.ts             — the four hands-free feedback levels
  questionSets.ts               — named question collections (number ranges + WSC themes)
  wordDiff.ts                   — word-level diff-match-patch wrapper (Hard mode)
  feedbackClient.ts             — calls /api/feedback, falls back to the template
  skipListener.ts               — "next question" voice-skip during result playback
  audioFormat.ts                — cross-browser MediaRecorder mime-type detection
  transcribeAudio.ts            — client for the /api/transcribe route
  tts.ts                        — Web Speech API wrapper (speak the question aloud)
  voiceActivity.ts              — Web Audio amplitude monitor (silence detection)
  liveCaption.ts                 — on-device live captions (SpeechRecognition), display-only
  handsFreeConfig.ts            — tunable silence-detection thresholds
  progressStore.ts               — localStorage streak/mastery/badges + session batching
  seed.json                     — all 107 WSC questions (public domain, 1647)
types/
  speech.d.ts                    — ambient types for the non-standard SpeechRecognition API
```
