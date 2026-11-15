/* Teacher side of polls & quizzes. Loaded by admin.html, which provides
   $, api, esc, val, fmt, busy, toast, skeleton, tg, drawTargets, tlabel, loadXlsx. */

let pollList = [], qs = [];
const resCache = {};

const QT = {
  single:  ['Single choice',   'fa-circle-dot'],
  multi:   ['Multiple choice', 'fa-square-check'],
  tf:      ['True / False',    'fa-toggle-on'],
  short:   ['Short answer',    'fa-pen'],
  opinion: ['Opinion poll',    'fa-chart-simple']
};
const newQ = type => ({
  type, text: '', points: type === 'opinion' ? 0 : 1,
  options: type === 'tf' ? ['True', 'False'] : type === 'short' ? [] : ['', ''],
  correct: [], accepted: ['']
});
const numFmt = n => Number.isInteger(n) ? n : (+n).toFixed(1);

async function viewPolls() {
  $('view').innerHTML = skeleton(3);
  try { pollList = (await api('polls')).polls; }
  catch (e) { $('view').innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>' + esc(e.message) + '</div>'; return; }
  qs = []; tg = new Set();
  $('view').innerHTML = `
  <div class="card"><h2><i class="fa-solid fa-plus"></i> New poll or quiz</h2>
    <div class="row">
      <div class="field"><label>Title</label><input id="pt" placeholder="e.g. Chapter 3 quick quiz"></div>
      <div class="field"><label>Closes on <small style="font-weight:400;opacity:.7">(optional)</small></label><input id="pdue" type="date"></div>
    </div>
    <div class="field"><label>Note for students <small style="font-weight:400;opacity:.7">(optional)</small></label><input id="pd" placeholder="e.g. 10 minutes, no notes"></div>
    <label class="sw" style="margin-bottom:16px"><input type="checkbox" id="pshow" checked><span class="tr"></span>Show correct answers to students after they submit</label>

    <label>Questions</label>
    <div id="qbox"></div>
    <div class="hint" style="margin:0 0 8px"><i class="fa-solid fa-plus"></i> Add a question</div>
    <div class="addq">${Object.keys(QT).map(t => `<button type="button" onclick="addQ('${t}')"><i class="fa-solid ${QT[t][1]}"></i> ${QT[t][0]}</button>`).join('')}</div>

    <div class="field"><label>Send to</label><div id="tg"></div><div class="meta" id="tsum" style="margin-top:8px"></div></div>
    <button class="btn" type="button" id="pb" onclick="addPoll()"><i class="fa-solid fa-paper-plane"></i> Publish to students</button>
  </div>
  <h2 class="sec"><i class="fa-solid fa-square-poll-vertical"></i> Your polls &amp; quizzes</h2>
  <div id="plist"></div>`;
  drawQs(); drawTargets(); drawPollList();
}

/* ---------- builder ---------- */
function addQ(type) {
  qs.push(newQ(type)); drawQs();
  const last = $('qbox').lastElementChild;
  if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = last.querySelector('input[type=text], input:not([type])'); if (i) i.focus({ preventScroll: true }); }
}
function delQ(i) { qs.splice(i, 1); drawQs(); }
function moveQ(i, d) { const j = i + d; if (j < 0 || j >= qs.length) return; [qs[i], qs[j]] = [qs[j], qs[i]]; drawQs(); }
function tick(i, j) {
  const q = qs[i];
  if (q.type === 'multi') q.correct = q.correct.includes(j) ? q.correct.filter(x => x !== j) : [...q.correct, j];
  else q.correct = [j];
  drawQs();
}
function addOpt(i) { if (qs[i].options.length < 8) { qs[i].options.push(''); drawQs(); } }
function delOpt(i, j) {
  const q = qs[i]; if (q.options.length <= 2) return;
  q.options.splice(j, 1); q.correct = q.correct.filter(c => c !== j).map(c => c > j ? c - 1 : c); drawQs();
}
function addAcc(i) { if (qs[i].accepted.length < 10) { qs[i].accepted.push(''); drawQs(); } }
function delAcc(i, j) { const q = qs[i]; if (q.accepted.length <= 1) return; q.accepted.splice(j, 1); drawQs(); }
function setTF(i, v) { qs[i].correct = [v]; drawQs(); }

function qBody(q, i) {
  if (q.type === 'tf') return `<div class="tfpick">${['True', 'False'].map((t, v) =>
    `<button type="button" class="${q.correct[0] === v ? 'on' : ''}" onclick="setTF(${i},${v})"><i class="fa-solid ${v ? 'fa-xmark' : 'fa-check'}"></i> ${t}</button>`).join('')}</div>
    <div class="hint"><i class="fa-solid fa-circle-info"></i> Tap the correct answer</div>`;
  if (q.type === 'short') return q.accepted.map((a, j) => `<div class="optrow"><input value="${esc(a)}" placeholder="${j ? 'Another accepted answer' : 'Correct answer'}" oninput="qs[${i}].accepted[${j}]=this.value">
      <button type="button" class="mini del" ${q.accepted.length <= 1 ? 'disabled' : ''} onclick="delAcc(${i},${j})" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button></div>`).join('') +
    `<div style="margin-top:10px"><button type="button" class="btn sm ghost" onclick="addAcc(${i})"${q.accepted.length >= 10 ? ' disabled' : ''}><i class="fa-solid fa-plus"></i> Accept another spelling</button></div>
    <div class="hint"><i class="fa-solid fa-circle-info"></i> Capital letters and extra spaces are ignored when checking</div>`;
  const marked = q.type !== 'opinion';
  return q.options.map((o, j) => `<div class="optrow">
      ${marked ? `<button type="button" class="tick ${q.type === 'multi' ? 'sq' : ''} ${q.correct.includes(j) ? 'on' : ''}" onclick="tick(${i},${j})" aria-label="Mark as correct" title="Mark as correct"><i class="fa-solid fa-check"></i></button>` : ''}
      <input value="${esc(o)}" placeholder="Option ${j + 1}" oninput="qs[${i}].options[${j}]=this.value">
      <button type="button" class="mini del" ${q.options.length <= 2 ? 'disabled' : ''} onclick="delOpt(${i},${j})" aria-label="Remove option"><i class="fa-solid fa-xmark"></i></button></div>`).join('') +
    `<div style="margin-top:10px"><button type="button" class="btn sm ghost" onclick="addOpt(${i})"${q.options.length >= 8 ? ' disabled' : ''}><i class="fa-solid fa-plus"></i> Add option</button></div>` +
    (marked ? `<div class="hint"><i class="fa-solid fa-circle-info"></i> ${q.type === 'multi' ? 'Tick every correct answer. Students must pick all of them to get the marks' : 'Tick the correct answer'}</div>`
      : '<div class="hint"><i class="fa-solid fa-circle-info"></i> Opinion questions have no right answer and no marks</div>');
}
function drawQs() {
  $('qbox').innerHTML = qs.map((q, i) => `<div class="qb">
    <div class="qb-top"><span class="qn">${i + 1}</span>
      <span class="badge y"><i class="fa-solid ${QT[q.type][1]}"></i> ${QT[q.type][0]}</span><span class="sp"></span>
      ${q.type !== 'opinion' ? `<label class="pts">Marks <input type="number" min="0" max="100" value="${esc(q.points)}" oninput="qs[${i}].points=this.value"></label>` : ''}
      <button type="button" class="mini" ${i === 0 ? 'disabled' : ''} onclick="moveQ(${i},-1)" aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button>
      <button type="button" class="mini" ${i === qs.length - 1 ? 'disabled' : ''} onclick="moveQ(${i},1)" aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button>
      <button type="button" class="mini del" onclick="delQ(${i})" aria-label="Delete question"><i class="fa-solid fa-trash"></i></button></div>
    <input value="${esc(q.text)}" placeholder="Type your question" oninput="qs[${i}].text=this.value">
    ${qBody(q, i)}</div>`).join('') ||
    '<div class="empty" style="padding:22px"><i class="fa-regular fa-circle-question"></i>No questions yet. Pick a type below to start.</div>';
}

async function addPoll() {
  const btn = $('pb');
  if (!val('pt')) { toast('Give your poll a title', true); return; }
  if (!qs.length) { toast('Add at least one question', true); return; }
  busy(btn, true, 'Publishing');
  try {
    await api('createPoll', {
      title: val('pt'), description: val('pd'), due: val('pdue'), showAnswers: $('pshow').checked, targets: [...tg],
      questions: qs.map(q => ({ type: q.type, text: q.text, points: q.points, options: q.options, correct: q.correct, accepted: q.accepted }))
    });
    toast('Poll published ✔'); await viewPolls();
  } catch (e) { toast(e.message, true); busy(btn, false); }
}

/* ---------- list ---------- */
function drawPollList() {
  $('plist').innerHTML = pollList.map(p => `<div class="card hw"><div class="ic"><i class="fa-solid fa-square-poll-vertical"></i></div><div class="body">
    <h3>${esc(p.title)}</h3>
    <div class="meta">${p.due ? `<span><i class="fa-regular fa-calendar"></i> Closes ${fmt(p.due)}</span>` : ''}
      <span class="badge"><i class="fa-solid fa-people-group"></i> ${esc(tlabel(p))}</span>
      <span class="badge"><i class="fa-solid fa-circle-question"></i> ${p.questions.length}</span>
      <span class="badge y" id="pc-${p.id}">${p.responses} submitted</span>
      <span class="badge">${p.showAnswers ? 'Answers shown' : 'Answers hidden'}</span></div>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    <button class="btn sm" type="button" onclick="pollRes('${p.id}')"><i class="fa-solid fa-chart-column"></i> Results</button>
    <button class="btn sm danger" type="button" onclick="delPoll('${p.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
    <div id="pr-${p.id}"></div></div></div>`).join('') ||
    '<div class="empty"><i class="fa-regular fa-folder-open"></i>No polls yet</div>';
}
async function delPoll(id) {
  if (!confirm('Delete this poll and all student answers?')) return;
  try { await api('deletePoll', { id }); toast('Deleted'); await viewPolls(); }
  catch (e) { toast(e.message, true); }
}

/* ---------- results ---------- */
function ansText(q, a) {
  if (a == null || a === '') return '';
  if (q.type === 'short') return String(a);
  return [].concat(a).map(i => q.options[i]).filter(x => x != null).join(', ');
}
async function pollRes(id) {
  const box = $('pr-' + id);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  box.innerHTML = skeleton(1);
  try { const r = await api('pollResults', { pollId: id }); resCache[id] = r; box.innerHTML = resHtml(r); }
  catch (e) { box.innerHTML = ''; toast(e.message, true); }
}
function resHtml(r) {
  const { poll: p, rows, missing, stats } = r, n = rows.length;
  const pcs = rows.filter(x => x.total).map(x => x.score / x.total * 100);
  const avg = pcs.length ? Math.round(pcs.reduce((a, b) => a + b, 0) / pcs.length) : null;
  const top = pcs.length ? Math.round(Math.max(...pcs)) : null;
  const sorted = rows.slice().sort((a, b) => String(a.grade).localeCompare(String(b.grade), undefined, { numeric: true }) || (+a.no || 0) - (+b.no || 0) || a.name.localeCompare(b.name));
  return `<div class="stat-row">
      <div class="mstat"><b>${n}</b><span>Submitted</span></div>
      <div class="mstat"><b>${missing.length}</b><span>Not yet</span></div>
      ${avg != null ? `<div class="mstat"><b>${avg}%</b><span>Class average</span></div><div class="mstat"><b>${top}%</b><span>Highest</span></div>` : ''}
    </div>
    ${n ? `<button class="btn sm dark" type="button" id="px-${p.id}" onclick="pollXlsx('${p.id}')"><i class="fa-solid fa-file-excel"></i> Download Excel</button>` : ''}
    ${missing.length ? `<div class="meta" style="margin:10px 0"><i class="fa-regular fa-clock"></i> Not submitted (${missing.length}): ${esc(missing.map(u => u.name + ' ' + u.grade).join(', '))}</div>` : ''}
    <div style="margin:16px 0 4px;font-weight:600">Question breakdown</div>
    ${p.questions.map((q, i) => qStat(q, i, stats[i], n)).join('')}
    ${n ? `<div style="margin:18px 0 4px;font-weight:600">Students</div>` + sorted.map(x => studCard(p, x)).join('') : ''}`;
}
function qStat(q, i, s, n) {
  let body;
  if (q.type === 'short') {
    const w = s.answered ? Math.round(s.right / s.answered * 100) : 0;
    body = `<div class="brow"><div class="lb2">Answered correctly</div><div class="bar ok"><i style="--w:${w}%"></i></div><div class="n">${s.right} / ${s.answered}</div></div>
      <div class="hint"><i class="fa-solid fa-lightbulb"></i> Accepted: ${esc(q.accepted.join(' · '))}</div>`;
  } else {
    const tot = s.answered || 1;
    body = q.options.map((o, j) => {
      const isRight = q.correct && q.correct.includes(j), c = s.count[j], w = Math.round(c / tot * 100);
      return `<div class="brow"><div class="lb2">${isRight ? '<i class="fa-solid fa-check ok-t"></i> ' : ''}${esc(o)}</div><div class="bar ${isRight ? 'ok' : ''}"><i style="--w:${w}%"></i></div><div class="n">${c} · ${w}%</div></div>`;
    }).join('');
  }
  return `<div class="sublist"><div class="who"><span class="qn">${i + 1}</span> ${esc(q.text)}</div>${body}</div>`;
}
function studCard(p, x) {
  return `<details class="sublist"><summary class="who"><i class="fa-solid fa-user-graduate" style="color:var(--y2)"></i> ${esc(x.name)} <span class="badge">${esc(x.grade || '-')}</span>
    ${x.total ? `<span class="badge ${x.score / x.total >= .5 ? 'ok' : 'late'}">${numFmt(x.score)} / ${numFmt(x.total)}</span>` : '<span class="badge">Opinion</span>'}</summary>
    ${p.questions.map((q, i) => {
      const it = x.items.find(t => t.id === q.id) || {}, a = ansText(q, it.yours);
      const mark = it.ok === true ? '<span class="ok-t"><i class="fa-solid fa-check"></i> Right</span>' : it.ok === false ? '<span class="no-t"><i class="fa-solid fa-xmark"></i> Wrong</span>' : '';
      const fix = it.ok === false ? `<div class="meta">Correct: ${esc(q.type === 'short' ? q.accepted.join(' · ') : (q.correct || []).map(k => q.options[k]).join(', '))}</div>` : '';
      return `<div class="tq"><b>${i + 1}. ${esc(q.text)}</b><div>${a ? esc(a) : '<i style="opacity:.6">No answer</i>'} ${mark}</div>${fix}</div>`;
    }).join('')}
    <div class="meta" style="margin-top:10px">Submitted ${fmt(x.submittedAt)}
      <button class="btn sm danger" type="button" style="margin-left:auto" onclick="resetResp('${x.id}','${p.id}')"><i class="fa-solid fa-rotate-left"></i> Let them retake</button></div></details>`;
}
async function resetResp(rid, pid) {
  if (!confirm('Delete this answer so the student can take the quiz again?')) return;
  try {
    await api('resetResponse', { id: rid }); toast('Answer removed');
    const c = $('pc-' + pid); if (c) c.textContent = Math.max(0, (parseInt(c.textContent) || 1) - 1) + ' submitted';
    $('pr-' + pid).innerHTML = ''; await pollRes(pid);
  } catch (e) { toast(e.message, true); }
}
async function pollXlsx(id) {
  const btn = $('px-' + id), r = resCache[id]; busy(btn, true, 'Preparing');
  try {
    await loadXlsx();
    const { poll: p, rows } = r;
    const sorted = rows.slice().sort((a, b) => String(a.grade).localeCompare(String(b.grade), undefined, { numeric: true }) || (+a.no || 0) - (+b.no || 0) || a.name.localeCompare(b.name));
    const head = ['No', 'Name', 'Class', 'Class No', 'Score', 'Out of', 'Percent', 'Submitted', ...p.questions.map((q, i) => 'Q' + (i + 1) + ' ' + q.text.slice(0, 40))];
    const data = sorted.map((x, i) => [i + 1, x.name, x.grade, x.no, x.score, x.total, x.total ? Math.round(x.score / x.total * 100) + '%' : '-', fmt(x.submittedAt),
      ...p.questions.map(q => { const it = x.items.find(t => t.id === q.id) || {}; return ansText(q, it.yours) + (it.ok === true ? ' ✓' : it.ok === false ? ' ✗' : ''); })]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...data]);
    ws['!cols'] = head.map((h, i) => ({ wch: i === 1 ? 26 : i < 8 ? 11 : 24 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Results');
    const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'poll';
    XLSX.writeFile(wb, 'poll-' + slug + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    toast('Excel file downloaded ✔');
  } catch (e) { toast(e.message, true); }
  busy(btn, false);
}
