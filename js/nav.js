import { ALL, DATA, setAll, setData, state, trial, inDict, fromMeta, stubify, ensureDetail, useClip, trialMeta } from './bank.js?v=staging-77a4899';
import { store, expand, isMobile, DICT_NAME, fmt } from './util.js?v=staging-77a4899';
import { getBankList, readBankCache, saveBankCache, revalidateBank } from './plan-api.js?v=staging-77a4899';
import { lyr, loadLyrics, fillLyrics } from './lyrics.js?v=staging-77a4899';
import { grid, deskStage, carousel, stageHTML, renderGrid, markCards, fillSlides, clearFilled } from './stage.js?v=staging-77a4899';
import { P, stop, currentRoot, play, cue, primeAudio, deferAdvance } from './player.js?v=staging-77a4899';
import { syncCarouselClose } from './wiring.js?v=staging-77a4899';

let suppressScroll = false, scrollT = 0;
let sessionNav = false;
let artFlip = false;
const hist = [];
export const initialHash = location.hash;

export function setSessionNav(v) { sessionNav = v; }

function setArt(i) {
  const [on, off] = artFlip ? [document.querySelector('#artA'), document.querySelector('#artB')] : [document.querySelector('#artB'), document.querySelector('#artA')];
  artFlip = !artFlip;
  on.style.backgroundImage = `url("${DATA[i].art}")`;
  on.classList.add('show'); off.classList.remove('show');
}

function nextIndex() {
  if (!state.shuffle) return state.cur + 1;
  const all = DATA.map((_, i) => i).filter(i => i !== state.cur);
  const fresh = all.filter(i => !state.done.has(DATA[i].word));
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}
export function goNext() { go(nextIndex(), true); }
export function goPrev() {
  if (state.shuffle && hist.length) { const i = hist.pop(); go(i, true, true); }
  else go(state.cur - 1, true);
}

export function go(i, autoplay, back) {
  deferAdvance();
  i = (i + DATA.length) % DATA.length;
  if (!sessionNav && i !== state.cur) {
    const s = activeSession();
    if (s) {
      const w = DATA[i]?.word;
      const cur = s === 'learn' ? window.__stwLearnWord?.() : window.__stwReviewWord?.();
      const list = s === 'learn' ? window.__stwLearnPlaylist?.() : window.__stwReviewPlaylist?.();
      if (w !== cur && !(Array.isArray(list) && list.includes(w))) return;
    }
  }
  if (!document.querySelector('.home.open')) try { history.replaceState(null, '', '#' + encodeURIComponent(DATA[i].word)); } catch {}
  store.set('stw.pos', { word: DATA[i].word, ci: DATA[i].ci });
  if (i !== state.cur && !back) { hist.push(state.cur); if (hist.length > 200) hist.shift(); }
  if (i !== state.cur || !artFlip) setArt(i);
  stop();
  if (i !== state.cur && !sessionNav) window.dispatchEvent(new CustomEvent('stw:manual-nav', { detail: { word: DATA[i].word } }));
  state.cur = i; P.i = -1; P.L = null;
  if (isMobile()) {
    buildCarousel();   // 自愈：会话恢复路径可能先于 applyMode 进 go()（空轮播上 fillSlides 是 no-op）
    fillSlides(i);
    const slide = carousel.children[i];
    let jumped = false;
    if (slide && Math.abs(carousel.scrollLeft - slide.offsetLeft) > 2) { suppressScroll = true; carousel.scrollTo({ left: slide.offsetLeft, behavior: 'auto' }); setTimeout(() => suppressScroll = false, 80); jumped = true; }
    const st = slide?.querySelector('.stage');
    if (st && jumped) { st.classList.remove('enter-word'); void st.offsetWidth; st.classList.add('enter-word'); setTimeout(() => st.classList.remove('enter-word'), 500); }   // 词面入场：仅会话跳词播（用户手指滑动是真实位移，不重复播）
  } else {
    deskStage.innerHTML = stageHTML(i);
    const st = deskStage.querySelector('.stage');
    if (st) { st.classList.remove('enter-word'); void st.offsetWidth; st.classList.add('enter-word'); setTimeout(() => st.classList.remove('enter-word'), 500); }
  }
  P.root = currentRoot();
  fillLyrics(i, P.root);
  if (isMobile() && !activeSession()) { [i - 1, i + 1].forEach(j => { const s = carousel.children[j]?.querySelector('.stage'); if (s) fillLyrics(j, s); }); }
  markCards();
  loadLyrics(i).then(L => { if (state.cur === i) document.querySelector('#time').textContent = `0:00 / ${fmt(L.end - L.start)}`; }).catch(() => {});
  cue(i);
  if (autoplay) play(i);
}

export function activeSession() {
  if (window.__stwLearnPlaylist?.()) return 'learn';
  if (window.__stwReviewPlaylist?.()) return 'review';
  return null;
}

window.__stwLoopOn = () => state.loop;

export function sessionStep(dir) {
  const s = activeSession();
  if (s === 'learn') window.__stwLearnStep?.(dir);
  else if (s === 'review') window.__stwReviewStep?.(dir);
  else if (dir > 0) goNext();
  else goPrev();
}

export function buildCarousel() {
  if (carousel.childElementCount === DATA.length) return;
  carousel.innerHTML = DATA.map((_, i) => `<div class="slide" data-i="${i}"></div>`).join('');
}

carousel.addEventListener('scroll', () => {
  if (suppressScroll) return;
  clearTimeout(scrollT);
  scrollT = setTimeout(settle, 'onscrollend' in window ? 400 : 140);
}, { passive: true });
carousel.addEventListener('scrollend', () => { if (!suppressScroll) { clearTimeout(scrollT); settle(); } });

function settle() {
  const i = Math.round(carousel.scrollLeft / carousel.clientWidth);
  if (i === state.cur || i < 0 || i >= DATA.length) return;
  if (activeSession()) { sessionStep(i > state.cur ? 1 : -1); return; }
  go(i, state.started);
}

let clipSeq = 0;
export async function switchClip(i, dir = 1) {
  const en = DATA[i]; if (!en || en.nclips < 2 || i !== state.cur) return;   // 非当前词的 dot 不可达（手势/键盘/可见 dot 都限当前），防御脱位
  deferAdvance();
  try { await ensureDetail(en); } catch { return; }
  primeAudio(i);
  state.started = true;
  useClip(en, (en.ci + dir + en.clips.length) % en.clips.length); lyr.delete(i);
  store.set('stw.pos', { word: en.word, ci: en.ci });
  stop();
  // 换歌只换歌词（2026-10-04 用户定调）：卡底与词面静止不重渲，clip-dots 只翻状态，歌词渐出→重填→渐入
  const root = isMobile() ? carousel.children[i]?.querySelector('.stage') : deskStage?.querySelector('.stage');
  (isMobile() ? carousel.children[i] : deskStage)?.querySelectorAll('.clip-dot')
    .forEach(d => d.classList.toggle('on', +d.dataset.clipto.split(':')[1] === en.ci));
  setArt(i); renderGrid(); cue(i);
  P.root = currentRoot();
  const box = root?.querySelector('.lyrics');
  if (!box) { fillLyrics(i, root); play(i); return; }
  const seq = ++clipSeq;
  box.classList.remove('lyr-in');
  box.classList.add('lyr-swap');
  box.style.transition = ''; box.style.transform = ''; box.style.opacity = '';
  await new Promise(r => setTimeout(r, 200));
  if (seq !== clipSeq) return;
  const bin = box.querySelector('.lyrics-in');
  delete bin?.dataset.ok;
  if (bin) bin.innerHTML = '<p class="lyr-msg">正在加载歌词…</p>';
  await fillLyrics(i, root);
  if (seq !== clipSeq) return;
  box.classList.remove('lyr-swap');
  box.classList.add('lyr-in');
  setTimeout(() => { if (seq === clipSeq) box.classList.remove('lyr-in'); }, 380);
  play(i);
}

export function applyDict(d, keepWord, allowEmpty) {
  if (!allowEmpty && !ALL.some(e => inDict(e, d))) d = 'all';
  state.dict = d; store.set('stw.dict', d);
  document.querySelector('#dictChips').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.d === d));
  const listName = document.querySelector('#listName');
  if (listName) listName.textContent = d === 'all' ? '全部' : d === 'fav' ? '收藏' : DICT_NAME[d];
  stop(); lyr.clear(); clearFilled(); carousel.innerHTML = ''; hist.length = 0;
  setData(d === 'all' ? ALL : ALL.filter(e => inDict(e, d)));
  state.cur = Math.max(0, DATA.findIndex(e => e.word === keepWord));
  document.querySelector('#totalCount').textContent = ALL.length;
  renderGrid();
  if (DATA.length) { applyMode(); return; }
  state.cur = 0; P.i = -1; P.L = null; deskStage.innerHTML = '';
}

function applyMode() {
  stop();
  if (isMobile()) { buildCarousel(); requestAnimationFrame(() => go(state.cur, false)); }
  else { go(state.cur, false); }
  syncCarouselClose();
}

export function restoreHash() {
  const w = DATA[state.cur]?.word; if (!w) return;
  if (document.querySelector('.home.open')) return;
  try { history.replaceState(null, '', '#' + encodeURIComponent(w)); } catch {}
}

export function trialBlocked(w) {
  if (!trial || !w || ALL.some(e => e.word === w)) return false;
  if (localStorage.getItem('stw.onboard')) window.__stwLoginPrompt?.('deeplink');
  return true;
}

export async function rebuildBank(list) {
  const rows = list ?? await getBankList();
  if (!rows?.length) return;
  if (!list) saveBankCache(rows);
  setAll(rows.map(fromMeta));
  applyDict(state.dict, DATA[state.cur]?.word || null);
  const hw = decodeURIComponent(location.hash.slice(1));
  const has = hw && ALL.some(e => e.word === hw && inDict(e, state.dict));
  if (!activeSession() && hw && ALL.some(e => e.word === hw) && DATA[state.cur]?.word !== hw) applyDict(has ? state.dict : 'all', hw);
  window.dispatchEvent(new CustomEvent('stw:bank-ready'));
}

async function enterBank() {
  if (!ALL) { grid.innerHTML = '<p class="empty">词库加载失败，请检查网络后刷新。</p>'; return; }
  const dw = decodeURIComponent(initialHash.slice(1));
  if (trialBlocked(dw)) { applyDict('all', ALL[0]?.word); restoreHash(); return; }
  const pos = store.get('stw.pos', null), w = decodeURIComponent(initialHash.slice(1)) || pos?.word || '';
  const back = pos && ALL.find(e => e.word === pos.word && e.word === w);
  if (back && pos.ci > 0 && pos.ci < back.nclips) {
    back.ci = pos.ci;
    if (back.clips) useClip(back, pos.ci);
    else { try { await ensureDetail(back); } catch {} }
  }
  const has = ALL.some(e => e.word === w && inDict(e, state.dict));
  applyDict(w && ALL.some(e => e.word === w) && !has ? 'all' : state.dict, w || null);
}

async function trialBank() {
  try {
    const r = await fetch('trial.json'); if (!r.ok) throw new Error('HTTP ' + r.status);
    const tl = await r.json();
    for (const e of tl) for (const c of e.clips) { c.preview = expand(c.preview); c.art = expand(c.art); c.appleUrl = expand(c.appleUrl); }
    tl.forEach(e => { useClip(e, 0); stubify(e); });
    trialMeta.count = tl.length;
    setAll(tl);
  } catch { setAll(null); }
  await enterBank();
  window.dispatchEvent(new CustomEvent('stw:bank-ready'));
}

export async function bootBank() {
  const sess = store.get('stw.auth.session', null);
  if (sess) {
    const cached = readBankCache();
    if (cached) {
      setAll(cached.rows.map(fromMeta));
      await enterBank();
      revalidateBank(cached).then(rows => { if (rows && !state.started && !activeSession()) rebuildBank(rows); }).catch(() => {});
      return;
    }
    (async () => {
      const list = await getBankList();
      if (list?.length) {
        saveBankCache(list);
        setAll(list.map(fromMeta));
        await enterBank();
        window.dispatchEvent(new CustomEvent('stw:bank-ready'));
      } else await trialBank();
    })().catch(() => {});
    return;
  }
  await trialBank();
}
