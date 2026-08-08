import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios, { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Building2,
  User,
  IndianRupee,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// FIX (audit): bulkNotificationService.notifyQuoteReady emails the customer
// a link to `/bulk-order/:bookingId` (see App.js route below) so they can
// review and approve their quote. No page ever existed for that route —
// this is the missing piece that makes the approve-quote step (and
// therefore payment-link sharing and payment, both gated on quote_approved)
// reachable at all.

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return "₹0";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
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
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BulkQuoteApproval() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [quote, setQuote] = useState(null);
  const [loadError, setLoadError] = useState("");

  const loadQuote = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");

      const { data } = await axios.get(`/api/bulk-bookings/${bookingId}/quote`);

      if (!data?.success) {
        throw new Error(data?.message || "Unable to load your quote.");
      }

      setQuote(data.data);
    } catch (error) {
      const status = error?.response?.status;
      const serverMessage = error?.response?.data?.message;

      if (status === 409) {
        // Already converted into an Order — send straight to the payment
        // page, which knows how to show the "already paid" state.
        navigate(`/bulk-order/${bookingId}/pay`, { replace: true });
        return;
      }

      setLoadError(serverMessage || getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [bookingId, navigate]);

  useEffect(() => {
    loadQuote();
  }, [loadQuote]);

  const handleApprove = useCallback(async () => {
    if (approving) return;
    try {
      setApproving(true);
      const { data } = await axios.post(
        `/api/bulk-bookings/${bookingId}/approve-quote`,
      );

      if (!data?.success) {
        throw new Error(data?.message || "Unable to approve quotation.");
      }

      toast.success("Quotation approved. Redirecting to payment...");
      navigate(`/bulk-order/${bookingId}/pay`, { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setApproving(false);
    }
  }, [approving, bookingId, navigate]);

  if (loading) {
    return (
      <div className="bg-bree-bg flex min-h-screen items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (loadError || !quote) {
    return (
      <div className="container mx-auto px-4 py-20">
        <Card className="mx-auto max-w-xl">
          <CardContent className="py-16 text-center">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h2 className="text-2xl font-bold">Quote Not Available</h2>
            <p className="mt-3 text-muted-foreground">
              {loadError || "Unable to load your bulk order quote."}
            </p>
            <Button className="mt-8 w-full sm:w-auto" onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quote already approved — point them at the payment step instead of
  // re-showing the Approve button.
  if (quote.quoteApproved || !quote.canApprove) {
    return (
      <div className="bg-bree-bg flex min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-600" />
            <h2 className="text-2xl font-bold">Quotation Already Approved</h2>
            <p className="mt-3 text-muted-foreground">
              You've already approved this quote.
              {quote.paymentStatus === "paid"
                ? " Payment has been completed."
                : " Continue to payment to confirm your bulk order."}
            </p>
            {quote.paymentStatus !== "paid" && (
              <Button
                className="mt-8"
                onClick={() => navigate(`/bulk-order/${bookingId}/pay`)}
              >
                Continue to Payment
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-bree-bg min-h-screen py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-bree-primary">
            Review Your Quote
          </h1>
          <p className="mt-3 text-muted-foreground">
            Please review the quotation below and approve it to proceed to
            payment.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quote Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex items-center gap-4">
                <Building2 className="text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <h3 className="font-semibold">{quote.companyName || "-"}</h3>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <User className="text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Contact Person</p>
                  <h3 className="font-semibold">{quote.contactPerson || "-"}</h3>
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <IndianRupee className="h-6 w-6 text-green-600" />
                  <span className="text-lg text-muted-foreground">
                    Quote Amount
                  </span>
                </div>
                <span className="text-2xl font-bold">
                  {formatCurrency(quote.quotePrice)}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-6 w-6 text-green-600" />
                  <span className="text-lg text-muted-foreground">
                    Estimated Delivery
                  </span>
                </div>
                <span className="text-lg font-semibold">
                  {formatDate(quote.deliveryDate)}
                </span>
              </div>
            </div>

            {quote.requirements && (
              <div>
                <p className="mb-2 text-muted-foreground">Requirements</p>
                <div className="rounded-lg border bg-gray-50 p-4 whitespace-pre-wrap">
                  {quote.requirements}
                </div>
              </div>
            )}

            <Button
              onClick={handleApprove}
              disabled={approving}
              className="mt-4 h-12 w-full bg-green-600 text-lg hover:bg-green-700"
            >
              {approving ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Approving...
                </>
              ) : (
                "Approve Quotation"
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              After approving, our team will share a secure payment link to
              confirm your bulk order.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
