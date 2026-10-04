import { ALL, DATA, state } from './bank.js?v=staging-0f52a63';
import { DICT_NAME, esc, pad } from './util.js?v=staging-0f52a63';
import { P, deferAdvance } from './player.js?v=staging-0f52a63';

export const grid = document.querySelector('#grid');
export const deskStage = document.querySelector('#deskStage');
export const carousel = document.querySelector('#carousel');

const spk = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const shareIco = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/></svg>';
const thumb = e => e.art.replace('600x600bb', '200x200bb');

export function stageHTML(i) {
  const e = DATA[i];
  const dots = e.nclips > 1 ? `<div class="clip-dots" role="group" aria-label="这个词的歌曲（上下滑动或 ↑↓ 切换）">${e.clipTitles.map((c, k) => `<button type="button" class="clip-dot${k === e.ci ? ' on' : ''}" data-clipto="${esc(e.word)}:${k}" aria-label="第 ${k + 1} 首：${esc(c.t)}" title="${esc(c.t)} · ${esc(c.a)}"></button>`).join('')}</div>` : '';
  return `<article class="stage" data-i="${i}">${dots}
    <div class="st-body">
      <div class="st-top"><span class="pill band">${e.tags.includes('ielts') ? `雅思 ${esc(e.band)}` : esc(e.tags.map(t => DICT_NAME[t]).join('·'))}</span><span class="pill">${esc(e.pos)}</span><span class="no">#${pad(e.no || i + 1)}</span><button type="button" class="st-share st-fav" data-fav="${esc(e.word)}" aria-pressed="${state.fav.has(e.word)}" aria-label="收藏这个词" title="收藏到生词本">${state.fav.has(e.word) ? '★' : '☆'}</button><button type="button" class="st-share" data-share="${esc(e.word)}" aria-label="分享这个词" title="生成分享图">${shareIco}</button></div>
      <h2 class="st-word">${esc(e.word)}</h2>
      <div class="st-row"><button class="st-ipa" type="button" data-say="${esc(e.word)}" aria-label="朗读 ${esc(e.word)}">${spk}<span>${esc(e.phonetic)}</span></button><p class="st-mean">${esc(e.meaning)}</p></div>
      <p class="st-mean-hint">释义已隐藏，先听歌再作答</p>
      ${e.en ? `<p class="st-en">${esc(e.en)}</p>` : ''}
      ${e.tip ? `<div class="st-tip"><b>搭配</b>${esc(e.tip)}</div>` : ''}
      ${e.formNote ? `<p class="st-note">${esc(e.formNote)}</p>` : ''}
    </div>
    <div class="lyrics"><div class="lyrics-in"><p class="lyr-msg">正在加载歌词…</p></div></div>
  </article>`;
}

const filled = new Set();
export function fillSlides(i) {
  for (let j = i - 2; j <= i + 2; j++) { const sl = carousel.children[j]; if (sl && !sl.firstChild) { sl.innerHTML = stageHTML(j); filled.add(j); } }
  for (const j of [...filled]) if (Math.abs(j - i) > 4) { const sl = carousel.children[j]; if (sl) sl.innerHTML = ''; filled.delete(j); }
}
export function clearFilled() { filled.clear(); }

export function renderGrid() {
  const q = document.querySelector('#q').value.trim().toLowerCase();
  let rows = DATA.map((e, i) => ({ e, i, s: q ? hitRank(e, q) : 0 })).filter(r => r.s >= 0);
  if (q) rows.sort((a, b) => a.s - b.s || a.i - b.i);
  const n = rows.length;
  grid.innerHTML = rows.map(({ e, i }) =>
    `<button type="button" class="card" data-i="${i}">
      <span class="disc"><img src="${thumb(e)}" alt="" loading="lazy"></span>
      <span class="no">#${pad(e.no || i + 1)}</span><span class="w${e.word.length >= 10 ? ' long' : ''}">${esc(e.word)}</span><span class="ph">${esc(e.phonetic)}</span>
      <span class="mn">${esc(e.pos)} ${esc(e.meaning)}</span><span class="sg"><b>${esc(e.title)}</b> · ${esc(e.artist)}</span></button>`).join('') || (state.dict === 'fav' && !state.fav.size
    ? '<p class="empty">还没有收藏：点开一个词，再点卡片右上角的 ☆ 收进生词本</p>'
    : ALL.length ? '<p class="empty">没有匹配的单词</p>' : '<p class="loading">正在加载词库…</p>');
  document.querySelector('#countLine').textContent = state.dict === 'fav' && !DATA.length ? '还没有收藏'
    : q ? `${n} 个匹配` : `${DATA.length} 个单词 · ${new Set(DATA.flatMap(e => e.artists)).size} 位歌手`;
  markCards(true);
}

const hitRank = (e, q) => {
  const w = String(e.word || '').toLowerCase(), m = String(e.meaning || '').toLowerCase();
  if (w === q) return 0;
  if (w.startsWith(q)) return 1;
  if (w.includes(q)) return 2;
  if (m.includes(q)) return 3;
  if ((e.en || '').toLowerCase().includes(q)) return 4;
  if (e.title.toLowerCase().includes(q)) return 5;
  if (e.artist.toLowerCase().includes(q)) return 6;
  return -1;
};
let marked = -1;
export function markCards(full) {
  const cards = full ? grid.querySelectorAll('.card') : [grid.querySelector(`.card[data-i="${marked}"]`), grid.querySelector(`.card[data-i="${state.cur}"]`)].filter(Boolean);
  cards.forEach(c => {
    const i = +c.dataset.i;
    c.classList.toggle('on', i === state.cur);
    c.classList.toggle('done', state.done.has(DATA[i].word));
    c.classList.toggle('fav', state.fav.has(DATA[i].word));
    c.classList.toggle('playing', i === state.cur && P.playing);
  });
  marked = state.cur;
  const learned = ALL.filter(e => state.done.has(e.word)).length;
  document.querySelector('#doneCount').textContent = learned;
  document.querySelector('#progFill').style.width = `${ALL.length ? learned / ALL.length * 100 : 0}%`;
}
