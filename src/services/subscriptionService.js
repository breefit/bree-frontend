import axios from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api";

export const createSubscription = async ({
  productId,
  frequency,
  shippingAddress,
  addressId,
  contactInfo,
  reminders = [],
}) => {
  const payload = {
    items: [{ product_id: productId, quantity: 1 }],
    frequency,
    shippingAddress,
    addressId,
    customerName: contactInfo.name,
    email: contactInfo.email,
    mobileNumber: contactInfo.phone,
    reminders,
  };

  const response = await axios.post("/api/subscriptions/create", payload);
  return response.data;
};

export const getSubscriptions = async () => {
  const response = await axios.get("/api/subscriptions/my");
  return response.data;
};

export const getSubscription = async (subscriptionId) => {
  const subscriptions = await getSubscriptions();

  return (
    subscriptions.find(
      (item) =>
        item.order_id === subscriptionId ||
        item.razorpay_subscription_id === subscriptionId,
    ) || null
  );
};

export const pauseSubscription = async (subscriptionId) => {
  const response = await axios.post(
    `/api/subscriptions/${subscriptionId}/pause`,
  );
  return response.data;
};

export const resumeSubscription = async (subscriptionId) => {
  const response = await axios.post(
    `/api/subscriptions/${subscriptionId}/resume`,
  );
  return response.data;
};

export const cancelSubscription = async (subscriptionId) => {
  const response = await axios.post(
    `/api/subscriptions/${subscriptionId}/cancel`,
  );
  return response.data;
};
