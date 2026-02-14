# HigherSelf

AI coaching app that clones your voice and speaks to you as your future self.

## Features

- **Voice Cloning** — Clone your voice with ElevenLabs in seconds
- **5 Session Types** — Morning Motivation, Guided Visualization, Evening Reflection, Tough Love, Free Conversation
- **AI Coaching** — Powered by Claude, speaks as your future self
- **Persistent** — Saves your voice, goals, session history, and streaks
- **Multilingual** — English, French, Spanish

## Deploy to Railway

1. Push this repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add environment variables: ANTHROPIC_API_KEY and ELEVENLABS_API_KEY
4. Done! Railway gives you a public URL.

## Run Locally

```bash
npm install
# Create .env with your API keys (see .env.example)
npm start
```
