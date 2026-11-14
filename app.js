const BRAND = 'MCG IT Grid';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val = id => $(id).value.trim();
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

let token = localStorage.getItem('lms_token');
let me = JSON.parse(localStorage.getItem('lms_user') || 'null');

async function api(action, body = {}) {
  const r = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ action, ...body })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && token) logout(); throw new Error(j.error || 'Something went wrong'); }
  return j;
}
function saveSession(j) {
  token = j.token || token; me = j.user;
  localStorage.setItem('lms_token', token); localStorage.setItem('lms_user', JSON.stringify(me));
}
function home() { return me && me.role === 'teacher' ? 'admin.html' : 'home.html'; }
function logout() { localStorage.removeItem('lms_token'); localStorage.removeItem('lms_user'); location.href = 'index.html'; }

// call at top of every protected page; role = 'student' | 'teacher' | undefined
function guard(role) {
  if (!token || !me) { location.href = 'index.html'; return false; }
  if (role && me.role !== role) { location.href = home(); return false; }
  return true;
}
function renderNav(active) {
  const links = me.role === 'teacher'
    ? [['admin', 'admin.html', 'fa-chalkboard-user', 'Admin']]
    : [['home', 'home.html', 'fa-house', 'Home']];
  links.push(['profile', 'profile.html', 'fa-user', 'Profile']);
  $('nav').innerHTML = `<div class="in">
    <div class="brand"><span class="glogo"><b></b><b></b><b></b><b></b></span><span>MCG <em>IT Grid</em></span></div>
    ${links.map(l => `<a class="link ${l[0] === active ? 'on' : ''}" href="${l[1]}"><i class="fa-solid ${l[2]}"></i><span>${l[3]}</span></a>`).join('')}
    <button class="link" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i><span>Logout</span></button></div>`;
  if (!document.querySelector('.foot')) document.body.insertAdjacentHTML('beforeend', '<div class="foot"><b>MCG IT Grid</b> · ICT Learning Management System</div>');
}
let tt;
function toast(t, bad) {
  const el = $('toast'); el.textContent = t; el.className = 'toast' + (bad ? ' bad' : ''); el.style.display = 'block';
  clearTimeout(tt); tt = setTimeout(() => el.style.display = 'none', 2800);
}
