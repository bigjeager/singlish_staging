import { ALL, inDict, trial, trialMeta } from './bank.js?v=staging-0f52a63';

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS = 17;

const el = id => (typeof document === 'undefined' ? null : document.getElementById(id));
const pad = n => String(n).padStart(2, '0');
const ymdOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, k) => { const t = new Date(d); t.setDate(t.getDate() + k); return t; };
const isoLocalDay = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : ymdOf(d); };
const levelOf = n => (n >= 10 ? 5 : n >= 7 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);

let dayCount = new Map();
let reviewCount = new Map();
let checkinSet = new Set();
let userWords = [];
let retryT = 0;
let retryLeft = 0;
let lastArgs = null;
let detailDay = null;
let monthCuts = [];
let monthSpans = [];

function countsByDay(rows) {
  const learned = new Map(), reviewed = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    if (r.word && r.learned_at) {
      const k = isoLocalDay(r.learned_at);
      if (k) learned.set(k, (learned.get(k) || 0) + 1);
    }
    if (r.reviewed_at) {
      const k = isoLocalDay(r.reviewed_at);
      if (k) reviewed.set(k, (reviewed.get(k) || 0) + 1);
    }
  }
  return [learned, reviewed];
}

function dictWords(dict) {
  if (!Array.isArray(ALL) || !ALL.length) return null;
  return new Set(ALL.filter(e => inDict(e, dict || 'all')).map(e => e.word));
}

export function renderViz(userRows, checkinRows, plan, loggedIn, prog) {
  lastArgs = [userRows, checkinRows, plan, loggedIn, prog];
  const card = el('homeViz');
  if (!card) return;
  const show = !!loggedIn && !trial;
  card.hidden = !show;
  clearTimeout(retryT);
  retryLeft = 10;
  if (!show) return;
  userWords = Array.isArray(userRows) ? userRows : [];
  [dayCount, reviewCount] = countsByDay(userRows);
  checkinSet = new Set((Array.isArray(checkinRows) ? checkinRows : []).map(r => String(r?.day || '')));
  renderCheckins();
  renderRing(plan, prog);
  renderHeatmap();
  hideDetail();
}

function renderCheckins() {
  const ck = el('hmCheckins');
  if (!ck) return;
  const n = document.createElement('b');
  n.textContent = String(checkinSet.size);
  ck.replaceChildren('累计打卡 ', n, ' 天');
}

function renderRing(plan, prog) {
  const pctEl = el('ringPct'), sub = el('ringSub'), bar = el('ringBar');
  if (!pctEl || !bar) return;
  const dict = plan?.dict || 'all';
  let total = 0, learned = 0, fromProg = false;
  if (prog?.totals && prog.totals[dict] != null) {
    total = prog.totals[dict];
    learned = prog.learned?.[dict] || 0;
    fromProg = true;
  } else {
    const set = dictWords(dict);
    total = set ? set.size : 0;
    learned = set ? userWords.filter(r => r?.learned_at && set.has(r.word)).length : 0;
  }
  if (!total || (!fromProg && !trial && trialMeta.count > 0 && total === trialMeta.count)) {
    pctEl.textContent = '--';
    if (sub) sub.textContent = '词库加载中';
    if (retryLeft-- > 0) retryT = setTimeout(() => lastArgs && renderViz(...lastArgs), 800);
    return;
  }
  const pct = learned / total;
  const tiny = learned > 0 && Math.round(pct * 100) === 0;
  const c = 2 * Math.PI * Number(bar.getAttribute('r'));
  bar.style.strokeDasharray = c.toFixed(1);
  bar.style.strokeDashoffset = (c * (1 - (tiny ? 0.02 : pct))).toFixed(1);
  pctEl.textContent = tiny ? (pct * 100).toFixed(1) + '%' : Math.round(pct * 100) + '%';
  if (sub) sub.textContent = `已学 ${learned} / 共 ${total} 词`;
}

function renderMonths(start, todayCol) {
  const box = el('hmMonths');
  if (!box) return;
  box.replaceChildren();
  monthCuts = [];
  monthSpans = [];
  const starts = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = addDays(start, i);
    if (d.getDate() !== 1 && i !== 0) continue;
    const col = Math.max(0, Math.floor(i / 7));
    if (col > todayCol) continue;
    monthCuts.push(col);
    starts.push([col, d.getMonth()]);
  }
  let lastCol = -1;
  for (const [col, mon] of starts) {
    if (lastCol >= 0 && col - lastCol < 2) continue;
    lastCol = col;
    const next = monthCuts.find(c => c > col);
    const end = next === undefined ? WEEKS : next;
    const s = document.createElement('span');
    s.className = 'hm-mon';
    s.textContent = MONTHS[mon];
    box.appendChild(s);
    monthSpans.push({ el: s, col, narrow: end - col < 2 });
  }
}

function placeMonths() {
  const grid = el('hmGrid'), months = el('hmMonths');
  if (!grid || !months) return;
  if (!monthCuts.length || grid.children.length !== WEEKS) return;
  const base = grid.parentElement.getBoundingClientRect();
  const monShift = months.getBoundingClientRect().left - base.left;
  const gridW = grid.getBoundingClientRect().right - base.left;
  const xs = monthCuts.map(col => grid.children[col].getBoundingClientRect().left - base.left);
  for (const { el: lab, col, narrow } of monthSpans) {
    const idx = monthCuts.indexOf(col);
    const nextIdx = monthCuts.findIndex((c, j) => j > idx && c > col);
    if (narrow) {
      lab.style.left = `${xs[idx] - monShift + 3}px`;
      lab.style.transform = '';
    } else {
      const a = col === 0 ? 0 : xs[idx] - monShift - 4;
      const b = nextIdx === -1 ? gridW - monShift : xs[nextIdx] - monShift - 4;
      lab.style.left = `${(a + b) / 2}px`;
      lab.style.transform = 'translateX(-50%)';
    }
  }
}

function renderHeatmap() {
  const grid = el('hmGrid');
  if (!grid) return;
  const now = new Date();
  const today = ymdOf(now);
  const curWeekStart = addDays(now, -((now.getDay() + 6) % 7));
  const start = addDays(curWeekStart, -(WEEKS - 1) * 7);
  const todayCol = Math.max(0, Math.floor((now - start) / 86400000 / 7));
  renderMonths(start, todayCol);
  const frag = document.createDocumentFragment();
  for (let w = 0; w < WEEKS; w++) {
    const col = document.createElement('div');
    col.className = 'hm-col' + (w > 0 && monthCuts.includes(w) ? ' hm-cut' : '');
    for (let r = 0; r < 7; r++) {
      const i = w * 7 + r;
      const d = addDays(start, i);
      const k = ymdOf(d);
      const n = dayCount.get(k) || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hm-cell';
      b.dataset.level = levelOf(n);
      b.dataset.day = k;
      if (k > today) {
        b.classList.add('is-future');
        b.disabled = true;
        b.tabIndex = -1;
      } else {
        b.title = `${d.getMonth() + 1}月${d.getDate()}日 · ${n ? '学了 ' + n + ' 词' : '没学词'}`;
        b.setAttribute('aria-label', b.title);
      }
      col.appendChild(b);
    }
    frag.appendChild(col);
  }
  grid.replaceChildren(frag);
  placeMonths();
}

function fillDetail(k, cell) {
  const pop = el('hmPop');
  if (!pop) return;
  detailDay = k;
  const d = new Date(k + 'T00:00:00');
  const today = ymdOf(new Date());
  const rel = k === today ? ' · 今天' : k === ymdOf(addDays(new Date(), -1)) ? ' · 昨天' : '';
  const n = dayCount.get(k) || 0;
  const m = reviewCount.get(k) || 0;
  const date = document.createElement('b');
  date.textContent = `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK_CN[d.getDay()]}${rel}`;
  const tag = document.createElement('span');
  tag.className = 'hm-tag' + (n === 0 && m === 0 ? ' is-zero' : checkinSet.has(k) ? ' is-hit' : '');
  tag.textContent = n === 0 && m === 0 ? '这天没学习' : checkinSet.has(k) ? '已打卡' : '未打卡';
  const nums = document.createElement('span');
  nums.className = 'hm-nums';
  nums.textContent = `学习 ${n} 词 · 复习 ${m} 词`;
  pop.replaceChildren(date, tag, nums);
  pop.hidden = false;
  placePop(pop, cell);
}

function placePop(pop, cell) {
  const grid = el('hmGrid');
  const bodyIn = grid ? grid.parentElement : null;
  if (!bodyIn) return;
  const w = pop.offsetWidth;
  const cx = cell.offsetLeft + cell.offsetWidth / 2;
  const fits = w <= bodyIn.clientWidth - 16;
  const lo = fits ? 8 : 0;
  const left = Math.min(Math.max(cx - w / 2, lo), Math.max(bodyIn.clientWidth - w - (fits ? 8 : 1), lo));
  const below = cell.offsetTop < bodyIn.clientHeight / 2;
  pop.classList.toggle('is-above', !below);
  pop.style.left = `${left}px`;
  pop.style.top = below
    ? `${cell.offsetTop + cell.offsetHeight + 9}px`
    : `${cell.offsetTop - pop.offsetHeight - 9}px`;
  pop.style.setProperty('--ax', `${Math.min(Math.max(cx - left, 10), w - 10)}px`);
}

function hideDetail() {
  detailDay = null;
  const pop = el('hmPop');
  if (!pop) return;
  pop.hidden = true;
  pop.classList.remove('is-above');
}

function showDetail(k, cell) {
  const pop = el('hmPop');
  if (!pop || !cell) return;
  if (detailDay === k) {
    hideDetail();
    return;
  }
  fillDetail(k, cell);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const toggle = el('hmToggle'), card = el('homeViz');
  if (toggle && card) toggle.addEventListener('click', () => {
    hideDetail();
    const open = card.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  const grid = el('hmGrid');
  if (grid) grid.addEventListener('click', e => {
    const b = e.target.closest('.hm-cell');
    if (!b || b.disabled || !b.dataset.day) return;
    showDetail(b.dataset.day, b);
  });
  const pop = el('hmPop');
  if (pop) {
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest || !e.target.closest('#hmGrid')) hideDetail();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideDetail();
    });
  }
  window.addEventListener('load', placeMonths);
  window.addEventListener('resize', placeMonths);
}
