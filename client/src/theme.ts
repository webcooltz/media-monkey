// Per-profile accent colours. Defaults match the logo (blue + yellow).
export const DEFAULT_PRIMARY = '#0165f1';
export const DEFAULT_SECONDARY = '#fdc603';

const CACHE_KEY = 'mm_theme';
const HEX = /^#[0-9a-f]{6}$/i;

function setVar(name: string, value: string | null | undefined, fallback: string) {
  const root = document.documentElement.style;
  if (value && HEX.test(value) && value.toLowerCase() !== fallback) root.setProperty(name, value);
  else root.removeProperty(name);
}

/** Apply a profile's colours to the whole UI (null = built-in defaults). */
export function applyTheme(primary?: string | null, secondary?: string | null, { cache = true } = {}) {
  setVar('--accent', primary, DEFAULT_PRIMARY);
  setVar('--accent-2', secondary, DEFAULT_SECONDARY);
  if (!cache) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ primary: primary ?? null, secondary: secondary ?? null }));
  } catch { /* storage unavailable */ }
}

/** Re-apply the last theme synchronously at startup so there's no colour flash. */
export function loadCachedTheme() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const { primary, secondary } = JSON.parse(raw);
    applyTheme(primary, secondary, { cache: false });
  } catch { /* ignore */ }
}
