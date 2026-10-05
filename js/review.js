import { getQuizPool, getUserWords, saveReviewState } from './plan-api.js?v=staging-9d3c5bf';
import { track } from './track.js?v=staging-9d3c5bf';
import { idxOf } from './bank.js?v=staging-9d3c5bf';
import { loadLyrics } from './lyrics.js?v=staging-9d3c5bf';

const KEY = 'stw.auth.session';
const LIMIT = 10;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedShuffle(arr, seed) {
  const out = arr.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function reviewableWords(uid) {
  const rows = await getUserWords(uid);
  if (!Array.isArray(rows)) { boxMap = new Map(); console.warn('review: user_words unavailable — review aborted'); return []; }
  const t = today(), out = [];
  boxMap = new Map();
  for (const r of rows) {
    if (!r || !r.word || !r.learned_at) continue;
    const b = Number(r.box);
    boxMap.set(r.word, Number.isInteger(b) && b >= 1 ? b : null);
    if (r.next_due != null && r.next_due > t) continue;
    out.push(r.word);
  }
  return out;
}

export const LADDER = [1, 2, 4, 7, 15, 30, 60];

export function addDays(ymd, n) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  const t = new Date(y || 1970, (m || 1) - 1, d || 1);
  t.setDate(t.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export function buildReviewQueue(userId, learnedWords, limit = 10, groups = 1) {
  const seed = fnv1a(userId + '|' + today() + '|review' + (groups > 1 ? groups : ''));
  return seedShuffle(Array.isArray(learnedWords) ? learnedWords : [], seed).slice(0, limit);
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  if (Math.abs(m - n) > 2) return Infinity;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function rngShuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function longestCommonCJK(a, b) {
  const A = String(a ?? '').replace(/[^\u4e00-\u9fff]/g, '');
  const B = String(b ?? '').replace(/[^\u4e00-\u9fff]/g, '');
  if (!A || !B) return 0;
  let best = 0, prev = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    const cur = new Array(B.length + 1).fill(0);
    for (let j = 1; j <= B.length; j++) {
      if (A[i - 1] === B[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
    }
    prev = cur;
  }
  return best;
}

function sameRoot(a, b) { return a.slice(0, 4) === b.slice(0, 4) || editDistance(a, b) <= 1; }

const RECENT_MAX = 24;
const recentMeanings = [];
const recentSet = new Set();
let quizSeq = 0;
const sessionSalt = Math.random().toString(36).slice(2) + '.' + Date.now().toString(36);

function noteRecent(m) {
  if (recentSet.has(m)) return;
  recentSet.add(m);
  recentMeanings.push(m);
  while (recentMeanings.length > RECENT_MAX) recentSet.delete(recentMeanings.shift());
}

export function buildQuizOptions(targetWord, targetMeaning, pool, userId) {
  const answer = String(targetMeaning ?? '');
  const list = Array.isArray(pool) ? pool : [];
  const tw = String(targetWord ?? '').toLowerCase();
  const rng = mulberry32(fnv1a([userId ?? '', targetWord ?? '', sessionSalt, ++quizSeq].join('|')));
  const tpos = (list.find(e => String(e?.word ?? '').toLowerCase() === tw) || {}).pos || '';

  const seen = new Set([answer]);
  const picked = [];
  const clash = m => longestCommonCJK(answer, m) > 1 || picked.some(p => longestCommonCJK(p.m, m) > 1);
  const take = p => { seen.add(p.m); picked.push(p); };
  const ok = (e, needPos, allowRecent) => {
    const w = String(e?.word ?? '').toLowerCase(), m = String(e?.meaning ?? '');
    if (!w || w === tw || !m || seen.has(m)) return null;
    if (sameRoot(tw, w)) return null;
    if (needPos && tpos && e?.pos !== tpos) return null;
    if (clash(m)) return null;
    if (!allowRecent && recentSet.has(m)) return null;
    return { m, w: String(e?.word ?? '') };
  };

  if (tpos) for (const e of rngShuffle(list, rng)) { if (picked.length >= 3) break; const p = ok(e, true, false); if (p) take(p); }

  for (const e of rngShuffle(list, rng)) { if (picked.length >= 3) break; const p = ok(e, false, false); if (p) take(p); }

  const tier1 = picked.length;
  let fallback = false;

  if (picked.length < 3) {
    fallback = true;
    const rest = rngShuffle(list.filter(e => {
      const w = String(e?.word ?? '').toLowerCase(), m = String(e?.meaning ?? '');
      return w && w !== tw && m && !seen.has(m) && longestCommonCJK(answer, m) <= 1;
    }), rng);
    for (const e of rest) { if (picked.length >= 3) break; const m = String(e?.meaning ?? ''); if (!m || seen.has(m)) continue; take({ m, w: String(e?.word ?? '') }); }
  }

  if (picked.length < 3) {
    const rest = rngShuffle(list.filter(e => {
      const w = String(e?.word ?? '').toLowerCase(), m = String(e?.meaning ?? '');
      return w && w !== tw && m && !seen.has(m);
    }), rng);
    for (const e of rest) { if (picked.length >= 3) break; const m = String(e?.meaning ?? ''); if (!m || seen.has(m)) continue; take({ m, w: String(e?.word ?? '') }); }
  }

  const entries = rngShuffle([{ m: answer, w: String(targetWord ?? '') }, ...picked], rng);
  for (const p of picked) noteRecent(p.m);
  const options = entries.map(p => p.m);
  return {
    options, optWords: entries.map(p => p.w), correctIndex: options.indexOf(answer),
    diag: { tpos, samePos: tier1, heteroRoot: picked.length, fallback },
  };
}

let state = 'idle';
let queue = [], pos = 0;
let right = 0, wrong = 0, relearn = 0, skipped = 0;
const processed = new Set();
const missed = new Set();
const cleared = new Set();
const served = new Set();
let allRight = 0, allWrong = 0, allRelearn = 0, allSkipped = 0;
let groups = 0;
const MAX_GROUPS = 2;
let dueCount = 0;
let userId = null;
let poolCache = [];
let poolMap = new Map();
let boxMap = new Map();

let quizWord = null;
let studying = false;
let replayWord = null;
let quizOptions = [], quizWords = [], quizCorrect = -1;
let answered = false;
let advanceTimer = 0;

let learnMod = null;
async function learn() {
  if (!learnMod) { try { learnMod = await import('./learn.js?v=staging-9d3c5bf'); } catch { console.warn('review: learn.js import failed — mutual-exclusion check skipped'); } }
  return learnMod;
}

function setMode(mode) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('stw-review', mode === 'review');
  document.body.classList.toggle('stw-study', mode === 'study');
  if (mode) document.body.classList.remove('stw-learn');
}

function go(i) {
  if (typeof window === 'undefined' || typeof window.__stwLearnGo !== 'function') { console.warn('review: host hook __stwLearnGo missing'); return false; }
  replayWord = null;
  document.body.classList.remove('stw-revealed');
  const know = document.getElementById('rvKnow');
  if (know) know.disabled = false;
  window.__stwLearnGo(queue[i]);
  queue.slice(i + 1, i + 3).forEach(w => { const j = idxOf(w); if (j >= 0) loadLyrics(j).catch(() => {}); });
  return true;
}

export async function startReview() {
  if (state !== 'idle') { console.warn('review: startReview ignored — a review session is already active'); return; }
  const s = read(), uid = s?.user_id;
  if (!s?.access_token || !uid) { console.warn('review: startReview ignored — not logged in'); return; }
  setMode('review');
  await startReviewBody(uid);
  if (state === 'idle') setMode(null);
}

async function startReviewBody(uid) {
  const learned = await reviewableWords(uid);
  if (!learned.length) { console.warn('review: startReview ignored — nothing to review (nothing learned or nothing due yet)'); return; }
  const pool = await getQuizPool();
  if (!Array.isArray(pool) || !pool.length) { console.warn('review: quiz pool unavailable — review not started'); return; }
  const L = await learn();
  if (L && L.getState().state !== 'idle') { console.warn('review: startReview ignored — a learn session is in progress'); return; }
  userId = uid;
  poolCache = pool;
  poolMap = new Map(pool.filter(e => e && e.word != null).map(e => [e.word, e.meaning]));
  groups = 1;
  queue = buildReviewQueue(uid, learned, LIMIT, groups);
  dueCount = learned.length;
  pos = 0; right = 0; wrong = 0; relearn = 0; skipped = 0; processed.clear();
  missed.clear(); cleared.clear(); served.clear();
  allRight = 0; allWrong = 0; allRelearn = 0; allSkipped = 0;
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1;
  setMode('review');
  state = 'reviewing';
  if (!go(0)) { exitReview(); return; }
  progress();
  track('review-start', { total: queue.length });
}

function progress() {
  window.dispatchEvent(new CustomEvent('stw:review-progress', { detail: { done: right + wrong + relearn + skipped, total: queue.length } }));
}

function bankRound() {
  for (const w of queue) served.add(w);
  allRight += right; allWrong += wrong; allRelearn += relearn; allSkipped += skipped;
}

async function advance() {
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1;
  pos++;
  if (pos < queue.length) { go(pos); return; }
  bankRound();
  if (missed.size && groups < MAX_GROUPS) {
    groups++;
    queue = buildReviewQueue(userId, [...missed], LIMIT, groups);
    pos = 0; right = 0; wrong = 0; relearn = 0; skipped = 0; processed.clear();
    quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1;
    state = 'reviewing';
    progress();
    if (!go(0)) { exitReview(); return; }
    track('review-extra', { total: queue.length, auto: true });
    return;
  }
  state = 'summary';
  let due = 0;
  try { const rows = await reviewableWords(userId); if (Array.isArray(rows)) due = rows.length; } catch {}
  const remaining = Math.max(due, dueCount - cleared.size, 0);
  window.dispatchEvent(new CustomEvent('stw:review-summary', { detail: { right: allRight, wrong: allWrong, relearn: allRelearn, skipped: allSkipped, total: served.size, remaining, round: groups, maxRound: MAX_GROUPS } }));
  track('review-done', { right: allRight, wrong: allWrong, relearn: allRelearn, skipped: allSkipped, total: served.size, remaining });
}

function askWord(w) {
  const meaning = w ? poolMap.get(w) : null;
  if (!meaning) return false;
  const { options, correctIndex, optWords } = buildQuizOptions(w, meaning, poolCache, userId);
  if (options.length < 4 || correctIndex < 0) { console.warn('review: not enough distinct meanings for "' + w + '" — word skipped'); return false; }
  quizWord = w; quizOptions = options; quizWords = optWords; quizCorrect = correctIndex; answered = false;
  window.dispatchEvent(new CustomEvent('stw:quiz-show', { detail: { word: w, options } }));
  return true;
}

function onClipEnded(e) {
  if (state !== 'reviewing') return;
  if (learnMod && learnMod.getState().state !== 'idle') { exitReview(); return; }

  if (window.__stwLoopOn?.()) return;
  e.preventDefault();
  if (studying) { endStudy(); advance(); return; }
  if (quizWord) return;
  const w = e.detail?.word ?? queue[pos];
  if (replayWord != null && w === replayWord) return;
  if (processed.has(w)) { advance(); return; }
  if (!askWord(w)) { processed.add(w); skipped++; progress(); advance(); }
}

function onQuizAnswer(e) {
  if (state !== 'reviewing' || !quizWord || answered) return;
  const chosen = Number(e.detail?.index);
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= quizOptions.length) { console.warn('review: quiz answer ignored — bad index', e.detail?.index); return; }
  answered = true;
  const correct = chosen === quizCorrect;
  if (correct) { right++; missed.delete(quizWord); cleared.add(quizWord); } else { wrong++; missed.add(quizWord); cleared.delete(quizWord); }
  processed.add(quizWord);
  progress();

  const box = correct ? Math.min((boxMap.get(quizWord) ?? 1) + 1, 7) : 1;
  const nextDue = correct ? addDays(today(), LADDER[box - 1]) : today();
  boxMap.set(quizWord, box);
  saveReviewState(userId, quizWord, correct, box, nextDue)?.catch?.(() => {});
  window.dispatchEvent(new CustomEvent('stw:quiz-result', { detail: { chosenIndex: chosen, correctIndex: quizCorrect, correct, optWords: quizWords } }));
  const qn = document.getElementById('quizNext');
  if (qn) qn.hidden = true;
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(settleQuiz, correct ? 1600 : 4400);
}

function settleQuiz() {
  advanceTimer = 0;
  replayWord = quizWord ?? queue[pos];
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1;
  document.body.classList.add('stw-revealed');
  const know = document.getElementById('rvKnow');
  if (know) know.disabled = true;
  window.dispatchEvent(new CustomEvent('stw:quiz-close'));
  if (replayWord != null) window.__stwLearnGo?.(replayWord);
}

function earlyAsk() {
  if (state !== 'reviewing' || quizWord || studying) return;
  window.dispatchEvent(new CustomEvent('stw:stop'));
  const w = queue[pos];
  if (processed.has(w)) { advance(); return; }
  if (!askWord(w)) { processed.add(w); skipped++; progress(); advance(); }
}


function endStudy() {
  studying = false;
  setMode('review');
}

function onManualNav(e) {
  if (state !== 'reviewing') return;
  if (studying) endStudy();
  if (quizWord) return;
  const k = queue.indexOf(e.detail?.word);
  if (k >= 0) pos = k;
}

function revealNext() {
  if (state !== 'reviewing') return;
  if (studying) { endStudy(); advance(); return; }
  if (quizWord) return;
  const w = queue[pos];
  if (processed.has(w)) { advance(); return; }
  skipped++;
  progress();
  processed.add(w);
  const meaning = w ? poolMap.get(w) : null;
  window.dispatchEvent(new CustomEvent('stw:stop'));
  if (!meaning) { advance(); return; }
  missed.add(w);
  quizWord = w;
  window.dispatchEvent(new CustomEvent('stw:review-reveal', { detail: { word: w, meaning } }));
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    advanceTimer = 0;
    window.dispatchEvent(new CustomEvent('stw:quiz-close'));
    advance();
  }, 1800);
}

export async function extraReview() {
  if (state !== 'summary') { console.warn('review: extraReview ignored — no finished group to restart from'); return; }
  if (groups >= MAX_GROUPS) { console.warn('review: extraReview ignored — max redo rounds reached'); exitReview(); return; }
  bankRound();
  groups++;
  const due = await reviewableWords(userId);
  queue = buildReviewQueue(userId, due, LIMIT, groups);
  if (!queue.length) { console.warn('review: no learned words for another group — exiting'); exitReview(); return; }
  dueCount = due.length;
  pos = 0; right = 0; wrong = 0; relearn = 0; skipped = 0; processed.clear();
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1;
  state = 'reviewing';
  progress();
  if (!go(0)) { exitReview(); return; }
  track('review-extra', { total: queue.length });
}

export function exitReview() {

  if (state !== 'idle') track('review-exit', { mid: state !== 'summary', total: queue.length });
  if (quizWord) window.dispatchEvent(new CustomEvent('stw:quiz-close'));
  replayWord = null;
  state = 'idle'; queue = []; pos = 0; right = 0; wrong = 0; relearn = 0; skipped = 0; groups = 0; dueCount = 0; processed.clear();
  missed.clear(); cleared.clear(); served.clear();
  allRight = 0; allWrong = 0; allRelearn = 0; allSkipped = 0;
  quizWord = null; answered = false; quizOptions = []; quizWords = []; quizCorrect = -1; studying = false;
  clearTimeout(advanceTimer); advanceTimer = 0;
  setMode(null);
  document.body.classList.remove('stw-revealed');
  const know = document.getElementById('rvKnow');
  if (know) know.disabled = false;
  window.dispatchEvent(new CustomEvent('stw:stop'));
  window.dispatchEvent(new CustomEvent('stw:review-exit'));
}

function onAuth(e) {
  if (e.detail?.loggedIn || state === 'idle') return;
  exitReview();
  userId = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('stw:clip-ended', onClipEnded);
  window.addEventListener('stw:quiz-answer', onQuizAnswer);
  window.addEventListener('stw:review-start', () => startReview());
  window.addEventListener('stw:review-extra', () => extraReview());

  window.addEventListener('stw:review-exit', () => { if (state !== 'idle') exitReview(); });

  window.addEventListener('stw:review-early', earlyAsk);
  window.addEventListener('stw:review-skip', revealNext);
  window.addEventListener('stw:manual-nav', onManualNav);
  window.addEventListener('stw:auth', onAuth);
  window.addEventListener('stw:home-open', () => { if (state !== 'idle') exitReview(); });
  window.addEventListener('stw:home-close', () => { if (state !== 'idle') exitReview(); });

  window.__stwReviewBusy = () => state !== 'idle';

  window.__stwReviewPlaylist = () => state === 'reviewing' ? queue.slice() : null;
  window.__stwReviewWord = () => state === 'reviewing' ? queue[pos] : null;

  window.__stwReviewStep = dir => {
    if (state !== 'reviewing') return;
    if (dir > 0) { revealNext(); return; }
    if (quizWord) return;
    if (studying) endStudy();
    if (pos > 0) pos--;
    go(pos);
  };
}
