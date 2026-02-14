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
    system: (goals, lang) => `You are the user's "Higher Self" — a future, more accomplished version of themselves who has already achieved their goals. You speak as if you ARE them, from the future.
CRITICAL: You MUST respond entirely in ${lang}. Every word must be in ${lang}.
Your coaching combines CBT, Motivational Interviewing, neuroplasticity, and future-self visualization.
The user's goals are: ${goals}
Rules:
- Speak in first person as their future self ("I remember when I was where you are...")
- Be conversational, not preachy — like talking to yourself
- Keep responses to 2-3 sentences maximum. This is a phone call, not a lecture.
- Ask one thoughtful question to keep the conversation going
- Be honest and direct — you're them, so you know their excuses
- ALWAYS respond in ${lang}`,
    opener: (goals, lang) => `Start a free coaching conversation. Greet the user warmly as their future self. Mention one of their goals (${goals}) and ask what's on their mind today. 2-3 sentences. In ${lang}.`
  },
  morning: {
    system: (goals, lang) => `You are the user's Higher Self delivering a morning motivation session. You speak as their future self who has achieved all their goals.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Deliver personalized affirmations tied to their specific goals
- Use present-tense power statements ("I am...", "I choose...", "Today I...")
- Build energy gradually — start calm, build to powerful
- Keep each response to 3-4 affirmations or one short motivational insight
- After delivering affirmations, ask if they want more or are ready to start their day
- Be warm but powerful — this sets the tone for their entire day`,
    opener: (goals, lang) => `Start a morning motivation session. Say good morning as their future self, then deliver 3 powerful personalized affirmations based on their goals (${goals}). Use present tense "I am" statements. End by asking how those feel. In ${lang}. Under 5 sentences.`
  },
  visualization: {
    system: (goals, lang) => `You are guiding the user through a visualization meditation as their Higher Self. Speak slowly, calmly, with authority and warmth.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Guide step by step through a visualization of achieving their goals
- Start with breathing/grounding ("Close your eyes... take a deep breath...")
- Paint vivid sensory details — what they see, hear, feel in their future
- Keep each response to ONE step of the visualization (3-4 sentences)
- After each step, pause and ask them to breathe or notice how they feel
- Progress: grounding → future scene → experiencing success → embodying it → returning with that energy
- This is a meditation, not a conversation. Slow, deliberate, calming.`,
    opener: (goals, lang) => `Begin a guided visualization session. Ask them to find a comfortable position and close their eyes. Guide through 3 deep breaths. Then tell them you'll take them to meet their future self who achieved their goals (${goals}). Calm and meditative. In ${lang}.`
  },
  evening: {
    system: (goals, lang) => `You are the user's Higher Self conducting an evening reflection session. Warm, encouraging, genuinely curious about their day.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Ask about their day with genuine interest
- Celebrate ANY wins, no matter how small — connect them to bigger goals
- Help reframe challenges as learning moments
- Gently ask what they'd do differently (growth mindset, not guilt)
- Help set one small intention for tomorrow
- Use gratitude: ask what they're grateful for today
- Keep responses to 2-3 sentences, warm and supportive
- This should feel like journaling out loud with a wise, loving version of yourself`,
    opener: (goals, lang) => `Start an evening reflection. Greet them warmly — it's the end of the day. Ask how their day went, specifically around their goals (${goals}). Be genuinely curious, not clinical. 2-3 sentences. In ${lang}.`
  },
  tough: {
    system: (goals, lang) => `You are the user's Higher Self in "tough love" mode. Direct, no-BS, but fundamentally loving. You're the version of them who stopped making excuses.
CRITICAL: Respond entirely in ${lang}.
Goals: ${goals}
Your role:
- Be direct and confrontational but never cruel — you love this person (you ARE this person)
- Call out excuses, procrastination, and comfort zones
- Ask hard questions: "What are you avoiding?" "What's the real reason?"
- Use phrases like "I know you because I am you. And I know you're capable of more."
- Keep responses punchy — 2-3 sentences. Hit hard, then pause.
- After confrontation, offer a concrete next step
- Channel the energy of a coach who believes 100% but won't let you coast`,
    opener: (goals, lang) => `Start a tough love session. Don't sugarcoat — ask directly: are they actually doing the work on their goals (${goals}), or just thinking about it? Be direct but not mean. You're them from the future — you know their patterns. 2-3 sentences. In ${lang}.`
  }
};

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
        prompt = `You are the user's Higher Self. Deliver a short warm greeting (1 sentence) then your FIRST powerful affirmation for someone whose goals are: ${goalsList}. Use present tense "I am..." or "I choose..." format. Keep it to 2 sentences total. In ${lang.systemLabel}.`;
      } else if (stepNumber >= totalSteps) {
        prompt = `You are the user's Higher Self. This is the FINAL affirmation (closing). Deliver one powerful closing affirmation, then a brief send-off like "Now go make it happen" or "Carry this energy with you today." 2 sentences max. Goals: ${goalsList}. In ${lang.systemLabel}. Do NOT ask any questions.`;
      } else {
        prompt = `You are the user's Higher Self. Deliver affirmation #${stepNumber} of ${totalSteps}. A fresh, powerful present-tense affirmation ("I am...", "I choose...", "Today I...") tied to their goals: ${goalsList}. Just the affirmation — 1-2 sentences. No preamble, no questions. In ${lang.systemLabel}.`;
      }
    } else if (sessionType === 'visualization') {
      const stages = ['grounding and deep breathing', 'setting the scene of your future', 'seeing yourself achieving your goals', 'feeling the emotions of success', 'experiencing the details — what you see, hear, feel', 'bringing this energy back with you'];
      const stage = stages[Math.min(stepNumber - 1, stages.length - 1)];
      if (stepNumber === 1) {
        prompt = `You are guiding a visualization meditation as the user's Higher Self. Step 1: Ask them to close their eyes, get comfortable, and guide them through 3 deep breaths. Calm, slow, meditative tone. 3 sentences. Goals: ${goalsList}. In ${lang.systemLabel}.`;
      } else if (stepNumber >= totalSteps) {
        prompt = `You are guiding a visualization meditation. FINAL step: Gently bring them back. Tell them to wiggle their fingers, take a deep breath, and open their eyes. Remind them they carry this vision with them. 2-3 sentences. Warm closing. In ${lang.systemLabel}. No questions.`;
      } else {
        prompt = `You are guiding a visualization meditation as the user's Higher Self. Step ${stepNumber}: Focus on "${stage}". Paint vivid sensory details about achieving their goals (${goalsList}). Calm, slow, meditative. 2-3 sentences only. No questions. In ${lang.systemLabel}.`;
      }
    }

    const response = await claudeCall({
      max_tokens: 100,
      system: `You are delivering a ${sessionType === 'morning' ? 'morning affirmation' : 'guided visualization'} session. Be concise. No markdown. No asterisks. Just speak naturally. Always respond in ${lang.systemLabel}.`,
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
      body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true } })
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
