import { DATA } from './bank.js?v=staging-0f52a63';
import { esc } from './util.js?v=staging-0f52a63';

let glossTimer = 0;

export function showGloss(el, ms) {
  if (document.body.classList.contains('stw-review')) return;
  const stage = el.closest('.stage'), inner = stage?.querySelector('.lyrics-in'), line = el.closest('.ln'); if (!inner || !line) return;
  const e = DATA[+stage.dataset.i];
  const x = el.dataset.x === 'main' ? { w: e.word, p: e.phonetic, m: e.meaning } : e.ex?.[+el.dataset.x]; if (!x) return;
  let g = inner.querySelector('.gloss');
  if (!g) { g = document.createElement('span'); g.className = 'gloss'; g.setAttribute('role', 'tooltip'); inner.appendChild(g); }
  g.innerHTML = `<b>${esc(x.w)}</b><i>${esc(x.p)}</i><span>${esc(x.m)}</span>`;
  g.classList.toggle('main', el.dataset.x === 'main');
  const ir = inner.getBoundingClientRect(), r = el.getBoundingClientRect(), half = g.offsetWidth / 2 + 2;
  const lr = line.getBoundingClientRect(), firstRow = r.top - lr.top < r.height * .8;
  g.style.top = firstRow ? `${line.offsetTop - g.offsetHeight / 2 + 1}px` : `${line.offsetTop + line.offsetHeight - g.offsetHeight / 2 - 1}px`;
  g.style.left = `${Math.min(ir.width - half, Math.max(half, r.left - ir.left + r.width / 2))}px`;
  g.classList.add('on');
  clearTimeout(glossTimer);
  if (ms) glossTimer = setTimeout(() => g.classList.remove('on'), ms);
}

export function hideGloss() { clearTimeout(glossTimer); document.querySelectorAll('.gloss.on').forEach(g => g.classList.remove('on')); }

document.addEventListener('mouseover', e => { const w = e.target.closest?.('.xw,.tw[data-x]'); if (w) showGloss(w, 0); });
document.addEventListener('mouseout', e => { if (e.target.closest?.('.xw,.tw[data-x]')) hideGloss(); });
document.addEventListener('click', e => { const w = e.target.closest('.xw,.tw[data-x]'); if (w) showGloss(w, 2600); });
document.addEventListener('focusin', e => { const w = e.target.closest?.('.xw,.tw[data-x]'); if (w) showGloss(w, 0); });
document.addEventListener('focusout', e => { if (e.target.closest?.('.xw,.tw[data-x]')) hideGloss(); });
