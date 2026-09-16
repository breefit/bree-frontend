import { useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchAdminPackagePurchases } from "@/services/adminSubscriptionService";

const PAGE_SIZE = 20;

const STATUS_BADGE_CLASSES = {
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
};

/**
 * ISSUE-012 — Model B (pay-once, ship-monthly packages) admin visibility.
 *
 * A deliberately separate, read-only panel — not merged into the Model A
 * (recurring Razorpay subscriptions) table above, since the two have
 * genuinely different fields (fulfillment cycles vs. billing cycles, no
 * next_billing_date/razorpay_subscription_id here) and Model B currently
 * has no pause/cancel admin action to wire up (a separate, narrower gap).
 */
const PackagePurchasesPanel = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(() => {
    setPage(1);
    setSearchQuery(searchInput.trim());
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchAdminPackagePurchases({
          page,
          limit: PAGE_SIZE,
          search: searchQuery || undefined,
        });
        if (cancelled) return;
        setPackages(data?.packages || []);
        setTotal(Number(data?.total || 0));
      } catch {
        if (!cancelled) {
          setPackages([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [page, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center gap-2 w-full lg:w-96 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-bree-text-secondary" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by package number, customer, or product"
            className="pl-11 h-11 rounded-2xl border-bree-border bg-white"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="h-11 rounded-2xl px-4 text-sm">
          <Search className="w-4 h-4 mr-2" />
          Search
        </Button>
      </div>

      <div className="bg-white rounded-3xl border border-bree-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bree-bg text-bree-text-secondary text-left">
              <tr>
                <th className="px-5 py-3 font-medium">Package</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Cycles</th>
                <th className="px-5 py-3 font-medium">Next Fulfillment</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-bree-text-secondary">
                    Loading…
                  </td>
                </tr>
              ) : packages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-bree-text-secondary">
                    No package purchases found.
                  </td>
                </tr>
              ) : (
                packages.map((pkg) => (
                  <tr key={pkg.id} className="border-t border-bree-border">
                    <td className="px-5 py-3">
                      <div className="font-medium text-bree-text-primary">
                        {pkg.packageNumber || pkg.id}
                      </div>
                      <div className="text-xs text-bree-text-secondary">
                        from {pkg.originOrderNumber}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-bree-text-primary">{pkg.customerName}</div>
                      <div className="text-xs text-bree-text-secondary">{pkg.email}</div>
                    </td>
                    <td className="px-5 py-3 text-bree-text-primary">{pkg.product}</td>
                    <td className="px-5 py-3 text-bree-text-primary">
                      {pkg.cyclesCreated} / {pkg.totalCycles}
                    </td>
                    <td className="px-5 py-3 text-bree-text-secondary">
                      {pkg.nextFulfillmentDate
                        ? new Date(pkg.nextFulfillmentDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                          STATUS_BADGE_CLASSES[pkg.status] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {pkg.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-bree-text-secondary">
            Page {page} of {totalPages} · {total} package{total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="w-9 h-9 rounded-lg border-bree-border p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="w-9 h-9 rounded-lg border-bree-border p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackagePurchasesPanel;
