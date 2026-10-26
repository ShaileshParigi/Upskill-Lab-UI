import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { PROGRESS_FILE } from '../config.js';

const EMPTY = { completed: {}, activity: {}, lastOpened: null, bookmarks: [], version: 1 };

let state = load();
let writeTimer = null;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    return { ...EMPTY, ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    const tmp = `${PROGRESS_FILE}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fsp.rename(tmp, PROGRESS_FILE);
  }, 200);
}

/** Local (not UTC) YYYY-MM-DD — a learning day ends at your midnight, not London's. */
export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Record an activity event for today's bucket. */
export function track(kind, meta = {}) {
  const key = today();
  const bucket = (state.activity[key] ||= { reads: 0, runs: 0, writes: 0, asks: 0, minutes: 0 });
  if (kind in bucket) bucket[kind] += 1;
  if (meta.minutes) bucket.minutes += meta.minutes;
  if (meta.path && kind === 'reads') state.lastOpened = meta.path;
  persist();
  return bucket;
}

export function setCompleted(path, done) {
  if (done) {
    state.completed[path] = { at: new Date().toISOString(), date: today() };
  } else {
    delete state.completed[path];
  }
  persist();
  return state.completed[path] || null;
}

export function toggleBookmark(path) {
  const i = state.bookmarks.indexOf(path);
  if (i === -1) state.bookmarks.push(path);
  else state.bookmarks.splice(i, 1);
  persist();
  return i === -1;
}

/**
 * Consecutive days with any activity, counting back from today.
 * Today not yet active doesn't break the streak — yesterday anchors it.
 */
export function computeStreak() {
  const active = (k) => {
    const a = state.activity[k];
    return !!a && !!(a.reads || a.runs || a.writes || a.asks);
  };

  let start = 0;
  if (!active(dayKey(0))) {
    if (!active(dayKey(1))) return { current: 0, best: bestStreak(), activeToday: false };
    start = 1;
  }

  let current = 0;
  for (let i = start; i < 400; i++) {
    if (active(dayKey(i))) current++;
    else break;
  }
  return { current, best: Math.max(current, bestStreak()), activeToday: active(dayKey(0)) };
}

function bestStreak() {
  const days = Object.keys(state.activity)
    .filter((k) => {
      const a = state.activity[k];
      return a.reads || a.runs || a.writes || a.asks;
    })
    .sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    if (prev) {
      const gap = (new Date(d) - new Date(prev)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Last `days` calendar days, oldest first — powers the heatmap. */
export function heatmap(days = 119) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(i);
    const a = state.activity[key] || {};
    const score = (a.reads || 0) + (a.runs || 0) + (a.writes || 0) * 2 + (a.asks || 0);
    out.push({ date: key, score, ...a });
  }
  return out;
}

export function snapshot() {
  return {
    completed: state.completed,
    bookmarks: state.bookmarks,
    lastOpened: state.lastOpened,
    streak: computeStreak(),
    heatmap: heatmap(),
    todayActivity: state.activity[today()] || { reads: 0, runs: 0, writes: 0, asks: 0, minutes: 0 },
  };
}
