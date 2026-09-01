import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Loader2, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import axios from "@/lib/api";

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

              {/* Daily Reminders */}
              {orderDetails?.reminders && orderDetails.reminders.length > 0 && (
                <div className="mt-10">
                  <h3 className="font-bold mb-5">Daily WhatsApp Reminders</h3>
                  <div className="space-y-4">
                    {orderDetails.reminders.map((reminder) => {
                      // Find the corresponding product name from order items
                      const product = orderDetails.items?.find(
                        (item) => item.product_id === reminder.product_id,
                      );
                      const productName = product?.product_name || "Product";

                      // Format reminder time to 12-hour format
                      const formatReminderTime = (time) => {
                        const [hours, minutes] = time.split(":");
                        const hour = parseInt(hours, 10);
                        const ampm = hour >= 12 ? "PM" : "AM";
                        const displayHour =
                          hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                        return `${String(displayHour).padStart(2, "0")}:${minutes} ${ampm} IST`;
                      };

                      return (
                        <div
                          key={reminder.id}
                          className="border border-green-200 bg-green-50 rounded-2xl p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <h4 className="font-semibold text-bree-text-primary">
                                {productName}
                              </h4>
                              <p className="text-sm text-bree-text-secondary mt-1">
                                Daily reminder at{" "}
                                <span className="font-medium text-green-700">
                                  {formatReminderTime(reminder.reminder_time)}
                                </span>
                              </p>
                              {reminder.reminder_start_date && (
                                <p className="text-xs text-bree-text-secondary mt-2">
                                  Starts:{" "}
                                  {new Date(
                                    reminder.reminder_start_date,
                                  ).toLocaleDateString("en-IN")}{" "}
                                  |{" "}
                                  {reminder.reminder_end_date &&
                                    `Ends: ${new Date(
                                      reminder.reminder_end_date,
                                    ).toLocaleDateString("en-IN")}`}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0">
                              <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                Active
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                    <p className="text-sm text-blue-800">
                      💬 You'll receive daily WhatsApp reminders as per your
                      scheduled time, starting from your delivery date.
                    </p>
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
