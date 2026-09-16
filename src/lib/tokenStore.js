// FIX (ISSUE-008 — JWT tokens stored in localStorage): both the customer
// access token and the admin token used to be written to `localStorage`
// (bree_access_token / bree_admin_token) in addition to the correctly-
// configured httpOnly cookies — any XSS anywhere in the SPA could read
// either and, since localStorage persists to disk, exfiltrate a token
// good for up to 7 days (30 for the refresh/session) or, for the admin
// token, full admin access for up to 7 days. The blast radius was largest
// for the admin token.
//
// Why not just delete this and rely on the cookie alone: the localStorage
// copy was a deliberate, documented workaround (see lib/api.js's original
// "SAFARI FIX" comment) for a real WebKit quirk — a cookie set by a
// cross-site XHR/fetch response (login, register, Google auth; this app's
// frontend and backend are configured to support genuinely different
// origins — see app.js's FRONTEND_URL comment allowing e.g. a Vercel
// preview domain — so cookies are necessarily SameSite=None, the category
// Safari's ITP is strictest about) is not always available to the very
// next request fired immediately after, even though the cookie itself is
// configured correctly. Blindly removing the client-side fallback risks
// silently reintroducing that exact bug on Safari/iOS — a huge share of
// mobile checkout traffic — with no way to verify the fix from this
// (non-Safari, non-device) environment.
//
// The fix: keep the same "attach the token as an Authorization header so
// the request succeeds even if the cookie hasn't landed yet" mechanism,
// but hold the token in memory only (a plain module-scope variable) —
// never written to localStorage/sessionStorage/disk. This closes the
// Safari race exactly as before (the token is available synchronously to
// the request interceptor the instant login resolves), while cutting the
// exposure window from "up to 7 days, readable by any XSS, from disk" down
// to "until this tab is closed or reloaded, in memory only" — the same
// class of improvement recommended for exactly this trade-off. A page
// reload loses the in-memory copy; both AuthContext and AdminAuthContext
// already re-establish `user`/`admin` state on every mount via the
// httpOnly cookie alone (GET /api/auth/verify, GET /api/admin/me) — see
// each context's own mount effect — so a reload was never actually
// dependent on this in-memory value to begin with.
let accessToken = null;
let adminToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token || null;
};
export const clearAccessToken = () => {
  accessToken = null;
};

export const getAdminToken = () => adminToken;
export const setAdminToken = (token) => {
  adminToken = token || null;
};
export const clearAdminToken = () => {
  adminToken = null;
};
