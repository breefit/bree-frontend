import fs from "fs";
import path from "path";
import { getApiErrorMessage } from "./api";

const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

const apiSource = read("./api.js");
const authSource = read("../context/AuthContext.js");
const trackingSource = read("../pages/OrderTracking.js");
const appSource = read("../App.js");
const routesSource = read(
  "../../../bree-backend/src/routes/index.js",
);
const orderControllerSource = read(
  "../../../bree-backend/src/controllers/orderController.js",
);

describe("public tracking request stability", () => {
  test("tracking page uses the public optionalAuth endpoints", () => {
    expect(trackingSource).toContain("/api/orders/${id}/live-tracking");
    expect(trackingSource).toContain("${API}/orders/${id}/tracking");
    // The admin-only endpoint must never be CALLED from the public page
    // (comments mentioning the old endpoint are fine; axios calls are not).
    expect(trackingSource).not.toMatch(
      /axios\.get\([^)]*\/api\/shipping\/track/,
    );
  });

  test("order 401s are no longer classified as session expiry", () => {
    // The refresh/auth:expired trigger list must stay narrow: profile and
    // addresses only. `/api/orders` 401s must resolve locally.
    expect(apiSource).not.toMatch(
      /logoutPaths\s*=\s*\[[^\]]*"\/api\/orders"/,
    );
    expect(apiSource).toContain('"/api/profile"');
    expect(apiSource).toContain('"/api/addresses"');
  });

  test("verify 401s are short-circuited in the interceptor", () => {
    // The interceptor must reject verify 401s directly, without triggering
    // the refresh/auth:expired flow.
    expect(apiSource).toContain('const isVerifyCall =');
    expect(apiSource).toMatch(
      /if \(isVerifyCall\) \{\s*\n\s*return Promise\.reject\(error\);/,
    );
  });

  test("checkAuth dedupes concurrent verify calls", () => {
    expect(authSource).toContain("authCheckPromiseRef");
    expect(authSource).toContain('axios.get("/api/auth/verify")');
  });

  test("auth:expired handler does not toggle loading (no unmount storm)", () => {
    const expiryHandler = authSource.slice(
      authSource.indexOf("const handleAuthExpired"),
      authSource.indexOf("const handleStorageEvent"),
    );
    expect(expiryHandler).not.toContain("setLoading(true)");
  });

  test("polling uses one stable interval with in-flight guard", () => {
    // Interval must NOT depend on liveTracking (that recreated it on every
    // response).
    expect(trackingSource).toMatch(
      /\}, \[id, fetchLiveTracking\]\);\s*\n\s*if \(loading\)/,
    );
    // Poll guard must exist and the tick must check terminal status.
    expect(trackingSource).toContain("inFlightLiveTrackingRef");
    expect(trackingSource).toContain("isTerminalStatus(current.trackingStatus)");
    expect(trackingSource).toContain("current.isTerminal === true");
  });

  test("socket handler identity is stable (no per-render resubscribe)", () => {
    expect(trackingSource).toContain("handleOrderSocketUpdate");
    expect(trackingSource).toContain("useOrdersSync(handleOrderSocketUpdate)");
    expect(trackingSource).toMatch(
      /const handleOrderSocketUpdate = useCallback/,
    );
  });

  test("backend tracking endpoints use optionalAuth, not auth/adminAuth", () => {
    expect(routesSource).toContain('orderRouter.get("/:id/tracking", optionalAuth, getOrderTracking)');
    expect(routesSource).toContain(
      'orderRouter.get("/:id/live-tracking", optionalAuth, getOrderLiveTracking)',
    );
  });

  test("429 responses still map to a terminal user-facing message", () => {
    expect(getApiErrorMessage({ response: { status: 429, data: {} } })).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });

  test("tracking page renders without waiting on the global auth check", () => {
    // AppRouter must not gate the public tracking route behind `loading`
    // (the /api/auth/verify round-trip) — otherwise a slow/blocked verify
    // call (WhatsApp in-app browser, weak mobile network) stalls the page
    // for logged-out visitors who never needed auth in the first place.
    expect(appSource).toContain("isPublicTrackingPath");
    expect(appSource).toMatch(
      /if \(loading && !isPublicTrackingPath\(location\.pathname\)\)/,
    );
    // The route itself must stay outside ProtectedRoute.
    expect(appSource).toMatch(
      /<Route path="\/order\/:id\/tracking" element=\{<OrderTracking \/>\} \/>/,
    );
  });

  test("the public tracking query is not restricted to the order's owner", () => {
    // FIX (root cause): optionalAuth alone doesn't make tracking public —
    // for a logged-out visitor (or the account owner on a device where
    // they aren't signed in), req.user is undefined, so the query's old
    // `WHERE o.id = ? AND (o.user_id = ? OR o.user_id IS NULL)` only ever
    // matched TRUE guest-checkout orders. Any order placed while signed in
    // (almost every real order) has a real user_id, so that visitor got
    // zero rows back and a false "Order not found" — the exact symptom
    // reported. The order id is a UUID (validateOrderId/isValidUUID) —
    // unguessable, same access model as a courier's public track-by-AWB
    // page — so it alone is the correct credential here.
    const getOrderTrackingSource = orderControllerSource.slice(
      orderControllerSource.indexOf("export const getOrderTracking"),
      orderControllerSource.indexOf("export const getOrderLiveTracking"),
    );
    expect(getOrderTrackingSource).not.toMatch(
      /user_id = \?|o\.user_id = \?/,
    );
    expect(getOrderTrackingSource).toMatch(/WHERE o\.id = \?[`\s]/);

    const getOrderLiveTrackingSource = orderControllerSource.slice(
      orderControllerSource.indexOf("export const getOrderLiveTracking"),
    );
    expect(getOrderLiveTrackingSource).not.toMatch(/user_id = \?/);
    expect(getOrderLiveTrackingSource).toMatch(/WHERE id = \?[`\s]/);
  });

  test("the now-public tracking endpoints never select credentials/secrets — an unguessable order id is not a pass to internal data", () => {
    const getOrderTrackingSource = orderControllerSource.slice(
      orderControllerSource.indexOf("export const getOrderTracking"),
      orderControllerSource.indexOf("export const getOrderLiveTracking"),
    );
    const getOrderLiveTrackingSource = orderControllerSource.slice(
      orderControllerSource.indexOf("export const getOrderLiveTracking"),
    );
    for (const source of [getOrderTrackingSource, getOrderLiveTrackingSource]) {
      expect(source).not.toMatch(/password/i);
      expect(source).not.toMatch(/\botp\b/i);
      expect(source).not.toMatch(/razorpay_key|api_key|api_secret/i);
      expect(source).not.toMatch(/\btoken\b/i);
      expect(source).not.toMatch(/is_admin|admin_/i);
    }
  });

  test("the authenticated order-detail endpoint (getOrder) keeps its ownership check — only the public tracking endpoints changed", () => {
    // Scope guard: this must stay protected so /profile-style order detail
    // views (and any other caller of GET /api/orders/:id) never leak one
    // customer's order to another logged-in customer just by guessing/
    // reusing an id. Only getOrderTracking / getOrderLiveTracking became
    // ownership-free.
    const getOrderSource = orderControllerSource.slice(
      orderControllerSource.indexOf("export const getOrder = async"),
      orderControllerSource.indexOf("export const getOrderHistory"),
    );
    expect(getOrderSource).toMatch(
      /WHERE id = \? AND \(user_id = \? OR user_id IS NULL\)/,
    );
  });

  test("order history, my-orders, and checkout-success stay behind full auth — not optionalAuth", () => {
    expect(routesSource).toContain(
      'orderRouter.get("/:id/history", auth, getOrderHistory)',
    );
    expect(routesSource).toContain('orderRouter.get("/", auth, getMyOrders)');
    expect(routesSource).toContain(
      'orderRouter.get("/:id/success", auth, getOrderSuccess)',
    );
  });
});
