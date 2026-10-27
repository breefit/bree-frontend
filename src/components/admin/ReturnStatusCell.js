import React from "react";
import { getReturnRefundStatus } from "@/lib/returnRefundTimeline";

const formatTimestamp = (timestamp) => {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const ReturnStatusCell = ({ order }) => {
  const status = getReturnRefundStatus(order);
  if (!status) {
    return <span className="text-sm text-bree-text-secondary">—</span>;
  }

  const isRejected = /rejected|failed|cancelled/i.test(status.label);
  const colorClass = isRejected
    ? "bg-red-100 text-red-700 border-red-200"
    : status.label === "Refund Processed"
      ? "bg-green-100 text-green-700 border-green-200"
      : "bg-amber-100 text-amber-800 border-amber-200";
  const timestampLabel = formatTimestamp(status.timestamp);

  return (
    <div className="min-w-[150px] space-y-1">
      <span
        className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${colorClass}`}
      >
        {status.label}
      </span>
      {timestampLabel && (
        <span className="block whitespace-nowrap text-[11px] text-bree-text-secondary">
          {timestampLabel}
        </span>
      )}
    </div>
  );
};

export default ReturnStatusCell;
