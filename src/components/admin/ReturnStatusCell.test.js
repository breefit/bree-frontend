import { render, screen } from "@testing-library/react";
import ReturnStatusCell from "./ReturnStatusCell";
import { getReturnRefundStatus } from "@/lib/returnRefundTimeline";

const baseOrder = (overrides = {}) => ({
  order_status: "delivered",
  return_status: null,
  return_requested_at: null,
  return_approved_at: null,
  reverse_awb: null,
  reverse_tracking_url: null,
  reverse_shipment_created_at: null,
  reverse_shipment_type: null,
  reverse_pickup_request_id: null,
  reverse_tracking_status: null,
  reverse_tracking_raw_status: null,
  reverse_tracking_updated_at: null,
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
  ...overrides,
});

const requestedAt = "2026-10-01T10:00:00.000Z";
const approvedAt = "2026-10-01T11:00:00.000Z";
const returnApproved = (overrides = {}) =>
  baseOrder({
    return_status: "approved",
    return_requested_at: requestedAt,
    return_approved_at: approvedAt,
    ...overrides,
  });

test("delivered order with no return activity has no secondary status", () => {
  expect(getReturnRefundStatus(baseOrder())).toBeNull();
  render(<ReturnStatusCell order={baseOrder()} />);
  expect(screen.getByText("—")).toBeTruthy();
});

test("requested and approved returns show the latest evidenced return stage", () => {
  expect(
    getReturnRefundStatus(
      baseOrder({ return_status: "requested", return_requested_at: requestedAt }),
    ).label,
  ).toBe("Return Requested");
  expect(getReturnRefundStatus(returnApproved()).label).toBe("Return Approved");
});

test("reverse shipment and pickup lifecycle stages use the shared timeline labels", () => {
  expect(
    getReturnRefundStatus(
      returnApproved({
        return_status: "reverse_shipment_created",
        reverse_awb: "return-awb",
        reverse_shipment_type: "rvp",
        reverse_shipment_created_at: requestedAt,
      }),
    ).label,
  ).toBe("Return Shipment Created");

  expect(
    getReturnRefundStatus(
      returnApproved({
        return_status: "pickup_scheduled",
        reverse_awb: "return-awb",
        reverse_shipment_type: "rvp",
        reverse_tracking_status: "pickup_scheduled",
        reverse_pickup_scheduled_at: requestedAt,
      }),
    ).label,
  ).toBe("Pickup Scheduled");

  expect(
    getReturnRefundStatus(
      returnApproved({
        return_status: "pickup_scheduled",
        reverse_awb: "return-awb",
        reverse_shipment_type: "rvp",
        reverse_tracking_status: "in_transit",
        reverse_picked_up_at: approvedAt,
      }),
    ).label,
  ).toBe("In Transit");
});

test("return received remains the current stage while QC is pending", () => {
  const status = getReturnRefundStatus(
    returnApproved({
      return_status: "returned",
      returned_at: approvedAt,
      inspection_status: "pending",
    }),
  );
  expect(status.label).toBe("Return Received");
  expect(status.timestamp).toBe(approvedAt);
});

test("approved QC and refund show Refund Approved until processing starts", () => {
  expect(
    getReturnRefundStatus(
      returnApproved({
        return_status: "returned",
        inspection_status: "approved",
        inspection_completed_at: requestedAt,
        refund_status: "approved",
        refund_approved_at: approvedAt,
      }),
    ),
  ).toEqual({ label: "Refund Approved", timestamp: approvedAt });
});

test.each([
  ["processing", "Refund Processing"],
  ["initiated", "Refund Initiated"],
])("refund status %s is displayed without inferring a later stage", (refund_status, label) => {
  expect(
    getReturnRefundStatus(
      baseOrder({ order_status: "cancelled", refund_status }),
    ).label,
  ).toBe(label);
});

test("a processed refund is shown using its actual completion timestamp", () => {
  expect(
    getReturnRefundStatus(
      returnApproved({
        refund_status: "completed",
        refund_completed_at: approvedAt,
      }),
    ),
  ).toEqual({ label: "Refund Processed", timestamp: approvedAt });
});

test("return and refund rejections are visible", () => {
  expect(
    getReturnRefundStatus(
      baseOrder({
        return_status: "rejected",
        return_requested_at: requestedAt,
      }),
    ).label,
  ).toBe("Return Rejected");
  expect(
    getReturnRefundStatus(baseOrder({ refund_status: "rejected" })).label,
  ).toBe("Refund Rejected");
});

test("cancelled orders retain their original status and show a separate refund status", () => {
  const order = baseOrder({
    order_status: "cancelled",
    refund_status: "completed",
    refund_completed_at: approvedAt,
  });
  expect(order.order_status).toBe("cancelled");
  expect(getReturnRefundStatus(order).label).toBe("Refund Processed");
});

test("table status updates when refreshed order data replaces the row props", () => {
  const { rerender } = render(<ReturnStatusCell order={returnApproved()} />);
  expect(screen.getByText("Return Approved")).toBeTruthy();

  const updatedOrder = returnApproved({
    return_status: "returned",
    inspection_status: "approved",
    refund_status: "processing",
  });
  rerender(<ReturnStatusCell order={updatedOrder} />);

  expect(screen.getByText("Refund Processing")).toBeTruthy();
  expect(screen.queryByText("Return Approved")).toBeNull();
});
