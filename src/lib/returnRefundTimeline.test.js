import { buildReturnRefundTimeline } from "./returnRefundTimeline";

const baseOrder = () => ({
  order_status: "delivered",
  return_status: null,
  return_requested_at: null,
  return_approved_at: null,
  reverse_shipment_created_at: null,
  reverse_pickup_request_id: null,
  returned_at: null,
  inspection_status: null,
  refund_status: null,
  refund_amount: null,
  refund_completed_at: null,
  reverse_awb: null,
  reverse_tracking_url: null,
});

const stepStates = (timeline) =>
  Object.fromEntries(timeline.steps.map((s) => [s.key, s.state]));

// ── 1. No return in progress ────────────────────────────────────────────

test("no return_status at all -> null (caller falls back to the existing Returns & Support panel)", () => {
  expect(buildReturnRefundTimeline(baseOrder())).toBeNull();
  expect(buildReturnRefundTimeline(null)).toBeNull();
  expect(buildReturnRefundTimeline(undefined)).toBeNull();
});

// ── 2. Return Approved ──────────────────────────────────────────────────

test("return_status='approved' -> Return Approved is current, everything after is pending", () => {
  const order = { ...baseOrder(), return_status: "approved", return_approved_at: "2026-01-01T00:00:00Z" };
  const timeline = buildReturnRefundTimeline(order);
  expect(timeline.variant).toBe("in_progress");
  const states = stepStates(timeline);
  expect(states.return_approved).toBe("current");
  expect(states.reverse_shipment_created).toBe("pending");
  expect(states.returned).toBe("pending");
  expect(states.inspection_approved).toBe("pending");
  expect(states.refund_completed).toBe("pending");
  // Only steps genuinely reached carry a real timestamp.
  const returnApprovedStep = timeline.steps.find((s) => s.key === "return_approved");
  expect(returnApprovedStep.timestamp).toBe("2026-01-01T00:00:00Z");
  const shipmentStep = timeline.steps.find((s) => s.key === "reverse_shipment_created");
  expect(shipmentStep.timestamp).toBeNull();
});

// ── 3. Reverse Shipment Created ─────────────────────────────────────────

test("return_status='reverse_shipment_created' -> Return Approved done, Shipment Created current, rest pending (matches the WhatsApp 'shipment created' alignment example)", () => {
  const order = {
    ...baseOrder(),
    return_status: "reverse_shipment_created",
    return_approved_at: "2026-01-01T00:00:00Z",
    reverse_shipment_created_at: "2026-01-02T00:00:00Z",
    reverse_awb: "AWB123",
    reverse_tracking_url: "https://track.delhivery.com/AWB123",
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  expect(states.return_approved).toBe("done");
  expect(states.reverse_shipment_created).toBe("current");
  // Pickup is still an open possibility at this point (shipment created,
  // not yet returned) — shown as pending, not omitted.
  expect(states.pickup_scheduled).toBe("pending");
  expect(states.returned).toBe("pending");
  expect(states.inspection_approved).toBe("pending");
  expect(states.refund_approved).toBe("pending");
  expect(states.refund_initiated).toBe("pending");
  expect(states.refund_completed).toBe("pending");
  expect(timeline.reverseShipment).toEqual({
    awb: "AWB123",
    trackingUrl: "https://track.delhivery.com/AWB123",
  });
});

// ── 4. Pickup Scheduled ──────────────────────────────────────────────────

test("return_status='pickup_scheduled' -> Pickup Scheduled is current, prior steps done", () => {
  const order = {
    ...baseOrder(),
    return_status: "pickup_scheduled",
    reverse_pickup_request_id: "PICKUP-1",
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  expect(states.return_approved).toBe("done");
  expect(states.reverse_shipment_created).toBe("done");
  expect(states.pickup_scheduled).toBe("current");
  expect(states.returned).toBe("pending");
});

// ── 5. Returned/Received ────────────────────────────────────────────────

test("return_status='returned' (pickup was scheduled) -> Return Received current, Pickup Scheduled shown as done", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: "PICKUP-1",
    returned_at: "2026-01-03T00:00:00Z",
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  expect(states.pickup_scheduled).toBe("done");
  expect(states.returned).toBe("current");
  const returnedStep = timeline.steps.find((s) => s.key === "returned");
  expect(returnedStep.timestamp).toBe("2026-01-03T00:00:00Z");
});

test("return_status='returned' with pickup scheduling SKIPPED entirely (optional step) -> Pickup Scheduled is omitted, not shown as done or pending", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: null, // never scheduled — optional step
    returned_at: "2026-01-03T00:00:00Z",
  };
  const timeline = buildReturnRefundTimeline(order);
  const keys = timeline.steps.map((s) => s.key);
  expect(keys).not.toContain("pickup_scheduled");
  expect(stepStates(timeline).returned).toBe("current");
});

// ── 6. Inspection Approved ──────────────────────────────────────────────

test("inspection_status='approved' -> Quality Check Passed is current", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: "PICKUP-1",
    inspection_status: "approved",
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  expect(states.returned).toBe("done");
  expect(states.inspection_approved).toBe("current");
  expect(states.refund_approved).toBe("pending");
});

// ── 7. Inspection Rejected — terminal, no refund steps shown at all ─────

test("inspection_status='rejected' -> Quality Check Failed shown, prior steps done, NO refund steps appear even as pending", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: "PICKUP-1",
    returned_at: "2026-01-03T00:00:00Z",
    inspection_status: "rejected",
    // Even if refund_status somehow got set, the inspection-rejected
    // branch must take priority and never show refund progress.
    refund_status: null,
  };
  const timeline = buildReturnRefundTimeline(order);
  expect(timeline.variant).toBe("inspection_rejected");
  const keys = timeline.steps.map((s) => s.key);
  expect(keys).toEqual([
    "return_approved",
    "reverse_shipment_created",
    "pickup_scheduled",
    "returned",
    "inspection_rejected",
  ]);
  expect(keys).not.toContain("refund_approved");
  expect(keys).not.toContain("refund_initiated");
  expect(keys).not.toContain("refund_completed");
  const states = stepStates(timeline);
  expect(states.return_approved).toBe("done");
  expect(states.returned).toBe("done");
  expect(states.inspection_rejected).toBe("failed");
});

// ── 8. Refund Approved ──────────────────────────────────────────────────

test("refund_status='approved' -> Refund Approved is current", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: "PICKUP-1",
    inspection_status: "approved",
    refund_status: "approved",
    refund_amount: 499,
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  expect(states.inspection_approved).toBe("done");
  expect(states.refund_approved).toBe("current");
  expect(states.refund_initiated).toBe("pending");
  expect(timeline.refund).toEqual({ amount: 499, status: "approved" });
});

// ── 9. Refund Processing (initiated) ────────────────────────────────────

test("refund_status='initiated' -> Refund Processing is current", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    inspection_status: "approved",
    refund_status: "initiated",
    refund_amount: 499,
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  expect(states.refund_approved).toBe("done");
  expect(states.refund_initiated).toBe("current");
  expect(states.refund_completed).toBe("pending");
});

// ── 10. Refund Completed — full completed timeline ──────────────────────

test("refund_status='completed' -> every step done, matching the 'refund completed' alignment example exactly", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: "PICKUP-1",
    returned_at: "2026-01-03T00:00:00Z",
    inspection_status: "approved",
    refund_status: "completed",
    refund_amount: 499,
    refund_completed_at: "2026-01-05T00:00:00Z",
  };
  const timeline = buildReturnRefundTimeline(order);
  const states = stepStates(timeline);
  for (const key of [
    "return_approved",
    "reverse_shipment_created",
    "pickup_scheduled",
    "returned",
    "inspection_approved",
    "refund_approved",
    "refund_initiated",
    "refund_completed",
  ]) {
    expect(states[key]).toBe("done");
  }
  const completedStep = timeline.steps.find((s) => s.key === "refund_completed");
  expect(completedStep.timestamp).toBe("2026-01-05T00:00:00Z");
});

// ── 11. Return Rejected — the earliest possible branch ──────────────────

test("return_status='rejected' -> 'Return Request' then 'Return Rejected', nothing else, styled as failed not completed", () => {
  const order = {
    ...baseOrder(),
    return_status: "rejected",
    return_requested_at: "2026-01-01T00:00:00Z",
    return_approved_at: "2026-01-01T01:00:00Z",
  };
  const timeline = buildReturnRefundTimeline(order);
  expect(timeline.variant).toBe("return_rejected");
  expect(timeline.steps).toEqual([
    { key: "return_request", label: "Return Request", state: "done", timestamp: "2026-01-01T00:00:00Z" },
    { key: "return_rejected", label: "Return Rejected", state: "failed", timestamp: "2026-01-01T01:00:00Z" },
  ]);
});

// ── 12. Refund Rejected — show real progress, then stop ─────────────────

test("refund_status='rejected' after inspection passed -> return+inspection progress shown as done, then Refund Rejected, no Refund Completed", () => {
  const order = {
    ...baseOrder(),
    return_status: "returned",
    reverse_pickup_request_id: "PICKUP-1",
    returned_at: "2026-01-03T00:00:00Z",
    inspection_status: "approved",
    refund_status: "rejected",
  };
  const timeline = buildReturnRefundTimeline(order);
  expect(timeline.variant).toBe("refund_rejected");
  const keys = timeline.steps.map((s) => s.key);
  expect(keys).toEqual([
    "return_approved",
    "reverse_shipment_created",
    "pickup_scheduled",
    "returned",
    "inspection_approved",
    "refund_rejected",
  ]);
  expect(keys).not.toContain("refund_completed");
  const states = stepStates(timeline);
  expect(states.inspection_approved).toBe("done");
  expect(states.refund_rejected).toBe("failed");
});

test("refund_status='rejected' BEFORE inspection was ever approved -> only genuinely-reached steps show as done, 'Quality Check Passed' is never falsely claimed", () => {
  // Backend edge case: rejectRefund has no inspection_status precondition
  // (only completeRefund/approveRefund do) — the timeline must reflect
  // only what actually happened, not assume the normal order occurred.
  const order = {
    ...baseOrder(),
    return_status: "returned",
    returned_at: "2026-01-03T00:00:00Z",
    inspection_status: null,
    refund_status: "rejected",
  };
  const timeline = buildReturnRefundTimeline(order);
  const keys = timeline.steps.map((s) => s.key);
  expect(keys).not.toContain("inspection_approved");
  expect(keys[keys.length - 1]).toBe("refund_rejected");
});

// ── Refund/reverse-shipment auxiliary info is always returned, even when
//    not part of the step list itself ──────────────────────────────────

test("refund and reverseShipment info are exposed even before either is relevant, defaulting to null rather than throwing", () => {
  const order = { ...baseOrder(), return_status: "approved" };
  const timeline = buildReturnRefundTimeline(order);
  expect(timeline.refund).toEqual({ amount: null, status: null });
  expect(timeline.reverseShipment).toEqual({ awb: null, trackingUrl: null });
});

test("never fabricates a timestamp: every step's timestamp is either a real DB value or null (component renders null as '-')", () => {
  const order = {
    ...baseOrder(),
    return_status: "pickup_scheduled",
    reverse_pickup_request_id: "PICKUP-1",
    return_approved_at: "2026-01-01T00:00:00Z",
    reverse_shipment_created_at: "2026-01-02T00:00:00Z",
  };
  const timeline = buildReturnRefundTimeline(order);
  for (const step of timeline.steps) {
    expect(step.timestamp === null || typeof step.timestamp === "string").toBe(true);
  }
  // Pickup Scheduled has no backing timestamp column anywhere in the
  // schema — must be null, never invented.
  const pickupStep = timeline.steps.find((s) => s.key === "pickup_scheduled");
  expect(pickupStep.timestamp).toBeNull();
});
