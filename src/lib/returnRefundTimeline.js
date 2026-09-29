// The ONE return/refund timeline state machine — used by both the admin
// order details (pages/admin/Orders.js) and the customer tracking page
// (components/orders/ReturnRefundTimeline.js), from the same backend fields
// both APIs return. No invented statuses, no fabricated timestamps.
//
// Every step is marked reached only by its own evidence:
//   Return Requested      return_status set                 return_requested_at
//   Return Approved       return_status set (not rejected)  return_approved_at
//   Return Shipment       reverse_awb / return_status       reverse_shipment_created_at
//   Pickup Scheduled      Delhivery PP/Scheduled or later   reverse_pickup_scheduled_at
//                         (legacy: pickup request id)
//   Picked Up             Delhivery PU/* or DL/DTO          reverse_picked_up_at
//   In Transit            Delhivery PU/* or DL/DTO          — (no own timestamp)
//   Return Received       return_status = returned          returned_at (+ returned_source)
//   Quality Check         inspection_status                 inspection_completed_at
//   Refund Approved       refund_status                     refund_approved_at
//   Refund Processing     refund_status processing/initiated/completed —
//   Refund Completed      refund_status = completed         refund_completed_at
//
// A later Delhivery state is evidence for the earlier courier steps it
// implies (Delhivery cannot deliver a parcel to BREE it never picked up).
// A step that was never evidenced while a later step was (e.g. a manually
// confirmed receipt with no Delhivery pickup scan) is "not_reported" —
// never shown as done.
//
// States: done | current (last reached step) | not_reported | pending | failed.

const PICKUP_SCHEDULED_EVIDENCE = [
  "pickup_scheduled",
  "out_for_pickup",
  "in_transit",
  "delivered_to_bree",
];
const PICKED_UP_EVIDENCE = ["in_transit", "delivered_to_bree"];
const SHIPMENT_STATUSES = ["reverse_shipment_created", "pickup_scheduled", "returned"];

export const REVERSE_TRACKING_LABELS = {
  pickup_requested: "Pickup requested",
  pickup_scheduled: "Pickup scheduled",
  out_for_pickup: "Courier out for pickup",
  in_transit: "In transit to BREE",
  delivered_to_bree: "Delivered to BREE",
  cancelled: "Pickup cancelled by Delhivery",
  unknown: "Status update received",
};

// Delhivery's public tracking page. "/track/package/<awb>" redirects here.
export const DELHIVERY_PUBLIC_TRACKING_BASE = "https://www.delhivery.com/track-v2/package/";
// The backend's old default tracking base (tracking.delhivery.com) has no DNS
// record, so every link stored with it is dead. Such rows (e.g. the legacy
// BREE-100018 return) are rebuilt from the AWB at render time — the stored
// DB value is never rewritten.
const DEAD_TRACKING_HOSTS = ["tracking.delhivery.com"];

/**
 * Customer-safe Delhivery tracking link for an AWB: the stored URL when it is
 * a usable http(s) link, otherwise one built from the AWB, otherwise null.
 */
export const resolveDelhiveryTrackingUrl = (awb, storedUrl) => {
  if (storedUrl) {
    try {
      const url = new URL(storedUrl);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !DEAD_TRACKING_HOSTS.includes(url.hostname.toLowerCase())
      ) {
        return storedUrl;
      }
    } catch {
      // Not a parseable URL — fall through to the AWB.
    }
  }
  const cleanAwb = String(awb || "").trim();
  return cleanAwb ? `${DELHIVERY_PUBLIC_TRACKING_BASE}${encodeURIComponent(cleanAwb)}` : null;
};

export const RETURNED_SOURCE_LABELS = {
  delhivery: "Confirmed by Delhivery",
  manual_override: "Confirmed manually by BREE",
};

/**
 * @param {object} order - Order from GET /api/orders/:id/tracking or the admin order API.
 * @returns {null|{variant: string, steps: Array, refund: object, reverseShipment: object, tracking: object}}
 *   null when there is no return at all (return_status is falsy).
 */
export const buildReturnRefundTimeline = (order) => {
  if (!order || !order.return_status) return null;

  const {
    return_status,
    return_requested_at,
    return_approved_at,
    reverse_awb,
    reverse_tracking_url,
    reverse_shipment_created_at,
    reverse_shipment_type,
    reverse_pickup_request_id,
    reverse_tracking_status,
    reverse_tracking_raw_status,
    reverse_tracking_updated_at,
    reverse_pickup_scheduled_at,
    reverse_picked_up_at,
    reverse_delivered_at,
    returned_at,
    returned_source,
    inspection_status,
    inspection_completed_at,
    refund_status,
    refund_amount,
    refund_approved_at,
    refund_completed_at,
  } = order;

  const isRvp = reverse_shipment_type === "rvp";
  const trackingStatus = reverse_tracking_status || null;

  const reverseShipment = {
    awb: reverse_awb || null,
    trackingUrl: resolveDelhiveryTrackingUrl(reverse_awb, reverse_tracking_url),
  };
  const refund = {
    amount: refund_amount != null ? Number(refund_amount) : null,
    status: refund_status || null,
  };
  const tracking = {
    status: trackingStatus,
    label: trackingStatus ? REVERSE_TRACKING_LABELS[trackingStatus] || trackingStatus : null,
    rawStatus: reverse_tracking_raw_status || null,
    updatedAt: reverse_tracking_updated_at || null,
    // A return shipment created before the reverse-pickup fix: a forward
    // Prepaid shipment whose tracking cannot prove a customer pickup.
    legacyShipment: Boolean(reverse_awb) && !isRvp,
    cancelled: trackingStatus === "cancelled",
  };

  if (return_status === "rejected") {
    return {
      variant: "return_rejected",
      steps: [
        { key: "return_request", label: "Return Request", state: "done", timestamp: return_requested_at || null },
        { key: "return_rejected", label: "Return Rejected", state: "failed", timestamp: return_approved_at || null },
      ],
      refund,
      reverseShipment,
      tracking,
    };
  }

  const courierEvidence = isRvp ? trackingStatus : null;
  const delhiveryDelivered = isRvp && (courierEvidence === "delivered_to_bree" || Boolean(reverse_delivered_at));
  const pickupScheduled =
    Boolean(reverse_pickup_scheduled_at) ||
    PICKUP_SCHEDULED_EVIDENCE.includes(courierEvidence) ||
    delhiveryDelivered ||
    (tracking.legacyShipment && Boolean(reverse_pickup_request_id));
  const pickedUp =
    Boolean(reverse_picked_up_at) || PICKED_UP_EVIDENCE.includes(courierEvidence) || delhiveryDelivered;
  const returned = return_status === "returned";

  const milestones = [
    { key: "return_requested", label: "Return Requested", reached: true, timestamp: return_requested_at || null },
    { key: "return_approved", label: "Return Approved", reached: true, timestamp: return_approved_at || null },
    {
      key: "reverse_shipment_created",
      label: "Return Shipment Created",
      reached: Boolean(reverse_awb) || SHIPMENT_STATUSES.includes(return_status),
      timestamp: reverse_shipment_created_at || null,
    },
    {
      key: "pickup_scheduled",
      label: tracking.legacyShipment ? "Pickup Requested (legacy)" : "Pickup Scheduled",
      reached: pickupScheduled,
      timestamp: reverse_pickup_scheduled_at || null,
    },
    { key: "picked_up", label: "Picked Up", reached: pickedUp, timestamp: reverse_picked_up_at || null },
    { key: "in_transit", label: "In Transit", reached: pickedUp, timestamp: null },
    {
      key: "returned",
      label: "Return Received",
      reached: returned,
      timestamp: returned ? returned_at || null : null,
      detail: returned ? RETURNED_SOURCE_LABELS[returned_source] || null : null,
    },
  ];

  const toStep = (m, state) => ({
    key: m.key,
    label: m.label,
    state,
    timestamp: m.timestamp,
    ...(m.detail ? { detail: m.detail } : {}),
  });

  // States for a list of milestones: done/current by own evidence,
  // not_reported for a gap before a later reached step, pending after.
  const resolveStates = (list, { fullyComplete = false } = {}) => {
    let last = -1;
    list.forEach((m, i) => {
      if (m.reached) last = i;
    });
    return list.map((m, i) => {
      if (m.reached) {
        return toStep(m, i === last && !fullyComplete ? "current" : "done");
      }
      return toStep(m, i < last ? "not_reported" : "pending");
    });
  };

  // Delhivery cancelled the pickup before collecting the parcel.
  if (tracking.cancelled && !returned) {
    const upToPickup = milestones.slice(0, 4);
    return {
      variant: "pickup_cancelled",
      steps: [
        ...resolveStates(upToPickup, { fullyComplete: true }).map((s) =>
          s.state === "pending" ? { ...s, state: "not_reported" } : s,
        ),
        { key: "pickup_cancelled", label: "Pickup Cancelled by Delhivery", state: "failed", timestamp: reverse_tracking_updated_at || null },
      ],
      refund,
      reverseShipment,
      tracking,
    };
  }

  if (inspection_status === "rejected") {
    return {
      variant: "inspection_rejected",
      steps: [
        ...resolveStates(milestones, { fullyComplete: true }),
        { key: "inspection_rejected", label: "Quality Check Failed", state: "failed", timestamp: inspection_completed_at || null },
      ],
      refund,
      reverseShipment,
      tracking,
    };
  }

  const refundMilestones = [
    {
      key: "inspection_approved",
      label: "Quality Check Passed",
      reached: inspection_status === "approved",
      timestamp: inspection_status === "approved" ? inspection_completed_at || null : null,
    },
    {
      key: "refund_approved",
      label: "Refund Approved",
      // 'processing' = completeRefund's claim while it talks to Razorpay
      // (or one left behind by an interrupted call). It is past approval,
      // so omitting it used to show Refund Approved as NOT reached.
      reached: ["approved", "processing", "initiated", "completed"].includes(refund_status),
      timestamp: refund_approved_at || null,
    },
    {
      key: "refund_initiated",
      label: "Refund Processing",
      reached: ["processing", "initiated", "completed"].includes(refund_status),
      timestamp: null,
    },
    {
      key: "refund_completed",
      label: "Refund Completed",
      reached: refund_status === "completed",
      timestamp: refund_status === "completed" ? refund_completed_at || null : null,
    },
  ];

  if (refund_status === "rejected") {
    const reachedOnly = [...milestones, ...refundMilestones.slice(0, 1)];
    return {
      variant: "refund_rejected",
      steps: [
        ...resolveStates(reachedOnly, { fullyComplete: true }).filter((s) => s.state !== "pending"),
        { key: "refund_rejected", label: "Refund Rejected", state: "failed", timestamp: null },
      ],
      refund,
      reverseShipment,
      tracking,
    };
  }

  const all = [...milestones, ...refundMilestones];
  const fullyComplete = refund_status === "completed";
  return {
    variant: fullyComplete ? "completed" : "in_progress",
    steps: resolveStates(all, { fullyComplete }),
    refund,
    reverseShipment,
    tracking,
  };
};

export default buildReturnRefundTimeline;
