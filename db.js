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

module.exports = { read, update };
