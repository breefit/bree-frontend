import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// DESIGN DECISION: This file uses snake_case for all DB-mapped keys
// (is_subscription, journey_level, show_recommendations) so they match
// the column names exactly and no camelCase conversion is ever needed.

const EMPTY_FORM = {
  name: "",
  category: "",
  price: "",
  mrp: "",
  image: "",
  description: "",
  quantity: "",
  features: "",
  is_subscription: false,
  popular: false,
  displayOrder: "",
  journey_level: "", // 0 = unclassified; 1–4 = trial→annual
  show_recommendations: true, // hide recommendations for this product?
  is_free_shipping: true,
  shipping_charge: "",
  estimated_delivery: "3–7 Business Days",
  is_recurring_package: false, // pay once, ship N times — distinct from is_subscription
  package_duration_months: "", // number of fulfillment cycles
  package_fulfillment_interval_days: "30", // gap between cycles
};

const JOURNEY_LEVEL_OPTIONS = [
  { value: "", label: "— Select Journey Level —" },
  { value: "1", label: "Level 1 — Trial (7-Day)" },
  { value: "2", label: "Level 2 — Monthly Pack / Subscription" },
  { value: "3", label: "Level 3 — 6-Month Supply" },
  { value: "4", label: "Level 4 — 1-Year Pack (highest)" },
];

const validate = (form, imageFile, isEdit) => {
  const errors = {};
  if (!form.name.trim()) errors.name = "Product name is required";
  if (!form.category.trim()) errors.category = "Category is required";
  if (!form.mrp) errors.mrp = "MRP is required";
  if (!form.price) errors.price = "Selling price is required";
  if (!form.quantity) errors.quantity = "Quantity required";
  if (!form.description.trim()) errors.description = "Description required";
  if (!isEdit && !form.image && !imageFile) {
    errors.image = "Product image is required";
  }
  if (form.is_recurring_package) {
    const duration = Number(form.package_duration_months);
    if (
      !form.package_duration_months ||
      !Number.isInteger(duration) ||
      duration < 1
    ) {
      errors.package_duration_months =
        "Enter the number of fulfillment cycles (a positive whole number)";
    }
    const interval = Number(form.package_fulfillment_interval_days);
    if (
      form.package_fulfillment_interval_days &&
      (!Number.isInteger(interval) || interval < 1)
    ) {
      errors.package_fulfillment_interval_days =
        "Interval must be a positive whole number of days";
    }
  }
  return errors;
};

const ProductModal = ({ open, onClose, onSave, initial = null }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileRef = useRef();
  const isEdit = !!initial;

  useEffect(() => {
    if (open) {
      if (initial) {
        // Normalise boolean fields so checkboxes always reflect DB state
        const is_subscription_bool =
          initial.is_subscription === 1 ||
          initial.is_subscription === true ||
          initial.isSubscription === 1 ||
          initial.isSubscription === true;

        // show_recommendations defaults to true (1) when not present
        const show_recommendations_bool =
          initial.show_recommendations === undefined
            ? true
            : initial.show_recommendations !== 0 &&
              initial.show_recommendations !== false &&
              initial.show_recommendations !== "0" &&
              initial.show_recommendations !== "false";

        const is_recurring_package_bool =
          initial.is_recurring_package === 1 ||
          initial.is_recurring_package === true;

        const initialForm = {
          ...EMPTY_FORM,
          ...initial,
          is_subscription: is_subscription_bool,
          show_recommendations: show_recommendations_bool,
          is_recurring_package: is_recurring_package_bool,
          package_duration_months:
            initial.package_duration_months !== undefined &&
            initial.package_duration_months !== null
              ? String(initial.package_duration_months)
              : "",
          package_fulfillment_interval_days:
            initial.package_fulfillment_interval_days !== undefined &&
            initial.package_fulfillment_interval_days !== null
              ? String(initial.package_fulfillment_interval_days)
              : "30",
          journey_level:
            initial.journey_level !== undefined &&
            initial.journey_level !== null
              ? String(initial.journey_level)
              : "",
          displayOrder: initial.display_order ?? initial.displayOrder ?? "",
          is_free_shipping:
            initial.is_free_shipping === 1 ||
            initial.is_free_shipping === true ||
            initial.isFreeShipping === 1 ||
            initial.isFreeShipping === true ||
            initial.free_shipping === 1 ||
            initial.free_shipping === true,
          shipping_charge:
            initial.shipping_charge ?? initial.shippingCharge ?? "",
          estimated_delivery:
            initial.estimated_delivery ||
            initial.estimatedDelivery ||
            "3–7 Business Days",
          features: Array.isArray(initial.features)
            ? initial.features.join(", ")
            : typeof initial.features === "string"
              ? initial.features
              : "",
        };

        setForm(initialForm);

        setPreview(initial.image || "");
      } else {
        setForm(EMPTY_FORM);
        setPreview("");
      }

      setImageFile(null);
      setUploadError("");
      setErrors({});
    }
  }, [open, initial]);

  const set = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-disable show_recommendations when subscription is enabled
      if (key === "is_subscription" && value === true) {
        next.show_recommendations = false;
      }
      // Subscription (recurring billing) and recurring package (pay-once,
      // ship-many) are mutually exclusive recurring models — enabling one
      // turns the other off.
      if (key === "is_subscription" && value === true) {
        next.is_recurring_package = false;
      }
      if (key === "is_recurring_package" && value === true) {
        next.is_subscription = false;
      }
      return next;
    });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only JPEG, PNG, and WebP images are allowed.");
      return;
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      setUploadError("Image must be 5 MB or smaller.");
      return;
    }

    setUploadError("");
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    const errs = validate(form, imageFile, isEdit);

    if (Object.keys(errs).length || uploadError) {
      setErrors(errs);
      if (uploadError) {
        setErrors((prev) => ({ ...prev, image: uploadError }));
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        mrp: Number(form.mrp),
        quantity: Number(form.quantity),
        features: form.features || "",
        displayOrder:
          form.displayOrder !== "" ? Number(form.displayOrder) : undefined,
        journey_level:
          form.journey_level !== "" ? Number(form.journey_level) : 0,
        show_recommendations: form.show_recommendations,
        is_subscription: form.is_subscription,
        is_recurring_package: form.is_recurring_package,
        package_duration_months: form.is_recurring_package
          ? Number(form.package_duration_months)
          : undefined,
        package_fulfillment_interval_days: form.is_recurring_package
          ? Number(form.package_fulfillment_interval_days || 30)
          : undefined,
        is_free_shipping: form.is_free_shipping,
        shipping_charge: form.is_free_shipping
          ? 0
          : Number(form.shipping_charge || 0),
        estimated_delivery: form.estimated_delivery || "3–7 Business Days",
        imageFile,
      };

      await onSave(payload);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-bree-border custom-scrollbar">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-bree-border">
                <div>
                  <h2 className="text-xl font-semibold text-bree-text-primary">
                    {isEdit ? "Edit Product" : "Add New Product"}
                  </h2>
                  <p className="text-sm text-bree-text-secondary mt-1">
                    Fill product information
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full hover:bg-bree-bg flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Product Image
                  </label>
                  <div
                    onClick={() => fileRef.current.click()}
                    className="border-2 border-dashed border-bree-border rounded-2xl p-5 flex items-center gap-4 cursor-pointer hover:border-bree-primary transition"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-bree-bg flex items-center justify-center overflow-hidden">
                      {preview ? (
                        <img
                          src={preview}
                          alt="preview"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Upload className="w-8 h-8 text-bree-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-bree-text-primary">
                        Upload Product Image
                      </p>
                      <p className="text-sm text-bree-text-secondary mt-1">
                        PNG, JPG supported
                      </p>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFile}
                    />
                  </div>
                  {errors.image && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.image}
                    </p>
                  )}
                </div>

                {/* Product Name */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Enter product name"
                    className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                  />
                  {errors.name && (
                    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Product Category
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => set("category", e.target.value)}
                    placeholder="Enter category"
                    className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                  />
                </div>

                {/* MRP + Selling */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                      MRP Price
                    </label>
                    <input
                      type="number"
                      value={form.mrp}
                      onChange={(e) => set("mrp", e.target.value)}
                      placeholder="1299"
                      className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                      Selling Price
                    </label>
                    <input
                      type="number"
                      value={form.price}
                      onChange={(e) => set("price", e.target.value)}
                      placeholder="999"
                      className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                    />
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Quantity (Days)
                  </label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                    placeholder="30"
                    className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                  />
                </div>

                {/* Display Order */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Display Order{" "}
                    <span className="text-bree-text-secondary font-normal">
                      (1 = first on shop page)
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.displayOrder}
                    onChange={(e) => set("displayOrder", e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                  />
                  <p className="text-xs text-bree-text-secondary mt-1">
                    Controls the order products appear on the shop page.
                  </p>
                </div>

                {/* Shipping Configuration */}
                <div className="rounded-2xl border border-bree-border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-sm font-medium text-bree-text-primary">
                        Free Shipping
                      </label>
                      <p className="text-xs text-bree-text-secondary mt-1">
                        Toggle this on to show free shipping for this product.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_free_shipping)}
                      onChange={(e) =>
                        set("is_free_shipping", e.target.checked)
                      }
                      className="h-4 w-4 rounded border-bree-border text-bree-primary focus:ring-bree-primary"
                    />
                  </div>

                  {!form.is_free_shipping && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                          Shipping Charge (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={form.shipping_charge}
                          onChange={(e) =>
                            set("shipping_charge", e.target.value)
                          }
                          placeholder="79"
                          className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                          Estimated Delivery
                        </label>
                        <input
                          type="text"
                          value={form.estimated_delivery}
                          onChange={(e) =>
                            set("estimated_delivery", e.target.value)
                          }
                          placeholder="3–7 Business Days"
                          className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Journey Level */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Journey Level{" "}
                    <span className="text-bree-text-secondary font-normal">
                      (controls upgrade recommendations)
                    </span>
                  </label>
                  <select
                    value={form.journey_level}
                    onChange={(e) => set("journey_level", e.target.value)}
                    className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary bg-white"
                  >
                    {JOURNEY_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-bree-text-secondary mt-1">
                    Level 1 → recommends Level 2. Level 2 → recommends Levels 3
                    &amp; 4. Level 3 → recommends Level 4. Level 4 → no
                    recommendations.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Write product description..."
                    className="w-full p-4 rounded-2xl border border-bree-border outline-none resize-none focus:border-bree-primary"
                  />
                </div>

                {/* Features */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                    Features
                  </label>
                  <textarea
                    rows={3}
                    value={form.features}
                    onChange={(e) => set("features", e.target.value)}
                    placeholder="30 x 50ml bottles, Save ₹471, Best value"
                    className="w-full p-4 rounded-2xl border border-bree-border outline-none resize-none focus:border-bree-primary"
                  />
                </div>

                {/* Subscription */}
                <div className="flex items-center justify-between border border-bree-border rounded-2xl px-4 py-3">
                  <div>
                    <p className="font-medium text-bree-text-primary">
                      Subscription Product
                    </p>
                    <p className="text-sm text-bree-text-secondary">
                      Enable monthly recurring subscription (automatically
                      disables recommendations)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.is_subscription}
                    disabled={form.is_recurring_package}
                    onChange={(e) => set("is_subscription", e.target.checked)}
                    className="w-5 h-5 accent-bree-primary"
                  />
                </div>

                {/* Recurring Package — pay once, ship N times. Mutually
                    exclusive with Subscription (recurring billing). */}
                <div className="border border-bree-border rounded-2xl px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-bree-text-primary">
                        Recurring Package
                      </p>
                      <p className="text-sm text-bree-text-secondary">
                        Customer pays once; BREE ships one box per cycle
                        automatically (no repeat charge)
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.is_recurring_package}
                      disabled={form.is_subscription}
                      onChange={(e) =>
                        set("is_recurring_package", e.target.checked)
                      }
                      className="w-5 h-5 accent-bree-primary"
                    />
                  </div>

                  {form.is_recurring_package && (
                    <div className="grid gap-4 md:grid-cols-2 pt-1">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                          Number of Cycles
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={form.package_duration_months}
                          onChange={(e) =>
                            set("package_duration_months", e.target.value)
                          }
                          placeholder="e.g. 6"
                          className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                        />
                        {errors.package_duration_months && (
                          <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.package_duration_months}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-bree-text-primary">
                          Days Between Shipments
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={form.package_fulfillment_interval_days}
                          onChange={(e) =>
                            set(
                              "package_fulfillment_interval_days",
                              e.target.value,
                            )
                          }
                          placeholder="30"
                          className="w-full h-12 px-4 rounded-2xl border border-bree-border outline-none focus:border-bree-primary"
                        />
                        {errors.package_fulfillment_interval_days && (
                          <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.package_fulfillment_interval_days}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Show Recommendations — hidden when subscription is on */}
                {!form.is_subscription && (
                  <div className="flex items-center justify-between border border-bree-border rounded-2xl px-4 py-3">
                    <div>
                      <p className="font-medium text-bree-text-primary">
                        Show Upgrade Recommendations
                      </p>
                      <p className="text-sm text-bree-text-secondary">
                        Display higher-tier products as upgrade suggestions
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.show_recommendations}
                      onChange={(e) =>
                        set("show_recommendations", e.target.checked)
                      }
                      className="w-5 h-5 accent-bree-primary"
                    />
                  </div>
                )}

                {/* Popular */}
                <div className="flex items-center justify-between border border-bree-border rounded-2xl px-4 py-3">
                  <div>
                    <p className="font-medium text-bree-text-primary">
                      Most Popular Product
                    </p>
                    <p className="text-sm text-bree-text-secondary">
                      Highlight this product
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.popular}
                    onChange={(e) => set("popular", e.target.checked)}
                    className="w-5 h-5 accent-bree-primary"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-5 border-t border-bree-border flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="rounded-full"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="rounded-full bg-bree-primary hover:bg-bree-primary-hover text-white px-6"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? isEdit
                      ? "Saving..."
                      : "Adding..."
                    : isEdit
                      ? "Save Changes"
                      : "Add Product"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProductModal;
