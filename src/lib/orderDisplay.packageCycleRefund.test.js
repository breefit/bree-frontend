import {
  isPackageCycleRefundUnsupported,
  PACKAGE_CYCLE_REFUND_UNSUPPORTED_MESSAGE,
} from "./orderDisplay";

test("isPackageCycleRefundUnsupported: only a package order with no payment of its own", () => {
  expect(isPackageCycleRefundUnsupported({ parent_package_id: "p", has_refundable_payment: 0 })).toBe(true);
  expect(isPackageCycleRefundUnsupported({ parent_package_id: "p", has_refundable_payment: false })).toBe(true);
  expect(isPackageCycleRefundUnsupported({ parent_package_id: "p", has_refundable_payment: 1 })).toBe(false);
  expect(isPackageCycleRefundUnsupported({ parent_package_id: null, has_refundable_payment: 0 })).toBe(false);
  // An older API response without the flag is never blocked client-side.
  expect(isPackageCycleRefundUnsupported({ parent_package_id: "p" })).toBe(false);
  expect(isPackageCycleRefundUnsupported(null)).toBe(false);
});

test("the admin message matches the backend's PACKAGE_CYCLE_REFUND_UNSUPPORTED message", () => {
  expect(PACKAGE_CYCLE_REFUND_UNSUPPORTED_MESSAGE).toBe(
    "Refund processing for package-cycle orders requires the original package payment mapping and is not currently supported.",
  );
});
