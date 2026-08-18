import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  Package,
  X,
  ChevronRight,
  ChevronLeft,
  Save,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  CreditCard,
  Send,
  RotateCcw,
  History,
  Copy,
  Download,
  Inbox,
  Lock,
  ShieldCheck,
  PackageCheck,
} from "lucide-react";

import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API = "/api/admin";
const PAGE_SIZE = 10;

// Status configuration — order defines the only allowed forward sequence.
// "cancelled" is a special terminal state reachable from any non-terminal status.
const STATUS_CONFIG = {
  new: {
    label: "New Request",
    color: "bg-blue-100 text-blue-700",
    badge: "bg-blue-200",
    order: 0,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-orange-100 text-orange-700",
    badge: "bg-orange-200",
    order: 1,
  },
  quoted: {
    label: "Quoted",
    color: "bg-purple-100 text-purple-700",
    badge: "bg-purple-200",
    order: 2,
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-green-100 text-green-700",
    badge: "bg-green-200",
    order: 3,
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-200",
    order: 4,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-700",
    badge: "bg-red-200",
    order: -1,
  },
};

const STATUS_ORDER = ["new", "in_progress", "quoted", "confirmed", "completed"];

// Statuses that require an explicit confirmation dialog before saving.
const REQUIRES_CONFIRMATION = ["quoted", "confirmed", "completed", "cancelled"];

const TIMELINE_STEPS = [
  { key: "new", label: "Enquiry Submitted", dateField: "created_at" },
  { key: "in_progress", label: "Under Review", dateField: "in_progress_at" },
  { key: "quoted", label: "Quote Sent", dateField: "quoted_at" },
  { key: "confirmed", label: "Confirmed", dateField: "confirmed_at" },
  { key: "completed", label: "Completed", dateField: "completed_at" },
];

// Payment status → badge color mapping.
const PAYMENT_STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
  paid: { label: "Paid", color: "bg-green-100 text-green-700" },
  failed: { label: "Failed", color: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", color: "bg-purple-100 text-purple-700" },
};

// Which communication actions make sense for a given booking status.
// A booking's status must be in `enabledStatuses` for that action to be
// technically valid on the backend. Actual on-screen VISIBILITY is
// narrower — see STATUS_VISIBLE_ACTIONS below — so only the single
// currently-relevant action shows per CRM stage instead of a row of
// disabled buttons.
const COMMUNICATION_ACTIONS = [
  {
    key: "quote",
    label: "Send Quote",
    enabledStatuses: ["new", "in_progress", "quoted", "confirmed", "completed"],
  },
  {
    key: "confirmation",
    label: "Send Confirmation",
    enabledStatuses: ["confirmed", "completed"],
  },
  {
    key: "dispatch",
    label: "Send Dispatch Details",
    enabledStatuses: ["completed"],
  },
];

// Which single action(s) are relevant to surface for each CRM stage.
// "new" shows no communication action — the only thing to do with a brand
// new enquiry is move it to "in_progress" (a Quick Action, not a
// communication action); only once it's "in_progress" does "Send Quote"
// appear, so quoting can't skip the review step. There is no admin action
// for the "quoted" stage — once a quote is shared, the customer approves it
// and pays directly via Razorpay Magic Checkout themselves; no admin-side
// payment link step exists.
const STATUS_VISIBLE_ACTIONS = {
  new: [],
  in_progress: ["quote"],
  quoted: [],
  confirmed: ["confirmation"],
  completed: ["dispatch"],
  cancelled: [],
};

// Endpoints for the generic (non-quote) communication actions.
const COMMUNICATION_ENDPOINTS = {
  confirmation: (id) => `${API}/bulk-bookings/${id}/send-confirmation`,
  dispatch: (id) => `${API}/bulk-bookings/${id}/send-dispatch`,
};

const isCommEnabled = (status, key) => {
  const action = COMMUNICATION_ACTIONS.find((a) => a.key === key);
  return action ? action.enabledStatuses.includes(status) : false;
};

const isValidTransition = (current, next) => {
  if (!current || !next || next === current) return true;

  if (next === "cancelled") {
    return current !== "completed" && current !== "cancelled";
  }

  if (current === "cancelled" || current === "completed") return false;

  const currentIdx = STATUS_ORDER.indexOf(current);
  const nextIdx = STATUS_ORDER.indexOf(next);
  if (currentIdx === -1 || nextIdx === -1) return false;

  return nextIdx === currentIdx + 1;
};

// Empty is treated as "not entered" here — whether it's actually required
// depends on the target status (only enforced when confirming), matching
// the existing CRM workflow. Once a value IS entered, it must be valid.
const isValidQuotePrice = (value) => {
  if (value === "" || value === null || value === undefined) return true;
  const num = Number(value);
  return !Number.isNaN(num) && num > 0;
};

const getTodayDateString = () => new Date().toISOString().slice(0, 10);

const isValidDeliveryDate = (value) => {
  if (!value) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(value);
  if (Number.isNaN(selected.getTime())) return false;
  selected.setHours(0, 0, 0, 0);
  return selected >= today;
};

const formatDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// The real, backend-generated reference (bulk_booking_number, e.g.
// "BB-100001") — never fabricate one from the UUID. Every booking has this
// by the time it reaches the admin UI (generated at creation; legacy rows
// are backfilled on server startup), so the fallback only covers an
// in-flight request racing the backfill.
const getBookingDisplayId = (booking) => booking.bulk_booking_number || "—";

const escapeCsvField = (value) => {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// Small display helper: returns a fallback "Not Available" string for any
// nullish/empty value, otherwise returns the value as-is.
const displayOrNA = (value) =>
  value === null || value === undefined || value === ""
    ? "Not Available"
    : value;

// Enquiry Address: new bookings store a single free-text field
// (enquiry_address). Older bookings, created before this migration, only
// have the legacy structured columns (address_line1/2, city, state,
// pincode, country) — composed into a single display string here so they
// keep rendering correctly without any data migration.
const getEnquiryAddressDisplay = (booking) => {
  if (!booking) return "Not Available";
  if (booking.enquiry_address) return booking.enquiry_address;

  const legacyParts = [
    booking.address_line1,
    booking.address_line2,
    booking.city,
    booking.state,
    booking.pincode,
    booking.country,
  ].filter(Boolean);

  return legacyParts.length ? legacyParts.join(", ") : "Not Available";
};

let toastIdCounter = 0;

const BulkOrders = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [editData, setEditData] = useState(null);
  const [loadingBookingId, setLoadingBookingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [commLoading, setCommLoading] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [stats, setStats] = useState(null);

  const requestSeq = useRef(0);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((type, message) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);
  const dismissToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // Confirmation dialog
  const [confirmState, setConfirmState] = useState(null);
  const openConfirm = ({
    title,
    message,
    confirmText = "Confirm",
    variant = "default",
    onConfirm,
  }) => {
    setConfirmState({ title, message, confirmText, variant, onConfirm });
  };
  const closeConfirm = () => setConfirmState(null);

  // Client-side safety net: mirrors what we asked the server to do, in case
  // the backend hasn't been upgraded yet to filter by search/status/date.
  const applyClientFilters = useCallback(
    (list) => {
      const search = searchQuery.trim().toLowerCase();
      return list.filter((booking) => {
        const matchesSearch =
          !search ||
          getBookingDisplayId(booking).toLowerCase().includes(search) ||
          booking.id?.toLowerCase().includes(search) ||
          booking.company_name?.toLowerCase().includes(search) ||
          booking.contact_person?.toLowerCase().includes(search) ||
          booking.email?.toLowerCase().includes(search) ||
          booking.mobile_number?.includes(search);

        const matchesStatus = !statusFilter || booking.status === statusFilter;

        const matchesDate =
          !dateFilter ||
          (booking.created_at &&
            new Date(booking.created_at).toISOString().slice(0, 10) ===
              dateFilter);

        return matchesSearch && matchesStatus && matchesDate;
      });
    },
    [searchQuery, statusFilter, dateFilter],
  );

  const fetchBookings = useCallback(
    async (page) => {
      const seq = ++requestSeq.current;
      try {
        setLoading(true);
        setError("");

        const res = await axios.get(`${API}/bulk-bookings`, {
          params: {
            page,
            limit: PAGE_SIZE,
            search: searchQuery || undefined,
            status: statusFilter || undefined,
            date: dateFilter || undefined,
          },
          withCredentials: true,
        });

        // A stale response from an older request — ignore it.
        if (seq !== requestSeq.current) return;

        const payload = res.data?.data || [];
        const pagination = res.data?.pagination || res.data?.meta || null;

        if (pagination && typeof pagination.totalPages === "number") {
          // Backend supports true server-side pagination.
          setBookings(payload);
          setTotalPages(Math.max(1, pagination.totalPages));
          setTotalItems(
            pagination.totalItems ?? pagination.total ?? payload.length,
          );
        } else if (payload.length > PAGE_SIZE) {
          // Fallback: backend returned an unpaginated list (legacy
          // `?limit=100` behavior). Filter + paginate client-side so the UI
          // still works correctly until the backend is upgraded.
          const filtered = applyClientFilters(payload);
          const computedTotalPages = Math.max(
            1,
            Math.ceil(filtered.length / PAGE_SIZE),
          );
          const safePage = Math.min(page, computedTotalPages);
          setTotalPages(computedTotalPages);
          setTotalItems(filtered.length);
          setBookings(
            filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
          );
          if (safePage !== page) setCurrentPage(safePage);
        } else {
          // Result already fits on one page.
          const filtered = applyClientFilters(payload);
          setBookings(filtered);
          setTotalPages(1);
          setTotalItems(filtered.length);
        }
      } catch (err) {
        if (seq !== requestSeq.current) return;
        console.error("❌ Failed to fetch bulk bookings", err);
        const msg = err.response?.data?.message || "Failed to load bookings";
        setError(msg);
        addToast("error", msg);
        setBookings([]);
        setTotalPages(1);
        setTotalItems(0);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [searchQuery, statusFilter, dateFilter, applyClientFilters, addToast],
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/bulk-bookings/stats`, {
        withCredentials: true,
      });
      setStats(res.data?.data);
    } catch (err) {
      console.error("❌ Failed to fetch stats", err);
    }
  }, []);

  // Refetch whenever the page or any filter changes. Search/filter changes
  // reset currentPage to 1 in their own handlers below.
  useEffect(() => {
    fetchBookings(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchQuery, statusFilter, dateFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearch = () => {
    setCurrentPage(1);
    setSearchQuery(searchInput.trim());
  };

  const handleStatusFilterChange = (value) => {
    setCurrentPage(1);
    setStatusFilter(value);
  };

  const handleDateFilterChange = (value) => {
    setCurrentPage(1);
    setDateFilter(value);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setStatusFilter("");
    setDateFilter("");
    setCurrentPage(1);
  };

  const goToPage = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
  };

  // Fetches the latest booking record before opening the modal, rather than
  // trusting the (possibly stale) row data already sitting in the table.
  const handleViewDetails = async (booking) => {
    if (loadingBookingId) return; // prevent duplicate requests
    setError("");
    setSuccessMessage("");
    setLoadingBookingId(booking.id);

    try {
      const res = await axios.get(`${API}/bulk-bookings/${booking.id}`, {
        withCredentials: true,
      });
      const latest = res.data?.data || booking;
      setSelectedBooking(latest);
      setEditData({ ...latest });
    } catch (err) {
      console.error("❌ Failed to fetch booking details:", err);
      const msg =
        err.response?.data?.message || "Failed to load latest booking details";
      addToast("error", msg);
    } finally {
      setLoadingBookingId(null);
    }
  };

  // Re-fetches just the currently open booking and syncs both selectedBooking
  // and editData. Used after every successful action so the modal always
  // reflects the latest backend state (status, payment_status, linkedOrder,
  // communication_history, order_created, etc.) without requiring the user
  // to close/reopen it.
  const refreshSelectedBooking = useCallback(async (bookingId) => {
    if (!bookingId) return;
    try {
      const res = await axios.get(`${API}/bulk-bookings/${bookingId}`, {
        withCredentials: true,
      });
      const latest = res.data?.data;
      if (latest) {
        setSelectedBooking(latest);
        setEditData(latest);
      }
    } catch (err) {
      console.error("❌ Failed to refresh booking details:", err);
    }
  }, []);

  const closeModal = () => {
    if (saving || commLoading) return;
    setSelectedBooking(null);
    setEditData(null);
  };

  const copyToClipboard = async (text, label) => {
    if (!text) {
      addToast("error", `No ${label.toLowerCase()} to copy.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(String(text));
      addToast("success", `${label} copied to clipboard!`);
    } catch (err) {
      console.error("❌ Copy failed", err);
      addToast("error", `Failed to copy ${label.toLowerCase()}.`);
    }
  };

  // Actually persists changes for the currently open booking.
  const saveBookingChanges = async () => {
    if (!selectedBooking || saving) return;

    const bookingId = selectedBooking.id;

    try {
      setSaving(true);
      setError("");

      const updatePayload = {
        status: editData.status,
        quote_price: editData.quote_price === "" ? null : editData.quote_price,
        delivery_date:
          editData.delivery_date === "" ? null : editData.delivery_date,
        admin_notes: editData.admin_notes === "" ? null : editData.admin_notes,
      };

      const res = await axios.put(
        `${API}/bulk-bookings/${bookingId}`,
        updatePayload,
        { withCredentials: true },
      );

      if (res.data?.success) {
        // Reflect the update in the open modal immediately...
        setSelectedBooking(res.data.data);
        setEditData(res.data.data);
        const msg = res.data.message || "Booking updated successfully!";
        setSuccessMessage(`✅ ${msg}`);
        addToast("success", msg);

        // ...then refresh the table from the server (rather than only
        // patching local state) so it stays in sync, preserving the current
        // page, search query, and filters.
        await fetchBookings(currentPage);
        await fetchStats();

        // Also pull the full booking record again, in case the PUT response
        // doesn't include derived fields like linkedOrder, payment_status,
        // order_created, or communication_history.
        await refreshSelectedBooking(bookingId);

        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      console.error("❌ Error saving booking:", err);
      const msg = err.response?.data?.message || "Failed to save changes";
      setError(msg);
      addToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  // Entry point for the "Save Changes" button — validates the staged status
  // change (from the dropdown) before persisting anything.
  const handleSaveChanges = async () => {
    if (!selectedBooking || !editData || saving) return;
    if (selectedBooking.order_created) return; // read-only once an order exists
    setError("");

    // Whatever is currently entered must be valid before we submit anything,
    // regardless of the status being changed.
    if (!isValidQuotePrice(editData.quote_price)) {
      addToast(
        "error",
        "Quote price must be a positive number greater than 0.",
      );
      return;
    }
    if (!isValidDeliveryDate(editData.delivery_date)) {
      addToast("error", "Delivery date cannot be in the past.");
      return;
    }

    const statusChanged = editData.status !== selectedBooking.status;

    if (statusChanged) {
      if (!isValidTransition(selectedBooking.status, editData.status)) {
        addToast(
          "error",
          `Cannot move from "${STATUS_CONFIG[selectedBooking.status]?.label}" to "${STATUS_CONFIG[editData.status]?.label}" directly.`,
        );
        return;
      }

      if (
        editData.status === "quoted" &&
        (!editData.quote_price || !editData.delivery_date)
      ) {
        addToast(
          "error",
          "Quote price and delivery date are required before marking a booking as Quoted.",
        );
        return;
      }

      if (
        editData.status === "confirmed" &&
        (!editData.quote_price || !editData.delivery_date)
      ) {
        addToast(
          "error",
          "Quote price and delivery date are required before confirming a booking.",
        );
        return;
      }

      if (REQUIRES_CONFIRMATION.includes(editData.status)) {
        openConfirm({
          title: `Mark as ${STATUS_CONFIG[editData.status]?.label}?`,
          message: `This will update the status to "${STATUS_CONFIG[editData.status]?.label}" and save your other changes.`,
          confirmText: "Yes, Save",
          variant: editData.status === "cancelled" ? "danger" : "default",
          onConfirm: async () => {
            closeConfirm();
            await saveBookingChanges();
          },
        });
        return;
      }
    }

    await saveBookingChanges();
  };

  // Used by the Quick Action buttons — changes status directly via the API
  // without requiring the rest of the form to be saved.
  const performStatusChange = async (newStatus) => {
    if (!selectedBooking || saving) return;

    try {
      setSaving(true);
      setError("");

      const res = await axios.put(
        `${API}/bulk-bookings/${selectedBooking.id}`,
        { status: newStatus },
        { withCredentials: true },
      );

      if (res.data?.success) {
        setSelectedBooking(res.data.data);
        setEditData(res.data.data);
        const msg =
          res.data.message ||
          `Status changed to "${STATUS_CONFIG[newStatus]?.label}"!`;
        setSuccessMessage(`✅ ${msg}`);
        addToast("success", msg);

        // Refresh from the server rather than only patching local state,
        // preserving the current page, search query, and filters.
        await fetchBookings(currentPage);
        await fetchStats();
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      console.error("❌ Error updating status:", err);
      const msg = err.response?.data?.message || "Failed to update status";
      setError(msg);
      addToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatusChange = (newStatus) => {
    if (!selectedBooking || saving) return;
    if (selectedBooking.order_created) return; // read-only once an order exists

    if (!isValidTransition(selectedBooking.status, newStatus)) {
      addToast(
        "error",
        `Cannot move from "${STATUS_CONFIG[selectedBooking.status]?.label}" to "${STATUS_CONFIG[newStatus]?.label}" directly.`,
      );
      return;
    }

    if (newStatus === "quoted") {
      if (!editData?.quote_price || !editData?.delivery_date) {
        addToast(
          "error",
          "Quote price and delivery date are required before marking a booking as Quoted.",
        );
        return;
      }
      if (!isValidQuotePrice(editData.quote_price)) {
        addToast(
          "error",
          "Quote price must be a positive number greater than 0.",
        );
        return;
      }
      if (!isValidDeliveryDate(editData.delivery_date)) {
        addToast("error", "Delivery date cannot be in the past.");
        return;
      }
    }

    if (newStatus === "confirmed") {
      if (!editData?.quote_price || !editData?.delivery_date) {
        addToast(
          "error",
          "Quote price and delivery date are required before confirming a booking.",
        );
        return;
      }
      if (!isValidQuotePrice(editData.quote_price)) {
        addToast(
          "error",
          "Quote price must be a positive number greater than 0.",
        );
        return;
      }
      if (!isValidDeliveryDate(editData.delivery_date)) {
        addToast("error", "Delivery date cannot be in the past.");
        return;
      }
    }

    const label = STATUS_CONFIG[newStatus]?.label;
    openConfirm({
      title:
        newStatus === "cancelled"
          ? "Cancel this booking?"
          : `Mark as ${label}?`,
      message:
        newStatus === "cancelled"
          ? "This will cancel the booking. This action cannot be undone."
          : `This will update the booking status to "${label}".`,
      confirmText:
        newStatus === "cancelled" ? "Yes, Cancel Booking" : "Yes, Confirm",
      variant: newStatus === "cancelled" ? "danger" : "default",
      onConfirm: async () => {
        closeConfirm();
        await performStatusChange(newStatus);
      },
    });
  };

  // "Send Quote" — saves the staged quote_price / delivery_date and moves the
  // booking to status="quoted" in a single PUT, then refreshes everything.
  const handleSendQuote = async () => {
    if (!selectedBooking || commLoading) return;

    if (!editData?.quote_price || !editData?.delivery_date) {
      addToast(
        "error",
        "Quote price and delivery date are required to send a quote.",
      );
      return;
    }
    if (!isValidQuotePrice(editData.quote_price)) {
      addToast(
        "error",
        "Quote price must be a positive number greater than 0.",
      );
      return;
    }
    if (!isValidDeliveryDate(editData.delivery_date)) {
      addToast("error", "Delivery date cannot be in the past.");
      return;
    }

    const bookingId = selectedBooking.id;
    setCommLoading("quote");
    setError("");
    try {
      const res = await axios.put(
        `${API}/bulk-bookings/${bookingId}`,
        {
          quote_price: editData.quote_price,
          delivery_date: editData.delivery_date,
          status: "quoted",
        },
        { withCredentials: true },
      );

      if (res.data?.success) {
        setSelectedBooking(res.data.data);
        setEditData(res.data.data);
        const msg = res.data.message || "Quote sent successfully!";
        addToast("success", msg);

        await fetchBookings(currentPage);
        await fetchStats();
        await refreshSelectedBooking(bookingId);
      }
    } catch (err) {
      console.error("❌ Failed to send quote:", err);
      // Show the backend's validation message exactly as returned, e.g.
      // "Cannot confirm booking before payment is verified." etc.
      const msg = err.response?.data?.message || "Failed to send quote";
      setError(msg);
      addToast("error", msg);
    } finally {
      setCommLoading(null);
    }
  };

  // Generic handler for the remaining communication actions (confirmation,
  // dispatch) that don't need a custom payload.
  const handleSendCommunication = async (type, label) => {
    if (!selectedBooking || commLoading) return;
    if (!isCommEnabled(selectedBooking.status, type)) {
      addToast(
        "error",
        `${label} isn't applicable for a booking that's "${STATUS_CONFIG[selectedBooking.status]?.label}".`,
      );
      return;
    }

    const endpointBuilder = COMMUNICATION_ENDPOINTS[type];
    if (!endpointBuilder) {
      addToast("error", `${label} is not available yet.`);
      return;
    }

    const bookingId = selectedBooking.id;
    setCommLoading(type);
    setError("");
    try {
      const res = await axios.post(
        endpointBuilder(bookingId),
        {},
        { withCredentials: true },
      );

      if (res.data?.success !== false) {
        if (res.data?.data) {
          setSelectedBooking(res.data.data);
          setEditData(res.data.data);
        }
        const msg = res.data?.message || `${label} sent successfully!`;
        addToast("success", msg);

        await fetchBookings(currentPage);
        await fetchStats();
        await refreshSelectedBooking(bookingId);
      }
    } catch (err) {
      console.error(`❌ Failed to send ${label}:`, err);
      const msg = err.response?.data?.message || `Failed to send ${label}`;
      setError(msg);
      addToast("error", msg);
    } finally {
      setCommLoading(null);
    }
  };

  const exportCSV = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const res = await axios.get(`${API}/bulk-bookings`, {
        params: {
          limit: 5000,
          search: searchQuery || undefined,
          status: statusFilter || undefined,
          date: dateFilter || undefined,
        },
        withCredentials: true,
      });

      const rows = applyClientFilters(res.data?.data || []);

      if (rows.length === 0) {
        addToast("error", "No bookings match the current filters to export.");
        return;
      }

      const headers = [
        "Booking ID",
        "Company",
        "Contact Person",
        "Email",
        "Mobile",
        "Quantity",
        "Status",
        "Quote Price",
        "Delivery Date",
        "Payment Status",
        "Created Date",
      ];

      const csvRows = rows.map((b) => [
        getBookingDisplayId(b),
        b.company_name || "",
        b.contact_person || "",
        b.email || "",
        b.mobile_number || "",
        b.quantity ?? 0,
        STATUS_CONFIG[b.status]?.label || b.status,
        b.quote_price ?? "",
        b.delivery_date ?? "",
        b.payment_status
          ? PAYMENT_STATUS_CONFIG[b.payment_status]?.label || b.payment_status
          : "Not Available",
        b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN") : "",
      ]);

      const csvContent = [headers, ...csvRows]
        .map((row) => row.map(escapeCsvField).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bulk-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addToast("success", `Exported ${rows.length} booking(s) to CSV.`);
    } catch (err) {
      console.error("❌ Export failed", err);
      addToast("error", "Failed to export bookings.");
    } finally {
      setExporting(false);
    }
  };

  const quotePriceError =
    editData && !isValidQuotePrice(editData.quote_price)
      ? "Quote price must be a positive number greater than 0."
      : "";

  const deliveryDateError =
    editData && !isValidDeliveryDate(editData.delivery_date)
      ? "Delivery date cannot be in the past."
      : "";

  // Booking becomes read-only once an Order has been created from it.
  const isOrderLocked = Boolean(selectedBooking?.order_created);

  const currentStatusOrder = editData
    ? (STATUS_CONFIG[editData.status]?.order ?? -1)
    : -1;
  const nextStatus =
    editData && currentStatusOrder >= 0 && currentStatusOrder < 4
      ? STATUS_ORDER[currentStatusOrder + 1]
      : null;
  const canAdvance =
    editData &&
    !isOrderLocked &&
    editData.status !== "completed" &&
    editData.status !== "cancelled" &&
    nextStatus;
  const canCancel =
    editData &&
    !isOrderLocked &&
    editData.status !== "completed" &&
    editData.status !== "cancelled";

  // Only backend-provided history is shown — no session-only placeholder
  // entries. Automatically reflects whatever the backend returns.
  const communicationHistory = selectedBooking?.communication_history || [];

  const isPaymentVerified = selectedBooking?.payment_status === "paid";

  // Duplicate-prevention: a quote has already gone out if the backend has
  // recorded any of these markers.
  const quoteAlreadySent = Boolean(
    selectedBooking?.quoted_at ||
    selectedBooking?.quote_shared_at ||
    selectedBooking?.quote_sent,
  );

  // Quoting is only reachable after the booking has moved to "in_progress" —
  // "new" must go through "Mark as In Progress" first, so the workflow can't
  // skip straight from "new" to "quoted".
  const canSendQuote =
    selectedBooking &&
    selectedBooking.status === "in_progress" &&
    !quoteAlreadySent;

  // Support either `linkedOrder` or `order` from the backend response.
  const linkedOrderData =
    selectedBooking?.linkedOrder || selectedBooking?.order;

  // Only the single action relevant to the booking's current CRM stage is
  // shown — plus the duplicate-prevention checks above hide it once it's
  // already been done, instead of leaving a disabled button on screen.
  const visibleCommunicationActions = selectedBooking
    ? COMMUNICATION_ACTIONS.filter((action) => {
        const statusVisible = (
          STATUS_VISIBLE_ACTIONS[selectedBooking.status] || []
        ).includes(action.key);
        if (!statusVisible) return false;

        if (action.key === "quote" && !canSendQuote) return false;

        return true;
      })
    : [];

  const hasActiveFilters = Boolean(searchQuery || statusFilter || dateFilter);

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 bg-bree-bg min-h-screen">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-bree-text-primary">
              Bulk Bookings Management
            </h1>
            <p className="text-bree-text-secondary mt-1">
              Manage corporate and bulk booking enquiries with CRM workflow
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full lg:w-auto lg:items-end">
            <div className="flex items-center gap-2 w-full lg:w-96">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by ID, name, email, phone..."
                  className="pl-11 h-11 rounded-2xl border-bree-border bg-white"
                />
              </div>
              <Button onClick={handleSearch} className="h-11 rounded-2xl px-4">
                Search
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="h-10 px-3 rounded-xl border border-bree-border bg-white text-sm text-bree-text-primary focus:outline-none focus:ring-2 focus:ring-bree-primary"
              >
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => handleDateFilterChange(e.target.value)}
                className="h-10 px-3 rounded-xl border border-bree-border bg-white text-sm text-bree-text-primary focus:outline-none focus:ring-2 focus:ring-bree-primary"
              />

              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="h-10 px-3 flex items-center gap-1.5 rounded-xl border border-bree-border text-sm text-bree-text-secondary hover:bg-bree-bg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear Filters
                </button>
              )}

              <button
                onClick={exportCSV}
                disabled={exporting}
                className="h-10 px-3 flex items-center gap-1.5 rounded-xl border border-bree-border bg-white text-sm text-bree-text-primary hover:bg-bree-bg transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {loading && !stats ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 shadow-sm border border-bree-border animate-pulse"
              >
                <div className="h-3 w-12 bg-gray-200 rounded mb-3" />
                <div className="h-6 w-8 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-bree-border">
                <p className="text-xs text-bree-text-secondary">Total</p>
                <h3 className="text-2xl font-bold text-bree-primary">
                  {stats.totalBookings}
                </h3>
              </div>
              <div className="bg-blue-50 rounded-2xl p-4 shadow-sm border border-blue-200">
                <p className="text-xs text-blue-600">New</p>
                <h3 className="text-2xl font-bold text-blue-700">
                  {stats.newBookings}
                </h3>
              </div>
              <div className="bg-orange-50 rounded-2xl p-4 shadow-sm border border-orange-200">
                <p className="text-xs text-orange-600">In Progress</p>
                <h3 className="text-2xl font-bold text-orange-700">
                  {stats.inProgressBookings}
                </h3>
              </div>
              <div className="bg-purple-50 rounded-2xl p-4 shadow-sm border border-purple-200">
                <p className="text-xs text-purple-600">Quoted</p>
                <h3 className="text-2xl font-bold text-purple-700">
                  {stats.quotedBookings}
                </h3>
              </div>
              <div className="bg-green-50 rounded-2xl p-4 shadow-sm border border-green-200">
                <p className="text-xs text-green-600">Confirmed</p>
                <h3 className="text-2xl font-bold text-green-700">
                  {stats.confirmedBookings}
                </h3>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 shadow-sm border border-emerald-200">
                <p className="text-xs text-emerald-600">Completed</p>
                <h3 className="text-2xl font-bold text-emerald-700">
                  {stats.completedBookings}
                </h3>
              </div>
            </div>
          )
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Skeleton Table (loading) */}
        {loading && (
          <div className="bg-white rounded-3xl border border-bree-border overflow-hidden shadow-sm">
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded flex-1" />
                  <div className="h-4 bg-gray-200 rounded flex-1" />
                  <div className="h-4 bg-gray-200 rounded flex-1" />
                  <div className="h-4 bg-gray-200 rounded w-16" />
                  <div className="h-4 bg-gray-200 rounded w-20" />
                  <div className="h-4 bg-gray-200 rounded w-20" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && bookings.length === 0 && (
          <div className="bg-white rounded-3xl border border-bree-border p-12 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-bree-bg flex items-center justify-center mb-4">
              <Inbox className="w-8 h-8 text-bree-primary" />
            </div>
            <h3 className="text-xl font-semibold text-bree-text-primary">
              No bulk bookings found.
            </h3>
            <p className="text-bree-text-secondary mt-2">
              Try changing your search or filters.
            </p>
          </div>
        )}

        {/* Bookings Table */}
        {!loading && bookings.length > 0 && (
          <div className="bg-white rounded-3xl border border-bree-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bree-bg border-b border-bree-border">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Booking ID
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Company
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Name
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Email
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Phone
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Qty
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Status
                    </th>
                    <th className="px-4 py-4 text-left text-sm font-semibold text-bree-text-primary">
                      Date
                    </th>
                    <th className="px-4 py-4 text-center text-sm font-semibold text-bree-text-primary">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bree-border">
                  <AnimatePresence>
                    {bookings.map((booking) => (
                      <motion.tr
                        key={booking.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-bree-bg/50 transition-colors"
                      >
                        <td className="px-4 py-4 text-sm font-mono font-medium text-bree-primary whitespace-nowrap">
                          {getBookingDisplayId(booking)}
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-bree-text-primary">
                          {booking.company_name}
                        </td>
                        <td className="px-4 py-4 text-sm text-bree-text-secondary">
                          {booking.contact_person}
                        </td>
                        <td className="px-4 py-4 text-sm text-bree-text-secondary">
                          {booking.email}
                        </td>
                        <td className="px-4 py-4 text-sm text-bree-text-secondary">
                          {booking.mobile_number}
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-bree-text-primary">
                          {booking.quantity || 0}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                              STATUS_CONFIG[booking.status]?.color
                            }`}
                          >
                            {STATUS_CONFIG[booking.status]?.label ||
                              booking.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-bree-text-secondary whitespace-nowrap">
                          {new Date(booking.created_at).toLocaleDateString(
                            "en-IN",
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => handleViewDetails(booking)}
                            disabled={loadingBookingId === booking.id}
                            className="inline-flex items-center gap-1 text-bree-primary hover:text-bree-primary/70 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loadingBookingId === booking.id ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              <>
                                View <ChevronRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 border-t border-bree-border bg-bree-bg/40">
              <p className="text-sm text-bree-text-secondary">
                {totalItems > 0
                  ? `Showing page ${currentPage} of ${totalPages} (${totalItems} total)`
                  : "No results"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-bree-border bg-white text-sm text-bree-text-primary hover:bg-bree-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm font-medium text-bree-text-primary px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-bree-border bg-white text-sm text-bree-text-primary hover:bg-bree-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedBooking && editData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-bree-border p-6 flex items-center justify-between z-10">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-bree-text-primary">
                      Booking Details
                    </h2>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          getBookingDisplayId(selectedBooking),
                          "Booking ID",
                        )
                      }
                      title="Copy Booking ID"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bree-bg text-xs font-mono text-bree-text-secondary hover:text-bree-primary transition-colors"
                    >
                      {getBookingDisplayId(selectedBooking)}
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        STATUS_CONFIG[selectedBooking.status]?.color
                      }`}
                    >
                      {STATUS_CONFIG[selectedBooking.status]?.label ||
                        selectedBooking.status}
                    </span>
                    {isPaymentVerified && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Payment Verified
                      </span>
                    )}
                    {selectedBooking.order_created && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <PackageCheck className="w-3.5 h-3.5" />
                        Order Created Successfully
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  disabled={saving || commLoading !== null}
                  className="p-2 hover:bg-bree-bg rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-6 h-6 text-bree-text-secondary" />
                </button>
              </div>

              <div className="p-6 space-y-8">
                {/* Success Message */}
                {successMessage && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    {successMessage}
                  </div>
                )}

                {/* Order Created banner */}
                {selectedBooking.order_created && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Order Created Successfully
                      {selectedBooking.created_order_id
                        ? ` — Order ID: ${selectedBooking.created_order_id}`
                        : ""}
                    </span>
                  </div>
                )}

                {/* Read-only lock notice */}
                {isOrderLocked && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-center gap-2">
                    <Lock className="w-4 h-4 flex-shrink-0" />
                    This booking is locked because an Order has already been
                    created.
                  </div>
                )}

                {/* Linked Order Info — supports either `linkedOrder` or `order` */}
                {linkedOrderData && (
                  <div>
                    <h3 className="text-lg font-semibold text-bree-text-primary mb-4 flex items-center gap-2">
                      <PackageCheck className="w-4 h-4 text-bree-primary" />
                      Linked Order
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-bree-bg rounded-2xl p-4 border border-bree-border">
                      <div>
                        <p className="text-xs text-bree-text-secondary mb-1">
                          Order Number
                        </p>
                        <p className="text-sm font-medium text-bree-text-primary">
                          {displayOrNA(linkedOrderData.order_number)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-bree-text-secondary mb-1">
                          Order Status
                        </p>
                        <p className="text-sm font-medium text-bree-text-primary">
                          {displayOrNA(
                            linkedOrderData.order_status ||
                              linkedOrderData.status,
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-bree-text-secondary mb-1">
                          Payment Status
                        </p>
                        <p className="text-sm font-medium text-bree-text-primary">
                          {displayOrNA(linkedOrderData.payment_status)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-bree-text-secondary mb-1">
                          Total
                        </p>
                        <p className="text-sm font-medium text-bree-text-primary">
                          {linkedOrderData.total !== undefined &&
                          linkedOrderData.total !== null &&
                          linkedOrderData.total !== ""
                            ? `₹${linkedOrderData.total}`
                            : "Not Available"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Basic Info */}
                <div>
                  <h3 className="text-lg font-semibold text-bree-text-primary mb-4 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-bree-primary" />
                    Basic Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={editData.company_name}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        value={editData.contact_person}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          value={editData.email}
                          disabled
                          className="w-full px-4 py-2 pr-10 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70"
                        />
                        <button
                          onClick={() =>
                            copyToClipboard(editData.email, "Email")
                          }
                          title="Copy Email"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white text-bree-text-secondary hover:text-bree-primary transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> Phone Number
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={editData.mobile_number}
                          disabled
                          className="w-full px-4 py-2 pr-10 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70"
                        />
                        <button
                          onClick={() =>
                            copyToClipboard(
                              editData.mobile_number,
                              "Mobile number",
                            )
                          }
                          title="Copy Mobile Number"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white text-bree-text-secondary hover:text-bree-primary transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> Location
                      </label>
                      <input
                        type="text"
                        value={editData.location || ""}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> Quantity
                      </label>
                      <input
                        type="number"
                        value={editData.quantity || 0}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70 font-semibold"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-bree-text-secondary mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Enquiry Address
                    </label>
                    <div className="w-full px-4 py-3 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary whitespace-pre-wrap">
                      {getEnquiryAddressDisplay(selectedBooking)}
                    </div>
                  </div>
                  {editData.requirements && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Requirements
                      </label>
                      <textarea
                        value={editData.requirements}
                        disabled
                        className="w-full px-4 py-3 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-70 resize-none"
                        rows="3"
                      />
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div>
                  <h3 className="text-lg font-semibold text-bree-text-primary mb-4 flex items-center gap-2">
                    <History className="w-4 h-4 text-bree-primary" />
                    Booking Timeline
                  </h3>
                  <div className="space-y-0">
                    {TIMELINE_STEPS.map((step, idx) => {
                      const stepOrder = STATUS_CONFIG[step.key].order;
                      const isCancelled =
                        selectedBooking.status === "cancelled";
                      const reached =
                        !isCancelled && currentStatusOrder >= stepOrder;
                      const isCurrent =
                        !isCancelled && currentStatusOrder === stepOrder;
                      const timestamp =
                        editData[step.dateField] ||
                        (step.key === "new" ? editData.created_at : null);

                      return (
                        <div key={step.key} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                reached
                                  ? isCurrent
                                    ? "bg-bree-primary text-white"
                                    : "bg-emerald-500 text-white"
                                  : "bg-bree-bg border border-bree-border text-bree-text-secondary"
                              }`}
                            >
                              {reached && !isCurrent ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              )}
                            </div>
                            {idx < TIMELINE_STEPS.length - 1 && (
                              <div
                                className={`w-0.5 flex-1 min-h-[24px] ${
                                  reached && currentStatusOrder > stepOrder
                                    ? "bg-emerald-500"
                                    : "bg-bree-border"
                                }`}
                              />
                            )}
                          </div>
                          <div className="pb-6">
                            <p
                              className={`text-sm font-medium ${
                                reached
                                  ? "text-bree-text-primary"
                                  : "text-bree-text-secondary"
                              }`}
                            >
                              {step.label}
                            </p>
                            <p className="text-xs text-bree-text-secondary mt-0.5">
                              {formatDateTime(timestamp) ||
                                (reached
                                  ? "Timestamp not recorded"
                                  : "Pending")}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {selectedBooking.status === "cancelled" && (
                      <div className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0">
                          <XCircle className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-red-600">
                            Booking Cancelled
                          </p>
                          <p className="text-xs text-bree-text-secondary mt-0.5">
                            {formatDateTime(editData.cancelled_at) ||
                              formatDateTime(editData.updated_at) ||
                              "Timestamp not recorded"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Information */}
                <div>
                  <h3 className="text-lg font-semibold text-bree-text-primary mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-bree-primary" />
                    Payment Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-bree-bg rounded-2xl p-4 border border-bree-border">
                    <div>
                      <p className="text-xs text-bree-text-secondary mb-1.5">
                        Payment Status
                      </p>
                      {editData.payment_status ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                              PAYMENT_STATUS_CONFIG[editData.payment_status]
                                ?.color || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {PAYMENT_STATUS_CONFIG[editData.payment_status]
                              ?.label || editData.payment_status}
                          </span>
                          {isPaymentVerified && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Payment Verified
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-bree-text-secondary">
                          Not Available
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-bree-text-secondary mb-1">
                        Payment Method
                      </p>
                      <p className="text-sm font-medium text-bree-text-primary">
                        {editData.payment_method || "Not Available"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-bree-text-secondary mb-1">
                        Transaction ID
                      </p>
                      <p className="text-sm font-medium text-bree-text-primary break-all">
                        {editData.transaction_id || "Not Available"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-bree-text-secondary mb-1">
                        Payment Date
                      </p>
                      <p className="text-sm font-medium text-bree-text-primary">
                        {formatDateTime(editData.payment_date) ||
                          "Not Available"}
                      </p>
                    </div>
                  </div>

                  {/* Detailed verification breakdown — shown once payment is
                      confirmed, in addition to (not replacing) the badge
                      above. */}
                  {isPaymentVerified && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-green-50 rounded-2xl p-4 border border-green-200">
                      <div className="md:col-span-3 flex items-center gap-2 text-green-700 text-sm font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        Payment Verified
                      </div>
                      <div>
                        <p className="text-xs text-green-700/80 mb-1">
                          Paid On
                        </p>
                        <p className="text-sm font-medium text-green-800">
                          {formatDateTime(
                            editData.payment_date || editData.paid_at,
                          ) || "Not Available"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700/80 mb-1">
                          Transaction ID
                        </p>
                        <p className="text-sm font-medium text-green-800 break-all">
                          {editData.transaction_id ||
                            editData.razorpay_payment_id ||
                            "Not Available"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700/80 mb-1">
                          Razorpay Order ID
                        </p>
                        <p className="text-sm font-medium text-green-800 break-all">
                          {editData.razorpay_order_id || "Not Available"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* CRM Workflow */}
                <div>
                  <h3 className="text-lg font-semibold text-bree-text-primary mb-4">
                    CRM Workflow
                  </h3>
                  <div className="space-y-4">
                    {/* Status */}
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Status
                      </label>
                      <select
                        value={editData.status}
                        onChange={(e) =>
                          setEditData({ ...editData, status: e.target.value })
                        }
                        disabled={saving || isOrderLocked}
                        className="w-full px-4 py-2 rounded-xl border border-bree-border text-bree-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-bree-primary disabled:opacity-50"
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, val]) => {
                          const disabledOption =
                            key !== selectedBooking.status &&
                            !isValidTransition(selectedBooking.status, key);
                          return (
                            <option
                              key={key}
                              value={key}
                              disabled={disabledOption}
                            >
                              {val.label}
                              {disabledOption ? " (not allowed)" : ""}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-xs text-bree-text-secondary mt-1.5">
                        Statuses must move forward one step at a time: New → In
                        Progress → Quoted → Confirmed → Completed.
                      </p>
                    </div>

                    {/* Quote Price */}
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Quote Price (₹)
                        {editData.status === "confirmed" && (
                          <span className="text-red-500"> *</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        value={editData.quote_price || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            quote_price: e.target.value,
                          })
                        }
                        disabled={saving || isOrderLocked}
                        placeholder="Enter quote price"
                        className={`w-full px-4 py-2 rounded-xl border text-bree-text-primary bg-white focus:outline-none focus:ring-2 disabled:opacity-50 ${
                          quotePriceError
                            ? "border-red-400 focus:ring-red-400"
                            : "border-bree-border focus:ring-bree-primary"
                        }`}
                      />
                      {quotePriceError && (
                        <p className="text-xs text-red-600 mt-1.5">
                          {quotePriceError}
                        </p>
                      )}
                    </div>

                    {/* Delivery Date */}
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Delivery Date
                        {editData.status === "confirmed" && (
                          <span className="text-red-500"> *</span>
                        )}
                      </label>
                      <input
                        type="date"
                        min={getTodayDateString()}
                        value={editData.delivery_date || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            delivery_date: e.target.value,
                          })
                        }
                        disabled={saving || isOrderLocked}
                        className={`w-full px-4 py-2 rounded-xl border text-bree-text-primary bg-white focus:outline-none focus:ring-2 disabled:opacity-50 ${
                          deliveryDateError
                            ? "border-red-400 focus:ring-red-400"
                            : "border-bree-border focus:ring-bree-primary"
                        }`}
                      />
                      {deliveryDateError && (
                        <p className="text-xs text-red-600 mt-1.5">
                          {deliveryDateError}
                        </p>
                      )}
                    </div>

                    {/* Admin Notes */}
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Admin Notes
                      </label>
                      <textarea
                        value={editData.admin_notes || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            admin_notes: e.target.value,
                          })
                        }
                        disabled={saving || isOrderLocked}
                        placeholder="Add internal notes about this booking..."
                        className="w-full px-4 py-3 rounded-xl border border-bree-border text-bree-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-bree-primary disabled:opacity-50 resize-none"
                        rows="4"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Actions — hidden entirely once Completed/Cancelled/Locked */}
                {(canAdvance || canCancel) && (
                  <div>
                    <h3 className="text-lg font-semibold text-bree-text-primary mb-3">
                      Quick Actions
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {canAdvance && (
                        <Button
                          onClick={() => handleQuickStatusChange(nextStatus)}
                          disabled={saving}
                          className="rounded-xl text-white disabled:opacity-50"
                          style={{
                            backgroundColor:
                              nextStatus === "quoted"
                                ? "#9333ea"
                                : nextStatus === "confirmed"
                                  ? "#16a34a"
                                  : "#059669",
                          }}
                        >
                          {saving && (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          )}
                          Mark as {STATUS_CONFIG[nextStatus]?.label}
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          onClick={() => handleQuickStatusChange("cancelled")}
                          disabled={saving}
                          variant="outline"
                          className="rounded-xl border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancel Booking
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Customer Communication */}
                <div>
                  <h3 className="text-lg font-semibold text-bree-text-primary mb-3 flex items-center gap-2">
                    <Send className="w-4 h-4 text-bree-primary" />
                    Customer Communication
                  </h3>
                  {visibleCommunicationActions.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                      {visibleCommunicationActions.map((action) => {
                        const handleClick = () => {
                          if (action.key === "quote") return handleSendQuote();
                          return handleSendCommunication(
                            action.key,
                            action.label,
                          );
                        };

                        return (
                          <button
                            key={action.key}
                            onClick={handleClick}
                            disabled={commLoading !== null}
                            title={action.label}
                            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-bree-border bg-white text-xs font-medium text-bree-text-primary hover:bg-bree-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white text-center"
                          >
                            {commLoading === action.key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-bree-bg rounded-xl border border-bree-border p-4 text-sm text-bree-text-secondary text-center mb-5">
                      No communication actions available for this booking right
                      now.
                    </div>
                  )}

                  {/* Communication History */}
                  <div>
                    <p className="text-sm font-medium text-bree-text-secondary mb-2">
                      Communication History
                    </p>
                    {communicationHistory.length === 0 ? (
                      <div className="bg-bree-bg rounded-xl border border-bree-border p-4 text-sm text-bree-text-secondary text-center">
                        No communication history available.
                      </div>
                    ) : (
                      <div className="bg-bree-bg rounded-xl border border-bree-border divide-y divide-bree-border overflow-hidden">
                        {communicationHistory.map((entry, idx) => (
                          <div
                            key={`${entry.type}-${entry.sentAt || entry.sent_at}-${idx}`}
                            className="flex items-center justify-between px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-bree-text-primary">
                                {entry.label || entry.type}
                              </p>
                              <p className="text-xs text-bree-text-secondary mt-0.5">
                                {formatDateTime(entry.sentAt || entry.sent_at)}{" "}
                                · Sent by{" "}
                                {entry.sentBy || entry.sent_by || "Admin"}
                              </p>
                            </div>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-bree-bg border-t border-bree-border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-sm text-bree-text-secondary">
                  Last updated:{" "}
                  {formatDateTime(editData.updated_at) || "Not Available"}
                </p>
                <div className="flex gap-3 w-full sm:w-auto">
                  <Button
                    onClick={closeModal}
                    disabled={saving || commLoading !== null}
                    variant="outline"
                    className="rounded-xl flex-1 sm:flex-none disabled:opacity-50"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleSaveChanges}
                    disabled={
                      saving ||
                      isOrderLocked ||
                      Boolean(quotePriceError) ||
                      Boolean(deliveryDateError)
                    }
                    className="bg-bree-primary hover:bg-bree-primary/90 text-white rounded-xl flex items-center justify-center gap-2 flex-1 sm:flex-none disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {confirmState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]"
            onClick={() => !saving && closeConfirm()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-sm w-full p-6"
            >
              <h3 className="text-lg font-semibold text-bree-text-primary mb-2">
                {confirmState.title}
              </h3>
              <p className="text-sm text-bree-text-secondary mb-6">
                {confirmState.message}
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  onClick={closeConfirm}
                  disabled={saving}
                  variant="outline"
                  className="rounded-xl disabled:opacity-50"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmState.onConfirm}
                  disabled={saving}
                  className={`rounded-xl text-white disabled:opacity-50 flex items-center gap-2 ${
                    confirmState.variant === "danger"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-bree-primary hover:bg-bree-primary/90"
                  }`}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmState.confirmText}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 10, x: 10 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={`flex items-start gap-2 rounded-xl px-4 py-3 shadow-lg border text-sm ${
                toast.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 opacity-60 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AdminLayout>
  );
};

export default BulkOrders;
