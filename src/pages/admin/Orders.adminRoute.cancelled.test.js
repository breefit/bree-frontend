import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";

// Renders the REAL /admin/orders route component — App.js:
//   <Route path="/admin/orders" element={<ProtectedAdminRoute><Orders/></…>} />
//   const Orders = lazy(() => import("@/pages/admin/Orders"))
// i.e. this file's default export — end to end: list request → table row →
// row "view" button → openOrder() → GET /api/admin/orders/:id → OrderModal.
// Network, socket and the layout chrome are stubbed; no real API is called.
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: (...a) => mockGet(...a),
    post: (...a) => mockPost(...a),
    patch: (...a) => mockPatch(...a),
    isCancel: () => false,
  },
}));
jest.mock("@/hooks/useOrdersSync", () => ({ __esModule: true, default: () => {} }));
jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

// eslint-disable-next-line import/first
import Orders from "./Orders";

// Fixture shaped like the read-only production row of BREE-100020 (values
// copied from a read-only SELECT; the record itself is never touched).
const BREE_100020 = {
  id: "9de7a3b0-e4e7-453c-ae5c-4caa993a90ba",
  order_number: "BREE-100020",
  order_status: "cancelled",
  payment_status: "refunded",
  refund_status: "completed",
  refund_amount: "1.00",
  refund_reference: "rfnd_TiHycL2ec5A9vh",
  refund_completed_at: "2026-09-30T14:56:25.000Z",
  awb_number: null,
  tracking_status: null,
  return_status: null,
  is_subscription: 0,
  total: "1.00",
  amount: "1.00",
  customer_name: "Test Customer",
  created_at: "2026-09-30T14:55:18.000Z",
  items: [],
  reminders: [],
};
const HISTORY = [
  { previous_status: null, new_status: "pending", created_at: "2026-09-30T14:55:18.000Z" },
  { previous_status: "pending_payment", new_status: "paid", created_at: "2026-09-30T14:55:35.000Z" },
  { previous_status: "paid", new_status: "processing", created_at: "2026-09-30T14:56:11.000Z" },
  { previous_status: "processing", new_status: "ready_to_ship", created_at: "2026-09-30T14:56:19.000Z" },
  { previous_status: "ready_to_ship", new_status: "cancelled", created_at: "2026-09-30T14:56:24.000Z" },
];

const setupApi = (overrides = {}) => {
  const listRow = { ...BREE_100020, ...overrides };
  mockGet.mockImplementation((url) => {
    if (/\/api\/admin\/orders\?/.test(url)) {
      return Promise.resolve({ data: { orders: [listRow], total: 1 } });
    }
    if (url === `/api/admin/orders/${BREE_100020.id}`) {
      return Promise.resolve({ data: { ...listRow, status_history: HISTORY } });
    }
    return Promise.resolve({ data: {} });
  });
};

const openOrderFromTable = async () => {
  render(<Orders />);
  const cell = await screen.findByText("#BREE-100020");
  const row = cell.closest("tr");
  // The row's own table cell for order status is a static badge.
  const rowButtons = within(row).getAllByRole("button");
  fireEvent.click(rowButtons[rowButtons.length - 1]);
  await screen.findByTestId("order-status-readonly");
  return row;
};

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockPatch.mockReset();
});

test("/admin/orders → BREE-100020 (cancelled, refund completed, no shipment): the new cancelled-order UI is what renders", async () => {
  setupApi();
  const row = await openOrderFromTable();
  const text = document.body.textContent;

  // Read-only cancelled order status.
  expect(within(screen.getByTestId("order-status-readonly")).getByText("Cancelled")).toBeTruthy();
  expect(text).toMatch(/This order has been cancelled and cannot be moved back to\s+an active fulfillment status\./);
  expect(text).toMatch(/Order Status:\s*Cancelled/);

  // Old UI strings absent (headings are CSS-uppercased; the DOM text is not).
  expect(text).not.toMatch(/cancel order & refund/i);
  expect(text).not.toMatch(/update order status/i);
  expect(screen.queryByRole("button", { name: /^processing$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^ready_to_ship$/i })).toBeNull();

  // Result panel.
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled & Refunded")).toBeTruthy();
  expect(panel.textContent).toMatch(/Refund:\s*Refund Completed · ₹1/);
  expect(within(panel).queryAllByRole("button")).toHaveLength(0);

  // History-driven timeline: no Shipped / Out For Delivery / Delivered.
  const timeline = screen.getByTestId("admin-order-timeline");
  const steps = [...timeline.querySelectorAll("[data-step]")].map((el) => [
    el.getAttribute("data-step"),
    el.getAttribute("data-state"),
  ]);
  expect(steps).toEqual([
    ["pending_payment", "done"],
    ["paid", "done"],
    ["processing", "done"],
    ["ready_to_ship", "done"],
    ["cancelled", "cancelled"],
    ["refund", "done"],
  ]);
  for (const label of ["Shipped", "Out For Delivery", "Delivered"]) {
    expect(within(timeline).queryByText(label)).toBeNull();
  }
  expect(within(timeline).getByText("Refund Completed")).toBeTruthy();

  // Shipment.
  expect(screen.getByText("No shipment was created for this cancelled order.")).toBeTruthy();
  for (const name of [/Ship with Delhivery/, /Schedule Pickup/, /Track Shipment/, /Cancel Shipment/]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }

  // Orders table: header + static status badge (no dropdown).
  expect(screen.getByRole("columnheader", { name: "Order Status" })).toBeTruthy();
  expect(within(row).queryByRole("combobox")).toBeNull();
  expect(within(row).getByText("cancelled")).toBeTruthy();
  expect(within(row).getByText("refunded")).toBeTruthy();

  // Nothing was mutated: only GETs were made.
  expect(mockPost).not.toHaveBeenCalled();
  expect(mockPatch).not.toHaveBeenCalled();
});

test("/admin/orders → cancelled + refund initiated: 'Order Cancelled' + 'Refund Initiated', no Completed", async () => {
  setupApi({ payment_status: "paid", refund_status: "initiated", refund_completed_at: null });
  await openOrderFromTable();
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled")).toBeTruthy();
  expect(panel.textContent).toMatch(/Refund:\s*Refund Initiated/);
  expect(document.body.textContent).not.toMatch(/Refund Completed|Order Cancelled & Refunded/);
  expect(document.body.textContent).not.toMatch(/cancel order & refund/i);
});

test("/admin/orders → cancelled + refund processing: 'Order Cancelled' + 'Refund Processing'", async () => {
  setupApi({ payment_status: "paid", refund_status: "processing", refund_completed_at: null });
  await openOrderFromTable();
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled")).toBeTruthy();
  expect(panel.textContent).toMatch(/Refund:\s*Refund Processing/);
});

test("/admin/orders → cancelled + refund failed: 'Order Cancelled' + 'Refund Failed', Retry Refund whose dialog never says Cancel Order & Refund", async () => {
  setupApi({ payment_status: "paid", refund_status: "failed", refund_completed_at: null });
  await openOrderFromTable();
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled")).toBeTruthy();
  expect(panel.textContent).toMatch(/Refund:\s*Refund Failed/);
  fireEvent.click(within(panel).getByRole("button", { name: /Retry Refund/ }));
  expect(await screen.findAllByText("Retry Refund")).not.toHaveLength(0);
  expect(document.body.textContent).not.toMatch(/cancel order & refund/i);
  expect(mockPost).not.toHaveBeenCalled();
});

test("/admin/orders → cancelled but never refunded: 'Refund Payment' (refund-only wording, no cancellation wording)", async () => {
  setupApi({ payment_status: "paid", refund_status: null, refund_amount: null, refund_reference: null, refund_completed_at: null });
  await openOrderFromTable();
  const panel = screen.getByTestId("cancel-refund-panel");
  expect(within(panel).getByText("Order Cancelled")).toBeTruthy();
  fireEvent.click(within(panel).getByRole("button", { name: /Refund Payment/ }));
  await screen.findAllByText("Refund Payment");
  expect(document.body.textContent).toMatch(/This order is already cancelled/);
  expect(document.body.textContent).not.toMatch(/cancel order & refund/i);
  expect(mockPost).not.toHaveBeenCalled();
});
