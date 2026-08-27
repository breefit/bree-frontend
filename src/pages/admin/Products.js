import { useEffect, useState, useMemo, useCallback } from "react";

import AdminLayout from "@/components/admin/AdminLayout";

import ProductModal from "@/components/admin/ProductModal";
import ProductRelationsModal from "@/components/admin/ProductRelationsModal";

import { Search, X, Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import axios from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";

// Human-readable label for each journey level value
const JOURNEY_LABEL = {
  0: "—",
  1: "Trial",
  2: "Monthly",
  3: "6-Month",
  4: "Annual",
};

const Products = () => {
  const [products, setProducts] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [relationTarget, setRelationTarget] = useState(null);
  const [relations, setRelations] = useState([]);
  const [relationsLoading, setRelationsLoading] = useState(false);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.toLowerCase();
    return products.filter((item) =>
      item.name.toLowerCase().includes(normalizedQuery),
    );
  }, [products, searchQuery]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/admin/products?limit=100");
      const productsFromApi = response.data.products || [];
      setProducts(productsFromApi);
    } catch (error) {
      console.error("Failed to load products", error);
      toast.error(getApiErrorMessage(error));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
  }, []);

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAdd = () => {
    setEditing(null);
    setOpen(true);
  };

  const handleEdit = (product) => {
    setEditing(product);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/admin/products/${id}`);
      setProducts((prev) => prev.filter((item) => item.id !== id));
      toast.success("Product deleted");
    } catch (error) {
      console.error("Failed to delete product", error);
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleSave = async (data) => {
    setLoading(true);
    try {
      const featuresString = Array.isArray(data.features)
        ? data.features.join(", ")
        : data.features || "";

      // Build FormData when there is a new image file; JSON otherwise.
      // journey_level and show_recommendations are always included so the
      // backend persists them even when only other fields change.
      const buildFormData = () => {
        const formData = new FormData();
        if (data.imageFile) {
          formData.append("image", data.imageFile);
        }
        formData.append("name", data.name);
        formData.append("category", data.category);
        formData.append("description", data.description);
        formData.append("price", data.price.toString());
        formData.append("mrp", data.mrp.toString());
        formData.append("quantity", data.quantity.toString());
        formData.append("popular", data.popular ? "true" : "false");
        formData.append("features", featuresString);
        formData.append(
          "is_subscription",
          data.is_subscription ? "true" : "false",
        );
        formData.append(
          "is_recurring_package",
          data.is_recurring_package ? "true" : "false",
        );
        if (data.is_recurring_package) {
          formData.append(
            "package_duration_months",
            String(data.package_duration_months || ""),
          );
          formData.append(
            "package_fulfillment_interval_days",
            String(data.package_fulfillment_interval_days || 30),
          );
        }
        formData.append(
          "journey_level",
          data.journey_level !== undefined ? String(data.journey_level) : "0",
        );
        formData.append(
          "show_recommendations",
          data.show_recommendations ? "true" : "false",
        );
        formData.append(
          "is_free_shipping",
          data.is_free_shipping ? "true" : "false",
        );
        formData.append(
          "shipping_charge",
          data.is_free_shipping ? "0" : String(data.shipping_charge || 0),
        );
        formData.append(
          "estimated_delivery",
          data.estimated_delivery || "3–7 Business Days",
        );
        if (data.displayOrder !== undefined && data.displayOrder !== "") {
          formData.append("displayOrder", data.displayOrder.toString());
        }
        return formData;
      };

      const shouldUseMultipart = !!data.imageFile;
      const payload = shouldUseMultipart
        ? buildFormData()
        : {
            ...data,
            features: featuresString,
          };

      if (editing) {
        const response = await axios.put(
          `/api/admin/products/${editing.id}`,
          payload,
        );
        setProducts((prev) =>
          prev.map((item) => (item.id === editing.id ? response.data : item)),
        );
        toast.success("Product updated");
      } else {
        const response = await axios.post("/api/admin/products", payload);
        setProducts((prev) => [response.data, ...prev]);
        toast.success("Product added");
      }
    } catch (error) {
      console.error("Failed to save product", error);
      toast.error(getApiErrorMessage(error));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleManageRelations = async (product) => {
    setRelationTarget(product);
    setRelationsLoading(true);
    setRelationsOpen(true);

    try {
      const response = await axios.get(
        `/api/admin/products/${product.id}/relations`,
      );
      setRelations(response.data || []);
    } catch (error) {
      console.error("Failed to load relations", error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setRelationsLoading(false);
    }
  };

  const handleSaveRelations = async (productId, relations) => {
    try {
      await axios.post(`/api/admin/products/${productId}/relations`, {
        relations,
      });
      toast.success("Relations saved");
      setRelationsOpen(false);
    } catch (error) {
      console.error("Failed to save relations", error);
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 md:p-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-bree-text-primary">
              Products
            </h1>
            <p className="text-sm text-bree-text-secondary mt-1">
              Manage your product catalogue and journey levels
            </p>
          </div>
          <Button
            onClick={handleAdd}
            className="rounded-full bg-bree-primary hover:bg-bree-primary-hover text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Button>
        </div>

        {/* Search */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search products…"
              className="w-full h-11 pl-11 pr-4 rounded-full border border-bree-border outline-none focus:border-bree-primary text-sm"
            />
          </div>
          <Button
            onClick={handleSearch}
            className="rounded-full bg-bree-primary text-white"
          >
            Search
          </Button>
          {searchQuery && (
            <Button
              variant="outline"
              onClick={clearSearch}
              className="rounded-full gap-1"
            >
              <X className="w-4 h-4" />
              Clear
            </Button>
          )}
        </div>

        {loading && !products.length ? (
          <div className="text-center py-16 text-bree-text-secondary">
            Loading products…
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-bree-text-secondary">
            No products found.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto rounded-3xl border border-bree-border">
              <table className="w-full">
                <thead>
                  <tr className="bg-bree-bg border-b border-bree-border">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wider">
                      Pricing
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wider">
                      Journey
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-bree-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bree-border bg-white">
                  {filteredProducts.map((product) => {
                    const discount = Math.round(
                      ((product.mrp - product.price) / product.mrp) * 100,
                    );
                    const journeyLabel =
                      JOURNEY_LABEL[product.journey_level] ?? "—";

                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-bree-bg/50 transition-colors"
                      >
                        {/* Product */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-bree-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-10 h-10 object-contain"
                              />
                            </div>
                            <div>
                              <p className="font-semibold text-bree-text-primary">
                                {product.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {product.popular === 1 && (
                                  <span className="text-[10px] bg-bree-primary text-white px-2 py-0.5 rounded-full">
                                    Popular
                                  </span>
                                )}
                                {product.is_subscription === 1 && (
                                  <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                                    Subscription
                                  </span>
                                )}
                                {product.is_recurring_package === 1 && (
                                  <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                                    Package · {product.package_duration_months}x
                                  </span>
                                )}
                                {!product.is_active && (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                    Inactive
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-6 py-5 text-bree-text-secondary">
                          {product.category}
                        </td>

                        {/* Pricing */}
                        <td className="px-6 py-5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-bree-text-primary">
                                ₹{product.price}
                              </span>
                              <span className="text-sm text-red-400 line-through">
                                ₹{product.mrp}
                              </span>
                            </div>
                            <div className="mt-2">
                              <span className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-full">
                                {discount}% OFF
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Journey Level */}
                        <td className="px-6 py-5">
                          <span className="text-xs font-medium bg-bree-bg text-bree-text-secondary px-3 py-1 rounded-full">
                            L{product.journey_level ?? 0} · {journeyLabel}
                          </span>
                          {product.show_recommendations === 0 && (
                            <span className="block mt-1 text-[10px] text-amber-600">
                              Recs off
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleManageRelations(product)}
                              className="w-10 h-10 rounded-xl bg-bree-bg hover:bg-bree-primary/10 flex items-center justify-center transition"
                              title="Manage relations"
                            >
                              <span className="text-sm font-semibold text-bree-primary">
                                R
                              </span>
                            </button>
                            <button
                              onClick={() => handleEdit(product)}
                              className="w-10 h-10 rounded-xl bg-bree-bg hover:bg-bree-primary/10 flex items-center justify-center transition"
                              title="Edit product"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition"
                              title="Delete product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4">
              {filteredProducts.map((product) => {
                const discount = Math.round(
                  ((product.mrp - product.price) / product.mrp) * 100,
                );
                const journeyLabel =
                  JOURNEY_LABEL[product.journey_level] ?? "—";

                return (
                  <div
                    key={product.id}
                    className="bg-white border border-bree-border rounded-3xl p-5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-bree-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-14 h-14 object-contain"
                        />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-bree-text-primary">
                              {product.name}
                            </h3>
                            <p className="text-sm text-bree-text-secondary mt-1">
                              {product.category}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {product.popular === 1 && (
                              <span className="text-[10px] bg-bree-primary text-white px-2 py-1 rounded-full">
                                Popular
                              </span>
                            )}
                            {product.is_subscription === 1 && (
                              <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-1 rounded-full">
                                Sub
                              </span>
                            )}
                            {product.is_recurring_package === 1 && (
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                                Package · {product.package_duration_months}x
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-bree-text-primary">
                            ₹{product.price}
                          </span>
                          <span className="text-sm text-red-400 line-through">
                            ₹{product.mrp}
                          </span>
                          <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">
                            {discount}% OFF
                          </span>
                          <span className="text-xs bg-bree-bg text-bree-text-secondary px-2 py-0.5 rounded-full">
                            L{product.journey_level ?? 0} · {journeyLabel}
                          </span>
                        </div>

                        <div className="flex items-center justify-end mt-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleManageRelations(product)}
                              className="w-9 h-9 rounded-xl bg-bree-bg flex items-center justify-center"
                              title="Manage relations"
                            >
                              <span className="text-sm font-semibold text-bree-primary">
                                R
                              </span>
                            </button>
                            <button
                              onClick={() => handleEdit(product)}
                              className="w-9 h-9 rounded-xl bg-bree-bg flex items-center justify-center"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Modals */}
        <ProductModal
          open={open}
          onClose={() => setOpen(false)}
          onSave={handleSave}
          initial={editing}
        />

        <ProductRelationsModal
          open={relationsOpen}
          onClose={() => setRelationsOpen(false)}
          product={relationTarget}
          products={products}
          relations={relations}
          onSave={handleSaveRelations}
          loading={relationsLoading}
        />
      </div>
    </AdminLayout>
  );
};

export default Products;
