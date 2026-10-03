import { DATA, idxOf, ensureDetail } from './bank.js?v=staging-9783eec';
import { parseLrc } from './lyrics.js?v=staging-9783eec';
import { esc } from './util.js?v=staging-9783eec';
import { getUserWords, saveSrsState } from './plan-api.js?v=staging-9783eec';
import { LADDER, addDays } from './review.js?v=staging-9783eec';

const FLASH_KEY = 'stw.flash.day';
const LRC_MS = 10000;
const META_MS = 8000;
const CLOSE_RIGHT = 2600;
const CLOSE_WRONG = 5200;

let booted = false;
let userId = null;
let pool = [];
const ciMap = new Map();
const boxMap = new Map();
let retryQueue = [];
const fifo = [];
let pending = null;
let answered = false;
let preparing = 0;
let cardUp = false;
let closeTimer = 0;
let token = 0;
let proceedFn = null;
let endingFlag = false;
const flash = { shown: 0, right: 0, wrong: 0, abandoned: 0 };

const au = new Audio();
au.preload = 'auto';

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

function readFlashed() {
  try {
    const v = JSON.parse(localStorage.getItem(FLASH_KEY));
    if (v && typeof v === 'object' && v.d === today() && Array.isArray(v.words)) return new Set(v.words);
  } catch {}
  return new Set();
}

function writeFlashed(set) {
  try { localStorage.setItem(FLASH_KEY, JSON.stringify({ d: today(), words: [...set] })); } catch {}
}

function markFlashed(w) {
  const s = readFlashed();
  if (s.has(w)) return;
  s.add(w);
  writeFlashed(s);
}

function unmarkFlashed(w) {
  const s = readFlashed();
  if (!s.has(w)) return;
  s.delete(w);
  writeFlashed(s);
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  if (Math.abs(m - n) > 2) return 99;
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

function sameRoot(a, b) { return a.slice(0, 4) === b.slice(0, 4) || editDistance(a, b) <= 1; }

export function buildFlashOptions(word) {
  const target = String(word ?? '').toLowerCase();
  if (!target) return null;
  const seen = new Set([target]);
  const scored = [];
  for (const e of DATA) {
    const w = String(e?.word ?? '').toLowerCase();
    if (!w || seen.has(w) || sameRoot(target, w)) continue;
    seen.add(w);
    scored.push({ w, ld: Math.abs(w.length - target.length), ed: editDistance(target, w) });
  }
  scored.sort((a, b) => a.ld - b.ld || a.ed - b.ed);
  const seed = fnv1a((userId || '') + '|' + target + '|flash');
  const picks = seedShuffle(scored.slice(0, 12).map(s => s.w), seed).slice(0, 3);
  if (picks.length < 3) return null;
  const options = seedShuffle([target, ...picks], seed);
  const correctIndex = options.indexOf(target);
  if (options.length !== 4 || correctIndex < 0) return null;
  return { options, correctIndex };
}

async function pickClip(e, learnCi) {
  try { await ensureDetail(e); } catch { return null; }
  const clips = Array.isArray(e.clips) ? e.clips : null;
  if (!clips || !clips.length || !clips[0]?.preview) return null;
  if (clips.length < 2) return { clip: clips[0], k: 0, multi: false };
  const k = Number(learnCi) === 0 ? 1 : 0;
  if (!clips[k]?.preview) return null;
  return { clip: clips[k], k, multi: true };
}

function fetchClipLrc(id) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LRC_MS);
  return fetch(`https://lrclib.net/api/get/${id}`, { signal: ac.signal })
    .finally(() => clearTimeout(t))
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
}

async function clipWindow(clip, word) {
  const d = await fetchClipLrc(clip.lrclib);
  const all = parseLrc(d.syncedLyrics || '');
  const k = all.findIndex(l => Math.abs(l.t - clip.t) < .05);
  const ki = k < 0 ? all.findIndex(l => l.t >= clip.t - .5) : k;
  if (ki < 0) throw new Error('flashback: line not found');
  const off = clip.offset || 0, lim = off + 29.6;
  const start = Math.max(off + .05, all[ki].t - 1.2);
  let end = Math.min(lim, (all[ki + 1]?.t ?? all[ki].t + 4) + .4);
  if (end - start > 20) end = start + 20;
  const w = String(word ?? '').toLowerCase();
  const win = all.slice(Math.max(0, ki - 1), ki + 3);
  const withWord = w ? win.find(l => l.x && l.x.toLowerCase().includes(w)) : null;
  const lyricLine = withWord || win.find(l => l.x) || all[ki];
  return { at: Math.max(0, start - off), endAudio: Math.max(1, end - off), text: lyricLine.x };
}

function seekAudio(src, t) {
  return new Promise((resolve, reject) => {
    const off = () => {
      clearTimeout(timer);
      au.removeEventListener('loadedmetadata', onMeta);
      au.removeEventListener('error', onErr);
    };
    const timer = setTimeout(() => { off(); reject(new Error('flashback: audio meta timeout')); }, META_MS);
    const onMeta = () => { off(); try { au.currentTime = t; resolve(); } catch { reject(new Error('flashback: seek failed')); } };
    const onErr = () => { off(); reject(new Error('flashback: audio load failed')); };
    au.addEventListener('loadedmetadata', onMeta);
    au.addEventListener('error', onErr);
    au.src = src;
    au.load();
  });
}

async function prepare(word) {
  const i = idxOf(word);
  if (i < 0) return null;
  const quiz = buildFlashOptions(word);
  if (!quiz) { console.warn('flashback: not enough word-form options for "' + word + '" — flash skipped'); return null; }
  const pick = await pickClip(DATA[i], ciMap.get(word) ?? 0);
  if (!pick) { console.warn('flashback: clips unavailable for "' + word + '" — flash skipped'); return null; }
  let win;
  try { win = await clipWindow(pick.clip, word); } catch { console.warn('flashback: lyrics window unavailable for "' + word + '" — flash skipped'); return null; }
  try { await seekAudio(pick.clip.preview, win.at); } catch { console.warn('flashback: audio not ready for "' + word + '" — flash skipped'); return null; }
  return { word, options: quiz.options, correctIndex: quiz.correctIndex, k: pick.k, multi: pick.multi, fromTitle: pick.multi ? pick.clip.title : null, src: pick.clip.preview, at: win.at, endAudio: win.endAudio, lyric: win.text };
}

function stopAudio() {
  try { au.pause(); } catch {}
}

au.addEventListener('error', () => { if (pending && !answered) abandonFlash(token); });
au.addEventListener('timeupdate', () => { if (pending && !au.paused && au.currentTime >= pending.endAudio) { try { au.pause(); } catch {} } });

function beginFlash(prep, retry, type, my) {
  pending = { ...prep, retry, type };
  answered = false;
  cardUp = true;
  markFlashed(prep.word);
  flash.shown++;
  window.dispatchEvent(new CustomEvent('stw:stop'));
  window.dispatchEvent(new CustomEvent('stw:flash-show', { detail: { word: prep.word, options: prep.options, type } }));
  au.play().catch(() => abandonFlash(my));
}

function lyricHighlight(line, word) {
  const text = String(line ?? ''), w = String(word ?? '').toLowerCase();
  if (!text || !w) return esc(text);
  const lower = text.toLowerCase(), edge = c => !c || !/[a-z0-9']/i.test(c);
  for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) {
    if (!edge(text[i - 1])) continue;
    const tail = lower.slice(i + w.length);
    const inf = tail.match(/^(ing|es|'s|ed|s|d|')/);
    if (inf ? !edge(tail[inf[0].length]) : !edge(tail[0])) continue;
    return esc(text.slice(0, i)) + '<span class="xw">' + esc(text.slice(i, i + w.length)) + '</span>' + esc(text.slice(i + w.length));
  }
  return esc(text);
}

function abandonFlash(my) {
  if (!pending || answered) return;
  const { word, retry } = pending;
  unmarkFlashed(word);
  pending = null; answered = false; cardUp = false;
  stopAudio();
  window.dispatchEvent(new CustomEvent('stw:flash-close'));
  flash.abandoned++;
  nextAfter(retry, pending.type, my);
}

window.addEventListener('stw:flash-replay', () => {
  if (!pending || answered) return;
  stopAudio();
  seekAudio(pending.src, pending.at).then(() => au.play()).catch(() => {});
});

function recordSrs(word, correct) {
  if (!userId) return;
  const box = correct ? Math.min((boxMap.get(word) ?? 1) + 1, 7) : 1;
  const nextDue = correct ? addDays(today(), LADDER[box - 1]) : today();
  if (correct) boxMap.set(word, box);
  saveSrsState(userId, word, correct, box, nextDue)?.catch?.(() => {});
}
async function loadBoxes(rows) {
  if (!Array.isArray(rows)) rows = await getUserWords(userId);
  if (!Array.isArray(rows)) return;
  for (const r of rows) {
    if (!r?.word) continue;
    const b = Number(r.box);
    boxMap.set(r.word, Number.isInteger(b) && b >= 1 ? b : 1);
  }
}

window.addEventListener('stw:flash-answer', e => {
  if (!pending || answered) return;
  const chosen = Number(e.detail?.index);
  if (!Number.isInteger(chosen) || chosen < 0 || chosen >= pending.options.length) { console.warn('flashback: answer ignored — bad index', e.detail?.index); return; }
  answered = true;
  const correct = chosen === pending.correctIndex;
  recordSrs(pending.word, correct);
  if (!pending.retry && !correct) retryQueue.push({ word: pending.word, type: pending.type });
  correct ? flash.right++ : flash.wrong++;
  const optMeanings = pending.options.map(w => String(DATA[idxOf(w)]?.meaning ?? ''));
  window.dispatchEvent(new CustomEvent('stw:flash-result', { detail: { chosenIndex: chosen, correctIndex: pending.correctIndex, correct, fromTitle: pending.fromTitle, lyric: lyricHighlight(pending.lyric, pending.word), optMeanings } }));
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = 0;
    const retry = pending.retry, type = pending.type;
    pending = null; answered = false; cardUp = false;
    stopAudio();
    window.dispatchEvent(new CustomEvent('stw:flash-close'));
    nextAfter(retry, type, token);
  }, correct ? CLOSE_RIGHT : CLOSE_WRONG);
});

function nextAfter(retry, type, my) {
  if (my !== token) return;
  if ((retry || endingFlag) && retryQueue.length) { const r = retryQueue.shift(); attempt(r.word, true, r.type, my); return; }
  finish(my);
}

async function attempt(word, retry, type, my) {
  preparing++;
  let prep = null;
  try { prep = await prepare(word); } catch { prep = null; }
  preparing--;
  if (my !== token) return;
  if (!prep) { nextAfter(retry, type, my); return; }
  beginFlash(prep, retry, type, my);
}

function finish(my) {
  if (my !== token) return;
  const p = proceedFn;
  proceedFn = null;
  if (p) p();
}

function pickCandidate() {
  const flashed = readFlashed();
  for (const w of pool) {
    if (flashed.has(w) || idxOf(w) < 0 || fifo.some(e => e.word === w)) continue;
    return w;
  }
  return null;
}

export function boot(uid, dayWords, rows) {
  token++;
  flash.shown = 0; flash.right = 0; flash.wrong = 0; flash.abandoned = 0;
  userId = uid || null;
  const seen = new Set();
  pool = [];
  for (const w of (Array.isArray(dayWords) ? dayWords : [])) {
    if (!w || seen.has(w)) continue;
    seen.add(w); pool.push(w);
  }
  retryQueue = [];
  ciMap.clear();
  boxMap.clear();
  if (userId) loadBoxes(rows);
  pending = null; answered = false; cardUp = false; preparing = 0;
  clearTimeout(closeTimer); closeTimer = 0;
  stopAudio();
  booted = true;
}

export function drain(proceed, info) {
  const my = ++token;
  proceedFn = typeof proceed === 'function' ? proceed : null;
  endingFlag = !!(info && info.ending);
  const count = Number(info && info.count) || 0;
  if (booted && count > 0 && count % 2 === 0) {
    const w = pickCandidate();
    if (w) fifo.push({ word: w, retry: false, type: 'flash', ready: true });
  }
  if (endingFlag && retryQueue.length) { const r = retryQueue.shift(); attempt(r.word, true, r.type, my); return; }
  const idx = fifo.findIndex(e => e.ready !== false);
  const next = idx >= 0 ? fifo.splice(idx, 1)[0] : null;
  for (const e of fifo) e.ready = true;
  if (next) { attempt(next.word, next.retry, next.type, my); return; }
  finish(my);
}

export function reset() {
  token++;
  booted = false;
  pool = []; retryQueue = []; fifo.length = 0; ciMap.clear();
  const wasUp = cardUp || !!pending;
  pending = null; answered = false; cardUp = false; preparing = 0;
  clearTimeout(closeTimer); closeTimer = 0;
  stopAudio();
  proceedFn = null; endingFlag = false;
  if (wasUp) window.dispatchEvent(new CustomEvent('stw:flash-close'));
}

export function flashStats() { return { ...flash }; }

export function busy() { return booted && (!!pending || preparing > 0); }

export function enqueueWrong(word) {
  if (!booted || !word || fifo.some(e => e.word === word)) return;
  const i = fifo.findIndex(e => e.type === 'flash');
  if (i >= 0) fifo.splice(i, 0, { word, retry: false, type: 'wrong', ready: false });
  else fifo.push({ word, retry: false, type: 'wrong', ready: false });
}

window.addEventListener('stw:word-learned', e => {
  if (!booted) return;
  const w = e.detail?.word;
  if (!w || pool.includes(w)) return;
  const i = idxOf(w);
  if (i < 0) return;
  pool.push(w);
  ciMap.set(w, DATA[i].ci || 0);
});

window.addEventListener('stw:checkin-done', () => { retryQueue = []; });

window.__stwFlashBusy = () => busy();
window.__stwFlashAudio = () => ({ paused: au.paused, t: au.currentTime || 0, dur: au.duration || 0 });
