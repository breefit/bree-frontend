import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios, { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Building2,
  User,
  Phone,
  Mail,
  IndianRupee,
  CreditCard,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { openRazorpayCheckout } from "@/lib/razorpayLoader";

const STATUS_STYLES = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  refunded: "bg-blue-100 text-blue-800 border-blue-200",
  partially_paid: "bg-orange-100 text-orange-800 border-orange-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200",
  expired: "bg-gray-100 text-gray-800 border-gray-200",
  default: "bg-slate-100 text-slate-800 border-slate-200",
};

function formatCurrency(value, currency = "INR") {
  const amount = Number(value || 0);

  if (Number.isNaN(amount)) return "₹0";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString();
}

function getStatusMeta(status) {
  const normalized = String(status || "pending").toLowerCase();

  const friendly = {
    pending: "Pending Payment",
    paid: "Payment Completed",
    refunded: "Refunded",
    partially_paid: "Partially Paid",
    expired: "Payment Expired",
    failed: "Payment Failed",
    cancelled: "Payment Cancelled",
  };

  return {
    raw: normalized,
    label:
      friendly[normalized] ||
      String(status || "-").replace(/^[a-z]/, (s) => s.toUpperCase()),
    className: STATUS_STYLES[normalized] || STATUS_STYLES.default,
  };
}

// Deterministic unit helpers: rely only on explicit flags from backend.
function amountIsPaise(obj) {
  if (!obj) return false;
  const v = obj;
  return (
    v?.amountInPaise === true ||
    v?.isAmountInPaise === true ||
    v?.quotePriceInPaise === true ||
    String(
      v?.amount_unit ||
        v?.amountUnit ||
        v?.quotePriceUnit ||
        v?.quotePrice_unit,
    ).toLowerCase() === "paise"
  );
}

function toPaise(value, isPaise) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return isPaise ? Math.round(num) : Math.round(num * 100);
}

function toDisplayRupees(value, isPaise) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return isPaise ? num / 100 : num;
}

// Id helpers
function getBookingId(b) {
  if (!b) return null;
  return b.id ?? b.bookingId ?? b._id ?? null;
}

function getPaymentId(p, b) {
  if (p)
    return p.id ?? p.paymentId ?? p.payment_id ?? p.razorpay_payment_id ?? null;
  if (b) return b.paymentId ?? b.payment_id ?? b.razorpay_payment_id ?? null;
  return null;
}

function getOrderId(b, data) {
  if (b) return b.orderId ?? b.razorpayOrderId ?? b.razorpay_order_id ?? null;
  if (data) return data.orderId ?? data.bulkOrderId ?? null;
  return null;
}

function resolveApiPayload(apiData) {
  // Try to locate booking-like and payment-like objects in many possible shapes

  const isBooking = (obj) =>
    obj &&
    (obj.bookingNumber ||
      obj.quotePrice ||
      obj.companyName ||
      obj.mobileNumber);
  const isPayment = (obj) =>
    obj &&
    (obj.payment_id ||
      obj.razorpay_payment_id ||
      obj.paymentId ||
      obj.id ||
      obj.razorpay_payment);

  let booking = null;
  let payment = null;

  if (isBooking(apiData?.booking)) booking = apiData.booking;
  if (isBooking(apiData?.data?.booking)) booking = apiData.data.booking;
  if (!booking && isBooking(apiData?.data)) booking = apiData.data;
  if (!booking && isBooking(apiData)) booking = apiData;

  if (isPayment(apiData?.payment)) payment = apiData.payment;
  if (isPayment(apiData?.data?.payment)) payment = apiData.data.payment;
  if (!payment && isPayment(apiData?.data)) payment = apiData.data;

  // As a last resort, if booking exists and payment fields live on it, extract shallowly
  if (!payment && booking) {
    if (isPayment(booking.payment)) payment = booking.payment;
    if (
      !payment &&
      (booking.razorpay_payment_id || booking.payment_id || booking.paymentId)
    )
      payment = booking;
  }

  return { booking, payment };
}

function getBackendErrorMessage(error) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    getApiErrorMessage(error);

  if (status === 404) return "Booking not found.";
  if (status === 400) return message || "Unable to process payment.";
  if (status === 409) return "Order already created.";

  return message || "Something went wrong.";
}

function LoadingSkeleton() {
  return (
    <div className="bg-bree-bg min-h-screen py-10">
      {/* Skeleton only — overlay is rendered inside BulkPayment component */}
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mb-8 space-y-3">
          <div className="h-6 w-44 rounded-full bg-slate-200 animate-pulse" />
          <div className="h-10 w-2/3 max-w-xl rounded bg-slate-200 animate-pulse" />
          <div className="h-5 w-full max-w-2xl rounded bg-slate-200 animate-pulse" />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="h-6 w-40 rounded bg-slate-200 animate-pulse" />
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
                      <div className="h-5 w-40 rounded bg-slate-200 animate-pulse" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="h-6 w-44 rounded bg-slate-200 animate-pulse" />
              </CardHeader>
              <CardContent className="space-y-5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="flex justify-between gap-4">
                    <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
                    <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="lg:sticky lg:top-28">
              <CardHeader>
                <div className="h-6 w-44 rounded bg-slate-200 animate-pulse" />
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="mx-auto h-20 w-20 rounded-full bg-slate-200 animate-pulse" />
                <div className="space-y-4">
                  <div className="flex justify-between gap-4">
                    <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
                    <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
                  </div>
                  <div className="flex justify-between gap-4">
                    <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
                    <div className="h-4 w-16 rounded bg-slate-200 animate-pulse" />
                  </div>
                  <div className="border-t pt-5">
                    <div className="flex justify-between gap-4">
                      <div className="h-5 w-16 rounded bg-slate-200 animate-pulse" />
                      <div className="h-5 w-24 rounded bg-slate-200 animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="h-12 w-full rounded bg-slate-200 animate-pulse" />
                <div className="h-20 w-full rounded-lg bg-slate-200 animate-pulse" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BulkPayment() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [booking, setBooking] = useState(null);
  const verifyingRef = useRef(false);
  const overlayRef = useRef(null);

  const paymentStatus = useMemo(
    () => String(booking?.paymentStatus || "pending").toLowerCase(),
    [booking?.paymentStatus],
  );

  const orderCreated = useMemo(
    () =>
      Boolean(
        booking?.order_created ||
        booking?.orderCreated ||
        booking?.orderId ||
        booking?.bulkOrderId,
      ),
    [
      booking?.bulkOrderId,
      booking?.orderCreated,
      booking?.orderId,
      booking?.order_created,
    ],
  );

  const paymentDisabledMeta = useMemo(() => {
    if (paymentStatus === "paid")
      return {
        message: "Payment has already been completed.",
        className: "border-yellow-200 bg-yellow-50 text-yellow-800",
      };
    if (paymentStatus === "cancelled")
      return {
        message: "This payment was cancelled.",
        className: "border-yellow-200 bg-yellow-50 text-yellow-800",
      };
    if (paymentStatus === "failed")
      return {
        message: "This payment has failed. Please contact support.",
        className: "border-yellow-200 bg-yellow-50 text-yellow-800",
      };
    if (paymentStatus === "expired")
      return {
        message: "This payment link has expired. Please contact BREE support.",
        className: "border-gray-200 bg-gray-50 text-gray-800",
      };
    if (orderCreated)
      return {
        message: "An order has already been created for this booking.",
        className: "border-yellow-200 bg-yellow-50 text-yellow-800",
      };
    return { message: "", className: "" };
  }, [orderCreated, paymentStatus]);

  const isPaymentDisabled = useMemo(
    () => paying || Boolean(paymentDisabledMeta?.message),
    [paying, paymentDisabledMeta],
  );

  const statusMeta = useMemo(
    () => getStatusMeta(paymentStatus),
    [paymentStatus],
  );

  const backendUsesPaise = useMemo(() => amountIsPaise(booking), [booking]);

  const amounts = useMemo(() => {
    const quoteRaw =
      Number(booking?.quotePrice ?? booking?.total ?? booking?.amount ?? 0) ||
      0;
    const gstRaw =
      Number(booking?.gstAmount ?? booking?.gst ?? booking?.taxAmount ?? 0) ||
      0;
    const discountRaw =
      Number(booking?.discountAmount ?? booking?.discount ?? 0) || 0;

    const totalPaise = toPaise(quoteRaw, backendUsesPaise);
    const gstPaise = toPaise(gstRaw, backendUsesPaise);
    const discountPaise = toPaise(discountRaw, backendUsesPaise);

    let subtotalPaise = null;
    const subtotalRaw =
      booking?.subtotal ?? booking?.subTotal ?? booking?.subtotalAmount;
    if (subtotalRaw !== undefined && subtotalRaw !== null) {
      subtotalPaise = toPaise(Number(subtotalRaw) || 0, backendUsesPaise);
    }

    if (subtotalPaise === null) {
      subtotalPaise = Math.max(0, totalPaise - gstPaise - discountPaise);
    }

    return {
      subtotalPaise,
      gstPaise,
      discountPaise,
      totalPaise,
      backendUsesPaise,
    };
  }, [booking, backendUsesPaise]);

  const loadPaymentDetails = useCallback(async () => {
    try {
      setLoading(true);

      const { data } = await axios.get(
        `/api/bulk-bookings/${bookingId}/payment`,
      );

      // If API explicitly returned success=false, surface the message
      if (!data?.success && data?.success !== undefined) {
        throw new Error(data?.message || "Unable to load payment details.");
      }

      const { booking: resolvedBooking, payment: resolvedPayment } =
        resolveApiPayload(data);

      // Validate booking exists
      if (!resolvedBooking) {
        toast.error("Invalid payment details.");
        setBooking(null);
        return;
      }

      const alreadyPaid =
        data?.alreadyPaid ||
        (resolvedBooking &&
          String(
            resolvedBooking.paymentStatus || data?.paymentStatus || "",
          ).toLowerCase() === "paid") ||
        (resolvedPayment &&
          String(
            resolvedPayment.paymentStatus || resolvedPayment.status || "",
          ).toLowerCase() === "paid");

      if (alreadyPaid) {
        toast.success(data?.message || "Payment already completed.");

        const bookingForState = resolvedBooking ?? null;
        const paymentForState = resolvedPayment ?? null;

        const qs = new URLSearchParams();
        const bId = getBookingId(bookingForState) || bookingId;
        const pId = getPaymentId(paymentForState, bookingForState) || null;
        const oId = getOrderId(bookingForState, data) || null;

        if (bId) qs.set("bookingId", String(bId));
        if (pId) qs.set("paymentId", String(pId));
        if (oId) qs.set("orderId", String(oId));

        navigate(`/bulk-order/payment-success?${qs.toString()}`, {
          replace: true,
          state: { booking: bookingForState, payment: paymentForState },
        });

        return;
      }

      setBooking(resolvedBooking ?? null);
    } catch (error) {
      const status = error?.response?.status;
      const serverMessage = error?.response?.data?.message;

      if (status === 404) {
        toast.error("Booking not found.");
      } else if (
        status === 400 &&
        /quote/i.test(String(serverMessage || "")) &&
        /approved/i.test(String(serverMessage || ""))
      ) {
        toast.error("Quote not approved.");
      } else if (
        status === 400 &&
        /payment link/i.test(String(serverMessage || "")) &&
        /shared/i.test(String(serverMessage || ""))
      ) {
        toast.error("Payment link not shared.");
      } else if (status === 409) {
        toast.error("Order already created.");
      } else {
        toast.error(getBackendErrorMessage(error));
      }

      setBooking(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId, navigate]);

  useEffect(() => {
    loadPaymentDetails();
  }, [loadPaymentDetails]);

  const verifyPayment = useCallback(
    async (response) => {
      if (verifyingRef.current) return;
      verifyingRef.current = true;

      try {
        const { data } = await axios.post(
          `/api/bulk-bookings/${bookingId}/verify-payment`,
          {
            razorpay_order_id:
              response?.razorpay_order_id ||
              response?.order_id ||
              response?.orderId,
            razorpay_payment_id:
              response?.razorpay_payment_id ||
              response?.payment_id ||
              response?.paymentId,
            razorpay_signature:
              response?.razorpay_signature ||
              response?.signature ||
              response?.razorpaySignature,
          },
        );

        if (!data?.success && data?.success !== undefined) {
          throw new Error(data?.message || "Verification failed.");
        }

        toast.success(data?.message || "Payment completed successfully.");

        const { booking: finalBooking, payment: finalPayment } =
          resolveApiPayload(data);
        const bookingForState = finalBooking ?? booking;
        const paymentForState = finalPayment ?? null;

        if (!bookingForState) {
          toast.error("Invalid payment details.");
          const qs = new URLSearchParams();
          const bId = getBookingId(booking) || bookingId;
          if (bId) qs.set("bookingId", String(bId));
          navigate(`/bulk-order/payment-failed?${qs.toString()}`, {
            replace: true,
          });
          return;
        }

        const qs = new URLSearchParams();
        const bId = getBookingId(bookingForState) || bookingId;
        const pId = getPaymentId(paymentForState, bookingForState) || null;
        const oId = getOrderId(bookingForState, data) || null;

        if (bId) qs.set("bookingId", String(bId));
        if (pId) qs.set("paymentId", String(pId));
        if (oId) qs.set("orderId", String(oId));

        navigate(`/bulk-order/payment-success?${qs.toString()}`, {
          replace: true,
          state: { booking: bookingForState, payment: paymentForState },
        });
      } catch (error) {
        toast.error(getBackendErrorMessage(error));
        const qs = new URLSearchParams();
        const bId = getBookingId(booking) || bookingId;
        if (bId) qs.set("bookingId", String(bId));
        navigate(`/bulk-order/payment-failed?${qs.toString()}`, {
          replace: true,
        });
      } finally {
        verifyingRef.current = false;
        setPaying(false);
      }
    },
    [booking, bookingId, navigate],
  );

  const handlePayment = useCallback(async () => {
    if (!booking) return;

    if (paymentDisabledMeta?.message) {
      toast.info(paymentDisabledMeta.message);
      return;
    }

    if (paying) return; // prevent duplicate popups

    try {
      setPaying(true);

      // Move focus to overlay so keyboard users are trapped while processing
      setTimeout(() => {
        try {
          overlayRef.current?.focus();
        } catch (e) {
          // ignore
        }
      }, 50);

      const key = booking?.keyId || booking?.key || booking?.key_id;
      const orderId =
        booking?.razorpayOrderId ||
        booking?.razorpay_order_id ||
        booking?.orderId ||
        booking?.order_id;
      const currency = booking?.currency;
      const quoteRaw =
        booking?.quotePrice ?? booking?.amount ?? booking?.total;
      const backendPaise = amounts.backendUsesPaise;
      const amountPaise = toPaise(quoteRaw, backendPaise);

      // Validate Razorpay inputs
      if (!key) {
        toast.error("Missing payment key (keyId). Please contact support.");
        return;
      }
      if (!orderId) {
        toast.error("Missing order id. Please contact support.");
        return;
      }
      if (!currency) {
        toast.error("Missing currency. Please contact support.");
        return;
      }
      if (!(Number(amountPaise) > 0)) {
        toast.error("Invalid payment amount.");
        return;
      }

      // FIX (Standard Checkout for Bulk Orders): the customer already
      // supplied the complete delivery address on the original Bulk Booking
      // form — Razorpay's checkout has nothing left to collect, so this is
      // a plain Razorpay Order (Standard Checkout), not Magic Checkout.
      // No one_click_checkout, no line_items/line_items_total: those only
      // mattered for Magic Checkout's in-popup order summary and its
      // account-wide Shipping Info webhook dependency, neither of which
      // applies here.
      await openRazorpayCheckout({
        key_id: key,
        key: key,
        order_id: orderId,
        amount: amountPaise,
        currency: currency || "INR",
        name: "BREE Wellness",
        description: `Bulk Booking ${booking?.bookingNumber}`,
        prefill: {
          name: booking?.contactPerson,
          email: booking?.email,
          contact: booking?.mobileNumber,
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          paylater: false,
          cod: false,
        },
        retry: { enabled: true },
        timeout: 900,
        onSuccess: verifyPayment,
      });
    } catch (error) {
      const message = String(error?.message || error || "").toLowerCase();

      if (message.includes("cancel")) {
        toast.info("Payment cancelled.");
        const qs = new URLSearchParams();
        const bId = getBookingId(booking) || bookingId;
        if (bId) qs.set("bookingId", String(bId));
        navigate(`/bulk-order/payment-failed?${qs.toString()}`, {
          replace: true,
        });
      } else if (message.includes("load") || message.includes("sdk")) {
        toast.error("Unable to load Razorpay. Please try again.");
      } else if (message.includes("verification")) {
        toast.error("Payment verification failed. Please try again.");
      } else if (message.includes("network")) {
        toast.error(
          "Network error. Please check your connection and try again.",
        );
      } else {
        toast.error(getApiErrorMessage(error));
      }
    } finally {
      setPaying(false);
    }
  }, [
    booking,
    paymentDisabledMeta,
    verifyPayment,
    paying,
    bookingId,
    navigate,
    amounts,
  ]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!booking) {
    return (
      <div className="container mx-auto py-20 px-4">
        <Card className="mx-auto max-w-xl">
          <CardContent className="py-16 text-center">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h2 className="text-2xl font-bold">Payment Details Not Found</h2>
            <p className="mt-3 text-muted-foreground">
              Unable to load your bulk booking payment details.
            </p>
            <Button
              className="mt-8 w-full sm:w-auto"
              onClick={() => navigate("/")}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-bree-bg min-h-screen py-10">
      {paying && (
        <div
          ref={overlayRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          aria-label="Payment processing"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        >
          <div className="rounded-lg bg-white/95 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
              <div>
                <div className="font-medium">Processing payment</div>
                <div className="text-sm text-muted-foreground">
                  Please do not close or reload this page.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mb-8">
          <Badge className="mb-3 bg-green-100 px-4 py-1 text-green-700">
            Bulk Booking Payment
          </Badge>

          <h1 className="text-4xl font-bold text-bree-primary">
            Complete Your Payment
          </h1>

          <p className="mt-3 text-muted-foreground">
            Your quotation has been approved. Complete the payment to confirm
            your Bulk Order.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Booking Details</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="flex items-center gap-4">
                  <Building2 className="text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <h3 className="font-semibold">
                      {booking.companyName || "-"}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <User className="text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Contact Person
                    </p>
                    <h3 className="font-semibold">
                      {booking.contactPerson || "-"}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Phone className="text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Mobile</p>
                    <h3 className="font-semibold">
                      {booking.mobileNumber || "-"}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Mail className="text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <h3 className="font-semibold break-all">
                      {booking.email || "-"}
                    </h3>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Booking Summary</CardTitle>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Booking Number</span>
                  <span className="font-semibold">
                    {booking.bookingNumber || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-semibold">
                    {booking.quantity ?? "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Quote Amount</span>
                  <span className="font-semibold">
                    {formatCurrency(
                      toDisplayRupees(
                        booking.quotePrice,
                        amounts.backendUsesPaise,
                      ),
                      booking.currency,
                    )}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Delivery Date</span>
                  <span className="font-semibold">
                    {formatDate(booking.deliveryDate)}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Currency</span>
                  <span className="font-semibold">
                    {booking.currency || "-"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Payment Status</span>
                  <div aria-live="polite" aria-atomic="true">
                    <Badge className={statusMeta.className}>
                      {statusMeta.label}
                    </Badge>
                  </div>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    Quote Approved Date
                  </span>
                  <span className="font-semibold">
                    {formatDate(booking.quoteApprovedAt)}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    Payment Link Shared Date
                  </span>
                  <span className="font-semibold">
                    {formatDate(booking.paymentSharedAt)}
                  </span>
                </div>

                {booking.location && (
                  <div>
                    <p className="mb-2 text-muted-foreground">
                      Delivery Location
                    </p>
                    <div className="rounded-lg border bg-gray-50 p-4">
                      {booking.location}
                    </div>
                  </div>
                )}

                {booking.requirements && (
                  <div>
                    <p className="mb-2 text-muted-foreground">Requirements</p>
                    <div className="rounded-lg border bg-gray-50 p-4 whitespace-pre-wrap">
                      {booking.requirements}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="lg:sticky lg:top-28">
              <CardHeader>
                <CardTitle>Payment Summary</CardTitle>
              </CardHeader>

              <CardContent>
                <div className="mb-8 flex items-center justify-center">
                  <div className="rounded-full bg-green-100 p-5">
                    <IndianRupee className="h-10 w-10 text-green-700" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between gap-4">
                    <span>Subtotal</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        toDisplayRupees(amounts.subtotalPaise, true),
                        booking.currency,
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span>GST</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        toDisplayRupees(amounts.gstPaise, true),
                        booking.currency,
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span>Discount</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        toDisplayRupees(amounts.discountPaise, true),
                        booking.currency,
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span>Currency</span>
                    <span>{booking.currency || "-"}</span>
                  </div>

                  <div className="border-t pt-5">
                    <div className="flex justify-between gap-4 text-xl font-bold">
                      <span>Total</span>
                      <span>
                        {formatCurrency(
                          toDisplayRupees(amounts.totalPaise, true),
                          booking.currency,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {paymentDisabledMeta?.message ? (
                  <div
                    className={`mt-6 rounded-lg border p-4 text-sm ${paymentDisabledMeta.className}`}
                  >
                    {paymentDisabledMeta.message}
                  </div>
                ) : null}

                <Button
                  onClick={handlePayment}
                  disabled={isPaymentDisabled}
                  aria-disabled={isPaymentDisabled}
                  aria-label={`Pay ${formatCurrency(toDisplayRupees(amounts.totalPaise, true), booking.currency)}`}
                  className="mt-8 h-12 w-full bg-green-600 text-lg hover:bg-green-700"
                >
                  {paying ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      {`Pay ${formatCurrency(toDisplayRupees(amounts.totalPaise, true), booking.currency)}`}
                    </>
                  )}
                </Button>

                <div className="mt-6 rounded-lg bg-green-50 p-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                    <div className="space-y-1">
                      <p className="font-semibold">Payment Information</p>
                      <p className="text-sm text-muted-foreground">
                        GST invoice will be generated after successful payment.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Our team will contact you after payment confirmation.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Secure payment powered by Razorpay.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
