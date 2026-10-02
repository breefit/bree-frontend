import { render, screen, within, fireEvent } from "@testing-library/react";
import { buildAdminOrderTimeline } from "@/lib/orderDisplay";

// Same toolchain workaround as Orders.approveRefund.test.js: AdminLayout is
// only used by the outer page, never by OrderModal.
jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: () => null,
}));

// eslint-disable-next-line import/first
import { OrderModal, getCommonBulkStatuses } from "./Orders";

/**
 * Admin order details for cancelled / refunded orders (BREE-100020:
 * cancelled, payment refunded, refund completed ₹1, no shipment). The modal
 * used to offer [Processing] [Ready_to_ship] and the normal 7-step
 * lifecycle with Shipped / Out For Delivery / Delivered pending.
 */

const HISTORY_100020 = [
  { previous_status: null, new_status: "pending", created_at: "2026-09-30T14:55:18.000Z" },
  { previous_status: "pending_payment", new_status: "paid", created_at: "2026-09-30T14:55:35.000Z" },
  { previous_status: "paid", new_status: "processing", created_at: "2026-09-30T14:56:11.000Z" },
  { previous_status: "processing", new_status: "ready_to_ship", created_at: "2026-09-30T14:56:19.000Z" },
  { previous_status: "ready_to_ship", new_status: "cancelled", created_at: "2026-09-30T14:56:24.000Z" },
];

const order = (overrides = {}) => ({
  id: "9de7a3b0-e4e7-453c-ae5c-4caa993a90ba",
  order_number: "BREE-100020",
  order_status: "cancelled",
  status: "cancelled",
  payment_status: "refunded",
  refund_status: "completed",
  refund_amount: "1.00",
  refund_reference: "rfnd_TiHycL2ec5A9vh",
  refund_completed_at: "2026-09-30T14:56:25.000Z",
  awb_number: null,
  return_status: null,
  is_subscription: 0,
  total: 1,
  created_at: "2026-09-30T14:55:18.000Z",
  items: [],
  reminders: [],
  status_history: HISTORY_100020,
  ...overrides,
});

const noop = async () => {};

const renderModal = (o, props = {}) =>
  render(
    <OrderModal
      order={o}
      onClose={noop}
      onStatusChange={props.onStatusChange || noop}
      onShipOrder={noop}
      onCancelShipment={noop}
      onSchedulePickup={noop}
      onApproveReturn={noop}
      onRejectReturn={noop}
      onCreateReverseShipment={noop}
      onScheduleReversePickup={noop}
      onMarkReturned={noop}
      onApproveInspection={noop}
      onRejectInspection={noop}
      onApproveRefund={noop}
      onRejectRefund={noop}
      onCompleteRefund={noop}
      onCancelOrderRefund={noop}
    />,
  );

const timelineSteps = () =>
  [...screen.getByTestId("admin-order-timeline").querySelectorAll("[data-step]")].map((el) => [
    el.getAttribute("data-step"),
    el.getAttribute("data-state"),
  ]);

// ── 1 / 2. Cancelled: no status controls, cannot move it from the UI ────

test("1. cancelled order: the normal status buttons are not rendered; a read-only Cancelled state is shown", () => {
  renderModal(order());
  expect(screen.queryByRole("button", { name: /^processing$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^ready_to_ship$/i })).toBeNull();
  expect(screen.queryByText("Update Order Status")).toBeNull();
  const readOnly = screen.getByTestId("order-status-readonly");
  expect(within(readOnly).getByText("Cancelled")).toBeTruthy();
  expect(
    within(readOnly).getByText(/cannot be moved back to an active fulfillment status/),
  ).toBeTruthy();
});

test("2. cancelled order: nothing in the modal can send a status change (no clickable fulfillment status anywhere)", () => {
  const onStatusChange = jest.fn();
  renderModal(order(), { onStatusChange });
  for (const button of screen.queryAllByRole("button")) {
    if (/^(processing|ready_to_ship|shipped|out_for_delivery|delivered)$/i.test(button.textContent.trim())) {
      throw new Error(`status button rendered: ${button.textContent}`);
    }
  }
  expect(onStatusChange).not.toHaveBeenCalled();
});

test("2b. bulk update: a selection containing a cancelled order offers NO status (previously fell back to Processing / Ready to Ship)", () => {
  const orders = [
    { id: "a", order_status: "cancelled" },
    { id: "b", order_status: "processing" },
  ];
  expect(getCommonBulkStatuses(orders, ["a"])).toEqual([]);
  expect(getCommonBulkStatuses(orders, ["a", "b"])).toEqual([]);
  // Unchanged for valid selections / no selection.
  expect(getCommonBulkStatuses(orders, ["b"])).toEqual(["processing", "ready_to_ship"]);
  expect(getCommonBulkStatuses(orders, [])).toEqual(["processing", "ready_to_ship"]);
});

// ── 3 / 4. Timeline branch ─────────────────────────────────────────────

test("3 + 4. BREE-100020 timeline: Placed ✓ Paid ✓ Processing ✓ Ready To Ship ✓ Cancelled ✓ Refund Processed ✓ — no Shipped / Out For Delivery / Delivered", () => {
  renderModal(order());
  expect(timelineSteps()).toEqual([
    ["pending_payment", "done"],
    ["paid", "done"],
    ["processing", "done"],
    ["ready_to_ship", "done"],
    ["cancelled", "cancelled"],
    ["refund", "done"],
  ]);
  const timeline = screen.getByTestId("admin-order-timeline");
  expect(within(timeline).getByText("Refund Processed")).toBeTruthy();
  for (const label of ["Shipped", "Out For Delivery", "Delivered"]) {
    expect(within(timeline).queryByText(label)).toBeNull();
  }
});

test("timeline is history-driven: an order cancelled before Ready To Ship never shows it completed; no timestamp is invented", () => {
  const steps = buildAdminOrderTimeline(
    order({ refund_status: "initiated", refund_completed_at: null }),
    HISTORY_100020.filter((h) => ["pending", "paid", "cancelled"].includes(h.new_status)),
  );
  expect(steps.map((s) => [s.key, s.state])).toEqual([
    ["pending_payment", "done"],
    ["paid", "done"],
    ["cancelled", "cancelled"],
    ["refund", "current"],
  ]);
  expect(steps.find((s) => s.key === "refund").timestamp).toBeNull();
  expect(steps.find((s) => s.key === "refund").label).toBe("Refund Initiated");
  expect(steps.find((s) => s.key === "paid").timestamp).toBe("2026-09-30T14:55:35.000Z");
});

// ── 5–7. Cancellation / refund panel ───────────────────────────────────

test("5. cancelled + completed refund → 'Order Cancelled & Refund Processed', no Cancel Order & Refund action", () => {
  renderModal(order());
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled & Refund Processed")).toBeTruthy();
  expect(within(panel).getByText("Cancelled")).toBeTruthy();
  // Admin wording matches the customer's: refund_status 'completed' means
  // Razorpay processed it, not that the bank has credited the customer.
  expect(within(panel).getAllByText(/Refund Processed/).length).toBeGreaterThan(0);
  expect(within(panel).getByText(/₹1/)).toBeTruthy();
  expect(within(panel).getByText("Refund ID: rfnd_TiHycL2ec5A9vh")).toBeTruthy();
  expect(screen.queryByText("Cancel Order & Refund")).toBeNull();
  expect(screen.queryByRole("button", { name: /Cancel Order & Refund|Refund Payment|Retry Refund/ })).toBeNull();
});

test("6. cancelled + initiated refund → 'Order Cancelled' + 'Refund Initiated' (never Completed)", () => {
  renderModal(order({ payment_status: "paid", refund_status: "initiated", refund_completed_at: null }));
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled")).toBeTruthy();
  expect(within(panel).getAllByText(/Refund Initiated/).length).toBeGreaterThan(0);
  expect(within(panel).queryByText(/Refund Completed|Refund Processed/)).toBeNull();
  expect(within(panel).queryByText("Order Cancelled & Refund Processed")).toBeNull();
});

test("7. cancelled + failed refund → 'Order Cancelled' + 'Refund Failed' with the Retry Refund action", () => {
  renderModal(order({ payment_status: "paid", refund_status: "failed", refund_completed_at: null }));
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled")).toBeTruthy();
  expect(within(panel).getByText("Refund Failed")).toBeTruthy();
  expect(within(panel).getByRole("button", { name: /Retry Refund/ })).toBeTruthy();
  expect(timelineSteps().at(-1)).toEqual(["refund", "failed"]);
});

// ── 8–11. Non-cancelled orders unchanged; shipment UX ───────────────────

const activeOrder = (overrides = {}) =>
  order({
    order_status: "processing",
    status: "processing",
    payment_status: "paid",
    refund_status: null,
    refund_amount: null,
    refund_reference: null,
    refund_completed_at: null,
    status_history: [],
    ...overrides,
  });

test("8. normal processing order: existing status controls unchanged and clickable", () => {
  const onStatusChange = jest.fn();
  renderModal(activeOrder(), { onStatusChange });
  expect(screen.getByText("Update Order Status")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ready_to_ship" }));
  expect(onStatusChange).toHaveBeenCalledWith(["9de7a3b0-e4e7-453c-ae5c-4caa993a90ba"], "ready_to_ship");
  expect(screen.queryByTestId("order-status-readonly")).toBeNull();
  // Normal lifecycle timeline unchanged (7 steps, up to Processing done).
  expect(timelineSteps().map(([, state]) => state)).toEqual(["done", "done", "done", "pending", "pending", "pending", "pending"]);
  expect(screen.getByTestId("cancel-refund-panel").textContent).toMatch(/Cancel Order & Refund/);
});

test("9. normal ready_to_ship order: status controls + Ship with Delhivery unchanged", () => {
  renderModal(activeOrder({ order_status: "ready_to_ship", status: "ready_to_ship" }));
  expect(screen.getByRole("button", { name: "processing" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "ready_to_ship" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Ship with Delhivery/ })).toBeTruthy();
  expect(screen.queryByTestId("no-shipment-cancelled")).toBeNull();
});

test("10. shipped order: shipment controls unchanged (Track / Label / Cancel Shipment), Delhivery-synced status", () => {
  renderModal(activeOrder({ order_status: "shipped", status: "shipped", awb_number: "58045510000099", tracking_status: "In Transit", pickup_request_id: "PR1" }));
  expect(screen.getByRole("button", { name: /Track Shipment/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Download Shipping Label/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Cancel Shipment/ }).disabled).toBe(false);
  expect(screen.getByText("Shipping status is automatically synchronized from Delhivery.")).toBeTruthy();
});

test("8b. cancelled + no shipment: explicit notice and no shipment actions", () => {
  renderModal(order());
  expect(screen.getByText("No shipment was created for this cancelled order.")).toBeTruthy();
  for (const name of [/Ship with Delhivery/, /Schedule Pickup/, /Track Shipment/, /Cancel Shipment/]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
});

test("11. cancelled order WITH a shipment keeps its AWB / tracking info; Cancel Shipment is not offered again", () => {
  renderModal(order({ awb_number: "58045510000055", tracking_status: "Cancelled" }));
  expect(screen.queryByTestId("no-shipment-cancelled")).toBeNull();
  expect(screen.getAllByText(/58045510000055/).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /Track Shipment/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Cancel Shipment/ }).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: /Schedule Pickup/ })).toBeNull();
  expect(screen.getByTestId("order-status-readonly")).toBeTruthy();
});

// Admin terminology matches the customer's for refund_status 'completed'
// (Razorpay processed it; the bank credit may still be pending). The DB
// value itself is unchanged — this is UI wording only.
test("completed refund: admin badge, panel and timestamp all say 'Refund Processed'; nothing says Completed or Refunded", () => {
  // Cancel & Refund panel.
  const { unmount } = renderModal(order());
  expect(within(screen.getByTestId("cancel-refund-panel")).getAllByText(/Refund Processed/).length).toBeGreaterThan(0);
  expect(document.body.textContent).not.toMatch(/Refund Completed|Cancelled & Refunded/);
  unmount();

  // Return refund section: status badge + "Refund Processed At".
  renderModal(
    order({
      order_status: "delivered",
      status: "delivered",
      return_status: "returned",
      inspection_status: "approved",
      refund_status: "completed",
      refund_amount: 1,
      refund_completed_at: "2026-09-30T14:56:25.000Z",
    }),
  );
  expect(screen.getAllByText("Refund Processed").length).toBeGreaterThan(0);
  expect(screen.getByText("Refund Processed At")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Refund Completed|Cancelled & Refunded/);
});

test("order details payment badge shows 'Refund Processed' for payment_status 'refunded', never the raw value", () => {
  renderModal(order({ payment_status: "refunded" }));
  expect(screen.getAllByText("Refund Processed").length).toBeGreaterThan(0);
  expect(screen.queryByText(/^refunded$/i)).toBeNull();
});
