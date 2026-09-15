import React, { memo } from "react";
import { buildReturnRefundTimeline } from "@/lib/returnRefundTimeline";

// Same "no fake timestamps" convention as TrackingTimeline.js's
// formatTimestampSafe — falls back to "-" rather than blank/invented text.
const formatTimestampSafe = (timestamp) => {
  if (!timestamp) return "-";
  const parsed = new Date(timestamp);
  return !isNaN(parsed) ? parsed.toLocaleString("en-IN") : "-";
};

const formatRupees = (amount) => {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  return `₹${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const REFUND_STATUS_LABELS = {
  approved: "Approved",
  initiated: "Processing",
  completed: "Completed",
  rejected: "Rejected",
};

/**
 * Customer-facing "Return & Refund Progress" section for OrderTracking.js.
 * Renders nothing (returns null) when there is no return in progress at
 * all — callers should show the existing "Returns & Support" panel in
 * that case instead, exactly as before this component existed.
 */
const ReturnRefundTimeline = ({ order }) => {
  const timeline = buildReturnRefundTimeline(order);
  if (!timeline) return null;

  const { steps, refund, reverseShipment } = timeline;
  const refundAmountLabel = formatRupees(refund.amount);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-premium border border-bree-border">
      <h3 className="font-semibold text-bree-text-primary mb-4">
        Return &amp; Refund Progress
      </h3>

      <div className="space-y-6">
        {steps.map((step, idx) => {
          const stateClass =
            step.state === "done"
              ? "bg-green-100 text-green-700"
              : step.state === "current"
                ? "bg-emerald-100 text-emerald-700 animate-pulse"
                : step.state === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-400";

          const textClass =
            step.state === "done"
              ? "text-green-700"
              : step.state === "current"
                ? "text-emerald-700"
                : step.state === "failed"
                  ? "text-red-600"
                  : "text-gray-600";

          const subLabel =
            step.state === "done"
              ? "Completed"
              : step.state === "current"
                ? "In progress"
                : step.state === "failed"
                  ? "Not approved"
                  : "Pending";

          return (
            <div key={step.key} className="flex items-start gap-4 min-w-0">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${stateClass}`}
                >
                  {step.state === "done" ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      role="img"
                      aria-label="Completed"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414L8.414 15 5 11.586a1 1 0 011.414-1.414L8.414 12.172l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : step.state === "failed" ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      role="img"
                      aria-label="Not approved"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <span className="text-sm font-semibold">{idx + 1}</span>
                  )}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`w-px h-6 mt-1 ${step.state === "done" ? "bg-green-200" : "bg-gray-200"}`}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <h4 className={`text-sm font-semibold break-words ${textClass}`}>
                    {step.label}
                  </h4>
                  <p className="text-xs text-gray-400 flex-shrink-0">
                    {formatTimestampSafe(step.timestamp)}
                  </p>
                </div>
                <p className={`text-xs mt-1 ${textClass}`}>{subLabel}</p>
              </div>
            </div>
          );
        })}
      </div>

      {(refundAmountLabel || refund.status) && (
        <div className="mt-6 rounded-xl bg-bree-bg border border-bree-border p-4">
          <p className="text-xs uppercase tracking-wide text-bree-text-secondary mb-1">
            Refund
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-bree-text-primary">
            {refundAmountLabel && (
              <span className="font-medium">Amount: {refundAmountLabel}</span>
            )}
            {refund.status && (
              <span className="text-bree-text-secondary">
                Status: {REFUND_STATUS_LABELS[refund.status] || refund.status}
              </span>
            )}
          </div>
        </div>
      )}

      {(reverseShipment.awb || reverseShipment.trackingUrl) && (
        <div className="mt-4 rounded-xl bg-bree-bg border border-bree-border p-4">
          <p className="text-xs uppercase tracking-wide text-bree-text-secondary mb-1">
            Return Shipment
          </p>
          <div className="text-sm text-bree-text-primary space-y-1">
            {reverseShipment.awb && (
              <p className="break-all">
                Courier: Delhivery &middot; AWB: {reverseShipment.awb}
              </p>
            )}
            {reverseShipment.trackingUrl && (
              <a
                href={reverseShipment.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-bree-primary underline break-all"
              >
                Track your return shipment
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ReturnRefundTimeline);
