import { buildReturnRefundTimeline } from "./returnRefundTimeline";

// The single return/refund timeline used by BOTH the admin order details
// and the customer tracking page. Every step must be backed by its own
// evidence (a DB field set by an admin action, Delhivery reverse tracking,
// or Razorpay) — never marked done just because a neighbouring step is.

const baseOrder = () => ({
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
});

const T = {
  requested: "2026-09-26T01:33:00Z",
  approved: "2026-09-26T01:33:00Z",
  created: "2026-09-26T01:40:00Z",
  scheduled: "2026-09-26T04:00:00Z",
  pickedUp: "2026-09-27T06:00:00Z",
  delivered: "2026-09-28T09:00:00Z",
  returned: "2026-09-28T09:00:00Z",
  qc: "2026-09-28T11:00:00Z",
  refundApproved: "2026-09-28T12:00:00Z",
  refundCompleted: "2026-09-30T08:00:00Z",
};

const rvpShipment = (extra = {}) => ({
  ...baseOrder(),
  return_status: "reverse_shipment_created",
  return_requested_at: T.requested,
  return_approved_at: T.approved,
  reverse_awb: "RVPAWB1",
  reverse_tracking_url: "https://www.delhivery.com/track/package/RVPAWB1",
  reverse_shipment_created_at: T.created,
  reverse_shipment_type: "rvp",
  ...extra,
});

const states = (timeline) => Object.fromEntries(timeline.steps.map((s) => [s.key, s.state]));
const step = (timeline, key) => timeline.steps.find((s) => s.key === key);

test("no return_status at all -> null (caller keeps the Returns & Support panel)", () => {
  expect(buildReturnRefundTimeline(baseOrder())).toBeNull();
  expect(buildReturnRefundTimeline(null)).toBeNull();
  expect(buildReturnRefundTimeline(undefined)).toBeNull();
});

test("approved -> Requested done, Approved current, every courier/refund step pending", () => {
  const t = buildReturnRefundTimeline({
    ...baseOrder(),
    return_status: "approved",
    return_requested_at: T.requested,
    return_approved_at: T.approved,
  });
  const s = states(t);
  expect(s.return_requested).toBe("done");
  expect(s.return_approved).toBe("current");
  for (const key of ["reverse_shipment_created", "pickup_scheduled", "picked_up", "in_transit", "returned", "inspection_approved", "refund_approved", "refund_completed"]) {
    expect(s[key]).toBe("pending");
  }
  expect(step(t, "return_approved").timestamp).toBe(T.approved);
});

test("reverse shipment created, Delhivery not yet reported -> Shipment Created current, Pickup Scheduled pending", () => {
  const t = buildReturnRefundTimeline(rvpShipment());
  expect(states(t).reverse_shipment_created).toBe("current");
  expect(states(t).pickup_scheduled).toBe("pending");
  expect(step(t, "reverse_shipment_created").timestamp).toBe(T.created);
});

test("Delhivery PP/Open (pickup_requested) is NOT evidence that pickup is scheduled", () => {
  const t = buildReturnRefundTimeline(rvpShipment({ reverse_tracking_status: "pickup_requested" }));
  expect(states(t).pickup_scheduled).toBe("pending");
  expect(t.tracking.label).toBe("Pickup requested");
});

test("Delhivery PP/Scheduled -> Pickup Scheduled current with its own timestamp; Picked Up still pending", () => {
  const t = buildReturnRefundTimeline(
    rvpShipment({
      return_status: "pickup_scheduled",
      reverse_tracking_status: "pickup_scheduled",
      reverse_pickup_scheduled_at: T.scheduled,
    }),
  );
  expect(states(t).pickup_scheduled).toBe("current");
  expect(step(t, "pickup_scheduled").timestamp).toBe(T.scheduled);
  expect(states(t).picked_up).toBe("pending");
  expect(states(t).returned).toBe("pending");
});

test("Delhivery PU/* (in_transit) -> Picked Up done with timestamp, In Transit current, Returned pending", () => {
  const t = buildReturnRefundTimeline(
    rvpShipment({
      return_status: "pickup_scheduled",
      reverse_tracking_status: "in_transit",
      reverse_pickup_scheduled_at: T.scheduled,
      reverse_picked_up_at: T.pickedUp,
    }),
  );
  const s = states(t);
  expect(s.pickup_scheduled).toBe("done");
  expect(s.picked_up).toBe("done");
  expect(step(t, "picked_up").timestamp).toBe(T.pickedUp);
  expect(s.in_transit).toBe("current");
  expect(s.returned).toBe("pending");
});

test("Delhivery DL/DTO -> Return Received current, confirmed by Delhivery; earlier courier steps done", () => {
  const t = buildReturnRefundTimeline(
    rvpShipment({
      return_status: "returned",
      reverse_tracking_status: "delivered_to_bree",
      reverse_pickup_scheduled_at: T.scheduled,
      reverse_picked_up_at: T.pickedUp,
      reverse_delivered_at: T.delivered,
      returned_at: T.returned,
      returned_source: "delhivery",
      inspection_status: "pending",
    }),
  );
  const s = states(t);
  expect(s.picked_up).toBe("done");
  expect(s.in_transit).toBe("done");
  expect(s.returned).toBe("current");
  expect(step(t, "returned").detail).toBe("Confirmed by Delhivery");
  expect(step(t, "returned").timestamp).toBe(T.returned);
  expect(s.inspection_approved).toBe("pending");
});

test("DL/DTO observed without an earlier PU observation -> Picked Up done (implied by Delhivery), with NO invented timestamp", () => {
  const t = buildReturnRefundTimeline(
    rvpShipment({
      return_status: "returned",
      reverse_tracking_status: "delivered_to_bree",
      reverse_delivered_at: T.delivered,
      returned_at: T.returned,
      returned_source: "delhivery",
    }),
  );
  expect(states(t).picked_up).toBe("done");
  expect(step(t, "picked_up").timestamp).toBeNull();
  expect(step(t, "pickup_scheduled").timestamp).toBeNull();
});

test("manual override with no Delhivery evidence -> courier steps are 'not_reported', never shown as done", () => {
  const t = buildReturnRefundTimeline(
    rvpShipment({
      return_status: "returned",
      returned_at: T.returned,
      returned_source: "manual_override",
      inspection_status: "pending",
    }),
  );
  const s = states(t);
  expect(s.pickup_scheduled).toBe("not_reported");
  expect(s.picked_up).toBe("not_reported");
  expect(s.in_transit).toBe("not_reported");
  expect(s.returned).toBe("current");
  expect(step(t, "returned").detail).toBe("Confirmed manually by BREE");
});

test("legacy return shipment (BREE-100018 shape: forward Prepaid AWB + warehouse pickup request id) is flagged and never treated as Delhivery pickup evidence", () => {
  const legacy = {
    ...baseOrder(),
    return_status: "pickup_scheduled",
    return_requested_at: T.requested,
    return_approved_at: T.approved,
    reverse_awb: "58045510000044",
    reverse_shipment_created_at: T.created,
    reverse_pickup_request_id: "323693428",
    reverse_shipment_type: null,
    reverse_tracking_status: "delivered_to_bree", // even if something set it, a legacy AWB proves nothing
  };
  const t = buildReturnRefundTimeline(legacy);
  expect(t.tracking.legacyShipment).toBe(true);
  expect(step(t, "pickup_scheduled").label).toBe("Pickup Requested (legacy)");
  expect(states(t).pickup_scheduled).toBe("current");
  expect(states(t).picked_up).toBe("pending");
  expect(states(t).returned).toBe("pending");
});

test("Delhivery cancelled the pickup (CN/*) -> failed marker, nothing after it", () => {
  const t = buildReturnRefundTimeline(
    rvpShipment({ reverse_tracking_status: "cancelled", reverse_tracking_updated_at: T.scheduled }),
  );
  expect(t.variant).toBe("pickup_cancelled");
  const last = t.steps[t.steps.length - 1];
  expect(last.key).toBe("pickup_cancelled");
  expect(last.state).toBe("failed");
  expect(t.steps.some((s) => s.key === "returned")).toBe(false);
});

const receivedByDelhivery = (extra = {}) =>
  rvpShipment({
    return_status: "returned",
    reverse_tracking_status: "delivered_to_bree",
    reverse_pickup_scheduled_at: T.scheduled,
    reverse_picked_up_at: T.pickedUp,
    reverse_delivered_at: T.delivered,
    returned_at: T.returned,
    returned_source: "delhivery",
    ...extra,
  });

test("QC passed -> Quality Check Passed current with inspection_completed_at", () => {
  const t = buildReturnRefundTimeline(
    receivedByDelhivery({ inspection_status: "approved", inspection_completed_at: T.qc }),
  );
  expect(states(t).returned).toBe("done");
  expect(states(t).inspection_approved).toBe("current");
  expect(step(t, "inspection_approved").timestamp).toBe(T.qc);
});

test("refund approved -> Refund Approved current with refund_approved_at", () => {
  const t = buildReturnRefundTimeline(
    receivedByDelhivery({
      inspection_status: "approved",
      inspection_completed_at: T.qc,
      refund_status: "approved",
      refund_approved_at: T.refundApproved,
      refund_amount: 950,
    }),
  );
  expect(states(t).refund_approved).toBe("current");
  expect(step(t, "refund_approved").timestamp).toBe(T.refundApproved);
  expect(t.refund).toEqual({ amount: 950, status: "approved" });
});

test("refund initiated (Razorpay processing) -> Refund Processing current", () => {
  const t = buildReturnRefundTimeline(
    receivedByDelhivery({ inspection_status: "approved", refund_status: "initiated", refund_approved_at: T.refundApproved }),
  );
  expect(states(t).refund_approved).toBe("done");
  expect(states(t).refund_initiated).toBe("current");
  expect(states(t).refund_completed).toBe("pending");
});

test("refund completed -> every step done, variant completed", () => {
  const t = buildReturnRefundTimeline(
    receivedByDelhivery({
      inspection_status: "approved",
      inspection_completed_at: T.qc,
      refund_status: "completed",
      refund_approved_at: T.refundApproved,
      refund_completed_at: T.refundCompleted,
    }),
  );
  expect(t.variant).toBe("completed");
  expect(t.steps.every((s) => s.state === "done")).toBe(true);
  expect(step(t, "refund_completed").timestamp).toBe(T.refundCompleted);
});

test("return rejected -> only 'Return Request' then 'Return Rejected' (failed)", () => {
  const t = buildReturnRefundTimeline({
    ...baseOrder(),
    return_status: "rejected",
    return_requested_at: T.requested,
    return_approved_at: T.approved,
  });
  expect(t.variant).toBe("return_rejected");
  expect(t.steps.map((s) => [s.key, s.state])).toEqual([
    ["return_request", "done"],
    ["return_rejected", "failed"],
  ]);
});

test("QC failed -> return progress shown, Quality Check Failed, no refund steps", () => {
  const t = buildReturnRefundTimeline(
    receivedByDelhivery({ inspection_status: "rejected", inspection_completed_at: T.qc }),
  );
  expect(t.variant).toBe("inspection_rejected");
  const last = t.steps[t.steps.length - 1];
  expect(last).toMatchObject({ key: "inspection_rejected", state: "failed", timestamp: T.qc });
  expect(t.steps.some((s) => s.key.startsWith("refund_"))).toBe(false);
});

test("refund rejected before QC approval -> Quality Check Passed is never claimed", () => {
  const t = buildReturnRefundTimeline(receivedByDelhivery({ refund_status: "rejected" }));
  expect(t.variant).toBe("refund_rejected");
  expect(t.steps.some((s) => s.key === "inspection_approved")).toBe(false);
  expect(t.steps[t.steps.length - 1]).toMatchObject({ key: "refund_rejected", state: "failed" });
});

test("never fabricates a timestamp: every timestamp is one of the order's own fields or null", () => {
  const order = receivedByDelhivery({
    inspection_status: "approved",
    inspection_completed_at: T.qc,
    refund_status: "initiated",
    refund_approved_at: T.refundApproved,
  });
  const allowed = new Set(Object.values(order).filter((v) => typeof v === "string"));
  const t = buildReturnRefundTimeline(order);
  for (const s of t.steps) {
    if (s.timestamp !== null) expect(allowed.has(s.timestamp)).toBe(true);
  }
  expect(step(t, "in_transit").timestamp).toBeNull();
  expect(step(t, "refund_initiated").timestamp).toBeNull();
});

test("same input -> identical timeline (refresh / re-login shows the same authoritative state)", () => {
  const order = receivedByDelhivery({ inspection_status: "pending" });
  expect(buildReturnRefundTimeline({ ...order })).toEqual(buildReturnRefundTimeline(JSON.parse(JSON.stringify(order))));
});
