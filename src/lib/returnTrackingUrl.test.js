import { render, screen, within } from "@testing-library/react";

// Same pre-existing toolchain gap as Orders.approveRefund.test.js:
// AdminLayout's "react-router/dom" import cannot resolve under Jest.
jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: () => null,
}));

import {
  buildReturnRefundTimeline,
  resolveDelhiveryTrackingUrl,
  DELHIVERY_PUBLIC_TRACKING_BASE,
} from "./returnRefundTimeline";
import ReturnRefundTimeline from "@/components/orders/ReturnRefundTimeline";
import { OrderModal } from "@/pages/admin/Orders";

/**
 * The admin "Reverse Tracking URL → Track" link for the LEGACY return
 * BREE-100018 / reverse AWB 58045510000044 (Delhivery UD/Manifested).
 *
 * The stored link was https://tracking.delhivery.com/track/shipment/<awb>;
 * that host has no DNS record, so clicking "Track" could never load. Both
 * the admin modal and the customer timeline now render the link from the
 * shared resolver, which rebuilds dead-host links from the reverse AWB
 * without touching the stored value.
 */

const LEGACY_AWB = "58045510000044";
const FORWARD_AWB = "58045510000011";
const EXPECTED_URL = `https://www.delhivery.com/track-v2/package/${LEGACY_AWB}`;

const legacyReturnOrder = (extra = {}) => ({
  id: "00000000-0000-4000-8000-000000000018",
  order_number: "BREE-100018",
  order_status: "delivered",
  status: "delivered",
  payment_status: "paid",
  delivered_at: "2026-09-24T04:30:00Z",
  total: 900,
  items: [],
  reminders: [],
  // Forward shipment — must never leak into the return link.
  awb_number: FORWARD_AWB,
  tracking_url: `https://www.delhivery.com/track-v2/package/${FORWARD_AWB}`,
  tracking_status: "Delivered",
  return_status: "reverse_shipment_created",
  return_requested_at: "2026-09-25T04:30:00Z",
  return_approved_at: "2026-09-25T04:35:00Z",
  reverse_awb: LEGACY_AWB,
  reverse_tracking_url: `https://tracking.delhivery.com/track/shipment/${LEGACY_AWB}`,
  reverse_shipment_created_at: "2026-09-25T04:40:00Z",
  reverse_shipment_type: null,
  reverse_pickup_request_id: null,
  reverse_tracking_status: "unknown",
  reverse_tracking_raw_status: "UD/Manifested",
  reverse_tracking_updated_at: "2026-09-28T04:00:00Z",
  reverse_pickup_scheduled_at: null,
  reverse_picked_up_at: null,
  reverse_delivered_at: null,
  returned_at: null,
  returned_source: null,
  inspection_status: null,
  inspection_completed_at: null,
  refund_status: null,
  refund_amount: null,
  refund_approved_at: null,
  refund_completed_at: null,
  ...extra,
});

describe("resolveDelhiveryTrackingUrl", () => {
  test("C: dead tracking.delhivery.com link for 58045510000044 is rebuilt from the AWB", () => {
    expect(
      resolveDelhiveryTrackingUrl(LEGACY_AWB, `https://tracking.delhivery.com/track/shipment/${LEGACY_AWB}`),
    ).toBe(EXPECTED_URL);
    expect(DELHIVERY_PUBLIC_TRACKING_BASE).toBe("https://www.delhivery.com/track-v2/package/");
  });

  test("a working stored link (e.g. a DELHIVERY_TRACKING_URL override) is kept as-is", () => {
    const stored = `https://www.delhivery.com/track/package/${LEGACY_AWB}`;
    expect(resolveDelhiveryTrackingUrl(LEGACY_AWB, stored)).toBe(stored);
  });

  test("non-http or unparseable stored values never become an href", () => {
    expect(resolveDelhiveryTrackingUrl(LEGACY_AWB, "javascript:alert(1)")).toBe(EXPECTED_URL);
    expect(resolveDelhiveryTrackingUrl(LEGACY_AWB, "not a url")).toBe(EXPECTED_URL);
    expect(resolveDelhiveryTrackingUrl(null, "javascript:alert(1)")).toBeNull();
  });

  test("E: missing reverse AWB and no link → null; AWB is URL-encoded and trimmed", () => {
    expect(resolveDelhiveryTrackingUrl(null, null)).toBeNull();
    expect(resolveDelhiveryTrackingUrl("  ", "")).toBeNull();
    expect(resolveDelhiveryTrackingUrl(" A/B ", null)).toBe(`${DELHIVERY_PUBLIC_TRACKING_BASE}A%2FB`);
  });
});

describe("legacy return BREE-100018 timeline", () => {
  test("B/C/M: reverse link is built from reverse_awb, never the forward awb_number/tracking_url", () => {
    const t = buildReturnRefundTimeline(legacyReturnOrder());
    expect(t.reverseShipment).toEqual({ awb: LEGACY_AWB, trackingUrl: EXPECTED_URL });
    expect(t.reverseShipment.trackingUrl).not.toContain(FORWARD_AWB);
  });

  test("G/H/8/11: UD/Manifested on a legacy shipment claims no pickup and no receipt", () => {
    const t = buildReturnRefundTimeline(legacyReturnOrder());
    expect(t.tracking).toMatchObject({
      status: "unknown",
      label: "Status update received",
      rawStatus: "UD/Manifested",
      legacyShipment: true,
    });
    const s = Object.fromEntries(t.steps.map((x) => [x.key, x.state]));
    expect(s.reverse_shipment_created).toBe("current");
    expect(s.pickup_scheduled).toBe("pending");
    expect(s.picked_up).toBe("pending");
    expect(s.in_transit).toBe("pending");
    expect(s.returned).toBe("pending");
    expect(t.steps.find((x) => x.key === "pickup_scheduled").label).toBe("Pickup Requested (legacy)");
  });

  test("E: approved return without a reverse shipment has no tracking link", () => {
    const t = buildReturnRefundTimeline(
      legacyReturnOrder({ return_status: "approved", reverse_awb: null, reverse_tracking_url: null }),
    );
    expect(t.reverseShipment.trackingUrl).toBeNull();
  });

  test("M: an order with only a forward shipment produces no return timeline or return link", () => {
    expect(
      buildReturnRefundTimeline(
        legacyReturnOrder({ return_status: null, reverse_awb: null, reverse_tracking_url: null }),
      ),
    ).toBeNull();
  });
});

const noop = async () => {};
const renderAdminModal = (order) =>
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
    />,
  );

describe("rendered Track links", () => {
  test("9: admin 'Reverse Tracking URL → Track' opens Delhivery for 58045510000044 in a new tab", () => {
    renderAdminModal(legacyReturnOrder());
    const row = screen.getByText("Reverse Tracking URL").parentElement;
    const link = within(row).getByRole("link", { name: "Track" });
    expect(link.getAttribute("href")).toBe(EXPECTED_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("8: admin keeps the legacy warning and shows the raw UD/Manifested status", () => {
    renderAdminModal(legacyReturnOrder());
    expect(screen.getByText(/created before the\s+reverse-pickup fix/)).toBeTruthy();
    expect(screen.getByText(/Status update received \(UD\/Manifested\)/)).toBeTruthy();
  });

  test("E: admin shows no Track link when there is no reverse AWB", () => {
    renderAdminModal(
      legacyReturnOrder({ return_status: "approved", reverse_awb: null, reverse_tracking_url: null }),
    );
    expect(screen.queryByText("Reverse Tracking URL")).toBeNull();
  });

  test("12/O: customer timeline renders the same link, new tab, for the same state", () => {
    const order = legacyReturnOrder();
    render(<ReturnRefundTimeline timeline={buildReturnRefundTimeline(order)} order={order} />);
    const link = screen.getByRole("link", { name: "Track your return shipment" });
    expect(link.getAttribute("href")).toBe(EXPECTED_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText(`Courier: Delhivery · AWB: ${LEGACY_AWB}`)).toBeTruthy();
  });
});
