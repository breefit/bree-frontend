import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * PHASE 4 — LOW-04: the admin product delete button fired
 * `DELETE /api/admin/products/:id` immediately on click, with no
 * confirmation and no duplicate-click guard. Fixed to: (1) require a
 * `window.confirm` naming the product before deleting, matching the
 * existing convention already used elsewhere in the admin panel (e.g.
 * Testimonialadmin.js's delete confirm), and (2) disable the clicked row's
 * delete button while the request is in flight.
 *
 * This test drives the real Products component end-to-end.
 */

jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));
jest.mock("@/components/admin/ProductModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/components/admin/ProductRelationsModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("sonner", () => ({
  __esModule: true,
  toast: { success: () => {}, error: () => {} },
}));

const mockGet = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/lib/api", () => {
  const getApiErrorMessage = (err) =>
    err?.response?.data?.message || err?.message || "Something went wrong.";
  return {
    __esModule: true,
    default: {
      get: (...args) => mockGet(...args),
      delete: (...args) => mockDelete(...args),
    },
    getApiErrorMessage,
  };
});

import Products from "./Products";

const product = {
  id: "prod-1",
  name: "30-Day Wellness Pack",
  price: 999,
  mrp: 1299,
  stock: 10,
  is_active: true,
};

let resolveDelete;

beforeEach(() => {
  mockGet.mockReset();
  mockDelete.mockReset();
  mockGet.mockResolvedValue({ data: { products: [product] } });
  window.confirm = jest.fn();
});

test("LOW-04: clicking delete without confirming never calls the DELETE endpoint", async () => {
  window.confirm.mockReturnValue(false);
  render(<Products />);

  await waitFor(() => expect(screen.getAllByText("30-Day Wellness Pack").length).toBeGreaterThan(0));

  fireEvent.click(screen.getAllByTitle("Delete product")[0]);

  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(window.confirm.mock.calls[0][0]).toMatch(/30-Day Wellness Pack/);
  expect(mockDelete).not.toHaveBeenCalled();
});

test("LOW-04: confirming deletion calls DELETE exactly once, and a second click while in flight is a no-op", async () => {
  window.confirm.mockReturnValue(true);
  mockDelete.mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));
  render(<Products />);

  await waitFor(() => expect(screen.getAllByText("30-Day Wellness Pack").length).toBeGreaterThan(0));

  const deleteButton = screen.getAllByTitle("Delete product")[0];
  fireEvent.click(deleteButton);
  // A second click while the confirm+delete flow is already in flight for
  // this row must not fire a second confirm dialog or a second request.
  fireEvent.click(deleteButton);

  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(deleteButton.disabled).toBe(true);

  resolveDelete({});
  await waitFor(() => expect(screen.queryByText("30-Day Wellness Pack")).toBeNull());
});
