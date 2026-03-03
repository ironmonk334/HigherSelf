# HigherSelf

AI voice coaching app that talks to users in their own cloned voice. Users record their voice, set goals, and have coaching sessions with their "Higher Self" — a wiser future version of themselves.

## Tech Stack

- **Backend:** Node.js + Express (`server.js`) — single file, no framework
- **Frontend:** Single-page app (`public/index.html`) — vanilla JS, no build step
- **AI:** Anthropic Claude (Sonnet with Haiku fallback) for coaching responses
- **Voice:** ElevenLabs API for voice cloning (`/v1/voices/add`), TTS (`/v1/text-to-speech`), and STT (`/v1/speech-to-text`)
- **Hosting:** Heroku (see `Procfile`)

## Architecture

- Everything is in two files: `server.js` (backend) and `public/index.html` (frontend + CSS + JS)
- In-memory session storage (no database) — `users` object and `sessions` object
- Voice cloning uploads 3 separate audio files (one per reading passage) for better clone quality
- TTS uses `eleven_multilingual_v2` model with `remove_background_noise` enabled
- Recording uses raw audio constraints (no browser noise suppression) for cleaner cloning input

## Session Types

Five coaching modes: Free Conversation, Morning Motivation, Guided Visualization, Evening Reflection, Tough Love. Morning and Visualization are "listen-only" (multi-step, no user mic input).

## Multilingual

Supports English, French, Spanish. All UI strings are in the `I18N` object in `index.html`. Reading passages for voice cloning are also translated.

## API Keys Required

Set in `.env` (see `.env.example`):
- `ANTHROPIC_API_KEY` — for Claude coaching responses
- `ELEVENLABS_API_KEY` — for voice cloning, TTS, and STT

## Key Things to Know

- The frontend is heavily minified/compressed inline — long lines are normal
- Voice clone quality is critical to the user experience; changes to recording flow, TTS settings, or ElevenLabs parameters should be tested carefully
- The app is designed mobile-first (iPhone/Android) — always consider touch interactions and small screens
- Claude model fallback: tries Sonnet first, falls back to Haiku if overloaded (see `claudeCall()`)
