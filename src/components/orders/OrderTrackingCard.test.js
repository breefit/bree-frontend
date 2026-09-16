import { render, screen } from "@testing-library/react";
import OrderTrackingCard from "./OrderTrackingCard";

/**
 * ISSUE-006 — Customer shipping-label broken endpoint.
 *
 * OrderTrackingCard (rendered on the customer-facing order tracking page)
 * used to render a "Download Shipping Label" button that called
 * GET /api/shipping/label/:awb — a route mounted behind adminAuth
 * (bree-backend/src/routes/shippingRoutes.js). A real customer never holds
 * an admin token, so every click 401'd — a visible, reproducible broken
 * button on a customer-facing page.
 *
 * Decision: removed rather than building a new customer-facing label
 * endpoint — a shipping label is a warehouse/courier document (the same
 * Delhivery-format PDF staff print to stick on the package), not something
 * a customer has a real use for. The "Track Shipment" link (a legitimate,
 * customer-relevant action) is kept.
 *
 * This test renders the real component (not a source-text regex) with an
 * order that has a real AWB/tracking URL — exactly the state that used to
 * show the broken button — and asserts the label button is gone for good
 * while tracking still works.
 */

const orderWithShipment = {
  id: "order-1",
  order_number: "BRE-1234",
  status: "shipped",
  order_status: "shipped",
  created_at: new Date().toISOString(),
  delhivery_awb: "AWB123456789",
  tracking_url: "https://www.delhivery.com/track/AWB123456789",
  courier_name: "Delhivery",
  tracking_status: "In Transit",
};

test("ISSUE-006: no 'Download Shipping Label' button is ever rendered on the customer tracking card, even when an AWB/label would exist", () => {
  render(<OrderTrackingCard order={orderWithShipment} />);
  expect(screen.queryByText(/download shipping label/i)).toBeNull();
  expect(
    screen.queryByRole("button", { name: /label/i }),
  ).toBeNull();
});

test("ISSUE-006 regression: the legitimate 'Track Shipment' link is still rendered for a shipped order with a tracking URL", () => {
  render(<OrderTrackingCard order={orderWithShipment} />);
  const trackingLink = screen.getByRole("link", { name: /track shipment/i });
  expect(trackingLink.getAttribute("href")).toBe(orderWithShipment.tracking_url);
});

test("ISSUE-006 regression: an order with no shipment yet renders without crashing and without any label affordance", () => {
  render(
    <OrderTrackingCard
      order={{ id: "order-2", order_number: "BRE-0001", status: "pending_payment" }}
    />,
  );
  expect(screen.queryByText(/download shipping label/i)).toBeNull();
});
