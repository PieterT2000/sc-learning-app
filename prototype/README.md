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

## Two modes

- **Manual** — tap to start/stop recording. Use this first to sanity-check
  mic + Groq + diff on a given device before trusting hands-free.
- **Hands-Free** — reads the question aloud (Web Speech API), listens, and
  auto-detects when you've stopped talking to submit for scoring. Loops
  through all five questions automatically.

## What to actually test on the phone

1. **iOS Safari mic + MediaRecorder.** Confirm recording starts/stops and
   produces a Blob at all — this is the flakiest part of the whole stack on
   iOS. Check the browser console for the `mimeType` your `getSupportedMimeType()`
   picked (should be `audio/mp4` on iOS, `audio/webm;codecs=opus` on Chrome/Android).
2. **Groq transcription accuracy on archaic vocabulary.** Say Q1's answer
   ("Man's chief end is to glorify God, and to enjoy him forever") aloud and
   check the transcript — this validates the design doc's core premise before
   you build anything else on top of it.
3. **Diff correctness.** Deliberately misspeak a word or drop "and" to confirm
   the word-level diff (not character-level) is highlighting whole words, not
   fragments like "glorify" vs "glorif|y".
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

### Live captions

9. **Live caption box is best-effort, not authoritative.** It's powered by
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
- Hard-mode scoring only (exact word match); Easy/Learning-mode scoring
  (gist matching, prompted hints) is not implemented - the mode selector on
  the home screen changes the *label* shown during a session but not the
  actual scoring behavior yet
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
  page.tsx                     — view switcher (Home / Hands-Free / Manual)
  layout.tsx                   — minimal root layout
  api/transcribe/route.ts      — proxies audio to Groq Whisper large-v3
components/
  HomeScreen.tsx                — mode selector, streak, badges, progress, Begin Session
  ManualMode.tsx                 — tap-to-record flow (dev/testing)
  HandsFreeMode.tsx              — speak → listen → auto-detect silence → score → loop
  DiffResult.tsx                 — shared score/diff display
lib/
  wordDiff.ts                   — word-level diff-match-patch wrapper
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
