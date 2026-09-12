import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import axios from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import TrackingTimeline from "@/components/orders/TrackingTimeline";
import OrderTrackingCard from "@/components/orders/OrderTrackingCard";
import useOrdersSync from "@/hooks/useOrdersSync";

const getShippingDisplay = (order) => {
  const isFree =
    order?.is_free_shipping === true ||
    order?.is_free_shipping === 1 ||
    order?.isFreeShipping === true ||
    order?.isFreeShipping === 1;

  if (isFree) {
    return "Free";
  }

  if (order?.shipping != null && order.shipping !== "") {
    const charge = Number(order.shipping);
    return Number.isFinite(charge) && charge >= 0
      ? `₹${charge.toLocaleString("en-IN")}`
      : "Shipping information unavailable";
  }

  const hasCharge =
    order?.shipping_charge != null || order?.shippingCharge != null;

  if (!hasCharge) {
    return "Shipping information unavailable";
  }

  const charge = Number(order?.shipping_charge ?? order?.shippingCharge ?? 0);
  return Number.isFinite(charge) && charge >= 0
    ? `₹${charge.toLocaleString("en-IN")}`
    : "Shipping information unavailable";
};

const CUSTOMER_TIMELINE = [
  { status: "pending_payment", label: "Order Placed" },
  { status: "paid", label: "Paid" },
  { status: "processing", label: "Processing" },
  { status: "ready_to_ship", label: "Ready to Ship" },
  { status: "shipped", label: "Shipped" },
  { status: "out_for_delivery", label: "Out for Delivery" },
  { status: "delivered", label: "Delivered" },
];

const normalizeCustomerStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  return normalized === "pending" ? "pending_payment" : normalized;
};

const API = "/api";

// Live-tracking poll interval. The poll reads a DB snapshot (kept fresh by
// the Delhivery tracking cron), NOT the Delhivery API directly, so this is
// cheap and safe even for logged-out visitors. Deliberately aligned with the
// backend cron cadence (*/30 * * * *) — polling Delhivery-synced data faster
// than it can change is pure waste.
const LIVE_TRACKING_POLL_MS = 30000;

// Terminal Delhivery/order statuses after which the parcel cannot move and
// the poll timer is stopped entirely.
const TERMINAL_TRACKING_STATUSES = [
  "delivered",
  "cancelled",
  "returned",
  "rto",
  "damaged",
  "lost",
  "undelivered",
];

const normalizeStatusKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const isTerminalStatus = (value) =>
  TERMINAL_TRACKING_STATUSES.includes(normalizeStatusKey(value));

const OrderTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [liveTracking, setLiveTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [refreshingTracking, setRefreshingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState("");

  // FIX (tracking 429 root cause): in-flight request guards. The order
  // request is deduped (a socket update arriving while the initial fetch is
  // pending must not start a second identical request) and the live-tracking
  // poll is skipped while the previous poll is still pending (slow networks
  // previously stacked requests unboundedly). Guards are refs, not state, so
  // setting them never re-renders and never re-triggers effects.
  const inFlightOrderFetchRef = useRef(null);
  const inFlightLiveTrackingRef = useRef(null);
  const orderRequestTokenRef = useRef(0);
  const liveTrackingRequestTokenRef = useRef(0);

  // Mirror of `liveTracking` state for use inside stable callbacks. Declared
  // here (not next to the poll effect) so `fetchLiveTracking` can stay
  // dependency-stable — a poll response updating state must NOT change the
  // callback identities, or `fetch` would re-fire and recreate the loop.
  const liveTrackingRef = useRef(null);
  liveTrackingRef.current = liveTracking;

  const fetchLiveTracking = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!id) {
        setLiveTracking(null);
        setTrackingError("");
        return;
      }

      // Never stack identical polls — skip if one for THIS order is already
      // pending. (A pending poll for a DIFFERENT order id is allowed to be
      // superseded — its result is discarded below via the request token.)
      if (inFlightLiveTrackingRef.current === id) return;
      inFlightLiveTrackingRef.current = id;
      const requestToken = ++liveTrackingRequestTokenRef.current;

      if (showLoading) {
        setTrackingLoading(true);
      } else {
        setRefreshingTracking(true);
      }

      try {
        // Public DB-snapshot endpoint (optionalAuth). Logged-out customers
        // get the cron-synced Delhivery snapshot without any session, so the
        // old adminAuth /api/shipping/track/:awb 401-storm is gone.
        const res = await axios.get(`/api/orders/${id}/live-tracking`, {
          withCredentials: true,
        });
        if (requestToken === liveTrackingRequestTokenRef.current) {
          if (res.data?.liveTracking) {
            setLiveTracking(res.data.liveTracking);
            setTrackingError("");
          }
        }
      } catch (e) {
        // Transient failure: keep the last good snapshot on screen and stop
        // silently. NO retry loop — the interval simply tries again on its
        // next tick, and a terminal status disables polling downstream.
        console.error("Live tracking fetch failed", e?.response?.status);
        if (
          requestToken === liveTrackingRequestTokenRef.current &&
          !liveTrackingRef.current
        ) {
          setTrackingError("Tracking information is temporarily unavailable.");
        }
      } finally {
        if (requestToken === liveTrackingRequestTokenRef.current) {
          inFlightLiveTrackingRef.current = null;
          setTrackingLoading(false);
          setRefreshingTracking(false);
        }
      }
    },
    [id],
  );

  const fetch = useCallback(async () => {
    // Dedupe: one order request at a time for this order id.
    if (!id || inFlightOrderFetchRef.current === id) return;
    inFlightOrderFetchRef.current = id;
    const requestToken = ++orderRequestTokenRef.current;

    setLoading(true);

    try {
      // Public tracking endpoint (optionalAuth) — works with or without a
      // session. For logged-out visitors this resolves guest orders without
      // touching /api/auth/verify at all.
      const res = await axios.get(`${API}/orders/${id}/tracking`, {
        withCredentials: true,
      });

      // A newer fetch (id change / socket update) superseded this one —
      // discard its result instead of overwriting newer state.
      if (requestToken !== orderRequestTokenRef.current) return;

      if (res.data?.order) {
        setOrder(res.data.order);
        setTracking(res.data.history || []);
        const resolvedItems =
          (res.data.order?.items?.length ? res.data.order.items : null) ||
          (res.data.items?.length ? res.data.items : null) ||
          (res.data.orderItems?.length ? res.data.orderItems : null) ||
          [];
        setItems(resolvedItems);
        const resolvedAwb =
          res.data.order?.delhivery_awb ||
          res.data.order?.awbNumber ||
          res.data.order?.awb ||
          null;
        if (resolvedAwb) {
          await fetchLiveTracking({ showLoading: true });
        } else {
          setLiveTracking(null);
          setTrackingError("");
        }
        setError("");
      } else {
        setError("Order not found. Please verify the order ID and try again.");
      }
    } catch (e) {
      if (requestToken !== orderRequestTokenRef.current) return;
      console.error(e);
      setError(
        e?.response?.status === 404
          ? "Order not found. Please verify the order ID."
          : "Unable to load tracking details. Please try again later.",
      );
    } finally {
      // Only the newest request owns the guard + loading flag; a superseded
      // request must not clear the newer one's state.
      if (requestToken === orderRequestTokenRef.current) {
        inFlightOrderFetchRef.current = null;
        setLoading(false);
      }
    }
  }, [id, fetchLiveTracking]);

  // Initial + id-change fetch. `fetch` is stable per (id, fetchLiveTracking);
  // dedupe guard + request-id token prevent StrictMode double-mounts and
  // socket updates from stacking identical requests.
  useEffect(() => {
    fetch();
  }, [fetch]);

  // FIX (tracking 429 root cause): the socket handler identity is stable.
  // The inline callback here previously re-created a NEW function on every
  // render, and useOrdersSync re-subscribes whenever its callback identity
  // changes — so with `fetch`/`setLiveTracking` state updates forcing renders,
  // the page could churn through subscribe/unsubscribe cycles, and a queued
  // `order:updated` event during an unsubscribe gap re-fired `fetch()` while
  // the previous request was still in flight. The handler now reads latest
  // state via refs and never changes identity, so the subscription is bound
  // exactly once per mount.
  const orderIdRef = useRef(id);
  orderIdRef.current = id;
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  const handleOrderSocketUpdate = useCallback((updated) => {
    const currentOrderId = orderIdRef.current;
    if (!updated || String(updated.id) !== String(currentOrderId)) return;
    fetchRef.current();
  }, []);

  useOrdersSync(handleOrderSocketUpdate);

  const awbNumber =
    order?.delhivery_awb || order?.awbNumber || order?.awb || null;
  const hasAwb = Boolean(awbNumber && awbNumber !== "-");

  const steps = useMemo(() => {
    const timestamps = new Map();

    tracking.forEach((item) => {
      const status = normalizeCustomerStatus(item.new_status || item.status);
      if (
        CUSTOMER_TIMELINE.some((step) => step.status === status) &&
        !timestamps.has(status)
      ) {
        timestamps.set(status, item.created_at);
      }
    });

    if (!timestamps.has("pending_payment") && order?.created_at) {
      timestamps.set("pending_payment", order.created_at);
    }

    return CUSTOMER_TIMELINE.map((step) => ({
      id: `${step.status}-${order?.id}`,
      key: `${step.status}-${order?.id}`,
      status: step.status,
      label: step.label,
      timestamp: timestamps.get(step.status) || null,
    }));
  }, [tracking, order]);

  const customerCurrentStatus = useMemo(() => {
    const currentStatus = normalizeCustomerStatus(order?.order_status);
    if (CUSTOMER_TIMELINE.some((step) => step.status === currentStatus)) {
      return currentStatus;
    }

    for (let index = tracking.length - 1; index >= 0; index -= 1) {
      const historyStatus = normalizeCustomerStatus(
        tracking[index].new_status || tracking[index].status,
      );
      if (CUSTOMER_TIMELINE.some((step) => step.status === historyStatus)) {
        return historyStatus;
      }
    }

    return "pending_payment";
  }, [order, tracking]);

  const subtotal =
    order?.subtotal != null
      ? Number(order.subtotal)
      : items.reduce(
          (sum, item) =>
            sum +
            Number(item.product_price || item.price || 0) *
              Number(item.quantity || 1),
          0,
        );

  const total =
    order?.total != null
      ? Number(order.total)
      : order?.amount != null
        ? Number(order.amount)
        : subtotal;

  const shippingDisplay = getShippingDisplay(order);
  const reminders = Array.isArray(order?.reminders)
    ? order.reminders.filter(
        (reminder) =>
          reminder?.reminder_enabled === 1 ||
          reminder?.reminder_enabled === true,
      )
    : [];
  const reminderTotal = reminders.reduce(
    (sum, reminder) => sum + Number(reminder.reminder_price_paid || 0),
    0,
  );
  const hasEstimatedDelivery = Boolean(
    order?.estimated_delivery?.toString().trim(),
  );

  // FIX (tracking 429 root cause): single controlled poll timer.
  // The old effect depended on `liveTracking`, so EVERY poll response tore
  // down and recreated the interval (resetting its 30s cadence, and each
  // recreation closed over new state). It also polled the admin-only
  // /api/shipping/track/:awb which 401'd for logged-out users. Now:
  //   • the timer depends only on stable things (id + callbacks), so exactly
  //     ONE interval exists for the lifetime of the mount;
  //   • the terminal-status check moved INSIDE the tick, reading state via
  //     a ref, so a delivered/cancelled parcel simply stops ticking instead
  //     of re-arming the timer;
  //   • every tick calls fetchLiveTracking, whose in-flight guard skips the
  //     tick if the previous poll is still pending.
  //
  // Ticks are also skipped while the order has no AWB: nothing can move
  // until a shipment is created, and shipment creation always arrives via a
  // socket `order:updated` → refetch, so pre-shipment polls are pure waste.
  const hasAwbRef = useRef(false);
  hasAwbRef.current = hasAwb;

  useEffect(() => {
    if (!id) return undefined;

    const intervalId = window.setInterval(() => {
      if (!hasAwbRef.current) return;

      const current = liveTrackingRef.current;

      // Stop condition evaluated per tick: once the parcel reaches a
      // terminal status the interval drains to a no-op (and the next
      // order/tracking refresh clears `liveTracking` entirely).
      if (
        current &&
        (isTerminalStatus(current.trackingStatus) ||
          current.isTerminal === true)
      ) {
        return;
      }

      void fetchLiveTracking({ showLoading: false });
    }, LIVE_TRACKING_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [id, fetchLiveTracking]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-bree-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bree-bg px-6">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-premium border border-bree-border p-8 text-center">
          <h1 className="text-xl font-semibold text-bree-text-primary mb-3">
            Unable to load tracking details
          </h1>
          <p className="text-sm text-bree-text-secondary mb-6">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="inline-flex items-center justify-center rounded-full bg-bree-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-bree-primary-hover"
          >
            Back to profile
          </button>
        </div>
      </div>
    );
  }

  if (!order) return null;

  // FIX (Return/Refund audit, requirement 13): this panel is support-only —
  // it has never let the customer create a return shipment, and that stays
  // true here (no action added below beyond the existing contact links).
  // What was broken is that "contact within 48 hours" was static copy shown
  // for as long as the order stayed delivered with no return on file, even
  // long after the window had actually closed. Computed against the real
  // delivered_at now, mirroring the same formula the backend enforces
  // (isReturnWindowOpen() in returnController.js) — this is still only a
  // display concern; the backend independently re-verifies eligibility on
  // every admin action regardless of what this page shows.
  const RETURN_WINDOW_HOURS = 48;
  const returnDeadline = order?.delivered_at
    ? new Date(
        new Date(order.delivered_at).getTime() +
          RETURN_WINDOW_HOURS * 60 * 60 * 1000,
      )
    : null;
  const isReturnWindowOpen = Boolean(
    returnDeadline && Date.now() <= returnDeadline.getTime(),
  );

  const canShowReturnSupport =
    String(order?.order_status || "").toLowerCase() === "delivered" &&
    !order?.return_status;

  return (
    <div className="pt-24 pb-12 min-h-screen bg-bree-bg">
      <Helmet>
        <title>
          Track Order #{order.order_number || order.id?.slice(-8) || order.id} —
          BREE
        </title>
      </Helmet>

      <div className="max-w-5xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* ===== Modified: Order Timeline must always render =====
                Previously the OrderTrackingCard AND the Tracking Timeline
                were both gated behind `hasAwb`, so the timeline vanished
                entirely before shipment creation. Now only the live
                Delhivery card (which has nothing to show pre-shipment) is
                gated; the timeline itself renders unconditionally, sourced
                from `steps`, which already falls back to
                order_status_history when there's no live tracking data. */}
            {hasAwb ? (
              <OrderTrackingCard
                order={order}
                trackingData={liveTracking}
                trackingLoading={trackingLoading}
                trackingError={trackingError}
                refreshingTracking={refreshingTracking}
                onRefreshTracking={() =>
                  fetchLiveTracking({ showLoading: false })
                }
              />
            ) : (
              <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
                <h3 className="font-semibold text-bree-text-primary mb-2">
                  Shipment Tracking
                </h3>
                <p className="text-sm text-bree-text-secondary">
                  Shipment has not been created yet.
                </p>
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="font-semibold text-bree-text-primary">
                  Tracking Timeline
                </h3>
                {hasAwb && (
                  <button
                    type="button"
                    onClick={() =>
                      fetchLiveTracking({ showLoading: false })
                    }
                    disabled={refreshingTracking || trackingLoading}
                    className="inline-flex items-center gap-2 rounded-full border border-bree-border px-3 py-1.5 text-sm font-medium text-bree-text-primary hover:bg-bree-bg disabled:opacity-60"
                  >
                    {refreshingTracking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    Refresh Tracking
                  </button>
                )}
              </div>

              {trackingLoading && !liveTracking ? (
                <div className="text-sm text-bree-text-secondary">
                  Loading shipment tracking...
                </div>
              ) : trackingError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {trackingError}
                </div>
              ) : steps.length === 0 ? (
                <div className="text-sm text-bree-text-secondary">
                  No tracking updates available
                </div>
              ) : (
                <TrackingTimeline
                  steps={steps}
                  currentStatus={customerCurrentStatus}
                />
              )}
            </div>
            {/* ===== End Modified ===== */}

            <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
              <h3 className="font-semibold text-bree-text-primary mb-4">
                Shipping Address
              </h3>

              <div className="text-sm text-bree-text-secondary">
                <div className="font-medium text-bree-text-primary">
                  {order.contact_name || order.customer_name}
                </div>

                <div className="mt-1">
                  {order.contact_email || order.email || order.mobile_number}
                </div>

                <div className="mt-2 text-sm">
                  {order.shipping_address ||
                    order.address_snapshot ||
                    order.shippingAddress ||
                    ""}
                </div>
              </div>
            </div>

            {canShowReturnSupport && (
              <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
                <h3 className="font-semibold text-bree-text-primary mb-3">
                  Returns & Support
                </h3>

                {!order?.delivered_at ? (
                  <p className="text-sm text-bree-text-secondary leading-6">
                    If you received a damaged, incorrect, or defective product,
                    please contact <strong>BREE Support</strong> within{" "}
                    <strong>48 hours of delivery</strong>. Our support team will
                    verify your request and, if approved, arrange a return
                    pickup.
                  </p>
                ) : isReturnWindowOpen ? (
                  <p className="text-sm text-bree-text-secondary leading-6">
                    Return requests must be raised within{" "}
                    <strong>48 hours of delivery</strong>.{" "}
                    <span className="font-medium text-emerald-700">
                      Your return window is currently open.
                    </span>{" "}
                    If you received a damaged, incorrect, or defective product,
                    please contact <strong>BREE Support</strong> — our team will
                    verify your request and, if approved, arrange a return
                    pickup.
                  </p>
                ) : (
                  <p className="text-sm text-bree-text-secondary leading-6">
                    <span className="font-medium text-red-600">
                      Return window expired.
                    </span>{" "}
                    Return requests must be raised within 48 hours of delivery.
                  </p>
                )}

                {/* FIX (requirement 13): once the window has closed, this
                    panel stops presenting itself as an active return path —
                    no quick-action tiles, no "keep photos ready" prompt. The
                    customer can still reach general support via the site's
                    normal navigation; this panel just no longer implies a
                    return is still possible from here. */}
                {(isReturnWindowOpen || !order?.delivered_at) && (
                  <>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <a
                        href="https://wa.me/+919876543210"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-green-200 bg-green-50 p-4 text-center hover:bg-green-100 transition"
                      >
                        📱 WhatsApp
                      </a>

                      <a
                        href="mailto:care@breefit.in"
                        className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center hover:bg-blue-100 transition"
                      >
                        📧 Email
                      </a>

                      <Link
                        to="/contact"
                        className="rounded-xl border border-bree-border bg-bree-bg p-4 text-center hover:bg-white transition"
                      >
                        📞 Contact Support
                      </Link>
                    </div>

                    <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-xs text-blue-700">
                        Please keep your Order ID and photos/videos ready while
                        contacting support. This helps us verify your request
                        faster.
                      </p>
                    </div>

                    <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4">
                      <p className="text-xs text-amber-700">
                        Returns are accepted only after verification by the BREE
                        Support team. If approved, BREE will arrange the return
                        pickup.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
              <h4 className="text-sm text-bree-text-secondary mb-3">
                Order Items
              </h4>

              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="text-sm text-bree-text-secondary">
                    No items found
                  </div>
                ) : (
                  items.map((it) => (
                    <div
                      key={it.id || it.product_id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {it.product_image || it.image ? (
                          <img
                            src={it.product_image || it.image}
                            alt={it.product_name || it.name}
                            className="w-12 h-12 rounded-md object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "/images/product-placeholder.png";
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center text-xs text-gray-500">
                            No Image
                          </div>
                        )}

                        <div>
                          <div className="text-sm font-medium text-bree-text-primary">
                            {it.product_name || it.name}
                          </div>

                          <div className="text-xs text-bree-text-secondary">
                            Qty: {it.quantity}
                          </div>
                        </div>
                      </div>

                      <div className="text-sm font-medium">
                        ₹
                        {Number(
                          it.product_price || it.price || it.subtotal || 0,
                        ).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
              <h4 className="text-sm text-bree-text-secondary mb-3">
                Order Summary
              </h4>

              <div className="text-sm text-bree-text-secondary">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{Number(subtotal).toLocaleString()}</span>
                </div>

                {reminders.length > 0 && (
                  <div className="flex justify-between mt-2">
                    <span>WhatsApp Reminder</span>
                    <span>
                      {reminderTotal > 0
                        ? `₹${reminderTotal.toLocaleString()}`
                        : "Added"}
                    </span>
                  </div>
                )}

                <div className="flex justify-between mt-2">
                  <span>Shipping</span>
                  <span className="text-green-600 font-medium">
                    {shippingDisplay}
                  </span>
                </div>

                {hasEstimatedDelivery && (
                  <div className="flex justify-between mt-2">
                    <span>Estimated Delivery</span>
                    <span className="text-bree-text-primary font-medium">
                      {order.estimated_delivery}
                    </span>
                  </div>
                )}

                <div className="flex justify-between mt-2 font-semibold">
                  <span>Total</span>
                  <span>₹{Number(total).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default OrderTracking;
