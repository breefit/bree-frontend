import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/**
 * Product visibility ("Show in User UI") — admin Products table toggle.
 *
 * Drives the real Products component: the Visibility column/switch, the
 * PATCH /api/admin/products/:id/visibility call, the in-flight guard, the
 * response being authoritative, and the success/failure toasts.
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

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  __esModule: true,
  toast: {
    success: (...args) => mockToastSuccess(...args),
    error: (...args) => mockToastError(...args),
  },
}));

const mockGet = jest.fn();
const mockPatch = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    patch: (...args) => mockPatch(...args),
    delete: jest.fn(),
  },
  getApiErrorMessage: (err) => err?.message || "Something went wrong.",
}));

import Products from "./Products";

const visibleProduct = {
  id: "prod-visible",
  name: "30-Pack Monthly Subscription",
  price: 999,
  mrp: 1299,
  is_active: 1,
  is_visible: 1,
};
const hiddenProduct = {
  id: "prod-hidden",
  name: "7-Day Trial",
  price: 199,
  mrp: 249,
  is_active: 1,
  is_visible: 0,
};

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockGet.mockResolvedValue({ data: { products: [visibleProduct, hiddenProduct] } });
});

// Desktop table and mobile cards both render (CSS hides one); scope to the table.
const renderTable = async () => {
  render(<Products />);
  const table = await screen.findByRole("table");
  return within(table);
};

test("renders a Visibility column with one switch per product", async () => {
  const table = await renderTable();
  expect(table.getByRole("columnheader", { name: "Visibility" })).toBeTruthy();
  expect(table.getAllByRole("switch")).toHaveLength(2);
});

test("visible product renders ON with 'Visible' and an accessible hide label", async () => {
  const table = await renderTable();
  const sw = table.getByRole("switch", { name: "Hide 30-Pack Monthly Subscription from customer UI" });
  expect(sw.getAttribute("aria-checked")).toBe("true");
  expect(sw.textContent).toContain("Visible");
  expect(sw.getAttribute("title")).toBe("Hide 30-Pack Monthly Subscription from customer UI");
});

test("hidden product stays in the admin list and renders OFF with 'Hidden'", async () => {
  const table = await renderTable();
  expect(table.getByText("7-Day Trial")).toBeTruthy();
  const sw = table.getByRole("switch", { name: "Show 7-Day Trial in customer UI" });
  expect(sw.getAttribute("aria-checked")).toBe("false");
  expect(sw.textContent).toContain("Hidden");
});

test("product without is_visible (pre-migration response) is treated as visible", async () => {
  mockGet.mockResolvedValue({ data: { products: [{ ...visibleProduct, is_visible: undefined }] } });
  const table = await renderTable();
  expect(table.getByRole("switch").getAttribute("aria-checked")).toBe("true");
});

test("clicking sends the desired final state, disables the switch while in flight, and ignores extra clicks", async () => {
  let resolvePatch;
  mockPatch.mockImplementation(() => new Promise((resolve) => { resolvePatch = resolve; }));
  const table = await renderTable();
  const sw = table.getByRole("switch", { name: /Hide 30-Pack/ });

  fireEvent.click(sw);
  fireEvent.click(sw);
  fireEvent.click(sw);

  expect(mockPatch).toHaveBeenCalledTimes(1);
  expect(mockPatch).toHaveBeenCalledWith("/api/admin/products/prod-visible/visibility", { is_visible: false });
  await waitFor(() => expect(sw.disabled).toBe(true));
  expect(sw.textContent).toContain("Saving…");

  resolvePatch({ data: { ...visibleProduct, is_visible: 0 } });

  await waitFor(() => expect(table.getByRole("switch", { name: /Show 30-Pack/ }).disabled).toBe(false));
  expect(table.getByRole("switch", { name: /Show 30-Pack/ }).getAttribute("aria-checked")).toBe("false");
  expect(mockToastSuccess).toHaveBeenCalledWith("30-Pack Monthly Subscription is now hidden from the customer UI.");
});

test("making a hidden product visible shows the visible toast", async () => {
  mockPatch.mockResolvedValue({ data: { ...hiddenProduct, is_visible: 1 } });
  const table = await renderTable();
  fireEvent.click(table.getByRole("switch", { name: /Show 7-Day Trial/ }));
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("7-Day Trial is now visible to customers."));
  expect(mockPatch).toHaveBeenCalledWith("/api/admin/products/prod-hidden/visibility", { is_visible: true });
  expect(table.getByRole("switch", { name: /Hide 7-Day Trial/ }).getAttribute("aria-checked")).toBe("true");
});

test("server response is authoritative even if it disagrees with the requested state", async () => {
  mockPatch.mockResolvedValue({ data: { ...visibleProduct, is_visible: 1 } });
  const table = await renderTable();
  fireEvent.click(table.getByRole("switch", { name: /Hide 30-Pack/ }));
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  expect(table.getByRole("switch", { name: /30-Pack/ }).getAttribute("aria-checked")).toBe("true");
});

test("failure: error toast, state unchanged, switch re-enabled, list still populated", async () => {
  mockPatch.mockRejectedValue(new Error("Network down"));
  const table = await renderTable();
  const sw = table.getByRole("switch", { name: /Hide 30-Pack/ });
  fireEvent.click(sw);
  await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Unable to update product visibility. Please try again."));
  expect(sw.getAttribute("aria-checked")).toBe("true");
  expect(sw.disabled).toBe(false);
  expect(table.getAllByRole("switch")).toHaveLength(2);
  expect(mockToastSuccess).not.toHaveBeenCalled();
});

test("mobile cards render a usable switch for every product too", async () => {
  render(<Products />);
  await screen.findByRole("table");
  // 2 in the desktop table + 2 in the mobile cards
  expect(screen.getAllByRole("switch")).toHaveLength(4);
  const mobileSwitches = screen.getAllByRole("switch", { name: "Show 7-Day Trial in customer UI" });
  expect(mobileSwitches).toHaveLength(2);
});
