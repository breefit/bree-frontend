import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MapPin,
  Mail,
  Loader2,
  Shield,
  CheckCircle2,
  Truck,
  RefreshCw,
  Lock,
  Leaf,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import axios from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpayLoader";
import { createSubscription } from "@/services/subscriptionService";

const REMINDER_TIMES = ["04:00", "04:30", "05:00", "05:30", "06:00"];

const maskPhoneNumber = (phone) => {
  if (!phone) return "";

  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 10) {
    return `+91 XXXXXX${digits.slice(-4)}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 XXXXXX${digits.slice(-4)}`;
  }

  if (digits.length > 4) {
    return `+91 XXXXXX${digits.slice(-4)}`;
  }

  return phone;
};

const isValidReminderPhone = (value) => {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return false;
  if (digits.length === 10) return /^[6-9]/.test(digits);
  if (digits.length === 12) return /^91[6-9]/.test(digits);
  return false;
};

const getReminderTimeDisplay = (time) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${String(displayHour).padStart(2, "0")}:${minutes} ${ampm}`;
};

// ── verifySubscriptionPayment ────────────────────────────────────────────────
// Calls the backend /api/payment/verify endpoint with the subscription payment
// response. This is required to update payment_status → 'paid',
// order_status → 'active', and subscription_status → 'active' in the DB.
// Without this call those fields remain 'pending' / 'created' forever.
const verifySubscriptionPayment = async (razorpayResponse) => {
  const response = await axios.post("/api/payment/verify", {
    razorpay_payment_id: razorpayResponse.razorpay_payment_id,
    razorpay_subscription_id: razorpayResponse.razorpay_subscription_id,
    razorpay_signature: razorpayResponse.razorpay_signature,
  });
  return response.data;
};

const formatAddress = (address) => {
  if (!address) return "";
  return [
    address.address_line1 || address.address_line_1 || "",
    address.address_line2 || address.address_line_2 || "",
    address.city || "",
    address.state || "",
    address.pincode || "",
    address.country || "",
  ]
    .filter(Boolean)
    .join(", ");
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const TRUST_BADGES = [
  { icon: Truck, label: "Free Shipping" },
  { icon: RefreshCw, label: "Cancel Anytime" },
  { icon: Lock, label: "Secure Payments" },
  { icon: CheckCircle2, label: "Auto Renewal" },
];

const BENEFITS = [
  "Free shipping on every renewal",
  "Auto renewal every 30 days",
  "Email renewal reminders",
  "Cancel anytime from dashboard",
  "Priority subscription support",
];

const SubscriptionCheckout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const [product, setProduct] = useState(state.product || null);
  const [frequency] = useState(state.frequency || 30);
  const [subscriptionPrice] = useState(
    Number(state.subscriptionPrice || state.price || product?.price || 0),
  );
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [shippingForm, setShippingForm] = useState({
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  });
  const [contactInfo, setContactInfo] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [reminderSelections, setReminderSelections] = useState({});
  // FIX: tracks a 409 "duplicate active subscription" response from the
  // backend. Once set, the CTA stays disabled so the user can't keep
  // retrying checkout for a product they're already subscribed to.
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  useEffect(() => {
    if (!product) {
      navigate("/shop", { replace: true });
      return;
    }
  }, [product, navigate]);

  useEffect(() => {
    const loadUserData = async () => {
      if (!product) return;
      setIsFetching(true);
      try {
        const [profileRes, addressRes] = await Promise.all([
          axios.get("/api/profile"),
          axios.get("/api/addresses"),
        ]);

        const profile = profileRes.data;
        setContactInfo({
          name: profile.name || "",
          email: profile.email || "",
          phone: profile.phone || "",
        });

        const addressList = Array.isArray(addressRes.data)
          ? addressRes.data
          : [];

        setAddresses(addressList);

        const defaultAddress = addressList.find((item) => item.is_default);
        const initialAddress = defaultAddress || addressList[0] || null;
        if (initialAddress) {
          setSelectedAddressId(initialAddress.id);
          setShippingForm({
            address_line1:
              initialAddress.address_line1 ||
              initialAddress.address_line_1 ||
              "",
            address_line2:
              initialAddress.address_line2 ||
              initialAddress.address_line_2 ||
              "",
            city: initialAddress.city || "",
            state: initialAddress.state || "",
            pincode: initialAddress.pincode || "",
            country: initialAddress.country || "India",
          });
        }
      } catch (error) {
        console.error("Subscription checkout load error", error);
        toast.error("Unable to load shipping or profile details.");
      } finally {
        setIsFetching(false);
      }
    };

    loadUserData();
  }, [product]);

  const selectedAddress = useMemo(
    () =>
      addresses.find((item) => String(item.id) === String(selectedAddressId)),
    [addresses, selectedAddressId],
  );

  const handleAddressSelect = (address) => {
    setSelectedAddressId(address.id);
    setShippingForm({
      address_line1: address.address_line1 || address.address_line_1 || "",
      address_line2: address.address_line2 || address.address_line_2 || "",
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
      country: address.country || "India",
    });
  };

  const handleShippingFieldChange = (field, value) => {
    setShippingForm((prev) => ({ ...prev, [field]: value }));
    if (selectedAddressId) {
      setSelectedAddressId("");
    }
  };

  const reminderSelection = reminderSelections[product?.id];
  const reminderEnabled = Boolean(
    reminderSelection?.enabled && product?.daily_reminder_enabled,
  );
  const reminderPrice =
    reminderEnabled && product?.daily_reminder_price
      ? Number(product.daily_reminder_price)
      : 0;
  const totalDueToday = Number(subscriptionPrice || 0) + reminderPrice;
  const reminderPhoneValue =
    reminderEnabled && reminderSelection?.phoneSource === "custom"
      ? reminderSelection.customPhone || ""
      : contactInfo.phone || "";

  const canSubmit = useMemo(() => {
    const baseValid =
      contactInfo.name.trim() &&
      contactInfo.email.trim() &&
      contactInfo.phone.trim() &&
      shippingForm.address_line1.trim() &&
      shippingForm.city.trim() &&
      shippingForm.state.trim() &&
      shippingForm.pincode.trim();

    if (!baseValid) return false;

    if (!reminderEnabled) return true;
    if (!reminderSelection?.time) return false;
    if (!reminderPhoneValue || !isValidReminderPhone(reminderPhoneValue)) {
      return false;
    }

    return true;
  }, [
    contactInfo,
    shippingForm,
    reminderEnabled,
    reminderSelection,
    reminderPhoneValue,
  ]);

  const handleStartSubscription = async () => {
    if (!canSubmit || !product) {
      toast.error("Please complete all subscription details.");
      return;
    }

    if (reminderEnabled) {
      if (!reminderSelection?.time) {
        toast.error("Please select a reminder time.");
        return;
      }

      const selectedPhone =
        reminderSelection.phoneSource === "custom"
          ? reminderSelection.customPhone || ""
          : contactInfo.phone || "";

      if (!selectedPhone || !isValidReminderPhone(selectedPhone)) {
        toast.error("Please enter a valid WhatsApp number.");
        return;
      }
    }

    setIsLoading(true);

    const reminders = reminderEnabled
      ? [
          {
            product_id: product.id,
            enabled: true,
            time: reminderSelection.time,
            quantity: 1,
            price: reminderPrice,
            original_price: Number(
              product.daily_reminder_original_price || reminderPrice,
            ),
            reminder_phone_source:
              reminderSelection.phoneSource === "custom" ? "custom" : "profile",
            reminder_whatsapp_number:
              reminderSelection.phoneSource === "custom"
                ? reminderSelection.customPhone || contactInfo.phone
                : contactInfo.phone,
          },
        ]
      : [];

    const shippingAddress = [
      shippingForm.address_line1,
      shippingForm.address_line2,
      shippingForm.city,
      shippingForm.state,
      shippingForm.pincode,
      shippingForm.country,
    ]
      .filter(Boolean)
      .join(", ");

    try {
      const response = await createSubscription({
        productId: product.id,
        frequency,
        shippingAddress,
        addressId: selectedAddressId || null,
        contactInfo,
        reminders,
      });

      const checkoutResult = await openRazorpayCheckout({
        key_id: response.key_id,
        subscription_id: response.subscription_id,
        name: product.name,
        description: `Every ${frequency} days subscription`,
        prefill: {
          name: contactInfo.name,
          email: contactInfo.email,
          contact: contactInfo.phone,
        },
        theme: {
          color: "#7BA05B",
        },
      });

      if (checkoutResult) {
        // ── FIX: Call verifyPayment so the backend confirms the payment and
        // updates payment_status → 'paid', order_status → 'active', and
        // subscription_status → 'active'. Without this the DB rows stay in
        // their initial 'pending' / 'created' state indefinitely.
        let verifyResult = {};
        try {
          const verifyRes = await axios.post("/api/payment/verify", {
            razorpay_payment_id: checkoutResult.razorpay_payment_id,
            razorpay_subscription_id: checkoutResult.razorpay_subscription_id,
            razorpay_signature: checkoutResult.razorpay_signature,
          });
          verifyResult = verifyRes.data || {};
        } catch (verifyErr) {
          // Non-blocking: if verify fails the Razorpay webhook will sync the DB.
          // Still proceed to success page so the user is not left stranded.
          console.error(
            "[SubscriptionCheckout] verifyPayment call failed — webhook will sync later",
            verifyErr?.response?.data?.message ||
              verifyErr?.message ||
              verifyErr,
          );
        }

        navigate("/subscription-success", {
          state: {
            product,
            frequency,
            subscriptionId: response.subscription_id,
            subscriptionStatus:
              verifyResult.subscription_status ||
              response.subscription_status ||
              "active",
            nextBillingDate:
              verifyResult.next_billing_date || response.next_billing_date,
            subscriptionPrice,
            reminders,
          },
        });
      }
    } catch (error) {
      // FIX: handle backend's 409 duplicate-active-subscription response.
      // No Razorpay subscription, order, or payment record was created for
      // this request — backend rejects before doing any of that work.
      if (error?.response?.status === 409) {
        setHasActiveSubscription(true);
        toast.error(
          "You already have an active subscription for this product.",
        );
        return;
      }

      const message =
        error?.message ||
        error?.response?.data?.message ||
        "Subscription checkout failed. Please try again.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  const savings =
    Number(product.mrp || product.originalPrice || product.price) -
    Number(subscriptionPrice || product.price);
  const savingsPercentage = product.mrp
    ? Math.round((savings / Number(product.mrp)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-bree-bg pb-24">
      <Helmet>
        <title>Subscription Checkout — BREE Wellness</title>
        <meta
          name="description"
          content="Complete your subscription checkout for BREE wellness products."
        />
      </Helmet>

      {/* ── Premium Header ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-bree-border pt-24 pb-14">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-bree-accent/25 text-bree-primary text-xs font-semibold tracking-[0.25em] uppercase px-5 py-2 rounded-full mb-7">
            <Leaf className="w-3.5 h-3.5" />
            Wellness Club Membership
          </div>

          {/* Headline */}
          <h1 className="font-outfit text-4xl md:text-5xl lg:text-6xl font-light text-bree-text-primary leading-tight mb-4">
            Join The BREE
            <br />
            <span className="text-bree-primary font-normal">Wellness Club</span>
          </h1>

          {/* Subtitle */}
          <p className="text-bree-text-secondary text-lg max-w-lg mx-auto mb-10">
            Get fresh wellness delivered automatically every month. Pause or
            cancel anytime.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-5 md:gap-10">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-bree-accent/30 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-bree-primary" />
                </div>
                <span className="text-sm font-medium text-bree-text-secondary">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Page Body ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-10">
        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-8">
          {/* ── Left Column ───────────────────────────────────────── */}
          <div className="space-y-6">
            {/* ── Product Plan Card ─────────────────────────────── */}
            <section className="bg-white rounded-3xl border border-bree-border shadow-sm overflow-hidden">
              {/* Gradient header band */}
              <div
                className="px-8 pt-8 pb-7 border-b border-bree-border"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(180,203,164,0.18) 0%, rgba(249,248,246,0.8) 100%)",
                }}
              >
                <p className="text-xs tracking-[0.25em] uppercase font-semibold text-bree-primary mb-5">
                  Monthly Wellness Subscription
                </p>

                <div className="flex items-start gap-5">
                  {/* Product image */}
                  <div className="w-[72px] h-[72px] rounded-2xl bg-white shadow-sm border border-bree-border/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <img
                      src={
                        product.image && product.image.trim()
                          ? product.image
                          : "/images/default-product.png"
                      }
                      alt={product.name}
                      className="w-full h-full object-contain p-1.5"
                    />
                  </div>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="font-outfit text-2xl font-semibold text-bree-text-primary">
                        {product.name}
                      </h2>
                      {savingsPercentage > 0 && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-bree-primary text-white whitespace-nowrap">
                          SAVE {savingsPercentage}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-bree-text-secondary leading-relaxed">
                      {product.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Frequency + price row */}
              <div className="px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-bree-accent/30 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-bree-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-bree-text-secondary font-semibold uppercase tracking-wide">
                      Delivery Frequency
                    </p>
                    <p className="font-semibold text-bree-text-primary mt-0.5">
                      Every {frequency} days
                    </p>
                  </div>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-bree-text-secondary font-semibold uppercase tracking-wide mb-1">
                    Per Renewal
                  </p>
                  <p className="font-outfit text-3xl font-semibold text-bree-primary">
                    ₹{subscriptionPrice}
                  </p>
                </div>
              </div>
            </section>

            {/* ── Shipping Section ──────────────────────────────── */}
            <section className="bg-white rounded-3xl border border-bree-border shadow-sm p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 rounded-xl bg-bree-accent/30 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-bree-primary" />
                </div>
                <div>
                  <h3 className="font-outfit text-xl font-semibold text-bree-text-primary">
                    Shipping Details
                  </h3>
                  <p className="text-xs text-bree-text-secondary mt-0.5">
                    Where should we deliver your wellness shots?
                  </p>
                </div>
              </div>

              {isFetching ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-bree-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Saved addresses */}
                  {addresses.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bree-text-secondary mb-3">
                        Saved Addresses
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {addresses.map((address) => {
                          const isSelected =
                            String(selectedAddressId) === String(address.id);
                          return (
                            <button
                              key={address.id}
                              type="button"
                              onClick={() => handleAddressSelect(address)}
                              className={`text-left rounded-2xl p-4 border-2 transition-all duration-200 ${
                                isSelected
                                  ? "border-bree-primary bg-bree-primary/5 shadow-sm"
                                  : "border-bree-border bg-bree-bg hover:border-bree-accent"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-bree-text-primary text-sm">
                                    {address.label || "Home"}
                                  </p>
                                  <p className="text-xs text-bree-text-secondary mt-1.5 leading-relaxed">
                                    {formatAddress(address)}
                                  </p>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-4 h-4 text-bree-primary flex-shrink-0 mt-0.5" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manual entry */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bree-text-secondary mb-4">
                      {addresses.length > 0
                        ? "Or Enter a New Address"
                        : "Delivery Address"}
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        {
                          id: "address_line1",
                          label: "Street Address *",
                          placeholder: "House, Apartment, Building",
                        },
                        {
                          id: "address_line2",
                          label: "Landmark",
                          placeholder: "Street, area, landmark",
                        },
                        { id: "city", label: "City *", placeholder: "City" },
                        { id: "state", label: "State *", placeholder: "State" },
                        {
                          id: "pincode",
                          label: "PIN Code *",
                          placeholder: "PIN code",
                        },
                        {
                          id: "country",
                          label: "Country",
                          placeholder: "Country",
                        },
                      ].map(({ id, label, placeholder }) => (
                        <div key={id} className="space-y-1.5">
                          <Label
                            htmlFor={id}
                            className="text-xs font-semibold text-bree-text-secondary uppercase tracking-wide"
                          >
                            {label}
                          </Label>
                          <Input
                            id={id}
                            type="text"
                            value={shippingForm[id]}
                            onChange={(e) =>
                              handleShippingFieldChange(id, e.target.value)
                            }
                            placeholder={placeholder}
                            className="rounded-xl border-bree-border focus:border-bree-primary h-12 bg-bree-bg"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ── Contact Section ───────────────────────────────── */}
            <section className="bg-white rounded-3xl border border-bree-border shadow-sm p-8">
              <div className="flex items-center gap-3 mb-7">
                <div className="w-10 h-10 rounded-xl bg-bree-accent/30 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-bree-primary" />
                </div>
                <div>
                  <h3 className="font-outfit text-xl font-semibold text-bree-text-primary">
                    Contact Information
                  </h3>
                  <p className="text-xs text-bree-text-secondary mt-0.5">
                    For order updates and renewal reminders
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    id: "name",
                    label: "Full Name *",
                    type: "text",
                    placeholder: "Full name",
                    key: "name",
                  },
                  {
                    id: "phone",
                    label: "Mobile Number *",
                    type: "tel",
                    placeholder: "Mobile number",
                    key: "phone",
                  },
                  {
                    id: "email",
                    label: "Email Address *",
                    type: "email",
                    placeholder: "Email address",
                    key: "email",
                  },
                ].map(({ id, label, type, placeholder, key }) => (
                  <div key={id} className="space-y-1.5">
                    <Label
                      htmlFor={id}
                      className="text-xs font-semibold text-bree-text-secondary uppercase tracking-wide"
                    >
                      {label}
                    </Label>
                    <Input
                      id={id}
                      type={type}
                      value={contactInfo[key]}
                      onChange={(e) =>
                        setContactInfo((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder={placeholder}
                      className="rounded-xl border-bree-border focus:border-bree-primary h-12 bg-bree-bg"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ── Right Sidebar ────────────────────────────────────── */}
          <aside className="space-y-5">
            {/* Order Summary */}
            <div className="bg-white rounded-3xl border border-bree-border shadow-sm p-7 sticky top-6">
              <p className="text-xs tracking-[0.22em] uppercase font-semibold text-bree-primary mb-1">
                Ready to activate
              </p>
              <h2 className="font-outfit text-2xl font-semibold text-bree-text-primary mb-7">
                Your Subscription
              </h2>

              {/* Line items */}
              <div className="space-y-3 pb-5 border-b border-bree-border">
                <div className="flex justify-between text-sm">
                  <span className="text-bree-text-secondary">
                    Product Price
                  </span>
                  <span className="font-medium text-bree-text-primary">
                    ₹{subscriptionPrice}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-bree-text-secondary">Shipping</span>
                  <span className="font-semibold text-bree-primary">Free</span>
                </div>
                {savings > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-bree-text-secondary">You Save</span>
                    <span className="font-semibold text-bree-primary">
                      ₹{savings}
                    </span>
                  </div>
                )}
              </div>

              {reminderPrice > 0 && (
                <div className="flex justify-between text-sm py-2">
                  <span className="text-bree-text-secondary">
                    Daily WhatsApp Reminder
                  </span>
                  <span className="font-medium text-bree-text-primary">
                    ₹{reminderPrice.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between items-center pt-5 mb-7">
                <span className="font-semibold text-bree-text-primary">
                  Total Due Today
                </span>
                <span className="font-outfit text-3xl font-bold text-bree-primary">
                  ₹{totalDueToday.toLocaleString("en-IN")}
                </span>
              </div>

              {product?.daily_reminder_enabled && (
                <div className="mb-6 border border-bree-border rounded-2xl p-4 bg-bree-bg/40">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="subscription-reminder-toggle"
                      checked={Boolean(reminderSelection?.enabled)}
                      onChange={(e) => {
                        const hasSavedPhone = Boolean(contactInfo.phone);
                        setReminderSelections((prev) => ({
                          ...prev,
                          [product.id]: {
                            ...prev[product.id],
                            enabled: e.target.checked,
                            time: e.target.checked
                              ? prev[product.id]?.time || REMINDER_TIMES[0]
                              : null,
                            phoneSource: e.target.checked
                              ? prev[product.id]?.phoneSource ||
                                (hasSavedPhone ? "profile" : "custom")
                              : prev[product.id]?.phoneSource || "profile",
                            customPhone: prev[product.id]?.customPhone || "",
                          },
                        }));
                      }}
                      className="mt-1 h-5 w-5 rounded border-bree-border text-bree-primary accent-bree-primary"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="subscription-reminder-toggle"
                        className="block font-medium text-bree-text-primary cursor-pointer"
                      >
                        Add Daily WhatsApp Reminder
                      </label>
                      <p className="text-sm text-bree-text-secondary mt-1">
                        Get a gentle daily message at your chosen time.
                      </p>

                      {product?.daily_reminder_price && (
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="text-lg font-semibold text-bree-primary">
                            ₹
                            {Number(
                              product.daily_reminder_price,
                            ).toLocaleString("en-IN")}
                          </span>
                          {product?.daily_reminder_original_price &&
                            Number(product.daily_reminder_original_price) >
                              Number(product.daily_reminder_price) && (
                              <>
                                <span className="text-sm text-bree-text-secondary line-through">
                                  ₹
                                  {Number(
                                    product.daily_reminder_original_price,
                                  ).toLocaleString("en-IN")}
                                </span>
                                <span className="text-sm font-medium text-green-600">
                                  Save ₹
                                  {(
                                    Number(
                                      product.daily_reminder_original_price,
                                    ) - Number(product.daily_reminder_price)
                                  ).toLocaleString("en-IN")}
                                </span>
                              </>
                            )}
                        </div>
                      )}
                    </div>
                  </div>

                  {reminderSelection?.enabled && (
                    <div className="mt-4 space-y-4 pl-8">
                      <div>
                        <label className="block text-sm font-medium text-bree-text-primary mb-2">
                          Reminder Time
                        </label>
                        <select
                          value={reminderSelection?.time || ""}
                          onChange={(e) => {
                            setReminderSelections((prev) => ({
                              ...prev,
                              [product.id]: {
                                ...prev[product.id],
                                time: e.target.value,
                              },
                            }));
                          }}
                          className="w-full h-11 px-4 rounded-xl border border-bree-border outline-none focus:border-bree-primary bg-white text-bree-text-primary"
                        >
                          <option value="">Select a time</option>
                          {REMINDER_TIMES.map((time) => (
                            <option key={time} value={time}>
                              {getReminderTimeDisplay(time)} IST
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-bree-text-primary mb-2">
                          Daily WhatsApp Reminder Number
                        </label>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm text-bree-text-primary">
                            <input
                              type="radio"
                              name={`subscription-reminder-phone`}
                              checked={
                                (reminderSelection?.phoneSource ||
                                  "profile") === "profile"
                              }
                              onChange={() => {
                                setReminderSelections((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...prev[product.id],
                                    phoneSource: "profile",
                                  },
                                }));
                              }}
                            />
                            <span>
                              Use existing phone number
                              {contactInfo.phone
                                ? ` (${maskPhoneNumber(contactInfo.phone)})`
                                : ""}
                            </span>
                          </label>

                          <label className="flex items-center gap-2 text-sm text-bree-text-primary">
                            <input
                              type="radio"
                              name={`subscription-reminder-phone`}
                              checked={
                                (reminderSelection?.phoneSource ||
                                  "profile") === "custom"
                              }
                              onChange={() => {
                                setReminderSelections((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...prev[product.id],
                                    phoneSource: "custom",
                                  },
                                }));
                              }}
                            />
                            <span>Use a different WhatsApp number</span>
                          </label>
                        </div>

                        {(reminderSelection?.phoneSource || "profile") ===
                          "custom" && (
                          <div className="mt-2">
                            <Input
                              type="tel"
                              value={reminderSelection?.customPhone || ""}
                              onChange={(e) => {
                                setReminderSelections((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...prev[product.id],
                                    customPhone: e.target.value,
                                  },
                                }));
                              }}
                              placeholder="Enter WhatsApp number"
                              className="rounded-xl border-bree-border focus:border-bree-primary h-11 bg-white"
                            />
                            {!isValidReminderPhone(
                              reminderSelection?.customPhone || "",
                            ) &&
                              (reminderSelection?.customPhone || "").length >
                                0 && (
                                <p className="mt-1 text-xs text-red-600">
                                  Enter a valid 10-digit Indian mobile number or
                                  91-prefixed version.
                                </p>
                              )}
                          </div>
                        )}

                        <p className="mt-2 text-xs text-bree-text-secondary">
                          Daily WhatsApp reminders will be sent to{" "}
                          {maskPhoneNumber(
                            reminderPhoneValue ||
                              contactInfo.phone ||
                              "your selected contact",
                          )}
                          .
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CTA */}
              <Button
                type="button"
                onClick={handleStartSubscription}
                disabled={!canSubmit || isLoading || hasActiveSubscription}
                className="w-full py-6 rounded-full bg-bree-primary hover:bg-bree-primary-hover text-white font-semibold text-base shadow-sm transition-all duration-300 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </span>
                ) : hasActiveSubscription ? (
                  "Already Subscribed"
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" />
                    Activate Subscription
                  </span>
                )}
              </Button>

              {hasActiveSubscription ? (
                <p className="text-xs text-bree-text-secondary text-center mt-3">
                  You already have an active subscription for this product.{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/subscriptions")}
                    className="underline text-bree-primary font-medium"
                  >
                    Manage it here
                  </button>
                  .
                </p>
              ) : (
                <p className="text-xs text-bree-text-secondary text-center mt-3">
                  Cash on Delivery is not available for subscriptions.
                </p>
              )}
            </div>

            {/* What's Included */}
            <div className="bg-white rounded-3xl border border-bree-border shadow-sm p-6">
              <p className="font-outfit font-semibold text-bree-text-primary mb-4">
                What's Included
              </p>
              <ul className="space-y-3">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-bree-primary/15 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-bree-primary" />
                    </div>
                    <span className="text-bree-text-secondary">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Secure Auto Renewal */}
            <div className="bg-bree-bg rounded-3xl border border-bree-border p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-bree-accent/30 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-bree-primary" />
                </div>
                <p className="font-outfit font-semibold text-bree-text-primary">
                  Secure Auto Renewal
                </p>
              </div>
              <p className="text-sm text-bree-text-secondary leading-relaxed">
                Your subscription renews automatically every {frequency} days.
                You can pause, resume, or cancel anytime from your account
                dashboard.
              </p>
            </div>

            {/* Help */}
            <div className="rounded-3xl bg-white border border-bree-border p-6">
              <p className="font-outfit font-semibold text-bree-text-primary mb-2">
                Need Help?
              </p>
              <p className="text-sm text-bree-text-secondary leading-relaxed">
                Our support team is available to assist you with subscriptions,
                renewals, billing, and delivery questions.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionCheckout;
