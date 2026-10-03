

const FOCUSABLE = 'a[href],area[href],button,input,select,textarea,[tabindex]';
const FALLBACK_ID = 'authBtn';

function isTabStop(el) {
  if (el.disabled) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.closest('[hidden]')) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  return el.getClientRects().length > 0;
}

function tabStops(root) {
  const out = [];
  for (const el of root.querySelectorAll(FOCUSABLE)) if (isTabStop(el)) out.push(el);
  return out;
}

const traps = [];
let lastOutside = null;

function visibleTrap() {
  for (const t of traps) if (!t.modal.hidden) return t;
  return null;
}

function initialFocus(t) {
  const f = tabStops(t.modal);
  const input = f.find(el => el.matches('input,select,textarea'));
  if (input) return input;
  const head = [...t.modal.querySelectorAll('h1,h2,h3,h4,h5')].find(h => h.getAttribute('tabindex') === '-1' && !h.closest('[hidden]'));
  if (head) return head;
  if (t.modal.getAttribute('tabindex') === '-1') return t.modal;
  return f.find(el => !el.classList.contains('auth-x')) || f[0];
}

function onOpen(t) {
  t.invoker = lastOutside;

  if (!t.modal.contains(document.activeElement)) {
    initialFocus(t)?.focus();
  }
}

function onClose(t) {
  const inv = t.invoker;
  t.invoker = null;
  if (visibleTrap()) return;
  const target = inv && inv.isConnected && inv.offsetParent !== null ? inv : document.getElementById(FALLBACK_ID);
  target?.focus?.();
}

function install(modal) {
  const t = { modal, invoker: null, wasHidden: modal.hidden };
  traps.push(t);
  new MutationObserver(() => {
    const hidden = modal.hidden;
    if (t.wasHidden && !hidden) onOpen(t);
    else if (!t.wasHidden && hidden) onClose(t);
    t.wasHidden = hidden;
  }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  if (!t.wasHidden) onOpen(t);
  return t;
}

function onKeydown(e) {
  if (e.key !== 'Tab') return;
  const t = visibleTrap();
  if (!t || t.modal.classList.contains('g6-out')) return;
  const f = tabStops(t.modal);

  if (!f.length) { e.preventDefault(); return; }
  const a = document.activeElement, idx = f.indexOf(a);
  const first = f[0], last = f[f.length - 1];
  if (idx === -1) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && idx === 0) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && idx === f.length - 1) { e.preventDefault(); first.focus(); }
}

document.addEventListener('focusin', e => {
  const t = visibleTrap();
  if (t && t.modal.contains(e.target)) return;
  lastOutside = e.target;
}, true);
document.addEventListener('keydown', onKeydown, true);
for (const m of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) install(m);
