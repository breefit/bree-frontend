import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Loader2, Truck, Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import axios from "@/lib/api";
import { formatReminderTime, maskWhatsAppNumber } from "@/lib/reminderDisplay";

const getShippingDisplay = (order) => {
  const isFree =
    order?.is_free_shipping === true ||
    order?.is_free_shipping === 1 ||
    order?.isFreeShipping === true ||
    order?.isFreeShipping === 1;

  if (isFree) {
    return "Free";
  }

  if (order?.shipping != null && order.shipping !== "") {
    const charge = Number(order.shipping);
    return Number.isFinite(charge) && charge >= 0
      ? `₹${charge.toLocaleString("en-IN")}`
      : "Shipping information unavailable";
  }

  const hasCharge =
    order?.shipping_charge != null || order?.shippingCharge != null;

  if (!hasCharge) {
    return "Shipping information unavailable";
  }

  const charge = Number(order?.shipping_charge ?? order?.shippingCharge ?? 0);
  return Number.isFinite(charge) && charge >= 0
    ? `₹${charge.toLocaleString("en-IN")}`
    : "Shipping information unavailable";
};

const CheckoutSuccess = () => {
  const [searchParams] = useSearchParams();

  // ── FIX: accept all three param names ────────────────────────────────────
  // Old payment flow used order_id and payment_id.
  // New Magic Checkout flow navigates to /checkout/success?orderId=...
  // Support all three so neither old bookmarks nor new flow breaks.
  const orderId =
    searchParams.get("orderId") ||
    searchParams.get("order_id") ||
    searchParams.get("payment_id");

  const [status, setStatus] = useState("loading");
  const [orderDetails, setOrderDetails] = useState(null);

  const { clearCart } = useCart();

  const shippingDisplay = getShippingDisplay(orderDetails);
  const hasEstimatedDelivery = Boolean(
    orderDetails?.estimated_delivery?.toString().trim(),
  );
  const reminderCards = Array.isArray(orderDetails?.reminders)
    ? orderDetails.reminders.filter(
        (reminder) => reminder?.reminder_enabled !== 0,
      )
    : [];
  const reminderPrice = reminderCards.reduce(
    (total, reminder) => total + Number(reminder?.reminder_price_paid || 0),
    0,
  );
  const reminderTime = reminderCards[0]?.reminder_time;

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        // console.log("No orderId found");
        setStatus("error");
        return;
      }

      try {
        // console.log("CheckoutSuccess orderId:", orderId);

        const response = await axios.get(`/api/orders/${orderId}`);

        // console.log("Order API response:", response.data);

        setOrderDetails(response.data);
        clearCart();
        setStatus("success");
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[CheckoutSuccess] Failed to load order:", error);
        }
        setStatus("error");
      }
    };

    fetchOrder();
  }, [orderId, clearCart]);

  return (
    <>
      <Helmet>
        <title>Order Confirmed | BREE</title>
        <meta
          name="description"
          content="Your BREE order has been confirmed."
        />
      </Helmet>

      <div className="pt-24 min-h-screen bg-bree-bg">
        <div className="max-w-4xl mx-auto px-4 py-10">
          {/* Loading */}
          {status === "loading" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <Loader2 className="w-14 h-14 mx-auto animate-spin text-bree-primary" />
              <h2 className="mt-5 text-2xl font-bold">Confirming Your Order</h2>
              <p className="text-bree-text-secondary mt-2">Please wait…</p>
            </motion.div>
          )}

          {/* Success */}
          {status === "success" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-sm border border-bree-border p-8"
            >
              {/* Hero */}
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-green-100 mx-auto flex items-center justify-center">
                  <CheckCircle className="w-14 h-14 text-green-600" />
                </div>
                <h1 className="text-4xl font-bold mt-6">Order Confirmed</h1>
                {orderDetails?.order_number && (
                  <p className="text-bree-text-primary font-outfit font-semibold mt-2">
                    Order #{orderDetails.order_number}
                  </p>
                )}
                <p className="text-bree-text-secondary mt-3">
                  Thank you for purchasing BREE Wellness.
                </p>
              </div>

              {/* Order details grid */}
              <div className="mt-10 grid md:grid-cols-2 gap-6">
                <div className="bg-bree-bg rounded-2xl p-5">
                  <h3 className="font-bold mb-4">Payment Details</h3>
                  {/* FIX (Order Number feature): customer-facing UI must never
                      show the internal UUID — show order_number instead. If
                      an older order somehow has no order_number yet (e.g.
                      backfill hasn't run), fall back to a clear placeholder
                      rather than leaking the UUID. */}
                  <Info
                    label="Order Number"
                    value={orderDetails?.order_number || "—"}
                  />
                  <Info
                    label="Transaction ID"
                    value={orderDetails?.razorpay_payment_id}
                  />
                  <Info label="Payment Method" value="Razorpay" />
                  <Info
                    label="Payment Status"
                    value={orderDetails?.payment_status}
                  />
                  <Info
                    label="Paid On"
                    value={
                      orderDetails?.paid_at
                        ? new Date(orderDetails.paid_at).toLocaleString(
                            "en-IN",
                            {
                              timeZone: "Asia/Kolkata",
                              dateStyle: "medium",
                              timeStyle: "short",
                            },
                          )
                        : "—"
                    }
                  />
                </div>

                <div className="bg-bree-bg rounded-2xl p-5">
                  <h3 className="font-bold mb-4">Order Status</h3>
                  <Info label="Status" value={orderDetails?.order_status} />
                  {hasEstimatedDelivery && (
                    <Info
                      label="Estimated Delivery"
                      value={orderDetails?.estimated_delivery}
                    />
                  )}
                  <Info label="Shipping" value={shippingDisplay} />
                  {reminderCards.length > 0 && (
                    <>
                      <Info
                        label="Daily WhatsApp Reminder"
                        value={`₹${reminderPrice.toLocaleString("en-IN")}`}
                      />
                      <Info
                        label="Reminder Time"
                        value={formatReminderTime(reminderTime)}
                      />
                    </>
                  )}
                  <Info
                    label="Amount Paid"
                    value={orderDetails?.total ? `₹${orderDetails.total}` : "—"}
                  />
                </div>
              </div>

              {/* Shipping Address */}
              <div className="mt-10 bg-bree-bg rounded-2xl p-5">
                <h3 className="font-bold mb-4">Shipping Address</h3>

                {/* FIX (audit Section 2 / Fix 3): backend stores
                  shipping_address as a single comma-joined string (see
                  formatRazorpayShippingAddress in paymentController.js), not
                  an object — render it as-is instead of reading
                  non-existent .name/.phone/.address_line_1 fields, which
                  previously rendered blank. */}
                {typeof orderDetails?.shipping_address === "string" &&
                orderDetails.shipping_address.trim() ? (
                  <p className="whitespace-pre-line">
                    {orderDetails.shipping_address}
                  </p>
                ) : orderDetails?.shipping_address &&
                  typeof orderDetails.shipping_address === "object" ? (
                  <>
                    <p>{orderDetails.shipping_address.name}</p>
                    <p>{orderDetails.shipping_address.phone}</p>
                    <p>{orderDetails.shipping_address.address_line_1}</p>

                    {orderDetails.shipping_address.address_line_2 && (
                      <p>{orderDetails.shipping_address.address_line_2}</p>
                    )}

                    <p>
                      {orderDetails.shipping_address.city},{" "}
                      {orderDetails.shipping_address.state} -{" "}
                      {orderDetails.shipping_address.pincode}
                    </p>
                  </>
                ) : (
                  <p className="text-bree-text-secondary">
                    Address not available
                  </p>
                )}
              </div>

              {/* Products */}
              <div className="mt-10">
                <h3 className="font-bold mb-5">Products</h3>
                <div className="space-y-4">
                  {orderDetails?.items?.map((item) => {
                    // console.log("ITEM:", item);

                    return (
                      <div
                        key={item.id}
                        className="border rounded-2xl p-4 flex items-center gap-4"
                      >
                        <img
                          src={item.product_image}
                          alt={item.product_name}
                          className="w-20 h-20 object-contain bg-bree-bg rounded-xl p-2"
                        />

                        <div className="flex-1">
                          <h4 className="font-semibold text-lg">
                            {item.product_name || item.name || "Product"}
                          </h4>

                          <p className="text-sm text-bree-text-secondary mt-1">
                            Qty: {item.quantity}
                          </p>
                        </div>

                        <div className="text-xl font-bold text-bree-primary">
                          ₹{item.subtotal}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {reminderCards.length > 0 && (
                <div className="mt-10">
                  <h3 className="font-bold mb-5">WhatsApp Reminder</h3>
                  <div className="space-y-4">
                    {reminderCards.map((reminder) => {
                      const phoneValue =
                        reminder.reminder_phone_source === "custom"
                          ? reminder.reminder_whatsapp_number ||
                            orderDetails?.contact_phone ||
                            orderDetails?.mobile_number ||
                            ""
                          : reminder.reminder_whatsapp_number ||
                            orderDetails?.contact_phone ||
                            orderDetails?.mobile_number ||
                            "";

                      return (
                        <div
                          key={reminder.id}
                          className="rounded-2xl border border-bree-border bg-bree-bg p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-xl border border-bree-border bg-white overflow-hidden shrink-0 flex items-center justify-center">
                              <img
                                src="/images/daily-whatsapp-reminder.png"
                                alt="Daily WhatsApp Reminder"
                                className="w-10 h-10 object-contain"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-bree-text-primary text-base">
                                Daily wellness reminders enabled
                              </p>
                              <p className="text-sm text-bree-text-secondary mt-1">
                                Reminder time:{" "}
                                {formatReminderTime(reminder.reminder_time)}
                              </p>
                              <p className="text-sm text-bree-text-secondary mt-1">
                                WhatsApp: {maskWhatsAppNumber(phoneValue)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-10 grid md:grid-cols-3 gap-4">
                <Link
                  to={
                    orderId
                      ? `/order/${orderId}/tracking`
                      : "/profile?tab=orders"
                  }
                >
                  <Button className="w-full bg-bree-primary">
                    <Truck className="w-4 h-4 mr-2" />
                    Track Order
                  </Button>
                </Link>
                <Link to="/shop">
                  <Button className="w-full" variant="outline">
                    Continue Shopping
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="outline" className="w-full">
                    Home
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center py-20">
              <h2 className="text-3xl font-bold">Unable To Load</h2>
              <p className="mt-3 text-bree-text-secondary">
                Unable to load order details.
              </p>
              <Link to="/profile?tab=orders" className="mt-6 inline-block">
                <Button className="bg-bree-primary">View My Orders</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

function Info({ label, value }) {
  return (
    <div className="flex justify-between mb-3">
      <span className="text-bree-text-secondary">{label}</span>
      <span className="font-semibold">{value || "—"}</span>
    </div>
  );
}

export default CheckoutSuccess;
