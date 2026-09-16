import { render, screen, fireEvent, act } from "@testing-library/react";

// Orders.js's top-level imports pull in AdminLayout (used only by the
// outer Orders page, never by OrderModal itself), and this project's
// installed react-router-dom/Jest resolver combination cannot currently
// resolve AdminLayout's "react-router/dom" subpath import outside a real
// app build — a pre-existing toolchain gap, unrelated to this fix.
// Mocking AdminLayout out lets OrderModal (the actual component under
// test) render for real with zero effect on its own behavior.
jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: () => null,
}));

import { OrderModal } from "./Orders";

/**
 * ISSUE-005 — Approve Refund frontend/backend contract mismatch.
 *
 * The admin "Approve Refund" button is a plain confirm modal with no
 * amount input field (see the `approve_refund` entry in this file's
 * CONFIRM_MODAL_CONFIG and the "none need extra input" comment above
 * handleConfirmModalSubmit) — clicking it always PATCHes an EMPTY body.
 * The backend used to hard-require a positive `refund_amount` in that
 * body, so every real click 400'd and refunds could never be approved
 * through the admin panel at all (see bree-backend's
 * resolveApprovedRefundAmount / approveRefund fix for ISSUE-005).
 *
 * This test drives the real OrderModal component end-to-end — render,
 * find the button, click it, confirm the modal — and asserts exactly what
 * request shape reaches the parent's onApproveRefund handler, so this
 * contract can never silently drift from what the backend now accepts.
 */

const baseOrder = (overrides = {}) => ({
  id: "order-refund-test-1",
  order_number: "BRE-9001",
  order_status: "delivered",
  status: "delivered",
  payment_status: "paid",
  delivered_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  return_status: "returned",
  inspection_status: "approved",
  refund_status: null,
  refund_amount: null,
  total: 799,
  items: [],
  reminders: [],
  ...overrides,
});

const noop = async () => {};

const renderOrderModal = (order, overrideProps = {}) =>
  render(
    <OrderModal
      order={order}
      onClose={noop}
      onStatusChange={noop}
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
      {...overrideProps}
    />,
  );

test("ISSUE-005: the 'Approve Refund' button is rendered once the return has passed quality check and no refund exists yet", () => {
  renderOrderModal(baseOrder());
  expect(
    screen.getByRole("button", { name: "Approve Refund" }),
  ).toBeTruthy();
});

test("ISSUE-005: the 'Approve Refund' button does NOT appear before quality check has passed", () => {
  renderOrderModal(baseOrder({ inspection_status: "pending" }));
  expect(screen.queryByRole("button", { name: "Approve Refund" })).toBeNull();
});

test("ISSUE-005: clicking Approve Refund, then confirming, calls onApproveRefund with ONLY the order id — no amount, matching the fixed backend's accepted empty-body contract", async () => {
  const calls = [];
  const onApproveRefund = async (...args) => {
    calls.push(args);
  };
  renderOrderModal(baseOrder(), { onApproveRefund });

  fireEvent.click(screen.getByRole("button", { name: "Approve Refund" }));

  // The confirm modal is now open — its own button shares the same visible
  // label ("Approve Refund"), so there are two matching buttons: the
  // original trigger (now behind the modal) and the modal's confirm
  // button, which is the last one in DOM order.
  const matchingButtons = screen.getAllByRole("button", {
    name: "Approve Refund",
  });
  expect(matchingButtons.length).toBe(2);

  // handleConfirmModalSubmit is async (awaits onApproveRefund then sets
  // state) — act() flushes it so the resulting state update isn't left
  // dangling past the test.
  await act(async () => {
    fireEvent.click(matchingButtons[matchingButtons.length - 1]);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(calls.length).toBe(1);
  // Exactly one argument: the order id. No refund_amount, no body object
  // of any kind — this IS the contract the backend fix (ISSUE-005,
  // resolveApprovedRefundAmount) now defaults to a full refund for.
  expect(calls[0]).toEqual(["order-refund-test-1"]);
});
