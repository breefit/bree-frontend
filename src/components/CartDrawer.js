import { useEffect, useMemo, useState, useCallback } from "react";
import {
  X,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import axios from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const CartDrawer = ({ isOpen, onClose }) => {
  const {
    cartItems,
    cartTotal,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    syncCart,
    pendingChanges,
  } = useCart();

  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [isReplacingProduct, setIsReplacingProduct] = useState(false);

  const primaryProductId = useMemo(() => cartItems[0]?.id, [cartItems]);
  const primaryProduct = useMemo(() => cartItems[0], [cartItems]);

  // Build a Set of cart product IDs so we can filter them out of
  // recommendations without depending on product names or slugs.
  const cartProductIds = useMemo(
    () => new Set(cartItems.map((item) => item.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartItems.map((i) => i.id).join(",")],
  );

  // ── Fetch recommendations via journey-based API ──────────────────────────
  // The API already enforces all business rules (is_subscription, journey_level,
  // show_recommendations, inactive, out-of-stock). We only need to additionally
  // strip products that are already in the cart on the client side.
  useEffect(() => {
    if (!primaryProductId) {
      setRecommendations([]);
      return;
    }

    const controller = new AbortController();

    const fetchRecommendations = async () => {
      setRecommendationsLoading(true);
      try {
        const response = await axios.get(
          `/api/products/${primaryProductId}/recommendations`,
          { signal: controller.signal },
        );

        const data = Array.isArray(response.data) ? response.data : [];

        // Debug log as required by spec
        // console.log("Current Product:", primaryProduct?.name);
        // console.log("Journey Level:", primaryProduct?.journey_level);
        // console.log("Is Subscription:", primaryProduct?.is_subscription);
        // console.log("Recommended Products:", data);

        // Filter out anything already in the cart
        const filteredRecs = data.filter((rec) => !cartProductIds.has(rec.id));
        setRecommendations(filteredRecs);
      } catch (error) {
        if (error.name !== "CanceledError") {
          console.error("❌ Failed to load recommendations:", error.message);
        }
        setRecommendations([]);
      } finally {
        setRecommendationsLoading(false);
      }
    };

    fetchRecommendations();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryProductId]);

  // ── Handle upgrade: replace current product with recommended one ─────────
  const handleUpgradeProduct = useCallback(
    async (recommendedProduct) => {
      setIsReplacingProduct(true);
      try {
        if (primaryProduct) {
          removeFromCart(primaryProduct.id);
        }

        setTimeout(() => {
          addToCart(
            {
              ...recommendedProduct,
              quantity: recommendedProduct.quantity ?? 1,
              mrp: recommendedProduct.mrp || recommendedProduct.price,
            },
            1,
          );
          toast.success(`Upgraded to ${recommendedProduct.name}`);
          setIsReplacingProduct(false);
        }, 300);
      } catch (error) {
        console.error("❌ Upgrade failed:", error);
        toast.error("Failed to upgrade product");
        setIsReplacingProduct(false);
      }
    },
    [primaryProduct, removeFromCart, addToCart],
  );

  const calculateSavings = useCallback((product) => {
    if (!product.mrp) return null;

    const savings = Number(product.mrp) - Number(product.price);

    return savings > 0 ? Math.round(savings) : null;
  }, []);

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

  const getPricePerUnit = useCallback((product) => {
    if (!product.quantity || product.quantity <= 0)
      return Math.round(Number(product.price));
    return Math.round(Number(product.price) / product.quantity);
  }, []);

  const handleProceedToCheckout = () => {
    if (!cartItems.length) {
      toast.error("Add at least one product before checkout.");
      return;
    }
    onClose();
    navigate("/checkout");
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      (async () => {
        try {
          await syncCart();
        } catch (e) {}
      })();
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen, syncCart]);

  // Whether to render the recommendations section at all.
  // Completely hidden (no empty container) when there are no recommendations.
  const showRecommendations = recommendations.length > 0 && !isReplacingProduct;

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Cart Drawer */}
      <aside
        className={`fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-bree-border transition-transform duration-300 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-bree-border flex-shrink-0">
          <h2 className="text-xl font-bold text-bree-text-primary">
            Your Cart
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-bree-bg flex items-center justify-center hover:bg-bree-border transition-colors"
            aria-label="Close cart"
          >
            <X className="w-5 h-5 text-bree-text-primary" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Pending changes banner */}
          {pendingChanges && pendingChanges.length > 0 && (
            <div className="mx-5 mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              Product price/stock updates were detected and your cart was
              updated.
            </div>
          )}
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center px-6">
              <ShoppingBag className="w-16 h-16 text-bree-border" />
              <h3 className="text-lg font-semibold text-bree-text-primary">
                Your cart is empty
              </h3>
              <p className="text-sm text-bree-text-secondary">
                Add products from the shop and they will appear here.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  navigate("/shop");
                }}
                className="rounded-full mt-2"
              >
                Continue Shopping
              </Button>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-0">
              {/* Cart Items */}
              <div className="space-y-2">
                {cartItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-bree-border bg-bree-bg p-3 hover:border-bree-primary/30 transition-all duration-300 hover:shadow-sm"
                    style={{
                      animation: `fadeInUp 0.4s ease-out ${index * 0.1}s both`,
                    }}
                  >
                    <div className="flex gap-3">
                      {/* Product Image */}
                      <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center flex-shrink-0 overflow-hidden border border-bree-border/50">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-contain p-1"
                        />
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-bree-text-primary truncate">
                          {item.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-bree-text-secondary">
                            ₹{Number(item.price).toLocaleString("en-IN")}
                          </p>
                          {item._priceChanged && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                              Price Updated
                            </span>
                          )}
                          {item._unavailable && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              Unavailable
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-bree-text-secondary">
                          {getShippingDisplay(item)}
                        </div>

                        {/* Quantity Controls */}
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                            className="w-7 h-7 rounded-full bg-white border border-bree-border flex items-center justify-center hover:bg-bree-border/20 transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-semibold w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                            className="w-7 h-7 rounded-full bg-white border border-bree-border flex items-center justify-center hover:bg-bree-border/20 transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-bree-error hover:text-red-600 transition-colors self-start pt-1"
                        aria-label="Remove item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Recommendations Section ────────────────────────────────
                  Only rendered when recommendations.length > 0.
                  Completely absent from DOM when empty — no empty containers. */}
              {showRecommendations && (
                <div
                  className="space-y-2 mt-4 pt-3 border-t border-bree-border/30"
                  style={{ animation: "fadeInUp 0.5s ease-out 0.3s both" }}
                >
                  <div className="flex items-center gap-2 pt-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <p className="text-xs font-medium text-bree-text-secondary">
                      Upgrade your wellness journey
                    </p>
                  </div>

                  {recommendations.map((rec, index) => {
                    const savings = calculateSavings(rec);
                    const pricePerUnit = getPricePerUnit(rec);

                    return (
                      <button
                        key={rec.id}
                        onClick={() => handleUpgradeProduct(rec)}
                        disabled={isReplacingProduct}
                        className="w-full rounded-2xl border-2 border-bree-primary/20 bg-gradient-to-r from-bree-primary/5 to-transparent p-3 text-left hover:border-bree-primary hover:bg-gradient-to-r hover:from-bree-primary/10 hover:to-transparent transition-all duration-300 group disabled:opacity-50 active:scale-95"
                        style={{
                          animation: `fadeInUp 0.5s ease-out ${0.4 + index * 0.1}s both`,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Product Image */}
                          <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center flex-shrink-0 overflow-hidden border border-bree-border/50">
                            <img
                              src={rec.image}
                              alt={rec.name}
                              className="w-full h-full object-contain p-1"
                            />
                          </div>

                          {/* Product Details */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-bree-text-primary truncate">
                              {rec.name}
                            </h4>
                            <p className="text-xs text-bree-text-secondary mt-0.5">
                              ₹{pricePerUnit}/bottle
                              {savings ? ` · Save ₹${savings}` : ""}
                            </p>
                          </div>

                          {/* Price and Arrow */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="font-bold text-sm text-bree-primary">
                                ₹{Number(rec.price).toLocaleString("en-IN")}
                              </p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-bree-primary group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — only visible when cart has items */}
        {cartItems.length > 0 && (
          <div className="border-t border-bree-border bg-white px-5 py-4 space-y-2.5 flex-shrink-0">
            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-bree-text-secondary">
                Subtotal
              </span>
              <span className="text-base font-bold text-bree-text-primary">
                ₹{cartTotal.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Proceed to Checkout */}
            <Button
              onClick={handleProceedToCheckout}
              disabled={isReplacingProduct}
              className="w-full rounded-full bg-bree-primary hover:bg-bree-primary-hover text-white font-semibold py-2.5 transition-all duration-300 disabled:opacity-60 text-sm"
            >
              Proceed to Checkout
            </Button>

            {/* Clear Cart */}
            <button
              onClick={clearCart}
              className="w-full text-xs font-medium text-bree-text-secondary hover:text-bree-text-primary transition-colors py-1.5"
            >
              Clear Cart
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default CartDrawer;
