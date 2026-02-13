# HigherSelf v4 — Setup Guide

## What's in this version
- ✅ Works on iPhone, Android, and desktop
- ✅ Only 3 API keys (no OpenAI needed)
- ✅ English, French, Spanish support
- ✅ Voice recording works on ALL phones (no browser speech recognition dependency)

## 🔑 Get Your API Keys (10 min)

### 1. Anthropic Claude (coaching brain)
- Go to https://console.anthropic.com
- Sign up → Settings → API Keys → Create Key
- Copy key (starts with sk-ant-)
- Add $5-10 billing credit

### 2. ElevenLabs (voice cloning + speech)
- Go to https://elevenlabs.io
- Sign up → Profile → API key
- Copy your key

### 3. Replicate (avatar generation)
- Go to https://replicate.com
- Sign up → Account → API tokens
- Copy token (starts with r8_)

## 🔧 Configure (2 min)

1. Copy .env.example → rename to .env
2. Open .env in Notepad, paste your 3 keys
3. Save

## 🚀 Run

Open PowerShell in this folder:

    npm install
    npm start

Look for all 3 ✅ Connected, then open http://localhost:3000

Phone: use the http://YOUR-IP:3000 URL shown (same WiFi)

## How It Works

1. Choose language → Select goals → Record voice → Take selfie
2. AI generates your transformed future self avatar
3. Call your Higher Self — tap mic, speak, hear yourself respond!

## Troubleshooting

- Voice cloning needs 10+ seconds of clear audio
- Avatar takes 30-90 seconds to generate
- .env must be named exactly .env (not .env.txt)
- Phone must be on same WiFi as your PC
