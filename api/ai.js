const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are "Grid Helper", a helpful AI tutor and student assistant on MCG ICT Grid (built by BITX TEAM in Sri Lanka).

Language Rule:
- Automatically detect the language of the student's latest message.
- If they write in Sinhala, reply in clear, natural Sinhala.
- If they write in Singlish (Romanized Sinhala), reply in natural Sinhala (or clear Singlish).
- If they write in English, reply in clear, friendly English.

What You Help With:
1. School Subjects & General Knowledge: Answer ICT, Science, Mathematics, History, Geography, and general knowledge questions clearly, accurately, and concisely for school students.
2. MCG ICT Grid Platform Guide:
   - Grades 6, 7, 8 (Sections A–G).
   - Login/Register (login.html): Register with Name, Grade, Section, Class Number, and 6+ char password ("NT (temp)" is read-only).
   - Homework & Marks (home.html): Open an assignment card, type your answer and/or upload up to 5 images via "Add image", then Submit. Teacher marks & feedback appear under the card.
   - Polls & Quizzes (polls.html): Single/multi choice, true/false, short answer, opinion polls; scores appear immediately after submitting.
   - Class Chat (chat.html): Shared room; links, emails, phone numbers, and bad words are blocked automatically.
   - Profile & Theme (profile.html): Update grade/section/password; switch Light/Dark mode and EN/සිං in the top bar.

Formatting:
- Use **bold** to highlight key terms/answers and \`code\` for page names.`;

async function generateWithFallback(contents, systemInstruction) {
  const models = ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastErr;
  for (let i = 0; i < models.length; i++) {
    try {
      return await ai.models.generateContent({
        model: models[i],
        contents,
        config: { systemInstruction },
      });
    } catch (err) {
      lastErr = err;
      const msg = String((err && err.message) || '');
      const status = err && (err.status || err.code);
      const retryable = status === 503 || status === 429 || status === 404 || /503|429|UNAVAILABLE|high demand/i.test(msg);
      if (!retryable || i === models.length - 1) throw err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in Vercel.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    if (body.mode === 'faq') {
      const query = String(body.query || '').trim().slice(0, 400);
      if (!query) return res.status(400).json({ error: 'Please enter a search question.' });
      const response = await generateWithFallback(
        `Student FAQ Search Query: "${query}"`,
        `${SYSTEM_PROMPT}\nKeep FAQ search answers concise (2-3 sentences).`
      );
      return res.status(200).json({ reply: (response.text || '').trim() });
    }

    const rawMsgs = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const contents = rawMsgs
      .map((m) => ({
        role: m && m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String((m && m.text) || '').trim().slice(0, 1500) }],
      }))
      .filter((m) => m.parts[0].text.length > 0);

    while (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }

    if (!contents.length) return res.status(400).json({ error: 'Type a question first.' });

    const response = await generateWithFallback(contents, SYSTEM_PROMPT);
    const reply = (response.text || '').trim();
    if (!reply) return res.status(502).json({ error: 'Empty response from AI.' });
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('AI helper error:', err);
    return res.status(500).json({
      error: (err && err.message) ? err.message : 'Could not reach AI helper right now. Please try again.'
    });
  }
};
