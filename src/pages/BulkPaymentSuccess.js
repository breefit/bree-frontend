import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, IndianRupee, Home, Package } from "lucide-react";

export default function BulkPaymentSuccess() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [searchParams] = useSearchParams();

  const booking = state?.booking;
  const payment = state?.payment;

  const bookingIdParam = searchParams.get("bookingId");
  const paymentIdParam = searchParams.get("paymentId");
  const orderIdParam = searchParams.get("orderId");

  return (
    <div className="min-h-screen bg-bree-bg flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl shadow-xl border-0">
        <CardContent className="p-10 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-6">
              <CheckCircle2 className="h-20 w-20 text-green-600" />
            </div>
          </div>

          <h1 className="mt-8 text-4xl font-bold text-green-700">
            Payment Successful
          </h1>

          <p className="mt-4 text-gray-600">
            Thank you for your payment. Your Bulk Booking has been confirmed
            successfully.
          </p>

          <div className="mt-10 rounded-xl border bg-gray-50 p-6 text-left space-y-4">
            <div className="flex justify-between">
              <span>Booking Number</span>
              <strong>{booking?.bookingNumber || "—"}</strong>
            </div>

            <div className="flex justify-between">
              <span>Company</span>
              <strong>{booking?.companyName}</strong>
            </div>

            <div className="flex justify-between">
              <span>Contact Person</span>
              <strong>{booking?.contactPerson}</strong>
            </div>

            <div className="flex justify-between">
              <span>Amount Paid</span>

              <strong className="flex items-center gap-1">
                <IndianRupee className="h-4 w-4" />
                {Number(
                  booking?.quotePrice || payment?.amount || 0,
                ).toLocaleString("en-IN")}
              </strong>
            </div>

            {(payment?.paymentId || paymentIdParam) && (
              <div className="flex justify-between">
                <span>Payment ID</span>
                <strong>{payment?.paymentId || paymentIdParam}</strong>
              </div>
            )}
          </div>

          <div className="mt-10 rounded-xl bg-green-50 p-5 text-green-800">
            Our team has received your payment. We will begin processing your
            bulk order shortly and keep you updated via Email and WhatsApp.
          </div>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button className="flex-1" onClick={() => navigate("/")}>
              <Home className="mr-2 h-4 w-4" />
              Back to Home
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/profile")}
            >
              <Package className="mr-2 h-4 w-4" />
              My Orders
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
