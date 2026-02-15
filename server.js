require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: path.join(__dirname, 'uploads'), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));

let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const sessions = {
  voiceId: null, goals: [], language: 'en', conversationHistory: [], sessionType: 'free'
};

const LANGUAGES = {
  en: { name: 'English', speechCode: 'en', systemLabel: 'English' },
  fr: { name: 'Français', speechCode: 'fr', systemLabel: 'French' },
  es: { name: 'Español', speechCode: 'es', systemLabel: 'Spanish' },
};

const SESSION_PROMPTS = {
  free: {
    system: (goals, lang) => `You are the user's "Higher Self" — a wiser, future version of them who has already achieved their goals. You are speaking TO the user, coaching them.
CRITICAL: You MUST respond entirely in ${lang}. Every word must be in ${lang}.
Your coaching combines CBT, Motivational Interviewing, neuroplasticity, and future-self visualization.
The user's goals are: ${goals}
Rules:
- Speak TO the user in second person ("You've got this", "I've been where you are, and you will get through this")
- You can reference your shared identity ("I know you because I am you")
- Be conversational, warm, direct — like a wise mentor who happens to be them
- Keep responses to 2-3 sentences maximum
- Ask one thoughtful question to keep the conversation going
- ALWAYS respond in ${lang}`,
    opener: (goals, lang) => `Start a free coaching conversation. Greet the user warmly as their future self. Say something like "Hey, it's me — the you who made it." Mention one of their goals (${goals}) and ask what's on their mind today. 2-3 sentences. In ${lang}.`
  },
  morning: {
    system: (goals, lang) => `You are the user's Higher Self delivering a morning motivation session. You speak TO the user as their future self who has achieved all their goals.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Deliver affirmations spoken TO the user: "You are strong", "You are building something incredible", "Today you choose growth"
- NEVER use first person "I am" — always address the user as "you"
- Build energy gradually — start calm, build to powerful
- Keep each response to 2-3 sentences
- Be warm but powerful — this sets the tone for their entire day`,
    opener: (goals, lang) => `Start a morning motivation session. Say good morning as their future self, then deliver 3 powerful affirmations addressed TO them using "you" statements based on their goals (${goals}). Example: "You are exactly where you need to be." In ${lang}. Under 4 sentences.`
  },
  visualization: {
    system: (goals, lang) => `You are guiding the user through a visualization meditation as their Higher Self. You speak TO the user, guiding them gently.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Guide them step by step: "Close your eyes... take a deep breath... now picture yourself..."
- Always address them as "you" — "You're standing in your dream home", "You can feel the pride"
- Paint vivid sensory details about THEIR future
- Keep each response to 2-3 sentences
- This is a meditation. Slow, deliberate, calming. No questions.`,
    opener: (goals, lang) => `Begin a guided visualization session. Ask them to find a comfortable position and close their eyes. Guide them through 3 deep breaths using "you" language: "Take a slow deep breath in..." Calm and meditative. In ${lang}.`
  },
  evening: {
    system: (goals, lang) => `You are the user's Higher Self conducting an evening reflection. You speak TO the user with warmth, like a wise friend checking in.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Ask about their day with genuine curiosity: "How did today go for you?"
- Celebrate ANY wins — "That's real progress, even if it doesn't feel like it"
- Help reframe challenges: "What did that teach you?"
- Keep responses to 2-3 sentences, warm and supportive
- Always address them as "you"`,
    opener: (goals, lang) => `Start an evening reflection. Greet them warmly — "Hey, you made it through another day." Ask how their day went around their goals (${goals}). Be genuinely curious. 2-3 sentences. In ${lang}.`
  },
  tough: {
    system: (goals, lang) => `You are the user's Higher Self in "tough love" mode. You speak TO the user directly, firmly, but with love. You're the version of them who stopped making excuses.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Be direct: "Are you actually doing the work, or just thinking about it?"
- Call out excuses: "You know that's not good enough. I know because I am you."
- Always address them as "you" — never "I am"
- Keep responses punchy — 2-3 sentences. Hit hard, then pause.
- After confrontation, offer a concrete next step`,
    opener: (goals, lang) => `Start a tough love session. Don't sugarcoat — ask directly: "Be honest with me — did you actually work on your goals (${goals}) today, or did you just think about it?" Be direct but not cruel. 2-3 sentences. In ${lang}.`
  }
};

// USER DATABASE (in-memory — replace with PostgreSQL for production)
const users = {};

// SIGNUP
app.post('/api/signup', (req, res) => {
  const { email, name, voiceId, goals, language } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'Name and email required' });
  const key = email.toLowerCase().trim();
  users[key] = { name, email: key, voiceId, goals: goals || [], language: language || 'en', createdAt: Date.now() };
  // Also set active session
  sessions.voiceId = voiceId;
  sessions.goals = goals || [];
  sessions.language = language || 'en';
  console.log('👤 User signed up:', name, key, 'voiceId:', voiceId);
  res.json({ success: true });
});

// SIGNIN
app.post('/api/signin', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const key = email.toLowerCase().trim();
  const user = users[key];
  if (!user) return res.status(404).json({ error: 'No account found with that email' });
  // Restore session
  sessions.voiceId = user.voiceId;
  sessions.goals = user.goals;
  sessions.language = user.language;
  console.log('🔑 User signed in:', user.name, key);
  res.json({ success: true, name: user.name, voiceId: user.voiceId, goals: user.goals, language: user.language });
});

// SETUP
app.post('/api/setup', (req, res) => {
  sessions.goals = req.body.goals || [];
  sessions.language = req.body.language || 'en';
  sessions.conversationHistory = [];
  res.json({ success: true });
});

// RESTORE — reconnect saved voice ID from browser
app.post('/api/restore', (req, res) => {
  const { voiceId, goals, language } = req.body;
  if (voiceId) sessions.voiceId = voiceId;
  if (goals) sessions.goals = goals;
  if (language) sessions.language = language;
  console.log('♻️ Session restored — voiceId:', voiceId, 'goals:', goals);
  res.json({ success: true });
});

// VOICE CLONING
app.post('/api/clone-voice', upload.single('audio'), async (req, res) => {
  try {
    console.log('🎙 Cloning voice...');
    if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs API key not configured. Check your .env file.' });
    if (!req.file) return res.status(400).json({ error: 'No audio file received' });
    const audioPath = req.file.path;
    console.log('  Audio file size:', req.file.size, 'bytes');
    if (req.file.size < 1000) { try { fs.unlinkSync(audioPath); } catch(e) {} return res.status(400).json({ error: 'Recording too short.' }); }
    const formData = new FormData();
    formData.append('name', 'HigherSelf_' + Date.now());
    formData.append('description', 'HigherSelf voice clone');
    formData.append('files', fs.createReadStream(audioPath), { filename: 'voice.webm', contentType: req.file.mimetype || 'audio/webm' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: formData, signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await response.json();
    try { fs.unlinkSync(audioPath); } catch(e) {}
    if (!response.ok) {
      console.error('❌ ElevenLabs error:', JSON.stringify(data));
      return res.status(response.status).json({ error: 'ElevenLabs: ' + (data.detail?.message || data.detail || JSON.stringify(data)) });
    }
    sessions.voiceId = data.voice_id;
    console.log('✅ Voice cloned! ID:', data.voice_id);
    res.json({ success: true, voiceId: data.voice_id });
  } catch (err) {
    console.error('❌ Voice clone error:', err.name, err.message);
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Upload timed out. Try again.' });
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// SPEECH-TO-TEXT
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    const audioPath = req.file.path;
    const lang = LANGUAGES[sessions.language] || LANGUAGES.en;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath), { filename: 'speech.webm', contentType: req.file.mimetype || 'audio/webm' });
    formData.append('model_id', 'scribe_v1');
    formData.append('language_code', lang.speechCode);
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: formData
    });
    const data = await response.json();
    try { fs.unlinkSync(audioPath); } catch(e) {}
    if (!response.ok) return res.status(response.status).json({ error: data.detail?.message || 'Transcription failed' });
    console.log('🗣 User said:', data.text || '');
    res.json({ success: true, text: data.text || '' });
  } catch (err) { console.error('STT error:', err); res.status(500).json({ error: err.message }); }
});

// Retry helper — tries Sonnet first, falls back to Haiku if overloaded
async function claudeCall(params, retries = 2) {
  const models = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'];
  for (const model of models) {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`  🤖 Trying ${model}...`);
        return await anthropic.messages.create({ ...params, model });
      } catch (err) {
        const status = err.status || err.statusCode || 0;
        const isOverloaded = status === 529 || (err.message || '').toLowerCase().includes('overloaded');
        if (isOverloaded && i < retries - 1) {
          console.log(`  ⏳ ${model} overloaded, retrying in 3s...`);
          await new Promise(r => setTimeout(r, 3000));
        } else if (isOverloaded) {
          console.log(`  ❌ ${model} still overloaded, trying next model...`);
          break; // try next model
        } else {
          throw err;
        }
      }
    }
  }
  throw new Error('All models are busy right now. Please try again in a moment.');
}

// START SESSION
app.post('/api/coach/start', async (req, res) => {
  try {
    if (!anthropic) return res.status(500).json({ error: 'Anthropic API key not configured' });
    const { goals, language, sessionType } = req.body;
    const lang = LANGUAGES[language] || LANGUAGES.en;
    const goalsList = (goals || []).join(', ');
    const type = sessionType || 'free';
    const prompts = SESSION_PROMPTS[type] || SESSION_PROMPTS.free;
    sessions.conversationHistory = [];
    sessions.sessionType = type;
    const systemPrompt = prompts.system(goalsList, lang.systemLabel);
    const openerPrompt = prompts.opener(goalsList, lang.systemLabel);
    const response = await claudeCall({
      max_tokens: 150, system: systemPrompt,
      messages: [{ role: 'user', content: openerPrompt }]
    });
    const reply = response.content[0].text;
    sessions.conversationHistory.push({ role: 'user', content: openerPrompt });
    sessions.conversationHistory.push({ role: 'assistant', content: reply });
    console.log(`🧠 [${type}] Session started:`, reply);
    res.json({ success: true, reply });
  } catch (err) { console.error('Session start error:', err); res.status(500).json({ error: err.message }); }
});

// LISTEN-MODE: Generate next step for Morning/Visualization
app.post('/api/coach/listen-step', async (req, res) => {
  try {
    if (!anthropic) return res.status(500).json({ error: 'Anthropic API key not configured' });
    const { goals, language, sessionType, stepNumber, totalSteps } = req.body;
    const lang = LANGUAGES[language] || LANGUAGES.en;
    const goalsList = (goals || []).join(', ');

    let prompt;
    if (sessionType === 'morning') {
      if (stepNumber === 1) {
        prompt = `You are the user's Higher Self speaking TO them. Deliver a warm greeting (1 sentence) then your FIRST affirmation addressed to the user. Use "you" statements: "You are ready", "You have the strength". Goals: ${goalsList}. 2 sentences total. In ${lang.systemLabel}.`;
      } else if (stepNumber >= totalSteps) {
        prompt = `You are the user's Higher Self. FINAL affirmation (closing). Deliver one powerful closing affirmation using "you", then a send-off like "Now go show the world what you're made of." 2 sentences max. Goals: ${goalsList}. In ${lang.systemLabel}. No questions.`;
      } else {
        prompt = `You are the user's Higher Self. Deliver affirmation #${stepNumber} of ${totalSteps} addressed TO the user. Use "you" statements: "You are becoming...", "You choose...", "Today you...". Tied to their goals: ${goalsList}. 1-2 sentences. No preamble, no questions. In ${lang.systemLabel}.`;
      }
    } else if (sessionType === 'visualization') {
      const stages = ['grounding and deep breathing', 'setting the scene of your future', 'seeing yourself achieving your goals', 'feeling the emotions of success', 'experiencing the details — what you see, hear, feel', 'bringing this energy back with you'];
      const stage = stages[Math.min(stepNumber - 1, stages.length - 1)];
      if (stepNumber === 1) {
        prompt = `You are guiding the user through a visualization. Step 1: Tell them to close their eyes, get comfortable. Guide them through 3 deep breaths: "Breathe in slowly... and release." Always say "you". 3 sentences. In ${lang.systemLabel}.`;
      } else if (stepNumber >= totalSteps) {
        prompt = `Visualization FINAL step: Gently bring them back. "Wiggle your fingers... take one more deep breath... and when you're ready, open your eyes." Remind them they carry this vision with them. 2-3 sentences. In ${lang.systemLabel}. No questions.`;
      } else {
        prompt = `Visualization step ${stepNumber}: Focus on "${stage}". Guide the user using "you" language: "You can see yourself...", "You feel the warmth of..." Paint vivid sensory details about achieving their goals (${goalsList}). 2-3 sentences. No questions. In ${lang.systemLabel}.`;
      }
    }

    const response = await claudeCall({
      max_tokens: 100,
      system: `You are the user's Higher Self — their future, wiser self — speaking TO them. Always address the user as "you". Never use "I am" affirmations. Be concise. No markdown. No asterisks. Speak naturally. Always respond in ${lang.systemLabel}.`,
      messages: [{ role: 'user', content: prompt }]
    });
    const reply = response.content[0].text;
    console.log(`🧘 [${sessionType}] Step ${stepNumber}/${totalSteps}:`, reply);
    res.json({ success: true, reply, stepNumber, totalSteps, done: stepNumber >= totalSteps });
  } catch (err) { console.error('Listen step error:', err); res.status(500).json({ error: err.message }); }
});

// COACHING RESPOND
app.post('/api/coach/respond', async (req, res) => {
  try {
    if (!anthropic) return res.status(500).json({ error: 'Anthropic API key not configured' });
    const { userMessage, goals, language, sessionType } = req.body;
    const lang = LANGUAGES[language] || LANGUAGES.en;
    const goalsList = (goals || []).join(', ');
    const type = sessionType || sessions.sessionType || 'free';
    const prompts = SESSION_PROMPTS[type] || SESSION_PROMPTS.free;
    sessions.conversationHistory.push({ role: 'user', content: userMessage });
    const systemPrompt = prompts.system(goalsList, lang.systemLabel);
    const messages = sessions.conversationHistory.slice(-12).map(m => ({ role: m.role, content: m.content }));
    const response = await claudeCall({ max_tokens: 150, system: systemPrompt, messages });
    const reply = response.content[0].text;
    sessions.conversationHistory.push({ role: 'assistant', content: reply });
    console.log(`🧠 [${type}]:`, reply);
    res.json({ success: true, reply });
  } catch (err) { console.error('Coach error:', err); res.status(500).json({ error: err.message }); }
});

// TEXT-TO-SPEECH
app.post('/api/speak', async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    const { text } = req.body;
    if (!sessions.voiceId) return res.status(400).json({ error: 'No cloned voice yet.' });
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${sessions.voiceId}/stream?optimize_streaming_latency=3`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.6, similarity_boost: 0.95, style: 0.2, use_speaker_boost: true } })
    });
    if (!response.ok) { const e = await response.json().catch(() => ({})); return res.status(response.status).json({ error: e.detail || 'TTS failed' }); }
    res.set({ 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked' });
    response.body.pipe(res);
  } catch (err) { console.error('TTS error:', err); res.status(500).json({ error: err.message }); }
});

app.post('/api/reset', (req, res) => {
  sessions.voiceId = null; sessions.goals = []; sessions.conversationHistory = [];
  res.json({ success: true });
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) for (const iface of interfaces[name]) if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  ✨ HigherSelf v7 is running!');
  console.log('  ─────────────────────────────────');
  console.log(`  On this PC:     http://localhost:${PORT}`);
  console.log(`  On your phone:  http://${ip}:${PORT}`);
  console.log('  ─────────────────────────────────');
  console.log('  API Keys:');
  console.log(`    Claude:     ${anthropic ? '✅ Connected' : '❌ Missing (ANTHROPIC_API_KEY)'}`);
  console.log(`    ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log('  ─────────────────────────────────');
  console.log('  Sessions: Morning | Visualization | Evening | Tough Love | Free');
  console.log('  📱 Works on iPhone, Android, and desktop!');
  console.log('');
});
