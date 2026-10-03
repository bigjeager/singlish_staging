import { DATA, ensureDetail } from './bank.js?v=staging-767b940';
import { esc } from './util.js?v=staging-767b940';

export const lyr = new Map();

export function parseLrc(s) {
  return s.split('\n').map(l => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); return m && { t: +m[1] * 60 + +m[2], x: m[3].trim() }; }).filter(Boolean);
}

const LRC_MS = 10000;

function withTimeout(pr, ms) {
  let t;
  const cap = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('歌词请求超时')), ms); });
  return Promise.race([pr, cap]).finally(() => clearTimeout(t));
}

function fetchLrc(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LRC_MS);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(t));
}

export function loadLyrics(i) {
  if (lyr.has(i)) return lyr.get(i);
  const e = DATA[i];
  const p = withTimeout(ensureDetail(e)
    .then(() => fetchLrc(`https://lrclib.net/api/get/${e.lrclib}`)), LRC_MS)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
      const all = parseLrc(d.syncedLyrics || '');
      const off = e.offset, lim = off + 29.6;
      let k = all.findIndex(l => Math.abs(l.t - e.t) < .05);
      if (k < 0) k = all.findIndex(l => l.t >= e.t - .5);
      const inside = j => all[j] && all[j].x && all[j].t >= off + .2 && (all[j + 1]?.t ?? all[j].t + 4) <= lim + 1.5;
      let from = k; if (inside(k - 1) && e.t - all[k - 1].t < 9) from = k - 1;
      let to = k; while (to < k + 2 && inside(to + 1)) to++;
      const lines = [];
      for (let j = from; j <= to; j++) if (all[j].x) {
        const wt = e.wt?.[all[j].t.toFixed(2)];
        lines.push({ t: all[j].t, st: wt ? wt.s : all[j].t, wt: wt?.w, end: Math.min(all[j + 1]?.t ?? all[j].t + 4, lim), x: all[j].x, target: j === k });
      }
      const start = Math.max(off + .05, Math.min(lines[0].t, lines[0].st) - 1.2);
      let end = Math.min(lim, lines.at(-1).end + .4);
      if (end - start > 20) end = start + 20;
      return { lines, start, end };
    });
  lyr.set(i, p);
  p.catch(() => lyr.delete(i));
  return p;
}

const re = f => new RegExp(`\\b(${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');

export function lineHTML(L, form, ex) {
  const words = L.x.split(/\s+/);
  const r = L.target ? re(form) : null;
  const mine = new Map((ex || []).map((x, n) => [x, n]).filter(([x]) => x.k === L.t.toFixed(2)).map(([x, n]) => [x.i, n]));
  return words.map((w, i) => {
    if (r && r.test(w)) return `<span class="lw tw" data-x="main" tabindex="0">${esc(w)}</span>`;
    if (mine.has(i)) return `<span class="lw xw" data-x="${mine.get(i)}" tabindex="0">${esc(w)}</span>`;
    return `<span class="lw">${esc(w)}</span>`;
  }).join(' ');
}

export async function fillLyrics(i, root) {
  const box = root.querySelector('.lyrics-in');
  if (!box || box.dataset.ok) return;
  try {
    const L = await loadLyrics(i);
    box.innerHTML = L.lines.map(l => `<p class="ln">${lineHTML(l, DATA[i].form, DATA[i].ex)}</p>`).join('');
    box.dataset.ok = 1;
  } catch {
    box.innerHTML = '<p class="lyr-msg">歌词加载失败，请检查网络。</p><button type="button" class="lyr-retry">重试</button>';
    box.querySelector('.lyr-retry')?.addEventListener('click', ev => {
      ev.stopPropagation();
      delete box.dataset.ok;
      box.innerHTML = '<p class="lyr-msg">正在加载歌词…</p>';
      fillLyrics(i, root);
    });
  }
}
