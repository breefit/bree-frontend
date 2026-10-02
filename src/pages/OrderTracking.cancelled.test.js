import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";

// Real OrderTracking page, network + router + socket stubbed. Verifies what
// the customer actually sees for BREE-100020's shape: cancelled, no
// shipment, refund initiated.
const mockGet = jest.fn();
jest.mock("@/lib/api", () => ({ __esModule: true, default: { get: (...args) => mockGet(...args) } }));
jest.mock("@/hooks/useOrdersSync", () => ({ __esModule: true, default: () => {} }));
jest.mock("react-helmet-async", () => ({ Helmet: () => null }));
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "9de7a3b0-e4e7-453c-ae5c-4caa993a90ba" }),
  useNavigate: () => jest.fn(),
  Link: ({ children }) => children,
}));

// eslint-disable-next-line import/first
import OrderTracking from "./OrderTracking";

const trackingResponse = (orderOverrides = {}) => ({
  data: {
    success: true,
    order: {
      id: "9de7a3b0-e4e7-453c-ae5c-4caa993a90ba",
      order_number: "BREE-100020",
      order_status: "cancelled",
      payment_status: "paid",
      created_at: "2026-09-30T14:55:18Z",
      total: 1,
      has_shipment: false,
      return_status: null,
      refund_status: "initiated",
      refund_amount: 1,
      items: [],
      reminders: [],
      ...orderOverrides,
    },
    items: [],
    history: [
      { new_status: "pending", created_at: "2026-09-30T14:55:18Z" },
      { new_status: "paid", created_at: "2026-09-30T14:55:35Z" },
      { new_status: "processing", created_at: "2026-09-30T14:56:11Z" },
      { new_status: "ready_to_ship", created_at: "2026-09-30T14:56:19Z" },
      { new_status: "cancelled", created_at: "2026-09-30T14:56:24Z" },
    ],
  },
});

beforeEach(() => mockGet.mockReset());

test("cancelled + no shipment + refund initiated: cancellation explanation, Cancelled timeline, Refund Initiated (not Completed), no live tracking call", async () => {
  mockGet.mockResolvedValue(trackingResponse());
  render(<OrderTracking />);

  await waitFor(() =>
    expect(screen.getByText("Shipment was not created because this order was cancelled.")).toBeTruthy(),
  );
  expect(screen.queryByText("Shipment has not been created yet.")).toBeNull();
  expect(screen.queryByText("In progress")).toBeNull();
  expect(screen.queryByText("Shipped")).toBeNull();
  expect(screen.queryByText("Out for Delivery")).toBeNull();

  const refund = screen.getByTestId("cancellation-refund");
  expect(within(refund).getAllByText("Refund Initiated").length).toBeGreaterThan(0);
  expect(within(refund).queryByText(/Your refund has been processed/)).toBeNull();
  expect(refund.textContent).not.toMatch(/rfnd_|627320498946|pay_/);

  expect(mockGet.mock.calls.map(([url]) => url)).toEqual([
    "/api/orders/9de7a3b0-e4e7-453c-ae5c-4caa993a90ba/tracking",
  ]);
});

test("cancelled order whose refund completed shows Refund Processed only then", async () => {
  mockGet.mockResolvedValue(trackingResponse({ refund_status: "completed" }));
  render(<OrderTracking />);
  const refund = await screen.findByTestId("cancellation-refund");
  expect(within(refund).getAllByText("Refund Processed").length).toBeGreaterThan(0);
});

test("cancelled order WITH a shipment keeps the live shipment tracking (has_shipment drives it)", async () => {
  mockGet.mockImplementation((url) =>
    url.endsWith("/live-tracking")
      ? Promise.resolve({ data: { liveTracking: { trackingStatus: "Cancelled", isTerminal: true } } })
      : Promise.resolve(trackingResponse({ has_shipment: true, refund_status: null })),
  );
  render(<OrderTracking />);
  await waitFor(() =>
    expect(mockGet.mock.calls.some(([url]) => url.endsWith("/live-tracking"))).toBe(true),
  );
  expect(screen.queryByText("Shipment was not created because this order was cancelled.")).toBeNull();
});
