import React, { memo } from "react";

const formatStatusLabel = (status) => {
  if (!status) return "";
  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// ===== Modified =====
// Safely formats a timestamp using the existing "en-IN" locale format.
// Falls back to "-" for missing or invalid timestamps instead of "".
const formatTimestampSafe = (timestamp) => {
  if (!timestamp) return "-";
  const parsed = new Date(timestamp);
  return !isNaN(parsed) ? parsed.toLocaleString("en-IN") : "-";
};

// Canonical ordering for normal Delhivery shipment stages. Terminal
// statuses are handled separately so they do not participate in the same
// ordering logic.
const NORMAL_STATUS_ORDER = [
  "pending",
  "manifested",
  "pickup pending",
  "pickup scheduled",
  "pickup complete",
  "not picked",
  "bagged",
  "dispatched",
  "in transit",
  "reached destination hub",
  "out for delivery",
  "delivered",
];

const TERMINAL_STATUSES = [
  "cancelled",
  "shipment cancelled",
  "returned",
  "rto",
  "damaged",
  "lost",
  "undelivered",
];

const getStatusIndex = (status) => NORMAL_STATUS_ORDER.indexOf(status);
// ===== End Modified =====

const TrackingTimeline = ({
  steps = [],
  currentStatus = "",
  className = "",
}) => {
  const normalizedCurrent = currentStatus
    ? String(currentStatus).trim().toLowerCase()
    : "";

  const normalizedLabel = (status) =>
    status ? String(status).trim().toLowerCase() : "";

  return (
    <div className={`space-y-6 ${className}`}>
      {steps.map((s, idx) => {
        const stepStatus = normalizedLabel(s.status);
        let stepState = "pending";

        // ===== Modified =====
        if (stepStatus === normalizedCurrent) {
          if (stepStatus === "delivered") {
            stepState = "completed";
          } else if (TERMINAL_STATUSES.includes(stepStatus)) {
            stepState = "cancelled";
          } else {
            stepState = "active";
          }
        } else if (TERMINAL_STATUSES.includes(normalizedCurrent)) {
          const terminalStepIndex = steps.findIndex(
            (item) => normalizedLabel(item.status) === normalizedCurrent,
          );

          if (stepStatus === "delivered") {
            stepState = "pending";
          } else if (TERMINAL_STATUSES.includes(stepStatus)) {
            stepState = "pending";
          } else if (terminalStepIndex !== -1 && idx < terminalStepIndex) {
            stepState = "completed";
          } else {
            stepState = "pending";
          }
        } else if (!normalizedCurrent) {
          stepState = idx === steps.length - 1 ? "active" : "completed";
        } else {
          const currentIndex = getStatusIndex(normalizedCurrent);
          const stepIndex = getStatusIndex(stepStatus);

          if (currentIndex !== -1 && stepIndex !== -1) {
            // Both statuses are recognized Delhivery shipment stages - use
            // their canonical order for a more accurate state.
            if (stepIndex < currentIndex) {
              stepState = "completed";
            } else if (stepIndex === currentIndex) {
              stepState = "active";
            } else {
              stepState = "pending";
            }
          } else {
            // Fallback to original behavior for unrecognized/custom
            // statuses, guaranteeing no crash and no behavior change for
            // existing (non-Delhivery) usage.
            const pastSteps = steps
              .slice(0, idx)
              .map((item) => normalizedLabel(item.status));

            if (pastSteps.includes(normalizedCurrent)) {
              stepState = "pending";
            } else {
              stepState = "completed";
            }
          }
        }
        // ===== End Modified =====

        const stateClass =
          stepState === "completed"
            ? "bg-green-100 text-green-700 "
            : stepState === "active"
              ? "bg-emerald-100 text-emerald-700 animate-pulse "
              : stepState === "cancelled"
                ? "bg-red-100 text-red-700 "
                : "bg-gray-100 text-gray-400 ";

        const displayLabel = s.label || formatStatusLabel(s.status);

        // ===== Modified =====
        const displayStatus =
          stepState === "completed"
            ? "Completed"
            : stepState === "active"
              ? "In progress"
              : stepState === "cancelled"
                ? stepStatus === "returned"
                  ? "Returned"
                  : stepStatus === "rto"
                    ? "RTO"
                    : stepStatus === "damaged"
                      ? "Damaged"
                      : stepStatus === "lost"
                        ? "Lost"
                        : stepStatus === "undelivered"
                          ? "Undelivered"
                          : "Cancelled"
                : "Pending";
        // ===== End Modified =====

        return (
          <div key={s.key || s.id || idx} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${stateClass}`.trim()}
              >
                {stepState === "completed" ? (
                  // ===== Modified =====
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
                ) : (
                  <span className="text-sm font-semibold">{idx + 1}</span>
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-px h-6 ${stepState === "completed" ? "bg-green-200" : "bg-gray-200"} mt-1`}
                />
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between gap-4">
                <h4
                  className={`text-sm font-semibold ${stepState === "completed" ? "text-green-700" : stepState === "active" ? "text-emerald-700" : "text-gray-600"}`}
                >
                  {displayLabel}
                </h4>
                {/* ===== Modified ===== */}
                <p className="text-xs text-gray-400">
                  {formatTimestampSafe(s.timestamp)}
                </p>
                {/* ===== End Modified ===== */}
              </div>
              <p
                className={`text-xs mt-1 ${stepState === "completed" ? "text-green-600" : stepState === "active" ? "text-emerald-700" : "text-gray-500"}`}
              >
                {displayStatus}
              </p>
              {/* ===== Modified ===== */}
              {s.notes ? (
                <p className="text-xs mt-1 text-gray-500">{s.notes}</p>
              ) : null}
              {s.remarks ? (
                <p className="text-xs mt-1 text-gray-500">{s.remarks}</p>
              ) : null}
              {(s.location || s.statusCode || s.courier) && (
                <p className="text-xs mt-1 text-gray-400">
                  {[s.location, s.courier, s.statusCode]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              )}
              {/* ===== End Modified ===== */}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default memo(TrackingTimeline);
