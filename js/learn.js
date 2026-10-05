import { getPlan, savePlan, getCheckins, getUserWords, saveCheckinMark, saveLearnSeed, getQuizPool } from './plan-api.js?v=staging-f48b6dd';
import { track } from './track.js?v=staging-f48b6dd';
import { markLearned } from './player.js?v=staging-f48b6dd';
import { buildQuizOptions } from './review.js?v=staging-f48b6dd';
import { boot as flashBoot, drain as flashDrain, reset as flashReset, busy as flashBusy, enqueueWrong, flashStats } from './flashback.js?v=staging-f48b6dd';
import { idxOf } from './bank.js?v=staging-f48b6dd';
import { loadLyrics } from './lyrics.js?v=staging-f48b6dd';

const KEY = 'stw.auth.session';
const DONE_KEY = 'stw.done';
const DAY_KEY = 'stw.day';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const readDone = () => { try { const v = JSON.parse(localStorage.getItem(DONE_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedShuffle(arr, seed) {
  const out = arr.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const isoLocalDay = iso => {
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function buildQueue(userId, dict, words, learnedSet) {
  const seed = fnv1a(userId + '|' + today() + '|' + dict);
  return seedShuffle(words.filter(w => !learnedSet.has(w)), seed);
}

function dayCount() {
  try {
    const v = JSON.parse(localStorage.getItem(DAY_KEY));
    if (v && typeof v === 'object' && v.d === today()) return Number(v.n) || 0;
  } catch {}
  return 0;
}
function setDayCount(n) { try { localStorage.setItem(DAY_KEY, JSON.stringify({ d: today(), n })); } catch {} }

let dayWords = [];

async function refreshDay() {
  if (!userId) return null;
  const rows = await getUserWords(userId);
  if (!Array.isArray(rows)) return null;
  const t = today();
  const todayRows = rows.filter(r => r?.learned_at && isoLocalDay(r.learned_at) === t);
  setDayCount(todayRows.length);
  dayWords = todayRows.slice().sort((a, b) => String(a.learned_at).localeCompare(String(b.learned_at))).map(r => r.word);
  return rows;
}

let state = 'idle';
let pos = 0;

let cur = -1;
let queue = [];
let plan = null;
let userId = null;
let checkinDone = false;

let poolCache = [];
let poolMap = new Map();
let quizWord = null;
let quizOptions = [];
let quizWords = [];
let quizCorrect = -1;
let answered = false;
let gateTimer = 0;
let pendingAdvance = false;
let replayWord = null;
let quizR = 0, quizW = 0, skipped = 0;

export function getState() { return { state, pos, queueLen: queue.length, plan }; }

const shuffleOn = () => { try { return JSON.parse(localStorage.getItem('stw.shuffle')) === true; } catch { return false; } };

function go(i) {
  if (typeof window.__stwLearnGo !== 'function') { console.warn('learn: host hook __stwLearnGo missing'); return false; }
  cur = i;
  replayWord = null;
  document.body.classList.remove('stw-revealed');
  const know = document.getElementById('rvKnow');
  if (know) know.disabled = false;
  window.__stwLearnGo(queue[i]);
  const done = new Set(readDone());
  for (let k = i + 1, n = 0; k < queue.length && n < 2; k++) {
    if (done.has(queue[k])) continue;
    const j = idxOf(queue[k]);
    if (j < 0) continue;
    loadLyrics(j).catch(() => {});
    n++;
  }
  return true;
}

export async function startLearn() {
  const s = read(), uid = s?.user_id;
  if (!s?.access_token || !uid) { console.warn('learn: startLearn ignored — not logged in'); return; }

  const p = (await getPlan(uid)) || plan;
  if (!p?.dict || !p?.daily_goal) { emit('stw:need-plan'); return; }
  if (typeof window.__stwLearnWords !== 'function') { console.warn('learn: host hook __stwLearnWords missing'); return; }
  plan = p; userId = uid;
  const words = window.__stwLearnWords(p.dict);
  if (!Array.isArray(words) || !words.length) { console.warn('learn: empty word list for dict "' + p.dict + '"'); return; }
  const done = new Set(readDone());
  queue = buildQueue(uid, p.dict, words, done);
  if (!queue.length) { console.warn('learn: every word already learned — nothing to study'); return; }
  const first = queue.findIndex(w => !done.has(w));
  pos = first === -1 ? 0 : first;

  const [dayRows, checkinRows, pool] = await Promise.all([refreshDay(), getCheckins(uid), getQuizPool()]);
  checkinDone = Array.isArray(checkinRows) && checkinRows.some(r => r && r.day === today());
  if (Array.isArray(pool) && pool.length) {
    poolCache = pool;
    poolMap = new Map(pool.filter(e => e && e.word != null).map(e => [e.word, e.meaning]));
  }
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1; pendingAdvance = false;
  quizR = 0; quizW = 0; skipped = 0;
  clearTimeout(gateTimer); gateTimer = 0;
  flashBoot(uid, dayWords, dayRows);

  const prev = state;
  state = 'learning';
  if (!go(pos)) { state = prev; return; }
  setLearnBody(true);
  showBar();
  updateStatus();
  track('learn-start', { dict: p.dict, goal: p.daily_goal, total: queue.length });
}

function showBar() { const row = document.getElementById('learnRow'); if (row) row.hidden = false; }
function hideBar() { const row = document.getElementById('learnRow'); if (row) row.hidden = true; }

function setLearnBody(on) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('stw-learn', on);
  if (on) document.body.classList.remove('stw-review', 'stw-study');
}

function onWordLearned(e) {
  if (state !== 'learning' || pos >= queue.length || e.detail?.word !== queue[pos]) return;
  const done = new Set(readDone()); done.add(e.detail.word);
  setDayCount(dayCount() + 1);
  if (userId) saveLearnSeed(userId, e.detail.word)?.catch?.(() => {});
  updateStatus();
  while (pos < queue.length && done.has(queue[pos])) pos++;
}
function renderBarSync() {
  const row = document.getElementById('learnRow'), status = document.getElementById('learnStatus'), btn = document.getElementById('learnBtn');
  if (!row || !btn) return;
  row.hidden = state !== 'learning' && state !== 'checkin';
  const goal = Number(plan?.daily_goal) || 0, n = dayCount();
  if (state === 'learning') { btn.hidden = true; btn.disabled = true; }
  else {
    btn.hidden = false; btn.disabled = false;
    btn.textContent = plan
      ? (checkinDone || (goal && n >= goal) ? `再学 ${goal} 词` : n > 0 ? '继续学习' : '学习')
      : '设置计划';
  }
  if (plan) {
    const over = Math.max(0, n - goal);
    status.textContent = `学习 ${Math.min(n, goal)}/${goal}` + (over > 0 ? `（+${over}）` : '');
    setProg(goal ? Math.min(100, n / goal * 100) : 0);
  } else { status.textContent = '设置学习计划'; setProg(0); }
}
function updateStatus() {
  if (state !== 'learning') return;
  renderBarSync();
}
function setProg(pct) {
  const bar = document.getElementById('learnProg');
  if (bar) {
    bar.style.width = pct.toFixed(1) + '%';
    bar.style.boxShadow = pct >= 100 ? 'none' : '';
  }
}
function countWord() {
  if (pos < queue.length) markLearned(queue[pos]);
}
function askGate() {
  if (quizWord) return true;
  const w = queue[pos];
  const meaning = w == null ? null : poolMap.get(w);
  if (meaning) {
    const { options, correctIndex, optWords } = buildQuizOptions(w, meaning, poolCache, userId);
    if (options.length >= 4 && correctIndex >= 0) {
      quizWord = w; quizOptions = options; quizWords = optWords; quizCorrect = correctIndex; answered = false;
      window.dispatchEvent(new CustomEvent('stw:quiz-show', { detail: { word: w, options } }));
      return true;
    }
  }
  console.warn('learn: quiz options unavailable for "' + w + '" — word counted without recall gate');
  countWord();
  return false;
}
function resumeLearn() {
  maybeCheckin();
  if (state !== 'learning') return;
  if (pos < queue.length) go(pos);
  else exitSession();
}
function advanceAfterGate(drainFlash = true) {
  const done = new Set(readDone());
  while (pos < queue.length && done.has(queue[pos])) pos++;
  const goal = Number(plan?.daily_goal) || 0;
  const n = dayCount();
  const ending = state === 'learning' && (n >= goal || pos >= queue.length);
  const cont = () => resumeLearn();
  if (drainFlash) flashDrain(cont, { count: n, ending });
  else cont();
}

function gateOrAdvance() {
  if (quizWord || flashBusy()) return;
  const done = new Set(readDone());
  if (!done.has(queue[pos])) {
    window.dispatchEvent(new CustomEvent('stw:stop'));
    if (askGate()) return;
  }
  advanceAfterGate();
}

function askNow() {
  if (state !== 'learning' || quizWord || flashBusy()) return;
  if (pendingAdvance) { onNext(); return; }
  gateOrAdvance();
}

function onNext() {
  if (state !== 'learning' || quizWord || flashBusy()) return;
  if (pendingAdvance) { pendingAdvance = false; advanceAfterGate(true); return; }
  const done = new Set(readDone());
  const w = queue[pos];
  if (w == null || done.has(w)) { advanceAfterGate(true); return; }
  skipped++;
  let j = -1;
  for (let step = 1; step <= queue.length; step++) {
    const k = (pos + step) % queue.length;
    if (!done.has(queue[k])) { j = k; break; }
  }
  pos = j < 0 ? pos : j;
  pendingAdvance = false;
  flashDrain(() => {
    maybeCheckin();
    if (state !== 'learning') return;
    go(pos);
  }, { count: dayCount(), ending: false });
}

window.addEventListener('stw:clip-ended', e => {
  if (state !== 'learning') return;
  if (flashBusy()) { e.preventDefault(); return; }
  if (window.__stwLoopOn?.()) return;
  e.preventDefault();
  const endedWord = e.detail?.word ?? queue[pos];
  if (pendingAdvance && replayWord != null && endedWord === replayWord) return;
  if (pendingAdvance) pendingAdvance = false;
  gateOrAdvance();
});
function onQuizAnswer(e) {
  if (state !== 'learning' || !quizWord || answered) return;
  const chosen = Number(e.detail?.index);
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= quizOptions.length) { console.warn('learn: quiz answer ignored — bad index', e.detail?.index); return; }
  answered = true;
  const correct = chosen === quizCorrect;
  markLearned(quizWord);
  if (!correct) enqueueWrong(quizWord);
  window.dispatchEvent(new CustomEvent('stw:quiz-result', { detail: { chosenIndex: chosen, correctIndex: quizCorrect, correct, optWords: quizWords } }));
  const qn = document.getElementById('quizNext');
  if (qn) qn.hidden = true;
  correct ? quizR++ : quizW++;
  clearTimeout(gateTimer);
  gateTimer = setTimeout(settleGate, correct ? 1600 : 4400);
}
function settleGate() {
  gateTimer = 0;
  replayWord = quizWord ?? queue[pos];
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1;
  document.body.classList.add('stw-revealed');
  const know = document.getElementById('rvKnow');
  if (know) know.disabled = true;
  window.dispatchEvent(new CustomEvent('stw:quiz-close'));
  pendingAdvance = true;
  if (replayWord != null) window.__stwLearnGo?.(replayWord);
}
async function maybeCheckin() {
  if (state !== 'learning') return;
  const goal = Number(plan?.daily_goal) || 0;
  if (dayCount() < goal && pos < queue.length) return;
  if (checkinDone) { renderBar(); return; }
  state = 'checkin';
  setLearnBody(false);
  const n = dayCount(), day = today();
  checkinDone = true;
  if (userId) await saveCheckinMark(userId, day);
  else console.warn('learn: no user id — checkin row skipped');
  emit('stw:checkin-done', { today: n, goal });
  track('checkin-done', { today: n, goal });
  renderBar();
}

export function extraGroup() {
  if (state !== 'checkin') { console.warn('learn: extraGroup ignored — no finished group to extend'); return; }
  if (pos >= queue.length) { console.warn('learn: queue exhausted — no unlearned words left to extend'); return; }
  state = 'learning';
  if (!go(pos)) { state = 'checkin'; return; }
  setLearnBody(true);
  showBar();
  updateStatus();
  track('learn-extra', { pos, total: queue.length });
}

export function exitSession() {
  if (queue.length) {
    const f = flashStats();
    track('learn-exit', { done: pos, total: queue.length, quiz_r: quizR, quiz_w: quizW, skipped, flash_shown: f.shown, flash_r: f.right, flash_w: f.wrong, flash_x: f.abandoned });
  }
  flashReset();
  if (quizWord) window.dispatchEvent(new CustomEvent('stw:quiz-close'));
  state = 'idle'; pos = 0; queue = []; cur = -1; pendingAdvance = false; replayWord = null;
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1; pendingAdvance = false;
  clearTimeout(gateTimer); gateTimer = 0;
  setLearnBody(false);
  document.body.classList.remove('stw-revealed');
  const know = document.getElementById('rvKnow');
  if (know) know.disabled = false;
  window.dispatchEvent(new CustomEvent('stw:stop'));
  if (userId && plan) renderBar();
}

async function onPlanSave(e) {
  const s = read(), uid = s?.user_id;
  if (!s?.access_token || !uid) { console.warn('learn: plan save ignored — not logged in'); return; }
  const dict = String(e.detail?.dict || 'all');
  const goal = Number(e.detail?.goal) || 10;
  const autostart = e.detail?.autostart !== false;
  userId = uid;
  plan = { dict, daily_goal: goal };
  const ok = await savePlan(uid, dict, goal);
  if (!ok) console.warn('learn: plan upsert failed — continuing with the local copy');
  if (!autostart) { renderBar(); return; }
  await startLearn();
}
async function init() {
  const s = read();
  if (!s?.access_token || !s?.user_id) return;
  if (s.user_id !== userId) exitSession();
  userId = s.user_id;
  const p = await getPlan(userId);
  if (p) plan = p;
  renderBar();
}
async function renderBar() {
  const row = document.getElementById('learnRow'), btn = document.getElementById('learnBtn');
  if (!row || !btn) return;
  renderBarSync();
  if (plan) {
    await refreshDay();
    renderBarSync();
  }
  if (!btn.dataset.wired) { btn.dataset.wired = '1'; btn.addEventListener('click', () => startLearn()); }
  const back = document.getElementById('homeBack');
  if (back && !back.dataset.wired) { back.dataset.wired = '1'; back.addEventListener('click', () => window.dispatchEvent(new CustomEvent('stw:home-open'))); }
}
window.addEventListener('stw:auth', e => {
  if (e.detail?.loggedIn) init();
  else { exitSession(); userId = null; plan = null; }
});
window.addEventListener('stw:word-learned', onWordLearned);
window.addEventListener('stw:plan-save', onPlanSave);
window.addEventListener('stw:manual-nav', e => {
  if (state !== 'learning') return;
  pendingAdvance = false;
  const k = queue.indexOf(e.detail?.word);
  if (k >= 0) { pos = k; cur = k; }
});
window.addEventListener('stw:checkin-extra', () => extraGroup());
window.addEventListener('stw:checkin-exit', () => exitSession());
window.addEventListener('stw:review-progress', e => {
  if (state !== 'idle') return;
  showBar();
  const status = document.getElementById('learnStatus'), btn = document.getElementById('learnBtn');
  const done = Number(e.detail?.done) || 0, total = Number(e.detail?.total) || 0;
  if (status) status.textContent = `复习 ${done}/${total}`;
  setProg(total ? Math.min(100, done / total * 100) : 0);
  if (btn) btn.hidden = true;
});
window.addEventListener('stw:review-exit', () => { if (state === 'idle') hideBar(); });
window.addEventListener('stw:home-open', () => { if (state !== 'idle') exitSession(); else hideBar(); });
window.addEventListener('stw:home-close', () => { if (state !== 'idle') exitSession(); });
window.__stwSessionBusy = () => state !== 'idle';
window.__stwPlan = () => plan;
window.__stwLearnPlaylist = () => state === 'learning' ? queue.slice() : null;
window.__stwLearnWord = () => state === 'learning' ? queue[pos] : null;
window.__stwLearnStep = dir => {
  if (state !== 'learning' || flashBusy()) return;
  if (dir > 0) {
    if (quizWord) return;
    if (pendingAdvance) { pendingAdvance = false; advanceAfterGate(); return; }
    const done = new Set(readDone());
    if (!done.has(queue[pos])) { gateOrAdvance(); return; }
    let next = -1;
    if (shuffleOn()) {
      const rest = [];
      for (let k = 0; k < queue.length; k++) if (!done.has(queue[k])) rest.push(k);
      if (rest.length) next = rest[Math.floor(Math.random() * rest.length)];
    } else next = cur + 1 < queue.length ? cur + 1 : -1;
    maybeCheckin();
    if (state !== 'learning') return;
    if (next < 0) { exitSession(); return; }
    pos = next;
    go(next);
  } else {
    if (cur > 0) cur--;
    pos = cur;
    go(cur);
  }
};

window.addEventListener('stw:quiz-answer', onQuizAnswer);
window.addEventListener('stw:learn-ask', askNow);
window.addEventListener('stw:learn-next', onNext);
