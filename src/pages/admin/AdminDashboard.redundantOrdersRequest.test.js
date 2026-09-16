import { render, screen, waitFor } from "@testing-library/react";

// jsdom has no IntersectionObserver — StatCard (rendered by AdminDashboard)
// uses one purely for a scroll-in animation trigger, unrelated to this fix.
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * PHASE 4 — LOW-22: AdminDashboard.js used to fire a redundant
 * `GET /api/admin/orders?limit=5` request on every load and every
 * order-sync tick, even though `GET /api/admin/dashboard` already returns
 * `recent_orders` (the backend always includes it — confirmed via
 * admin/dashboardController.js). The separate orders request's response
 * was only ever used as a fallback that could never actually trigger.
 *
 * This test drives the real AdminDashboard component and proves the
 * redundant request is gone: axios.get is asserted to be called exactly
 * once per data-refresh (only `/dashboard` and `/bulk-bookings/stats`,
 * never `/orders?limit=5`), and the dashboard still renders the recent
 * orders it received from `/dashboard`.
 *
 * react-router-dom's real package cannot currently be resolved under this
 * project's Jest/react-router-dom combination outside a real app build
 * (a pre-existing toolchain gap — see Orders.approveRefund.test.js's
 * identical AdminLayout-mocking comment for the same root cause), so
 * `Link` is mocked here to a plain anchor rather than importing the real
 * react-router-dom, and AdminLayout is mocked out the same established way.
 */

jest.mock("react-router-dom", () => ({
  __esModule: true,
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}));

jest.mock("@/components/admin/AdminLayout", () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
}));

jest.mock("@/hooks/useOrdersSync", () => ({
  __esModule: true,
  default: () => {},
}));

const mockGet = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args) },
}));

import AdminDashboard from "./AdminDashboard";

const dashboardResponse = {
  data: {
    total_orders: 12,
    total_revenue: 45000,
    total_customers: 8,
    pending_orders: 2,
    total_bulk_bookings: 1,
    recent_orders: [
      { id: "order-1", order_number: "BRE-1001", total: 999, order_status: "paid" },
    ],
  },
};

const bulkStatsResponse = { data: { data: { total: 1 } } };

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((url) => {
    if (url === "/api/admin/dashboard") return Promise.resolve(dashboardResponse);
    if (url === "/api/admin/bulk-bookings/stats") return Promise.resolve(bulkStatsResponse);
    return Promise.reject(new Error(`Unexpected axios.get call in AdminDashboard test: ${url}`));
  });
});

test("LOW-22: AdminDashboard never requests GET /orders?limit=5 — only /dashboard and /bulk-bookings/stats", async () => {
  render(<AdminDashboard />);

  await waitFor(() => {
    expect(mockGet).toHaveBeenCalledWith("/api/admin/dashboard", { withCredentials: true });
  });

  const calledUrls = mockGet.mock.calls.map((call) => call[0]);
  expect(calledUrls).not.toContain("/api/admin/orders?limit=5");
  expect(calledUrls.filter((u) => u.includes("/orders"))).toEqual([]);
  expect(calledUrls).toEqual([
    "/api/admin/dashboard",
    "/api/admin/bulk-bookings/stats",
  ]);
});

test("LOW-22: recent orders from /dashboard's own recent_orders field still render correctly", async () => {
  render(<AdminDashboard />);

  await waitFor(() => {
    expect(screen.getByText(/BRE-1001/i)).toBeTruthy();
  });
});
