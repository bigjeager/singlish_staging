import { getPlan, getCheckins, getUserWords, getHomeProgress } from './plan-api.js?v=staging-9dd816f';
import { trial, bankReady } from './bank.js?v=staging-9dd816f';
import { track } from './track.js?v=staging-9dd816f';
import { renderViz } from './home-viz.js?v=staging-9dd816f';

const KEY = 'stw.auth.session';
const DICT_NAME = { ielts: '雅思', cet4: '四级', cet6: '六级', toefl: '托福' };
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const el = id => (typeof document === 'undefined' ? null : document.getElementById(id));
const logged = () => { const s = read(); return !!(s?.access_token && s?.user_id); };

function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 连续打卡天数（从 yesterday 起回溯，当天未打不断链）——与热力卡的「累计打卡」是两个口径
// （2026-10-04 用户定调恢复 streak 行：连续 ≠ 累计）
function streak(rows, todayStr) {
  const days = new Set();
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.day != null) days.add(String(r.day));

  const shift = (ymd, k) => {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    const t = new Date(y || 1970, (m || 1) - 1, d || 1);
    t.setDate(t.getDate() + k);
    const p = n => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  };
  let cur = String(todayStr || '');
  if (!days.has(cur)) cur = shift(cur, -1);
  let n = 0;
  while (days.has(cur)) { n++; cur = shift(cur, -1); }
  return n;
}

const isoLocalDay = iso => {
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function countTodayLearned(rows, t) {
  let n = 0;
  for (const r of Array.isArray(rows) ? rows : []) if (r?.learned_at && isoLocalDay(r.learned_at) === t) n++;
  return n;
}

export function pendingWords(userRows, todayStr) {
  if (!Array.isArray(userRows)) return null;
  const out = [];
  for (const r of userRows) {
    if (!r || !r.word || !r.learned_at) continue;
    if (r.next_due != null && r.next_due > todayStr) continue;
    out.push(r.word);
  }
  return out;
}

let open_ = false;
let plan = null;
let renderToken = 0;
let lastAuth = null;
let lastRows = null;
let lastUserRows = null;
let lastProg = null;
let lastPending = -1;
let nudgeT = 0;

export function open() { setOpen(true); }
export function close() { setOpen(false); }
function setOpen(on) {
  open_ = on;
  const v = el('homeView');
  if (v) v.classList.toggle('open', on);

  if (typeof document !== 'undefined') {
    const btn = el('authBtn');
    if (on) {
      const slot = el('homeAuth');
      if (btn && slot) slot.replaceChildren(btn);
    } else {
      const top = document.querySelector('.top');
      if (btn && top) top.appendChild(btn);
    }
  }

  if (on && typeof location !== 'undefined') { try { history.replaceState(null, '', location.pathname + location.search); } catch {} }

  if (on) render();
}

async function render() {
  if (typeof document === 'undefined') return;
  const tk = ++renderToken;
  renderGreet();
  const on = logged(), uid = read()?.user_id;
  lastAuth = on;
  let p = null, rows = null, userRows = null, prog = null;
  if (on) [p, rows, userRows, prog] = await Promise.all([getPlan(uid), getCheckins(uid), getUserWords(uid), getHomeProgress(uid)]);
  if (tk !== renderToken) return;
  plan = on ? (p || plan) : null;
  lastRows = rows;
  lastUserRows = userRows;
  lastProg = prog;
  renderStreak(rows, on);
  renderLearnCard(userRows, rows);
  renderReviewCard();
  renderPlanRow(on);
  renderHomeCandy();
  renderViz(userRows, rows, plan, on, prog);
}

function renderGreet() {
  const g = el('homeGreet');
  if (!g) return;
  const h = new Date().getHours();
  g.textContent = h < 5 ? '晚上好' : h < 11 ? '早上好' : h < 18 ? '下午好' : '晚上好';
}

// streak 行（2026-10-04 用户定调恢复）：问候语下的「已连续打卡 N 天」——与热力卡「累计打卡」两口径并存
function renderStreak(rows, on) {
  const s = el('homeStreak');
  if (!s) return;
  if (rows === null) { s.textContent = on ? '--' : '今天还没开始'; return; }
  const hit = rows.some(r => r && r.day === today());
  s.textContent = hit ? `已连续打卡 ${streak(rows, today())} 天` : '今天还没开始';
}

function renderLearnCard(userRows, checkinRows) {
  const status = el('homeLearnStatus'), btn = el('homeLearnBtn');
  if (!status && !btn) return;
  if (trial) {
    let returned = false;
    try { returned = localStorage.getItem('stw.returned') === '1'; } catch {}
    if (status) status.textContent = returned ? '你的学习进度已云存档 · 登录即恢复' : '先逛逛这 20 词';
    if (btn) { btn.hidden = false; btn.textContent = '逛这 20 词'; }
    return;
  }
  const p = plan;
  if (!(p?.dict && p?.daily_goal)) {
    if (status) status.textContent = '设置学习计划后开始';
    if (btn) btn.hidden = true;
    return;
  }
  if (btn) btn.hidden = false;
  if (userRows === null) {
    if (status) status.textContent = '--';
    if (btn) btn.textContent = '继续学习';
    return;
  }
  const goal = p.daily_goal;
  const done = countTodayLearned(userRows, today());
  const checked = Array.isArray(checkinRows) && checkinRows.some(r => r && r.day === today());

  const shown = Math.min(done, goal);
  const over = Math.max(0, done - goal);
  const overEl = el('homeLearnOver');
  // 数字升格（2026-10-04）：三件套 replaceChildren——「今日」前缀 + 大数字 + 「词 · 已打卡」后缀
  if (status) {
    const k = document.createElement('span');
    k.textContent = '今日';
    const num = document.createElement('b');
    num.textContent = `${shown}/${goal}`;
    status.replaceChildren(k, num, checked ? '词 · 已打卡' : '词');
  }
  if (overEl) { overEl.textContent = over > 0 ? `已超额 ${over} 词` : ''; overEl.hidden = over <= 0; }

  if (btn) btn.textContent = done === 0 ? '开始学习' : done < goal ? '继续学习' : `再学 ${goal} 词`;
}

function reviewEmptyCopy() {
  if (!logged()) {
    let returned = false;
    try { returned = localStorage.getItem('stw.returned') === '1'; } catch {}
    return returned ? '登录后你的复习计划会接着来' : '登录后解锁复习——学习记录会保存';
  }
  const todayNew = Array.isArray(lastUserRows) ? countTodayLearned(lastUserRows, today()) : 0;
  const learned = Array.isArray(lastUserRows) && lastUserRows.some(r => r?.learned_at);
  return todayNew > 0 ? `今日新增 ${todayNew} · 明日起陆续复习`
    : learned ? '明日有词来复习'
    : '还没学过词——先去学第一批吧';
}

function renderReviewCard() {
  const n = el('homeReviewNum'), btn = el('homeReviewBtn'), newEl = el('homeReviewNew');
  const pending = logged() ? pendingWords(lastUserRows, today()) : [];
  const cnt = pending === null ? 0 : pending.length;
  lastPending = cnt;
  if (n) n.textContent = String(cnt);
  if (btn) btn.hidden = cnt === 0;

  if (newEl) {
    if (cnt > 0) { newEl.hidden = true; newEl.textContent = ''; return; }
    newEl.textContent = reviewEmptyCopy();
    newEl.hidden = false;
  }
}

function renderPlanRow(on) {
  const row = el('homePlanRow'), text = el('homePlanText'), edit = el('homePlanEdit'), set = el('homePlanSet');
  const has = !!(plan?.dict && plan?.daily_goal);
  const empty = !on || !has;
  if (text) {
    text.hidden = empty;
    text.textContent = has ? `${DICT_NAME[plan.dict] || '全部'} · 每日 ${plan.daily_goal} 词` : '';
  }
  if (edit) edit.hidden = !on || !has;
  if (set) set.hidden = !empty;
  if (row) row.classList.toggle('is-empty', empty);
}

/* 糖位统一分配（2026-10-04 用户定调：每页需有一颗主色钮做引导）：待办优先（2026-09-29 定调不变）
   ——复习在办 [开始复习] 当糖；复习空时糖回落学习卡主 CTA（开始学习/继续学习/再学 N 词/逛这 20 词）；
   两者都不在场（无计划态学习钮隐藏）才轮到整行 [设置学习计划]。任何时刻首页至多一颗 */
function renderHomeCandy() {
  const learn = el('homeLearnBtn'), review = el('homeReviewBtn'), row = el('homePlanRow');
  const reviewUp = !!review && !review.hidden;
  const learnUp = !!learn && !learn.hidden && !reviewUp;
  if (review) review.classList.toggle('is-grad', reviewUp);
  if (learn) learn.classList.toggle('is-grad', learnUp);
  if (row) row.classList.toggle('candy', row.classList.contains('is-empty') && !reviewUp && !learnUp);
}

const INTENT = 'stw.intent';
function markIntent() { try { sessionStorage.setItem(INTENT, 'plan-setup'); } catch {} }
function takeIntent() {
  try {
    if (sessionStorage.getItem(INTENT) !== 'plan-setup') return false;
    sessionStorage.removeItem(INTENT);
    return true;
  } catch { return false; }
}

function promptLogin(reason) {
  if (typeof window !== 'undefined' && typeof window.__stwLoginPrompt === 'function') window.__stwLoginPrompt(reason);
}

const mods = {};
async function load(name) {
  if (!mods[name]) {
    try { mods[name] = await (name === 'learn' ? import('./learn.js?v=staging-9dd816f') : import('./review.js?v=staging-9dd816f')); }
    catch (err) { console.warn('home: ' + name + '.js import failed:', err); return null; }
  }
  return mods[name] || null;
}

function learnBarText(goal, done) {
  const over = Math.max(0, done - goal);
  return `学习 ${Math.min(done, goal)}/${goal}` + (over > 0 ? `（+${over}）` : '');
}
function learnBarPct(goal, done) { return goal ? Math.min(100, done / goal * 100) : 0; }

function previewSessionBar(text, pct) {
  const row = el('learnRow'), status = el('learnStatus'), prog = el('learnProg'), btn = el('learnBtn');
  if (!row || !status) return;
  status.textContent = text;
  if (prog) prog.style.width = pct.toFixed(1) + '%';
  if (btn) btn.hidden = true;
  row.hidden = false;
}

async function onLearn() {
  if (trial) { onList(); return; }
  const s = read();
  if (!s?.access_token || !s?.user_id) { promptLogin('learn'); return; }
  const p = plan || await getPlan(s.user_id);
  if (!p?.dict || !p?.daily_goal) {
    window.dispatchEvent(new CustomEvent('stw:need-plan'));
    return;
  }
  plan = p;
  const done = Array.isArray(lastUserRows) ? countTodayLearned(lastUserRows, today()) : 0;
  previewSessionBar(learnBarText(Number(p.daily_goal) || 0, done), learnBarPct(Number(p.daily_goal) || 0, done));
  close();
  await bankReady;
  (await load('learn'))?.startLearn();
}

function nudgeReviewCard() {
  const newEl = el('homeReviewNew');
  if (newEl) { newEl.textContent = reviewEmptyCopy(); newEl.hidden = false; }
  pulseReviewCard();
}

function pulseReviewCard() {
  const card = el('homeReviewCard');
  if (!card) return;
  card.classList.remove('is-nudge');
  void card.offsetWidth;
  card.classList.add('is-nudge');
  clearTimeout(nudgeT);
  nudgeT = setTimeout(() => card.classList.remove('is-nudge'), 2200);
}

function nudgeNeverLearned() {
  const newEl = el('homeReviewNew');
  if (newEl) { newEl.textContent = '还没学过词——先去学第一批吧'; newEl.hidden = false; }
  pulseReviewCard();
  track('review-empty-click');
}

async function onReview() {
  const s = read();
  if (!s?.access_token || !s?.user_id) { promptLogin('review'); return; }
  if (Array.isArray(lastUserRows) && !lastUserRows.some(r => r?.learned_at)) { nudgeNeverLearned(); return; }
  if (lastPending === 0) { nudgeReviewCard(); return; }
  if (lastPending) previewSessionBar(`复习 0/${lastPending}`, 0);
  close();
  await bankReady;
  (await load('review'))?.startReview();
}

function onPlan(e) {
  e?.stopPropagation?.();
  if (!logged()) { markIntent(); promptLogin('plan'); return; }
  window.dispatchEvent(new CustomEvent('stw:need-plan'));
}

function onList() {
  close();
  track('dict-view', { from: 'list' });
  if (typeof window !== 'undefined' && typeof window.__stwOpenList === 'function') window.__stwOpenList(plan?.dict || 'all');
  else console.warn('home: host hook __stwOpenList missing — word-list panel not opened');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  function wire(ids, fn) {
    const root = document.getElementById(ids[0]);
    if (root) { root.addEventListener('click', fn); return; }
    for (const id of ids.slice(1)) { const x = document.getElementById(id); if (x) x.addEventListener('click', fn); }
  }
  wire(['homeLearnCard', 'homeLearnBtn'], onLearn);
  wire(['homeReviewCard', 'homeReviewBtn'], onReview);
  wire(['homePlanRow', 'homePlanEdit', 'homePlanSet'], onPlan);
  wire(['homeList'], onList);

  window.addEventListener('stw:checkin-exit', open);
  window.addEventListener('stw:review-exit', open);

  window.addEventListener('stw:list-close', open);

  window.addEventListener('stw:plan-save', e => {
    if (e.detail?.autostart !== false) {
      const goal = Number(e.detail?.goal) || 0;
      const done = Array.isArray(lastUserRows) ? countTodayLearned(lastUserRows, today()) : 0;
      previewSessionBar(learnBarText(goal, done), learnBarPct(goal, done));
      close();
      return;
    }
    plan = { dict: e.detail.dict, daily_goal: e.detail.goal };
    renderToken++;
    renderPlanRow(logged());
    renderLearnCard(lastUserRows, lastRows);
    renderHomeCandy();
    renderViz(lastUserRows, lastRows, plan, logged(), lastProg);
  });

  window.addEventListener('stw:bank-ready', () => {
    renderPlanRow(logged());
    renderLearnCard(lastUserRows, lastRows);
    renderReviewCard();
    renderHomeCandy();
    renderViz(lastUserRows, lastRows, plan, logged(), lastProg);
  });

  window.addEventListener('stw:auth', e => {
    const on = !!e.detail?.loggedIn;
    if (on && takeIntent()) window.dispatchEvent(new CustomEvent('stw:need-plan'));
    if (on !== lastAuth) render();
  });
  window.addEventListener('stw:checkin-done', () => { if (open_) render(); });

  const logo = document.querySelector('.logo') || document.querySelector('h1');
  if (logo) logo.addEventListener('click', () => window.dispatchEvent(new CustomEvent('stw:home-open')));
  window.addEventListener('stw:home-open', open);

  const homeLogo = document.querySelector('.home-logo');
  if (homeLogo) homeLogo.addEventListener('click', () => { close(); track('dict-view', { from: 'logo' }); window.dispatchEvent(new CustomEvent('stw:home-close')); });
  open();
}
