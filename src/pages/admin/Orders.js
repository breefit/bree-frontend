import { useState, useEffect, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpDown,
  Package,
  CheckSquare,
  RefreshCw,
  ChevronDown,
  SlidersHorizontal,
  MapPin,
  Truck,
  Download,
  Ban,
  PackageCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AdminLayout from "@/components/admin/AdminLayout";
import axios from "@/lib/api";
import { toast } from "sonner";
import useOrdersSync from "@/hooks/useOrdersSync";

const API = "/api/admin";
const AUTH = () => ({ withCredentials: true });
const PAGE_SIZE = 10;

const normalizeStatus = (status) => {
  if (!status) return "pending_payment";
  const lower = String(status).toLowerCase();
  const aliases = {
    pending: "pending_payment",
    confirmed: "paid",
    dispatched: "shipped",
    shipped: "shipped",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    cancelled: "cancelled",
    returned: "returned",
  };
  return aliases[lower] || lower;
};

const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "ready_to_ship",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
];

// ===== Added: Delhivery automatic-sync boundary =====
// Once a shipment (AWB) is created, Delhivery becomes the single source of
// truth for status. Admins may only manually move an order through the
// pre-shipment stages below; everything after that (shipped ->
// out_for_delivery -> delivered / returned / cancelled) is synced in
// automatically via the Delhivery webhook/tracking flow.
const MANUAL_EDITABLE_STATUSES = ["processing", "ready_to_ship"];

const DELHIVERY_SYNC_MESSAGE =
  "Shipping status is automatically synchronized from Delhivery.";

// Returns true once a Delhivery shipment (AWB) has been created for the order.
const hasAwbShipment = (order) =>
  Boolean(order?.delhivery_awb || order?.awbNumber || order?.awb);
// ===== End Added =====

const DATE_RANGES = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7days" },
  { label: "Last 30 Days", value: "30days" },
  { label: "Last 90 Days", value: "90days" },
];

const STATUS_COLORS = {
  pending_payment: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  processing: "bg-sky-100 text-sky-700 border-sky-200",
  ready_to_ship: "bg-indigo-100 text-indigo-700 border-indigo-200",
  shipped: "bg-purple-100 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-100 text-orange-700 border-orange-200",
  delivered: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-500 border-red-200",
  returned: "bg-stone-100 text-stone-700 border-stone-200",
};

const ORDER_TRANSITIONS = {
  pending_payment: ["pending_payment", "paid"],
  paid: ["paid", "processing"],
  processing: ["processing", "ready_to_ship"],
  ready_to_ship: ["ready_to_ship", "shipped"],
  shipped: ["shipped", "out_for_delivery"],
  out_for_delivery: ["out_for_delivery", "delivered"],
  delivered: ["delivered", "returned"],
  cancelled: ["cancelled"],
  returned: ["returned"],
};

const PAYMENT_COLORS = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-500",
};

const getCommonBulkStatuses = (orders, selectedIds) => {
  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id));
  if (!selectedOrders.length) return MANUAL_EDITABLE_STATUSES;
  const intersection = selectedOrders
    .map(
      (o) =>
        new Set(
          ORDER_TRANSITIONS[normalizeStatus(o.order_status)] || [
            normalizeStatus(o.order_status),
          ],
        ),
    )
    .reduce(
      (common, statusSet) =>
        new Set([...common].filter((s) => statusSet.has(s))),
      new Set(
        ORDER_TRANSITIONS[normalizeStatus(selectedOrders[0].order_status)] || [
          normalizeStatus(selectedOrders[0].order_status),
        ],
      ),
    );
  // ===== Modified =====
  // Bulk manual updates are restricted to the pre-shipment stages only.
  // Everything from "shipped" onward is Delhivery-driven and must not be
  // settable via the bulk-update control.
  const manualIntersection = [...intersection].filter((s) =>
    MANUAL_EDITABLE_STATUSES.includes(s),
  );
  return manualIntersection.length
    ? manualIntersection
    : MANUAL_EDITABLE_STATUSES;
  // ===== End Modified =====
};

/* ── date filter helper ─────────────────────────────────────────────────── */
function isInRange(dateStr, range) {
  if (range === "all") return true;
  const date = new Date(dateStr);
  const start = new Date();
  const end = new Date();
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "7days") {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (range === "30days") {
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  } else if (range === "90days") {
    start.setDate(start.getDate() - 90);
    start.setHours(0, 0, 0, 0);
  }
  return date >= start && date <= end;
}

/* ── helpers ────────────────────────────────────────────────────────────── */
/**
 * Derive a display-friendly, comma-separated product name string from an order.
 * Prefers the pre-built `product_names` field from the new backend; falls back
 * gracefully to the items array or the legacy single `product_name` field.
 */
const getProductNames = (order) => {
  if (order.product_names) return order.product_names;
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length) {
    return items.map((i) => i.product_name || i.name || "Unknown").join(", ");
  }
  return order.product_name || "Unknown";
};

/* ── small reusable dropdown ─────────────────────────────────────────────── */
function FilterDropdown({ label, value, options, onChange, colorMap }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-medium transition cursor-pointer whitespace-nowrap
          ${
            value !== "all" && value !== ""
              ? "bg-bree-primary border-bree-primary text-white"
              : "bg-white border-bree-border text-bree-text-secondary hover:border-bree-primary hover:text-bree-text-primary"
          }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
        {selected ? selected.label : label}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-12 z-30 bg-white border border-bree-border rounded-2xl shadow-xl py-1.5 min-w-[160px]"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition cursor-pointer
                  ${
                    value === opt.value
                      ? "bg-bree-bg text-bree-primary font-semibold"
                      : "text-bree-text-primary hover:bg-bree-bg/60"
                  }`}
              >
                {colorMap && opt.value !== "all" && (
                  <span
                    className={`w-2 h-2 rounded-full inline-block flex-shrink-0
                    ${
                      opt.value === "delivered"
                        ? "bg-green-500"
                        : opt.value === "pending_payment"
                          ? "bg-amber-400"
                          : opt.value === "paid"
                            ? "bg-emerald-500"
                            : opt.value === "ready_to_ship"
                              ? "bg-indigo-500"
                              : opt.value === "shipped"
                                ? "bg-purple-700"
                                : opt.value === "out_for_delivery"
                                  ? "bg-orange-500"
                                  : opt.value === "cancelled"
                                    ? "bg-red-500"
                                    : opt.value === "returned"
                                      ? "bg-stone-500"
                                      : "bg-slate-300"
                    }`}
                  />
                )}
                {opt.label}
                {value === opt.value && (
                  <span className="ml-auto text-bree-primary">✓</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── order-detail modal ──────────────────────────────────────────────────── */
const OrderModal = ({
  order,
  onClose,
  onStatusChange,
  onShipOrder,
  onCancelShipment,
  onSchedulePickup,
}) => {
  const [shippingLoading, setShippingLoading] = useState(false);

  // ===== Modified =====
  // Local state for the Delhivery tracking/label/cancel actions. Kept
  // scoped to the modal since none of it needs to live in the parent
  // orders list (aside from the cancel action, which does refresh the
  // parent via onCancelShipment).
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  // ===== End Modified =====

  // ===== Added: Schedule Pickup =====
  const [pickupLoading, setPickupLoading] = useState(false);
  // ===== End Added =====

  if (!order) return null;

  const orderStatus = normalizeStatus(order.order_status || order.status);
  const items = Array.isArray(order.items) ? order.items : [];
  const shipmentAwb =
    order.delhivery_awb || order.awbNumber || order.awb || null;
  const shipmentTracking =
    order.delhivery_tracking_number ||
    order.trackingNumber ||
    order.tracking_number ||
    null;
  const shipmentStatus =
    orderStatus === "shipped"
      ? "Shipped"
      : orderStatus === "ready_to_ship"
        ? "Ready to Ship"
        : "Pending";

  // ===== Added: Schedule Pickup =====
  const pickupRequestId =
    order.pickup_request_id || order.pickupRequestId || null;
  const showSchedulePickupButton =
    orderStatus === "shipped" && !pickupRequestId;
  // ===== End Added =====

  const handleShipOrder = async () => {
    setShippingLoading(true);
    try {
      await onShipOrder(order.id);
    } finally {
      setShippingLoading(false);
    }
  };

  // ===== Modified =====
  // ── Delhivery: live tracking ────────────────────────────────────────────
  const handleTrackShipment = async (awb) => {
    if (!awb) return;
    setTrackingLoading(true);
    try {
      const res = await axios.get(`/api/shipping/track/${awb}`, AUTH());
      const tracking = res?.data?.tracking || res?.data || null;
      setTrackingData(tracking);
      toast.success("Tracking info updated");
    } catch (err) {
      const backendMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Failed to fetch tracking info";
      toast.error(backendMessage);
    } finally {
      setTrackingLoading(false);
    }
  };

  // ── Delhivery: shipping label download ──────────────────────────────────
  const handleDownloadLabel = async (awb) => {
    if (!awb) return;
    setLabelLoading(true);
    try {
      const res = await axios.get(`/api/shipping/label/${awb}`, {
        ...AUTH(),
        responseType: "blob",
      });
      const contentType =
        res?.headers?.["content-type"] ||
        res?.headers?.["Content-Type"] ||
        "application/pdf";
      const blob =
        res?.data instanceof Blob
          ? res.data
          : new Blob([res.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `label-${awb}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
      toast.success("Shipping label downloaded");
    } catch (err) {
      const backendMessage =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Failed to download shipping label";
      toast.error(backendMessage);
    } finally {
      setLabelLoading(false);
    }
  };

  // ── Delhivery: cancel shipment ───────────────────────────────────────────
  const handleCancelClick = async () => {
    if (!window.confirm("Are you sure you want to cancel this shipment?")) {
      return;
    }
    setCancelLoading(true);
    try {
      await onCancelShipment(order.id);
    } finally {
      setCancelLoading(false);
    }
  };
  // ===== End Modified =====

  // ===== Added: Schedule Pickup =====
  // ── Delhivery: schedule pickup (mirrors handleShipOrder's pattern) ───────
  const handleSchedulePickupClick = async () => {
    setPickupLoading(true);
    try {
      await onSchedulePickup(order.id);
    } finally {
      setPickupLoading(false);
    }
  };
  // ===== End Added =====

  const timeline = [
    { label: "Order Placed", done: true },
    {
      label: "Paid",
      done: [
        "paid",
        "processing",
        "ready_to_ship",
        "shipped",
        "out_for_delivery",
        "delivered",
      ].includes(orderStatus),
    },
    {
      label: "Processing",
      done: [
        "processing",
        "ready_to_ship",
        "shipped",
        "out_for_delivery",
        "delivered",
      ].includes(orderStatus),
    },
    {
      label: "Ready To Ship",
      done: [
        "ready_to_ship",
        "shipped",
        "out_for_delivery",
        "delivered",
      ].includes(orderStatus),
    },
    {
      label: "Shipped",
      done: ["shipped", "out_for_delivery", "delivered"].includes(orderStatus),
    },
    {
      label: "Out For Delivery",
      done: ["out_for_delivery", "delivered"].includes(orderStatus),
    },
    { label: "Delivered", done: orderStatus === "delivered" },
  ];

  // ===== Modified =====
  // Live Delhivery tracking status (if fetched) falls back to whatever the
  // backend already had stored on the order. Used to decide whether the
  // Cancel Shipment button should be disabled.
  const currentTrackingStatus =
    trackingData?.trackingStatus ||
    order.tracking_status ||
    order.delhivery_tracking_status ||
    null;
  const normalizedTrackingStatus = currentTrackingStatus
    ? String(currentTrackingStatus).trim().toLowerCase()
    : "";
  const isShipmentDelivered =
    orderStatus === "delivered" || normalizedTrackingStatus === "delivered";
  const isShipmentCancelled =
    orderStatus === "cancelled" || normalizedTrackingStatus === "cancelled";
  // ===== End Modified =====

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-bree-border flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
          <div>
            <h3 className="font-outfit font-semibold text-bree-text-primary text-lg">
              Order #{order.order_number || order.id}
            </h3>
            <p className="text-bree-text-secondary text-xs mt-0.5">
              {new Date(order.created_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-bree-bg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-bree-text-secondary" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4">
            {[
              ["Customer", order.customer_name],
              ["Mobile", order.mobile_number],
              ["Email", order.email],
              ["Transaction ID", order.transaction_id],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-bree-text-secondary mb-1">{label}</p>
                <p className="text-sm font-medium text-bree-text-primary break-all">
                  {value || "—"}
                </p>
              </div>
            ))}
          </div>

          {/* ── Order Items ── */}
          <div className="p-4 bg-bree-bg rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-bree-text-secondary font-medium uppercase tracking-wide">
                Order Items
              </p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  PAYMENT_COLORS[order.payment_status] ||
                  "bg-gray-100 text-gray-600"
                }`}
              >
                {order.payment_status}
              </span>
            </div>

            {items.length > 0 ? (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const name =
                    item.product_name || item.name || "Unknown product";
                  const qty = item.quantity ?? 1;
                  const unitPrice = Number(item.unit_price ?? item.price ?? 0);
                  const totalPrice = Number(
                    item.total_price ?? unitPrice * qty,
                  );
                  return (
                    <div
                      key={item.id ?? idx}
                      className={`flex items-start justify-between gap-3 ${
                        idx < items.length - 1
                          ? "pb-3 border-b border-bree-border/60"
                          : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-bree-text-primary text-sm leading-snug">
                          {name}
                        </p>
                        <p className="text-bree-text-secondary text-xs mt-0.5">
                          Qty: {qty}
                          {unitPrice > 0 && (
                            <span className="ml-2 text-bree-text-secondary/70">
                              × ₹{unitPrice.toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                      <p className="font-semibold text-bree-text-primary text-sm whitespace-nowrap">
                        ₹{totalPrice.toLocaleString()}
                      </p>
                    </div>
                  );
                })}

                {/* Order total */}
                <div className="pt-2 flex items-center justify-between border-t border-bree-border">
                  <p className="text-sm font-semibold text-bree-text-primary">
                    Order Total
                  </p>
                  <p className="text-base font-bold text-bree-text-primary">
                    ₹{Number(order.total ?? order.amount ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              /* Graceful fallback for legacy orders with no items array */
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-bree-text-primary text-sm">
                    {order.product_name ||
                      order.product_names ||
                      "Unknown product"}
                  </p>
                  <p className="text-bree-text-secondary text-xs mt-0.5">
                    Qty: {order.quantity ?? "—"}
                  </p>
                </div>
                <p className="font-semibold text-bree-text-primary">
                  ₹{Number(order.total ?? order.amount ?? 0).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Shipping Address */}
          <div>
            <p className="text-xs text-bree-text-secondary mb-2 font-medium uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Shipping Address
            </p>
            <p className="text-sm text-bree-text-primary bg-bree-bg rounded-xl p-3 leading-relaxed">
              {order.shipping_address ||
                order.address_snapshot ||
                order.shippingAddress ||
                "Not available"}
            </p>
          </div>

          {/* Shipping action */}
          {orderStatus === "ready_to_ship" && (
            <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    Delhivery Shipment
                  </p>
                  <p className="text-sm font-semibold text-bree-text-primary mt-0.5">
                    Create a shipment for this order
                  </p>
                </div>
                <Button
                  onClick={handleShipOrder}
                  disabled={shippingLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {shippingLoading ? "Creating..." : "Ship with Delhivery"}
                </Button>
              </div>

              {(shipmentAwb ||
                shipmentTracking ||
                orderStatus === "shipped") && (
                <div className="mt-3 rounded-xl bg-white p-3 space-y-2 border border-indigo-100">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                        AWB
                      </p>
                      <p className="text-sm font-semibold text-bree-text-primary">
                        {shipmentAwb || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                        Tracking Number
                      </p>
                      <p className="text-sm font-semibold text-bree-text-primary">
                        {shipmentTracking || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                        Shipment Status
                      </p>
                      <p className="text-sm font-semibold text-bree-text-primary">
                        {shipmentStatus}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== Modified: Delhivery tracking / label / cancel actions ===== */}
          {shipmentAwb && (
            <div className="p-4 rounded-2xl border border-purple-200 bg-purple-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">
                    Delhivery Shipment Management
                  </p>
                  <p className="text-sm font-semibold text-bree-text-primary mt-0.5">
                    AWB {shipmentAwb}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => handleTrackShipment(shipmentAwb)}
                    disabled={trackingLoading}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Truck className="w-4 h-4 mr-2" />
                    {trackingLoading ? "Tracking..." : "Track Shipment"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => handleDownloadLabel(shipmentAwb)}
                    disabled={!shipmentAwb || labelLoading}
                    className="border-bree-border"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {labelLoading
                      ? "Downloading..."
                      : "Download Shipping Label"}
                  </Button>

                  {/* ===== Added: Schedule Pickup ===== */}
                  {showSchedulePickupButton ? (
                    <Button
                      onClick={handleSchedulePickupClick}
                      disabled={pickupLoading}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      <PackageCheck className="w-4 h-4 mr-2" />
                      {pickupLoading ? "Scheduling..." : "Schedule Pickup"}
                    </Button>
                  ) : (
                    pickupRequestId && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-teal-100 text-teal-700 border border-teal-200">
                        <PackageCheck className="w-3.5 h-3.5" />
                        Pickup Scheduled
                      </span>
                    )
                  )}
                  {/* ===== End Added ===== */}

                  <Button
                    variant="outline"
                    onClick={handleCancelClick}
                    disabled={
                      cancelLoading ||
                      isShipmentDelivered ||
                      isShipmentCancelled
                    }
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    {cancelLoading ? "Cancelling..." : "Cancel Shipment"}
                  </Button>
                </div>
              </div>

              {/* Live tracking info */}
              <div className="mt-3 rounded-xl bg-white p-3 border border-purple-100">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      Tracking Status
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {trackingData?.trackingStatus || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      Current Location
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {trackingData?.currentLocation || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      Last Scan Time
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {trackingData?.lastUpdate || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      Expected Delivery Date
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {trackingData?.expectedDelivery || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      Courier Name
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {trackingData?.courierName || order.courier_name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      AWB Number
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {trackingData?.awbNumber || shipmentAwb || "-"}
                    </p>
                  </div>
                  {/* ===== Added: Pickup Request ID ===== */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary">
                      Pickup Request ID
                    </p>
                    <p className="text-sm font-semibold text-bree-text-primary">
                      {pickupRequestId || "-"}
                    </p>
                  </div>
                  {/* ===== End Added ===== */}
                </div>
              </div>
            </div>
          )}
          {/* ===== End Modified ===== */}

          {/* Update Status */}
          {/* ===== Modified: Delhivery automatic-sync boundary =====
              Once a shipment (AWB) exists, Delhivery is the source of truth
              for status. Manual buttons are hidden and replaced with a
              sync notice. Before shipment creation, only the pre-shipment
              statuses (processing / ready_to_ship) remain manually settable. */}
          <div>
            <p className="text-xs text-bree-text-secondary mb-2 font-medium uppercase tracking-wide">
              Update Order Status
            </p>
            {shipmentAwb ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-bree-bg border border-bree-border">
                <Truck className="w-4 h-4 text-bree-text-secondary flex-shrink-0" />
                <p className="text-sm text-bree-text-secondary">
                  {DELHIVERY_SYNC_MESSAGE}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {MANUAL_EDITABLE_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusChange([order.id], s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition cursor-pointer
                      ${
                        normalizeStatus(order.order_status) === s
                          ? STATUS_COLORS[s] +
                            " ring-2 ring-offset-1 ring-bree-primary"
                          : "bg-white border-bree-border text-bree-text-secondary hover:border-bree-primary hover:text-bree-primary"
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* ===== End Modified ===== */}

          {/* Order Timeline */}
          <div>
            <p className="text-xs text-bree-text-secondary mb-3 font-medium uppercase tracking-wide">
              Order Timeline
            </p>
            <div className="space-y-3">
              {timeline.map(({ label, done }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${
                      done
                        ? "bg-bree-primary text-white"
                        : "bg-bree-bg border-2 border-bree-border text-bree-text-secondary"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <p
                    className={`text-sm font-medium ${
                      done
                        ? "text-bree-text-primary"
                        : "text-bree-text-secondary"
                    }`}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ── bulk bar ────────────────────────────────────────────────────────────── */
const BulkBar = ({ count, onApply, onClear, availableStatuses }) => {
  const [status, setStatus] = useState("");
  const hasSelection = count > 0;
  const selectableStatuses = availableStatuses.length
    ? availableStatuses
    : MANUAL_EDITABLE_STATUSES;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-[#EFF6FF] border border-[#BFDBFE] px-5 py-3 rounded-2xl">
      <div className="flex items-center gap-2">
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center transition ${
            hasSelection ? "bg-[#2563EB]" : "bg-[#BFDBFE]"
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5 text-white" />
        </div>
        <span
          className={`text-sm font-semibold transition ${
            hasSelection ? "text-[#1E40AF]" : "text-[#93C5FD]"
          }`}
        >
          {hasSelection
            ? `${count} order${count > 1 ? "s" : ""} selected`
            : "Select orders to bulk update"}
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <select
          value={status}
          disabled={!hasSelection}
          onChange={(e) => setStatus(e.target.value)}
          className="text-sm bg-white border border-[#BFDBFE] text-[#1E40AF] font-medium rounded-lg px-3 py-1.5 outline-none focus:border-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <option value="" disabled className="text-slate-400">
            Set status…
          </option>
          {selectableStatuses.map((s) => (
            <option key={s} value={s} className="text-slate-800 capitalize">
              {s}
            </option>
          ))}
        </select>

        <button
          disabled={!status || !hasSelection}
          onClick={() => {
            onApply(status);
            setStatus("");
          }}
          className="flex items-center gap-1.5 text-sm font-semibold bg-[#2563EB] text-white px-4 py-1.5 rounded-lg hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Apply
        </button>

        <button
          disabled={!hasSelection}
          onClick={() => {
            onClear();
            setStatus("");
          }}
          className="text-sm font-medium text-[#64748B] hover:text-[#1E40AF] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer px-2"
        >
          Clear
        </button>
      </div>
    </div>
  );
};

/* ── inline status dropdown ──────────────────────────────────────────────── */
// ===== Modified: Delhivery automatic-sync boundary =====
// Accepts a `locked` prop — true once the order has a Delhivery AWB. When
// locked, the dropdown is replaced with a static, non-editable badge and a
// tooltip explaining that status now comes from Delhivery. When not locked,
// the dropdown only ever offers the manual pre-shipment statuses.
const StatusCell = ({ orderId, currentStatus, onChange, locked }) => {
  const safeStatus = normalizeStatus(currentStatus);

  if (locked) {
    return (
      <span
        title={DELHIVERY_SYNC_MESSAGE}
        className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize inline-block cursor-default
          ${STATUS_COLORS[safeStatus] || "bg-gray-100 text-gray-600 border-gray-200"}`}
      >
        {safeStatus.replace(/_/g, " ")}
      </span>
    );
  }

  const availableStatuses = (
    ORDER_TRANSITIONS[safeStatus] || [safeStatus]
  ).filter((s) => MANUAL_EDITABLE_STATUSES.includes(s) || s === safeStatus);

  return (
    <select
      value={safeStatus}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange([orderId], e.target.value)}
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize cursor-pointer outline-none
        ${STATUS_COLORS[safeStatus] || "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {availableStatuses.map((s) => (
        <option
          key={s}
          value={s}
          className="bg-white text-slate-800 capitalize"
        >
          {s}
        </option>
      ))}
    </select>
  );
};
// ===== End Modified =====

/* ── sort button ─────────────────────────────────────────────────────────── */
const SortBtn = memo(({ field, sortField, onSort }) => (
  <button
    onClick={() => onSort(field)}
    className="inline-flex items-center gap-0.5 cursor-pointer group"
  >
    <ArrowUpDown
      className={`w-3 h-3 transition ${
        sortField === field
          ? "text-bree-primary"
          : "text-bree-text-secondary opacity-40 group-hover:opacity-70"
      }`}
    />
  </button>
));

/* ── main page ───────────────────────────────────────────────────────────── */
const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedOrder, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState("all");

  const activeFilters = [filterStatus !== "all", filterDate !== "all"].filter(
    Boolean,
  ).length;

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterDate("all");
    setPage(1);
  };

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterDate, sortField, sortDir]);

  const fetchOrders = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const res = await axios.get(
          `${API}/orders?search=${encodeURIComponent(searchQuery)}&page=${page}&limit=${PAGE_SIZE}&sort=${sortField}&dir=${sortDir}&order_status=${filterStatus}&date=${filterDate}`,
          { ...AUTH(), signal },
        );
        setOrders(res.data?.orders || []);
        setTotal(res.data?.total || 0);
      } catch (err) {
        if (
          axios.isCancel(err) ||
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED"
        )
          return;
        setOrders([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, page, sortField, sortDir, filterStatus, filterDate],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchOrders(controller.signal);
    return () => controller.abort();
  }, [fetchOrders]);

  const handleOrderSync = useCallback((updated) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
    );
    setSelected((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
    );
  }, []);

  useOrdersSync(handleOrderSync);

  /* status update (optimistic + API) */
  const applyStatusChange = useCallback(
    async (ids, newStatus) => {
      if (!ORDER_STATUSES.includes(newStatus)) return;
      const prev = orders;

      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          ids.includes(o.id) ? { ...o, order_status: newStatus } : o,
        ),
      );
      setSelected((prevSel) =>
        prevSel && ids.includes(prevSel.id)
          ? { ...prevSel, order_status: newStatus }
          : prevSel,
      );
      setChecked([]);

      try {
        const adminApi = API;
        if (ids.length === 1) {
          const res = await axios.patch(
            `${adminApi}/orders/${ids[0]}/status`,
            { status: newStatus },
            AUTH(),
          );
          const updated = res.data.order || res.data;
          setOrders((prevOrders) =>
            prevOrders.map((o) =>
              o.id === updated.id ? { ...o, ...updated } : o,
            ),
          );
          setSelected((prevSel) =>
            prevSel && prevSel.id === updated.id
              ? { ...prevSel, ...updated }
              : prevSel,
          );
        } else {
          const res = await axios.patch(
            `${adminApi}/orders/bulk-status`,
            { ids, status: newStatus },
            AUTH(),
          );
          const updatedList = res.data.orders || [];
          if (updatedList.length) {
            const updatedMap = new Map(updatedList.map((u) => [u.id, u]));
            setOrders((prevOrders) =>
              prevOrders.map((o) =>
                updatedMap.has(o.id) ? { ...o, ...updatedMap.get(o.id) } : o,
              ),
            );
            setSelected((prevSel) =>
              prevSel && updatedMap.has(prevSel.id)
                ? { ...prevSel, ...updatedMap.get(prevSel.id) }
                : prevSel,
            );
          }
        }
        toast.success("Order status updated");
      } catch (err) {
        setOrders(prev);
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to update order status";
        toast.error(backendMessage);
      }
    },
    [orders],
  );

  const handleStatusChange = useCallback(
    (ids, newStatus) => applyStatusChange(ids, newStatus),
    [applyStatusChange],
  );

  const handleShipOrder = useCallback(
    async (orderId) => {
      try {
        let res;
        try {
          res = await axios.post(
            "/api/shipping/create-shipment",
            { orderId },
            AUTH(),
          );
        } catch (err) {
          if (err?.response?.status === 404 || err?.response?.status === 400) {
            res = await axios.post(
              `/api/shipping/create-shipment/${orderId}`,
              {},
              AUTH(),
            );
          } else {
            throw err;
          }
        }

        const createdOrder = res?.data?.order || {};
        const mergedOrder = {
          id: orderId,
          order_status: createdOrder.status || "shipped",
          delhivery_awb:
            createdOrder.awbNumber || res?.data?.delhivery?.awb || null,
          delhivery_tracking_number: createdOrder.trackingNumber || null,
          delhivery_tracking_url:
            createdOrder.trackingUrl ||
            res?.data?.delhivery?.trackingUrl ||
            null,
          ...createdOrder,
        };

        setOrders((prevOrders) =>
          prevOrders.map((o) =>
            o.id === orderId ? { ...o, ...mergedOrder } : o,
          ),
        );
        setSelected((prevSel) =>
          prevSel && prevSel.id === orderId
            ? { ...prevSel, ...mergedOrder }
            : prevSel,
        );
        await fetchOrders(new AbortController().signal);
        toast.success("Shipment created successfully");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to create shipment";
        toast.error(backendMessage);
      }
    },
    [fetchOrders],
  );

  // ===== Modified =====
  // ── Delhivery: cancel shipment (mirrors handleShipOrder's pattern) ──────
  const handleCancelShipment = useCallback(
    async (orderId) => {
      try {
        const res = await axios.post(
          `/api/shipping/cancel/${orderId}`,
          {},
          AUTH(),
        );

        const cancelledOrder = res?.data?.order || {};
        const mergedOrder = {
          id: orderId,
          tracking_status: cancelledOrder.trackingStatus || "Cancelled",
          ...cancelledOrder,
        };

        setOrders((prevOrders) =>
          prevOrders.map((o) =>
            o.id === orderId ? { ...o, ...mergedOrder } : o,
          ),
        );
        setSelected((prevSel) =>
          prevSel && prevSel.id === orderId
            ? { ...prevSel, ...mergedOrder }
            : prevSel,
        );
        await fetchOrders(new AbortController().signal);
        toast.success("Shipment cancelled successfully");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to cancel shipment";
        toast.error(backendMessage);
      }
    },
    [fetchOrders],
  );
  // ===== End Modified =====

  // ===== Added: Schedule Pickup =====
  // ── Delhivery: schedule pickup (mirrors handleShipOrder's pattern) ───────
  const handleSchedulePickup = useCallback(
    async (orderId) => {
      try {
        const res = await axios.post(
          `/api/shipping/pickup/${orderId}`,
          {},
          AUTH(),
        );

        const pickupOrder = res?.data?.order || {};
        const mergedOrder = {
          id: orderId,
          pickup_request_id:
            pickupOrder.pickupRequestId ||
            res?.data?.delhivery?.pickupRequestId ||
            null,
          tracking_status: pickupOrder.trackingStatus || "Pickup Scheduled",
          ...pickupOrder,
        };

        setOrders((prevOrders) =>
          prevOrders.map((o) =>
            o.id === orderId ? { ...o, ...mergedOrder } : o,
          ),
        );
        setSelected((prevSel) =>
          prevSel && prevSel.id === orderId
            ? { ...prevSel, ...mergedOrder }
            : prevSel,
        );
        await fetchOrders(new AbortController().signal);
        toast.success("Pickup scheduled successfully");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to schedule pickup";
        toast.error(backendMessage);
      }
    },
    [fetchOrders],
  );
  // ===== End Added =====

  /* checkboxes */
  const pageIds = orders.map((o) => o.id);
  const allPageChecked =
    pageIds.length > 0 && pageIds.every((id) => checked.includes(id));
  const someChecked = pageIds.some((id) => checked.includes(id));

  const toggleAll = () => {
    if (allPageChecked) {
      setChecked((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setChecked((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const toggleOne = (id) =>
    setChecked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSort = useCallback((field) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const statusOptions = [
    { label: "All Statuses", value: "all" },
    ...ORDER_STATUSES.map((s) => ({
      label: s.charAt(0).toUpperCase() + s.slice(1),
      value: s,
    })),
  ];

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* page header */}
        <div>
          <h1 className="font-outfit text-2xl font-semibold text-bree-text-primary">
            Orders
          </h1>
          <p className="text-bree-text-secondary text-sm mt-1">
            {total} total orders
          </p>
        </div>

        {/* search + filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 min-w-[220px] max-w-sm items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="Search by Order #, Name, Email, or Mobile…"
                className="pl-10 pr-10 h-10 rounded-xl border-bree-border focus:border-bree-primary text-sm"
              />
              {searchInput && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4 text-bree-text-secondary hover:text-bree-text-primary" />
                </button>
              )}
            </div>

            <Button
              onClick={handleSearch}
              disabled={loading}
              className="h-10 rounded-xl px-4 text-sm"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          <FilterDropdown
            label="Status"
            value={filterStatus}
            options={statusOptions}
            onChange={setFilterStatus}
            colorMap
          />

          <FilterDropdown
            label="Date Range"
            value={filterDate}
            options={DATE_RANGES}
            onChange={setFilterDate}
          />

          <AnimatePresence>
            {activeFilters > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={clearFilters}
                className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-bree-border text-sm text-bree-text-secondary hover:text-red-500 hover:border-red-300 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Clear {activeFilters > 1 ? `(${activeFilters})` : ""}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* active filter chips */}
        <AnimatePresence>
          {(filterStatus !== "all" || filterDate !== "all") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2"
            >
              {filterStatus !== "all" && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_COLORS[filterStatus]}`}
                >
                  {filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
                  <button
                    onClick={() => setFilterStatus("all")}
                    className="hover:opacity-70 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filterDate !== "all" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                  {DATE_RANGES.find((d) => d.value === filterDate)?.label}
                  <button
                    onClick={() => setFilterDate("all")}
                    className="hover:opacity-70 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* bulk bar */}
        <BulkBar
          count={checked.length}
          availableStatuses={getCommonBulkStatuses(orders, checked)}
          onApply={(status) => handleStatusChange(checked, status)}
          onClear={() => setChecked([])}
        />

        {/* table */}
        <div className="bg-white rounded-2xl shadow-premium border border-bree-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-bree-bg/50 border-b border-bree-border">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allPageChecked}
                      ref={(el) => {
                        if (el)
                          el.indeterminate = someChecked && !allPageChecked;
                      }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-bree-primary cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      Order #{" "}
                      <SortBtn
                        field="id"
                        sortField={sortField}
                        onSort={handleSort}
                      />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      Customer{" "}
                      <SortBtn
                        field="customer_name"
                        sortField={sortField}
                        onSort={handleSort}
                      />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    Mobile
                  </th>
                  {/* ── Products column (was "Product") ── */}
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide">
                    Products
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide">
                    Qty
                  </th>
                  {/* ── Address column ── */}
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide">
                    Address
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      Amount{" "}
                      <SortBtn
                        field="amount"
                        sortField={sortField}
                        onSort={handleSort}
                      />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    Payment
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    Status
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wide whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      Date{" "}
                      <SortBtn
                        field="created_at"
                        sortField={sortField}
                        onSort={handleSort}
                      />
                    </span>
                  </th>
                  <th className="py-3 px-4 w-10" />
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr
                      key={i}
                      className="border-b border-bree-border animate-pulse"
                    >
                      {[...Array(12)].map((__, j) => (
                        <td key={j} className="py-4 px-4">
                          <div className="h-3 bg-bree-bg rounded w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <Package className="w-10 h-10 text-bree-border mx-auto mb-3" />
                      <p className="text-bree-text-secondary text-sm">
                        No orders found
                        {searchQuery && ` for "${searchQuery}"`}
                        {filterStatus !== "all" &&
                          ` with status "${filterStatus}"`}
                      </p>
                      {(searchQuery || activeFilters > 0) && (
                        <button
                          onClick={() => {
                            clearSearch();
                            clearFilters();
                          }}
                          className="mt-3 text-bree-primary text-sm underline cursor-pointer"
                        >
                          Clear all filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  orders.map((order, i) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.025 }}
                      className={`border-b border-bree-border last:border-0 transition-colors
                        ${checked.includes(order.id) ? "bg-blue-50/60" : "hover:bg-bree-bg/30"}`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={checked.includes(order.id)}
                          onChange={() => toggleOne(order.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-bree-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-bree-primary whitespace-nowrap">
                        #{order.order_number || order.id}
                      </td>
                      <td className="py-3 px-4 text-sm text-bree-text-primary whitespace-nowrap">
                        {order.customer_name}
                      </td>
                      <td className="py-3 px-4 text-sm text-bree-text-secondary whitespace-nowrap">
                        {order.mobile_number}
                      </td>

                      {/* ── Products: all names comma-separated ── */}
                      <td
                        className="py-3 px-4 text-sm text-bree-text-secondary max-w-[200px] truncate"
                        title={getProductNames(order)}
                      >
                        {getProductNames(order)}
                      </td>

                      <td className="py-3 px-4 text-sm text-center text-bree-text-secondary">
                        {order.quantity ?? "—"}
                      </td>

                      {/* ── Address column ── */}
                      <td
                        className="py-3 px-4 text-sm text-bree-text-secondary max-w-[160px] truncate"
                        title={order.shipping_address || ""}
                      >
                        {order.shipping_address || "—"}
                      </td>

                      <td className="py-3 px-4 text-sm font-medium text-bree-text-primary whitespace-nowrap">
                        ₹{Number(order.amount).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                            PAYMENT_COLORS[order.payment_status] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {order.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusCell
                          orderId={order.id}
                          currentStatus={order.order_status}
                          onChange={handleStatusChange}
                          locked={hasAwbShipment(order)}
                        />
                      </td>
                      <td className="py-3 px-4 text-xs text-bree-text-secondary whitespace-nowrap">
                        {new Date(order.created_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelected(order)}
                          className="w-8 h-8 rounded-lg hover:bg-bree-bg"
                        >
                          <Eye className="w-4 h-4 text-bree-text-secondary" />
                        </Button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-bree-border flex items-center justify-between">
              <p className="text-sm text-bree-text-secondary">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="w-8 h-8 rounded-lg border-bree-border"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const pg = page <= 3 ? i + 1 : page - 2 + i;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <Button
                      key={pg}
                      size="icon"
                      onClick={() => setPage(pg)}
                      className={`w-8 h-8 rounded-lg text-xs ${
                        page === pg
                          ? "bg-bree-primary border-bree-primary text-white"
                          : "border border-bree-border bg-white text-bree-text-primary hover:bg-bree-bg"
                      }`}
                    >
                      {pg}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="w-8 h-8 rounded-lg border-bree-border"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AnimatePresence at page level with mode="wait" and key={order.id} */}
      <AnimatePresence mode="wait">
        {selectedOrder && (
          <OrderModal
            key={selectedOrder.id}
            order={selectedOrder}
            onClose={() => setSelected(null)}
            onStatusChange={handleStatusChange}
            onShipOrder={handleShipOrder}
            onCancelShipment={handleCancelShipment}
            onSchedulePickup={handleSchedulePickup}
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

export default Orders;
