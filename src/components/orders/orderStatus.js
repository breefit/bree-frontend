// Central order lifecycle configuration used across frontend components.
// frontend /components/orders/orderStatus.js
export const ORDER_STEPS = [
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

export const STATUS_LABELS = {
  pending_payment: "Pending Payment",
  paid: "Paid",
  processing: "Processing",
  ready_to_ship: "Ready To Ship",
  shipped: "Shipped",
  out_for_delivery: "Out For Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const STATUS_DISPLAY = {
  pending_payment: "Pending Payment",
  paid: "Paid",
  processing: "Processing",
  ready_to_ship: "Ready To Ship",
  shipped: "Shipped",
  out_for_delivery: "Out For Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const STATUS_BADGE_CLASSES = {
  pending_payment: "bg-amber-100 text-amber-700 border-amber-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  processing: "bg-sky-100 text-sky-700 border-sky-200",
  ready_to_ship: "bg-indigo-100 text-indigo-700 border-indigo-200",
  shipped: "bg-purple-100 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-100 text-orange-700 border-orange-200",
  delivered: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  returned: "bg-stone-100 text-stone-700 border-stone-200",
};

export const getStatusIndex = (status) => ORDER_STEPS.indexOf(status);

export const getStatusLabel = (status) => STATUS_DISPLAY[status] || status;

export const getValidNextStatuses = (currentStatus) => {
  const currentIndex = getStatusIndex(currentStatus);

  if (currentIndex < 0) return [currentStatus];

  if (
    currentStatus === "delivered" ||
    currentStatus === "cancelled" ||
    currentStatus === "returned"
  ) {
    return [currentStatus];
  }

  const nextIndex = Math.min(currentIndex + 1, ORDER_STEPS.length - 1);

  return [currentStatus, ORDER_STEPS[nextIndex]];
};
