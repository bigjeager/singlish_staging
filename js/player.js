import { DATA, state, trial } from './bank.js?v=staging-767b940';
import { store, fmt, isMobile } from './util.js?v=staging-767b940';
import { track } from './track.js?v=staging-767b940';
import { loadLyrics, fillLyrics } from './lyrics.js?v=staging-767b940';
import { showGloss, hideGloss } from './gloss.js?v=staging-767b940';
import { deskStage, carousel, markCards, fillSlides } from './stage.js?v=staging-767b940';

const $ = s => document.querySelector(s);
export const P = { i: -1, root: null, L: null, raf: 0, playing: false, loading: false, curLine: -1, timer: 0, token: 0 };
const au = new Audio(); au.preload = 'auto';
au.addEventListener('playing', () => { P.playing = true; setLoading(false); P.root?.querySelector('.play-err')?.remove(); });
au.addEventListener('pause', () => { P.playing = false; setLoading(false); updateBtn(); });
au.addEventListener('waiting', () => { if (!au.paused) setLoading(true); });
au.addEventListener('error', () => { if (au.src) { setLoading(false); showErr(); } });

export function currentRoot() { if (isMobile()) fillSlides(state.cur); return isMobile() ? carousel.children[state.cur]?.querySelector('.stage') : deskStage.querySelector('.stage'); }

export function resetVisual(root) {
  if (!root) return;
  root.classList.remove('live');
  root.querySelectorAll('.ln').forEach(l => l.classList.remove('cur', 'past'));
  root.querySelectorAll('.lw').forEach(w => { w.style.removeProperty('--p'); w._p = undefined; });
  const inner = root.querySelector('.lyrics-in'); if (inner) inner.style.transform = '';
  const box = root.querySelector('.lyrics'); if (box) box.scrollTop = 0;
}

window.addEventListener('stw:stop', () => stop());
export function stop() {
  P.token++;
  hideGloss();
  clearTimeout(P.timer); P.timer = 0; holdUntil = 0; cancelAnimationFrame(P.raf);
  if (!au.paused) au.pause();
  P.playing = false; P.curLine = -1;
  resetVisual(P.root);
  const dp = $('#deckProg'); if (dp) dp.style.width = '0';
  setLoading(false);
  updateBtn();
}

export function primeAudio(i) {
  const src = DATA[i]?.preview;
  if (!src || au.src === src || !au.paused) return;
  au.src = src; au.load();
}

function seekPlay(src, t) {
  const start = () => { try { au.currentTime = t; } catch {} au.play().catch(err => { if (err?.name === 'AbortError') return; setLoading(false); showMsg('播放未启动，请再点一次播放键。'); }); };
  if (au.src !== src) { au.src = src; au.addEventListener('loadedmetadata', start, { once: true }); au.load(); }
  else if (au.readyState >= 1) start();
  else au.addEventListener('loadedmetadata', start, { once: true });
}

export function setDeck(i) {
  const e = DATA[i];
  $('#deckArt').src = e.art;
  $('#deckBg').style.backgroundImage = `url("${e.art}")`;
  $('#deckTitle').textContent = e.title; $('#deckArtist').textContent = e.artist;
  $('#deckLink').href = e.appleUrl;
  $('#deckProg').style.width = '0';
}
export function cue(i) { setDeck(i); }

function showMsg(text) {
  const box = P.root?.querySelector('.lyrics-in');
  if (box && !box.querySelector('.play-err')) box.insertAdjacentHTML('beforeend', `<p class="lyr-msg play-err">${text}</p>`);
}

function showErr() {
  const e = DATA[state.cur];
  showMsg(`试听加载失败，<a href="${e.appleUrl}" target="_blank" rel="noopener">去 Apple Music 听这首</a>。`);
}

export function markLearned(w) {
  if (!w || state.done.has(w)) return;
  window.dispatchEvent(new CustomEvent('stw:word-learned', { detail: { word: w } }));
  state.done.add(w); store.set('stw.done', [...state.done]); markCards();
  window.__stwSync?.('stw.done');
}

export async function play(i, from) {
  stop();
  setLoading(true);
  const token = P.token;
  P.i = i; P.root = currentRoot();
  await fillLyrics(i, P.root);
  let L; try { L = await loadLyrics(i); } catch { setLoading(false); return; }
  if (token !== P.token) return;
  P.L = L;
  P.lineEls = [...P.root.querySelectorAll('.ln')];
  P.wordEls = P.lineEls.map(l => [...l.querySelectorAll('.lw')]);
  P.box = P.root.querySelector('.lyrics'); P.inner = P.root.querySelector('.lyrics-in');
  P.root.classList.add('live');
  $('#clipTag').textContent = `片段 ${fmt(L.start)}–${fmt(L.end)}`;
  seekPlay(DATA[i].preview, Math.max(L.start, from ?? L.start) - DATA[i].offset);
  const w = DATA[i].word, inSession = !trial && typeof window.__stwSessionBusy === 'function' && window.__stwSessionBusy()
    && w === (window.__stwLearnWord?.() ?? window.__stwReviewWord?.());
  if (inSession && window.__stwLearnWord?.() == null) markLearned(w);
  P.raf = requestAnimationFrame(frame);
  preload(i + 1); preload(i + 2);
}

function preload(i) { if (i < DATA.length) loadLyrics(i).catch(() => {}); }

function frame() {
  const t = au.currentTime + DATA[P.i].offset;
  if (!au.paused && t >= P.L.start - .5) {
    render(t);
    $('#deckProg').style.width = `${Math.min(100, Math.max(0, (t - P.L.start) / (P.L.end - P.L.start) * 100))}%`;
  }
  if ((!au.paused && t >= P.L.end) || au.ended) return ended();
  P.raf = requestAnimationFrame(frame);
}

function render(t) {
  const L = P.L.lines;
  let cur = -1; for (let k = 0; k < L.length; k++) if (t >= L[k].st - .08) cur = k;
  if (cur !== P.curLine) {
    P.lineEls.forEach((el, k) => { el.classList.toggle('cur', k === cur); el.classList.toggle('past', k < cur); });
    if (P.curLine >= 0) P.wordEls[P.curLine]?.forEach(w => w.style.removeProperty('--p'));
    P.curLine = cur;
    const el = P.lineEls[Math.max(0, cur)];
    if (el && P.box) {
      const top = Math.max(0, el.offsetTop - (P.box.clientHeight - el.offsetHeight) / 2);
      P.box.scrollTop = top;
    }
  }
  if (cur >= 0) {
    const line = L[cur], words = P.wordEls[cur] || [];
    const setP = (w, p) => { if (w._p !== p) { if (p > 0 && !(w._p > 0) && (w.classList.contains('xw') || w.classList.contains('tw'))) showGloss(w, 2400); w._p = p; w.style.setProperty('--p', p.toFixed(3)); if (w.classList.contains('tw') || w.classList.contains('xw')) w.classList.toggle('hit', p > 0); } };
    if (line.wt && line.wt.length === words.length) {
      words.forEach((w, i) => {
        const s = line.wt[i], e = Math.min(line.wt[i + 1] ?? line.end, s + 1.2);
        setP(w, t <= s ? 0 : t >= e ? 1 : (t - s) / Math.max(.08, e - s));
      });
    } else {
      const span = Math.min(line.end - line.st, .34 * line.x.length / 3 + .6) * .92;
      const total = words.reduce((a, w) => a + w.textContent.length + 1, 0);
      let acc = 0;
      words.forEach(w => {
        const s = line.st + span * acc / total; acc += w.textContent.length + 1;
        const e = line.st + span * acc / total;
        setP(w, t <= s ? 0 : t >= e ? 1 : (t - s) / (e - s));
      });
    }
  }
  $('#time').textContent = `${fmt(Math.max(0, t - P.L.start))} / ${fmt(P.L.end - P.L.start)}`;
}

const sungThisVisit = new Set();
function noteSung(i) {
  if (i < 0) return;
  const before = sungThisVisit.size;
  sungThisVisit.add(DATA[i].word);
  if (sungThisVisit.size !== before && [5, 20, 50].includes(sungThisVisit.size)) track('sung', { n: sungThisVisit.size });
}

let holdUntil = 0;
function fireAdvance() {
  P.timer = 0;
  if (!window.dispatchEvent(new CustomEvent('stw:clip-ended', { cancelable: true, detail: { word: DATA[P.i]?.word } }))) return;
  if (state.loop) play(P.i);
  else window.dispatchEvent(new CustomEvent('stw:free-advance', { detail: { word: DATA[P.i]?.word } }));
}
export function deferAdvance(ms = 2500) {
  holdUntil = Date.now() + ms;
  if (!P.timer) return;
  const token = P.token;
  clearTimeout(P.timer);
  P.timer = setTimeout(() => { if (token !== P.token) return; fireAdvance(); }, Math.max(0, holdUntil - Date.now()));
}

function ended() {
  noteSung(P.i);
  au.pause(); P.playing = false; updateBtn();
  P.lineEls.forEach(l => { l.classList.remove('cur'); l.classList.add('past'); });
  const token = P.token;
  const wait = Math.max(900, holdUntil - Date.now());
  P.timer = setTimeout(() => {
    if (token !== P.token) return;
    fireAdvance();
  }, wait);
}

function setLoading(on) {
  P.loading = on;
  document.body.classList.toggle('is-loading', on);
  updateBtn();
}

export function updateBtn() {
  const on = P.playing;
  $('#icoPlay').toggleAttribute('hidden', on); $('#icoPause').toggleAttribute('hidden', !on);
  $('#play').setAttribute('aria-label', on ? '暂停' : P.loading ? '加载中' : '播放');
  document.body.classList.toggle('is-playing', on);
  markCards();
}

export function toggle() {
  if (P.i !== state.cur || !P.L) return play(state.cur);
  if (P.playing) { au.pause(); cancelAnimationFrame(P.raf); P.playing = false; }
  else if (P.root.classList.contains('live') && au.currentTime + DATA[P.i].offset < P.L.end - .2) {
    setLoading(true);
    au.play().catch(err => { if (err?.name === 'AbortError') return; setLoading(false); showMsg('播放未启动，请再点一次播放键。'); });
    P.raf = requestAnimationFrame(frame);
  }
  else return play(state.cur);
  updateBtn();
}

export function getAudioTime() { return au.currentTime; }
export function isAudioPaused() { return au.paused; }
export function pauseAudio() { au.pause(); }
export function seekWithinCurrent(t) { clearTimeout(P.timer); P.timer = 0; holdUntil = 0; au.currentTime = t; }
window.__stwSeekClip = t => seekWithinCurrent(t);
