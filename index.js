const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { read, update } = require('../lib/db');

const SECRET = process.env.JWT_SECRET;
const fail = (m, c = 400) => { throw Object.assign(new Error(m), { code: c }); };
const pub = u => ({ id: u.id, email: u.email, name: u.name, grade: u.grade, role: u.role });
const sign = u => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const str = (v, n) => String(v ?? '').slice(0, n);
const PUBLIC = ['register', 'login'];
const TEACHER = ['createHomework', 'deleteHomework', 'submissions', 'grade'];

const A = {
  async register(b) {
    const email = str(b.email, 120).trim().toLowerCase();
    if (!email.includes('@') || str(b.password, 100).length < 6) fail('Valid email and password (6+ chars) required');
    const hash = await bcrypt.hash(b.password, 10);
    const role = process.env.TEACHER_CODE && b.code === process.env.TEACHER_CODE ? 'teacher' : 'student';
    const u = await update('users', users => {
      if (users.some(x => x.email === email)) fail('Email already registered');
      const u = { id: crypto.randomUUID(), email, hash, name: str(b.name, 80), grade: str(b.grade, 20), role, created: new Date().toISOString() };
      users.push(u); return u;
    });
    return { token: sign(u), user: pub(u) };
  },
  async login(b) {
    const email = str(b.email, 120).trim().toLowerCase();
    const { data } = await read('users');
    const u = data.find(x => x.email === email);
    if (!u || !(await bcrypt.compare(str(b.password, 100), u.hash))) fail('Wrong email or password', 401);
    return { token: sign(u), user: pub(u) };
  },
  async me(b, me) {
    const { data } = await read('users');
    const u = data.find(x => x.id === me.id); if (!u) fail('Account not found', 401);
    return { user: pub(u) };
  },
  async updateProfile(b, me) {
    return { user: await update('users', users => {
      const u = users.find(x => x.id === me.id); if (!u) fail('Account not found', 401);
      u.name = str(b.name, 80); u.grade = str(b.grade, 20); return pub(u);
    }) };
  },
  async changePassword(b, me) {
    if (str(b.password, 100).length < 6) fail('Password must be 6+ chars');
    const hash = await bcrypt.hash(b.password, 10);
    await update('users', users => { const u = users.find(x => x.id === me.id); if (!u) fail('Account not found', 401); u.hash = hash; });
    return { ok: true };
  },
  async homeworks(b, me) {
    const [{ data: homeworks }, { data: subs }] = await Promise.all([read('homeworks'), read('submissions')]);
    return { homeworks: homeworks.slice().reverse(), mine: subs.filter(s => s.studentId === me.id) };
  },
  async submit(b, me) {
    const answer = str(b.answer, 5000), link = str(b.link, 500).trim();
    if (!answer.trim() && !link) fail('Write an answer or add a link');
    if (link && !/^https?:\/\//i.test(link)) fail('Link must start with http:// or https://');
    const { data: hws } = await read('homeworks');
    if (!hws.some(h => h.id === b.homeworkId)) fail('Homework not found', 404);
    await update('submissions', subs => {
      let s = subs.find(x => x.homeworkId === b.homeworkId && x.studentId === me.id);
      if (!s) { s = { id: crypto.randomUUID(), homeworkId: b.homeworkId, studentId: me.id, marks: null, feedback: '' }; subs.push(s); }
      s.answer = answer; s.link = link; s.submittedAt = new Date().toISOString();
    });
    return { ok: true };
  },
  // ---- teacher only ----
  async createHomework(b, me) {
    if (!str(b.title, 150).trim()) fail('Title required');
    await update('homeworks', h => h.push({ id: crypto.randomUUID(), title: str(b.title, 150), description: str(b.description, 3000), due: str(b.due, 10), by: me.id, created: new Date().toISOString() }));
    return { ok: true };
  },
  async deleteHomework(b) {
    await update('homeworks', h => { const i = h.findIndex(x => x.id === b.id); if (i >= 0) h.splice(i, 1); });
    return { ok: true };
  },
  async submissions(b) {
    const [{ data: subs }, { data: users }] = await Promise.all([read('submissions'), read('users')]);
    return { submissions: subs.filter(s => s.homeworkId === b.homeworkId).map(s => {
      const u = users.find(x => x.id === s.studentId) || {};
      return { ...s, name: u.name, grade: u.grade };
    }) };
  },
  async grade(b) {
    await update('submissions', subs => {
      const s = subs.find(x => x.id === b.id); if (!s) fail('Not found', 404);
      s.marks = b.marks === '' || b.marks == null ? null : Number(b.marks); s.feedback = str(b.feedback, 500);
    });
    return { ok: true };
  }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!SECRET || !process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
      console.error('Missing environment variables: JWT_SECRET, GITHUB_TOKEN, GITHUB_REPO');
      fail('Server is not configured yet. Please contact the administrator.', 500);
    }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    b = b || {};
    const fn = A[b.action]; if (!fn) fail('Unknown action');
    let me = null;
    if (!PUBLIC.includes(b.action)) {
      try { me = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); }
      catch { fail('Please login again', 401); }
      if (TEACHER.includes(b.action) && me.role !== 'teacher') fail('Teachers only', 403);
    }
    res.status(200).json(await fn(b, me));
  } catch (e) {
    if (!e.code) console.error(e);
    res.status(e.code || 500).json({ error: e.code ? e.message : 'Server error, please try again' });
  }
};
