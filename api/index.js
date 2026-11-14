const CONFIG = { GITHUB_REPO: 'NethinduSL/Mcgitdb' };
const clean = v => String(v == null ? '' : v).trim().replace(/^["']+|["']+$/g, '').trim();
const setting = k => clean(process.env[k]) || clean(CONFIG[k]);

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const REPO = setting('GITHUB_REPO');
const TOKEN = setting('GITHUB_TOKEN');
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'school-lms',
  'X-GitHub-Api-Version': '2022-11-28'
};
const url = n => `https://api.github.com/repos/${REPO}/contents/data/${n}.json`;
const fileUrl = p => `https://api.github.com/repos/${REPO}/contents/${p}`;

function cfg(status) {
  const m = status === 401 || status === 403 || status === 404
    ? 'Server configuration error (GitHub token / repo, GitHub status ' + status + '). Please contact the administrator.'
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

async function update(name, fn) {
  for (let i = 0; i < 5; i++) {
    const { data, sha } = await read(name);
    const out = await fn(data);
    try { await write(name, data, sha); return out; }
    catch (e) { if (!e.conflict) throw e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }
  }
  throw Object.assign(new Error('Server busy, try again'), { code: 503 });
}

const SECRET = TOKEN ? crypto.createHash('sha256').update('mcg-it-grid:' + TOKEN).digest('hex') : '';
const fail = (m, c = 400) => { throw Object.assign(new Error(m), { code: c }); };
const pub = u => ({ id: u.id, email: u.email || '', name: u.name, grade: u.grade, no: u.no || '', role: u.role });
const nk = v => String(v ?? '').slice(0, 120).trim().toLowerCase().replace(/\s+/g, ' ');
const sign = u => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const str = (v, n) => String(v ?? '').slice(0, n);
const PUBLIC = ['register', 'login'];
const TEMP = { id: 'temp-nt', email: 'nt', name: 'NT (temp)', grade: 'Temp', role: 'student' };
const isTemp = me => me && me.id === TEMP.id;
const TEACHER = ['createHomework', 'deleteHomework', 'submissions', 'grade', 'students', 'studentWork', 'marksSheet'];
const IMG_RE = /^images\/[\w-]+\.(jpg|png|webp)$/;
const cleanImgs = a => (Array.isArray(a) ? a : []).filter(p => typeof p === 'string' && IMG_RE.test(p)).slice(0, 5);
const gradeKey = g => String(g || '').toUpperCase().replace(/\s+/g, '').replace(/^GRADE/, '');
const cleanTargets = a => [...new Set((Array.isArray(a) ? a : []).map(gradeKey).filter(x => /^\d{1,2}(-[A-Z])?$/.test(x)))].slice(0, 60);
const sees = (h, g) => {
  const t = h.targets;
  if (!Array.isArray(t) || !t.length) return true;
  const k = gradeKey(g);
  return t.some(x => x === k || x === k.split('-')[0]);
};

const A = {
  async register(b) {
    const name = str(b.name, 80).trim().replace(/\s+/g, ' ');
    const password = str(b.password, 100);
    if (name.length < 2) fail('Name is required');
    if (password.length < 6) fail('Password must be 6+ characters');
    const role = setting('TEACHER_CODE') && b.code === setting('TEACHER_CODE') ? 'teacher' : 'student';
    const grade = str(b.grade, 20), no = str(b.no, 6).trim();
    if (role === 'student') {
      if (!grade) fail('Select your grade and section');
      if (!/^\d{1,3}$/.test(no)) fail('Enter your class number');
    }
    const hash = await bcrypt.hash(password, 10);
    const u = await update('users', async users => {
      for (const x of users) {
        if (role === 'student' && x.role === 'student' && gradeKey(x.grade) === gradeKey(grade) && String(x.no || '') === no) fail('This class number is already registered in that class');
        if (nk(x.name) === nk(name) && await bcrypt.compare(password, x.hash)) fail('Someone with this name already uses this password. Please choose a different password');
      }
      const u = { id: crypto.randomUUID(), email: str(b.email, 120).trim().toLowerCase(), name, hash, grade: role === 'student' ? grade : '', no: role === 'student' ? no : '', role, created: new Date().toISOString() };
      users.push(u); return u;
    });
    return { token: sign(u), user: pub(u) };
  },
  async login(b) {
    const id = nk(b.name ?? b.email), pw = str(b.password, 100);
    if (id === TEMP.email && pw === 'nt') return { token: sign(TEMP), user: pub(TEMP) };
    const { data } = await read('users');
    for (const u of data.filter(x => nk(x.name) === id || (x.email && x.email === id))) {
      if (await bcrypt.compare(pw, u.hash)) return { token: sign(u), user: pub(u) };
    }
    fail('Wrong name or password', 401);
  },
  async me(b, me) {
    if (isTemp(me)) return { user: pub(TEMP) };
    const { data } = await read('users');
    const u = data.find(x => x.id === me.id); if (!u) fail('Account not found', 401);
    return { user: pub(u) };
  },
  async updateProfile(b, me) {
    if (isTemp(me)) return { user: { ...pub(TEMP), name: str(b.name, 80), grade: str(b.grade, 20), no: str(b.no, 6) } };
    return { user: await update('users', users => {
      const u = users.find(x => x.id === me.id); if (!u) fail('Account not found', 401);
      u.name = str(b.name, 80).trim().replace(/\s+/g, ' ') || u.name; u.grade = str(b.grade, 20); u.no = str(b.no, 6).trim(); return pub(u);
    }) };
  },
  async changePassword(b, me) {
    if (isTemp(me)) fail('Temp account password cannot be changed');
    if (str(b.password, 100).length < 6) fail('Password must be 6+ chars');
    const hash = await bcrypt.hash(b.password, 10);
    await update('users', users => { const u = users.find(x => x.id === me.id); if (!u) fail('Account not found', 401); u.hash = hash; });
    return { ok: true };
  },
  async homeworks(b, me) {
    if (isTemp(me)) { try { const [{ data: h }, { data: s }] = await Promise.all([read('homeworks'), read('submissions')]); return { homeworks: h.slice().reverse(), mine: s.filter(x => x.studentId === me.id) }; } catch (e) { return { homeworks: [], mine: [] }; } }
    const [{ data: homeworks }, { data: subs }, { data: users }] = await Promise.all([read('homeworks'), read('submissions'), me.role === 'student' ? read('users') : Promise.resolve({ data: [] })]);
    let list = homeworks;
    if (me.role === 'student') { const u = users.find(x => x.id === me.id); list = homeworks.filter(h => sees(h, u && u.grade)); }
    return { homeworks: list.slice().reverse(), mine: subs.filter(s => s.studentId === me.id) };
  },
  async submit(b, me) {
    if (isTemp(me)) fail('Temp account is view-only');
    const answer = str(b.answer, 5000), link = str(b.link, 500).trim();
    const images = cleanImgs(b.images);
    if (!answer.trim() && !link && !images.length) fail('Write an answer, add a link or attach an image');
    if (link && !/^https?:\/\//i.test(link)) fail('Link must start with http:// or https://');
    const { data: hws } = await read('homeworks');
    if (!hws.some(h => h.id === b.homeworkId)) fail('Homework not found', 404);
    await update('submissions', subs => {
      let s = subs.find(x => x.homeworkId === b.homeworkId && x.studentId === me.id);
      if (!s) { s = { id: crypto.randomUUID(), homeworkId: b.homeworkId, studentId: me.id, marks: null, feedback: '' }; subs.push(s); }
      s.answer = answer; s.link = link; s.images = images; s.submittedAt = new Date().toISOString();
    });
    return { ok: true };
  },
  async createHomework(b, me) {
    if (!str(b.title, 150).trim()) fail('Title required');
    await update('homeworks', h => h.push({ id: crypto.randomUUID(), title: str(b.title, 150), description: str(b.description, 3000), due: str(b.due, 10), images: cleanImgs(b.images), targets: cleanTargets(b.targets), total: b.total === '' || b.total == null || isNaN(Number(b.total)) ? null : Math.max(0, Math.min(1000, Number(b.total))), by: me.id, created: new Date().toISOString() }));
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
  async uploadImage(b, me) {
    if (isTemp(me)) fail('Temp account is view-only');
    const d = typeof b.data === 'string' ? b.data : '';
    if (d.length > 4400000) fail('Image is too large');
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(d);
    if (!m) fail('Only JPG, PNG or WEBP images are allowed');
    const path = `images/${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    const r = await fetch(fileUrl(path), { method: 'PUT', headers: H, body: JSON.stringify({ message: 'add image', content: m[2] }) });
    if (!r.ok) { console.error('GitHub image write failed', r.status, await r.text()); throw cfg(r.status); }
    return { path };
  },
  async getImage(b) {
    const p = str(b.path, 100);
    if (!IMG_RE.test(p)) fail('Bad image path');
    const r = await fetch(fileUrl(p), { headers: { ...H, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.status === 404) fail('Image not found', 404);
    if (!r.ok) { console.error('GitHub image read failed', r.status); throw cfg(r.status); }
    const ext = p.split('.').pop();
    return { data: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + Buffer.from(await r.arrayBuffer()).toString('base64') };
  },
  async students() {
    const [{ data: users }, { data: subs }] = await Promise.all([read('users'), read('submissions')]);
    return { students: users.filter(u => u.role === 'student').map(u => ({ id: u.id, name: u.name, no: u.no || '', grade: u.grade, submitted: subs.filter(s => s.studentId === u.id).length })) };
  },
  async studentWork(b) {
    const [{ data: hws }, { data: subs }, { data: users }] = await Promise.all([read('homeworks'), read('submissions'), read('users')]);
    const u = users.find(x => x.id === b.studentId && x.role === 'student');
    if (!u) fail('Student not found', 404);
    return { student: pub(u), items: hws.filter(h => sees(h, u.grade)).reverse().map(h => ({ homework: h, submission: subs.find(s => s.homeworkId === h.id && s.studentId === u.id) || null })) };
  },
  async marksSheet() {
    const [{ data: hws }, { data: subs }, { data: users }] = await Promise.all([read('homeworks'), read('submissions'), read('users')]);
    return {
      homeworks: hws.map(h => ({ id: h.id, title: h.title, due: h.due, total: h.total ?? null, targets: h.targets || [] })),
      students: users.filter(u => u.role === 'student').map(u => ({ id: u.id, name: u.name, no: u.no || '', grade: u.grade })),
      submissions: subs.map(s => ({ homeworkId: s.homeworkId, studentId: s.studentId, marks: s.marks ?? null, submittedAt: s.submittedAt }))
    };
  },
  async grade(b) {
    await update('submissions', subs => {
      const s = subs.find(x => x.id === b.id); if (!s) fail('Not found', 404);
      s.marks = b.marks === '' || b.marks == null ? null : Number(b.marks); s.feedback = str(b.feedback, 500);
    });
    return { ok: true };
  }
};

async function diagnose() {
  const env = { GITHUB_TOKEN: !!TOKEN, GITHUB_REPO: !!REPO, TEACHER_CODE: !!setting('TEACHER_CODE') };
  const out = { status: 'api is running', node: process.version, env };
  if (Object.values(env).includes(false)) out.problem = 'Setting(s) marked false above are empty. Fill them in the SETTINGS block at the top of api/index.js, then commit.';
  else if (!/^[\w.-]+\/[\w.-]+$/.test(REPO)) out.problem = 'GITHUB_REPO must look like owner/repo, not a URL';
  else {
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO, { headers: H });
      const j = await r.json().catch(() => ({}));
      if (r.status === 200) {
        out.github = { reachable: true, private: !!j.private, canWrite: j.permissions ? !!j.permissions.push : 'unknown' };
        if (j.permissions && !j.permissions.push) out.problem = 'Token is read-only. Edit the token and set Contents to Read and write.';
        else if (!j.private) out.problem = 'Data repo is PUBLIC. Make it private (it stores emails and password hashes).';
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
    if (!SECRET || !TOKEN || !REPO) {
      console.error('Missing settings: GITHUB_TOKEN, GITHUB_REPO');
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
