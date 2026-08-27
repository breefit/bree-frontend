import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const ProductCard = ({ product, index = 0 }) => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();

  const [isAdded, setIsAdded] = useState(false);
  // Duplicate-click guard: navigate() is effectively instant, but a fast
  // double-click on "Subscribe Now" could still fire handleSubscribe twice
  // before the route change unmounts this component.
  const isSubscribingRef = useRef(false);

  const mrp = Number(
    product.mrp ||
      product.mrp_price ||
      product.originalPrice ||
      product.price ||
      0,
  );
  const price = Number(product.price || 0);
  const discountPercentage =
    mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

  const getShippingDisplay = (productItem) => {
    const isFree =
      productItem?.is_free_shipping === true ||
      productItem?.is_free_shipping === 1 ||
      productItem?.isFreeShipping === true ||
      productItem?.isFreeShipping === 1;

    if (isFree) {
      return "✓ Free Shipping";
    }

    const hasCharge =
      productItem?.shipping_charge != null ||
      productItem?.shippingCharge != null;

    if (!hasCharge) {
      return "Shipping information unavailable";
    }

    const charge = Number(
      productItem?.shipping_charge ?? productItem?.shippingCharge ?? 0,
    );

    return Number.isFinite(charge) && charge >= 0
      ? `Shipping ₹${charge.toLocaleString("en-IN")}`
      : "Shipping information unavailable";
  };

  const shippingDisplay = getShippingDisplay(product);

  // Subscription status is determined solely by the database field.
  // Supports both snake_case (is_subscription) and camelCase (is_subscription)
  // response shapes, and accepts both boolean true and integer 1.
  const isSubscriptionProduct =
    product.is_subscription === 1 || product.is_subscription === true;

  const handleAddToCart = () => {
    addToCart(product);

    setIsAdded(true);

    toast.success(`${product.name} added to cart`);

    setTimeout(() => setIsAdded(false), 2000);
  };

  const handleSubscribe = () => {
    if (isSubscribingRef.current) return;
    isSubscribingRef.current = true;

    const subscriptionPayload = {
      product,
      frequency: 30,
      subscriptionPrice: price,
    };

    if (!user) {
      toast.error("Please log in to continue with your subscription.");
      navigate("/login", {
        state: {
          from: {
            pathname: "/subscription-checkout",
            state: subscriptionPayload,
          },
        },
      });
      isSubscribingRef.current = false;
      return;
    }

    navigate("/subscription-checkout", { state: subscriptionPayload });
    isSubscribingRef.current = false;
  };

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 30,
      }}
      whileInView={{
        opacity: 1,
        y: 0,
      }}
      viewport={{
        once: true,
        margin: "-50px",
      }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
      }}
      data-testid={`product-card-${product.id}`}
      className={`relative bg-white p-5 md:p-7 rounded-[28px] border transition-all duration-300 hover:shadow-xl ${
        product.popular ? "border-bree-primary border-2" : "border-bree-border"
      }`}
    >
      {/* Popular Badge */}

      {product.popular === 1 && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-bree-primary text-white px-4 py-1.5 rounded-full text-[10px] md:text-xs font-semibold tracking-wide shadow-md whitespace-nowrap">
            MOST POPULAR
          </span>
        </div>
      )}

      {/* Product Image */}
      <div className="relative h-40 md:h-52 mb-5 md:mb-6 flex items-center justify-center rounded-3xl bg-bree-bg overflow-hidden">
        <img
          src={
            product.image && product.image.trim()
              ? product.image
              : "/images/default-product.png"
          }
          alt={product.name}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/images/default-product.png";
          }}
          className="h-32 md:h-44 w-auto object-contain relative z-10 hover:scale-105 transition-transform duration-500"
        />
      </div>

      {/* Product Info */}
      <div className="text-center">
        {/* Product Type */}
        <span className="text-[10px] md:text-xs tracking-[0.18em] uppercase font-semibold text-bree-primary">
          {product.quantity}
          -Day Wellness Pack
        </span>

        {/* Product Name */}
        <h3 className="font-outfit text-3xl md:text-[28px] leading-tight font-semibold text-bree-text-primary mt-3">
          {product.name}
        </h3>

        {/* Description */}
        <p className="text-bree-text-secondary text-base md:text-lg mt-2">
          {product.description}
        </p>

        {/* Features */}
        <ul className="space-y-2 pt-5">
          {(Array.isArray(product.features)
            ? product.features
            : typeof product.features === "string"
              ? JSON.parse(product.features || "[]")
              : []
          ).map((feature, index) => (
            <li
              key={index}
              className="flex items-center justify-center gap-2 text-sm md:text-base text-bree-text-secondary"
            >
              <Check className="w-4 h-4 text-bree-primary flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        {/* Pricing */}
        <div className="pt-6">
          {/* Price Row */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {/* Selling Price */}
            <span className="font-outfit text-2xl md:text-3xl font-bold text-bree-text-primary">
              ₹{product.price}
            </span>

            {/* MRP */}
            <span className="text-lg text-red-400 line-through">
              ₹{product.mrp}
            </span>
          </div>

          {/* Discount Badge */}
          <div className="mt-3 flex justify-center">
            <span className="bg-red-50 text-red-500 text-xs md:text-sm font-semibold px-3 py-1 rounded-full border border-red-100">
              {discountPercentage}% OFF
            </span>
          </div>

          <div className="mt-3 text-sm font-medium text-bree-text-secondary">
            {shippingDisplay}
          </div>

          {/* Per Bottle */}
          {product.quantity > 1 && (
            <div className="text-sm text-bree-text-secondary mt-3">
              (₹
              {(product.price / product.quantity).toFixed(0)}
              /bottle)
            </div>
          )}
        </div>

        {/* Product Actions */}
        {isSubscriptionProduct ? (
          <Button
            type="button"
            onClick={handleSubscribe}
            className="w-full mt-4 py-5 rounded-full text-base font-medium transition-all duration-300 bg-bree-primary hover:bg-bree-primary-hover text-white"
          >
            Subscribe Now
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleAddToCart}
            data-testid={`add-to-cart-${product.id}`}
            className={`w-full mt-6 py-5 rounded-full text-base font-medium transition-all duration-300 ${
              isAdded
                ? "bg-bree-success text-white"
                : "bg-bree-primary hover:bg-bree-primary-hover text-white"
            }`}
          >
            {isAdded ? (
              <span className="flex items-center justify-center gap-2">
                <Check className="w-5 h-5" />
                Added!
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                Add to Cart
              </span>
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default ProductCard;
