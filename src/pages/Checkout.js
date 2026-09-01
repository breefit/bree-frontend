import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { ShoppingBag, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "@/lib/api";
import { toast } from "sonner";
import { loadRazorpayScript, openRazorpayCheckout } from "@/lib/razorpayLoader";
import { calculateOrderTotals } from "@/lib/orderTotals";
import CartUpdateModal from "@/components/CartUpdateModal";

// ── Dev-only logger ────────────────────────────────────────────────────────
// Keeps debugging visibility in development while staying silent in
// production builds.
const devLog = (...args) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

// ── Magic Checkout helpers ────────────────────────────────────────────────────

/**
 * Build the line_items array for Razorpay Magic Checkout order creation.
 * Per Razorpay's documented Orders API schema, mandatory fields per item are:
 *   sku, variant_id, price, offer_price, quantity, name, description
 * image_url is mandatory only if you want product images shown in checkout.
 * price / offer_price are per-unit, in paise.
 *
 * NOTE: BREE's cart item currently has no distinct `variant_id`. Falling back
 * to the product id. If BREE products have real variants (size/flavor/pack),
 * replace `item.variant_id` below with the actual variant identifier —
 * variant_id is MANDATORY per Razorpay's docs and this is a placeholder.
 */
const buildLineItems = (cartItems) =>
  cartItems.map((item) => {
    const unitPricePaise = Math.round(Number(item.price) * 100);
    return {
      sku: String(item.id),
      variant_id: String(item.variant_id || item.id),
      name: item.name,
      description: item.name,
      image_url: item.image || "",
      price: unitPricePaise,
      offer_price: unitPricePaise, // no per-item discount currently applied
      quantity: item.quantity,
    };
  });

/**
 * Sum of (offer_price × quantity) across all line_items, in paise.
 * This MUST be sent to the backend at order-creation time — Razorpay
 * requires it on the actual Razorpay Order object (server-side) to treat
 * the order as a Magic Checkout order. It is not a client-side checkout
 * option.
 */
const buildLineItemsTotal = (lineItems) =>
  lineItems.reduce((sum, item) => sum + item.offer_price * item.quantity, 0);

/**
 * Build the cart-facing `items` array sent alongside line_items for the
 * order-creation request (kept separate from line_items, which is the
 * Razorpay-specific shape).
 */
const buildOrderItems = (cartItems) =>
  cartItems.map((item) => ({
    product_id: item.id,
    quantity: item.quantity,
    name: item.name,
    price: item.price,
  }));

/**
 * Confirms the Razorpay order-creation response has everything required to
 * safely open the checkout popup.
 */
const isValidRazorpayOrder = (data) =>
  Boolean(data?.key_id && data?.order_id && data?.amount);

/**
 * Confirms the Razorpay success handler response has the three fields
 * required to call the backend verification endpoint.
 */
const isValidRazorpayResponse = (response) =>
  Boolean(
    response?.razorpay_order_id &&
    response?.razorpay_payment_id &&
    response?.razorpay_signature,
  );

/**
 * Returns a safe, user-facing error message. Never surfaces raw server /
 * network error text to the UI.
 */
const getFriendlyErrorMessage = (err, fallback) => {
  if (!err) return fallback;
  if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
    return "Network issue. Please check your connection and try again.";
  }
  return fallback;
};

const getShippingDisplay = (item) => {
  const isFree =
    item?.is_free_shipping === true ||
    item?.is_free_shipping === 1 ||
    item?.isFreeShipping === true ||
    item?.isFreeShipping === 1;

  if (isFree) {
    return "✓ Free Shipping";
  }

  const hasCharge =
    item?.shipping_charge != null || item?.shippingCharge != null;

  if (!hasCharge) {
    return "Shipping information unavailable";
  }

  const charge = Number(item?.shipping_charge ?? item?.shippingCharge ?? 0);

  return Number.isFinite(charge) && charge >= 0
    ? `Shipping ₹${charge.toLocaleString("en-IN")}`
    : "Shipping information unavailable";
};

// ── Loading phase labels shown to the user ────────────────────────────────────
const LOADING_PHASE = {
  idle: null,
  syncing: "Checking your cart…",
  creating: "Preparing your order…",
  opening: "Opening payment…",
  verifying: "Verifying payment…",
};

// ── Reminder configuration ─────────────────────────────────────────────────────
const REMINDER_TIMES = ["04:00", "04:30", "05:00", "05:30", "06:00"];

const isValidReminderPhone = (value) => {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return false;
  if (digits.length === 10) return /^[6-9]/.test(digits);
  if (digits.length === 12) return /^91[6-9]/.test(digits);
  return false;
};

const getReminderPhoneDisplay = (phone) => {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10)
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
};

const getReminderTimeDisplay = (time) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${String(displayHour).padStart(2, "0")}:${minutes} ${ampm}`;
};

// ── Component ─────────────────────────────────────────────────────────────────

const Checkout = () => {
  const navigate = useNavigate();
  const { cartItems, cartTotal, cartShipping, syncCart } = useCart();
  const orderSubtotal = Number(cartTotal ?? 0);
  const orderShipping = Number(cartShipping ?? 0);

  // ── State ─────────────────────────────────────────────────────────────────
  const [isInitialising, setIsInitialising] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState("idle"); // idle | syncing | creating | opening | verifying
  const [profile, setProfile] = useState(null); // { name, email, phone }
  const [showCartModal, setShowCartModal] = useState(false);
  const [cartModalItems, setCartModalItems] = useState([]);
  const [acceptedChanges, setAcceptedChanges] = useState(false);
  // Track reminder selections per product ID: {
  //   enabled: bool,
  //   time: "HH:MM",
  //   phoneSource: "profile" | "custom",
  //   customPhone: string
  // }
  const [reminderSelections, setReminderSelections] = useState({});
  const hasInitialisedRef = useRef(false);

  const getReminderSelectedPhone = (itemId) => {
    const reminder = reminderSelections[itemId];
    if (!reminder?.enabled) return "";
    if (reminder.phoneSource === "custom") {
      return reminder.customPhone || "";
    }
    return profile?.phone || "";
  };

  const isLoading = loadingPhase !== "idle";

  const orderDiscount = 0;

  // Calculate total reminder charges (multiply by quantity for each selected item)
  const orderReminderCharges = cartItems.reduce((sum, item) => {
    const reminder = reminderSelections[item.id];
    if (
      reminder?.enabled &&
      item.daily_reminder_enabled &&
      item.daily_reminder_price
    ) {
      const quantity = Number(item.quantity ?? 1);
      return sum + Number(item.daily_reminder_price) * quantity;
    }
    return sum;
  }, 0);

  const orderTotals = calculateOrderTotals({
    productSubtotal: orderSubtotal,
    deliveryCharge: orderShipping,
    dailyReminderPrice: orderReminderCharges,
    actualDiscount: orderDiscount,
  });
  const orderTotal = orderTotals.finalTotal;

  devLog("[Checkout] productSubtotal", orderSubtotal);
  devLog("[Checkout] cartShipping", orderShipping);
  devLog("[Checkout] reminderCharges", orderReminderCharges);
  devLog("[Checkout] discount", orderDiscount);
  devLog("[Checkout] finalTotal", orderTotal);

  // ── On mount: sync cart, fetch profile for Razorpay prefill ───────────────
  const initialise = useCallback(async () => {
    setIsInitialising(true);
    try {
      // 1. Sync cart prices and active product status with backend
      if (typeof syncCart === "function") {
        const syncRes = await syncCart();
        if (syncRes?.anyChange) {
          const flagged = (syncRes.items || []).filter(
            (i) => i.priceChanged || !i.available,
          );
          if (flagged.length) {
            setCartModalItems(flagged);
            setShowCartModal(true);
          } else {
            toast.info("Your cart has been updated with the latest prices.");
          }
        }
      }

      // 2. Fetch profile for Razorpay prefill (name/email/phone).
      //    Magic Checkout collects the delivery address itself, so no
      //    address lookup is needed here.
      try {
        const profileRes = await axios.get("/api/profile");
        const p = profileRes.data;
        setProfile({
          name: p.name || "",
          email: p.email || "",
          phone: p.phone || "",
        });
      } catch (profileErr) {
        // Non-fatal — Razorpay prefill just falls back to empty fields.
        devLog("[Checkout] Profile fetch failed:", profileErr);
        toast.error(
          getFriendlyErrorMessage(
            profileErr,
            "Couldn't load your saved details. You can still enter them during payment.",
          ),
        );
      }
    } catch (err) {
      // Non-fatal — payment flow has its own error handling
      devLog("[Checkout] Initialisation error:", err);
    } finally {
      setIsInitialising(false);
    }
  }, [syncCart]);

  useEffect(() => {
    if (!cartItems.length) {
      if (loadingPhase === "idle") {
        navigate("/shop");
      }
      return;
    }

    if (hasInitialisedRef.current) {
      return;
    }

    hasInitialisedRef.current = true;
    initialise();
  }, [cartItems.length, loadingPhase, navigate, initialise]);

  // ── Main payment handler ──────────────────────────────────────────────────
  const handleProceedToPayment = async () => {
    if (!cartItems.length) {
      toast.error("Your cart is empty.");
      return;
    }

    // Validate reminder selections: if reminder is enabled, time and recipient number must be valid
    for (const item of cartItems) {
      if (item.daily_reminder_enabled) {
        const reminder = reminderSelections[item.id];
        if (reminder?.enabled && !reminder?.time) {
          toast.error(
            `Please select a reminder time for "${item.name}" to continue.`,
          );
          return;
        }

        if (reminder?.enabled) {
          const phoneSource =
            reminder.phoneSource === "custom" ? "custom" : "profile";
          const selectedPhone =
            phoneSource === "custom"
              ? reminder.customPhone || ""
              : profile?.phone || "";

          if (!selectedPhone || !isValidReminderPhone(selectedPhone)) {
            toast.error(
              `Please provide a valid WhatsApp number for "${item.name}" to continue.`,
            );
            return;
          }
        }
      }
    }

    // Guard against duplicate clicks while any phase of the flow is active.
    if (isLoading) return;

    try {
      // ── Re-sync cart before payment ──────────────────────────────────────
      setLoadingPhase("syncing");
      const syncResult = await syncCart();
      if (syncResult?.anyChange && !acceptedChanges) {
        const flagged = (syncResult.items || []).filter(
          (i) => i.priceChanged || !i.available,
        );
        setCartModalItems(flagged);
        setShowCartModal(true);
        return; // wait for user to accept or review
      }
      if (acceptedChanges) setAcceptedChanges(false);

      // ── STEP 1: Build + validate line items, then create Razorpay order ──
      // line_items / line_items_total MUST be sent to the backend so it can
      // include them in the actual Razorpay Orders API call — this is what
      // makes Razorpay treat the order as a Magic Checkout order instead of
      // silently falling back to Standard Checkout.
      setLoadingPhase("creating");

      const lineItems = buildLineItems(cartItems);
      const lineItemsTotal = buildLineItemsTotal(lineItems);
      const finalPayableAmount = orderTotals.finalTotal;

      devLog("[Checkout] Computed line_items:", lineItems);
      devLog("[Checkout] Computed line_items_total (paise):", lineItemsTotal);
      devLog("[Checkout] Final payable amount (rupees):", finalPayableAmount);

      if (!lineItems.length) {
        toast.error("Your cart is empty.");
        setLoadingPhase("idle");
        return;
      }
      if (!(lineItemsTotal > 0)) {
        toast.error(
          "Unable to calculate order total. Please refresh and try again.",
        );
        setLoadingPhase("idle");
        return;
      }

      // Build reminders array from selections (include quantity in reminder price)
      const reminders = cartItems
        .map((item) => {
          const reminder = reminderSelections[item.id];
          if (reminder?.enabled && item.daily_reminder_enabled) {
            const quantity = Number(item.quantity ?? 1);
            return {
              product_id: item.id,
              enabled: true,
              time: reminder.time,
              quantity: quantity, // send quantity to backend for validation
              price: Number(item.daily_reminder_price) * quantity, // total reminder charge for this product
              original_price: item.daily_reminder_original_price,
              reminder_whatsapp_number:
                reminder.phoneSource === "custom"
                  ? reminder.customPhone || ""
                  : profile?.phone || "",
              reminder_phone_source:
                reminder.phoneSource === "custom" ? "custom" : "profile",
            };
          }
          return null;
        })
        .filter(Boolean);

      // The backend also requires customerName, email, and mobileNumber at
      // order-creation time (for the DB record). shippingAddress is
      // intentionally left undefined — Razorpay Magic Checkout collects and
      // confirms the final delivery details (name, phone, email, address)
      // inside the payment popup itself.
      const createOrderPayload = {
        amount: finalPayableAmount,
        currency: "INR",
        items: buildOrderItems(cartItems),
        line_items: lineItems,
        line_items_total: Math.round(
          (lineItemsTotal + orderReminderCharges) * 100,
        ),
        customerName: profile?.name || "Guest",
        email: profile?.email || "",
        mobileNumber: profile?.phone || "",
        // Magic Checkout collects the delivery address during payment.
        shippingAddress: undefined,
        // Include reminder data
        reminders,
        discountAmount: orderDiscount,
      };

      devLog(
        "[Checkout] Creating order — request payload:",
        createOrderPayload,
      );

      let razorpayOrder;
      try {
        const paymentResponse = await axios.post(
          "/api/payment/create-order",
          createOrderPayload,
        );
        razorpayOrder = paymentResponse.data;
      } catch (createErr) {
        devLog("[Checkout] Create-order failed:", createErr);
        toast.error(
          getFriendlyErrorMessage(
            createErr,
            "We couldn't start your order. Please try again.",
          ),
        );
        setLoadingPhase("idle");
        return;
      }

      devLog("[Checkout] Creating order — response:", razorpayOrder);

      // Hard-fail fast with a friendly message rather than letting the SDK
      // open with missing key/order_id/amount (which produces cryptic
      // Razorpay SDK errors like "Authentication key was missing").
      if (!isValidRazorpayOrder(razorpayOrder)) {
        devLog("[Checkout] Invalid order response:", razorpayOrder);
        toast.error(
          "Something went wrong while preparing your payment. Please try again.",
        );
        setLoadingPhase("idle");
        return;
      }

      // ── STEP 2: Load Razorpay SDK ─────────────────────────────────────────
      setLoadingPhase("opening");
      try {
        await loadRazorpayScript();
      } catch (loadErr) {
        devLog("[Checkout] Script load failed:", loadErr);
        toast.error(
          "Failed to load the payment gateway. Please check your connection and try again.",
        );
        setLoadingPhase("idle");
        return;
      }

      // ── STEP 3: Build Magic Checkout options ──────────────────────────────
      const checkoutOptions = {
        // Razorpay core fields
        key: razorpayOrder.key_id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency || "INR",
        name: "BREE Wellness",
        description: "Order Payment",
        order_id: razorpayOrder.order_id,

        // Magic Checkout — these MUST be top-level, not nested.
        one_click_checkout: true,
        show_coupons: true,

        // User prefill
        prefill: {
          name: profile?.name || "",
          email: profile?.email || "",
          contact: profile?.phone || "",
        },

        // Payment methods
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          paylater: false,
          cod: false,
        },

        theme: {
          color: "#84A95A",
        },

        retry: {
          enabled: true,
        },

        timeout: 900,

        modal: {
          ondismiss: () => {
            setLoadingPhase("idle");
            toast.info("Payment cancelled.");
          },
        },

        // Success callback — Razorpay's documented option key is `handler`,
        // not `onSuccess`. NOTE: this callback's `response` object only
        // contains razorpay_payment_id / razorpay_order_id / razorpay_signature
        // per Razorpay's docs — name/email/contact/address are NOT part of it.
        // Left as-is per instruction to keep verification flow intact; the
        // backend should independently fetch authoritative customer_details
        // via Razorpay's Fetch Order API after verification.
        handler: async (response) => {
          devLog("[Checkout] Payment success:", response);

          // Validate the payload Razorpay handed back before trusting it
          // with a verification call.
          if (!isValidRazorpayResponse(response)) {
            devLog("[Checkout] Incomplete Razorpay response:", response);
            toast.error(
              "We couldn't confirm your payment details. If money was deducted, please contact support.",
            );
            setLoadingPhase("idle");
            return;
          }

          setLoadingPhase("verifying");

          try {
            // Build reminders array for payment verification (include quantity in reminder price)
            const remindersForVerification = cartItems
              .map((item) => {
                const reminder = reminderSelections[item.id];
                if (reminder?.enabled && item.daily_reminder_enabled) {
                  const quantity = Number(item.quantity ?? 1);
                  return {
                    product_id: item.id,
                    enabled: true,
                    time: reminder.time,
                    quantity: quantity, // send quantity to backend for validation
                    price: Number(item.daily_reminder_price) * quantity, // total reminder charge for this product
                    original_price: item.daily_reminder_original_price,
                    reminder_whatsapp_number:
                      reminder.phoneSource === "custom"
                        ? reminder.customPhone || ""
                        : profile?.phone || "",
                    reminder_phone_source:
                      reminder.phoneSource === "custom" ? "custom" : "profile",
                  };
                }
                return null;
              })
              .filter(Boolean);

            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,

              razorpay_payment_id: response.razorpay_payment_id,

              razorpay_signature: response.razorpay_signature,

              customerName: response.name || "",

              email: response.email || "",

              mobileNumber: response.contact || "",

              shippingAddress: response.address || null,

              reminders: remindersForVerification,
            };

            const verifyResponse = await axios.post(
              "/api/payment/verify",
              verifyPayload,
            );

            devLog("[Checkout] Verify response:", verifyResponse.data);

            if (!verifyResponse?.data?.success) {
              throw new Error(
                verifyResponse.data.message || "Payment verification failed",
              );
            }

            const savedOrderId = verifyResponse.data.order_id;

            devLog("[Checkout] Saved Order ID:", savedOrderId);
            devLog("[Checkout] Navigating to success page...");

            navigate(`/checkout/success?orderId=${savedOrderId}`, {
              replace: true,
            });

            // Do NOT clear cart here
          } catch (verifyErr) {
            devLog("[Checkout] Verify failed:", verifyErr);

            toast.error(
              getFriendlyErrorMessage(
                verifyErr,
                "We couldn't verify your payment. If money was deducted, please contact support.",
              ),
            );

            setLoadingPhase("idle");
          }
        },
      };

      devLog("[Checkout] Opening Razorpay Magic Checkout", {
        orderId: checkoutOptions.order_id,
        amount: checkoutOptions.amount,
        currency: checkoutOptions.currency,
      });

      // ── STEP 4: Open Razorpay Magic Checkout ───────────────────────────────
      try {
        await openRazorpayCheckout(checkoutOptions);
        devLog("[Checkout] Razorpay popup closed successfully");
      } catch (error) {
        devLog("[Checkout] Razorpay checkout failed:", error);

        if (error?.message === "Payment cancelled") {
          toast.info("Payment cancelled. You can retry anytime.");
        } else {
          toast.error("Unable to process payment. Please try again.");
        }

        throw error; // let outer catch handle cleanup
      }
    } catch (err) {
      // openRazorpayCheckout rejects on payment.failed or modal dismiss
      if (err?.message === "Payment cancelled") {
        toast.info("Payment cancelled. You can retry anytime.");
      } else {
        toast.error(
          getFriendlyErrorMessage(
            err,
            "Failed to process payment. Please try again.",
          ),
        );
      }

      devLog("[Checkout] Payment flow error:", err);
    } finally {
      // Reset to idle unless verification is running
      setLoadingPhase((prev) => (prev !== "verifying" ? "idle" : prev));
    }
  };

  // ── Cart modal handlers ───────────────────────────────────────────────────
  const handleAcceptChanges = async () => {
    setShowCartModal(false);
    setAcceptedChanges(true);
    await handleProceedToPayment();
  };

  const handleReviewChanges = () => {
    setShowCartModal(false);
    toast.info("Please review your updated cart.");
  };

  // ── Full-screen initialising spinner ─────────────────────────────────────
  if (isInitialising) {
    return (
      <div className="min-h-screen bg-bree-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-bree-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-bree-text-secondary">Loading your cart…</p>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen mt-10 bg-bree-bg py-8 px-4">
      <div className="max-w-2xl mt-10 mx-auto">
        {/* Page heading */}
        <div className="flex items-center gap-3 mb-8">
          <ShoppingBag className="w-6 h-6 text-bree-primary" />
          <h1 className="text-2xl font-bold text-bree-text-primary">
            Review Your Order
          </h1>
        </div>

        {/* Cart items card */}
        <div className="bg-white rounded-3xl shadow-sm border border-bree-border p-6 mb-6">
          <h2 className="text-base font-semibold text-bree-text-primary mb-5">
            Items in your cart
          </h2>

          <div className="space-y-4">
            {cartItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 pb-4 border-b border-bree-border last:border-0 last:pb-0"
              >
                {/* Product image */}
                <div className="w-16 h-16 rounded-xl bg-bree-bg border border-bree-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-contain p-1.5"
                  />
                </div>

                {/* Name + qty + change badges */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-bree-text-primary truncate">
                    {item.name}
                  </p>
                  <p className="text-sm text-bree-text-secondary mt-0.5">
                    Qty: {item.quantity}
                  </p>
                  {item._priceChanged && (
                    <span className="mt-1 inline-block text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                      Price updated
                    </span>
                  )}
                  {item._unavailable && (
                    <span className="mt-1 inline-block text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Availability changed
                    </span>
                  )}
                </div>

                {/* Line total */}
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-bree-text-primary">
                    ₹
                    {(Number(item.price) * item.quantity).toLocaleString(
                      "en-IN",
                    )}
                  </p>
                  <p className="text-xs text-bree-text-secondary mt-0.5">
                    ₹{Number(item.price).toLocaleString("en-IN")} each
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Daily WhatsApp Reminder Add-ons */}
          <div className="mt-6 pt-4 border-t border-bree-border space-y-4">
            <h3 className="font-semibold text-bree-text-primary">
              Add-ons (Optional)
            </h3>

            {cartItems.map((item) =>
              item.daily_reminder_enabled ? (
                <div
                  key={`reminder-${item.id}`}
                  className="border border-bree-border rounded-2xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={`reminder-${item.id}`}
                      checked={reminderSelections[item.id]?.enabled || false}
                      onChange={(e) => {
                        const hasSavedPhone = Boolean(profile?.phone);
                        setReminderSelections((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...prev[item.id],
                            enabled: e.target.checked,
                            time: e.target.checked
                              ? prev[item.id]?.time || REMINDER_TIMES[0]
                              : null,
                            phoneSource: e.target.checked
                              ? prev[item.id]?.phoneSource ||
                                (hasSavedPhone ? "profile" : "custom")
                              : prev[item.id]?.phoneSource || "profile",
                            customPhone: prev[item.id]?.customPhone || "",
                          },
                        }));
                      }}
                      className="mt-0.5 h-5 w-5 rounded border-bree-border text-bree-primary accent-bree-primary"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`reminder-${item.id}`}
                        className="block font-medium text-bree-text-primary cursor-pointer"
                      >
                        Add Daily WhatsApp Reminder for {item.name}
                      </label>
                      <p className="text-sm text-bree-text-secondary mt-0.5">
                        Get a WhatsApp reminder every day at your chosen time
                      </p>

                      {/* Price display */}
                      <div className="mt-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-semibold text-bree-primary">
                            ₹
                            {Number(item.daily_reminder_price).toLocaleString(
                              "en-IN",
                            )}
                          </span>
                          {item.daily_reminder_original_price &&
                            Number(item.daily_reminder_original_price) >
                              Number(item.daily_reminder_price) && (
                              <>
                                <span className="text-sm text-bree-text-secondary line-through">
                                  ₹
                                  {Number(
                                    item.daily_reminder_original_price,
                                  ).toLocaleString("en-IN")}
                                </span>
                                <span className="text-sm font-medium text-green-600">
                                  Save ₹
                                  {(
                                    Number(item.daily_reminder_original_price) -
                                    Number(item.daily_reminder_price)
                                  ).toLocaleString("en-IN")}
                                </span>
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Time selector — only show if reminder is checked */}
                  {reminderSelections[item.id]?.enabled && (
                    <div className="mt-4 ml-8 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-bree-text-primary mb-2">
                          Reminder Time
                        </label>
                        <select
                          value={reminderSelections[item.id]?.time || ""}
                          onChange={(e) => {
                            setReminderSelections((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...prev[item.id],
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
                              name={`reminder-phone-${item.id}`}
                              checked={
                                (reminderSelections[item.id]?.phoneSource ||
                                  "profile") === "profile"
                              }
                              onChange={() => {
                                setReminderSelections((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    phoneSource: "profile",
                                  },
                                }));
                              }}
                            />
                            <span>
                              Use existing phone number
                              {profile?.phone
                                ? ` (${getReminderPhoneDisplay(profile.phone)})`
                                : ""}
                            </span>
                          </label>

                          <label className="flex items-center gap-2 text-sm text-bree-text-primary">
                            <input
                              type="radio"
                              name={`reminder-phone-${item.id}`}
                              checked={
                                (reminderSelections[item.id]?.phoneSource ||
                                  "profile") === "custom"
                              }
                              onChange={() => {
                                setReminderSelections((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    phoneSource: "custom",
                                  },
                                }));
                              }}
                            />
                            <span>Use a different WhatsApp number</span>
                          </label>
                        </div>

                        {(reminderSelections[item.id]?.phoneSource ||
                          "profile") === "custom" && (
                          <div className="mt-2">
                            <input
                              type="tel"
                              value={
                                reminderSelections[item.id]?.customPhone || ""
                              }
                              onChange={(e) => {
                                setReminderSelections((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    customPhone: e.target.value,
                                  },
                                }));
                              }}
                              placeholder="Enter WhatsApp number"
                              className="w-full h-11 px-4 rounded-xl border border-bree-border outline-none focus:border-bree-primary bg-white text-bree-text-primary"
                            />
                            {!isValidReminderPhone(
                              reminderSelections[item.id]?.customPhone || "",
                            ) &&
                              (reminderSelections[item.id]?.customPhone || "")
                                .length > 0 && (
                                <p className="mt-1 text-xs text-red-600">
                                  Enter a valid 10-digit Indian mobile number or
                                  91-prefixed version.
                                </p>
                              )}
                          </div>
                        )}

                        <p className="mt-2 text-xs text-bree-text-secondary">
                          Daily WhatsApp reminders will be sent to{" "}
                          {getReminderSelectedPhone(item.id)
                            ? getReminderPhoneDisplay(
                                getReminderSelectedPhone(item.id),
                              )
                            : "your selected contact"}
                          .
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null,
            )}
          </div>

          <div className="mt-8 pt-6 border-t-2 border-bree-border space-y-3">
            {/* Order Summary Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-bree-text-primary">
                Order Summary
              </h3>
            </div>

            {/* Product Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-bree-text-secondary">
                Subtotal (Products)
              </span>
              <span className="font-medium text-bree-text-primary">
                ₹{orderSubtotal.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Shipping */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-bree-text-secondary">
                  Delivery charge
                </span>
                <span className="font-medium text-bree-text-primary">
                  ₹{orderShipping.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Reminders Add-ons */}
            {orderReminderCharges > 0 && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-bree-text-secondary">
                    Daily WhatsApp Reminder
                  </span>
                  <span className="font-medium text-bree-text-primary">
                    ₹{orderReminderCharges.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}

            {/* Real coupons or product discounts only */}
            {orderTotals.actualDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-bree-text-secondary">
                  Discount on price
                </span>
                <span className="font-medium text-green-600">
                  -₹{orderTotals.actualDiscount.toLocaleString("en-IN")}
                </span>
              </div>
            )}

            {/* Grand Total */}
            <div className="flex justify-between items-center text-base font-bold pt-4 border-t-2 border-bree-border">
              <span className="text-bree-text-primary">Grand Total</span>
              <span className="text-lg text-bree-primary">
                ₹{orderTotal.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
          <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Your name, phone, email, and delivery address will be collected
            securely inside the Razorpay payment window.
          </p>
        </div>

        {/* Proceed to Payment CTA */}
        <Button
          onClick={handleProceedToPayment}
          disabled={isLoading || !cartItems.length}
          className="w-full rounded-full bg-bree-primary hover:bg-bree-primary-hover text-white py-4 text-base font-semibold transition-all duration-300 disabled:opacity-60"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              {LOADING_PHASE[loadingPhase]}
            </span>
          ) : (
            "Proceed to Payment"
          )}
        </Button>

        <p className="text-xs text-bree-text-secondary text-center mt-4">
          Payments are processed securely via Razorpay. Cash on Delivery is not
          available.
        </p>
      </div>

      {/* Cart update modal — shown when syncCart detects changed cart data */}
      <CartUpdateModal
        visible={showCartModal}
        items={cartModalItems}
        onAccept={handleAcceptChanges}
        onReview={handleReviewChanges}
        onClose={() => setShowCartModal(false)}
      />
    </div>
  );
};

export default Checkout;
