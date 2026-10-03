export const PREFIX = { '~a/': 'https://audio-ssl.itunes.apple.com/itunes-assets/', '~i/': 'https://is1-ssl.mzstatic.com/image/thumb/', '~m/': 'https://music.apple.com/us/' };
export const expand = u => u && u[0] === '~' ? PREFIX[u.slice(0, 3)] + u.slice(3) : u;
export function useClip(e, k) { e.ci = k; Object.assign(e, e.clips[k]); }
export const DICT_NAME = { ielts: '雅思', cet4: '四级', cet6: '六级', toefl: '托福' };
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
export const mq = matchMedia('(max-width: 899px)');
export const isMobile = () => mq.matches;
export const pad = n => String(n).padStart(3, '0');
export const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
