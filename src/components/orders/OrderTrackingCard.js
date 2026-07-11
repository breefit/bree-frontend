import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import axios from "@/lib/api";
import { toast } from "sonner";
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
  const [downloadingLabel, setDownloadingLabel] = useState(false);
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
  const shipmentId = getField(order, ["shipment_id", "shipmentId"]);
  const pickupRequestId = getField(order, [
    "pickup_request_id",
    "pickupRequestId",
  ]);
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
  const trackingStatusDisplay =
    trackingStatus === "-" ? "Unknown" : trackingStatus;
  // ===== End Modified =====
  // ===== End Added =====

  const handleDownloadLabel = async () => {
    const activeAwb = awbNumber && awbNumber !== "-" ? awbNumber : null;
    if (!activeAwb) return;

    setDownloadingLabel(true);
    try {
      const response = await axios.get(`/api/shipping/label/${activeAwb}`, {
        withCredentials: true,
        responseType: "blob",
      });
      const contentType =
        response?.headers?.["content-type"] ||
        response?.headers?.["Content-Type"] ||
        "application/pdf";
      const blob =
        response?.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `label-${activeAwb}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      toast.success("Shipping label downloaded");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Failed to download shipping label";
      toast.error(message);
    } finally {
      setDownloadingLabel(false);
    }
  };

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
            <div>Shipment ID</div>
            <div className="font-medium text-bree-text-primary">
              {shipmentId}
            </div>
          </div>
          <div className="text-sm text-bree-text-secondary">
            <div>Pickup Request ID</div>
            <div className="font-medium text-bree-text-primary">
              {pickupRequestId}
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

        {(trackingUrl !== "-" || awbNumber !== "-") && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {trackingUrl !== "-" && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-bree-primary hover:underline"
              >
                Track Shipment
              </a>
            )}
            {awbNumber !== "-" && (
              <button
                type="button"
                onClick={handleDownloadLabel}
                disabled={downloadingLabel}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border border-bree-border text-bree-text-primary hover:bg-bree-bg transition disabled:opacity-60"
              >
                {downloadingLabel ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {downloadingLabel
                  ? "Downloading..."
                  : "Download Shipping Label"}
              </button>
            )}
          </div>
        )}
      </div>
      {/* ===== End Added ===== */}
    </div>
  );
};

export default OrderTrackingCard;
