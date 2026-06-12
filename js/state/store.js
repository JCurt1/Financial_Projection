import { DEFAULT_STATE } from './defaults.js';

const STORAGE_KEY = 'fcc_state_v1';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Only keep keys that exist in DEFAULT_STATE to avoid stale/unknown keys
    return Object.fromEntries(
      Object.entries(parsed).filter(([k]) => k in DEFAULT_STATE)
    );
  } catch {
    return {};
  }
}

function persistState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage quota exceeded or private browsing — fail silently
  }
}

let state = { ...DEFAULT_STATE, ...loadPersistedState() };
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(partial) {
  state = { ...state, ...partial };
  persistState(state);
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(state));
}

// Expose a reset helper for the optional "Clear saved data" button
export function resetState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* empty */ }
  state = { ...DEFAULT_STATE };
  notify();
}
