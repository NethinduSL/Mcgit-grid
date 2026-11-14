const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ---------- GitHub JSON database ----------
// GitHub repo as a JSON database. Each collection = data/<name>.json in a PRIVATE data repo.
const REPO = process.env.GITHUB_REPO;      // e.g. "nethindu/lms-data"
const TOKEN = process.env.GITHUB_TOKEN;    // fine-grained PAT, Contents: read/write, only that repo
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'school-lms',
  'X-GitHub-Api-Version': '2022-11-28'
};
const url = n => `https://api.github.com/repos/${REPO}/contents/data/${n}.json`;

function cfg(status) {
  const m = status === 401 || status === 403 || status === 404
    ? 'Server configuration error (GitHub token / repo). Please contact the administrator.'
    : 'Database is busy, please try again.';
  return Object.assign(new Error(m), { code: status === 403 || status === 429 ? 503 : 500 });
}

async function read(name) {
  const r = await fetch(url(name), { headers: H, cache: 'no-store' });
  if (r.status === 404) return { data: [], sha: undefined };
  if (!r.ok) { console.error('GitHub read failed', r.status, await r.text()); throw cfg(r.status); }
  const j = await r.json();
  return { data: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')), sha: j.sha };
}

async function write(name, data, sha) {
  const r = await fetch(url(name), {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      message: `update ${name}`,
      content: Buffer.from(JSON.stringify(data, null, 1)).toString('base64'),
      sha
    })
  });
  if (r.status === 409 || r.status === 422) throw Object.assign(new Error('conflict'), { conflict: true });
  if (!r.ok) { console.error('GitHub write failed', r.status, await r.text()); throw cfg(r.status); }
}

// read -> fn(data) mutates in place -> write. Retries if two people write at the same time.
async function update(name, fn) {
  for (let i = 0; i < 5; i++) {
    const { data, sha } = await read(name);
    const out = await fn(data);          // if fn throws, nothing is written
    try { await write(name, data, sha); return out; }
    catch (e) { if (!e.conflict) throw e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }
  }
  throw Object.assign(new Error('Server busy, try again'), { code: 503 });
}
// ---------- API ----------


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

// Open /api in a browser to see what is wrong (no secrets are shown)
async function diagnose() {
  const env = { GITHUB_TOKEN: !!process.env.GITHUB_TOKEN, GITHUB_REPO: !!REPO, JWT_SECRET: !!SECRET, TEACHER_CODE: !!process.env.TEACHER_CODE };
  const out = { status: 'api is running', node: process.version, env };
  if (Object.values(env).includes(false)) out.problem = 'Missing environment variable(s) marked false above. Add them in Vercel and redeploy.';
  else if (!/^[\w.-]+\/[\w.-]+$/.test(REPO)) out.problem = 'GITHUB_REPO must look like owner/repo, not a URL';
  else {
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO, { headers: H });
      const j = await r.json().catch(() => ({}));
      if (r.status === 200) {
        out.github = { reachable: true, private: !!j.private };
        if (!j.private) out.problem = 'Data repo is PUBLIC. Make it private (it stores emails and password hashes).';
        const c = await fetch('https://api.github.com/repos/' + REPO + '/commits?per_page=1', { headers: H });
        if (c.status === 409) out.problem = 'Data repo is empty. Create a README.md in it first.';
      } else {
        out.github = { reachable: false, httpStatus: r.status };
        out.problem = r.status === 401 ? 'GITHUB_TOKEN is invalid or expired'
          : r.status === 404 ? 'Repo not found, or the token has no access to it (token must be limited to this repo with Contents: Read and write)'
          : 'GitHub returned ' + r.status;
      }
    } catch (e) { out.problem = 'Could not reach GitHub'; }
  }
  if (!out.problem) out.problem = 'none - setup looks fine';
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') { try { return res.status(200).json(await diagnose()); } catch (e) { return res.status(500).json({ error: 'diagnose failed' }); } }
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
