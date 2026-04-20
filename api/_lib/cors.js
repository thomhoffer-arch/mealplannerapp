// Handle CORS preflight + attach permissive CORS headers for same-origin
// API calls that browsers nonetheless treat as "non-simple" (POST with
// application/json + custom headers like Authorization / X-Household-Id).
//
// In theory our PWA calls are same-origin and no preflight is sent. In
// practice, iOS Safari PWA contexts and Vercel's preview subdomains can
// produce cross-origin OPTIONS requests that hit our handlers. Without
// this helper the handlers return 405 on preflight, the browser blocks
// the real request, and the user sees spurious 405s on POST + empty
// responses on authenticated GET.
//
// Usage at the top of every /api/* handler:
//
//   if (applyCors(req, res)) return;
//
// Returns true when the request was fully handled (OPTIONS preflight);
// the caller must stop. Returns false otherwise — headers have been set
// and the caller continues as normal.
export function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Household-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
