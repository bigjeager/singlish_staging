
export function track(name, data) {
  if (typeof window === 'undefined') return;
  if (window.umami) { try { window.umami.track(name, data); } catch {} return; }
  let n = 0; const t = setInterval(() => { if (window.umami || ++n > 20) { clearInterval(t); try { window.umami?.track(name, data); } catch {} } }, 500);
}
