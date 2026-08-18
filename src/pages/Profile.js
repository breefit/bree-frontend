import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import axios from "@/lib/api";
import useOrdersSync from "@/hooks/useOrdersSync";
import {
  User,
  MapPin,
  Package,
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  CheckCircle,
  Loader2,
  LogOut,
  RefreshCw,
  KeyRound,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const normalizeStatus = (status) => {
  if (!status) return "pending_payment";
  const lower = String(status).toLowerCase();
  const aliases = {
    pending: "pending_payment",
    confirmed: "paid",
    dispatched: "shipped",
    shipped: "shipped",
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    cancelled: "cancelled",
    returned: "returned",
  };
  return aliases[lower] || lower;
};

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "orders", label: "Orders", icon: Package },
  { id: "bulk-orders", label: "Bulk Orders", icon: Briefcase },
  { id: "subscriptions", label: "Subscriptions", icon: RefreshCw },
];

// Mirrors admin/BulkOrders.js's STATUS_CONFIG labels/colors so a booking's
// status reads the same way here as it does in the admin dashboard.
const BULK_STATUS_CONFIG = {
  new: { label: "New Request", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", color: "bg-orange-100 text-orange-700" },
  quoted: { label: "Quoted", color: "bg-purple-100 text-purple-700" },
  confirmed: { label: "Confirmed", color: "bg-green-100 text-green-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

// ─── Profile Tab ─────────────────────────────────────────────────────────────
function ProfileTab({ user }) {
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`/api/profile`);
        setProfileData(res.data);
        setForm({
          name: res.data.name || "",
          email: res.data.email || "",
          phone: res.data.phone || "",
        });
      } catch {
        if (user) {
          setProfileData(user);
          setForm({
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
          });
        }
      }
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.put(`/api/profile`, form);
      setProfileData((prev) => ({ ...prev, ...form }));
      setShowProfileForm(false);
      toast.success("Profile updated!");
    } catch (err) {
      toast.error("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword.trim()) {
      toast.error("Current password is required.");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Confirm password must match new password.");
      return;
    }

    setPasswordLoading(true);
    try {
      await axios.put(`/api/profile/password`, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordForm(false);
      toast.success("Password updated successfully.");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to change password.",
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!profileData) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-bree-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-8">
        {profileData.picture ? (
          <img
            src={profileData.picture}
            alt={profileData.name}
            className="w-16 h-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                profileData.name,
              )}&background=8BAA5B&color=fff`;
            }}
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-bree-accent/40 flex items-center justify-center">
            <User className="w-8 h-8 text-bree-primary" />
          </div>
        )}
        <div>
          <h2 className="font-outfit text-xl font-semibold text-bree-text-primary">
            {profileData.name}
          </h2>
          <p className="text-bree-text-secondary text-sm">
            {profileData.email}
          </p>
          {profileData.customer_number && (
            <p className="text-bree-primary text-sm font-medium mt-1">
              Customer No. {profileData.customer_number}
            </p>
          )}
        </div>
      </div>

      {/* ── Profile edit form ── */}
      {showProfileForm ? (
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              className="mt-1"
              type="email"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              className="mt-1"
              type="tel"
              placeholder="+91 XXXXX XXXXX"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-bree-primary hover:bg-bree-primary-hover text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
            <Button variant="outline" onClick={() => setShowProfileForm(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { label: "Name", value: profileData.name },
            { label: "Email", value: profileData.email },
            {
              label: "Customer No.",
              value: profileData.customer_number || "—",
            },
            { label: "Phone", value: profileData.phone || "—" },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex flex-col gap-1 p-4 bg-bree-bg rounded-xl"
            >
              <span className="text-xs text-bree-text-secondary uppercase tracking-wide">
                {label}
              </span>
              <span className="font-medium text-bree-text-primary">
                {value}
              </span>
            </div>
          ))}

          <div className="flex gap-4 mt-2">
            <Button
              onClick={() => {
                setShowProfileForm(true);
                setShowPasswordForm(false);
              }}
              variant="outline"
              className="rounded-2xl"
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edit Profile
            </Button>

            <Button
              onClick={() => {
                setShowPasswordForm((prev) => !prev);
                setShowProfileForm(false);
              }}
              variant="outline"
              className="rounded-2xl"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Change Password
            </Button>
          </div>
        </div>
      )}

      {/* ── Password form ── */}
      {showPasswordForm && (
        <div className="mt-6 p-5 bg-white rounded-xl border border-bree-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-outfit text-lg font-semibold text-bree-text-primary">
                Security
              </h3>
              <p className="text-sm text-bree-text-secondary">
                Change your account password below.
              </p>
            </div>
          </div>

          {profileData.provider !== "email" ? (
            <div className="rounded-xl bg-bree-bg p-4 text-sm text-bree-text-secondary">
              Password is managed by your Google account.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Current Password</Label>
                <Input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      newPassword: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handlePasswordChange}
                  disabled={passwordLoading}
                  className="bg-bree-primary hover:bg-bree-primary-hover text-white"
                >
                  {passwordLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Change Password
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordForm({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Addresses Tab ────────────────────────────────────────────────────────────
function AddressesTab() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    label: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  });

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await axios.get(`/api/addresses`);
      setAddresses(res.data);
    } catch {
      toast.error("Could not load addresses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const resetForm = () => {
    setForm({
      label: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      pincode: "",
      country: "India",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    try {
      if (editingId) {
        await axios.put(`/api/addresses/${editingId}`, form);
        toast.success("Address updated!");
      } else {
        await axios.post(`/api/addresses`, form);
        toast.success("Address added!");
      }
      fetchAddresses();
      resetForm();
    } catch {
      toast.error("Failed to save address.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/addresses/${id}`);
      toast.success("Address removed.");
      fetchAddresses();
    } catch {
      toast.error("Could not delete address.");
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await axios.put(`/api/addresses/${id}/default`, {});
      toast.success("Default address updated.");
      fetchAddresses();
    } catch {
      toast.error("Could not set default.");
    }
  };

  const startEdit = (addr) => {
    setForm({
      label: addr.label || "",
      address_line1: addr.address_line1 || "",
      address_line2: addr.address_line2 || "",
      city: addr.city || "",
      state: addr.state || "",
      pincode: addr.pincode || "",
      country: addr.country || "India",
    });
    setEditingId(addr.id);
    setShowForm(true);
  };

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-bree-primary" />
      </div>
    );

  return (
    <div className="max-w-lg">
      <div className="space-y-4 mb-6">
        {addresses.length === 0 && !showForm && (
          <p className="text-bree-text-secondary py-8 text-center">
            No addresses saved yet.
          </p>
        )}
        {addresses.map((addr) => (
          <div
            key={addr.id}
            className="p-4 bg-bree-bg rounded-xl border border-bree-border"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-bree-text-primary">
                    {addr.label || "Home"}
                  </span>
                  {addr.is_default && (
                    <span className="text-xs bg-bree-accent/40 text-bree-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-bree-text-secondary">
                  {addr.address_line1}
                  {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                  <br />
                  {addr.city}, {addr.state} — {addr.pincode}
                  <br />
                  {addr.country}
                </p>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                {!addr.is_default && (
                  <button
                    onClick={() => handleSetDefault(addr.id)}
                    className="text-xs text-bree-primary hover:underline"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => startEdit(addr)}
                  className="p-1.5 hover:bg-white rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-bree-text-secondary" />
                </button>
                <button
                  onClick={() => handleDelete(addr.id)}
                  className="p-1.5 hover:bg-white rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="p-4 bg-white rounded-xl border border-bree-border space-y-3">
          <h3 className="font-outfit font-semibold text-bree-text-primary">
            {editingId ? "Edit Address" : "New Address"}
          </h3>
          {[
            { key: "label", label: "Label (Home, Work…)", placeholder: "Home" },
            {
              key: "address_line1",
              label: "Address Line 1",
              placeholder: "123 Main Street",
            },
            {
              key: "address_line2",
              label: "Address Line 2 (optional)",
              placeholder: "Apartment, suite…",
            },
            { key: "city", label: "City", placeholder: "Mumbai" },
            { key: "state", label: "State", placeholder: "Maharashtra" },
            { key: "pincode", label: "PIN Code", placeholder: "400001" },
            { key: "country", label: "Country", placeholder: "India" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <Label className="text-xs">{label}</Label>
              <Input
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
                placeholder={placeholder}
                className="mt-1"
              />
            </div>
          ))}
          <div className="flex gap-3 pt-1">
            <Button
              onClick={handleSubmit}
              className="bg-bree-primary hover:bg-bree-primary-hover text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {editingId ? "Update" : "Add Address"}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Add Address
        </Button>
      )}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────
function OrdersTab() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`/api/orders`);
        const ordersData = Array.isArray(res.data)
          ? res.data
          : res.data?.orders || [];
        setOrders(ordersData);
      } catch {
        toast.error("Could not load orders.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  useOrdersSync((updated) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
    );
  });

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-bree-primary" />
      </div>
    );

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="w-12 h-12 text-bree-border mx-auto mb-4" />
        <p className="text-bree-text-secondary">
          No orders yet. Start your wellness journey!
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {orders.map((order) => (
        <div
          key={order.id}
          className="p-4 bg-bree-bg rounded-xl border border-bree-border"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <span className="text-xs text-bree-text-secondary uppercase tracking-wide">
                Order
              </span>
              <p className="font-outfit font-semibold text-bree-text-primary">
                #{order.order_number || order.id?.slice(-8) || order.id}
              </p>
              {order.parent_package_id && (
                <div className="mt-1 flex flex-col gap-0.5">
                  <span className="inline-flex w-fit items-center gap-1 text-[11px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {order.package_number || "Package"} · Cycle{" "}
                    {order.fulfillment_cycle}
                    {order.package_total_cycles
                      ? ` of ${order.package_total_cycles}`
                      : ""}
                  </span>
                  {order.package_status === "active" &&
                    order.package_next_fulfillment_date && (
                      <span className="text-[11px] text-bree-text-secondary">
                        Next box:{" "}
                        {new Date(
                          order.package_next_fulfillment_date,
                        ).toLocaleDateString("en-IN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {(() => {
                const orderStatus = normalizeStatus(
                  order.status || order.order_status,
                );
                return (
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      orderStatus === "delivered"
                        ? "bg-green-100 text-green-700"
                        : orderStatus === "shipped" ||
                            orderStatus === "out_for_delivery"
                          ? "bg-emerald-100 text-emerald-700"
                          : orderStatus === "paid"
                            ? "bg-sky-100 text-sky-700"
                            : orderStatus === "cancelled"
                              ? "bg-red-100 text-red-600"
                              : orderStatus === "returned"
                                ? "bg-stone-100 text-stone-700"
                                : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {orderStatus.replace(/_/g, " ")}
                  </span>
                );
              })()}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/order/${order.id}/tracking`)}
                  className="text-sm bg-bree-primary text-white px-3 py-1 rounded-full"
                >
                  Track Order
                </button>
              </div>
            </div>
          </div>
          {order.items?.map((item, i) => (
            <div
              key={i}
              className="flex justify-between text-sm py-1 border-t border-bree-border/50 first:border-0"
            >
              <span className="text-bree-text-secondary">
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium text-bree-text-primary">
                ₹{item.price}
              </span>
            </div>
          ))}
          <div className="flex justify-between mt-3 pt-3 border-t border-bree-border font-semibold">
            <span className="text-bree-text-secondary">Total</span>
            <span className="text-bree-primary font-outfit">
              ₹{order.total}
            </span>
          </div>
          {order.created_at && (
            <p className="text-xs text-bree-text-secondary mt-2">
              {new Date(order.created_at).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Bulk Orders Tab ──────────────────────────────────────────────────────────
function BulkOrdersTab() {
  const navigate = useNavigate();
  const [bulkOrders, setBulkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBulkOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Ownership is enforced server-side by the `auth` middleware + a
      // WHERE user_id = req.user.id query — there's no booking id in this
      // request for a user to tamper with, so this can only ever return
      // the logged-in customer's own bulk bookings.
      const res = await axios.get(`/api/bulk-bookings/mine`);
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setBulkOrders(data);
    } catch (err) {
      const msg =
        err.response?.data?.message || "Could not load your bulk orders.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBulkOrders();
  }, [fetchBulkOrders]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-bree-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-bree-text-secondary mb-4">{error}</p>
        <Button variant="outline" onClick={fetchBulkOrders}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (bulkOrders.length === 0) {
    return (
      <div className="text-center py-16">
        <Briefcase className="w-12 h-12 text-bree-border mx-auto mb-4" />
        <p className="text-bree-text-secondary">
          No bulk orders yet. Interested in ordering for your organization?
        </p>
        <Button
          onClick={() => navigate("/bulk")}
          variant="outline"
          className="mt-4 rounded-2xl"
        >
          Request a Bulk Quote
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {bulkOrders.map((booking) => {
        const statusInfo =
          BULK_STATUS_CONFIG[booking.status] || BULK_STATUS_CONFIG.new;

        return (
          <div
            key={booking.id}
            className="p-4 bg-bree-bg rounded-xl border border-bree-border"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-3">
              <div>
                <span className="text-xs text-bree-text-secondary uppercase tracking-wide">
                  Bulk Order
                </span>
                <p className="font-outfit font-semibold text-bree-text-primary">
                  {booking.bulk_booking_number || "—"}
                </p>
              </div>
              <div className="flex sm:flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                <span
                  className={`text-xs px-3 py-1 rounded-full font-medium ${statusInfo.color}`}
                >
                  {statusInfo.label}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/bulk-order/${booking.id}`)}
                  className="text-sm bg-bree-primary text-white px-3 py-1 rounded-full shrink-0"
                >
                  View Details
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 pt-3 border-t border-bree-border/50">
              <div>
                <span className="block text-xs text-bree-text-secondary uppercase tracking-wide">
                  Company
                </span>
                <span className="font-medium text-bree-text-primary break-words">
                  {booking.company_name || "—"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-bree-text-secondary uppercase tracking-wide">
                  Quantity
                </span>
                <span className="font-medium text-bree-text-primary">
                  {booking.quantity ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-bree-text-secondary uppercase tracking-wide">
                  Quote Price
                </span>
                <span className="font-medium text-bree-primary">
                  {booking.quote_price
                    ? `₹${Number(booking.quote_price).toLocaleString("en-IN")}`
                    : "Pending"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-bree-text-secondary uppercase tracking-wide">
                  Delivery Date
                </span>
                <span className="font-medium text-bree-text-primary">
                  {booking.delivery_date
                    ? new Date(booking.delivery_date).toLocaleDateString(
                        "en-IN",
                        { year: "numeric", month: "short", day: "numeric" },
                      )
                    : "—"}
                </span>
              </div>
            </div>

            {booking.created_at && (
              <p className="text-xs text-bree-text-secondary mt-3 pt-3 border-t border-bree-border/50">
                Requested on{" "}
                {new Date(booking.created_at).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Subscriptions Tab ────────────────────────────────────────────────────────
function SubscriptionsTab() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-bree-border rounded-3xl p-8">
        <h2 className="text-2xl font-semibold text-bree-text-primary mb-3">
          My Subscriptions
        </h2>
        <p className="text-bree-text-secondary mb-6">
          View and manage all your active wellness subscriptions.
        </p>
        <Button
          onClick={() => navigate("/subscriptions")}
          className="bg-bree-primary hover:bg-bree-primary-hover text-white"
        >
          View Subscriptions
        </Button>
      </div>
    </div>
  );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────
const Profile = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab = searchParams.get("tab");
  const activeTab = TABS.some((tab) => tab.id === currentTab)
    ? currentTab
    : "profile";

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!currentTab || !TABS.some((tab) => tab.id === currentTab)) {
      setSearchParams({ tab: "profile" }, { replace: true });
    }
  }, [currentTab, setSearchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bree-bg">
        <Loader2 className="w-8 h-8 animate-spin text-bree-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <Helmet>
        <title>My Profile — BREE Wellness</title>
        <meta
          name="description"
          content="Manage your BREE account — update profile, addresses, and view your order history."
        />
      </Helmet>

      <div className="pt-24 min-h-screen bg-bree-bg">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between mb-10"
          >
            <div>
              <p className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                My Account
              </p>
              <h1 className="font-outfit text-3xl md:text-4xl font-light text-bree-text-primary mt-1">
                Welcome, {user.name?.split(" ")[0]}
              </h1>
            </div>
            <button
              onClick={async () => {
                await logout();
                navigate("/");
              }}
              className="flex items-center gap-2 px-4 py-2 border border-bree-border rounded-full text-sm text-bree-text-secondary hover:bg-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white p-1 rounded-2xl border border-bree-border mb-8 w-full sm:w-fit overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.set("tab", tab.id);
                  setSearchParams(nextParams);
                }}
                className={`flex items-center justify-center gap-3 py-2 px-8 rounded-2xl text-lg transition-all shrink-0 ${
                  activeTab === tab.id
                    ? "bg-bree-primary text-white shadow-sm"
                    : "text-bree-text-secondary hover:text-bree-text-primary"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === "profile" && <ProfileTab user={user} />}
              {activeTab === "addresses" && <AddressesTab />}
              {activeTab === "orders" && <OrdersTab />}
              {activeTab === "bulk-orders" && <BulkOrdersTab />}
              {activeTab === "subscriptions" && <SubscriptionsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default Profile;
