import { AUTH_CONFIG } from './config.js?v=staging-ac923ae';

(() => {
const KEY = 'stw.auth.session';
const $ = id => document.getElementById(id);
const btn = $('authBtn'), modal = $('profileModal');

if (!AUTH_CONFIG.url || !AUTH_CONFIG.anonKey || !btn || !modal) return;

const avatarLg = $('profileAvatar'), nameInput = $('profileName'), mailEl = $('profileMail'),
  form = $('profileForm'), saveBtn = $('profileSave'), errEl = $('profileErr'),
  closeBtn = $('profileClose'), picker = $('profilePicker'),
  planPicker = $('planAvatarPicker'), planName = $('planName');

const GENRES = [
  { id: 'edm', label: '电子', color: '#7C5CFF', d: 'M201.89 54.66A103.43 103.43 0 0 0 128.79 24H128A104 104 0 0 0 24 128v56a24 24 0 0 0 24 24h16a24 24 0 0 0 24-24v-40a24 24 0 0 0-24-24H40.36A88 88 0 0 1 128 40h.67a87.71 87.71 0 0 1 87 80H192a24 24 0 0 0-24 24v40a24 24 0 0 0 24 24h16a24 24 0 0 0 24-24v-56a103.4 103.4 0 0 0-30.11-73.34M64 136a8 8 0 0 1 8 8v40a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8v-48Zm152 48a8 8 0 0 1-8 8h-16a8 8 0 0 1-8-8v-40a8 8 0 0 1 8-8h24Z' },
  { id: 'rock', label: '摇滚', color: '#FF4D8D', d: 'm249.66 46.34l-40-40a8 8 0 0 0-11.31 11.32l2.34 2.34l-60.17 60.16c-22.79-11.86-48.31-10.87-63.77 4.58a42.3 42.3 0 0 0-9.39 14.37a8.24 8.24 0 0 1-7.55 4.89c-14.59.49-27.26 5.72-36.65 15.11C11.08 131.22 6 148.6 8.74 168.07C11.4 186.7 21.07 205.15 36 220s33.34 24.56 52 27.22a71 71 0 0 0 10.1.78c15.32 0 28.83-5.23 38.76-15.16c9.39-9.39 14.62-22.06 15.11-36.65a8.24 8.24 0 0 1 4.92-7.55a42.1 42.1 0 0 0 14.37-9.39c15.45-15.46 16.44-41 4.58-63.77L236 55.31l2.34 2.34a8 8 0 1 0 11.32-11.31M160 167.93a26.1 26.1 0 0 1-8.95 5.83a24.24 24.24 0 0 0-15 21.89c-.36 10.46-4 19.41-10.43 25.88c-8.44 8.43-21 11.95-35.36 9.89c-15.26-2.17-30.53-10.23-42.99-22.69S26.75 181 24.58 165.81c-2-14.37 1.46-26.92 9.89-35.36C40.94 124 49.89 120.37 60.35 120a24.22 24.22 0 0 0 21.89-15a26.1 26.1 0 0 1 5.83-9c5.49-5.49 13-8.13 21.38-8.13a49.4 49.4 0 0 1 19.13 4.19l-20.08 20.13a32 32 0 1 0 35.31 35.31l20.08-20.08c6.52 15.29 5.58 30.99-3.89 40.51m-10.4-61.48a73 73 0 0 1 5.93 6.75l-15.42 15.42a32.2 32.2 0 0 0-12.68-12.68l15.42-15.43a73 73 0 0 1 6.7 5.94ZM112 128a16 16 0 0 1 16 16a16 16 0 1 1-16-16m48.85-32.85a87 87 0 0 0-6.68-6L176 67.31L188.69 80l-21.83 21.82a87 87 0 0 0-6-6.68ZM200 68.68L187.32 56L212 31.31L224.69 44ZM93.66 194.33a8 8 0 0 1-11.31 11.32l-32-32a8 8 0 0 1 11.32-11.31Z' },
  { id: 'pop', label: '流行', color: '#FF9DC0', d: 'M168 16a72.07 72.07 0 0 0-72 72a73 73 0 0 0 .63 9.42l-69.51 94.8A15.93 15.93 0 0 0 28.71 213L43 227.29a15.93 15.93 0 0 0 20.78 1.59l94.81-69.53a73 73 0 0 0 9.41.65a72 72 0 1 0 0-144m56 72a55.72 55.72 0 0 1-11.16 33.52l-78.35-78.36A56 56 0 0 1 224 88M54.32 216L40 201.68L102.14 117A72.37 72.37 0 0 0 139 153.86ZM112 88a55.67 55.67 0 0 1 11.16-33.51l78.34 78.34A56 56 0 0 1 112 88m-2.35 58.34a8 8 0 0 1 0 11.31l-8 8a8 8 0 1 1-11.31-11.31l8-8a8 8 0 0 1 11.33-.01Z' },
  { id: 'jazz', label: '爵士', color: '#F59E0B', d: 'M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m0-144a56.06 56.06 0 0 0-56 56a8 8 0 0 1-16 0a72.08 72.08 0 0 1 72-72a8 8 0 0 1 0 16m72 56a72.08 72.08 0 0 1-72 72a8 8 0 0 1 0-16a56.06 56.06 0 0 0 56-56a8 8 0 0 1 16 0m-40 0a32 32 0 1 0-32 32a32 32 0 0 0 32-32m-48 0a16 16 0 1 1 16 16a16 16 0 0 1-16-16' },
  { id: 'class', label: '古典', color: '#38BDF8', d: 'M208 32H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16M80 48h24v88H80Zm32 104a8 8 0 0 0 8-8V48h16v96a8 8 0 0 0 8 8h8v56h-48v-56Zm40-16V48h24v88ZM48 48h16v96a8 8 0 0 0 8 8h16v56H48Zm160 160h-40v-56h16a8 8 0 0 0 8-8V48h16z' },
  { id: 'punk', label: '朋克', color: '#EF4444', d: 'M92 104a28 28 0 1 0 28 28a28 28 0 0 0-28-28m0 40a12 12 0 1 1 12-12a12 12 0 0 1-12 12m72-40a28 28 0 1 0 28 28a28 28 0 0 0-28-28m0 40a12 12 0 1 1 12-12a12 12 0 0 1-12 12M128 16C70.65 16 24 60.86 24 116c0 34.1 18.27 66 48 84.28V216a16 16 0 0 0 16 16h80a16 16 0 0 0 16-16v-15.72C213.73 182 232 150.1 232 116c0-55.14-46.65-100-104-100m44.12 172.69a8 8 0 0 0-4.12 7V216h-16v-24a8 8 0 0 0-16 0v24h-16v-24a8 8 0 0 0-16 0v24H88v-20.31a8 8 0 0 0-4.12-7C56.81 173.69 40 145.84 40 116c0-46.32 39.48-84 88-84s88 37.68 88 84c0 29.83-16.81 57.69-43.88 72.69' },
  { id: 'folk', label: '民谣', color: '#34D399', d: 'M128 176a48.05 48.05 0 0 0 48-48V64a48 48 0 0 0-96 0v64a48.05 48.05 0 0 0 48 48M96 64a32 32 0 0 1 64 0v64a32 32 0 0 1-64 0Zm40 143.6V240a8 8 0 0 1-16 0v-32.4A80.11 80.11 0 0 1 48 128a8 8 0 0 1 16 0a64 64 0 0 0 128 0a8 8 0 0 1 16 0a80.11 80.11 0 0 1-72 79.6' },
  { id: 'kpop', label: 'K-pop', color: '#E879F9', d: 'M197.58 129.06L146 110l-19-51.62a15.92 15.92 0 0 0-29.88 0L78 110l-51.62 19a15.92 15.92 0 0 0 0 29.88L78 178l19 51.62a15.92 15.92 0 0 0 29.88 0L146 178l51.62-19a15.92 15.92 0 0 0 0-29.88ZM137 164.22a8 8 0 0 0-4.74 4.74L112 223.85L91.78 169a8 8 0 0 0-4.78-4.78L32.15 144L87 123.78a8 8 0 0 0 4.78-4.78L112 64.15L132.22 119a8 8 0 0 0 4.74 4.74L191.85 144ZM144 40a8 8 0 0 1 8-8h16V16a8 8 0 0 1 16 0v16h16a8 8 0 0 1 0 16h-16v16a8 8 0 0 1-16 0V48h-16a8 8 0 0 1-8-8m104 48a8 8 0 0 1-8 8h-8v8a8 8 0 0 1-16 0v-8h-8a8 8 0 0 1 0-16h8v-8a8 8 0 0 1 16 0v8h8a8 8 0 0 1 8 8' },
];
const ERR = { net: '连接失败，请稍后再试', long: '昵称最多 20 个字符' };

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const headers = () => ({ 'Content-Type': 'application/json', apikey: AUTH_CONFIG.anonKey, Authorization: 'Bearer ' + read()?.access_token });

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hashIndex = uid => Math.abs(String(uid || '').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % GENRES.length;

let userId = null, email = '', username = '', savedName = '', genre = GENRES[0], savedGenre = GENRES[0];

const handle = () => username || String(email || '').split('@')[0];
const displayName = () => savedName || handle();

const discHtml = () => `<span class="avatar-disc"><span class="avatar-disc-label" style="background:${genre.color}"><svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="${genre.d}"/></svg></span></span>`;

const pickerHtml = () => GENRES.map(g =>
  `<button type="button" class="avatar-opt" role="radio" aria-checked="${g.id === genre.id}" tabindex="${g.id === genre.id ? '0' : '-1'}" aria-label="${escapeHtml(g.label)}风格头像" data-genre="${g.id}"><span class="avatar-disc"><span class="avatar-disc-label" style="background:${g.color}"><svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="${g.d}"/></svg></span></span></button>`).join('');

function renderHeader() {
  btn.innerHTML = discHtml() + `<span class="auth-name">${escapeHtml(displayName())}</span>`;
}

async function hydrate() {
  const s = read();
  if (!s?.access_token || !userId) return;
  try {
    const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,prefs`, { headers: headers() });
    if (!res.ok) return;
    const rows = await res.json();
    const prefs = Array.isArray(rows) && rows[0]?.prefs && typeof rows[0].prefs === 'object' ? rows[0].prefs : {};
    savedName = typeof prefs.display_name === 'string' ? prefs.display_name : '';
    genre = GENRES.find(g => g.id === prefs.avatar) || GENRES[hashIndex(userId)];
    savedGenre = genre;
    renderHeader();
  } catch {}
}

function fill() {
  genre = savedGenre;
  avatarLg.innerHTML = discHtml();
  nameInput.value = savedName || handle();
  nameInput.placeholder = '如：' + handle();
  mailEl.textContent = '@' + handle();
  errEl.textContent = '';
  saveBtn.disabled = false;
  saveBtn.textContent = '保存';

  picker.innerHTML = pickerHtml();
}

const OUT_MS = (() => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g6-dur-out')); return v > 0 ? Math.round(v * 1000) : 200; })();
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
let closing = false, closeT = 0;
function openCard() {

  if (closing) { clearTimeout(closeT); closing = false; modal.classList.remove('g6-out'); }
  fill(); modal.hidden = false;
}
function closeCard() {

  if (closing || modal.hidden) return;
  resetLogout();
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

async function saveProfile(name) {
  const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ prefs: name ? { display_name: name, avatar: genre.id } : { avatar: genre.id } })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  savedName = name;
  savedGenre = genre;
  renderHeader();
}

form.addEventListener('submit', async e => {
  e.preventDefault(); errEl.textContent = '';
  if (saveBtn.disabled) return;
  const name = nameInput.value.trim();
  if (name.length > 20) { errEl.textContent = ERR.long; return; }
  if (!read()?.access_token || !userId) return;
  saveBtn.disabled = true;
  try { await saveProfile(name); } catch { saveBtn.disabled = false; errEl.textContent = ERR.net; return; }
  closeCard();
});

function syncPicker(root, g) {
  for (const b of root.querySelectorAll('.avatar-opt')) {
    const on = b.dataset.genre === g.id;
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('tabindex', on ? '0' : '-1');
  }
}

function selectGenre(g, focusRoot = null) {
  genre = g;
  syncPicker(picker, g);
  if (planPicker) syncPicker(planPicker, g);
  avatarLg.innerHTML = discHtml();
  if (focusRoot) focusRoot.querySelector('.avatar-opt[aria-checked="true"]')?.focus();
}

function bindPicker(root) {
  root.addEventListener('click', e => {
    const opt = e.target.closest('.avatar-opt');
    if (!opt || opt.getAttribute('aria-checked') === 'true') return;
    const g = GENRES.find(x => x.id === opt.dataset.genre);
    if (g) selectGenre(g);
  });

  root.addEventListener('keydown', e => {
    const opt = e.target.closest?.('.avatar-opt');
    if (!opt) return;
    const opts = [...root.querySelectorAll('.avatar-opt')];
    const cur = opts.indexOf(opt);
    if (cur < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % opts.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + opts.length) % opts.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = opts.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    const g = GENRES.find(x => x.id === opts[next].dataset.genre);
    if (g) selectGenre(g, root);
  });
}

bindPicker(picker);
if (planPicker) bindPicker(planPicker);

const logoutBtn = $('profileLogout'), logoutCancel = $('profileLogoutCancel');
const logoutArmed = () => logoutBtn.classList.contains('is-confirm');
function resetLogout() {
  logoutBtn.classList.remove('is-confirm');
  logoutBtn.textContent = '退出登录';
  logoutBtn.disabled = false;
  if (logoutCancel) logoutCancel.hidden = true;
}
function armLogout() {
  logoutBtn.classList.add('is-confirm');
  logoutBtn.textContent = '确认退出？';
  if (logoutCancel) logoutCancel.hidden = false;
}
let stallT = 0;
function failLogout() {
  clearTimeout(stallT); stallT = 0;
  resetLogout();
  errEl.textContent = '退出失败，请稍后再试';
}
logoutBtn.addEventListener('click', () => {
  if (!logoutArmed()) { armLogout(); return; }
  resetLogout();
  logoutBtn.disabled = true;
  clearTimeout(stallT);
  stallT = setTimeout(failLogout, 6000);
  try {
    const p = window.__stwLogout?.();
    if (p && typeof p.catch === 'function') p.catch(failLogout);
    else if (!p) failLogout();
  } catch { failLogout(); }
});
logoutCancel?.addEventListener('click', resetLogout);

closeBtn.addEventListener('click', closeCard);
modal.addEventListener('click', e => { if (e.target === modal) closeCard(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeCard(); });

window.addEventListener('stw:auth', e => {
  const d = e.detail || {};
  if (!d.loggedIn) return;
  userId = d.userId || read()?.user_id || null;
  email = d.email || read()?.email || '';
  username = d.username || read()?.username || '';
  savedName = '';
  genre = savedGenre = GENRES[hashIndex(userId)];
  renderHeader();
  hydrate();
});

window.__stwOpenProfile = () => { if (userId) openCard(); };
window.__stwCloseProfile = closeCard;
window.__stwPlanProfileNeeded = () => !!userId && !savedName;
window.__stwPlanProfileEnter = () => {
  if (!planPicker || !planName) return;
  genre = savedGenre;
  planPicker.innerHTML = pickerHtml();
  planName.value = savedName || handle();
  planName.placeholder = '如：' + handle();
  planName.focus();
};
window.__stwPlanProfileCommit = name => {
  if (!read()?.access_token || !userId) return;
  const clean = String(name ?? '').trim();
  if (clean.length > 20) return;
  saveProfile(clean).catch(() => {});
};

{
  const s = read();
  if (s?.access_token && (s.expires_at ?? 0) > Date.now() / 1000 + 30) {
    userId = s.user_id || null;
    email = s.email || '';
    username = s.username || '';
    genre = savedGenre = GENRES[hashIndex(userId)];
    renderHeader();
    hydrate();
  }
}
})();
