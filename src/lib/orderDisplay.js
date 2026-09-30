// Customer-facing order display rules shared by the Profile → Orders list
// and the order details / tracking page (OrderTracking.js). Pure functions of
// the backend order fields — no second order state machine: the steps below
// are the existing BREE order_status values and history rows.

// The normal forward lifecycle (unchanged).
export const CUSTOMER_TIMELINE = [
  { status: "pending_payment", label: "Order Placed" },
  { status: "paid", label: "Paid" },
  { status: "processing", label: "Processing" },
  { status: "ready_to_ship", label: "Ready to Ship" },
  { status: "shipped", label: "Shipped" },
  { status: "out_for_delivery", label: "Out for Delivery" },
  { status: "delivered", label: "Delivered" },
];

export const normalizeCustomerStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  return normalized === "pending" ? "pending_payment" : normalized;
};

export const isCancelledOrder = (order) =>
  normalizeCustomerStatus(order?.order_status ?? order?.status) === "cancelled";

/**
 * Whether a Delhivery shipment exists for the order. Uses only authoritative
 * backend shipment fields: `has_shipment` (computed server-side from
 * awb_number by the customer order endpoints) or an AWB the API returned —
 * never order_status or tracking text.
 */
export const hasShipment = (order) => {
  if (!order) return false;
  if (order.has_shipment === true || order.has_shipment === 1) return true;
  const awb = order.delhivery_awb || order.awb_number || order.awbNumber || order.awb;
  return Boolean(awb && awb !== "-");
};

/** Orders list action: a cancelled order with nothing shipped has nothing to track. */
export const getOrderActionLabel = (order) =>
  isCancelledOrder(order) && !hasShipment(order) ? "View Details" : "Track Order";

export const CANCELLED_NO_SHIPMENT_MESSAGE =
  "Shipment was not created because this order was cancelled.";
export const SHIPMENT_NOT_CREATED_MESSAGE = "Shipment has not been created yet.";

/** Text for the shipment panel when there is no shipment to show. */
export const getNoShipmentMessage = (order) =>
  isCancelledOrder(order) ? CANCELLED_NO_SHIPMENT_MESSAGE : SHIPMENT_NOT_CREATED_MESSAGE;

/**
 * Customer refund labels. "Refund Completed" only for the backend's final
 * `completed` state, which is set only from a verified Razorpay final state
 * (refund.processed webhook / status check) — never from refund creation.
 * Completed means Razorpay processed the refund; the bank/UPI credit itself
 * can take longer.
 */
export const CUSTOMER_REFUND_STATUS_LABELS = {
  approved: "Refund Approved",
  processing: "Refund Processing",
  initiated: "Refund Initiated",
  completed: "Refund Completed",
  failed: "Refund Failed",
  rejected: "Refund Rejected",
};

export const getCustomerRefundLabel = (refundStatus) =>
  CUSTOMER_REFUND_STATUS_LABELS[refundStatus] || null;

/**
 * Refund progress for a cancelled order:
 *   Refund Processing → Refund Initiated → Refund Completed
 * or, on failure, Refund Processing → Refund Failed.
 * States: done | current | pending | failed. Returns [] with no refund.
 */
export const buildCancellationRefundSteps = (refundStatus) => {
  if (!refundStatus || refundStatus === "rejected") return [];
  if (refundStatus === "failed") {
    return [
      { key: "refund_processing", label: "Refund Processing", state: "done" },
      { key: "refund_failed", label: "Refund Failed", state: "failed" },
    ];
  }
  const order = ["processing", "initiated", "completed"];
  const reachedIndex = order.indexOf(refundStatus === "approved" ? "processing" : refundStatus);
  const labels = ["Refund Processing", "Refund Initiated", "Refund Completed"];
  return order.map((status, index) => ({
    key: `refund_${status}`,
    label: labels[index],
    state:
      index < reachedIndex || (index === reachedIndex && status === "completed")
        ? "done"
        : index === reachedIndex
          ? "current"
          : "pending",
  }));
};

const firstTimestamps = (history, order) => {
  const timestamps = new Map();
  (history || []).forEach((item) => {
    const status = normalizeCustomerStatus(item.new_status || item.status);
    if (!timestamps.has(status)) timestamps.set(status, item.created_at);
  });
  if (!timestamps.has("pending_payment") && order?.created_at) {
    timestamps.set("pending_payment", order.created_at);
  }
  return timestamps;
};

/**
 * Timeline steps + current status for TrackingTimeline.
 *
 * Normal orders: the full CUSTOMER_TIMELINE, current = order_status (or the
 * latest lifecycle status in history) — unchanged behavior.
 *
 * Cancelled orders branch instead: only the lifecycle steps the order
 * actually reached (evidenced by history), then "Cancelled" as the current,
 * terminal step. No Ready to Ship "In progress", and no Shipped / Out for
 * Delivery / Delivered steps unless they genuinely happened.
 */
export const buildCustomerTimeline = (order, history = []) => {
  const timestamps = firstTimestamps(history, order);

  if (isCancelledOrder(order)) {
    const reached = CUSTOMER_TIMELINE.filter(
      (step) => step.status === "pending_payment" || timestamps.has(step.status),
    );
    const steps = [
      ...reached,
      { status: "cancelled", label: "Cancelled" },
    ].map((step) => ({
      id: `${step.status}-${order?.id}`,
      key: `${step.status}-${order?.id}`,
      status: step.status,
      label: step.label,
      timestamp: timestamps.get(step.status) || null,
    }));
    return { steps, currentStatus: "cancelled" };
  }

  const steps = CUSTOMER_TIMELINE.map((step) => ({
    id: `${step.status}-${order?.id}`,
    key: `${step.status}-${order?.id}`,
    status: step.status,
    label: step.label,
    timestamp: timestamps.get(step.status) || null,
  }));

  let currentStatus = "pending_payment";
  const orderStatus = normalizeCustomerStatus(order?.order_status);
  if (CUSTOMER_TIMELINE.some((step) => step.status === orderStatus)) {
    currentStatus = orderStatus;
  } else {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const historyStatus = normalizeCustomerStatus(
        history[index].new_status || history[index].status,
      );
      if (CUSTOMER_TIMELINE.some((step) => step.status === historyStatus)) {
        currentStatus = historyStatus;
        break;
      }
    }
  }

  return { steps, currentStatus };
};
