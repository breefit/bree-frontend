import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Eye,
  Pause,
  Play,
  Trash,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchAdminSubscriptions,
  pauseAdminSubscription,
  resumeAdminSubscription,
  cancelAdminSubscription,
} from "@/services/adminSubscriptionService";
import PackagePurchasesPanel from "@/components/admin/PackagePurchasesPanel";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
  { value: "past_due", label: "Payment Failed" },
  { value: "expired", label: "Expired" },
];

const FREQUENCY_OPTIONS = [
  { value: "all", label: "All Frequencies" },
  { value: "monthly", label: "Monthly" },
];

const statusBadgeStyles = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
  past_due: "bg-rose-100 text-rose-700 border-rose-200",
  expired: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-sky-100 text-sky-700 border-sky-200",
  // ── NEW: Razorpay keeps subscription_status = "active" when
  // cancel_at_cycle_end=1 is used. We detect this by cross-checking
  // order_status = "cancelled" and surface it as a distinct display state.
  cancellation_requested: "bg-red-50 text-red-600 border-red-200",
};

// ── getDisplayStatus ────────────────────────────────────────────────────────
// Derives the correct display status from subscription_status (and order_status
// as a legacy fallback for data already in the DB before Phase 1 fix).
//
// The backend now stores subscription_status = 'cancellation_requested'
// directly when a cancel is triggered with cancel_at_cycle_end=1. We check
// that field first (primary path). The order_status cross-check is kept as a
// fallback for any rows written before the Phase 1 fix was deployed.
//
// States in priority order:
//   1. subscription_status = "cancellation_requested"
//      → "cancellation_requested" (primary path — backend sets this directly)
//   2. subscription_status = "active" AND order_status = "cancelled"
//      → "cancellation_requested" (legacy fallback for pre-fix DB rows)
//   3. everything else → pass subscription_status through unchanged.
const getDisplayStatus = (subscription) => {
  const subscriptionStatus = (
    subscription.subscriptionStatus ||
    subscription.subscription_status ||
    subscription.status ||
    ""
  ).toLowerCase();

  const orderStatus = (
    subscription.orderStatus ||
    subscription.order_status ||
    ""
  ).toLowerCase();

  // Primary: subscription_status is already set correctly by the backend
  if (subscriptionStatus === "cancellation_requested") {
    return "cancellation_requested";
  }

  // Legacy fallback: pre-fix rows where order_status was set to 'cancelled'
  if (subscriptionStatus === "active" && orderStatus === "cancelled") {
    return "cancellation_requested";
  }

  return subscriptionStatus;
};

// ── Human-readable label for each display status ────────────────────────────
// CSS `capitalize` only uppercases the very first letter of the whole string,
// so "cancellation_requested" would render as "Cancellation_requested".
// We map every status to its display string explicitly.
const statusLabel = (displayStatus) => {
  const labels = {
    active: "Active",
    paused: "Paused",
    cancelled: "Cancelled",
    past_due: "Payment Failed",
    expired: "Expired",
    pending: "Pending",
    cancellation_requested: "Cancelled",
  };
  return labels[displayStatus] ?? displayStatus;
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

const ConfirmModal = ({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  danger,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-bree-border p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-bree-text-primary">
              {title}
            </h2>
            <p className="text-sm text-bree-text-secondary mt-2">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl p-2 hover:bg-bree-bg text-bree-text-secondary"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">{children}</div>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <Button variant="secondary" onClick={onClose} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className={`rounded-2xl ${danger ? "bg-red-500 hover:bg-red-600 text-white" : "bg-bree-primary hover:bg-bree-primary-hover text-white"}`}
          >
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

// FIX (ISSUE-012 — admin analytics blind to Model B): Model A (recurring
// Razorpay subscriptions) and Model B (pay-once, ship-monthly packages)
// are both live, distinct business models — this tab lets staff switch
// between them instead of Model B being invisible everywhere. Model A's
// existing table/state/handlers below are completely unchanged.
const VIEW_MODELS = [
  { key: "A", label: "Subscriptions" },
  { key: "B", label: "Package Purchases" },
];

const AdminSubscriptions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [viewModel, setViewModel] = useState("A");
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("");
  const [frequency, setFrequency] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirmState, setConfirmState] = useState({
    open: false,
    action: null,
    item: null,
  });
  const [cancelReason, setCancelReason] = useState("");

  const loadSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await fetchAdminSubscriptions({
        page,
        limit: PAGE_SIZE,
        search: searchQuery,
        status,
        product,
        frequency,
        startDate,
        endDate,
      });
      setSubscriptions(payload.subscriptions || []);
      setTotal(payload.total || 0);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, status, product, frequency, startDate, endDate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filterStatus = params.get("status");
    const upcoming = params.get("upcoming");

    if (filterStatus) {
      setStatus(filterStatus === "payment_failed" ? "past_due" : filterStatus);
    }
    if (upcoming === "today") {
      const today = new Date().toISOString().slice(0, 10);
      setStartDate(today);
      setEndDate(today);
    }
    loadSubscriptions();
  }, [location.search, loadSubscriptions]);

  const handleSearch = () => {
    setSearchQuery(search.trim());
    setPage(1);
  };

  const openActionModal = (action, item) => {
    setCancelReason("");
    setConfirmState({ open: true, action, item });
  };

  const closeActionModal = () => {
    setConfirmState({ open: false, action: null, item: null });
  };

  const performAction = async () => {
    const { action, item } = confirmState;
    if (!item) return;

    try {
      if (action === "cancel" && !cancelReason.trim()) {
        toast.error("Please provide a cancellation reason.");
        return;
      }

      if (action === "pause") {
        await pauseAdminSubscription(item.id);
        toast.success("Subscription paused successfully.");
      }
      if (action === "resume") {
        await resumeAdminSubscription(item.id);
        toast.success("Subscription resumed successfully.");
      }
      if (action === "cancel") {
        await cancelAdminSubscription(item.id, cancelReason.trim());
        toast.success("Subscription cancelled successfully.");
      }

      closeActionModal();
      loadSubscriptions();
    } catch (error) {
      console.error(error);
      toast.error("Action failed. Please try again.");
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  // Shared between both Model A and Model B branches below.
  const modelTabBar = (
    <div className="flex gap-2 bg-white border border-bree-border rounded-2xl p-1.5 w-max mb-6">
      {VIEW_MODELS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setViewModel(tab.key)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            viewModel === tab.key
              ? "bg-bree-primary text-white"
              : "text-bree-text-secondary hover:text-bree-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (viewModel === "B") {
    return (
      <AdminLayout>
        <div className="p-4 md:p-8 bg-bree-bg min-h-screen">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-bree-text-primary">
              Subscriptions
            </h1>
            <p className="text-bree-text-secondary mt-1">
              View recurring subscriptions and pay-once package purchases
              across BREE.
            </p>
          </div>
          {modelTabBar}
          <PackagePurchasesPanel />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 bg-bree-bg min-h-screen">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-bree-text-primary">
              Subscriptions
            </h1>
            <p className="text-bree-text-secondary mt-1">
              View and manage recurring subscriptions across BREE.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              onClick={() => navigate("/admin/subscription-analytics")}
              className="rounded-2xl"
            >
              View Analytics
            </Button>
            <Button
              onClick={loadSubscriptions}
              className="rounded-2xl bg-bree-primary hover:bg-bree-primary-hover text-white"
            >
              Refresh
            </Button>
          </div>
        </div>

        {modelTabBar}

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-6">
          <div className="flex items-center gap-3 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by subscription id, name, email, or phone"
                className="pl-11 h-11 rounded-2xl border-bree-border bg-white"
              />
            </div>
            <Button onClick={handleSearch} className="h-11 rounded-2xl">
              Search
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-bree-text-secondary uppercase tracking-[0.16em] mb-2 block">
                Status
              </label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="Subscription status"
                >
                  <SelectValue>
                    {
                      STATUS_OPTIONS.find((item) => item.value === status)
                        ?.label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-bree-text-secondary uppercase tracking-[0.16em] mb-2 block">
                Frequency
              </label>
              <Select
                value={frequency}
                onValueChange={(value) => {
                  setFrequency(value);
                  setPage(1);
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="Subscription frequency"
                >
                  <SelectValue>
                    {
                      FREQUENCY_OPTIONS.find((item) => item.value === frequency)
                        ?.label
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mb-6">
          <Input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Filter by product"
            className="h-11 rounded-2xl border-bree-border bg-white"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-bree-text-secondary uppercase tracking-[0.16em] mb-1.5 block">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 rounded-2xl border-bree-border bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-bree-text-secondary uppercase tracking-[0.16em] mb-1.5 block">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 rounded-2xl border-bree-border bg-white"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto bg-white rounded-3xl border border-bree-border shadow-sm">
          <table className="min-w-full text-left">
            <thead className="bg-bree-bg/60">
              <tr>
                {[
                  "Order No",
                  "Customer",
                  "Email",
                  "Phone",
                  "Product",
                  "Frequency",
                  "Amount",
                  "Status",
                  "Start Date",
                  "Next Billing",
                  "Renewal Count",
                  "Actions",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-bree-text-secondary"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(PAGE_SIZE)].map((_, index) => (
                  <tr
                    key={index}
                    className="animate-pulse border-t border-bree-border"
                  >
                    {[...Array(12)].map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="px-4 py-4 h-8 bg-bree-bg/40"
                      />
                    ))}
                  </tr>
                ))
              ) : subscriptions.length ? (
                subscriptions.map((subscription) => {
                  // ── Derive the single display status for this row ──────────
                  // We compute this once per row and use it everywhere below
                  // so the badge, button visibility, and debug log are always
                  // in sync with each other.
                  const displayStatus = getDisplayStatus(subscription);

                  // ── Debug log — visible in browser DevTools console ───────
                  // Helps confirm what the backend is actually sending and
                  // what the UI has resolved the display status to.
                  
                  // console.log("[ADMIN SUB STATUS]", {
                  //   subscriptionId: subscription.id,
                  //   subscriptionStatus:
                  //     subscription.subscriptionStatus ||
                  //     subscription.subscription_status,
                  //   orderStatus:
                  //     subscription.orderStatus || subscription.order_status,
                  //   displayStatus,
                  // });

                  return (
                    <tr
                      key={subscription.id}
                      className="border-t border-bree-border hover:bg-bree-bg/40 transition-colors"
                    >
                      <td className="px-4 py-4 text-sm font-medium text-bree-primary">
                        {subscription.orderNumber || "-"}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-primary">
                        {subscription.customerName}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {subscription.email}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {subscription.phone}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {subscription.product}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {subscription.frequency}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-bree-text-primary">
                        ₹{subscription.amount.toLocaleString("en-IN")}
                      </td>

                      {/* ── Status badge ──────────────────────────────────────
                          Uses displayStatus (not subscription.status) so that
                          "cancellation_requested" gets its own red chip instead
                          of being misread as "Active".
                          statusLabel() maps the value to a proper human string
                          because CSS capitalize alone can't handle underscores. */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusBadgeStyles[displayStatus] || "bg-slate-100 text-slate-700 border-slate-200"}`}
                        >
                          {statusLabel(displayStatus)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {formatDate(subscription.startDate)}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {formatDate(subscription.nextBillingDate)}
                      </td>
                      <td className="px-4 py-4 text-sm text-bree-text-secondary">
                        {subscription.renewalCount}
                      </td>

                      {/* ── Action buttons ────────────────────────────────────
                          All conditions use displayStatus so they stay in sync
                          with the badge above.

                          View      — always visible
                          Pause     — only when genuinely active (not when
                                      cancellation is pending)
                          Resume    — only when paused or past_due
                          Cancel    — hidden for: cancelled, expired, AND
                                      cancellation_requested (already on its way
                                      out — no point triggering a second cancel) */}
                      <td className="px-4 py-4 space-y-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(`/admin/subscriptions/${subscription.id}`)
                          }
                          className="w-full rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <Eye className="w-4 h-4 mr-2" /> View
                        </Button>

                        {/* Pause: only when subscription is genuinely active.
                            cancellation_requested is excluded because the
                            subscription is already winding down. */}
                        {displayStatus === "active" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              openActionModal("pause", subscription)
                            }
                            className="w-full rounded-2xl bg-amber-100 text-amber-700 hover:bg-amber-200"
                          >
                            <Pause className="w-4 h-4 mr-2" /> Pause
                          </Button>
                        )}

                        {/* Resume: paused subscriptions and those with a
                            failed payment can be reactivated. */}
                        {(displayStatus === "paused" ||
                          displayStatus === "past_due") && (
                          <Button
                            size="sm"
                            onClick={() =>
                              openActionModal("resume", subscription)
                            }
                            className="w-full rounded-2xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          >
                            <Play className="w-4 h-4 mr-2" /> Resume
                          </Button>
                        )}

                        {/* Cancel: hidden for already-cancelled, expired, and
                            cancellation_requested (duplicate cancel would error
                            on Razorpay and confuse the admin). */}
                        {displayStatus !== "cancelled" &&
                          displayStatus !== "expired" &&
                          displayStatus !== "cancellation_requested" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                openActionModal("cancel", subscription)
                              }
                              className="w-full rounded-2xl bg-rose-100 text-rose-700 hover:bg-rose-200"
                            >
                              <Trash className="w-4 h-4 mr-2" /> Cancel
                            </Button>
                          )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-12 text-center text-sm text-bree-text-secondary"
                  >
                    No subscriptions match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-bree-text-secondary">
            Showing {subscriptions.length} of {total} subscription
            {total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              className="rounded-2xl"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <span className="text-sm text-bree-text-secondary">
              Page {page} of {pageCount || 1}
            </span>
            <Button
              disabled={page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(current + 1, pageCount || 1))
              }
              className="rounded-2xl"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {confirmState.open && (
          <ConfirmModal
            open={confirmState.open}
            onClose={closeActionModal}
            title={
              confirmState.action === "cancel"
                ? "Cancel Subscription"
                : confirmState.action === "pause"
                  ? "Pause Subscription"
                  : "Resume Subscription"
            }
            description={`${
              confirmState.action === "cancel"
                ? "This will cancel the subscription and stop future renewals."
                : confirmState.action === "pause"
                  ? "This will pause the subscription immediately."
                  : "This will resume the subscription and schedule future renewals."
            }`}
            confirmLabel={
              confirmState.action === "cancel"
                ? "Confirm Cancel"
                : confirmState.action === "pause"
                  ? "Pause"
                  : "Resume"
            }
            danger={confirmState.action === "cancel"}
            onConfirm={performAction}
          >
            {confirmState.action === "cancel" && (
              <div>
                <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                  Admin Reason
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-bree-border p-3 text-sm text-bree-text-primary outline-none focus:ring-2 focus:ring-bree-primary/30"
                  placeholder="Add a cancellation reason for audit and customer context..."
                />
              </div>
            )}
          </ConfirmModal>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
