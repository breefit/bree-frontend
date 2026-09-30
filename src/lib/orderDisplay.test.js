import React from "react";
import { render, screen, within } from "@testing-library/react";
import TrackingTimeline from "@/components/orders/TrackingTimeline";
import {
  buildCancellationRefundSteps,
  buildCustomerTimeline,
  CANCELLED_NO_SHIPMENT_MESSAGE,
  getCustomerRefundLabel,
  getNoShipmentMessage,
  getOrderActionLabel,
  hasShipment,
} from "./orderDisplay";

// Customer Orders list / tracking page rules (BREE-100020: a cancelled
// order with no shipment showed "Track Order", "Shipment has not been
// created yet." and Ready to Ship "In progress").

const order = (overrides = {}) => ({
  id: "9de7a3b0-e4e7-453c-ae5c-4caa993a90ba",
  order_number: "BREE-100020",
  created_at: "2026-09-30T14:55:18Z",
  has_shipment: false,
  ...overrides,
});

const history = [
  { new_status: "pending", created_at: "2026-09-30T14:55:18Z" },
  { new_status: "paid", created_at: "2026-09-30T14:55:35Z" },
  { new_status: "processing", created_at: "2026-09-30T14:56:11Z" },
  { new_status: "ready_to_ship", created_at: "2026-09-30T14:56:19Z" },
  { new_status: "cancelled", created_at: "2026-09-30T14:56:24Z" },
];

describe("Orders list action button", () => {
  test.each([
    ["processing", false],
    ["ready_to_ship", false],
    ["ready_to_ship", true],
    ["shipped", true],
    ["delivered", true],
  ])("%s (shipment=%s) → Track Order", (status, shipped) => {
    expect(getOrderActionLabel(order({ order_status: status, has_shipment: shipped }))).toBe("Track Order");
  });

  test("cancelled + no shipment → View Details", () => {
    expect(getOrderActionLabel(order({ order_status: "cancelled", has_shipment: false }))).toBe("View Details");
  });

  test("cancelled + shipment exists (authoritative has_shipment) → Track Order", () => {
    expect(getOrderActionLabel(order({ order_status: "cancelled", has_shipment: true }))).toBe("Track Order");
  });

  test("shipment existence never comes from order_status or tracking text", () => {
    expect(hasShipment(order({ order_status: "shipped", tracking_status: "In Transit", has_shipment: false }))).toBe(false);
    expect(hasShipment(order({ order_status: "cancelled", tracking_status: "Not Picked", has_shipment: 1 }))).toBe(true);
    expect(hasShipment(order({ has_shipment: undefined, awb_number: "58045510000055" }))).toBe(true);
  });
});

describe("Shipment explanation", () => {
  test("cancelled + no shipment → cancellation explanation, not 'not created yet'", () => {
    const message = getNoShipmentMessage(order({ order_status: "cancelled" }));
    expect(message).toBe("Shipment was not created because this order was cancelled.");
    expect(message).not.toMatch(/not been created yet/);
  });

  test("an active order without a shipment still says it has not been created yet", () => {
    expect(getNoShipmentMessage(order({ order_status: "ready_to_ship" }))).toBe("Shipment has not been created yet.");
  });
});

describe("Customer timeline", () => {
  test("cancelled branch: only reached steps, then Cancelled — no Shipped / Out for Delivery / Delivered", () => {
    const { steps, currentStatus } = buildCustomerTimeline(order({ order_status: "cancelled" }), history);
    expect(steps.map((s) => s.label)).toEqual(["Order Placed", "Paid", "Processing", "Ready to Ship", "Cancelled"]);
    expect(currentStatus).toBe("cancelled");
  });

  test("cancelled order renders Ready to Ship as Completed (reached), never 'In progress'; Cancelled is the terminal step", () => {
    const { steps, currentStatus } = buildCustomerTimeline(order({ order_status: "cancelled" }), history);
    render(<TrackingTimeline steps={steps} currentStatus={currentStatus} />);
    expect(screen.queryByText("In progress")).toBeNull();
    const readyRow = screen.getByText("Ready to Ship").closest("div.flex-1");
    expect(within(readyRow).getByText("Completed")).toBeTruthy();
    const cancelledRow = screen.getByText("Cancelled", { selector: "h4" }).closest("div.flex-1");
    expect(within(cancelledRow).getByText("Cancelled", { selector: "p" })).toBeTruthy();
    for (const label of ["Shipped", "Out for Delivery", "Delivered", "Awaiting Pickup"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  test("an order cancelled straight after payment never shows Ready to Ship at all", () => {
    const { steps } = buildCustomerTimeline(order({ order_status: "cancelled" }), history.filter((h) => ["pending", "paid", "cancelled"].includes(h.new_status)));
    expect(steps.map((s) => s.label)).toEqual(["Order Placed", "Paid", "Cancelled"]);
  });

  test("normal orders keep the full 7-step lifecycle with the current status active (unchanged)", () => {
    const { steps, currentStatus } = buildCustomerTimeline(order({ order_status: "ready_to_ship" }), history.slice(0, 4));
    expect(steps).toHaveLength(7);
    expect(currentStatus).toBe("ready_to_ship");
    render(<TrackingTimeline steps={steps} currentStatus={currentStatus} />);
    const readyRow = screen.getByText("Ready to Ship").closest("div.flex-1");
    expect(within(readyRow).getByText("In progress")).toBeTruthy();
  });
});

describe("Customer refund display", () => {
  test("labels follow the backend refund state exactly", () => {
    expect(getCustomerRefundLabel("processing")).toBe("Refund Processing");
    expect(getCustomerRefundLabel("initiated")).toBe("Refund Initiated");
    expect(getCustomerRefundLabel("completed")).toBe("Refund Completed");
    expect(getCustomerRefundLabel("failed")).toBe("Refund Failed");
  });

  test("initiated refund is NOT shown as completed", () => {
    const steps = buildCancellationRefundSteps("initiated");
    expect(steps.map((s) => [s.label, s.state])).toEqual([
      ["Refund Processing", "done"],
      ["Refund Initiated", "current"],
      ["Refund Completed", "pending"],
    ]);
  });

  test("processing → Processing current; completed → all done; failed → failed branch", () => {
    expect(buildCancellationRefundSteps("processing").map((s) => s.state)).toEqual(["current", "pending", "pending"]);
    expect(buildCancellationRefundSteps("completed").map((s) => s.state)).toEqual(["done", "done", "done"]);
    expect(buildCancellationRefundSteps("failed")).toEqual([
      { key: "refund_processing", label: "Refund Processing", state: "done" },
      { key: "refund_failed", label: "Refund Failed", state: "failed" },
    ]);
    expect(buildCancellationRefundSteps(null)).toEqual([]);
  });

  test("the cancellation message constant is the exact customer copy", () => {
    expect(CANCELLED_NO_SHIPMENT_MESSAGE).toBe("Shipment was not created because this order was cancelled.");
  });
});
