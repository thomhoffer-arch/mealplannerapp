import { supabase } from './supabase';

const ACTIVE_HOUSEHOLD_KEY = 'mp:active_household_id';
const HOUSEHOLD_CHANGE_EVENT = 'mp:active-household-change';

export function getActiveHouseholdId() {
  try {
    return localStorage.getItem(ACTIVE_HOUSEHOLD_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveHouseholdId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, id);
    else localStorage.removeItem(ACTIVE_HOUSEHOLD_KEY);
    window.dispatchEvent(new CustomEvent(HOUSEHOLD_CHANGE_EVENT, { detail: { id } }));
  } catch {
    /* localStorage may be unavailable in some environments */
  }
}

export function onActiveHouseholdChange(handler) {
  window.addEventListener(HOUSEHOLD_CHANGE_EVENT, handler);
  return () => window.removeEventListener(HOUSEHOLD_CHANGE_EVENT, handler);
}

async function readToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function refreshToken() {
  const { data: { session } } = await supabase.auth.refreshSession();
  return session?.access_token || null;
}

function buildHeaders(token, householdId, extra) {
  const h = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  if (householdId) h['X-Household-Id'] = householdId;
  return h;
}

async function parse(res) {
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch {
    throw new Error(`Server error ${res.status}: ${raw.slice(0, 300) || '(empty response)'}`);
  }
  if (!res.ok) {
    const err = new Error(data.error || `Server error ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

// Authenticated fetch to /api/* endpoints. Auto-attaches the user's bearer
// token and the active household id. On 401 (typically a stale token in a
// long-idle tab) it refreshes the session once and retries.
//
//   const data = await apiFetch('/api/ai/suggest-week', {
//     method: 'POST',
//     body: { weeks: 1 },
//   });
//
// `body` may be an object (auto-stringified) or a string.
export async function apiFetch(path, { method = 'GET', body, headers, householdId } = {}) {
  const hid = householdId !== undefined ? householdId : getActiveHouseholdId();
  const init = {
    method,
    headers: buildHeaders(await readToken(), hid, headers),
  };
  if (body !== undefined) {
    if (typeof body === 'string') {
      init.body = body;
    } else {
      // Use a replacer to silently drop functions and cyclic references so a
      // bad recipe object never causes an unhandled serialization crash.
      const seen = new WeakSet();
      init.body = JSON.stringify(body, (_k, v) => {
        if (typeof v === 'function') return undefined;
        if (v !== null && typeof v === 'object') {
          if (seen.has(v)) return undefined;
          seen.add(v);
        }
        return v;
      });
    }
  }

  let res = await fetch(path, init);
  if (res.status === 401) {
    const fresh = await refreshToken();
    if (fresh) {
      init.headers = buildHeaders(fresh, hid, headers);
      res = await fetch(path, init);
    }
  }
  return parse(res);
}
