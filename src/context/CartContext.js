import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

const CartContext = createContext();

const CART_STORAGE_KEY = "bree_cart_items";

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => loadCartFromStorage());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [pendingChanges, setPendingChanges] = useState([]);
  const cartItemsRef = useRef(cartItems);

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    cartItemsRef.current = cartItems;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // ignore storage errors (private browsing, storage full)
    }
  }, [cartItems]);

  const addToCart = useCallback((product, quantity = 1) => {
    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.id === product.id);
      if (existingItem) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, ...product, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...prev, { ...product, quantity }];
    });
    setIsCartOpen(true);
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity < 1) {
      setCartItems((prev) => prev.filter((item) => item.id !== productId));
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === productId ? { ...item, quantity } : item,
      ),
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  // Sync cart with backend to validate prices and active product availability.
  const syncCart = useCallback(async () => {
    const currentCartItems = cartItemsRef.current || [];

    try {
      if (!currentCartItems.length) return { anyChange: false, items: [] };
      const payload = {
        items: currentCartItems.map((it) => ({
          id: it.id,
          price: it.price,
          quantity: it.quantity,
        })),
      };
      const axios = (await import("@/lib/api")).default;
      const res = await axios.post("/api/orders/validate-cart", payload);
      const data = res.data;
      if (data && Array.isArray(data.items)) {
        // Apply updates where price changed or the product was deactivated.
        let updated = false;
        const newCart = currentCartItems.map((it) => {
          const found = data.items.find((i) => i.id === it.id);
          if (!found) return it;
          let updatedItem = { ...it };
          if (found.priceChanged) {
            updatedItem = {
              ...updatedItem,
              price: found.currentPrice,
              _priceChanged: true,
            };
            updated = true;
          }
          if (!found.available) {
            updatedItem = {
              ...updatedItem,
              _unavailable: true,
              _available: found.available,
            };
            updated = true;
          }
          if (found.is_free_shipping !== undefined) {
            updatedItem = {
              ...updatedItem,
              is_free_shipping: found.is_free_shipping,
            };
            updated = true;
          }
          if (found.shipping_charge !== undefined) {
            updatedItem = {
              ...updatedItem,
              shipping_charge: found.shipping_charge,
              shippingCharge: found.shipping_charge,
            };
            updated = true;
          }
          if (found.estimated_delivery !== undefined) {
            updatedItem = {
              ...updatedItem,
              estimated_delivery: found.estimated_delivery,
              estimatedDelivery: found.estimated_delivery,
            };
            updated = true;
          }
          // update image if provided
          if (found.image && !updatedItem.image) {
            updatedItem = { ...updatedItem, image: found.image };
            updated = true;
          }
          return updatedItem;
        });

        if (updated) {
          setCartItems(newCart);
          setPendingChanges(
            data.items.filter((i) => i.priceChanged || !i.available),
          );
          setLastSync({ at: Date.now(), result: data });
        } else {
          setPendingChanges([]);
          setLastSync({ at: Date.now(), result: data });
        }

        return data;
      }
      return { anyChange: false, items: [] };
    } catch (err) {
      console.error("syncCart error:", err);
      return { anyChange: false, items: [] };
    }
  }, []);

  // Refresh cart on page load
  useEffect(() => {
    (async () => {
      try {
        await syncCart();
      } catch (e) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX: Use Number() to ensure price is always treated as a number —
  // prevents NaN when price comes as a string from backend
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );

  const cartShipping = cartItems.reduce((sum, item) => {
    const isFreeShipping =
      item.is_free_shipping === true ||
      item.is_free_shipping === 1 ||
      item.isFreeShipping === true ||
      item.isFreeShipping === 1 ||
      item.free_shipping === true ||
      item.free_shipping === 1;

    if (isFreeShipping) return sum;

    const shippingCharge = Number(
      item.shipping_charge ?? item.shippingCharge ?? 0,
    );
    return sum + (Number.isFinite(shippingCharge) ? shippingCharge : 0);
  }, 0);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // console.log("[CartContext] cartItems", cartItems);
  // console.log("[CartContext] cartShipping", cartShipping);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
        cartShipping,
        isCartOpen,
        setIsCartOpen,
        syncCart,
        lastSync,
        pendingChanges,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
