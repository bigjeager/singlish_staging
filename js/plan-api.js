import { AUTH_CONFIG } from './config.js?v=staging-b72ca03';

const KEY = 'stw.auth.session';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };

const usable = () => !!(AUTH_CONFIG.url && AUTH_CONFIG.anonKey) && !!read()?.access_token;
const headers = () => ({ 'Content-Type': 'application/json', apikey: AUTH_CONFIG.anonKey, Authorization: 'Bearer ' + read().access_token });

async function getRow(path) {
  try {
    const res = await fetch(AUTH_CONFIG.url + path, { headers: headers() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) { console.warn('plan-api: GET failed:', err); return null; }
}

async function postRows(table, rows, upsert) {
  try {
    const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: upsert ? { ...headers(), Prefer: 'resolution=merge-duplicates' } : headers(),
      body: JSON.stringify(rows)
    });
    if (res.ok) bust(table);
    return res.ok;
  } catch (err) { console.warn('plan-api: POST ' + table + ' failed:', err); return false; }
}

const TTL = 1200;
const memo = new Map();
function once(key, fn) {
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.p;
  const p = (async () => {
    const val = await fn();
    if (val == null) memo.delete(key);
    return val;
  })();
  memo.set(key, { p, exp: Date.now() + TTL });
  return p;
}
function bust(prefix) {
  for (const k of [...memo.keys()]) if (k.startsWith(prefix)) memo.delete(k);
}

export function getPlan(userId) {
  if (!usable()) return null;
  return once('plans:' + userId, () => getRow(`/rest/v1/plans?user_id=eq.${encodeURIComponent(userId)}`));
}

export function savePlan(userId, dict, dailyGoal) {
  if (!usable()) return false;
  return postRows('plans', [{ user_id: userId, dict, daily_goal: dailyGoal }], true);
}

export function saveCheckinMark(userId, day) {
  if (!usable()) return false;
  return postRows('checkins', [{ user_id: userId, day }], true);
}

export function getCheckins(userId) {
  if (!usable()) return null;
  return once('checkins:' + userId, async () => {
    try {
      const res = await fetch(AUTH_CONFIG.url + `/rest/v1/checkins?user_id=eq.${encodeURIComponent(userId)}`, { headers: headers() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch (err) { console.warn('plan-api: GET checkins failed:', err); return null; }
  });
}

export function getHomeProgress(userId) {
  if (!usable()) return null;
  return once('user_words:homeprog:' + userId, async () => {
    try {
      const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/rpc/home_progress`, { method: 'POST', headers: headers(), body: '{}' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      return d?.totals ? d : null;
    } catch (err) { console.warn('plan-api: home progress failed:', err); return null; }
  });
}

export function getUserWords(userId) {
  if (!usable()) return null;
  return once('user_words:' + userId, async () => {
    const rows = [];
    try {
      for (let offset = 0; ; offset += 1000) {
        const res = await fetch(AUTH_CONFIG.url + `/rest/v1/user_words?user_id=eq.${encodeURIComponent(userId)}&select=word,learned_at,reviewed_at,last_correct,next_due,box&order=word&limit=1000&offset=${offset}`, { headers: headers() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const page = await res.json();
        if (!Array.isArray(page)) throw new Error('bad payload');
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    } catch (err) { console.warn('plan-api: GET user_words failed:', err); return null; }
  });
}

export function saveSrsState(userId, word, correct, box, nextDue) {
  if (!usable()) return false;
  return postRows('user_words', [{ user_id: userId, word, last_correct: correct, box, next_due: nextDue }], true);
}

export function saveReviewState(userId, word, correct, box, nextDue) {
  if (!usable()) return false;
  return postRows('user_words', [{ user_id: userId, word, reviewed_at: new Date().toISOString(), last_correct: correct, box, next_due: nextDue }], true);
}

function tomorrowLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function saveLearnSeed(userId, word) {
  if (!usable()) return false;
  return postRows('user_words', [{ user_id: userId, word, learned_at: new Date().toISOString(), box: 1, next_due: tomorrowLocal() }], true);
}

let poolPromise = null;
export function getQuizPool() {
  if (!poolPromise) {
    poolPromise = fetch('./quiz-pool.json')
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .catch(err => { console.warn('plan-api: quiz pool load failed:', err); poolPromise = null; return []; });
  }
  return poolPromise;
}

const BANK_PAGE = 1000;
const BANK_TTL = 24 * 3600e3;

function bankVer(rows) {
  const last = rows[rows.length - 1];
  return `${rows.length}:${last?.id ?? -1}`;
}

export function readBankCache() {
  try {
    const c = JSON.parse(localStorage.getItem('stw.bank.v1'));
    return c?.v && c.rows?.length && c.rows[0]?.meta?.c0 ? c : null;
  } catch { return null; }
}

export function saveBankCache(rows) {
  try { localStorage.setItem('stw.bank.v1', JSON.stringify({ v: bankVer(rows), t: Date.now(), rows })); } catch {}
}

async function bankPage(offset) {
  const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/words?select=id,word,meta&order=id&limit=${BANK_PAGE}&offset=${offset}`, { headers: headers() });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const page = await res.json();
  if (!Array.isArray(page)) throw new Error('bad payload');
  return page;
}

export async function getBankList() {
  if (!usable()) return null;
  try {
    const head = await fetch(`${AUTH_CONFIG.url}/rest/v1/words?select=id,word,meta&order=id&limit=${BANK_PAGE}&offset=0`, { headers: { ...headers(), Prefer: 'count=exact' } });
    if (!head.ok) throw new Error('HTTP ' + head.status);
    const first = await head.json();
    if (!Array.isArray(first)) throw new Error('bad payload');
    const total = Number((head.headers.get('content-range') || '').split('/').pop());
    if (!total) {
      const rows = [...first];
      for (let offset = BANK_PAGE; ; offset += BANK_PAGE) {
        const page = await bankPage(offset);
        rows.push(...page);
        if (page.length < BANK_PAGE) break;
      }
      return rows;
    }
    const rest = [];
    for (let offset = BANK_PAGE; offset < total; offset += BANK_PAGE) rest.push(bankPage(offset));
    return first.concat(...await Promise.all(rest));
  } catch (err) { console.warn('plan-api: bank list load failed:', err); return null; }
}

export async function revalidateBank(cached) {
  if (!usable() || !cached) return null;
  try {
    const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/words?select=id&order=id.desc&limit=1`, { headers: { ...headers(), Prefer: 'count=exact' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const v = Array.isArray(rows) ? `${Number((res.headers.get('content-range') || '').split('/').pop())}:${rows[0]?.id}` : null;
    if (v && v === cached.v && Date.now() - (cached.t || 0) < BANK_TTL) return null;
  } catch { return null; }
  const fresh = await getBankList();
  if (!fresh?.length) return null;
  saveBankCache(fresh);
  return fresh;
}

export async function getWordClips(word) {
  if (!usable() || !word) return null;
  try {
    const res = await fetch(`${AUTH_CONFIG.url}/rest/v1/rpc/word_clips`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ w: word })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const clips = await res.json();
    return Array.isArray(clips) ? clips : null;
  } catch (err) { console.warn('plan-api: word clips load failed:', err); return null; }
}
