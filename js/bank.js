import { AUTH_CONFIG } from './config.js?v=staging-0f52a63';
import { getWordClips } from './plan-api.js?v=staging-0f52a63';
import { store, useClip, expand } from './util.js?v=staging-0f52a63';

export { useClip };

export let ALL = [];
export let DATA = [];
let resolveBankReady = () => {};
export const bankReady = new Promise(r => { resolveBankReady = r; });
export function setAll(list) { ALL = list; if (Array.isArray(ALL)) ALL.forEach((e, i) => { e.no = i + 1; }); resolveBankReady(); }
export function setData(list) { DATA = list; }

export const state = { dict: store.get('stw.dict', 'all'), cur: 0, loop: false, shuffle: store.get('stw.shuffle', false), done: new Set(store.get('stw.done', [])), fav: new Set(store.get('stw.fav', [])), started: false };

const GUEST = !!AUTH_CONFIG.url && !!AUTH_CONFIG.anonKey && !localStorage.getItem('stw.auth.session') && localStorage.getItem('stw.onboard') !== 'user';
document.body.classList.toggle('guest', GUEST);
export let trial = GUEST;
export function setTrial(v) { trial = v; }
export const trialMeta = { count: 0 };

export const inDict = (e, d) => d === 'all' || (d === 'fav' ? state.fav.has(e.word) : e.tags.includes(d));
export const idxOf = w => DATA.findIndex(e => e.word === w);

export function fromMeta(row) {
  const { c0, ...e } = row.meta;
  Object.assign(e, { ci: 0, title: c0.title, artist: c0.artist, art: expand(c0.art),
    preview: expand(c0.preview), appleUrl: expand(c0.appleUrl), form: c0.form, formNote: c0.formNote });
  return e;
}

export function stubify(e) {
  e.nclips = e.clips.length;
  e.artists = [...new Set(e.clips.map(c => c.artist))];
  e.clipTitles = e.clips.map(c => ({ t: c.title, a: c.artist }));
}

export function ensureDetail(e) {
  if (e.clips) return Promise.resolve(e);
  if (!e._d) e._d = getWordClips(e.word).then(clips => {
    if (!clips) throw new Error('no clips: ' + e.word);
    for (const c of clips) { c.preview = expand(c.preview); c.art = expand(c.art); c.appleUrl = expand(c.appleUrl); }
    e.clips = clips;
    useClip(e, e.ci || 0);
    return e;
  }).catch(err => { e._d = null; throw err; });
  return e._d;
}
