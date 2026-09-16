import React from "react";
import { getStatusLabel, STATUS_BADGE_CLASSES } from "./orderStatus";

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

// ===== Added: Delhivery shipping details helpers =====
// Reads the first present value across several known key variants for a
// given field, so this component works regardless of whether the parent
// passes snake_case (backend) or camelCase (API response) shaped props.
// Returns "-" (never crashes) when nothing is found.
const getField = (order, keys) => {
  for (const key of keys) {
    const value = order?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "-";
};

// Formats a date-like value with toLocaleString("en-IN"), falling back to
// "-" for missing/invalid values instead of throwing.
const formatTrackingDate = (order, keys) => {
  const raw = getField(order, keys);
  if (raw === "-") return "-";
  const parsed = new Date(raw);
  return !isNaN(parsed) ? parsed.toLocaleString("en-IN") : "-";
};

// ===== Modified =====
// Build a case-insensitive lookup of the existing STATUS_BADGE_CLASSES so
// we can reuse it for tracking statuses too (e.g. "delivered", "cancelled")
// instead of maintaining a second, duplicate badge system.
const NORMALIZED_STATUS_BADGE_CLASSES = Object.keys(
  STATUS_BADGE_CLASSES,
).reduce((acc, key) => {
  acc[key.toLowerCase()] = STATUS_BADGE_CLASSES[key];
  return acc;
}, {});

// Only Delhivery-specific tracking statuses that have no equivalent in
// STATUS_BADGE_CLASSES get their own mapping here.
const DELHIVERY_ONLY_BADGE_CLASSES = {
  manifested: "bg-blue-100 text-blue-700 border-blue-200",
  "in transit": "bg-purple-100 text-purple-700 border-purple-200",
  "out for delivery": "bg-orange-100 text-orange-700 border-orange-200",
};

const DEFAULT_BADGE_CLASS = "bg-gray-100 text-gray-700 border-gray-200";

// FIX (Medium #18 — Phase 3): raw Delhivery courier jargon (Manifested,
// Bagged, Reached Destination Hub, etc.) used to be shown to customers
// verbatim — internal courier-operations terminology a customer has no
// context for. Maps every raw status this app has been seen to receive
// (see cron/shippingTrackingCron.js's status handling and
// STATUS_BADGE_CLASSES/DELHIVERY_ONLY_BADGE_CLASSES above) to a clean,
// customer-facing label; anything not in this map falls back to the raw
// value rather than hiding it, so an unmapped future Delhivery status
// still shows SOMETHING instead of silently disappearing.
const DELHIVERY_STATUS_LABELS = {
  manifested: "Order Received by Courier",
  "not picked": "Awaiting Pickup",
  "pickup scheduled": "Pickup Scheduled",
  bagged: "Preparing for Dispatch",
  dispatched: "Dispatched",
  "in transit": "In Transit",
  "reached destination hub": "Arrived at Local Facility",
  "out for delivery": "Out for Delivery",
  delivered: "Delivered",
  rto: "Returned to Sender",
  "rto delivered": "Returned to Sender",
  cancelled: "Cancelled",
  pending: "Pending",
};

const getCustomerFacingTrackingLabel = (status) => {
  if (!status || status === "-") return "Unknown";
  const normalized = String(status).trim().toLowerCase();
  return DELHIVERY_STATUS_LABELS[normalized] || status;
};

// Always returns a class - never null - so the badge can always be shown.
// Order of precedence: existing STATUS_BADGE_CLASSES -> Delhivery-only map
// -> neutral gray default (covers "-"/unknown statuses too).
const getTrackingBadgeClass = (status) => {
  if (!status || status === "-") return DEFAULT_BADGE_CLASS;
  const normalized = String(status).trim().toLowerCase();
  return (
    NORMALIZED_STATUS_BADGE_CLASSES[normalized] ||
    DELHIVERY_ONLY_BADGE_CLASSES[normalized] ||
    DEFAULT_BADGE_CLASS
  );
};
// ===== End Modified =====
// ===== End Added =====

// Card showing order header and summary
const OrderTrackingCard = ({
  order,
  trackingData = null,
  trackingLoading = false,
  trackingError = "",
  refreshingTracking = false,
  onRefreshTracking,
}) => {
  const statusKey = order.status || order.order_status || "pending";
  const badgeClass =
    STATUS_BADGE_CLASSES[statusKey] ||
    "bg-gray-100 text-gray-700 border-gray-200";

  const orderDateValue =
    order.created_at || order.order_date || order.createdAt || null;
  const parsedOrderDate = orderDateValue ? new Date(orderDateValue) : null;
  const orderDateString =
    parsedOrderDate instanceof Date && !isNaN(parsedOrderDate)
      ? parsedOrderDate.toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  // ===== Added: Delhivery shipping details =====
  const courier =
    trackingData?.courierName ||
    trackingData?.courier_name ||
    getField(order, ["courier_name", "courierName"]);
  const courierDisplay = courier === "-" ? "Delhivery" : courier;

  const awbNumber =
    trackingData?.awbNumber ||
    trackingData?.awb_number ||
    getField(order, ["delhivery_awb", "awb_number", "awbNumber", "awb"]);
  const trackingNumber = getField(order, [
    "delhivery_tracking_number",
    "tracking_number",
    "trackingNumber",
  ]);
  // FIX (Medium #18 — Phase 3): shipment_id/pickup_request_id are internal
  // Delhivery/ops handles with no customer meaning — used to be displayed
  // as their own "Shipment ID"/"Pickup Request ID" rows below. Removed
  // entirely from the customer-facing card rather than mapped/labeled,
  // since there's no customer-relevant translation of an internal courier
  // reference id (unlike the AWB/tracking number, which the customer can
  // actually use to track their package themselves).
  const trackingStatus =
    trackingData?.trackingStatus ||
    trackingData?.status ||
    getField(order, ["tracking_status", "trackingStatus"]);
  const currentLocation =
    trackingData?.currentLocation ||
    trackingData?.current_location ||
    getField(order, ["current_location", "currentLocation"]);
  const expectedDelivery =
    trackingData?.expectedDelivery ||
    formatTrackingDate(order, [
      "expected_delivery",
      "expectedDelivery",
      "expected_delivery_date",
    ]);
  const shipmentCreatedAt =
    trackingData?.lastUpdate ||
    formatTrackingDate(order, ["shipment_created_at", "shipmentCreatedAt"]);

  const trackingUrl =
    trackingData?.trackingUrl ||
    trackingData?.tracking_url ||
    getField(order, ["tracking_url", "trackingUrl"]);

  // ===== Modified =====
  const trackingBadgeClass = getTrackingBadgeClass(trackingStatus);
  // FIX (Medium #18 — Phase 3): was the raw Delhivery status string
  // verbatim; now passed through the customer-facing label map above.
  const trackingStatusDisplay = getCustomerFacingTrackingLabel(trackingStatus);
  // ===== End Modified =====
  // ===== End Added =====

  return (
    <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-bree-text-secondary">Order Number</p>
          <h3 className="font-outfit text-lg font-semibold text-bree-text-primary">
            #{order.order_number || order.id}
          </h3>
          <p className="text-sm text-bree-text-secondary mt-1">
            {orderDateString || "Date unavailable"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-bree-text-secondary">Status</p>
          <div
            className={`mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${badgeClass}`}
          >
            <span>{getStatusLabel(statusKey)}</span>
          </div>
          <p className="text-xs text-bree-text-secondary mt-2">
            Payment:{" "}
            <span className="font-medium capitalize">
              {order.payment_status || "pending"}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="text-sm text-bree-text-secondary">
          <div>Subtotal</div>
          <div className="font-medium text-bree-text-primary">
            ₹{Number(order.subtotal ?? order.total ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="text-sm text-bree-text-secondary">
          <div>Shipping</div>
          <div className="text-green-600 font-medium">
            {getShippingDisplay(order)}
          </div>
        </div>
      </div>

      {/* ===== Added: Shipping Details section ===== */}
      <div className="mt-6 pt-4 border-t border-bree-border">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-bree-text-secondary uppercase tracking-wide font-medium">
            Shipping Details
          </p>
          {/* ===== Modified: badge is now always shown ===== */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${trackingBadgeClass}`}
          >
            <span>{trackingStatusDisplay}</span>
          </div>
          {/* ===== End Modified ===== */}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="text-sm text-bree-text-secondary">
            <div>Courier</div>
            <div className="font-medium text-bree-text-primary">
              {courierDisplay}
            </div>
          </div>
          {/* ===== Modified: added dedicated Tracking Status field ===== */}
          <div className="text-sm text-bree-text-secondary">
            <div>Tracking Status</div>
            <div className="font-medium text-bree-text-primary">
              {trackingStatusDisplay}
            </div>
          </div>
          {/* ===== End Modified ===== */}
          <div className="text-sm text-bree-text-secondary">
            <div>AWB Number</div>
            <div className="font-medium text-bree-text-primary">
              {awbNumber}
            </div>
          </div>
          <div className="text-sm text-bree-text-secondary">
            <div>Tracking Number</div>
            <div className="font-medium text-bree-text-primary">
              {trackingNumber}
            </div>
          </div>
          <div className="text-sm text-bree-text-secondary">
            <div>Current Location</div>
            <div className="font-medium text-bree-text-primary">
              {currentLocation}
            </div>
          </div>
          <div className="text-sm text-bree-text-secondary">
            <div>Expected Delivery</div>
            <div className="font-medium text-bree-text-primary">
              {expectedDelivery}
            </div>
          </div>
          <div className="text-sm text-bree-text-secondary">
            <div>Shipment Created At</div>
            <div className="font-medium text-bree-text-primary">
              {shipmentCreatedAt}
            </div>
          </div>
        </div>

        {/* FIX (ISSUE-006): "Download Shipping Label" used to call
          GET /api/shipping/label/:awb here, which is mounted behind
          adminAuth — a real customer never holds an admin token, so every
          click 401'd. Removed rather than adding a new customer-facing
          endpoint: a shipping label is a warehouse/courier document (the
          same Delhivery-format PDF staff print to stick on the package,
          not something a customer has a use for) — customers still get
          the tracking link below. */}
        {trackingUrl !== "-" && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-bree-primary hover:underline"
            >
              Track Shipment
            </a>
          </div>
        )}
      </div>
      {/* ===== End Added ===== */}
    </div>
  );
};

export default OrderTrackingCard;
