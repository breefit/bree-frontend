import { render, screen } from "@testing-library/react";
import OrderTrackingCard from "./OrderTrackingCard";

/**
 * PHASE 3 — Medium Issue #18: this card used to show raw Delhivery courier
 * jargon (Manifested, Bagged, Reached Destination Hub) and internal
 * Shipment ID / Pickup Request ID handles directly to customers. Fixed to
 * map known statuses to clean customer-facing labels (falling back to the
 * raw value for anything unmapped, never hiding it) and to drop the two
 * internal-ID rows entirely.
 */

const baseOrder = {
  id: "order-1",
  order_number: "BRE-1234",
  status: "shipped",
  order_status: "shipped",
  created_at: new Date().toISOString(),
  delhivery_awb: "AWB123456789",
  courier_name: "Delhivery",
};

test("ISSUE-018: raw Delhivery jargon statuses are translated to clean customer-facing labels", () => {
  const cases = [
    ["Manifested", "Order Received by Courier"],
    ["Bagged", "Preparing for Dispatch"],
    ["Reached Destination Hub", "Arrived at Local Facility"],
  ];

  for (const [rawStatus, expectedLabel] of cases) {
    const { unmount } = render(
      <OrderTrackingCard order={{ ...baseOrder, tracking_status: rawStatus }} />,
    );
    expect(screen.queryByText(rawStatus)).toBeNull();
    expect(screen.getAllByText(expectedLabel).length).toBeGreaterThan(0);
    unmount();
  }
});

test("ISSUE-018: an unmapped/future Delhivery status still shows SOMETHING rather than disappearing silently", () => {
  render(<OrderTrackingCard order={{ ...baseOrder, tracking_status: "Some Future Status" }} />);
  expect(screen.getAllByText("Some Future Status").length).toBeGreaterThan(0);
});

test("ISSUE-018: internal Shipment ID and Pickup Request ID are never shown to the customer", () => {
  render(
    <OrderTrackingCard
      order={{
        ...baseOrder,
        tracking_status: "In Transit",
        shipment_id: "SHIP-INTERNAL-999",
        pickup_request_id: "PICKUP-INTERNAL-888",
      }}
    />,
  );
  expect(screen.queryByText(/shipment id/i)).toBeNull();
  expect(screen.queryByText(/pickup request id/i)).toBeNull();
  expect(screen.queryByText("SHIP-INTERNAL-999")).toBeNull();
  expect(screen.queryByText("PICKUP-INTERNAL-888")).toBeNull();
});

test("ISSUE-018 regression: a missing tracking status still shows 'Unknown', not a crash or blank", () => {
  render(<OrderTrackingCard order={{ ...baseOrder }} />);
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
});
