import { ALL, DATA, state, trial, inDict, idxOf } from './bank.js?v=staging-7ecf1b3';
import { store, isMobile } from './util.js?v=staging-7ecf1b3';
import { track } from './track.js?v=staging-7ecf1b3';
import { loadLyrics } from './lyrics.js?v=staging-7ecf1b3';
import { grid, carousel, renderGrid, markCards } from './stage.js?v=staging-7ecf1b3';
import { P, primeAudio, play, toggle, deferAdvance } from './player.js?v=staging-7ecf1b3';
import { go, goNext, sessionStep, switchClip, applyDict, activeSession, setSessionNav } from './nav.js?v=staging-7ecf1b3';
import { openShare } from './share.js?v=staging-7ecf1b3';

function $(s) { return document.querySelector(s); }

// 词面入场（2026-10-04 用户定调）：弹层收掉露出词面的时刻统一播 enter-word 上滑渐入，
// 让用户明确「已是下一个单词」；与 nav.js go() 的换词入场同一动画语言
function wordEnter() {
  const st = isMobile()
    ? [...document.querySelectorAll('.slide .stage')].find(s => { const r = s.getBoundingClientRect(); return r.x > -20 && r.x < innerWidth + 20; })
    : $('#deskStage .stage');
  if (!st) return;
  st.classList.remove('enter-word'); void st.offsetWidth; st.classList.add('enter-word'); setTimeout(() => st.classList.remove('enter-word'), 500);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]'); if (!b) return;
  try { const u = new SpeechSynthesisUtterance(b.dataset.say); u.lang = 'en-GB'; u.rate = .85; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
});

let fromList = false;
function labelClose() {
  const b = $('#carouselClose');
  const t = fromList ? '返回词表' : '返回首页';
  b?.setAttribute('aria-label', t);
  b?.setAttribute('title', t);
}

grid.addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  const i = +c.dataset.i;
  if (sessionBlocked(i)) { showPickHint(); return; }
  state.started = true; primeAudio(i);
  fromList = true; labelClose();
  $('#browser').classList.remove('open');
  go(i, true);
});

function sessionBlocked(i) {
  if (i === state.cur) return false;
  const s = activeSession(); if (!s) return false;
  const w = DATA[i]?.word; if (!w) return false;
  const cur = s === 'learn' ? window.__stwLearnWord?.() : window.__stwReviewWord?.();
  const list = s === 'learn' ? window.__stwLearnPlaylist?.() : window.__stwReviewPlaylist?.();
  return w !== cur && !(Array.isArray(list) && list.includes(w));
}

let pickHintT = 0;
function showPickHint() {
  const panel = $('#browser'); if (!panel) return;
  let h = panel.querySelector('.pick-hint');
  if (!h) { h = document.createElement('p'); h.className = 'pick-hint'; h.setAttribute('role', 'status'); panel.insertBefore(h, grid); }
  h.textContent = '这个词不在本次队列里，先退出学习再点选';
  clearTimeout(pickHintT); pickHintT = setTimeout(() => h.remove(), 3200);
}

let searchTimer, renderTimer;
$('#q').addEventListener('input', () => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderGrid, 120);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { const q = $('#q').value.trim().toLowerCase(); if (q.length > 1) track('search', { q }); }, 1500);
});

$('#dictChips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyDict(b.dataset.d, DATA[state.cur]?.word, true); });

document.addEventListener('click', e => {
  const d = e.target.closest('[data-clipto]'); if (!d) return;
  const [w, k] = d.dataset.clipto.split(':'); const i = idxOf(w), en = DATA[i]; if (!en || +k === en.ci) return;
  switchClip(i, +k - en.ci);
});

document.addEventListener('click', e => {
  const ln = e.target.closest('.stage .ln'); if (!ln) return;
  const stage = ln.closest('.stage'), i = +stage.dataset.i, k = [...stage.querySelectorAll('.ln')].indexOf(ln);
  if (k < 0) return;
  state.started = true; primeAudio(i);
  if (i !== state.cur) go(i, false);
  playLine(i, k);
});

function playLine(i, k) {
  const startOf = L => Math.max(L.start, Math.min(L.lines[k].t, L.lines[k].st) - 0.3);
  if (P.i === i && P.L && P.playing) {
    clearTimeout(P.timer);
    seekInClip(startOf(P.L) - DATA[i].offset);
    return;
  }
  loadLyrics(i).then(L => play(i, startOf(L))).catch(() => {});
}

function seekInClip(t) { window.__stwSeekClip?.(t); }

$('#play').addEventListener('click', () => { primeAudio(state.cur); state.started = true; toggle(); });
$('#prev').addEventListener('click', () => { primeAudio(state.cur); state.started = true; sessionStep(-1); });
$('#next').addEventListener('click', () => { primeAudio(state.cur); state.started = true; sessionStep(1); });
$('#replay').addEventListener('click', () => { primeAudio(state.cur); state.started = true; play(state.cur); });

const tog = (id, key) => { const b = $(id); b.setAttribute('aria-pressed', !!state[key]); b.addEventListener('click', () => { state[key] = !state[key]; b.setAttribute('aria-pressed', state[key]); if (key === 'shuffle') store.set('stw.shuffle', state.shuffle); }); };
tog('#shuffle', 'shuffle'); tog('#loop', 'loop');

function openList() {
  const panel = $('#browser'); panel.classList.add('open');
  const c = grid.querySelector('.card.on');
  if (c) panel.scrollTop = c.offsetTop - panel.clientHeight / 2 + c.offsetHeight / 2;
}
window.__stwOpenList = dict => { if (dict && dict !== state.dict) applyDict(dict, DATA[state.cur]?.word, false); openList(); };

$('#closeList').addEventListener('click', () => {
  fromList = false; labelClose();
  window.dispatchEvent(new CustomEvent('stw:stop'));
  $('#browser').classList.remove('open');
  window.dispatchEvent(new CustomEvent('stw:list-close'));
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  if (['ArrowRight', 'ArrowLeft', ' '].includes(e.key)) primeAudio(state.cur);
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { if (DATA[state.cur]?.nclips > 1) { e.preventDefault(); switchClip(state.cur, e.key === 'ArrowDown' ? 1 : -1); } return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); state.started = true; sessionStep(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); state.started = true; sessionStep(-1); }
  else if (e.key === ' ') { e.preventDefault(); state.started = true; toggle(); }
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-share]'); if (!b) return;
  if (document.body.classList.contains('stw-review')) return;
  openShare(b.dataset.share);
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  if (trial) { window.__stwLoginPrompt?.('fav'); return; }
  deferAdvance();
  const w = b.dataset.fav, on = !state.fav.has(w);
  on ? state.fav.add(w) : state.fav.delete(w); store.set('stw.fav', [...state.fav]);
  window.__stwSync?.('stw.fav');
  document.querySelectorAll('[data-fav]').forEach(x => { if (x.dataset.fav === w) { x.setAttribute('aria-pressed', on); x.textContent = on ? '★' : '☆'; } });
  markCards(true);
  if (on) track('fav', { word: w, n: state.fav.size });
});

const mqTouch = matchMedia('(pointer: coarse)');
carousel.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) { drag = null; return; }
  const t = e.touches[0], sl = e.target.closest('.slide');
  drag = sl ? { x: t.clientX, y: t.clientY, at: Date.now(), sl, axis: null, dy: 0, info: sl.querySelector('.st-body'), inInfo: !!e.target.closest?.('.st-body') } : null;
}, { passive: true });
let drag = null;
carousel.addEventListener('touchmove', e => {
  if (!drag) return;
  const t = e.touches[0], dx = t.clientX - drag.x, dy = t.clientY - drag.y;
  if (!drag.axis) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    const i = +drag.sl.dataset.i, sl = drag.sl, stage = sl.querySelector('.stage');
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.2;
    const atEdge = (el, dir) => (dir < 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) || (dir > 0 && el.scrollTop <= 2);
    const scrollable = sl.scrollHeight > sl.clientHeight + 2 && !atEdge(sl, dy);
    const info = drag.info, infoCan = drag.inInfo && info && info.scrollHeight > info.clientHeight + 2 && !atEdge(info, dy);
    drag.axis = vertical && i === state.cur && DATA[i]?.nclips > 1 && stage && !scrollable && !infoCan ? 'y' : 'x';
    if (drag.axis === 'y') { drag.box = stage.querySelector('.lyrics'); drag.box.style.transition = 'none'; }
  }
  if (drag.axis !== 'y') return;
  e.preventDefault();
  drag.dy = dy;
  const f = dy * .55;
  drag.box.style.transform = `translateY(${f}px)`;
  drag.box.style.opacity = String(Math.max(.35, 1 - Math.abs(f) / 420));
}, { passive: false });
carousel.addEventListener('touchend', () => {
  if (!drag || drag.axis !== 'y') { drag = null; return; }
  const { box, dy, at } = drag, i = +drag.sl.dataset.i; drag = null;
  const fast = Math.abs(dy) / Math.max(1, Date.now() - at) > .45;
  const ease = 'transform .22s cubic-bezier(.3,.7,.3,1), opacity .22s';
  if (Math.abs(dy) > 70 || (fast && Math.abs(dy) > 24)) {
    box.style.transition = ease;
    box.style.transform = `translateY(${dy < 0 ? '-40%' : '40%'})`; box.style.opacity = '0';
    setTimeout(() => switchClip(i, dy < 0 ? 1 : -1), 170);
  } else {
    box.style.transition = 'transform .3s cubic-bezier(.2,1.4,.4,1), opacity .25s';
    box.style.transform = ''; box.style.opacity = '';
  }
});
carousel.addEventListener('touchcancel', () => { if (drag?.box) { drag.box.style.transition = 'transform .25s, opacity .25s'; drag.box.style.transform = ''; drag.box.style.opacity = ''; } drag = null; });

export function syncCarouselClose() {
  const btn = $('#carouselClose'), row = $('#learnRow');
  if (!btn) return;
  labelClose();
  const listOpen = $('#browser')?.classList.contains('open');
  const modalUp = !!document.querySelector('.auth:not([hidden]), .sheet:not([hidden]), #flashModal:not([hidden])');
  const inSession = !!row && !row.hidden;
  btn.hidden = !isMobile() || inSession || !!listOpen || modalUp;
}

window.addEventListener('stw:home-open', () => { fromList = false; labelClose(); });

{
  const btn = $('#carouselClose');
  if (btn) {
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('stw:stop'));
      if (!fromList) { window.dispatchEvent(new CustomEvent('stw:home-open')); return; }
      fromList = false; labelClose();
      track('dict-view', { from: 'card' });
      openList();
    });
    const row = $('#learnRow');
    if (row) new MutationObserver(syncCarouselClose).observe(row, { attributes: true, attributeFilter: ['hidden'] });
    const panel = $('#browser');
    if (panel) new MutationObserver(syncCarouselClose).observe(panel, { attributes: true, attributeFilter: ['class'] });
    document.querySelectorAll('.auth, .sheet, #flashModal').forEach(m => new MutationObserver(syncCarouselClose).observe(m, { attributes: true, attributeFilter: ['hidden'] }));
    syncCarouselClose();
  }
}

function dialogsUp() { return [...document.querySelectorAll('.auth:not(.menu), .sheet, #flashModal')].filter(m => !m.hidden); }
function whenQuiet(apply) {
  const up = dialogsUp();
  if (!up.length) { apply(); return; }
  const left = new Set(up);
  up.forEach(m => {
    const o = new MutationObserver(() => {
      o.disconnect();
      left.delete(m);
      if (!left.size) whenQuiet(apply);
    });
    o.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  });
}

let quizPending = 0;
let pressEl = null;
document.addEventListener('pointerdown', e => { pressEl = e.target; }, true);
const strayClick = (b, e) => e.detail > 0 && pressEl !== b && !b.contains(pressEl);
window.addEventListener('stw:quiz-show', e => {
  const opts = e.detail?.options;
  if (!Array.isArray(opts) || opts.length < 4) return;
  const d = e.detail, my = ++quizPending;
  whenQuiet(() => {
    if (my !== quizPending) return;
    $('#quizWord').textContent = d.word;
    $('#reviewOps').hidden = true;
    $('#quizNext').hidden = true;
    const box = $('#quizOpts');
    box.innerHTML = '';
    box.classList.remove('opts-done');
    opts.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-opt';
      const main = document.createElement('span');
      main.className = 'opt-main';
      main.textContent = m;
      const note = document.createElement('span');
      note.className = 'opt-note';
      b.appendChild(main);
      b.appendChild(note);
      b.addEventListener('click', e => {
        if (strayClick(b, e)) return;
        box.querySelectorAll('.quiz-opt').forEach(x => x.disabled = true);
        $('#quizModal').focus();
        window.dispatchEvent(new CustomEvent('stw:quiz-answer', { detail: { index: i } }));
      });
      box.appendChild(b);
    });
    $('#quizModal').hidden = false;
  });
});

window.addEventListener('stw:quiz-result', e => {
  const { chosenIndex, correctIndex, optWords } = e.detail || {};
  const box = $('#quizOpts');
  const opts = [...box.children];
  opts[correctIndex]?.classList.add('is-right');
  if (Number(chosenIndex) !== Number(correctIndex)) opts[chosenIndex]?.classList.add('is-wrong');
  if (Array.isArray(optWords)) opts.forEach((b, i) => { const n = b.querySelector('.opt-note'); if (n && optWords[i]) n.textContent = optWords[i]; });
  box.classList.add('opts-done');
  $('#quizNext').hidden = false;
});

window.addEventListener('stw:quiz-close', () => { quizPending++; $('#quizModal').hidden = true; $('#revealModal').hidden = true; $('#reviewOps').hidden = false; $('#quizNext').hidden = true; $('#quizOpts').classList.remove('opts-done'); wordEnter(); });

window.addEventListener('stw:flash-show', e => {
  const opts = e.detail?.options;
  if (!Array.isArray(opts) || opts.length < 4) return;
  const from = $('#flashFrom');
  from.hidden = true;
  from.textContent = '';
  const lyric = $('#flashLyric');
  lyric.hidden = true;
  lyric.innerHTML = '';
  $('#flashReplay').disabled = false;
  const tag = $('#flashTag');
  tag.textContent = e.detail?.type === 'wrong' ? '错题胶囊' : '闪回胶囊';
  tag.hidden = false;
  const ask = $('#flashAsk');
  if (ask) ask.textContent = e.detail?.type === 'wrong' ? '还记得这个答错的词吗？' : '刚听的这个词是？';
  const box = $('#flashOpts');
  box.innerHTML = '';
  box.classList.remove('opts-done');
  opts.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-opt';
    const main = document.createElement('span');
    main.className = 'opt-main';
    main.textContent = m;
    const note = document.createElement('span');
    note.className = 'opt-note';
    b.appendChild(main);
    b.appendChild(note);
    b.addEventListener('click', e => {
      if (strayClick(b, e)) return;
      box.querySelectorAll('.quiz-opt').forEach(x => x.disabled = true);
      $('#flashModal').focus();
      window.dispatchEvent(new CustomEvent('stw:flash-answer', { detail: { index: i } }));
    });
    box.appendChild(b);
  });
  $('#flashModal').hidden = false;
});

window.addEventListener('stw:flash-result', e => {
  const { chosenIndex, correctIndex, fromTitle, lyric, optMeanings } = e.detail || {};
  const box = $('#flashOpts');
  const opts = [...box.children];
  opts[correctIndex]?.classList.add('is-right');
  if (Number(chosenIndex) !== Number(correctIndex)) opts[chosenIndex]?.classList.add('is-wrong');
  if (Array.isArray(optMeanings)) opts.forEach((b, i) => { const n = b.querySelector('.opt-note'); if (n && optMeanings[i]) n.textContent = optMeanings[i]; });
  box.classList.add('opts-done');
  if (fromTitle) { const f = $('#flashFrom'); f.textContent = `来自另一首：${fromTitle}`; f.hidden = false; }
  if (lyric) { const l = $('#flashLyric'); l.innerHTML = lyric; l.hidden = false; }
  $('#flashReplay').disabled = true;
});

window.addEventListener('stw:flash-close', () => { $('#flashModal').hidden = true; $('#flashReplay').disabled = true; $('#flashTag').hidden = true; $('#flashOpts').classList.remove('opts-done'); wordEnter(); });
$('#flashReplay').addEventListener('click', () => window.dispatchEvent(new CustomEvent('stw:flash-replay')));

const learnMode = () => document.body.classList.contains('stw-learn');
$('#rvKnow').addEventListener('click', () => window.dispatchEvent(new CustomEvent(learnMode() ? 'stw:learn-ask' : 'stw:review-early')));
$('#rvNext').addEventListener('click', () => window.dispatchEvent(new CustomEvent(learnMode() ? 'stw:learn-next' : 'stw:review-skip')));
$('#quizNext').addEventListener('click', () => window.dispatchEvent(new CustomEvent('stw:quiz-advance')));

window.addEventListener('stw:free-advance', () => goNext());

window.addEventListener('stw:review-reveal', e => {
  $('#reviewOps').hidden = true;
  $('#revealWord').textContent = e.detail?.word || '';
  $('#revealMeaning').textContent = e.detail?.meaning || '';
  $('#revealModal').hidden = false;
});

window.addEventListener('stw:review-summary', e => {
  const d = e.detail || {};
  const segs = [['答错', d.wrong], ['重学', d.relearn], ['跳过', d.skipped]]
    .filter(([, n]) => (Number(n) || 0) > 0).map(([k, n]) => ` · ${k} ${n}`).join('');
  $('#reviewSummaryStats').textContent = `共 ${d.total ?? 0} 词 · 答对 ${d.right ?? 0}${segs}`;
  const left = Number(d.remaining) || 0;
  const lastRound = Number(d.round) >= Number(d.maxRound);
  const solo = !left || lastRound;
  $('#reviewExtraBtn').hidden = solo;
  $('#reviewExtraBtn').textContent = left ? `继续复习 · 还剩 ${left} 词` : '继续复习';
  $('#reviewSummaryNone').hidden = !solo;
  if (!left) $('#reviewSummaryNone').textContent = '今天全部复习完了';
  else if (lastRound) $('#reviewSummaryNone').textContent = '今天先到这里，明天再来一遍';
  $('#reviewExitBtn').className = solo ? 'auth-btn' : 'auth-alt';
  $('#reviewSummaryModal').hidden = false;
});

$('#reviewExtraBtn').addEventListener('click', () => { $('#reviewSummaryModal').hidden = true; window.dispatchEvent(new CustomEvent('stw:review-extra')); });
$('#reviewExitBtn').addEventListener('click', () => { $('#reviewSummaryModal').hidden = true; window.dispatchEvent(new CustomEvent('stw:review-exit')); });

window.__stwLearnWords = d => ALL.filter(e => inDict(e, d)).map(e => e.word);

window.__stwLearnGo = w => { let k = DATA.findIndex(e => e.word === w); if (k < 0) { applyDict(ALL.some(e => e.word === w && e.tags.includes('ielts')) ? 'ielts' : 'all', w); k = DATA.findIndex(e => e.word === w); } if (k >= 0) { setSessionNav(true); try { go(k, true); } finally { setSessionNav(false); } } };

{
  const planChips = [...$('#planChips').querySelectorAll('.plan-chip')];
  const planGoals = [...$('#planGoals').querySelectorAll('.goal-opt')];
  const pick = list => b => list.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  planChips.forEach(b => b.addEventListener('click', () => pick(planChips)(b)));
  planGoals.forEach(b => b.addEventListener('click', () => pick(planGoals)(b)));
  const readPlan = () => ({
    dict: planChips.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.dict ?? 'all',
    goal: +(planGoals.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.goal ?? 10),
  });
  const stepPlan = $('#planStepPlan'), stepProfile = $('#planStepProfile');
  const showStep = n => { if (stepPlan && stepProfile) { stepPlan.hidden = n !== 1; stepProfile.hidden = n !== 2; } };
  const submit = autostart => {
    const p = readPlan();
    track('plan-save', { ...p, autostart });
    window.dispatchEvent(new CustomEvent('stw:plan-save', { detail: { ...p, autostart } }));
    showStep(1);
    $('#planSetupModal').hidden = true;
  };
  $('#planSaveOnly').addEventListener('click', () => submit(false));
  $('#planStart').addEventListener('click', () => {
    if (stepProfile && typeof window.__stwPlanProfileEnter === 'function' && window.__stwPlanProfileNeeded?.()) { showStep(2); window.__stwPlanProfileEnter(); return; }
    submit(true);
  });
  $('#planGo').addEventListener('click', () => { window.__stwPlanProfileCommit?.($('#planName')?.value); submit(true); });
  $('#planSkip').addEventListener('click', () => submit(true));
  const planModal = $('#planSetupModal');
  const closePlan = () => { showStep(1); planModal.hidden = true; };
  $('#planSetupClose').addEventListener('click', closePlan);
  planModal.addEventListener('click', e => { if (e.target === planModal) closePlan(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !planModal.hidden) closePlan(); });
  window.addEventListener('stw:need-plan', () => {
    const p = typeof window.__stwPlan === 'function' ? window.__stwPlan() : null;
    if (!p) {
      const defChip = planChips.find(b => b.dataset.dict === 'all');
      if (defChip) planChips.forEach(b => b.setAttribute('aria-pressed', String(b === defChip)));
      const defGoal = planGoals.find(b => b.dataset.goal === '10');
      if (defGoal) planGoals.forEach(b => b.setAttribute('aria-pressed', String(b === defGoal)));
      return;
    }
    const chip = planChips.find(b => b.dataset.dict === p.dict);
    if (chip) planChips.forEach(b => b.setAttribute('aria-pressed', String(b === chip)));
    const goal = planGoals.find(b => b.dataset.goal === String(p.daily_goal));
    if (goal) planGoals.forEach(b => b.setAttribute('aria-pressed', String(b === goal)));
  });
  window.addEventListener('stw:need-plan', () => whenQuiet(() => { showStep(1); $('#planSetupModal').hidden = false; }));
}

$('#checkinExtra').addEventListener('click', () => { $('#checkinModal').hidden = true; window.dispatchEvent(new CustomEvent('stw:checkin-extra')); });
$('#checkinExit').addEventListener('click', () => { $('#checkinModal').hidden = true; window.dispatchEvent(new CustomEvent('stw:checkin-exit')); });

window.addEventListener('stw:checkin-done', e => {
  $('#checkinStats').textContent = !e.detail ? '' : `今日 ${e.detail.today}/${e.detail.goal} 词 · 已打卡`;
  $('#checkinExtra').textContent = `再学 ${Number(e.detail?.goal) || 10} 词`;
  window.dispatchEvent(new CustomEvent('stw:stop'));
  $('#checkinModal').hidden = false;
});
