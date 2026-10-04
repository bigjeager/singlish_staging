import { DATA, idxOf } from './bank.js?v=staging-0f52a63';
import { store, esc } from './util.js?v=staging-0f52a63';
import { track } from './track.js?v=staging-0f52a63';
import { loadLyrics } from './lyrics.js?v=staging-0f52a63';

const $ = s => document.querySelector(s);
const SHARE_LINES = ['每个单词，都有一首歌', '听歌，顺便把单词背了', '唱过的词，忘不掉', '单曲循环过的歌词，想忘都难', '这首歌里，藏着一个考试词', '背单词这件事，终于不无聊了'];
const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = no; im.src = src; });

function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + r, y, r); g.closePath(); }
function fitFont(g, text, weight, family, max, width) { let size = max; do { g.font = `${weight} ${size}px ${family}`; size -= 4; } while (g.measureText(text).width > width && size > 24); return g.font; }
function wrap(g, text, width) {
  const parts = text.match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+|\s+/g) || [];
  const lines = []; let cur = '';
  for (const p of parts) { const t = cur + p; if (g.measureText(t.trim()).width > width && cur.trim()) { lines.push(cur.trim()); cur = p.trimStart(); } else cur = t; }
  if (cur.trim()) lines.push(cur.trim()); return lines;
}

function pageUrl(i, src, content) {
  return location.origin + location.pathname + (src ? `?utm_source=${src}` : '') + (content ? `&utm_content=${content}` : '') + '#' + encodeURIComponent(DATA[i].word);
}

async function makeCard(i) {
  const e = DATA[i], W = 1080, H = 1440;
  const DISPLAY = '"Bricolage Grotesque","PingFang SC",sans-serif', BODY = '"Figtree","PingFang SC","Hiragino Sans GB",sans-serif', IPA = '"Gentium Book Plus","Charis SIL",serif';
  await Promise.all([document.fonts.load(`800 120px ${DISPLAY}`), document.fonts.load(`700 40px ${BODY}`), document.fonts.load(`400 40px ${IPA}`)]).catch(() => {});
  const [art, L] = await Promise.all([loadImg(e.art).catch(() => null), loadLyrics(i).catch(() => null)]);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const grad = (x0, x1) => { const k = g.createLinearGradient(x0, 0, x1, 0); k.addColorStop(0, '#FF4D8D'); k.addColorStop(.55, '#FF7A59'); k.addColorStop(1, '#FFB547'); return k; };
  const cx = W / 2;
  g.fillStyle = '#0B0A14'; g.fillRect(0, 0, W, H);
  if (art) { g.save(); g.filter = 'blur(80px) saturate(1.5)'; g.globalAlpha = .55; g.drawImage(art, -260, -260, W + 520, W + 520); g.restore(); }
  const wash = g.createLinearGradient(0, 0, 0, H); wash.addColorStop(0, 'rgba(11,10,20,.3)'); wash.addColorStop(.6, 'rgba(11,10,20,.82)'); wash.addColorStop(1, 'rgba(11,10,20,.97)');
  g.fillStyle = wash; g.fillRect(0, 0, W, H);
  const line = L?.lines.find(l => l.target);
  let rows = [], fs = 40, space = 0;
  if (line) {
    const rx = new RegExp(`\\b${e.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (fs = 40; fs >= 30; fs -= 4) {
      g.font = `700 ${fs}px ${DISPLAY}`; space = g.measureText(' ').width; rows = [[]]; let rw = 0;
      for (const t of line.x.split(/\s+/)) { const w = g.measureText(t).width; if (rw + w > 860 && rows.at(-1).length) { rows.push([]); rw = 0; } rows.at(-1).push({ t, w, hit: rx.test(t) }); rw += w + space; }
      if (rows.length <= 2) break;
    }
  }
  const lyricH = line ? rows.length * (fs + 20) + 56 : 0;
  const bottomLimit = H - 250, below = 175 + 70 + (line ? 60 + lyricH : 0);
  const r = Math.max(170, Math.min(270, (bottomLimit - below - 120) / 2));
  const cy = 110 + r;
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 60; g.shadowOffsetY = 24; g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fillStyle = '#08070D'; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  if (art) g.drawImage(art, cx - r, cy - r, r * 2, r * 2); else { g.fillStyle = '#222'; g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1.5; for (let rr = 50; rr < r; rr += 8) { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  g.beginPath(); g.arc(cx, cy, r * .14, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
  g.beginPath(); g.arc(cx, cy, r * .06, 0, Math.PI * 2); g.fillStyle = '#0B0A14'; g.fill();
  let y = cy + r + 175;
  g.textAlign = 'center'; g.fillStyle = '#F7F5FF'; g.font = fitFont(g, e.word, 800, DISPLAY, 170, 920); g.fillText(e.word, cx, y);
  y += 70;
  g.font = `400 40px ${IPA}`; const iw = g.measureText(e.phonetic).width;
  g.font = `600 38px ${BODY}`; const mw = g.measureText(e.meaning).width;
  const x0 = cx - (iw + 30 + mw) / 2; g.textAlign = 'left';
  g.font = `400 40px ${IPA}`; g.fillStyle = '#A9A5C8'; g.fillText(e.phonetic, x0, y);
  g.font = `600 38px ${BODY}`; g.fillStyle = '#E4E1F5'; g.fillText(e.meaning, x0 + iw + 30, y);
  if (line) {
    y += 60 + fs;
    g.font = `700 ${fs}px ${DISPLAY}`;
    rows.forEach((row, k) => {
      const total = row.reduce((a, o) => a + o.w, 0) + space * (row.length - 1); let x = cx - total / 2; const by = y + k * (fs + 20);
      for (const o of row) {
        if (o.hit) { g.save(); g.translate(x + o.w / 2, by - fs * .34); g.rotate(-.02); g.fillStyle = '#FFE14A'; rrect(g, -o.w / 2 - 5, -fs * .72, o.w + 10, fs * 1.18, 10); g.fill(); g.restore(); g.fillStyle = '#1D1426'; }
        else g.fillStyle = 'rgba(247,245,255,.88)';
        g.textAlign = 'left'; g.fillText(o.t, x, by); x += o.w + space;
      }
    });
    y += (rows.length - 1) * (fs + 20) + 56;
    g.textAlign = 'center'; g.font = `500 26px ${BODY}`; g.fillStyle = '#8A86AA';
    g.fillText(`${e.title} · ${e.artist}`, cx, y);
  }
  const qs = 150, qx = W - 80 - qs, qy = H - 80 - qs;
  if (window.qrcode) {
    const q = qrcode(0, 'M'); q.addData(pageUrl(i, 'sharing', `line${shareLine + 1}`)); q.make();
    const n = q.getModuleCount(), pad = 12, cell = (qs - pad * 2) / n;
    g.fillStyle = '#FFFFFF'; rrect(g, qx, qy, qs, qs, 16); g.fill(); g.fillStyle = '#0B0A14';
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (q.isDark(a, b)) g.fillRect(Math.floor(qx + pad + b * cell), Math.floor(qy + pad + a * cell), Math.ceil(cell), Math.ceil(cell));
  }
  g.textAlign = 'left'; g.font = `800 44px ${DISPLAY}`; g.fillStyle = '#F7F5FF'; g.fillText('Sing', 80, qy + 78);
  const sw = g.measureText('Sing').width, lw = g.measureText('lish').width; g.fillStyle = grad(80 + sw, 80 + sw + 80); g.fillText('lish', 80 + sw, qy + 78);
  g.fillStyle = '#F7F5FF'; g.fillText('.study', 80 + sw + lw, qy + 78);
  g.font = `500 24px ${BODY}`; g.fillStyle = '#8A86AA'; g.fillText(SHARE_LINES[shareLine], 80, qy + 122);
  return new Promise(ok => c.toBlob(ok, 'image/png'));
}

let shareFile = null, shareIdx = 0, shareUrl = '', shareLine = 0;

export async function openShare(word) {
  const i = idxOf(word); if (i < 0) return;
  shareLine = store.get('stw.line', 0) % SHARE_LINES.length; store.set('stw.line', shareLine + 1);
  shareIdx = i; shareFile = null;
  const sheet = $('#sheet'), img = $('#sheetImg');
  sheet.hidden = false; img.hidden = true; $('#sheetBusy').hidden = false;
  try {
    const blob = await makeCard(i);
    shareFile = new File([blob], `singlish-${word}.png`, { type: 'image/png' });
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    shareUrl = URL.createObjectURL(blob);
    img.src = await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(blob); });
    img.hidden = false; $('#sheetBusy').hidden = true;
    setShareMode();
  } catch { $('#sheetBusy').textContent = '分享图生成失败，请检查网络后重试。'; }
}

const touch = matchMedia('(pointer: coarse)').matches, inApp = /MicroMessenger|QQ\/|Weibo|DingTalk|Lark|Feishu/i.test(navigator.userAgent);

function setShareMode() {
  const canFiles = !!(navigator.canShare && shareFile && navigator.canShare({ files: [shareFile] }));
  const save = $('#shareSave'), native = $('#shareNative'), hint = $('#sheetHint');
  native.hidden = !canFiles;
  if (canFiles) { save.hidden = true; hint.innerHTML = '发朋友圈：点「分享」→ 选「微信」→「分享到朋友圈」<br>存相册：点「分享」→「存储图像」'; }
  else if (touch) { save.hidden = true; hint.innerHTML = '长按图片，保存到相册<br><small>再去朋友圈发表，从相册选这张图</small>'; hint.classList.add('strong'); }
  else { save.textContent = '保存图片'; save.hidden = false; hint.textContent = ''; }
  if (inApp) { save.hidden = true; native.hidden = true; hint.innerHTML = '长按图片，保存到相册<br><small>再去朋友圈发表，从相册选这张图</small>'; hint.classList.add('strong'); }
}

function closeShare() { $('#sheet').hidden = true; }
$('#shareClose').addEventListener('click', closeShare);
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeShare(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeShare(); });

$('#shareNative').addEventListener('click', async () => {
  const e = DATA[shareIdx];
  const k = shareLine;
  track('share', { word: e.word, line: k + 1 });
  try { await navigator.share({ files: [shareFile], title: `Singlish · ${e.word}`, text: `${SHARE_LINES[k]} ${pageUrl(shareIdx, 'share', `line${k + 1}`)}` }); } catch {}
});

$('#shareSave').addEventListener('click', async () => {
  if (!shareUrl) return;
  if (touch && navigator.canShare?.({ files: [shareFile] })) { try { await navigator.share({ files: [shareFile] }); } catch {} return; }
  const a = document.createElement('a'); a.href = shareUrl; a.download = shareFile.name; document.body.appendChild(a); a.click(); a.remove();
});
