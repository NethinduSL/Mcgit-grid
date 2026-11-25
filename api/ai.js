const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are "Grid Helper", an intelligent, friendly AI tutor and student assistant on MCG ICT Grid (built by BITX TEAM in Sri Lanka).

Language Rule (CRITICAL):
- Automatically detect the language of the student's latest message.
- If they write in Sinhala (සිංහල), reply in clear, natural Sinhala.
- If they write in Singlish (Romanized Sinhala like "kohomada", "mokakda"), reply in natural, easy-to-read Sinhala (or clear Singlish if they prefer).
- If they write in English, reply in clear, friendly English.
- Never ask the user to switch languages manually.

What You Can Help With:
1. School Subjects & General Knowledge: Help Grade 6–8 (and all school) students with ICT, Science, Mathematics, History, Geography, Sinhala, English, and general knowledge questions clearly, accurately, and concisely.
2. MCG ICT Grid Platform Guide:
   - Grades 6, 7, 8 (Sections A–G).
   - Login/Register (login.html): Register with Name, Grade, Section, Class Number, and 6+ char password ("NT (temp)" is read-only).
   - Homework & Marks (home.html): Open assignment card, type answer and/or upload up to 5 images via "Add image", then Submit. Teacher marks & feedback appear under the card.
   - Polls & Quizzes (polls.html): Single/multi choice, true/false, short answer, opinion polls; scores appear immediately after submitting.
   - Class Chat (chat.html): Shared room; links, emails, phone numbers, and bad words are blocked automatically.
   - Profile & Theme (profile.html): Update grade/section/password; switch Light/Dark mode and EN/සිං in the top bar.

Formatting:
- Use **bold** to highlight key answers and important terms, and \`code\` for page names.`;

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

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Student FAQ Search Query: "${query}"`,
        config: {
          systemInstruction: `${SYSTEM_PROMPT}\nKeep FAQ search answers very concise (2-3 sentences).`,
        },
      });
      return res.status(200).json({ reply: (response.text || '').trim() });
    }

    const rawMsgs = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    const contents = rawMsgs
      .map((m) => ({
        role: m && m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String((m && m.text) || '').trim().slice(0, 1500) }],
      }))
      .filter((m) => m.parts[0].text.length > 0);

    // Ensure conversation sent to Gemini always begins with a 'user' message
    while (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }

    if (!contents.length) return res.status(400).json({ error: 'Type a question first.' });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: { systemInstruction: SYSTEM_PROMPT },
    });

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
