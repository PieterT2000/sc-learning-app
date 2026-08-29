# Catechism Voice

A voice-first web app for memorizing the **Westminster Shorter Catechism** (107
Q&As, public domain, 1647). The app speaks a question aloud, you answer from
memory, and you get back a **word-by-word colour-coded diff** of exactly what you
got right and what you missed — a mirror, not a scorecard.

Existing catechism apps are digital flashcards: read a question, tap to reveal.
But *catechesis* means "to teach by sounding down" — it was an oral tradition for
1,500+ years before it was ever put on a card. This project brings that back:
true hands-free recitation you can do while walking, doing dishes, or commuting.

The three ideas no existing app combines:

1. **Voice-first** — the app speaks the question (TTS), you speak the answer (STT).
2. **Visual diff feedback** — word-level green/red diff, not pass/fail.
3. **Formation over gamification** — a short "Why This Matters" reflection after
   each answer connects the words to their meaning. Streaks and badges exist but
   are secondary.

See [`docs/design.md`](docs/design.md) for the full design and
[`docs/wireframe.html`](docs/wireframe.html) for the interactive wireframe of the
core Home → Listening → Diff flow.

## Status

| Piece | State |
| --- | --- |
| Design doc | Complete — [`docs/design.md`](docs/design.md) |
| STT engine choice | Validated — Groq Whisper Large v3 handles archaic vocabulary; Web Speech API does not (kept only as a fallback) |
| Core-loop prototype | In review — [`prototype/`](prototype/), PR [#1](https://github.com/PieterT2000/sc-learning-app/pull/1) |
| Full app (Next.js + Supabase, 3 modes, groups) | Not started |

This repo currently holds a **design** and a **throwaway prototype that proves
the core loop**. The production app described in the design doc has not been
built yet.

## Repository layout

```
docs/
  design.md            — full design: problem, premises, architecture, data model,
                          three modes (Learning / Easy / Hard), scoring, badges, roadmap
  wireframe.html        — interactive wireframe of the three-screen core flow
tools/
  groq-speech-test/     — standalone Bun page to sanity-check Groq Whisper accuracy
                          on real WSC answers, before building anything on top of it
prototype/
  ...                   — Next.js 14 app proving record → transcribe → diff → score
                          end-to-end on a phone. See prototype/README.md.
```

## The prototype

[`prototype/`](prototype/) is a deliberately minimal Next.js 14 app: no database,
no auth, no UI polish. It exists to de-risk the parts of the design most likely
to fail on real phone hardware — iOS Safari `MediaRecorder`, Groq transcription
of archaic vocabulary, word-level diff correctness, and hands-free
silence-detection.

It implements:

- **`/api/transcribe`** — proxies captured audio to Groq Whisper Large v3 with the
  archaic-vocabulary prompt hint; forwards whatever container the browser produced
  (iOS `audio/mp4` vs Chrome/Android `audio/webm;codecs=opus`).
- **Manual mode** — tap to record; for isolating mic/Groq/diff issues per device.
- **Hands-Free mode** — speaks the question, listens, auto-detects when you stop
  talking, then reads the result aloud and loops a 5-question session with no
  taps and no need to look at the screen. A **Settings** screen controls how
  much it says (brief line / full feedback / read the answer back / both), and
  saying **"next question"** cuts any of it short.
- **Question sets** — the Home screen lets you pick what a session draws from:
  the whole catechism, a block of ten, or one of the standard WSC themes /
  topics (`lib/questionSets.ts`).
- **Three grading modes** (`lib/scoring.ts`) — Easy (key ideas, any order),
  Medium (key ideas, in order), Hard (exact words, with an STT-normalisation
  pass so "for ever" ↔ "forever" isn't penalised). Easy/Medium return a written
  explanation instead of a percentage — phrased by a Groq LLM (`/api/feedback`)
  over a deterministic result, with a templated fallback — and credit a
  word-perfect recitation as such. All three modes show the green/red
  word-by-word comparison.
- **Live captions** (on-device `SpeechRecognition`), display-only, isolated from
  the Groq transcript used for scoring.
- **localStorage** streak / mastery / badges with sequential-with-wraparound
  session batching.

The Listening and Diff Result screens follow
[`docs/wireframe.html`](docs/wireframe.html) — pulsing mic ring, chip-style
green/red diff, a colour-banded score circle in Hard mode — and the app is set
in **Noto Serif** (`next/font`, self-hosted after the first build).

**Intentionally out of scope** for the prototype: database/auth, per-mode
mastery tracking, spaced repetition, "Why This Matters" content, the design
doc's whispered-prompt "Learning" mode, offline handling, and tuned
silence/badge thresholds. See
[`prototype/README.md`](prototype/README.md#known-gaps-intentionally-out-of-scope-for-this-prototype)
for the full list and for phone-testing instructions.

### Run it

```bash
cd prototype
npm install
cp .env.example .env.local   # then put a real Groq API key in .env.local
npm run dev                  # http://localhost:3000
```

Get a free Groq API key at <https://console.groq.com/keys> (free tier: 2,000
requests/day). Microphone access works on `localhost` without HTTPS; testing on a
physical phone needs a secure context — see
[`prototype/README.md`](prototype/README.md#testing-on-a-physical-phone-the-part-that-actually-matters).

## The Groq speech test

[`tools/groq-speech-test/`](tools/groq-speech-test/) is a single-page harness that
predates the prototype. It records real recitations of WSC answers, sends them to
Groq with and without the archaic-vocabulary prompt, and shows the transcript plus
round-trip latency — the evidence behind the design doc's premise that Groq
Whisper Large v3 is accurate enough on archaic English.

```bash
cd tools/groq-speech-test
GROQ_API_KEY=gsk_... bun run server.js   # http://localhost:3847
```

Requires [Bun](https://bun.sh). It reads `GROQ_API_KEY` from the environment or
from a `.env` file in the repo root.

## Planned architecture (not yet built)

From [`docs/design.md`](docs/design.md):

- **Next.js 14** (App Router) on Vercel free tier
- **Supabase** free tier for auth, Postgres, and cross-device sync
- **Groq Whisper Large v3** for STT via a server route that hides the API key
- Browser **SpeechSynthesis** API for TTS (free, built-in)
- **`diff-match-patch`** with a word-level tokenization wrapper
- Tailwind CSS, `next-pwa` for an installable phone-first PWA
- Three modes — **Learning** (whispered prompts when you stall), **Easy** (gist
  match), **Hard** (exact words) — plus streaks, hand-curated reflections, and
  lightweight per-group leaderboards

## Roadmap

1. ✅ Design doc and wireframe
2. ✅ Validate Groq Whisper on archaic vocabulary (`tools/groq-speech-test`)
3. 🔄 Prove the core record → transcribe → diff → score loop on a phone
   (`prototype/`, PR [#1](https://github.com/PieterT2000/sc-learning-app/pull/1))
4. ⬜ Scaffold the real Next.js + Tailwind + `next-pwa` app
5. ⬜ Groq STT proxy route with the archaic-vocabulary prompt hint
6. ⬜ Seed WSC content into Supabase, incl. hand-written reflections
7. ⬜ Build the core loop screen, then add TTS for hands-free
8. ⬜ Learning mode (silence detection + whispered prompts)
9. ⬜ Sessions, streaks, badges
10. ⬜ Groups and leaderboards
11. ⬜ Ship to a church group and watch real usage

## License / content

The Westminster Shorter Catechism text (1647) is public domain. The 107 Q&As in
[`prototype/lib/seed.json`](prototype/lib/seed.json) were parsed programmatically
from [thewestminsterstandard.org](https://thewestminsterstandard.org/westminster-shorter-catechism/)
rather than transcribed by hand, to minimize the risk of a wrong word in the
answer key.
