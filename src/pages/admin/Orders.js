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
  RotateCcw,
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

// ===== Added: Return Management =====
const RETURN_REASONS = [
  "Damaged Product",
  "Wrong Product",
  "Missing Items",
  "Expired Product",
  "Packaging Damage",
  "Quality Issue",
  "Other",
];

// ===== Added: Fix 2/3 reject reasons =====
const REJECT_REASONS = [
  "Return Window Expired",
  "Product Not Eligible",
  "Insufficient Evidence",
  "Policy Violation",
  "Duplicate Request",
  "Other",
];
// ===== End Added =====

// QC rejection reasons (requirement 10 — new) — distinct from REJECT_REASONS
// above, which are reasons to reject a return *request* before any shipment
// exists; these are reasons the *physical item* failed inspection.
const QC_REJECT_REASONS = [
  "Product Not Damaged as Described",
  "Product Tampered",
  "Missing Original Packaging",
  "Product Used / Worn",
  "Wrong Item Returned",
  "Other",
];

// FIX (Return/Refund audit — state machine mismatch, requirement 9): the
// frontend previously modeled return_status as a single sequence that
// included inspection_completed/refund_approved/refund_completed —
// return_status has never actually held those values; the backend has
// always kept two separate columns (return_status tops out at "returned";
// refund progress lives in refund_status; inspection_status is the new QC
// field, requirement 10). Three separate maps, matching the three separate
// backend columns exactly, rather than one map assuming a merged model.
const RETURN_STATUS_COLORS = {
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-500 border-red-200",
  reverse_shipment_created: "bg-blue-100 text-blue-700 border-blue-200",
  pickup_scheduled: "bg-cyan-100 text-cyan-700 border-cyan-200",
  returned: "bg-purple-100 text-purple-700 border-purple-200",
};

const RETURN_STATUS_LABELS = {
  approved: "Approved",
  rejected: "Rejected",
  reverse_shipment_created: "Reverse Shipment Created",
  pickup_scheduled: "Pickup Scheduled",
  returned: "Returned",
};

const INSPECTION_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-500 border-red-200",
};

const INSPECTION_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const REFUND_STATUS_COLORS = {
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  initiated: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-500 border-red-200",
};

const REFUND_STATUS_LABELS = {
  approved: "Approved",
  initiated: "Processing",
  completed: "Completed",
  rejected: "Rejected",
};

// Linear return_status progression (rejected is a terminal side-state, not
// part of the line) — used to compute how far along the return timeline is.
const RETURN_STATUS_ORDER = [
  "approved",
  "reverse_shipment_created",
  "pickup_scheduled",
  "returned",
];

const ReturnStatusBadge = ({ status }) => {
  if (!status) return null;
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize inline-block
        ${RETURN_STATUS_COLORS[status] || "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {RETURN_STATUS_LABELS[status] || status.replace(/_/g, " ")}
    </span>
  );
};

// ===== Added: Fix 4 — generic confirmation modal for irreversible actions
// that don't otherwise need input (create reverse shipment, schedule
// pickup, mark returned, approve refund, complete refund). =====
const RETURN_CONFIRM_COPY = {
  // Requirement 6 — exact confirmation copy for the "Return Order" action
  // (backend function name createReverseShipment/route unchanged; only the
  // user-facing label changes, per requirement 5's explicit allowance).
  create_reverse_shipment: {
    title: "Create Return Shipment?",
    description:
      "After verification, this will create a return shipment for the customer. The customer will be notified after successful shipment creation.",
    confirmLabel: "Create Return Shipment",
    loadingLabel: "Creating...",
    colorClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  schedule_pickup: {
    title: "Schedule Reverse Pickup",
    description:
      "This schedules a reverse pickup with Delhivery for this return and cannot be undone. Continue?",
    confirmLabel: "Schedule Pickup",
    loadingLabel: "Scheduling...",
    colorClass: "bg-teal-600 hover:bg-teal-700 text-white",
  },
  mark_returned: {
    title: "Mark Returned",
    description:
      "This marks the item as returned and received back into inventory and cannot be undone. Continue?",
    confirmLabel: "Mark Returned",
    loadingLabel: "Updating...",
    colorClass: "bg-purple-600 hover:bg-purple-700 text-white",
  },
  // Requirement 10 — QC pass. Notes are optional here (unlike rejection,
  // which requires a reason via ReasonNotesModal below).
  approve_inspection: {
    title: "Approve Quality Check",
    description:
      "This confirms the returned item passed quality check and unlocks refund approval. Continue?",
    confirmLabel: "Approve",
    loadingLabel: "Approving...",
    colorClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  approve_refund: {
    title: "Approve Refund",
    description:
      "This approves the refund for this order and cannot be undone. Continue?",
    confirmLabel: "Approve Refund",
    loadingLabel: "Refunding...",
    colorClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
  // Requirement 11/12 — this now actually calls Razorpay (see
  // returnController.completeRefund). Same action/button is reused to
  // re-check a refund that's still processing, so the copy covers both.
  complete_refund: {
    title: "Initiate Refund",
    description:
      "This contacts Razorpay to initiate the refund for this order (or checks its status if already processing). Continue?",
    confirmLabel: "Initiate Refund",
    loadingLabel: "Processing...",
    colorClass: "bg-green-600 hover:bg-green-700 text-white",
  },
};

// ===== Added: Fix 2/3 — generic reason+notes modal config for approve
// return, reject return, and reject refund actions. =====
const RETURN_REASON_MODAL_COPY = {
  approve_return: {
    title: "Approve Return",
    reasonOptions: RETURN_REASONS,
    confirmLabel: "Approve Return",
    loadingLabel: "Approving...",
    colorClass: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  reject_return: {
    title: "Reject Return",
    reasonOptions: REJECT_REASONS,
    confirmLabel: "Reject Return",
    loadingLabel: "Rejecting...",
    colorClass: "bg-red-600 hover:bg-red-700 text-white",
  },
  reject_refund: {
    title: "Reject Refund",
    reasonOptions: REJECT_REASONS,
    confirmLabel: "Reject Refund",
    loadingLabel: "Rejecting...",
    colorClass: "bg-red-600 hover:bg-red-700 text-white",
  },
  // Requirement 10 — QC fail.
  reject_inspection: {
    title: "Reject at Quality Check",
    reasonOptions: QC_REJECT_REASONS,
    confirmLabel: "Reject",
    loadingLabel: "Rejecting...",
    colorClass: "bg-red-600 hover:bg-red-700 text-white",
  },
};

/* ── Fix 4: generic confirm-action modal (no inputs) ── */
const ConfirmActionModal = ({ open, config, loading, onConfirm, onClose }) => {
  if (!open || !config) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
      >
        <div className="px-5 py-4 border-b border-bree-border flex items-center justify-between">
          <h4 className="font-outfit font-semibold text-bree-text-primary">
            {config.title}
          </h4>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bree-bg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-bree-text-secondary" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-bree-text-secondary leading-relaxed">
            {config.description}
          </p>
        </div>
        <div className="px-5 py-4 border-t border-bree-border flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="border-bree-border"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={config.colorClass}
          >
            {loading ? config.loadingLabel : config.confirmLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ── Fix 2/3: generic reason+notes modal (approve/reject return, reject refund) ── */
const ReasonNotesModal = ({
  open,
  config,
  loading,
  reasonValue,
  onReasonChange,
  notesValue,
  onNotesChange,
  onSubmit,
  onClose,
}) => {
  if (!open || !config) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="px-5 py-4 border-b border-bree-border flex items-center justify-between">
          <h4 className="font-outfit font-semibold text-bree-text-primary">
            {config.title}
          </h4>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bree-bg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-bree-text-secondary" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-bree-text-secondary mb-1.5 block">
              Reason *
            </label>
            <select
              value={reasonValue}
              onChange={(e) => onReasonChange(e.target.value)}
              className="w-full text-sm border border-bree-border rounded-xl px-3 py-2.5 outline-none focus:border-bree-primary cursor-pointer"
            >
              <option value="" disabled>
                Select a reason…
              </option>
              {config.reasonOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-bree-text-secondary mb-1.5 block">
              Notes *
            </label>
            <textarea
              value={notesValue}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Enter verification notes..."
              rows={4}
              className="w-full text-sm border border-bree-border rounded-xl px-3 py-2.5 outline-none focus:border-bree-primary resize-none"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-bree-border flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="border-bree-border"
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={loading}
            className={config.colorClass}
          >
            {loading ? config.loadingLabel : config.confirmLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
// ===== End Added =====

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
const getProductDisplayName = (order, item) =>
  item.product_name ||
  item.name ||
  (order.is_bulk_order === 1 ? "Bulk Order" : "Unknown product");

const getProductNames = (order) => {
  if (order.product_names) return order.product_names;
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length) {
    return items.map((item) => getProductDisplayName(order, item)).join(", ");
  }
  const fallback = order.is_bulk_order === 1 ? "Bulk Order" : "Unknown product";
  return order.product_name || order.product_names || fallback;
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
  // ===== Added: Return Management =====
  onApproveReturn,
  onRejectReturn,
  onCreateReverseShipment,
  onScheduleReversePickup,
  onMarkReturned,
  onApproveInspection,
  onRejectInspection,
  onApproveRefund,
  onRejectRefund,
  onCompleteRefund,
  // ===== End Added =====
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

  // ===== Added: Return Management =====
  // Fix 2/3/4: two generic modals cover every return/refund action —
  // ReasonNotesModal for approve/reject return + reject refund (the
  // reason+notes form itself doubles as the confirmation step), and
  // ConfirmActionModal for the remaining irreversible actions that need a
  // plain "are you sure" (create reverse shipment, schedule pickup, mark
  // returned, approve refund, complete refund).
  const [reasonModal, setReasonModal] = useState(null);
  const [reasonValue, setReasonValue] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [reasonModalLoading, setReasonModalLoading] = useState(false);

  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmModalLoading, setConfirmModalLoading] = useState(false);
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

  // ===== Added: Return Management =====
  const returnStatus = order.return_status || null;
  const inspectionStatus = order.inspection_status || null;
  const refundStatus = order.refund_status || null;
  const showReturnSection = orderStatus === "delivered";

  // FIX (Return/Refund audit — 48-hour window, requirement 3): this is
  // UX-only — the backend independently re-verifies the same rule on every
  // mutating call (isReturnWindowOpen() in returnController.js) and never
  // trusts what the frontend computes. Mirrors that helper's exact formula:
  // return_deadline = delivered_at + 48 hours.
  const RETURN_WINDOW_HOURS = 48;
  const returnDeadline = order.delivered_at
    ? new Date(new Date(order.delivered_at).getTime() + RETURN_WINDOW_HOURS * 60 * 60 * 1000)
    : null;
  const isReturnWindowOpen =
    orderStatus === "delivered" &&
    Boolean(order.delivered_at) &&
    Boolean(returnDeadline) &&
    Date.now() <= returnDeadline.getTime();
  const returnEligibilityLabel = !order.delivered_at
    ? "Unknown (no delivery timestamp)"
    : isReturnWindowOpen
      ? "Eligible"
      : "Expired";

  // FIX (state-machine mismatch, requirement 9): can the "Return Order"
  // workflow even be started for this order — no return in progress yet,
  // still within the window. Previously gated on a return_status value
  // ("pending_verification") the backend never produces, so this was
  // unreachable for every order.
  const canStartReturn = showReturnSection && !returnStatus && isReturnWindowOpen;

  // Refund amount / visibility now keyed off the real refund_status column
  // (never merged into return_status) — visible from the point a refund
  // amount could exist at all (return received) through to completion.
  const refundAmountValue =
    order.refund_amount != null
      ? order.refund_amount
      : (order.total ?? order.total_amount ?? null);
  const refundAmountVisible =
    returnStatus === "returned" || Boolean(refundStatus);

  const closeReasonModal = () => {
    setReasonModal(null);
    setReasonValue("");
    setNotesValue("");
  };

  // ── Return/Refund: submit the reason+notes modal (approve return,
  // reject return, reject refund all share this form + confirmation) ──────
  const handleReasonModalSubmit = async () => {
    if (!reasonValue || !notesValue.trim()) {
      toast.error("Reason and notes are required");
      return;
    }
    setReasonModalLoading(true);
    try {
      const payload = { reason: reasonValue, notes: notesValue.trim() };
      if (reasonModal === "approve_return") {
        await onApproveReturn(order.id, payload);
      } else if (reasonModal === "reject_return") {
        await onRejectReturn(order.id, payload);
      } else if (reasonModal === "reject_refund") {
        await onRejectRefund(order.id, payload);
      } else if (reasonModal === "reject_inspection") {
        await onRejectInspection(order.id, payload);
      }
      closeReasonModal();
    } catch (err) {
      // error toast already surfaced by the parent handler
    } finally {
      setReasonModalLoading(false);
    }
  };

  // ── Return/Refund: submit the plain confirm modal (create reverse
  // shipment, schedule pickup, mark returned, approve refund, complete
  // refund — all irreversible, none need extra input) ─────────────────────
  const handleConfirmModalSubmit = async () => {
    setConfirmModalLoading(true);
    try {
      if (confirmModal === "create_reverse_shipment") {
        await onCreateReverseShipment(order.id);
      } else if (confirmModal === "schedule_pickup") {
        await onScheduleReversePickup(order.id);
      } else if (confirmModal === "mark_returned") {
        await onMarkReturned(order.id);
      } else if (confirmModal === "approve_inspection") {
        await onApproveInspection(order.id, {});
      } else if (confirmModal === "approve_refund") {
        await onApproveRefund(order.id);
      } else if (confirmModal === "complete_refund") {
        await onCompleteRefund(order.id);
      }
      setConfirmModal(null);
    } catch (err) {
      // error toast already surfaced by the parent handler
    } finally {
      setConfirmModalLoading(false);
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
    <>
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
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-outfit font-semibold text-bree-text-primary text-lg">
                  Order #{order.order_number || order.id}
                </h3>
                {order.is_bulk_order === 1 && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-1 rounded-full border border-slate-200 bg-slate-100 text-slate-700">
                    Bulk Order
                  </span>
                )}
                {order.parent_package_id && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-1 rounded-full border border-blue-200 bg-blue-100 text-blue-700">
                    Package Cycle {order.fulfillment_cycle}
                    {order.package_total_cycles
                      ? `/${order.package_total_cycles}`
                      : ""}
                  </span>
                )}
              </div>
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
                  <p className="text-xs text-bree-text-secondary mb-1">
                    {label}
                  </p>
                  <p className="text-sm font-medium text-bree-text-primary break-all">
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>

            {order.is_bulk_order === 1 && (
              <div className="p-4 bg-bree-bg rounded-2xl border border-bree-border">
                <p className="text-xs text-bree-text-secondary mb-4 uppercase tracking-wide font-medium">
                  Bulk Order Information
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["Bulk Booking Number", order.bulk_booking_number],
                    ["Company", order.company_name],
                    ["Contact Person", order.contact_person],
                    ["Order Type", "Bulk Order"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-bree-text-secondary mb-1">
                        {label}
                      </p>
                      <p className="text-sm font-medium text-bree-text-primary">
                        {value || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {order.parent_package_id && (
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-xs text-blue-700 mb-4 uppercase tracking-wide font-medium">
                  Recurring Package — Fulfillment Order
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["Package Number", order.package_number],
                    [
                      "Cycle",
                      order.package_total_cycles
                        ? `${order.fulfillment_cycle} of ${order.package_total_cycles}`
                        : String(order.fulfillment_cycle ?? "—"),
                    ],
                    [
                      "Package Status",
                      order.package_status
                        ? order.package_status[0].toUpperCase() +
                          order.package_status.slice(1)
                        : "—",
                    ],
                    [
                      "Next Fulfillment",
                      order.package_next_fulfillment_date
                        ? new Date(
                            order.package_next_fulfillment_date,
                          ).toLocaleDateString("en-IN", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : order.package_status === "completed"
                          ? "Package complete"
                          : "—",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-blue-700/70 mb-1">{label}</p>
                      <p className="text-sm font-medium text-bree-text-primary">
                        {value || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                    const name = getProductDisplayName(order, item);
                    const qty = item.quantity ?? 1;
                    const unitPrice = Number(
                      item.unit_price ?? item.price ?? 0,
                    );
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
                      ₹
                      {Number(
                        order.total ?? order.amount ?? 0,
                      ).toLocaleString()}
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
                        (order.is_bulk_order === 1
                          ? "Bulk Order"
                          : "Unknown product")}
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

            {/* ===== Added: Return Management ===== */}
            {showReturnSection && (
              <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    🔄 Return Management
                  </p>
                  {returnStatus && <ReturnStatusBadge status={returnStatus} />}
                </div>

                {!returnStatus ? (
                  <div className="text-center py-4">
                    <p className="text-sm font-semibold text-bree-text-primary mb-1">
                      Not Requested
                    </p>
                    <p className="text-xs text-bree-text-secondary mb-1">
                      No return request has been initiated for this order.
                    </p>
                    {/* FIX (requirement 3/5): the 48-hour window, computed
                        from the real delivered_at — this is the UX layer
                        only, the backend independently re-checks the same
                        rule on every request. */}
                    {!order.delivered_at ? (
                      <p className="text-xs font-medium text-amber-700 mb-4">
                        No delivery timestamp recorded — return eligibility
                        cannot be determined.
                      </p>
                    ) : isReturnWindowOpen ? (
                      <p className="text-xs text-bree-text-secondary mb-4">
                        Return window open until{" "}
                        {returnDeadline?.toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        .
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-red-600 mb-4">
                        Return window expired. Returns can only be requested
                        within 48 hours of delivery.
                      </p>
                    )}
                    <Button
                      onClick={() => setReasonModal("approve_return")}
                      disabled={!canStartReturn}
                      className="bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Approve Return Request
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Return details — only rendered when the value exists (Fix 10) */}
                    <div className="rounded-xl bg-white p-3 border border-amber-100 space-y-2">
                      {/* FIX (requirement 12 — admin UI): Delivered At / Return
                          Deadline / Return Eligibility, matching the example
                          layout exactly. */}
                      {order.delivered_at && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Delivered At
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {new Date(order.delivered_at).toLocaleString(
                              "en-IN",
                              {
                                timeZone: "Asia/Kolkata",
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            )}
                          </p>
                        </div>
                      )}
                      {returnDeadline && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Return Deadline
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {returnDeadline.toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </p>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                          Return Eligibility
                        </p>
                        <p
                          className={`text-sm font-medium text-right ${
                            returnEligibilityLabel === "Eligible"
                              ? "text-emerald-700"
                              : returnEligibilityLabel === "Expired"
                                ? "text-red-600"
                                : "text-bree-text-primary"
                          }`}
                        >
                          {returnEligibilityLabel}
                        </p>
                      </div>
                      {order.return_reason && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Reason
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {order.return_reason}
                          </p>
                        </div>
                      )}
                      {order.return_notes && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Notes
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {order.return_notes}
                          </p>
                        </div>
                      )}
                      {order.return_approved_by && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Approved By
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {order.return_approved_by}
                          </p>
                        </div>
                      )}
                      {order.return_approved_at && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Approved At
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {new Date(order.return_approved_at).toLocaleString(
                              "en-IN",
                              {
                                timeZone: "Asia/Kolkata",
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            )}
                          </p>
                        </div>
                      )}
                      {order.reverse_awb && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Reverse AWB
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {order.reverse_awb}
                          </p>
                        </div>
                      )}
                      {order.reverse_tracking_url && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Reverse Tracking URL
                          </p>
                          <a
                            href={order.reverse_tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-bree-primary underline text-right break-all"
                          >
                            Track
                          </a>
                        </div>
                      )}
                      {/* ===== Modified: Fix 10 — relabeled "Pickup Request ID" ===== */}
                      {order.reverse_pickup_request_id && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Pickup Request ID
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {order.reverse_pickup_request_id}
                          </p>
                        </div>
                      )}
                      {/* ===== End Modified ===== */}
                      {order.returned_at && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Returned Date
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {new Date(order.returned_at).toLocaleString(
                              "en-IN",
                              {
                                timeZone: "Asia/Kolkata",
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            )}
                          </p>
                        </div>
                      )}
                      {/* ===== Added: Fix 10 — Inspection Status ===== */}
                      {inspectionStatus && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Inspection Status
                          </p>
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border inline-block ${
                              INSPECTION_STATUS_COLORS[inspectionStatus] ||
                              "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {INSPECTION_STATUS_LABELS[inspectionStatus] ||
                              inspectionStatus}
                          </span>
                        </div>
                      )}
                      {/* ===== End Added ===== */}
                      {refundStatus && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Refund Status
                          </p>
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border inline-block ${
                              REFUND_STATUS_COLORS[refundStatus] ||
                              "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {REFUND_STATUS_LABELS[refundStatus] || refundStatus}
                          </span>
                        </div>
                      )}
                      {/* ===== Modified: Fix 9 — refund_amount falls back to order total ===== */}
                      {refundAmountVisible && refundAmountValue != null && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Refund Amount
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            ₹{Number(refundAmountValue).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {/* ===== End Modified ===== */}
                      {order.refund_reference && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Refund Reference
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {order.refund_reference}
                          </p>
                        </div>
                      )}
                      {order.refund_completed_at && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary flex-shrink-0">
                            Refund Completed At
                          </p>
                          <p className="text-sm font-medium text-bree-text-primary text-right">
                            {new Date(order.refund_completed_at).toLocaleString(
                              "en-IN",
                              {
                                timeZone: "Asia/Kolkata",
                                dateStyle: "medium",
                                timeStyle: "short",
                              },
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* FIX (state-machine mismatch, requirement 9): each step
                      now checks the field that column actually lives on —
                      return_status for the shipment/pickup/return steps,
                      inspection_status for QC, refund_status for the refund
                      steps — instead of one field assumed to hold all three
                      progressions. */}
                    {returnStatus === "rejected" ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                        <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          ✕
                        </span>
                        <p className="text-xs font-medium text-red-700">
                          This return request was rejected.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-bree-text-secondary mb-2">
                          Return Timeline
                        </p>
                        <div className="space-y-2">
                          {[
                            {
                              key: "requested",
                              label: "Return Requested",
                              done: Boolean(returnStatus),
                            },
                            {
                              key: "approved",
                              label: "Approved",
                              done:
                                RETURN_STATUS_ORDER.indexOf(returnStatus) >=
                                RETURN_STATUS_ORDER.indexOf("approved"),
                            },
                            {
                              key: "reverse_shipment_created",
                              label: "Reverse Shipment Created",
                              done:
                                RETURN_STATUS_ORDER.indexOf(returnStatus) >=
                                RETURN_STATUS_ORDER.indexOf(
                                  "reverse_shipment_created",
                                ),
                            },
                            {
                              key: "pickup_scheduled",
                              label: "Pickup Scheduled",
                              done:
                                RETURN_STATUS_ORDER.indexOf(returnStatus) >=
                                RETURN_STATUS_ORDER.indexOf("pickup_scheduled"),
                            },
                            {
                              key: "returned",
                              label: "Returned",
                              done:
                                RETURN_STATUS_ORDER.indexOf(returnStatus) >=
                                RETURN_STATUS_ORDER.indexOf("returned"),
                            },
                            {
                              key: "inspection",
                              label: "Quality Check",
                              done: inspectionStatus === "approved",
                            },
                            {
                              key: "refund_approved",
                              label: "Refund Approved",
                              done: Boolean(refundStatus) && refundStatus !== "rejected",
                            },
                            {
                              key: "refund_completed",
                              label: "Refund Completed",
                              done: refundStatus === "completed",
                            },
                          ].map(({ key, label, done }, i) => (
                            <div key={key} className="flex items-center gap-3">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold
                                ${
                                  done
                                    ? "bg-green-500 text-white"
                                    : "bg-white border-2 border-bree-border text-bree-text-secondary"
                                }`}
                              >
                                {done ? "✓" : i + 1}
                              </div>
                              <p
                                className={`text-xs font-medium ${
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
                    )}

                    {/* FIX (requirement 5/9): the dead "pending_verification"
                      branch that made the approve/reject-return buttons
                      unreachable has been removed — that entry point lives in
                      the "Not Requested" box above, which already renders
                      the moment return_status is null. Only the next valid
                      action is shown per state; each still routes through
                      the existing confirmation modals. */}
                    <div className="flex flex-wrap justify-end gap-2">
                      {returnStatus === "approved" && (
                        <Button
                          onClick={() =>
                            setConfirmModal("create_reverse_shipment")
                          }
                          disabled={!isReturnWindowOpen}
                          title={
                            !isReturnWindowOpen
                              ? "The 48-hour return window has expired."
                              : undefined
                          }
                          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Truck className="w-4 h-4 mr-2" />
                          Return Order
                        </Button>
                      )}
                      {returnStatus === "reverse_shipment_created" && (
                        <Button
                          onClick={() => setConfirmModal("schedule_pickup")}
                          className="bg-teal-600 hover:bg-teal-700 text-white"
                        >
                          <PackageCheck className="w-4 h-4 mr-2" />
                          Schedule Reverse Pickup
                        </Button>
                      )}
                      {returnStatus === "pickup_scheduled" && (
                        <Button
                          onClick={() => setConfirmModal("mark_returned")}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          Mark Returned
                        </Button>
                      )}

                      {/* FIX (requirement 10 — QC): a refund could previously
                        be approved the instant the courier delivered the
                        parcel back — nobody at BREE had looked at it yet.
                        This step is now mandatory and blocking. */}
                      {returnStatus === "returned" &&
                        inspectionStatus === "pending" && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => setReasonModal("reject_inspection")}
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              Reject Quality Check
                            </Button>
                            <Button
                              onClick={() => setConfirmModal("approve_inspection")}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Approve Quality Check
                            </Button>
                          </>
                        )}
                      {inspectionStatus === "rejected" && !refundStatus && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-red-100 text-red-600 border border-red-200">
                          Failed Quality Check
                        </span>
                      )}

                      {/* Refund — gated on inspection_status = "approved",
                        not merely on the item having arrived. */}
                      {inspectionStatus === "approved" && !refundStatus && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => setReasonModal("reject_refund")}
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            Reject Refund
                          </Button>
                          <Button
                            onClick={() => setConfirmModal("approve_refund")}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Approve Refund
                          </Button>
                        </>
                      )}
                      {refundStatus === "approved" && (
                        <Button
                          onClick={() => setConfirmModal("complete_refund")}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Initiate Refund
                        </Button>
                      )}
                      {refundStatus === "initiated" && (
                        <Button
                          onClick={() => setConfirmModal("complete_refund")}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Refund Processing — Check Status
                        </Button>
                      )}
                      {refundStatus === "completed" && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-green-100 text-green-700 border border-green-200">
                          Refund Completed
                        </span>
                      )}
                      {refundStatus === "rejected" && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-red-100 text-red-600 border border-red-200">
                          Refund Rejected
                        </span>
                      )}
                      {returnStatus === "rejected" && (
                        <ReturnStatusBadge status="rejected" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* ===== End Added ===== */}

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

      {/* ===== Added: Return Management — reason+notes and confirm modals ===== */}
      <AnimatePresence>
        {reasonModal && (
          <ReasonNotesModal
            open={!!reasonModal}
            config={RETURN_REASON_MODAL_COPY[reasonModal]}
            loading={reasonModalLoading}
            reasonValue={reasonValue}
            onReasonChange={setReasonValue}
            notesValue={notesValue}
            onNotesChange={setNotesValue}
            onSubmit={handleReasonModalSubmit}
            onClose={closeReasonModal}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmModal && (
          <ConfirmActionModal
            open={!!confirmModal}
            config={RETURN_CONFIRM_COPY[confirmModal]}
            loading={confirmModalLoading}
            onConfirm={handleConfirmModalSubmit}
            onClose={() => setConfirmModal(null)}
          />
        )}
      </AnimatePresence>
      {/* ===== End Added ===== */}
    </>
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

  // ===== Modified =====
  // ── Delhivery: create shipment ──────────────────────────────────────────
  // Backend now only supports POST /api/shipping/create-shipment/:orderId.
  // The legacy fallback to POST /api/shipping/create-shipment (with orderId
  // in the body) has been removed — exactly one request is made.
  const handleShipOrder = useCallback(
    async (orderId) => {
      try {
        const res = await axios.post(
          `/api/shipping/create-shipment/${orderId}`,
          {},
          AUTH(),
        );

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
  // ===== End Modified =====

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

  // ===== Added: Return Management =====
  // Fix 7: refresh both the selected order and the orders table straight
  // from the server after every return/refund mutation, instead of relying
  // on the partial `order` object the mutation endpoint may return.
  // NOTE: there's no dedicated "get single order" endpoint in the spec, so
  // the selected order is refreshed by re-fetching the current orders page
  // and pulling the matching row out of it. If the order has scrolled off
  // the current page/filter view, the selected-order refresh is skipped —
  // a GET /api/admin/orders/:orderId endpoint would remove that edge case.
  const refetchOrderAndList = useCallback(
    async (orderId) => {
      try {
        const res = await axios.get(
          `${API}/orders?search=${encodeURIComponent(searchQuery)}&page=${page}&limit=${PAGE_SIZE}&sort=${sortField}&dir=${sortDir}&order_status=${filterStatus}&date=${filterDate}`,
          AUTH(),
        );
        const freshOrders = res.data?.orders || [];
        setOrders(freshOrders);
        setTotal(res.data?.total || 0);
        const fresh = freshOrders.find((o) => o.id === orderId);
        if (fresh) {
          setSelected((prevSel) =>
            prevSel && prevSel.id === orderId
              ? { ...prevSel, ...fresh }
              : prevSel,
          );
        }
      } catch (err) {
        // Swallow — the mutation itself already succeeded and toasted; the
        // table/selected order will pick up the change on the next natural
        // fetchOrders cycle.
      }
    },
    [searchQuery, page, sortField, sortDir, filterStatus, filterDate],
  );

  // ── Return: approve return request ──────────────────────────────────────
  const handleApproveReturn = useCallback(
    async (orderId, { reason, notes }) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/return/approve`,
          { reason, notes },
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Return approved successfully.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to approve return";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Return: reject return request (Fix 2) ────────────────────────────────
  const handleRejectReturn = useCallback(
    async (orderId, { reason, notes }) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/return/reject`,
          { reason, notes },
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Return rejected.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to reject return";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Return: create reverse shipment ("Return Order" action) ──────────────
  const handleCreateReverseShipment = useCallback(
    async (orderId) => {
      try {
        const { data } = await axios.post(
          `${API}/orders/${orderId}/return/reverse-shipment`,
          {},
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Return shipment created successfully.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Unable to create return shipment. Please try again.";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Return: schedule reverse pickup ────────────────────────────────────────
  const handleScheduleReversePickup = useCallback(
    async (orderId) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/return/schedule-pickup`,
          {},
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Reverse pickup scheduled successfully.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to schedule reverse pickup";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Return: mark order returned ────────────────────────────────────────────
  const handleMarkReturned = useCallback(
    async (orderId) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/return/mark-returned`,
          {},
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Return received successfully.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to mark order as returned";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Quality Check: approve inspection (requirement 10 — new) ─────────────
  const handleApproveInspection = useCallback(
    async (orderId, payload = {}) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/return/inspection/approve`,
          { notes: payload.notes },
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Quality check completed.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to record quality check";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Quality Check: reject inspection (requirement 10 — new) ──────────────
  const handleRejectInspection = useCallback(
    async (orderId, { reason, notes }) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/return/inspection/reject`,
          { reason, notes },
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Return rejected at quality check.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to record quality check";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Refund: approve refund ─────────────────────────────────────────────────
  const handleApproveRefund = useCallback(
    async (orderId) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/refund/approve`,
          {},
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Refund approved successfully.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to approve refund";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Refund: reject refund (Fix 3) ─────────────────────────────────────────
  const handleRejectRefund = useCallback(
    async (orderId, { reason, notes }) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/refund/reject`,
          { reason, notes },
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Refund rejected.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to reject refund";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
  );

  // ── Refund: initiate / check Razorpay refund (backend function name kept
  // as completeRefund — see returnController.js — now actually calls
  // Razorpay and is idempotent: same handler re-checks status on a repeat
  // click while a refund is still processing). ─────────────────────────────
  const handleCompleteRefund = useCallback(
    async (orderId) => {
      try {
        const { data } = await axios.patch(
          `${API}/orders/${orderId}/refund/complete`,
          {},
          AUTH(),
        );
        await refetchOrderAndList(orderId);
        toast.success(data?.message || "Refund initiated successfully.");
      } catch (err) {
        const backendMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Unable to initiate refund. Please try again.";
        toast.error(backendMessage);
        throw err;
      }
    },
    [refetchOrderAndList],
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
                        <div className="inline-flex items-center gap-2">
                          <span>#{order.order_number || order.id}</span>
                          {order.is_bulk_order === 1 && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full border border-slate-200 bg-slate-100 text-slate-700">
                              Bulk Order
                            </span>
                          )}
                          {order.parent_package_id && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full border border-blue-200 bg-blue-100 text-blue-700">
                              Cycle {order.fulfillment_cycle}
                              {order.package_total_cycles
                                ? `/${order.package_total_cycles}`
                                : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-bree-text-primary whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span>{order.customer_name || "—"}</span>
                          {order.is_bulk_order === 1 && order.company_name && (
                            <span className="text-xs text-bree-text-secondary block">
                              {order.company_name}
                            </span>
                          )}
                        </div>
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
            onApproveReturn={handleApproveReturn}
            onRejectReturn={handleRejectReturn}
            onCreateReverseShipment={handleCreateReverseShipment}
            onScheduleReversePickup={handleScheduleReversePickup}
            onMarkReturned={handleMarkReturned}
            onApproveInspection={handleApproveInspection}
            onRejectInspection={handleRejectInspection}
            onApproveRefund={handleApproveRefund}
            onRejectRefund={handleRejectRefund}
            onCompleteRefund={handleCompleteRefund}
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

export default Orders;
