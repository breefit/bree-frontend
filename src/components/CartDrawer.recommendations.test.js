import { render, screen, waitFor } from "@testing-library/react";

/**
 * Product visibility — cart suggestions.
 *
 * The backend filters hidden/deleted products out of
 * GET /api/products/:id/recommendations. The drawer must render exactly
 * what it gets: an empty list means no "Upgrade your wellness journey"
 * section at all (no empty container, no placeholder/broken card).
 */

const mockGet = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args) },
  getApiErrorMessage: (err) => err?.message || "Something went wrong.",
}));
jest.mock("sonner", () => ({ __esModule: true, toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("react-router-dom", () => ({ __esModule: true, useNavigate: () => jest.fn() }));

const cartItem = { id: "prod-a", name: "7-Day Trial", price: 199, mrp: 249, quantity: 1, image: "a.png" };
jest.mock("@/context/CartContext", () => ({
  __esModule: true,
  useCart: () => ({
    cartItems: [cartItem],
    cartTotal: 199,
    addToCart: jest.fn(),
    removeFromCart: jest.fn(),
    updateQuantity: jest.fn(),
    clearCart: jest.fn(),
    syncCart: jest.fn().mockResolvedValue({ anyChange: false, items: [] }),
    pendingChanges: [],
  }),
}));

import CartDrawer from "./CartDrawer";

beforeEach(() => mockGet.mockReset());

test("renders only the recommendations the API returns (hidden products already filtered server-side)", async () => {
  mockGet.mockResolvedValue({
    data: [{ id: "prod-c", name: "30-Pack Monthly", price: 999, mrp: 1299, quantity: 30, image: "c.png" }],
  });
  render(<CartDrawer isOpen onClose={() => {}} />);

  expect(await screen.findByText("30-Pack Monthly")).toBeTruthy();
  expect(mockGet).toHaveBeenCalledWith("/api/products/prod-a/recommendations", expect.any(Object));
  expect(screen.getByText("Upgrade your wellness journey")).toBeTruthy();
});

test("empty recommendation list (all suggestions hidden) renders no section and no broken card", async () => {
  mockGet.mockResolvedValue({ data: [] });
  render(<CartDrawer isOpen onClose={() => {}} />);

  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByText("Upgrade your wellness journey")).toBeNull();
  // Only the cart item's own image — no suggestion card images.
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

test("a failed recommendations request renders no section", async () => {
  mockGet.mockRejectedValue(new Error("boom"));
  render(<CartDrawer isOpen onClose={() => {}} />);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByText("Upgrade your wellness journey")).toBeNull();
});
