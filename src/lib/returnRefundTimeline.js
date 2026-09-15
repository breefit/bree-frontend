// Maps the EXISTING backend return/refund state (return_status /
// inspection_status / refund_status — no invented statuses, no new DB
// fields) onto a customer-friendly timeline for the Order Tracking page.
//
// Design notes (see docs/Return_Order_Flow.md and the return-flow audit
// for the underlying state machine):
// - return_status: null -> approved -> reverse_shipment_created ->
//   pickup_scheduled (OPTIONAL) -> returned, or null -> rejected.
// - inspection_status: null -> pending -> approved, or -> rejected
//   (terminal, permanently blocks refund).
// - refund_status: null -> approved -> initiated -> completed, or
//   -> rejected (blocked only once already "completed").
//
// "Current" step = whichever milestone the backend data says is the LAST
// one actually reached — matching the same visual convention already
// used by components/orders/TrackingTimeline.js for the normal order
// timeline (the step matching the current value is highlighted, not
// marked done; steps before it are done; steps after are pending).
//
// A rejection at any stage truncates the list right after the failure
// marker — no future step is ever shown as pending once a branch has
// terminally failed (per the audit's explicit requirement).

const REACHED_SHIPMENT = ["reverse_shipment_created", "pickup_scheduled", "returned"];

/**
 * @param {object} order - The order object returned by GET /api/orders/:id/tracking.
 * @returns {null|{variant: string, steps: Array, refund: object, reverseShipment: object}}
 *   null when there is no return in progress at all (return_status is falsy) —
 *   callers should fall back to the existing "Returns & Support" panel in that case.
 */
export const buildReturnRefundTimeline = (order) => {
  if (!order || !order.return_status) return null;

  const {
    return_status,
    return_requested_at,
    return_approved_at,
    reverse_shipment_created_at,
    reverse_pickup_request_id,
    returned_at,
    inspection_status,
    refund_status,
    refund_amount,
    refund_completed_at,
    reverse_awb,
    reverse_tracking_url,
  } = order;

  const reverseShipment = {
    awb: reverse_awb || null,
    trackingUrl: reverse_tracking_url || null,
  };
  const refund = {
    amount: refund_amount != null ? Number(refund_amount) : null,
    status: refund_status || null,
  };

  // ── Branch 1: the return request itself was rejected — no shipment,
  //    no inspection, no refund ever happened for this order. ───────────
  if (return_status === "rejected") {
    return {
      variant: "return_rejected",
      steps: [
        {
          key: "return_request",
          label: "Return Request",
          state: "done",
          timestamp: return_requested_at || null,
        },
        {
          key: "return_rejected",
          label: "Return Rejected",
          state: "failed",
          timestamp: return_approved_at || null,
        },
      ],
      refund,
      reverseShipment,
    };
  }

  // ── Return-side milestones (always at least "Return Approved" is done
  //    here, since return_status is truthy and not "rejected"). ─────────
  const pickupWasScheduled = Boolean(reverse_pickup_request_id);
  const reachedShipment = REACHED_SHIPMENT.includes(return_status);
  const reachedReturned = return_status === "returned";
  // The optional pickup step is only ever shown if it genuinely happened,
  // or if it's still a live possibility (shipment created, not yet
  // returned) — an order that skipped straight from "shipment created" to
  // "returned" never had this step, so it's omitted entirely rather than
  // shown as a false "pending" placeholder for something that will never
  // happen for this order.
  const includePickupStep = pickupWasScheduled || (reachedShipment && !reachedReturned);

  const returnSteps = [
    {
      key: "return_approved",
      label: "Return Approved",
      reached: true,
      timestamp: return_approved_at || null,
    },
    {
      key: "reverse_shipment_created",
      label: "Return Shipment Created",
      reached: reachedShipment,
      timestamp: reachedShipment ? reverse_shipment_created_at || null : null,
    },
    ...(includePickupStep
      ? [
          {
            key: "pickup_scheduled",
            label: "Pickup Scheduled",
            reached: pickupWasScheduled,
            // No dedicated timestamp column exists for when a pickup was
            // scheduled — never fabricate one.
            timestamp: null,
          },
        ]
      : []),
    {
      key: "returned",
      label: "Return Received",
      reached: reachedReturned,
      timestamp: reachedReturned ? returned_at || null : null,
    },
  ];

  // ── Branch 2: quality check failed — the return itself completed
  //    successfully, but no refund will ever follow for this order. ─────
  if (inspection_status === "rejected") {
    return {
      variant: "inspection_rejected",
      steps: [
        ...returnSteps.map((s) => ({
          key: s.key,
          label: s.label,
          state: "done",
          timestamp: s.timestamp,
        })),
        {
          key: "inspection_rejected",
          label: "Quality Check Failed",
          state: "failed",
          // No dedicated inspection timestamp column exists.
          timestamp: null,
        },
      ],
      refund,
      reverseShipment,
    };
  }

  // ── Normal progressive milestones, extended through inspection/refund.
  //    "reached" here means "at or past this milestone" — the LAST true
  //    one is the current step; everything before is done, after is
  //    pending. ─────────────────────────────────────────────────────────
  const milestones = [
    ...returnSteps,
    {
      key: "inspection_approved",
      label: "Quality Check Passed",
      reached: inspection_status === "approved",
      timestamp: null, // no dedicated inspection timestamp column exists
    },
    {
      key: "refund_approved",
      label: "Refund Approved",
      reached: ["approved", "initiated", "completed"].includes(refund_status),
      timestamp: null, // no dedicated refund-approved timestamp column exists
    },
    {
      key: "refund_initiated",
      label: "Refund Processing",
      reached: ["initiated", "completed"].includes(refund_status),
      timestamp: null, // no dedicated refund-initiated timestamp column exists
    },
    {
      key: "refund_completed",
      label: "Refund Completed",
      reached: refund_status === "completed",
      timestamp: refund_status === "completed" ? refund_completed_at || null : null,
    },
  ];

  // ── Branch 3: refund rejected — show whatever return/inspection
  //    progress genuinely occurred, then stop. Refund milestones never
  //    render as done just because they preceded the rejection — only
  //    what the data actually shows as reached is marked done. ──────────
  if (refund_status === "rejected") {
    const reachedOnly = milestones.filter(
      (m) => !m.key.startsWith("refund_") && m.reached,
    );
    return {
      variant: "refund_rejected",
      steps: [
        ...reachedOnly.map((m) => ({
          key: m.key,
          label: m.label,
          state: "done",
          timestamp: m.timestamp,
        })),
        {
          key: "refund_rejected",
          label: "Refund Rejected",
          state: "failed",
          timestamp: null, // no dedicated refund-rejected timestamp column exists
        },
      ],
      refund,
      reverseShipment,
    };
  }

  // ── Normal (non-rejected) path: find the last reached milestone. ──────
  let lastReachedIndex = -1;
  milestones.forEach((m, idx) => {
    if (m.reached) lastReachedIndex = idx;
  });

  // The very last milestone (Refund Completed) is a true terminal state —
  // once reached there is nothing left to wait for, so it renders as done
  // (✓), not current/in-progress (●), unlike every earlier milestone
  // where "current" correctly means "this just happened, the next step
  // hasn't yet."
  const isFullyComplete = lastReachedIndex === milestones.length - 1;

  const steps = milestones.map((m, idx) => ({
    key: m.key,
    label: m.label,
    state:
      idx < lastReachedIndex || (idx === lastReachedIndex && isFullyComplete)
        ? "done"
        : idx === lastReachedIndex
          ? "current"
          : "pending",
    timestamp: m.timestamp,
  }));

  return {
    variant: isFullyComplete ? "completed" : "in_progress",
    steps,
    refund,
    reverseShipment,
  };
};

export default buildReturnRefundTimeline;
