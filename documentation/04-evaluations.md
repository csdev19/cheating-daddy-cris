# 04 — Evaluations

Libraries and models evaluated during the analysis, with the data backing the
decisions in [03-decisions.md](03-decisions.md).

All data verified on **2026-08-25**. Prices and rankings move; re-verify before
leaning on them.

---

## Libraries

### TanStack AI → rejected (D10)

Headless agentic framework, agnostic of UI framework.

| Aspect            | Data                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Core version      | `@tanstack/ai` **0.49.1**                                                                                                |
| Anthropic adapter | `@tanstack/ai-anthropic` **0.18.0**                                                                                      |
| Format            | **`"type": "module"` — pure ESM**                                                                                        |
| Engines           | `node >=18`                                                                                                              |
| Peer deps         | `zod ^4`, `@anthropic-ai/vertex-sdk ^0.19`                                                                               |
| Providers         | 11: OpenRouter, OpenAI, Anthropic, Gemini, Bedrock, Mistral, Groq, Grok, Ollama, ElevenLabs, fal.ai + `openaiCompatible` |
| Capabilities      | Streaming, tool calling with approval gates, chat state, `cache_control`                                                 |

**In favour:** it maps almost 1:1 onto the repo's three modes — Gemini and Groq
directly, and the local `llama-server` already speaks OpenAI-compatible. It would
replace hand-written provider plumbing: `gemini.js` (1365 lines), `cloud.js` and
part of `localai.js`.

**Against:**

1. **Module clash.** It would live in the main process, which is **CommonJS on
   Node 20**. `require(esm)` landed in Node 22. Adopting it demands upgrading
   Electron to 35+, introducing a bundler (the repo has none), or converting main
   to ESM.
2. **Pre-1.0.** Core at 0.49.1, Anthropic adapter at 0.18.0. The API is still moving.
3. **Vision unconfirmed.** The Anthropic adapter docs do not document image input —
   a central requirement here.
4. **Mostly irrelevant ecosystem:** `ai-memory` is Redis/mem0/Honcho (here the
   memory is local markdown); the UI bindings are React/Vue/Svelte (here it is Lit).

**Sources:** [tanstack.com/ai](https://tanstack.com/ai/latest) ·
[Anthropic adapter](https://tanstack.com/ai/latest/docs/adapters/anthropic) ·
[quick start server](https://tanstack.com/ai/latest/docs/getting-started/quick-start-server) ·
[npm](https://www.npmjs.com/package/@tanstack/ai)

---

### Mediabunny → out of v1, a candidate later (D11)

Pure TypeScript media toolkit on top of WebCodecs.

| Aspect       | Data                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| Version      | **1.55.2** (mature)                                                     |
| Format       | `"type": "module"` — ESM                                                |
| Dependencies | **zero**                                                                |
| Formats      | mp4, mov, webm, mkv, wav, mp3, ogg, flac, adts, subtitles               |
| Capabilities | Read, write, convert; transmux, transcode, resize, **audio resampling** |
| Runtime      | Browser-first, built on WebCodecs                                       |

**ESM is not a blocker here**, unlike TanStack: Mediabunny would go in the
**renderer**, which is already a browser context and already loads ES modules —
`import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js'`. It
gets vendored into `src/assets/` with the pattern the repo already uses for Lit,
marked and highlight.js. No bundler.

**Where it would help:**

- _Correct resampling_ — but the broken resampler (H7) runs in the **main
  process**, with no WebCodecs and no AudioContext. Moving the DSP to the renderer,
  `OfflineAudioContext` already solves this with no dependency. Mediabunny wins
  nothing here.
- _Recording session audio compressed_ — **this is the genuine case**. It allows
  re-transcribing past meetings with better models and feeding the test bench with
  real material. Raw WAV is hundreds of MB per meeting; Opus, a few.

**Verdict:** the right tool for the recording feature, low adoption cost, but not
on the critical path for v1.

**Sources:** [mediabunny.dev](https://mediabunny.dev) · npm `mediabunny@1.55.2`

---

## Transcription models (ASR)

### Available without touching the runtime

The repo's `whisper-server` loads GGML. Verified on
[ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) — all
drop-in, one catalogue entry and done:

```
ggml-large-v3-turbo.bin        ggml-large-v3-turbo-q5_0.bin   ← half the size
ggml-large-v3.bin              ggml-medium.en.bin
ggml-medium-q5_0.bin           ggml-small.en.bin
```

There are quantised variants (`q5_0`, `q8_0`) of nearly everything. On an
M4 Pro / 24 GB they are not needed: full `large-v3-turbo` (~1.6 GB) fits fine.

The repo's **current** catalogue (`native-ai-runtime.js:49`) only has `tiny.en`,
`base.en` and `small.en`.

### Better, but incompatible with the runtime

| Model                           | English WER | Runtime           | Drop-in? |
| ------------------------------- | ----------- | ----------------- | -------- |
| IBM Granite Speech 4.1 2B       | ~5.33%      | transformers      | ✗        |
| Cohere Transcribe 2B            | ~5.42%      | transformers      | ✗        |
| NVIDIA Canary Qwen 2.5B         | ~5.63%      | NeMo              | ✗        |
| **NVIDIA Parakeet TDT 0.6B v3** | **~6.32%**  | NeMo / ONNX / MLX | ✗        |
| **Whisper large-v3-turbo**      | **~7.83%**  | **whisper.cpp**   | **✓**    |

Parakeet beats turbo on English, is smaller (0.6B), and covers 25 European
languages including Spanish. The blocker is purely plumbing (see D4).

**Two warnings about these numbers:**

1. **The ranking moves fast** — in 2026 alone first place passed through Canary
   Qwen, then Cohere Transcribe, then Granite.
2. **WER is measured on curated datasets**, not on compressed Google Meet audio
   with a non-native accent. Real results may order differently. Hence the test
   bench.

**Sources:** [Open ASR Leaderboard](https://huggingface.co/blog/open-asr-leaderboard) ·
[ASR Leaderboard paper](https://arxiv.org/html/2510.06961v4) ·
[2026 STT comparison](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)

### On `.en` vs multilingual models

The `.en` models beat multilingual ones of the same size on English, because they
do not spend capacity on 98 languages. The advantage is large at `tiny`/`base` and
narrows with size — so much so that at `large` **there is no `.en` variant**.

Important trap: the `.en` models **do not detect the language, they assume it**.
With Spanish they do not degrade: they transliterate into English words and produce
garbage.

---

## Reasoning models and cost

### Assumptions behind the numbers

A 30 min meeting, ~20 shortcut invocations, ~8k tokens of notes in the cached
block, transcript growing to ~5k, a screenshot on half the invocations (~1.1k
tokens each), ~300 tokens of answer.

### Comparison

| Model                 | Context | In / Out ($/1M)     | ~Cost/meeting | 20 meetings/month |
| --------------------- | ------- | ------------------- | ------------- | ----------------- |
| Gemini 2.5 Flash-Lite | 1M      | $0.10 / $0.40       | ~$0.01        | ~$0.20            |
| Gemini 3.7 Flash      | 1M      | $0.75 / $3.75       | ~$0.08        | ~$1.60            |
| **Gemini 2.5 Pro**    | 1M      | $1.25 / $10 (≤200k) | **~$0.20**    | ~$4.00            |
| **Claude Sonnet 5**   | 1M      | $2 / $10            | **~$0.23**    | ~$4.60            |
| Claude Opus 5         | 1M      | $5 / $25            | ~$0.58        | ~$11.60           |
| Claude Fable 5        | 1M      | $10 / $50           | ~$1.16        | ~$23              |

**Conclusion: price is not the deciding variable.** Even the expensive tier lands
around ~$12 a month. The difference between Gemini Flash and Opus 5 is ~$10 a
month — not a criterion for choosing the tool that does or does not save you an
interview.

**Prompt caching** does most of the work: the notes are written to cache once and
the other 19 invocations read them at ~0.1x. That is why the big stable block
barely shows up on the bill, and why the payload assembly in
[02-design.md](02-design.md) orders stable → volatile.

### Notes

- **1M of context is not exclusive to Fable.** Opus 5, Sonnet 5 and Fable 5 have it.
- **Gemini 3.7/3.6 Flash doubles in price on 1 January 2027** ($1.50 / $7.50).
- **Gemini's caching charges storage per hour** on top of the token. Negligible for
  30 min sessions; not negligible if the app runs all day.
- **Claude does not accept audio at all.** Gemini Live does, with diarisation — its
  biggest differentiator for this app, though D6 makes it unnecessary.
- **A Claude Code subscription cannot be used as a backend.** Pro/Max covers using
  Claude Code as a tool; a third-party app needs API credentials, billed per token.

**Sources:** [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) ·
[Gemini pricing 2026 — CloudZero](https://www.cloudzero.com/blog/gemini-pricing/) ·
Claude prices per the official API reference consulted during the analysis.
