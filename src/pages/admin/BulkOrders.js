import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  Package,
  Calendar,
  ClipboardList,
  X,
  ChevronRight,
  Save,
  AlertCircle,
} from "lucide-react";

import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const API = "/api/admin";

// Status configuration
const STATUS_CONFIG = {
  new: {
    label: "New Request",
    color: "bg-blue-100 text-blue-700",
    badge: "bg-blue-200",
  },
  in_progress: {
    label: "In Progress",
    color: "bg-orange-100 text-orange-700",
    badge: "bg-orange-200",
  },
  quoted: {
    label: "Quoted",
    color: "bg-purple-100 text-purple-700",
    badge: "bg-purple-200",
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-green-100 text-green-700",
    badge: "bg-green-200",
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-100 text-emerald-700",
    badge: "bg-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-700",
    badge: "bg-red-200",
  },
};

const BulkOrders = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [stats, setStats] = useState(null);

  const fetchBookings = async () => {
    try {
      setError("");
      const res = await axios.get(`${API}/bulk-bookings?limit=100`, {
        withCredentials: true,
      });
      setBookings(res.data?.data || []);
    } catch (error) {
      console.error("❌ Failed to fetch bulk bookings", error);
      setError("Failed to load bookings");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/bulk-bookings/stats`, {
        withCredentials: true,
      });
      setStats(res.data?.data);
    } catch (error) {
      console.error("❌ Failed to fetch stats", error);
    }
  };

  useEffect(() => {
    fetchBookings();
    fetchStats();
  }, []);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const search = searchQuery.toLowerCase();
      return (
        booking.company_name?.toLowerCase().includes(search) ||
        booking.contact_person?.toLowerCase().includes(search) ||
        booking.email?.toLowerCase().includes(search) ||
        booking.mobile_number?.includes(search)
      );
    });
  }, [bookings, searchQuery]);

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleViewDetails = (booking) => {
    setSelectedBooking(booking);
    setEditData({ ...booking });
    setError("");
    setSuccessMessage("");
  };

  const handleSaveChanges = async () => {
    if (!selectedBooking) return;

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
        `${API}/bulk-bookings/${selectedBooking.id}`,
        updatePayload,
        {
          withCredentials: true,
        },
      );

      if (res.data?.success) {
        // Update local bookings
        const updated = bookings.map((b) =>
          b.id === selectedBooking.id ? res.data.data : b,
        );
        setBookings(updated);
        setSelectedBooking(res.data.data);
        setEditData(res.data.data);
        setSuccessMessage("✅ Booking updated successfully!");
        await fetchStats();

        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (error) {
      console.error("❌ Error saving booking:", error);
      setError(error.response?.data?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedBooking) return;

    try {
      setSaving(true);
      setError("");

      const res = await axios.put(
        `${API}/bulk-bookings/${selectedBooking.id}`,
        {
          status: newStatus,
        },
        {
          withCredentials: true,
        },
      );

      if (res.data?.success) {
        const updated = bookings.map((b) =>
          b.id === selectedBooking.id ? res.data.data : b,
        );
        setBookings(updated);
        setSelectedBooking(res.data.data);
        setEditData(res.data.data);
        setSuccessMessage(
          `✅ Status changed to "${STATUS_CONFIG[newStatus]?.label}"!`,
        );
        await fetchStats();

        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (error) {
      console.error("❌ Error updating status:", error);
      setError(error.response?.data?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <h2 className="text-xl font-semibold">Loading Bulk Bookings...</h2>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 bg-bree-bg min-h-screen">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-bree-text-primary">
              Bulk Bookings Management
            </h1>
            <p className="text-bree-text-secondary mt-1">
              Manage corporate and bulk booking enquiries with CRM workflow
            </p>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-96">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search by name, email, phone..."
                className="pl-11 h-11 rounded-2xl border-bree-border bg-white"
              />
            </div>
            <Button onClick={handleSearch} className="h-11 rounded-2xl px-4">
              Search
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
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
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {filteredBookings.length === 0 && (
          <div className="bg-white rounded-3xl border border-bree-border p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-bree-primary mb-4" />
            <h3 className="text-xl font-semibold text-bree-text-primary">
              No Bulk Bookings Found
            </h3>
            <p className="text-bree-text-secondary mt-2">
              No booking enquiries available for the current search.
            </p>
          </div>
        )}

        {/* Bookings Table */}
        {filteredBookings.length > 0 && (
          <div className="bg-white rounded-3xl border border-bree-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bree-bg border-b border-bree-border">
                  <tr>
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
                    {filteredBookings.map((booking) => (
                      <motion.tr
                        key={booking.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-bree-bg/50 transition-colors"
                      >
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
                        <td className="px-4 py-4 text-sm text-bree-text-secondary">
                          {new Date(booking.created_at).toLocaleDateString(
                            "en-IN",
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button
                            onClick={() => handleViewDetails(booking)}
                            className="inline-flex items-center gap-1 text-bree-primary hover:text-bree-primary/70 font-medium text-sm transition-colors"
                          >
                            View <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
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
            onClick={() => setSelectedBooking(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-bree-border p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-bree-text-primary">
                  Booking Details
                </h2>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="p-2 hover:bg-bree-bg rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-bree-text-secondary" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Success Message */}
                {successMessage && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
                    {successMessage}
                  </div>
                )}

                {/* Basic Info */}
                <div>
                  <h3 className="text-lg font-semibold text-bree-text-primary mb-4">
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
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50"
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
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={editData.email}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={editData.mobile_number}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Location
                      </label>
                      <input
                        type="text"
                        value={editData.location || ""}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Quantity
                      </label>
                      <input
                        type="number"
                        value={editData.quantity || 0}
                        disabled
                        className="w-full px-4 py-2 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50"
                      />
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
                        className="w-full px-4 py-3 rounded-xl bg-bree-bg border border-bree-border text-bree-text-primary opacity-50 resize-none"
                        rows="3"
                      />
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
                        className="w-full px-4 py-2 rounded-xl border border-bree-border text-bree-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-bree-primary"
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                          <option key={key} value={key}>
                            {val.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quote Price */}
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Quote Price (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editData.quote_price || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            quote_price: e.target.value,
                          })
                        }
                        placeholder="Enter quote price"
                        className="w-full px-4 py-2 rounded-xl border border-bree-border text-bree-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-bree-primary"
                      />
                    </div>

                    {/* Delivery Date */}
                    <div>
                      <label className="block text-sm font-medium text-bree-text-secondary mb-2">
                        Delivery Date
                      </label>
                      <input
                        type="date"
                        value={editData.delivery_date || ""}
                        onChange={(e) =>
                          setEditData({
                            ...editData,
                            delivery_date: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2 rounded-xl border border-bree-border text-bree-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-bree-primary"
                      />
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
                        placeholder="Add internal notes about this booking..."
                        className="w-full px-4 py-3 rounded-xl border border-bree-border text-bree-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-bree-primary resize-none"
                        rows="4"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                {editData.status !== "quoted" &&
                  editData.status !== "confirmed" &&
                  editData.status !== "completed" &&
                  editData.status !== "cancelled" && (
                    <div>
                      <h3 className="text-lg font-semibold text-bree-text-primary mb-3">
                        Quick Actions
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {editData.status !== "quoted" && (
                          <Button
                            onClick={() => handleStatusChange("quoted")}
                            disabled={saving}
                            className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl"
                          >
                            Mark as Quoted
                          </Button>
                        )}
                        {editData.status === "quoted" && (
                          <Button
                            onClick={() => handleStatusChange("confirmed")}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-700 text-white rounded-xl"
                          >
                            Mark as Confirmed
                          </Button>
                        )}
                        {editData.status === "confirmed" && (
                          <Button
                            onClick={() => handleStatusChange("completed")}
                            disabled={saving}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                          >
                            Mark as Completed
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-bree-bg border-t border-bree-border p-6 flex items-center justify-between gap-3">
                <p className="text-sm text-bree-text-secondary">
                  Last updated:{" "}
                  {new Date(editData.updated_at).toLocaleString("en-IN")}
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setSelectedBooking(null)}
                    variant="outline"
                    className="rounded-xl"
                  >
                    Close
                  </Button>
                  <Button
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="bg-bree-primary hover:bg-bree-primary/90 text-white rounded-xl flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

export default BulkOrders;
