import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { ShoppingBag, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "@/lib/api";
import { toast } from "sonner";
import { loadRazorpayScript, openRazorpayCheckout } from "@/lib/razorpayLoader";
import CartUpdateModal from "@/components/CartUpdateModal";

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
  creating: "Preparing your order…",
  opening: "Opening payment…",
  verifying: "Verifying payment…",
};

// ── Component ─────────────────────────────────────────────────────────────────

const Checkout = () => {
  const navigate = useNavigate();
  const { cartItems, cartTotal, cartShipping, syncCart } = useCart();
  const orderSubtotal = Number(cartTotal ?? 0);
  const orderShipping = Number(cartShipping ?? 0);
  const orderTotal = orderSubtotal + orderShipping;

  // console.log("[Checkout] cartTotal", orderSubtotal);
  // console.log("[Checkout] cartShipping", orderShipping);
  // console.log("[Checkout] finalTotal", orderTotal);

  // ── State ─────────────────────────────────────────────────────────────────
  const [isInitialising, setIsInitialising] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState("idle"); // idle | creating | opening | verifying
  const [profile, setProfile] = useState(null); // { name, email, phone }
  const [showCartModal, setShowCartModal] = useState(false);
  const [cartModalItems, setCartModalItems] = useState([]);
  const [acceptedChanges, setAcceptedChanges] = useState(false);
  const hasInitialisedRef = useRef(false);

  const isLoading = loadingPhase !== "idle";

  // ── On mount: sync cart, fetch profile + addresses silently ───────────────
  const initialise = useCallback(async () => {
    setIsInitialising(true);
    try {
      // 1. Sync cart prices/stock with backend
      if (typeof syncCart === "function") {
        const syncRes = await syncCart();
        if (syncRes?.anyChange) {
          const flagged = (syncRes.items || []).filter(
            (i) =>
              i.priceChanged ||
              i.outOfStock ||
              i.insufficientStock ||
              !i.available,
          );
          if (flagged.length) {
            setCartModalItems(flagged);
            setShowCartModal(true);
          } else {
            toast.info("Your cart has been updated with the latest prices.");
          }
        }
      }

      // 2. Fetch profile and addresses in parallel (silent — used only for
      //    create-order payload and Razorpay prefill, not shown in the UI)
      const [profileRes, addressRes] = await Promise.allSettled([
        axios.get("/api/profile"),
        axios.get("/api/addresses"),
      ]);

      if (profileRes.status === "fulfilled") {
        const p = profileRes.value.data;
        setProfile({
          name: p.name || "",
          email: p.email || "",
          phone: p.phone || "",
        });
      }

      if (addressRes.status === "fulfilled") {
        const list = Array.isArray(addressRes.value.data)
          ? addressRes.value.data
          : [];
        const addr = list.find((a) => a.is_default) || list[0] || null;
      }
    } catch (err) {
      // Non-fatal — payment flow has its own error handling
      console.error("[Checkout] Initialisation error:", err);
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
    if (isLoading) return;

    try {
      // ── Re-sync cart before payment ──────────────────────────────────────
      const syncResult = await syncCart();
      if (syncResult?.anyChange && !acceptedChanges) {
        const flagged = (syncResult.items || []).filter(
          (i) =>
            i.priceChanged ||
            i.outOfStock ||
            i.insufficientStock ||
            !i.available,
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

      // console.log("[Checkout] Computed line_items:", lineItems);
      // console.log(
      //   "[Checkout] Computed line_items_total (paise):",
      //   lineItemsTotal,
      // );

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

      // The backend also requires customerName, email, mobileNumber, and
      // shippingAddress at order-creation time (for the DB record).
      // Razorpay Magic Checkout collects and confirms the final details
      // (name, phone, email, shipping address) during the payment popup.
      const createOrderPayload = {
        amount: orderTotal,
        currency: "INR",
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          name: item.name,
          price: item.price,
        })),
        line_items: lineItems,
        line_items_total: lineItemsTotal,
        customerName: profile?.name || "Guest",
        email: profile?.email || "",
        mobileNumber: profile?.phone || "",
        // Use the user's saved default address as the pre-auth shipping address.
        // If no address is saved, Magic Checkout will collect one from the customer.
        shippingAddress: undefined,
      };

      // console.log(
      //   "[Checkout] Creating order — request payload:",
      //   createOrderPayload,
      // );
      const paymentResponse = await axios.post(
        "/api/payment/create-order",
        createOrderPayload,
      );
      const razorpayOrder = paymentResponse.data;
      // console.log("[Checkout] Creating order — response:", razorpayOrder);

      // ── STEP 2: Load Razorpay SDK ─────────────────────────────────────────
      setLoadingPhase("opening");
      try {
        await loadRazorpayScript();
      } catch (loadErr) {
        // console.error("[Checkout] Script load failed:", loadErr);
        toast.error("Failed to load payment gateway. Please try again.");
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
          // console.log("[Checkout] Payment success:", response);

          setLoadingPhase("verifying");

          try {
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,

              razorpay_payment_id: response.razorpay_payment_id,

              razorpay_signature: response.razorpay_signature,

              customerName: response.name || "",

              email: response.email || "",

              mobileNumber: response.contact || "",

              shippingAddress: response.address || null,
            };

            const verifyResponse = await axios.post(
              "/api/payment/verify",
              verifyPayload,
            );

            // console.log("[Checkout] Verify response:", verifyResponse.data);

            if (!verifyResponse.data.success) {
              throw new Error(
                verifyResponse.data.message || "Payment verification failed",
              );
            }

            const savedOrderId = verifyResponse.data.order_id;

            // console.log("[Checkout] Saved Order ID:", savedOrderId);
            // console.log("[Checkout] Navigating to success page...");

            navigate(`/checkout/success?orderId=${savedOrderId}`, {
              replace: true,
            });

            // Do NOT clear cart here
          } catch (verifyErr) {
            console.error("[Checkout] Verify failed:", verifyErr);

            toast.error(
              verifyErr?.response?.data?.message ||
                verifyErr.message ||
                "Payment verification failed",
            );

            setLoadingPhase("idle");
          }
        },
      };

      // ── STEP 4: Validate + open Razorpay Magic Checkout ───────────────────
      // console.log("=================================");
      // console.log("MAGIC CHECKOUT FULL OPTIONS");
      // console.log(JSON.stringify(checkoutOptions, null, 2));
      // console.log("=================================");
      // console.log("[Checkout] Razorpay options before opening:", {
      //   key: checkoutOptions.key,
      //   order_id: checkoutOptions.order_id,
      //   amount: checkoutOptions.amount,
      //   one_click_checkout: checkoutOptions.one_click_checkout,
      // });

      // Hard-fail fast with a clear message rather than letting the SDK
      // open with undefined key/order_id (which produces the cryptic
      // "Authentication key was missing during initialization" error).
      if (!checkoutOptions.key) {
        throw new Error("Razorpay key missing");
      }
      if (!checkoutOptions.order_id) {
        throw new Error("Razorpay order_id missing");
      }

      // console.log("[Checkout] Opening Razorpay Magic Checkout", {
      //   orderId: checkoutOptions.order_id,
      //   amount: checkoutOptions.amount,
      //   currency: checkoutOptions.currency,
      // });

      try {
        await openRazorpayCheckout(checkoutOptions);

        // console.log("[Checkout] Razorpay popup closed successfully");
      } catch (error) {
        console.error("[Checkout] Razorpay checkout failed:", error);

        if (error?.message === "Payment cancelled") {
          toast.info("Payment cancelled. You can retry anytime.");
        } else {
          toast.error(
            error?.message || "Unable to process payment. Please try again.",
          );
        }

        throw error; // let outer catch handle cleanup
      }
    } catch (err) {
      // openRazorpayCheckout rejects on payment.failed or modal dismiss
      if (err?.message === "Payment cancelled") {
        toast.info("Payment cancelled. You can retry anytime.");
      } else {
        toast.error(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to process payment. Please try again.",
        );
      }

      console.error("[Checkout] Payment flow error:", err);
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

          {/* Order totals */}
          <div className="mt-6 pt-4 border-t border-bree-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-bree-text-secondary">Subtotal</span>
              <span className="font-medium text-bree-text-primary">
                ₹{orderSubtotal.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <span className="text-bree-text-secondary">Shipping</span>
              <div className="space-y-1.5">
                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-bree-text-primary"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="font-medium text-bree-primary whitespace-nowrap">
                      {getShippingDisplay(item)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center text-lg font-bold pt-3 border-t border-bree-border">
              <span className="text-bree-text-primary">Total</span>
              <span className="text-bree-primary">
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

      {/* Cart update modal — shown when syncCart detects price/stock changes */}
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
