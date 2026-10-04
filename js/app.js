import { ALL, DATA, state, trial, setTrial } from './bank.js?v=staging-c8a064e';
import { isMobile } from './util.js?v=staging-c8a064e';
import { renderGrid } from './stage.js?v=staging-c8a064e';
import { applyDict, restoreHash, trialBlocked, rebuildBank, bootBank, go } from './nav.js?v=staging-c8a064e';

window.addEventListener('stw:auth', e => {
  if (!e.detail?.loggedIn || !trial) return;
  setTrial(false);
  document.body.classList.remove('guest');
  rebuildBank();
});

addEventListener('hashchange', () => {
  const raw = location.hash.slice(1), w = decodeURIComponent(raw); if (!w || DATA[state.cur]?.word === w) return;
  if (trialBlocked(w)) { restoreHash(); return; }
  const k = DATA.findIndex(e => e.word === w);
  if (k >= 0) go(k, false); else if (ALL.some(e => e.word === w)) applyDict('all', w);
  else restoreHash();
});

try { history.scrollRestoration = 'manual'; } catch {}
const pinTop = () => { if (isMobile() && (scrollY || document.documentElement.scrollTop)) scrollTo(0, 0); };
addEventListener('scroll', pinTop, { passive: true });
addEventListener('resize', pinTop);
visualViewport?.addEventListener('resize', pinTop);
renderGrid();
await bootBank();
