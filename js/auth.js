import { AUTH_CONFIG } from './config.js?v=staging-9dd816f';
import { track } from './track.js?v=staging-9dd816f';

(() => {
const KEY = 'stw.auth.session';
const DOMAIN = '@users.singlish.local';
const USER_RE = /^[a-z0-9_]{3,20}$/;
const $ = id => document.getElementById(id);
const btn = $('authBtn'), modal = $('authModal');

if (!AUTH_CONFIG.url || !AUTH_CONFIG.anonKey || !btn || !modal) return;
btn.hidden = false;

const tabsEl = $('authTabs'), tabL = $('authTabLogin'), tabR = $('authTabRegister'),
  formL = $('authLoginForm'), formR = $('authRegisterForm'),
  loginUser = $('authLoginUser'), loginPass = $('authLoginPass'), loginBtn = $('authLoginBtn'), errL = $('authErrLogin'),
  regUser = $('authRegUser'), regPass = $('authRegPass'), regPass2 = $('authRegPass2'), regBtn = $('authRegBtn'), errR = $('authErrReg'),
  regHint = $('authRegHint'), closeBtn = $('authClose');

const ERR = { net: '连接失败，请稍后再试', rate: '操作太频繁，请稍后再试', user: '用户名需 3-20 位小写字母、数字或下划线', pass: '密码至少 6 位', match: '两次输入的密码不一致', taken: '用户名已被注册', reg: '注册失败，请稍后再试或换个用户名', cred: '用户名或密码不对', misc: '出错了，请稍后再试（可刷新页面）' };

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
const clear = () => { try { localStorage.removeItem(KEY); } catch {} };

const stale = s => !s?.access_token || !s.expires_at || s.expires_at < Date.now() / 1000 + 30;
const loggedIn = () => { const s = read(); return !!s && !stale(s); };

const synth = u => u + DOMAIN;
const nameOf = s => s?.username || String(s?.email || '').split('@')[0] || '';

async function call(path, body, method, bearer) {
  const s = read(), h = { 'Content-Type': 'application/json', apikey: AUTH_CONFIG.anonKey };
  if (bearer || s?.access_token) h.Authorization = 'Bearer ' + (bearer || s.access_token);
  let res;
  try { res = await fetch(AUTH_CONFIG.url + path, { method: method || 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { e.net = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.msg || data.message || data.error_description || 'HTTP ' + res.status);
    e.status = res.status; e.code = data.error_code || data.code; throw e;
  }
  return data;
}

const mapErr = (e, reg) => e?.net ? ERR.net
  : e?.status === 429 || /rate/i.test(e?.code || '') ? ERR.rate
  : e?.code === 'weak_password' ? ERR.pass
  : reg && (e?.status === 422 || /already registered/i.test(e?.message || '')) ? ERR.taken
  : reg && e?.status === 500 && /database error saving new user/i.test(e?.message || '') ? ERR.reg
  : !reg && (e?.status === 400 || /invalid credentials/i.test(e?.message || '')) ? ERR.cred
  : ERR.misc;

const emitAuth = (on, email, userId, username) =>
  window.dispatchEvent(new CustomEvent('stw:auth', { detail: { loggedIn: on, email: email || null, userId: userId || null, username: username || null } }));

const say = (el, msg) => { el.textContent = msg; };
const lock = (b, on) => { b.disabled = on; };

function show(name, focus) {
  const onLogin = name === 'login';
  tabL.setAttribute('aria-selected', String(onLogin));
  tabR.setAttribute('aria-selected', String(!onLogin));
  tabL.tabIndex = onLogin ? 0 : -1;
  tabR.tabIndex = onLogin ? -1 : 0;
  formL.hidden = !onLogin;
  formR.hidden = onLogin;
  if (focus) (onLogin ? loginUser : regUser).focus();
}

let availCache = { u: '', free: null, t: 0 };
async function askAvailable(u) {
  if (u === availCache.u && availCache.free !== null && Date.now() - availCache.t < 10000) return availCache.free;
  const free = await call('/rest/v1/rpc/username_available', { p_username: u });
  availCache = { u, free: free === true || free === false ? free : null, t: Date.now() };
  return free;
}

const OUT_MS = (() => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g6-dur-out')); return v > 0 ? Math.round(v * 1000) : 200; })();
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
let closing = false, closeT = 0;
function closeAuth() {

  if (closing || modal.hidden) return;
  btn.focus();
  if (REDUCE.matches) { modal.hidden = true; return; }
  closing = true;
  modal.classList.add('g6-out');

  closeT = setTimeout(() => {
    closing = false;
    modal.classList.remove('g6-out');
    modal.hidden = true;
  }, OUT_MS + 30);
}
function openAuth(reason, mode) {

  clearTimeout(closeT);
  if (closing) { closing = false; modal.classList.remove('g6-out'); }
  modal.hidden = false;
  const m = mode || (reason === 'welcome' ? 'register' : 'login');
  track('login-open', { reason: reason || 'plain', mode: m });
  errL.textContent = ''; errR.textContent = '';
  loginUser.classList.remove('is-bad'); regUser.classList.remove('is-bad');
  lock(loginBtn, false); lock(regBtn, false);
  loginBtn.textContent = '登录'; regBtn.textContent = '注册';
  setHint('');
  show(m, true);
}

function setHint(state) {
  regHint.className = 'auth-hint' + (state ? ' ' + state : '');
  regHint.textContent = !state ? '小写字母/数字/下划线 3-20 位 · 密码至少 6 位'
    : state === 'is-ok' ? '这个名字可以注册' : '这个名字已被注册，换一个吧';
}

function setBtnUser(u) {
  const p = String(u || '');
  btn.textContent = p.length > 12 ? p.slice(0, 12) + '…' : p;
}

async function finishLogin(d, uname, ev) {
  const name = d.user?.user_metadata?.username || uname;
  const mail = d.user?.email || synth(uname);
  save({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), email: mail, username: name });
  withUser(d.user?.id);

  let wasGuest = false;
  try { wasGuest = localStorage.getItem('stw.onboard') === 'guest'; } catch {}
  try { localStorage.setItem('stw.onboard', 'user'); } catch {}
  setBtnUser(name);

  track(ev, { guest: wasGuest });

  if (await loginSync(wasGuest)) return;
  emitAuth(true, mail, d.user?.id, name);
  closeAuth();
}

formL.addEventListener('submit', async e => {
  e.preventDefault(); errL.textContent = '';
  const u = loginUser.value.trim(), p = loginPass.value;

  if (!USER_RE.test(u)) { loginUser.classList.add('is-bad'); say(errL, ERR.user); loginUser.focus(); return; }
  loginUser.classList.remove('is-bad');
  if (loginBtn.disabled) return;
  lock(loginBtn, true);
  loginBtn.textContent = '登录中…';
  let d;
  try { d = await call('/auth/v1/token?grant_type=password', { email: synth(u), password: p }); }
  catch (err) { lock(loginBtn, false); loginBtn.textContent = '登录'; say(errL, mapErr(err, false)); return; }
  if (!d?.access_token) { lock(loginBtn, false); loginBtn.textContent = '登录'; say(errL, ERR.misc); return; }
  await finishLogin(d, u, 'login-success');
});

formR.addEventListener('submit', async e => {
  e.preventDefault(); errR.textContent = '';
  const u = regUser.value.trim(), p1 = regPass.value, p2 = regPass2.value;

  if (!USER_RE.test(u)) { regUser.classList.add('is-bad'); say(errR, ERR.user); regUser.focus(); return; }
  regUser.classList.remove('is-bad');
  if (p1.length < 6) { regPass.classList.add('is-bad'); say(errR, ERR.pass); regPass.focus(); return; }
  if (p1 !== p2) { regPass2.classList.add('is-bad'); say(errR, ERR.match); regPass2.focus(); return; }
  if (regBtn.disabled) return;
  lock(regBtn, true);
  regBtn.textContent = '注册中…';
  let free;
  try { free = await askAvailable(u); }
  catch (err) { lock(regBtn, false); regBtn.textContent = '注册'; say(errR, mapErr(err, true)); return; }
  if (free === false) { lock(regBtn, false); regBtn.textContent = '注册'; say(errR, ERR.taken); regUser.focus(); return; }
  let d;
  try { d = await call('/auth/v1/signup', { email: synth(u), password: p1, data: { username: u } }); }
  catch (err) {
    lock(regBtn, false); regBtn.textContent = '注册';
    if (err?.status === 422 || /already registered/i.test(err?.message || '')) setHint('is-warn');
    say(errR, mapErr(err, true)); return;
  }
  if (!d?.access_token) { lock(regBtn, false); regBtn.textContent = '注册'; say(errR, ERR.misc); return; }
  await finishLogin(d, u, 'register-success');
});

tabL.addEventListener('click', () => show('login', true));
tabR.addEventListener('click', () => show('register', true));
tabsEl?.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' && formL.hidden) return;
  if (e.key === 'ArrowLeft' && !formL.hidden) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); show('register', true); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); show('login', true); }
});

loginUser.addEventListener('input', () => {
  loginUser.classList.remove('is-bad');
  if (errL.textContent === ERR.user) errL.textContent = '';
});
let availSeq = 0, availT = 0;
regPass.addEventListener('input', () => { regPass.classList.remove('is-bad'); if (errR.textContent === ERR.pass) errR.textContent = ''; });
regPass2.addEventListener('input', () => { regPass2.classList.remove('is-bad'); if (errR.textContent === ERR.match) errR.textContent = ''; });
regUser.addEventListener('input', () => {
  regUser.classList.remove('is-bad');
  if (errR.textContent === ERR.user) errR.textContent = '';
  clearTimeout(availT);
  const u = regUser.value.trim();
  if (!USER_RE.test(u)) { setHint(''); return; }
  const seq = ++availSeq;
  availT = setTimeout(async () => {
    let free;
    try { free = await askAvailable(u); }
    catch { if (seq === availSeq) setHint(''); return; }
    if (seq === availSeq) setHint(free ? 'is-ok' : 'is-warn');
  }, 400);
});

document.querySelectorAll('.auth-eye').forEach(b => {
  const inp = $(b.dataset.eye);
  b.addEventListener('click', () => {
    const reveal = inp.type === 'password';
    inp.type = reveal ? 'text' : 'password';
    b.querySelector('.i-eye').hidden = reveal;
    b.querySelector('.i-eye-off').hidden = !reveal;
    b.setAttribute('aria-pressed', String(reveal));
    b.setAttribute('aria-label', reveal ? '隐藏密码' : '显示密码');
    inp.focus();
  });
});

closeBtn.addEventListener('click', closeAuth);

btn.addEventListener('click', () => { loggedIn() ? window.__stwOpenProfile?.() : openAuth('button'); });
modal.addEventListener('click', e => { if (e.target === modal && !modal.classList.contains('menu')) closeAuth(); });

window.__stwLogout = async () => {
  const tok = read()?.access_token;
  try { localStorage.setItem('stw.returned', '1'); } catch {}
  clear(); btn.textContent = '登录';
  track('logout');
  emitAuth(false, null, null, null);
  try { await call('/auth/v1/logout', {}, 'POST', tok); } catch {}

  try { localStorage.setItem('stw.onboard', 'guest'); localStorage.removeItem('stw.done'); localStorage.removeItem('stw.fav'); } catch {}
  location.reload();
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeAuth(); });

const WHY = {
  review: '登录后解锁复习——学习记录会保存，换设备也不丢',
  fav: '登录后才能收藏生词本',
  deeplink: '这个词在完整版里，登录后解锁全部词库',
  learn: '登录后开始学习——进度自动保存，每天接着学',
  plan: '设置学习计划需要先登录'
};
const whyEl = $('authWhy');

window.__stwLoginPrompt = reason => {
  if (whyEl) { whyEl.textContent = WHY[reason] || ''; whyEl.hidden = !whyEl.textContent; }
  openAuth(reason);
};

new MutationObserver(() => {
  if (!modal.hidden) return;
  if (whyEl) { whyEl.textContent = ''; whyEl.hidden = true; }
  try { sessionStorage.removeItem('stw.intent'); } catch {}
}).observe(modal, { attributes: true, attributeFilter: ['hidden'] });

let mirror = { done: (() => { try { return new Set(JSON.parse(localStorage.getItem('stw.done')) || []); } catch { return new Set(); } })(), fav: (() => { try { return new Set(JSON.parse(localStorage.getItem('stw.fav')) || []); } catch { return new Set(); } })() };
const SYNC_COL = { 'stw.done': 'learned_at', 'stw.fav': 'fav_at' };
const SYNC_GUARD = 'stw.sync.r';
const lsSet = k => { try { return new Set(JSON.parse(localStorage.getItem(k)) || []); } catch { return new Set(); } };
const lsSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const nowIso = () => new Date().toISOString();
const sameSet = (a, b) => a.size === b.size && [...a].every(w => b.has(w));

const withUser = id => { const s = read(); if (s && id && !s.user_id) save({ ...s, user_id: id }); };

let refreshP = null;
function refreshSession(force) {
  const s = read();
  if (!s?.refresh_token) return Promise.resolve(false);
  if (!force && !stale(s)) return Promise.resolve(true);
  if (refreshP) return refreshP;
  refreshP = call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    .then(d => {
      const cur = read();
      if (!cur) return false;
      save({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600), email: cur.email || d.user?.email || '', username: cur.username || d.user?.user_metadata?.username || '', user_id: cur.user_id || d.user?.id });
      return true;
    })
    .catch(() => {
      const cur = read();
      if (cur?.access_token && cur.access_token !== s.access_token && !stale(cur)) return true;
      clear(); setBtnUser('登录'); emitAuth(false, null, null, null);
      return false;
    })
    .finally(() => { refreshP = null; });
  return refreshP;
}
async function freshToken() {
  const s = read();
  if (!s?.access_token) return null;
  if (!stale(s)) return s.access_token;
  return (await refreshSession()) ? read()?.access_token || null : null;
}
window.__stwFreshToken = freshToken;
window.__stwRefreshSession = refreshSession;
const maybeRefresh = () => { const s = read(); if (s?.refresh_token && stale(s)) refreshSession(); };
setInterval(maybeRefresh, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeRefresh(); });

async function restGet() {
  const s = read(), rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(AUTH_CONFIG.url + `/rest/v1/user_words?select=word,learned_at,fav_at&order=word&limit=1000&offset=${offset}`,
      { headers: { apikey: AUTH_CONFIG.anonKey, Authorization: 'Bearer ' + s.access_token } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error('bad payload');
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function restPut(rows) {
  if (!rows.length) return;
  const s = read();
  const res = await fetch(AUTH_CONFIG.url + '/rest/v1/user_words', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: AUTH_CONFIG.anonKey, Authorization: 'Bearer ' + s.access_token, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

function applyDown(rows) {
  const sd = new Set(rows.filter(r => r.learned_at).map(r => r.word));
  const sf = new Set(rows.filter(r => r.fav_at).map(r => r.word));
  mirror = { done: sd, fav: sf };
  const changed = !sameSet(sd, lsSet('stw.done')) || !sameSet(sf, lsSet('stw.fav'));
  if (changed) { lsSave('stw.done', [...sd]); lsSave('stw.fav', [...sf]); }
  return changed;
}

function syncReload() {
  try {
    if (sessionStorage.getItem(SYNC_GUARD)) return false;
    sessionStorage.setItem(SYNC_GUARD, '1');
    location.reload();
    return true;
  } catch { return false; }
}

async function bootSync() {
  try {
    const rows = await restGet();
    if (Array.isArray(rows) && applyDown(rows)) syncReload();
  } catch (e) { console.warn('[sync] boot download failed:', e?.message || e); }
}

window.__stwSync = key => {
  const s = read(), col = SYNC_COL[key], mk = key.slice(4);
  if (!loggedIn() || !s?.user_id || !col) return;
  const local = lsSet(key), mine = mirror[mk] || new Set();
  const body = [...local].filter(w => !mine.has(w)).map(w => ({ user_id: s.user_id, word: w, [col]: nowIso() }))
    .concat([...mine].filter(w => !local.has(w)).map(w => ({ user_id: s.user_id, word: w, [col]: null })));
  if (!body.length) return;
  restPut(body)
    .then(() => { mirror[mk] = new Set(local); })
    .catch(e => console.warn('[sync] upload failed:', e?.message || e));
};

window.addEventListener('stw:word-learned', e => {
  const w = e.detail?.word;
  if (!loggedIn() || !w || mirror.done.has(w)) return;
  mirror.done.add(w);
});

async function loginSync(wasGuest) {

  try { sessionStorage.removeItem(SYNC_GUARD); } catch {}
  try {
    const rows = await restGet();
    if (Array.isArray(rows) && applyDown(rows) && syncReload()) return true;
  } catch (e) { console.warn('[sync] login sync failed:', e?.message || e); }
  if (wasGuest && syncReload()) return true;
  return false;
}

const welcome = $('welcomeModal');

if (welcome && !read() && !lsSet('stw.done').size && !lsSet('stw.fav').size && !localStorage.getItem('stw.onboard')) {
  welcome.hidden = false;
  $('welcomeLogin')?.focus();
}

const welcomeBye = () => { try { localStorage.setItem('stw.onboard', 'guest'); } catch {} if (welcome) welcome.hidden = true; track('guest-skip'); };
$('welcomeSkip')?.addEventListener('click', welcomeBye);
$('welcomeClose')?.addEventListener('click', welcomeBye);
welcome?.addEventListener('click', e => { if (e.target === welcome) welcomeBye(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && welcome && !welcome.hidden) welcomeBye(); });

$('welcomeLogin')?.addEventListener('click', () => { if (welcome) welcome.hidden = true; openAuth('welcome'); });

window.__stwAuthReady = (async () => {
  await new Promise(r => setTimeout(r, 0));
  const s = read();
  if (!s) { emitAuth(false, null, null, null); return; }
  if (!stale(s)) { setBtnUser(nameOf(s)); emitAuth(true, s.email, s.user_id, nameOf(s)); bootSync(); return; }
  if (await refreshSession()) {
    const ns = read();
    setBtnUser(nameOf(ns));
    withUser(ns.user_id);
    bootSync();
    emitAuth(true, ns.email, ns.user_id, nameOf(ns));
  }
})();
})();
