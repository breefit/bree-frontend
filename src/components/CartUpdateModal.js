import { motion } from "framer-motion";
import { X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const CartUpdateModal = ({
  visible,
  items = [],
  onAccept,
  onReview,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        className="relative z-70 w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-lg border border-bree-border p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-bree-text-primary">
              Product Updates Detected
            </h3>
            <p className="text-sm text-bree-text-secondary mt-1">
              Some items in your cart were updated with the latest price or
              availability. Review the changes before proceeding to payment.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-bree-bg"
          >
            <X className="w-5 h-5 text-bree-text-secondary" />
          </button>
        </div>

        <div className="mt-5 space-y-3 max-h-80 overflow-y-auto">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex gap-4 items-center p-3 rounded-xl border border-bree-border bg-bree-bg"
            >
              <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex items-center justify-center border border-bree-border/50">
                {it.image ? (
                  <img
                    src={it.image}
                    alt={it.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-xs text-bree-text-secondary px-2">
                    No image
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-bree-text-primary truncate">
                    {it.name}
                  </h4>
                </div>

                <div className="mt-1 text-sm text-bree-text-secondary flex items-center gap-3">
                  {it.priceChanged ? (
                    <>
                      <span className="line-through text-xs text-bree-text-secondary">
                        ₹{Number(it.clientPrice).toLocaleString("en-IN")}
                      </span>
                      <span className="text-sm font-semibold text-bree-primary">
                        ₹{Number(it.currentPrice).toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                        Price changed
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-bree-text-primary">
                      ₹{Number(it.currentPrice).toLocaleString("en-IN")}
                    </span>
                  )}
                </div>

                <div className="mt-2 text-xs">
                  {!it.available ? (
                    <span className="text-red-700">
                      This product is no longer available.
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onReview} className="rounded-full">
            Review Cart
          </Button>
          <Button
            onClick={onAccept}
            className="rounded-full bg-bree-primary text-white"
          >
            Accept Changes & Continue
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default CartUpdateModal;
