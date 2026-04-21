// Multi-window rate limiting for AI endpoints.
//
// Three overlapping windows stop different abuse patterns:
//   5s  / 2  — prevents scripted bursts (>2 req/s is machine behaviour)
//   60s / 5  — blocks sustained rapid firing even if burst check is scraped around
//   1h  / 25 — daily-session cap well above any real usage (~3-5 calls per session)
//
// Limits are applied to ALL households regardless of whether they use a shared
// key or their own key — rate protection isn't a billing concern, it's abuse
// prevention.
//
// The atomic RPC (increment_ai_rate_limit) does INSERT ON CONFLICT UPDATE RETURNING
// in a single DB round-trip, eliminating the read-then-write race condition that
// the weekly usage check has. If the RPC isn't available yet (table not migrated),
// checks fail open so the app keeps working.

const WINDOWS = [
  // [windowSeconds, maxRequests, humanLabel]
  [5,    2,  '2 requests per 5 seconds'],
  [60,   5,  '5 requests per minute'],
  [3600, 25, '25 requests per hour'],
];

function bucketKey(windowSeconds) {
  return `${windowSeconds}_${Math.floor(Date.now() / (windowSeconds * 1000))}`;
}

// Returns a user-facing error string if the household is rate limited, or null if OK.
// Short-circuits on the first exceeded window.
export async function checkRateLimits(supabase, householdId) {
  if (process.env.DISABLE_AI_LIMIT === '1' || process.env.DISABLE_AI_LIMIT === 'true') {
    return null;
  }

  for (const [windowSecs, maxReqs, label] of WINDOWS) {
    const key = bucketKey(windowSecs);
    let newCount;
    try {
      const { data, error } = await supabase.rpc('increment_ai_rate_limit', {
        p_household_id: householdId,
        p_window_key: key,
      });
      if (error) {
        // Migration not yet applied — fail open, don't block the request.
        console.warn('[rate-limit] RPC unavailable, skipping rate check:', error.message);
        return null;
      }
      newCount = data;
    } catch (err) {
      console.warn('[rate-limit] unexpected error, skipping:', err.message);
      return null;
    }

    if (newCount > maxReqs) {
      return `Too many requests (${label}). Please slow down.`;
    }
  }

  return null;
}
