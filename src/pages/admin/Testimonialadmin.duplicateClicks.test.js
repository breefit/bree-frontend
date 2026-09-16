import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * PHASE 4 — LOW-05: testimonial Approve/Reject/Delete buttons previously had
 * no duplicate-click guard — the page's shared `loading` state was set
 * inside each handler but never wired to any button's `disabled` prop, so
 * rapid double-clicking could fire the same PATCH/DELETE request twice.
 *
 * Fixed with a per-item `actioningId` state: a button is disabled only for
 * the specific testimonial currently being acted on, and a second click on
 * the SAME button while its request is in flight is a no-op.
 *
 * This test drives the real TestimonialsAdmin component and proves the
 * network call fires exactly once even when the button is clicked twice in
 * quick succession before the first request resolves.
 */

jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
  },
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { success: () => {}, error: () => {} },
}));

import TestimonialsAdmin from "./Testimonialadmin";

const testimonial = {
  id: "testi-1",
  name: "Jane Doe",
  role: "Customer",
  rating: 5,
  text: "Great product",
  status: "pending",
  created_at: new Date().toISOString(),
};

let resolveApprove;

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
  mockDelete.mockReset();
  mockGet.mockResolvedValue({ data: { testimonials: [testimonial], total: 1 } });
  mockPatch.mockImplementation(
    () => new Promise((resolve) => { resolveApprove = resolve; }),
  );
});

test("LOW-05: clicking Approve twice in quick succession before the first request resolves only fires ONE PATCH request", async () => {
  render(<TestimonialsAdmin />);

  await waitFor(() => expect(screen.getByText("Jane Doe")).toBeTruthy());

  const approveButton = screen.getByRole("button", { name: "Approve" });

  fireEvent.click(approveButton);
  fireEvent.click(approveButton);
  fireEvent.click(approveButton);

  expect(mockPatch).toHaveBeenCalledTimes(1);
  expect(approveButton.disabled).toBe(true);

  await act(async () => {
    resolveApprove({ data: { success: true } });
    await Promise.resolve();
    await Promise.resolve();
  });
});

test("LOW-05: the Approve button re-enables once the request completes, allowing a genuine follow-up action", async () => {
  // fetchTestimonials (called again at the end of a successful approve)
  // toggles the page's own `loading` state around its own GET request,
  // which unmounts/remounts the list — so the button must be re-queried
  // from the DOM after that settles, not reused from before the click.
  mockPatch.mockResolvedValueOnce({ data: { success: true } });
  render(<TestimonialsAdmin />);

  await waitFor(() => expect(screen.getByText("Jane Doe")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));

  await waitFor(() => {
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" }).disabled).toBe(false);
  });
  expect(mockPatch).toHaveBeenCalledTimes(1);
});
