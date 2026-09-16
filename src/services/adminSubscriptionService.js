import axios from "@/lib/api";

const API = "/api/admin";
const AUTH = { withCredentials: true };

export const fetchAdminSubscriptions = (params = {}) =>
  axios
    .get(`${API}/subscriptions`, {
      ...AUTH,
      params,
    })
    .then((res) => res.data);

export const fetchAdminSubscriptionDetails = (id) =>
  axios.get(`${API}/subscriptions/${id}`, AUTH).then((res) => res.data);

export const pauseAdminSubscription = (id) =>
  axios
    .patch(`${API}/subscriptions/${id}/pause`, {}, AUTH)
    .then((res) => res.data);

export const resumeAdminSubscription = (id) =>
  axios
    .patch(`${API}/subscriptions/${id}/resume`, {}, AUTH)
    .then((res) => res.data);

export const cancelAdminSubscription = (id, reason) =>
  axios
    .patch(`${API}/subscriptions/${id}/cancel`, { reason }, AUTH)
    .then((res) => res.data);

export const fetchAdminSubscriptionAnalytics = () =>
  axios.get(`${API}/subscriptions/analytics`, AUTH).then((res) => res.data);

export const fetchAdminUpcomingRenewals = () =>
  axios
    .get(`${API}/subscriptions/upcoming-renewals`, AUTH)
    .then((res) => res.data);

export const fetchAdminFailedRenewals = () =>
  axios
    .get(`${API}/subscriptions/failed-renewals`, AUTH)
    .then((res) => res.data);

// FIX (ISSUE-012): Model B (pay-once, ship-monthly packages) — a distinct
// business model from the recurring-billing subscriptions above, never
// converted into one, and never queried by any of the functions above.
export const fetchAdminPackagePurchases = (params = {}) =>
  axios
    .get(`${API}/subscriptions/packages`, {
      ...AUTH,
      params,
    })
    .then((res) => res.data);
