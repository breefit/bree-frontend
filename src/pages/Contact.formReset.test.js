import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";

/**
 * PHASE 3 — Medium Issue #30: the Contact form used to reset (clear the
 * typed name/email/message) unconditionally after submit, even when the
 * backend save failed — leaving only the WhatsApp deep-link as a fallback,
 * which silently loses the message if the popup is blocked or missed. Fixed
 * to only reset on a confirmed successful save.
 *
 * Drives the REAL Contact component end-to-end: render, fill the form,
 * submit, and assert whether the fields are cleared — for both a failing
 * and a succeeding backend response. axios and window.open are mocked (no
 * real network call); sonner's toast is mocked to avoid unrelated
 * act()-warnings from its animation/portal internals.
 */

const mockPost = jest.fn();
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: (...args) => mockPost(...args) },
  getApiErrorMessage: () => "Something went wrong.",
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import Contact from "./Contact";

const renderContact = () =>
  render(
    <HelmetProvider>
      <Contact />
    </HelmetProvider>,
  );

const fillAndSubmit = async () => {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Jane Doe" } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
  fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Hello, this is my message" } });

  fireEvent.click(screen.getByRole("button", { name: /send message/i }));

  await waitFor(() => expect(mockPost).toHaveBeenCalled());
};

beforeEach(() => {
  mockPost.mockReset();
  window.open = jest.fn();
});

test("on a FAILED backend save, the typed message is preserved, not cleared", async () => {
  mockPost.mockRejectedValueOnce(new Error("network error"));

  renderContact();
  await fillAndSubmit();

  await waitFor(() => expect(window.open).toHaveBeenCalled());

  expect(screen.getByLabelText(/message/i).value).toBe("Hello, this is my message");
  expect(screen.getByLabelText(/name/i).value).toBe("Jane Doe");
});

test("on a SUCCESSFUL backend save, the form is cleared (existing behavior preserved)", async () => {
  mockPost.mockResolvedValueOnce({ data: { success: true } });

  renderContact();
  await fillAndSubmit();

  await waitFor(() => expect(window.open).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByLabelText(/message/i).value).toBe(""));

  expect(screen.getByLabelText(/name/i).value).toBe("");
});
