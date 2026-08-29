# Catechism Voice

A voice-first web app for memorizing the **Westminster Shorter Catechism** (107
Q&As, public domain, 1647). The app speaks a question aloud, you answer from
memory, and you get back a **word-by-word colour-coded diff** of exactly what you
got right and what you missed — a mirror, not a scorecard.

Existing catechism apps are digital flashcards: read a question, tap to reveal.
But *catechesis* means "to teach by sounding down" — it was an oral tradition for
1,500+ years before it was ever put on a card. This project brings that back:
true hands-free recitation you can do while walking, doing dishes, or commuting.

Three ideas no existing app combines:

1. **Voice-first** — the app speaks the question (TTS), you speak the answer (STT).
2. **Visual diff feedback** — word-level green/red diff, not pass/fail.
3. **Formation over gamification** — the point is growing deeper into the
   content, not a leaderboard. Streaks and badges exist but are secondary.

See [`docs/design.md`](docs/design.md) for the full design,
[`docs/wireframe.html`](docs/wireframe.html) for the interactive wireframe of the
Home → Listening → Diff flow, and [`docs/production-roadmap.md`](docs/production-roadmap.md)
for the plan to take this to production.

## Status

The core loop — record → transcribe → diff → score — works end-to-end on real
phones, in three grading modes, with hands-free sessions and question selection.
Still to do for production: **Supabase persistence + anonymous-first auth**, the
**PWA shell**, **deployment**, and the **Tailwind migration**. Tracked in
[`docs/production-roadmap.md`](docs/production-roadmap.md).

## Quickstart

```bash
npm install
cp .env.example .env.local   # then add your keys (below)
npm run dev                  # http://localhost:3000
```

`getUserMedia` (microphone) works on `localhost` without HTTPS, so this runs out
of the box. Testing on a physical phone needs a secure context — see
[Testing on a phone](#testing-on-a-physical-phone).

### Keys

**Groq (required for scoring)** — the STT and the Easy/Medium feedback phrasing
both go through Groq. Get a free key at <https://console.groq.com/keys> (free
tier: 2,000 requests/day).

```
GROQ_API_KEY=gsk_...
```

**Azure AI Speech (optional — nicer TTS voice)** — without it, the app speaks
with the browser's built-in voice. With it, a smooth `en-GB` neural voice:

1. In the [Azure portal](https://portal.azure.com), create a **Speech** resource
   on the **F0 / free** tier (500,000 characters/month, no expiry).
2. From **Keys and Endpoint**, copy a key and the region/location.
3. Add to `.env.local`:

   ```
   AZURE_SPEECH_KEY=<your key>
   AZURE_SPEECH_REGION=uksouth          # or AZURE_SPEECH_ENDPOINT=<the endpoint URL>
   AZURE_SPEECH_VOICE=en-GB-OllieMultilingualNeural   # optional
   AZURE_SPEECH_RATE_BOOST=25           # optional; % points added to the speaking rate
   ```

`/api/tts` renders speech server-side and returns MP3; `lib/tts.ts` plays it and
**falls back to `speechSynthesis` on any error**, so a wrong key or an exhausted
quota just reverts to the browser voice — it never breaks a session.

### Running the grader checks

```bash
npm run test:scoring
```

## Testing on a physical phone

**`getUserMedia` requires a secure context.** A phone hitting your laptop's IP
over plain `http://192.168.x.x:3000` fails silently — no mic prompt at all on
iOS Safari. Two options:

**A — Next.js experimental HTTPS (self-signed cert):**
```bash
npm run dev:https
```
Visit `https://<your-laptop-ip>:3000` on the phone and tap through the cert
warning ("Advanced" → "Proceed").

**B — ngrok (if the cert prompt gives iOS trouble):**
```bash
npx ngrok http 3000
```
Use the `https://*.ngrok-free.app` URL on the phone.

## How it works

### Two input modes

- **Manual** — tap to start/stop recording. Sanity-checks mic + Groq + diff on a
  device before trusting hands-free. Has an Easy / Medium / Hard toggle to eyeball
  all three graders on one question.
- **Hands-Free** — reads the question aloud (Azure `en-GB` neural voice via
  `/api/tts`, browser `speechSynthesis` fallback), listens, and auto-detects when
  you've stopped talking to submit for scoring. Loops through the whole chosen
  question set with no taps and no need to look at the screen. Holds a **screen
  wake lock** so a slow recitation isn't cut off by the display sleeping, and
  saying **"next question"** skips ahead.

### Three grading modes

Picked on the Home screen; the grader (`lib/scoring.ts`) is fully deterministic
in every mode — pass/fail and which key ideas are missing / extra / out of order.

- **Easy** — every *key* word (anything not a small connecting word) must be
  present. Order and small words don't matter. No percentage — a sentence or two
  explaining how your answer differed.
- **Medium** — every key word must be present *and in the answer's order*. Small
  words still don't matter. Also written feedback, no percentage.
- **Hard** — exact word-for-word, after a light normalisation pass that folds
  harmless Groq Whisper spelling choices onto the answer key ("for ever" ↔
  "forever", "Holy Spirit" ↔ "Holy Ghost", "3" ↔ "three", punctuation, casing).
  You get a percentage plus a one-line breakdown of the missing/incorrect words.

All three show the green/red word-by-word comparison. The Easy/Medium explanation
is **hybrid**: the deterministic result is handed to a small Groq LLM
(`/api/feedback`) purely to phrase it naturally, with a templated fallback if
that call fails or the key is unset — the grade never depends on the model.

### Choosing what a session covers

The **QUESTIONS** card on Home opens a picker (`components/QuestionSetPicker.tsx`):
the whole catechism, a block of ten, one of the seven standard WSC themes, or a
finer topic. Sets are contiguous id ranges in `lib/questionSets.ts`; the choice
is remembered in `localStorage`. A session runs the **whole** chosen set —
there's no fixed length — starting at the first not-yet-mastered question so you
resume roughly where you left off.

### Feedback level

What the app says out loud after each attempt is set on the **Settings** screen
(⚙ from Home) — Brief / Full / Say answer / Full + answer (`lib/feedbackLevels.ts`).

## Project layout

```
app/
  page.tsx                     — view switcher (Home / Settings / Picker / Hands-Free / Manual)
  layout.tsx                   — root layout; loads Noto Serif via next/font
  globals.css                  — @keyframes pulse (the one thing inline styles can't do)
  api/transcribe/route.ts      — proxies audio to Groq Whisper large-v3
  api/feedback/route.ts        — phrases the Easy/Medium result via a Groq LLM
  api/tts/route.ts             — renders speech with Azure AI Speech (optional; en-GB neural voice)
components/
  HomeScreen.tsx               — mode + question-set choice, streak, badges, progress
  QuestionSetPicker.tsx        — full-screen menu for choosing the question set
  SettingsScreen.tsx           — feedback-level selector (reached via ⚙ from Home)
  ManualMode.tsx               — tap-to-record flow + mode toggle (dev/testing)
  HandsFreeMode.tsx            — speak → listen → silence → score → read result aloud → loop
  DiffResult.tsx               — mode-aware result display (score+diff, or prose+diff)
lib/
  scoring.ts                   — the Easy/Medium/Hard grader + brief verdict (deterministic)
  scoringConfig.ts             — function-word list, STT equivalence rules, list cap, LLM model
  scoring.selftest.ts          — `npm run test:scoring` checks for the grader
  feedbackLevels.ts            — the four hands-free feedback levels
  questionSets.ts              — named question collections (number ranges + WSC themes)
  wordDiff.ts                  — word-level diff-match-patch wrapper (Hard mode)
  feedbackClient.ts            — calls /api/feedback, falls back to the template
  skipListener.ts              — "next question" voice-skip during result playback
  audioFormat.ts               — cross-browser MediaRecorder mime-type detection
  transcribeAudio.ts           — client for the /api/transcribe route
  tts.ts                       — speaks text: Azure /api/tts first, browser speechSynthesis fallback
  voiceActivity.ts             — Web Audio amplitude monitor (silence detection)
  liveCaption.ts               — on-device live captions (SpeechRecognition), display-only
  handsFreeConfig.ts           — tunable silence-detection thresholds
  progressStore.ts             — localStorage streak/mastery/badges + session batching
  seed.json                    — all 107 WSC questions (public domain, 1647)
types/
  speech.d.ts                  — ambient types for the non-standard SpeechRecognition API
docs/
  design.md                    — full design: problem, premises, architecture, data model, modes
  production-roadmap.md         — phased plan from here to a deployed v1
  wireframe.html                — interactive wireframe of the three-screen core flow
tools/
  groq-speech-test/            — standalone Bun page that validated Groq Whisper on archaic English
```

## Known gaps

- Progress is a single 0–100 mastery track, not the per-mode mastery the design
  doc describes (Phase 2).
- No persistence beyond `localStorage`; no accounts or cross-device sync (Phase 2).
- No PWA / offline handling; no fallback if Groq is unreachable mid-session (Phase 1).
- `FUNCTION_WORDS` / `NORMALISE_RULES` in `lib/scoringConfig.ts` and the silence
  thresholds in `lib/handsFreeConfig.ts` are hand-picked starting points, not
  tuned against real recitations.
- The design doc's "Learning" mode (whispered prompts on a stall) and the "Why
  This Matters" reflections are not built yet.
- Badge thresholds in `lib/progressStore.ts` are placeholder numbers.

## The Groq speech test

[`tools/groq-speech-test/`](tools/groq-speech-test/) is a single-page harness
that predates the app. It records real recitations of WSC answers, sends them to
Groq with and without the archaic-vocabulary prompt, and shows the transcript
plus round-trip latency — the evidence behind the premise that Groq Whisper
Large v3 is accurate enough on archaic English.

```bash
cd tools/groq-speech-test
GROQ_API_KEY=gsk_... bun run server.js   # http://localhost:3847
```

Requires [Bun](https://bun.sh).

## License / content

The Westminster Shorter Catechism text (1647) is public domain. The 107 Q&As in
[`lib/seed.json`](lib/seed.json) were parsed programmatically from
[thewestminsterstandard.org](https://thewestminsterstandard.org/westminster-shorter-catechism/)
rather than transcribed by hand, to minimize the risk of a wrong word in the
answer key.
