import { AUTH_CONFIG } from './config.js?v=staging-767b940';

(() => {
const KEY = 'stw.auth.session';
const $ = id => document.getElementById(id);
const modal = $('feedbackModal'), entryBtn = $('profileFeedbackBtn');

if (!AUTH_CONFIG.url || !AUTH_CONFIG.anonKey || !entryBtn || !modal) return;

const textEl = $('feedbackText'), form = $('feedbackForm'), submitBtn = $('feedbackSubmit'),
  errEl = $('feedbackErr'), countEl = $('feedbackCount'), closeBtn = $('feedbackClose');

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const headers = () => ({ 'Content-Type': 'application/json', apikey: AUTH_CONFIG.anonKey, Authorization: 'Bearer ' + read()?.access_token });

let userId = null;

const OUT_MS = (() => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--g6-dur-out')); return v > 0 ? Math.round(v * 1000) : 200; })();
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
let closing = false, closeT = 0;

function resetForm() {
  textEl.value = '';
  countEl.textContent = '0/500';
  errEl.textContent = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '提交';
}

function openFeedback() {
  if (closing) { clearTimeout(closeT); closing = false; modal.classList.remove('g6-out'); }
  resetForm(); modal.hidden = false; textEl.focus();
}

function closeFeedback() {
  if (closing || modal.hidden) return;
  $('authBtn')?.focus();
  if (REDUCE.matches) { modal.hidden = true; return; }
  closing = true;
  modal.classList.add('g6-out');
  closeT = setTimeout(() => {
    closing = false;
    modal.classList.remove('g6-out');
    modal.hidden = true;
  }, OUT_MS + 30);
}

entryBtn.addEventListener('click', () => { window.__stwCloseProfile?.(); openFeedback(); });
closeBtn.addEventListener('click', closeFeedback);
modal.addEventListener('click', e => { if (e.target === modal) closeFeedback(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeFeedback(); });

textEl.addEventListener('input', () => { countEl.textContent = `${textEl.value.length}/500`; });

form.addEventListener('submit', async e => {
  e.preventDefault(); errEl.textContent = '';
  if (submitBtn.disabled) return;
  const content = textEl.value.trim();
  if (!content) { errEl.textContent = '写点什么再提交吧'; return; }
  if (!read()?.access_token || !userId) { errEl.textContent = '请先登录后再反馈'; return; }
  submitBtn.disabled = true;
  submitBtn.textContent = '提交中…';
  try {
    const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/feedback`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify([{ user_id: userId, content }])
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    submitBtn.textContent = '已提交，谢谢';
    setTimeout(closeFeedback, 800);
  } catch {
    errEl.textContent = '提交失败，请稍后再试';
    submitBtn.disabled = false;
    submitBtn.textContent = '提交';
  }
});

window.addEventListener('stw:auth', e => {
  const d = e.detail || {};
  if (!d.loggedIn) return;
  userId = d.userId || read()?.user_id || null;
});
})();
