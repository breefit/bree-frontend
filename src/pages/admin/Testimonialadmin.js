import { useMemo, useState, useEffect, useCallback } from "react";

import {
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  Star,
  CalendarDays,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import AdminLayout from "@/components/admin/AdminLayout";
import axios from "@/lib/api";
import { toast } from "sonner";

const API = "/api/admin";

const AUTH = () => ({
  withCredentials: true,
});

// FIX (ISSUE-023 — capped at 20, no pagination): getAdminTestimonials
// never returned a total count at all, so this page had no way to build
// real pagination even if it tried — only ever showing the first page's
// worth of testimonials. Matches the server-side pagination pattern
// already proven correct in Orders.js/AdminSubscriptions.js/BulkOrders.js.
const PAGE_SIZE = 20;

export default function TestimonialsAdmin() {
  const [filter, setFilter] = useState("all");
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // VIEW MODAL
  const [selectedTestimonial, setSelectedTestimonial] = useState(null);
  const [actioningId, setActioningId] = useState(null);

  const handleSearch = useCallback(() => {
    setPage(1);
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setPage(1);
    setSearchQuery("");
  }, []);

  const handleFilterChange = useCallback((key) => {
    setPage(1);
    setFilter(key);
  }, []);

  // `filter` (status) is sent to the backend now — narrows across the
  // WHOLE dataset, not just whatever happened to be on the currently
  // loaded page.
  const fetchTestimonials = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${API}/testimonials`, {
        ...AUTH(),
        params: {
          status: filter,
          search: searchQuery || undefined,
          page,
          limit: PAGE_SIZE,
        },
      });
      const rows = res.data?.testimonials || res.data || [];
      setTestimonials(
        rows.map((item) => ({
          ...item,
          review: item.text,
          status: item.status || (item.approved ? "approved" : "pending"),
          date: item.created_at,
        })),
      );
      setTotal(Number(res.data?.total ?? rows.length));
    } catch (err) {
      console.error("Unable to fetch testimonials", err);
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Unable to fetch testimonials.",
      );
      setTestimonials([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery, page]);

  useEffect(() => {
    fetchTestimonials();

    const handleNewTestimonial = () => {
      fetchTestimonials();
    };

    window.addEventListener("testimonial:submitted", handleNewTestimonial);
    return () => {
      window.removeEventListener("testimonial:submitted", handleNewTestimonial);
    };
  }, [fetchTestimonials]);

  // DATE FILTER
  const [dateFilter, setDateFilter] = useState("all");

  const handleApprove = async (id) => {
    if (actioningId) return;
    setActioningId(id);
    try {
      await axios.patch(`${API}/testimonials/${id}/approve`, {}, AUTH());
      toast.success("Testimonial approved");
      await fetchTestimonials();
    } catch (error) {
      console.error("Approve failed", error);
      toast.error(
        error?.response?.data?.message || "Unable to approve testimonial.",
      );
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id) => {
    if (actioningId) return;
    setActioningId(id);
    try {
      await axios.patch(`${API}/testimonials/${id}/reject`, {}, AUTH());
      toast.success("Testimonial rejected");
      await fetchTestimonials();
    } catch (error) {
      console.error("Reject failed", error);
      toast.error(
        error?.response?.data?.message || "Unable to reject testimonial.",
      );
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (id) => {
    if (actioningId) return;
    if (!window.confirm("Delete this testimonial? This cannot be undone."))
      return;

    setActioningId(id);
    try {
      await axios.delete(`${API}/testimonials/${id}`, AUTH());
      toast.success("Testimonial deleted");
      await fetchTestimonials();
    } catch (error) {
      console.error("Delete failed", error);
      toast.error(
        error?.response?.data?.message || "Unable to delete testimonial.",
      );
    } finally {
      setActioningId(null);
    }
  };

  // Status filtering is now applied server-side (see fetchTestimonials);
  // `dateFilter` (a relative time window) still narrows only within the
  // current page, same as before this fix.
  const filteredTestimonials = useMemo(() => {
    let filtered = testimonials;

    const now = new Date();

    if (dateFilter === "today") {
      filtered = filtered.filter((item) => {
        const itemDate = new Date(item.date);

        return itemDate.toDateString() === now.toDateString();
      });
    }

    if (dateFilter === "7days") {
      filtered = filtered.filter((item) => {
        const itemDate = new Date(item.date);

        const diff = (now - itemDate) / (1000 * 60 * 60 * 24);

        return diff <= 7;
      });
    }

    if (dateFilter === "30days") {
      filtered = filtered.filter((item) => {
        const itemDate = new Date(item.date);

        const diff = (now - itemDate) / (1000 * 60 * 60 * 24);

        return diff <= 30;
      });
    }

    return filtered;
  }, [dateFilter, testimonials]);

  // `all` reflects the true server-side total for the current filter/
  // search; per-status counts below are necessarily figures for the
  // loaded page only (the backend doesn't expose a per-status breakdown),
  // same pre-existing approximation as before this fix.
  const counts = {
    all: filter === "all" ? total : testimonials.length,

    pending: testimonials.filter((t) => t.status === "pending").length,

    approved: testimonials.filter((t) => t.status === "approved").length,

    rejected: testimonials.filter((t) => t.status === "rejected").length,
  };

  const TABS = [
    {
      key: "all",
      label: "All",
      count: counts.all,
    },

    {
      key: "pending",
      label: "Pending",
      count: counts.pending,
    },

    {
      key: "approved",
      label: "Approved",
      count: counts.approved,
    },

    {
      key: "rejected",
      label: "Rejected",
      count: counts.rejected,
    },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-4">
          <div className="h-12 bg-bree-bg rounded-2xl animate-pulse" />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 bg-bree-bg rounded-2xl animate-pulse"
              />
            ))}
          </div>

          <div className="h-72 bg-bree-bg rounded-3xl animate-pulse" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        {error && (
          <div className="mb-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Heading */}
        <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-bree-text-primary">
              Testimonials
            </h1>

            <p className="text-sm text-bree-text-secondary mt-1">
              Manage customer reviews and approvals
            </p>
          </div>

          {/* FIX (ISSUE-022/ISSUE-023): search box — this page had no
            search at all before, only client-side status/date filters
            over whatever fit on the first (uncapped) page. */}
          <div className="flex items-center gap-2 w-full lg:w-96">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="Search by name, role or review text..."
                className="w-full pl-11 pr-11 h-11 rounded-2xl border border-bree-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-bree-primary/30"
              />
              {searchInput && (
                <button
                  onClick={clearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4 text-bree-text-secondary hover:text-bree-primary" />
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="h-11 rounded-2xl px-4 text-sm font-medium bg-bree-primary text-white hover:bg-bree-primary/90 disabled:opacity-50 flex items-center"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard
            label="Total"
            value={counts.all}
            icon={MessageSquare}
            color="bg-bree-primary"
          />

          <StatCard
            label="Pending"
            value={counts.pending}
            icon={Clock}
            color="bg-amber-400"
          />

          <StatCard
            label="Approved"
            value={counts.approved}
            icon={CheckCircle}
            color="bg-emerald-500"
          />

          <StatCard
            label="Rejected"
            value={counts.rejected}
            icon={XCircle}
            color="bg-red-400"
          />
        </div>

        {/* Status Filters */}
        <div className="mb-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 bg-white border border-bree-border rounded-2xl p-1.5 shadow-sm w-max min-w-full sm:min-w-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleFilterChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-300 ${
                  filter === tab.key
                    ? "bg-bree-primary text-white shadow-sm"
                    : "text-bree-text-secondary hover:text-bree-text-primary"
                }`}
              >
                <span>{tab.label}</span>

                <span
                  className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    filter === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-bree-bg text-bree-text-secondary"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* DATE FILTERS */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            {
              key: "all",
              label: "All Time",
            },

            {
              key: "today",
              label: "Today",
            },

            {
              key: "7days",
              label: "Last 7 Days",
            },

            {
              key: "30days",
              label: "Last 30 Days",
            },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setDateFilter(item.key)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                dateFilter === item.key
                  ? "bg-bree-primary text-white"
                  : "bg-white border border-bree-border text-bree-text-secondary hover:border-bree-primary hover:text-bree-primary"
              }`}
            >
              <CalendarDays className="w-4 h-4" />

              {item.label}
            </button>
          ))}
        </div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredTestimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-white border border-bree-border rounded-3xl p-5 shadow-sm"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-bree-primary text-white flex items-center justify-center font-semibold shrink-0">
                    {testimonial.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>

                  {/* Info */}
                  <div>
                    <h3 className="font-semibold text-bree-text-primary text-lg leading-tight">
                      {testimonial.name}
                    </h3>

                    <p className="text-sm text-bree-text-secondary">
                      {testimonial.role}
                    </p>

                    {/* Rating */}
                    <div className="flex items-center gap-1 mt-2">
                      {[...Array(testimonial.rating)].map((_, index) => (
                        <Star
                          key={index}
                          className="w-4 h-4 fill-yellow-400 text-yellow-400"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status */}
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    testimonial.status === "approved"
                      ? "bg-emerald-100 text-emerald-700"
                      : testimonial.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {testimonial.status}
                </span>
              </div>

              {/* Review */}
              <p className="text-sm leading-7 text-bree-text-secondary mb-5 line-clamp-3">
                "{testimonial.review}"
              </p>

              {/* Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-xs text-bree-text-secondary">
                  {new Date(testimonial.date).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleApprove(testimonial.id)}
                    disabled={actioningId === testimonial.id}
                    className="h-10 px-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>

                  <button
                    onClick={() => handleReject(testimonial.id)}
                    disabled={actioningId === testimonial.id}
                    className="h-10 px-4 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>

                  {/* VIEW BUTTON */}
                  <button
                    onClick={() => setSelectedTestimonial(testimonial)}
                    className="h-10 w-10 rounded-xl border border-bree-border flex items-center justify-center hover:bg-bree-bg transition"
                  >
                    <Eye className="w-4 h-4 text-bree-text-secondary" />
                  </button>

                  <button
                    onClick={() => handleDelete(testimonial.id)}
                    disabled={actioningId === testimonial.id}
                    className="h-10 w-10 rounded-xl border border-bree-border flex items-center justify-center hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {Math.ceil(total / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between mt-8">
            <p className="text-sm text-bree-text-secondary">
              Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))} ·{" "}
              {total} testimonial{total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="w-9 h-9 rounded-lg border border-bree-border flex items-center justify-center disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(Math.ceil(total / PAGE_SIZE), p + 1))
                }
                disabled={page === Math.ceil(total / PAGE_SIZE) || loading}
                className="w-9 h-9 rounded-lg border border-bree-border flex items-center justify-center disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW MODAL */}
        {selectedTestimonial && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-2xl p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              {/* Close */}
              <button
                onClick={() => setSelectedTestimonial(null)}
                className="absolute top-5 right-5 w-10 h-10 rounded-xl hover:bg-bree-bg flex items-center justify-center transition"
              >
                <X className="w-5 h-5 text-bree-text-secondary" />
              </button>

              {/* User */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-full bg-bree-primary text-white flex items-center justify-center text-lg font-semibold">
                  {selectedTestimonial.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-bree-text-primary">
                    {selectedTestimonial.name}
                  </h2>

                  <p className="text-bree-text-secondary mt-1">
                    {selectedTestimonial.role}
                  </p>

                  {/* Rating */}
                  <div className="flex items-center gap-1 mt-3">
                    {[...Array(selectedTestimonial.rating)].map((_, index) => (
                      <Star
                        key={index}
                        className="w-5 h-5 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Review */}
              <div className="bg-bree-bg rounded-2xl p-5 mb-6">
                <p className="text-bree-text-secondary leading-8 text-base">
                  "{selectedTestimonial.review}"
                </p>
              </div>

              {/* Date */}
              <div className="text-sm text-bree-text-secondary mb-6">
                Submitted on{" "}
                {new Date(selectedTestimonial.date).toLocaleString("en-IN", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    handleApprove(selectedTestimonial.id);
                    setSelectedTestimonial(null);
                  }}
                  className="h-11 px-5 rounded-2xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve Testimonial
                </button>

                <button
                  onClick={() => {
                    handleReject(selectedTestimonial.id);
                    setSelectedTestimonial(null);
                  }}
                  className="h-11 px-5 rounded-2xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Testimonial
                </button>

                <button
                  onClick={() => {
                    handleDelete(selectedTestimonial.id);
                    setSelectedTestimonial(null);
                  }}
                  className="h-11 px-5 rounded-2xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl border border-bree-border p-3 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm">
      <div
        className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center ${color}`}
      >
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
      </div>

      <div>
        <p className="text-lg sm:text-2xl font-bold text-bree-text-primary leading-none">
          {value}
        </p>

        <p className="text-[11px] sm:text-xs text-bree-text-secondary mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}
