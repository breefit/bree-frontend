import { render, act } from "@testing-library/react";

/**
 * PHASE 3 — Medium Issue #31: syncCart's catch block used to return the
 * exact same shape as a successful no-op sync ({anyChange:false,
 * items:[]}), making a failed price/availability revalidation
 * indistinguishable from "nothing changed" — a customer could proceed
 * through checkout on a cart that was never actually revalidated, with no
 * indication anything went wrong. Fixed to add a `syncFailed: true` flag
 * callers can check.
 *
 * Drives the REAL CartProvider/useCart against a mocked @/lib/api (no
 * network) — not a regex over the source.
 */

const mockPost = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: (...args) => mockPost(...args) },
}));

import { CartProvider, useCart } from "./CartContext";

const TestConsumer = ({ onReady }) => {
  const cart = useCart();
  onReady(cart);
  return null;
};

const renderCart = () => {
  let cart;
  render(
    <CartProvider>
      <TestConsumer onReady={(c) => (cart = c)} />
    </CartProvider>,
  );
  return () => cart;
};

beforeEach(() => {
  mockPost.mockReset();
  localStorage.clear();
});

test("syncCart returns syncFailed:true (not indistinguishable from a no-op success) when the backend call throws", async () => {
  const getCart = renderCart();

  act(() => {
    getCart().addToCart({ id: "prod-1", name: "Test Product", price: 100, image: "" }, 1);
  });

  mockPost.mockRejectedValueOnce(new Error("network error"));

  let result;
  await act(async () => {
    result = await getCart().syncCart();
  });

  expect(result.syncFailed).toBe(true);
  expect(result.anyChange).toBe(false);
});

test("syncCart regression: a successful sync with no changes still returns syncFailed as falsy", async () => {
  const getCart = renderCart();

  act(() => {
    getCart().addToCart({ id: "prod-1", name: "Test Product", price: 100, image: "" }, 1);
  });

  mockPost.mockResolvedValueOnce({ data: { items: [] } });

  let result;
  await act(async () => {
    result = await getCart().syncCart();
  });

  expect(result.syncFailed).toBeFalsy();
});
