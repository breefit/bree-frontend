import { useState, useEffect, useCallback, useMemo } from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
  Search,
  X,
  Trash2,
  MessageCircle,
  CheckCircle,
  Mail,
  Phone,
  Clock,
  MessageSquare,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

import { toast } from "sonner";

import AdminLayout from "@/components/admin/AdminLayout";

import axios from "@/lib/api";

const API = "/api/admin";

const AUTH = () => ({
  withCredentials: true,
});

// FIX (ISSUE-022/ISSUE-023): the search box already sent `search` to the
// backend, but getInquiries never read it (a genuine no-op — see the
// backend fix), and this page never sent page/limit or offered any way to
// reach a second page at all, so anything beyond the first 20 inquiries
// was invisible. Matches the server-side pagination pattern already
// proven correct in Orders.js/AdminSubscriptions.js/BulkOrders.js.
const PAGE_SIZE = 20;

const InquiryCard = ({ inquiry, onDelete, onToggleContacted, onWhatsApp }) => {
  const phoneNumber =
    inquiry.phone ||
    inquiry.mobile ||
    inquiry.phoneNumber ||
    inquiry.contact_number ||
    "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={`h-full bg-white rounded-2xl p-5 shadow-sm border transition-all hover:shadow-md ${
        inquiry.contacted
          ? "border-green-200"
          : "border-bree-border hover:border-bree-primary/30"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm flex-shrink-0 ${
              inquiry.contacted
                ? "bg-green-100 text-green-700"
                : "bg-bree-accent/30 text-bree-primary"
            }`}
          >
            {inquiry?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>

          <div className="min-w-0">
            <p className="font-medium text-bree-text-primary text-sm truncate">
              {inquiry.name}
            </p>

            <p className="text-xs text-bree-text-secondary flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3 shrink-0" />

              <span className="truncate">
                {new Date(inquiry.created_at).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </p>
          </div>
        </div>

        {inquiry.contacted && (
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium flex items-center gap-1 shrink-0">
            <CheckCircle className="w-3 h-3" />
            Contacted
          </span>
        )}
      </div>

      {/* Message */}
      <div className="bg-bree-bg rounded-xl px-4 py-3 mb-4 min-h-[88px]">
        <p className="text-sm text-bree-text-secondary leading-relaxed line-clamp-4">
          {inquiry.message}
        </p>
      </div>

      {/* Contact Info */}
      <div className="flex flex-col gap-2 text-xs text-bree-text-secondary mb-4">
        <a
          href={`mailto:${inquiry.email}`}
          className="flex items-center gap-2 hover:text-bree-primary transition-colors break-all"
        >
          <Mail className="w-3.5 h-3.5 shrink-0" />

          <span>{inquiry.email}</span>
        </a>

        {phoneNumber ? (
          <a
            href={`tel:+91${phoneNumber}`}
            className="flex items-center gap-2 hover:text-bree-primary transition-colors"
          >
            <Phone className="w-3.5 h-3.5 shrink-0" />

            <span>+91 {phoneNumber}</span>
          </a>
        ) : (
          <div className="flex items-center gap-2 text-red-400">
            <Phone className="w-3.5 h-3.5 shrink-0" />

            <span>Phone number not available</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-auto">
        {/* WhatsApp */}
        <Button
          size="sm"
          onClick={() => onWhatsApp(inquiry)}
          disabled={!phoneNumber}
          className="bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-full text-xs h-8 px-3 disabled:opacity-50"
        >
          <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
          WhatsApp
        </Button>

        {/* Contacted */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onToggleContacted(inquiry.id)}
          className={`rounded-full text-xs h-8 px-3 ${
            inquiry.contacted
              ? "border-green-300 text-green-700 hover:bg-green-50"
              : "border-bree-border text-bree-text-secondary hover:border-bree-primary hover:text-bree-primary"
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5 mr-1.5" />

          {inquiry.contacted ? "Uncontact" : "Contacted"}
        </Button>

        {/* Delete */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(inquiry.id)}
          className="rounded-full text-xs h-8 px-3 text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </div>
    </motion.div>
  );
};

const ContactInquiries = () => {
  const [inquiries, setInquiries] = useState([]);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState("all");

  const [dateFilter, setDateFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

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

  // Fetch inquiries — `filter` (all/pending/contacted) maps onto the
  // backend's own `contacted` param so switching tabs (or paginating
  // within one) correctly narrows across the WHOLE dataset, not just
  // whatever happened to be on the currently-loaded page.
  const fetchInquiries = useCallback(async () => {
    setLoading(true);

    try {
      const contactedParam =
        filter === "contacted" ? "true" : filter === "pending" ? "false" : "all";
      const res = await axios.get(`${API}/inquiries`, {
        ...AUTH(),
        params: {
          search: searchQuery || undefined,
          contacted: contactedParam,
          page,
          limit: PAGE_SIZE,
        },
      });

      setInquiries(res.data?.inquiries || res.data || []);
      setTotal(Number(res.data?.total || 0));
    } catch (error) {
      console.error(error);

      setInquiries([]);
      setTotal(0);

      toast.error("Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filter, page]);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Delete Inquiry
  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/inquiries/${id}`, AUTH());

      setInquiries((prev) => prev.filter((i) => i.id !== id));

      toast.success("Inquiry deleted");
    } catch (error) {
      console.error(error);

      toast.error("Failed to delete inquiry");
    }
  };

  // Toggle Contacted Status
  const handleToggleContacted = async (id) => {
    try {
      const currentInquiry = inquiries.find((i) => i.id === id);
      if (!currentInquiry) return;

      const updatedStatus = !currentInquiry.contacted;

      // Save in database
      await axios.patch(
        `${API}/inquiries/${id}/contacted`,
        { contacted: updatedStatus },
        AUTH(),
      );

      // Update frontend instantly
      setInquiries((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                contacted: updatedStatus,
              }
            : i,
        ),
      );

      toast.success(
        updatedStatus ? "Marked as contacted" : "Marked as pending",
      );
    } catch (error) {
      console.error(error);

      toast.error("Failed to update inquiry status");
    }
  };

  // WhatsApp
  const handleWhatsApp = (inquiry) => {
    const mobileNumber =
      inquiry.phone ||
      inquiry.mobile ||
      inquiry.phoneNumber ||
      inquiry.contact_number;

    if (!mobileNumber) {
      toast.error("Phone number not available");
      return;
    }

    const cleanedNumber = mobileNumber.toString().replace(/\D/g, "");

    const text = encodeURIComponent(
      `Hi ${inquiry.name}, this is BREE Wellness team! We're reaching out regarding your inquiry: "${inquiry.message}".`,
    );

    window.open(`https://wa.me/91${cleanedNumber}?text=${text}`, "_blank");
  };

  // Filters — `contacted`/`pending` is now applied server-side (see
  // fetchInquiries), so it's not re-applied here; `dateFilter` (a relative
  // time window) still narrows only within the current page, same as
  // before this fix.
  const filtered = useMemo(() => {
    let filteredData = [...inquiries];

    const now = new Date();

    if (dateFilter === "today") {
      filteredData = filteredData.filter((item) => {
        const itemDate = new Date(item.created_at);

        return itemDate.toDateString() === now.toDateString();
      });
    }

    if (dateFilter === "7days") {
      filteredData = filteredData.filter((item) => {
        const itemDate = new Date(item.created_at);

        const diff = (now - itemDate) / (1000 * 60 * 60 * 24);

        return diff <= 7;
      });
    }

    if (dateFilter === "30days") {
      filteredData = filteredData.filter((item) => {
        const itemDate = new Date(item.created_at);

        const diff = (now - itemDate) / (1000 * 60 * 60 * 24);

        return diff <= 30;
      });
    }

    return filteredData;
  }, [inquiries, dateFilter]);

  // Tabs
  const tabs = [
    {
      key: "all",
      label: "All",
      count: inquiries.length,
    },

    {
      key: "pending",
      label: "Pending",
      count: inquiries.filter((i) => !i.contacted).length,
    },

    {
      key: "contacted",
      label: "Contacted",
      count: inquiries.filter((i) => i.contacted).length,
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-outfit text-2xl font-semibold text-bree-text-primary">
            Contact Inquiries
          </h1>

          <p className="text-bree-text-secondary text-sm mt-1">
            Manage and respond to customer inquiries
          </p>
        </div>

        {/* Search + Tabs */}
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />

            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Search by name, email or mobile..."
              className="pl-10 pr-10 h-11 rounded-xl border-bree-border focus:border-bree-primary"
            />

            {searchInput && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-bree-text-secondary hover:text-bree-text-primary"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Button
            onClick={handleSearch}
            disabled={loading}
            className="h-11 rounded-xl px-4 whitespace-nowrap"
          >
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>

          {/* Status Tabs */}
          <div className="flex flex-wrap gap-2">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  filter === key
                    ? "bg-bree-primary text-white"
                    : "bg-white border border-bree-border text-bree-text-secondary hover:border-bree-primary hover:text-bree-primary"
                }`}
              >
                {label}

                <span
                  className={`ml-1 text-xs ${
                    filter === key
                      ? "text-white/70"
                      : "text-bree-text-secondary"
                  }`}
                >
                  ({count})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap gap-2">
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
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
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

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-5 border border-bree-border animate-pulse"
              >
                <div className="h-52 bg-bree-bg rounded-xl" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageSquare className="w-12 h-12 text-bree-border mb-4" />

            <p className="text-xl font-semibold text-bree-text-primary mb-2">
              No inquiries found
            </p>
            <p className="text-bree-text-secondary">
              {searchQuery
                ? `No inquiries matched "${searchQuery}"`
                : "Try adjusting the filters or search terms."}
            </p>
          </div>
        ) : (
          <>
            <motion.div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
              <AnimatePresence>
                {filtered.map((inquiry) => (
                  <InquiryCard
                    key={inquiry.id}
                    inquiry={inquiry}
                    onDelete={handleDelete}
                    onToggleContacted={handleToggleContacted}
                    onWhatsApp={handleWhatsApp}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8">
                <p className="text-sm text-bree-text-secondary">
                  Page {page} of {totalPages} · {total} inquir
                  {total === 1 ? "y" : "ies"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="w-9 h-9 rounded-lg border-bree-border p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                    className="w-9 h-9 rounded-lg border-bree-border p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default ContactInquiries;
