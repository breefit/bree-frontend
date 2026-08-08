import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle, RefreshCcw, Home } from "lucide-react";

export default function BulkPaymentFailed() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingIdParam = searchParams.get("bookingId");

  return (
    <div className="min-h-screen bg-bree-bg flex items-center justify-center px-4">
      <Card className="max-w-xl w-full">
        <CardContent className="p-10 text-center">
          <XCircle className="mx-auto h-20 w-20 text-red-500" />

          <h1 className="mt-6 text-4xl font-bold">Payment Failed</h1>

          <p className="mt-4 text-gray-600">
            Your payment could not be completed. No amount has been deducted.
          </p>

          <div className="mt-10 flex flex-col gap-4">
            <Button
              onClick={() => {
                if (bookingIdParam) {
                  navigate(`/bulk-order/${bookingIdParam}/pay`);
                } else {
                  navigate(-1);
                }
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Try Again
            </Button>

            <Button variant="outline" onClick={() => navigate("/")}>
              <Home className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
