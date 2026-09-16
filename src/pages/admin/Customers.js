import { useState, useEffect, useCallback } from "react";

import { motion, AnimatePresence } from "framer-motion";

import {
  Search,
  Users,
  Mail,
  Phone,
  MapPin,
  Calendar,
  MoreVertical,
  ShoppingBag,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import AdminLayout from "@/components/admin/AdminLayout";
import axios from "@/lib/api";

const API = "/api/admin";
const AUTH = () => ({ withCredentials: true });
// FIX (ISSUE-023 — capped at 20, no pagination): the backend
// (getCustomers) already supported real server-side search + page/limit +
// total all along — this page just never sent those params or offered any
// way to reach page 2, so anything beyond the first 20 customers was
// invisible and unsearchable. Matches the server-side pagination pattern
// already proven correct in Orders.js/AdminSubscriptions.js/BulkOrders.js.
const PAGE_SIZE = 20;

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(() => {
    setPage(1);
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setPage(1);
    setSearchQuery("");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchCustomers = async () => {
      setLoading(true);

      try {
        const res = await axios.get(`${API}/customers`, {
          ...AUTH(),
          params: {
            page,
            limit: PAGE_SIZE,
            search: searchQuery || undefined,
          },
        });
        if (cancelled) return;
        const normalized = (res.data?.customers || []).map((customer) => ({
          ...customer,
          orders: Number(customer.order_count || 0),
          spent: Number(customer.total_spent || 0),
          location: customer.provider || "Direct",
          joined: new Date(customer.created_at).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          status: Number(customer.order_count || 0) > 0 ? "Active" : "Inactive",
        }));
        setCustomers(normalized);
        setTotal(Number(res.data?.total || 0));
      } catch {
        if (!cancelled) {
          setCustomers([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCustomers();
    return () => {
      cancelled = true;
    };
  }, [page, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // This page (server-paginated) — the current page's rows, unfiltered
  // further on the client.
  const filteredCustomers = customers;

  // STATS — reflect the true total across all pages, not just this page's
  // rows. Active/orders/revenue are necessarily figures for the loaded
  // page only, since computing them across the full filtered set would
  // require a dedicated aggregate endpoint this page doesn't have.
  const totalCustomers = total;

  const activeCustomers = customers.filter((c) => c.status === "Active").length;

  const totalOrders = customers.reduce((acc, item) => acc + item.orders, 0);

  const totalRevenue = customers.reduce((acc, item) => acc + item.spent, 0);

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 bg-bree-bg min-h-screen">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-bree-text-primary">
              Customers
            </h1>

            <p className="text-bree-text-secondary mt-1">
              Manage and monitor customer activity
            </p>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 w-full lg:w-96">
            <div className="relative flex-1">
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
                placeholder="Search by customer number, name, email or phone..."
                className="pl-11 pr-11 h-11 rounded-2xl border-bree-border bg-white"
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

            <Button
              onClick={handleSearch}
              disabled={loading}
              className="h-11 rounded-2xl px-4 text-sm"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {/* Total Customers */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-bree-border">
            <div className="w-12 h-12 rounded-2xl bg-bree-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-bree-primary" />
            </div>

            <p className="text-sm text-bree-text-secondary">Total Customers</p>

            <h2 className="text-3xl font-bold mt-2 text-bree-text-primary">
              {totalCustomers}
            </h2>
          </div>

          {/* Active */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-bree-border">
            <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-green-600" />
            </div>

            <p className="text-sm text-bree-text-secondary">Active Customers</p>

            <h2 className="text-3xl font-bold mt-2 text-green-600">
              {activeCustomers}
            </h2>
          </div>

          {/* Orders */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-bree-border">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center mb-4">
              <ShoppingBag className="w-6 h-6 text-orange-500" />
            </div>

            <p className="text-sm text-bree-text-secondary">Total Orders</p>

            <h2 className="text-3xl font-bold mt-2 text-orange-500">
              {totalOrders}
            </h2>
          </div>

          {/* Revenue */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-bree-border">
            <div className="w-12 h-12 rounded-2xl bg-bree-primary/10 flex items-center justify-center mb-4">
              <ShoppingBag className="w-6 h-6 text-bree-primary" />
            </div>

            <p className="text-sm text-bree-text-secondary">Revenue</p>

            <h2 className="text-3xl font-bold mt-2 text-bree-primary">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </h2>
          </div>
        </div>

        {/* Empty State */}
        {filteredCustomers.length === 0 && (
          <div className="bg-white rounded-3xl border border-bree-border p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-bree-primary/10 flex items-center justify-center mx-auto mb-5">
              <Users className="w-8 h-8 text-bree-primary" />
            </div>

            <h3 className="text-xl font-semibold text-bree-text-primary">
              No Customers Found
            </h3>

            <p className="text-bree-text-secondary mt-2">
              No results found for "{searchQuery}"
            </p>
          </div>
        )}

        {/* Customer Cards */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <AnimatePresence>
            {filteredCustomers.map((customer, index) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 25 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.08,
                }}
                className="bg-white rounded-3xl border border-bree-border shadow-sm p-5 md:p-6 hover:shadow-md transition-shadow"
              >
                {/* Top */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-14 h-14 rounded-2xl bg-bree-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-lg font-bold text-bree-primary">
                        {customer.name.charAt(0)}
                      </span>
                    </div>

                    {/* Name */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg text-bree-text-primary">
                          {customer.name}
                        </h3>

                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            customer.status === "Active"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {customer.status}
                        </span>
                      </div>

                      <p className="text-sm text-bree-text-secondary mt-1">
                        Customer No. {customer.customer_number || customer.id}
                      </p>
                    </div>
                  </div>

                  <button className="text-bree-text-secondary hover:text-bree-text-primary">
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>

                {/* Details */}
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-bree-text-secondary break-all">
                    <Mail className="w-4 h-4 shrink-0" />

                    {customer.email}
                  </div>

                  <div className="flex items-center gap-3 text-bree-text-secondary">
                    <Phone className="w-4 h-4 shrink-0" />

                    {customer.phone}
                  </div>

                  <div className="flex items-center gap-3 text-bree-text-secondary">
                    <MapPin className="w-4 h-4 shrink-0" />

                    {customer.location}
                  </div>

                  <div className="flex items-center gap-3 text-bree-text-secondary">
                    <Calendar className="w-4 h-4 shrink-0" />
                    Joined on {customer.joined}
                  </div>
                </div>

                {/* Bottom */}
                <div className="mt-6 pt-5 border-t border-bree-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-sm text-bree-text-secondary">Orders</p>

                      <h4 className="text-2xl font-bold text-bree-primary">
                        {customer.orders}
                      </h4>
                    </div>

                    <div>
                      <p className="text-sm text-bree-text-secondary">Spent</p>

                      <h4 className="text-2xl font-bold text-bree-primary">
                        ₹{customer.spent}
                      </h4>
                    </div>
                  </div>

                  {/* <button
                    onClick={() => navigate(`/admin/customers/${customer.id}`)}
                    className="h-11 px-6 rounded-full bg-bree-primary text-white text-sm hover:bg-bree-primary-hover transition whitespace-nowrap"
                  >
                    View Profile
                  </button> */}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8">
            <p className="text-sm text-bree-text-secondary">
              Page {page} of {totalPages} · {total} customer
              {total === 1 ? "" : "s"}
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
      </div>
    </AdminLayout>
  );
};

export default Customers;
