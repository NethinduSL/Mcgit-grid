const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MCG_GUIDE = `You are "Grid Helper", the official ICT student assistant on MCG ICT Grid (built by BITX TEAM in Sri Lanka).

Exact MCG ICT Grid Guide for Students:
- Grades & Sections: Grades 6, 7, and 8 (Sections A to G).
- Register / Login (login.html): Students register using Name, Grade (6-8), Section (A-G), Class Number, and a Password (6+ characters). Note: "NT (temp)" guest accounts are view-only.
- Homework & Marks (home.html): Homework cards show tasks for your grade/section. Open a card, type your answer and/or attach up to 5 images via "Add image", then Submit. Teacher marks and feedback appear under the card once graded.
- Polls & Quizzes (polls.html): Supports Single choice, Multiple choice, True/False, Short answer, and Opinion polls. Quiz marks and percentages appear immediately after submission.
- Class Chat (chat.html): Shared discussion room for students and teachers. Website links, email addresses, phone numbers, and inappropriate words are automatically blocked. Wait a few seconds between messages.
- Profile, Language & Theme (profile.html & Top Bar): Update your name, grade/section, class number, or password in Profile. Use the moon/sun button to switch Light/Dark theme, and the "EN / සිං" button in the top bar to switch Sinhala/English.`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
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

    const replyLang = body.replyLang === 'en' ? 'en' : 'si';
    const langRule = replyLang === 'si'
      ? 'Always reply in clear, friendly Sinhala (සිංහල) using simple English terms (like Homework, Submit, Profile, Quiz) where helpful for school students.'
      : 'Always reply in clear, friendly English suitable for Grade 6-8 students.';

    if (body.mode === 'faq') {
      const query = String(body.query || '').trim().slice(0, 400);
      if (!query) return res.status(400).json({ error: 'Please enter a search question.' });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Student FAQ Search Query: "${query}"`,
        config: {
          systemInstruction: `${langRule}\nGive a very clear, concise 2-3 sentence answer for a student searching the FAQ section.\n\n${MCG_GUIDE}`,
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

    if (!contents.length) return res.status(400).json({ error: 'Type a question first.' });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction: `${langRule}\nKeep answers concise, encouraging, and easy to follow.\n\n${MCG_GUIDE}`,
      },
    });

    const reply = (response.text || '').trim();
    if (!reply) return res.status(502).json({ error: 'Empty response from AI.' });
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('AI helper error:', err);
    return res.status(500).json({ error: 'Could not reach AI helper right now. Please try again.' });
  }
};
