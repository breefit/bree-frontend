import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle,
  ArrowRight,
  Copy,
  Check,
  Truck,
  RefreshCw,
  Bell,
  HeadphonesIcon,
  ShieldCheck,
  Package,
  Sparkles,
  MapPin,
  ChevronRight,
  CalendarDays,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "@/lib/api";
import { formatReminderTime, maskWhatsAppNumber } from "@/lib/reminderDisplay";

/* ─────────────────────── helpers ─────────────────────── */

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatAmount = (amount) => {
  if (!amount) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

/* ─────────────────── sub-components ──────────────────── */

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-bree-bg border border-bree-border px-5 py-4">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-bree-text-secondary font-semibold mb-0.5">
          {label}
        </p>
        <p className="text-sm font-medium text-bree-text-primary break-all leading-snug">
          {value || "—"}
        </p>
      </div>
      {value && (
        <button
          onClick={copy}
          className="shrink-0 w-8 h-8 rounded-xl bg-white border border-bree-border flex items-center justify-center text-bree-text-secondary hover:text-bree-primary hover:border-bree-primary transition-colors"
          title="Copy"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

function TimelineStep({ step, title, description, isLast, isDone = true }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 font-bold text-sm transition-all ${
            isDone
              ? "bg-bree-primary border-bree-primary text-white"
              : "bg-bree-bg border-bree-border text-bree-text-secondary"
          }`}
        >
          {isDone ? <Check className="w-4 h-4" /> : step}
        </div>
        {!isLast && (
          <div
            className={`w-px flex-1 mt-1 min-h-[28px] ${
              isDone ? "bg-bree-primary/30" : "bg-bree-border"
            }`}
          />
        )}
      </div>
      <div className="pb-7 min-w-0 flex-1 pt-1">
        <p
          className={`text-sm font-semibold ${
            isDone ? "text-bree-text-primary" : "text-bree-text-secondary"
          }`}
        >
          {title}
        </p>
        {description && (
          <p className="text-xs text-bree-text-secondary mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function BenefitItem({ icon, label, sub }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-bree-bg border border-bree-border">
      <div className="w-8 h-8 rounded-xl bg-bree-primary/10 flex items-center justify-center shrink-0 text-bree-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-bree-text-primary">{label}</p>
        {sub && (
          <p className="text-xs text-bree-text-secondary mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────── main page ──────────────────── */

const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const { state = {} } = useLocation();
  const {
    product,
    frequency,
    subscriptionId,
    subscriptionStatus,
    nextBillingDate,
    orderDbId,
    subscriptionPrice,
    reminders,
  } = state;
  const [orderDetails, setOrderDetails] = useState(null);

  useEffect(() => {
    if (!orderDbId) return;

    axios
      .get(`/api/orders/${orderDbId}`)
      .then((response) => setOrderDetails(response.data))
      .catch(() => {
        // Keep navigation state as a fallback for older or delayed orders.
      });
  }, [orderDbId]);

  const title = useMemo(
    () =>
      product
        ? `${product.name} Subscription Activated`
        : "Subscription Activated",
    [product],
  );

  const displayPrice = subscriptionPrice || product?.price;
  const reminderCards = Array.isArray(orderDetails?.reminders)
    ? orderDetails.reminders.filter(
        (reminder) => reminder?.reminder_enabled !== 0,
      )
    : Array.isArray(reminders)
      ? reminders
          .filter((reminder) => reminder?.enabled !== false)
          .map((reminder) => ({
            ...reminder,
            reminder_enabled: 1,
            reminder_price_paid: reminder.price,
            reminder_time: reminder.time,
          }))
      : [];
  const reminderPrice = reminderCards.reduce(
    (total, reminder) => total + Number(reminder?.reminder_price_paid || 0),
    0,
  );
  const amountPaid = orderDetails?.total ?? null;
  const fallbackAmountPaid =
    Number(subscriptionPrice || product?.price || 0) + reminderPrice;
  const reminderTime = reminderCards[0]?.reminder_time;

  return (
    <div className="pt-24 min-h-screen bg-bree-bg pb-20">
      <Helmet>
        <title>Subscription Activated — BREE Wellness</title>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 md:px-8 space-y-6">
        {/* ── Hero Success Section ── */}
        <div className="rounded-[28px] bg-white border border-bree-border shadow-sm overflow-hidden">
          {/* top gradient strip */}
          <div className="h-1.5 bg-gradient-to-r from-bree-primary/60 via-bree-primary to-bree-primary/60" />

          <div className="px-8 pt-10 pb-8 text-center">
            {/* success icon */}
            <div className="relative inline-flex items-center justify-center mb-6">
              {/* outer glow rings */}
              <div className="absolute w-28 h-28 rounded-full bg-bree-primary/10 animate-ping opacity-30" />
              <div className="absolute w-24 h-24 rounded-full bg-bree-primary/15" />
              {/* gradient circle */}
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-bree-primary/80 to-bree-primary flex items-center justify-center shadow-lg shadow-bree-primary/25">
                <CheckCircle
                  className="w-10 h-10 text-white"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            <p className="text-xs uppercase tracking-[0.25em] text-bree-primary font-bold mb-3">
              Welcome to BREE Wellness
            </p>
            <h1 className="font-outfit text-3xl md:text-4xl font-light text-bree-text-primary leading-tight">
              Welcome To The{" "}
              <span className="font-semibold">BREE Wellness Club</span>
            </h1>
            <p className="text-bree-text-secondary mt-3 max-w-md mx-auto text-sm leading-relaxed">
              Your subscription is active and your wellness journey begins
              today.
            </p>

            {/* quick status pills */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Subscription Active
              </span>
              {nextBillingDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-bree-bg text-bree-text-secondary border border-bree-border">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Renews {formatDate(nextBillingDate)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Membership Card ── */}
        <div className="rounded-[28px] overflow-hidden shadow-md border border-bree-border">
          {/* gradient hero */}
          <div className="bg-gradient-to-br from-bree-primary/90 to-bree-primary p-6 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 80% 10%, white 0%, transparent 55%)",
              }}
            />
            {/* top label */}
            <div className="flex items-center justify-between mb-5 relative z-10">
              <p className="text-white/70 text-xs uppercase tracking-widest font-bold">
                BREE Wellness · Member
              </p>
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold bg-emerald-400/25 text-white border border-emerald-300/40">
                <Star className="w-3 h-3 fill-white" /> Active
              </span>
            </div>

            {/* product row */}
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 overflow-hidden flex items-center justify-center shrink-0">
                {product?.image ? (
                  <img
                    src={product.image}
                    alt={product.name || "Product"}
                    className="h-full w-full object-contain p-1"
                    onError={(e) => {
                      e.currentTarget.src = "/images/default-product.png";
                    }}
                  />
                ) : (
                  <Package className="w-8 h-8 text-white/60" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-xs uppercase tracking-widest font-semibold mb-1">
                  Monthly Wellness Subscription
                </p>
                <h2 className="text-white text-xl md:text-2xl font-semibold leading-snug">
                  {product?.name || "BREE Wellness Plan"}
                </h2>
              </div>
            </div>

            {/* stats row */}
            <div className="grid grid-cols-3 gap-3 mt-6 relative z-10">
              {[
                { label: "Status", value: subscriptionStatus || "Active" },
                { label: "Frequency", value: `Every ${frequency || 30} Days` },
                {
                  label: "Price",
                  value: displayPrice
                    ? `${formatAmount(displayPrice)} / renewal`
                    : "—",
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-3"
                >
                  <p className="text-white/60 text-[10px] uppercase tracking-widest font-semibold">
                    {label}
                  </p>
                  <p className="text-white text-sm font-bold mt-1 leading-snug">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* membership footer strip */}
          <div className="bg-white px-6 py-4 flex items-center justify-between">
            <p className="text-xs text-bree-text-secondary font-medium">
              BREE Wellness Club · {new Date().getFullYear()}
            </p>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-bree-primary">
              <Sparkles className="w-3.5 h-3.5" /> Premium Member
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white border border-bree-border p-6 shadow-sm">
          <h2 className="text-base font-bold text-bree-text-primary uppercase tracking-wide mb-5">
            Order Status
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-bree-text-secondary">Status</span>
              <span className="font-semibold text-bree-text-primary">Paid</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-bree-text-secondary">
                Estimated Delivery
              </span>
              <span className="font-semibold text-bree-text-primary">
                5–7 Business Days
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-bree-text-secondary">Shipping</span>
              <span className="font-semibold text-bree-text-primary">Free</span>
            </div>
            {reminderCards.length > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-bree-text-secondary">
                    Daily WhatsApp Reminder
                  </span>
                  <span className="font-semibold text-bree-text-primary">
                    {formatAmount(reminderPrice) || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-bree-text-secondary">
                    Reminder Time
                  </span>
                  <span className="font-semibold text-bree-text-primary">
                    {formatReminderTime(reminderTime)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center border-t border-bree-border pt-3">
              <span className="text-bree-text-secondary">Amount Paid</span>
              <span className="font-semibold text-bree-text-primary">
                {formatAmount(
                  amountPaid ?? (orderDbId ? null : fallbackAmountPaid),
                ) || "—"}
              </span>
            </div>
          </div>
        </div>

        {reminderCards.length > 0 && (
          <div className="rounded-[28px] bg-white border border-bree-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Bell className="w-4 h-4 text-bree-primary" />
              <h2 className="text-base font-bold text-bree-text-primary uppercase tracking-wide">
                WhatsApp Reminder
              </h2>
            </div>
            <div className="space-y-4">
              {reminderCards.map((reminder) => {
                const phoneValue =
                  reminder.reminder_phone_source === "custom"
                    ? reminder.reminder_whatsapp_number ||
                      reminder.custom_phone ||
                      ""
                    : reminder.reminder_whatsapp_number || "";

                return (
                  <div
                    key={`${reminder.product_id}-${reminder.reminder_time}`}
                    className="rounded-2xl border border-bree-border bg-bree-bg p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl border border-bree-border bg-white overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src="/images/daily-whatsapp-reminder.png"
                          alt="Daily WhatsApp Reminder"
                          className="w-10 h-10 object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-bree-text-primary text-base">
                          Daily wellness reminders enabled
                        </p>
                        <p className="text-sm text-bree-text-secondary mt-1">
                          Reminder time:{" "}
                          {formatReminderTime(reminder.reminder_time)}
                        </p>
                        <p className="text-sm text-bree-text-secondary mt-1">
                          WhatsApp: {maskWhatsAppNumber(phoneValue)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── What Happens Next ── */}
        <div className="rounded-[28px] bg-white border border-bree-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <ArrowRight className="w-4 h-4 text-bree-primary" />
            <h2 className="text-base font-bold text-bree-text-primary uppercase tracking-wide">
              What Happens Next
            </h2>
          </div>
          <TimelineStep
            step={1}
            isDone={true}
            title="Subscription Activated"
            description="Your membership is confirmed and active immediately."
          />
          <TimelineStep
            step={2}
            isDone={true}
            title="Order Processing"
            description="Your first order is being prepared for dispatch."
          />
          <TimelineStep
            step={3}
            isDone={false}
            title="Delivery"
            description="Your product will be delivered to your address soon."
          />
          <TimelineStep
            step={4}
            isDone={false}
            title="Automatic Renewal"
            description={`Your subscription renews every ${frequency || 30} days — we'll remind you before each cycle.`}
            isLast={true}
          />
        </div>

        {/* ── Next Renewal + Subscription Details side-by-side on md+ ── */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Next Renewal */}
          <div className="rounded-[28px] bg-white border border-bree-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-4 h-4 text-bree-primary" />
              <h2 className="text-base font-bold text-bree-text-primary uppercase tracking-wide">
                Next Renewal
              </h2>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-bree-primary/5 to-bree-primary/10 border border-bree-primary/20 p-5">
              <p className="text-2xl font-bold text-bree-text-primary leading-tight">
                {formatDate(nextBillingDate)}
              </p>
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                {displayPrice && (
                  <p className="text-xl font-bold text-bree-primary">
                    {formatAmount(displayPrice)}
                  </p>
                )}
                <p className="text-xs text-bree-text-secondary">
                  Every {frequency || 30} days
                </p>
              </div>
              <p className="text-xs text-bree-text-secondary mt-4 leading-relaxed border-t border-bree-primary/15 pt-3">
                We'll send you a reminder before your renewal.
              </p>
            </div>
          </div>

          {/* Subscription Details */}
          <div className="rounded-[28px] bg-white border border-bree-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-bree-primary" />
              <h2 className="text-base font-bold text-bree-text-primary uppercase tracking-wide">
                Details
              </h2>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { label: "Status", value: subscriptionStatus || "Active" },
                { label: "Frequency", value: `Every ${frequency || 30} days` },
                { label: "Next Billing", value: formatDate(nextBillingDate) },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-2 border-b border-bree-border/50 last:border-0"
                >
                  <span className="text-bree-text-secondary">{label}</span>
                  <span className="font-semibold text-bree-text-primary">
                    {value}
                  </span>
                </div>
              ))}
            </div>
            {subscriptionId && (
              <div className="mt-4">
                <CopyField label="Subscription ID" value={subscriptionId} />
              </div>
            )}
          </div>
        </div>

        {/* ── Membership Benefits ── */}
        <div className="rounded-[28px] bg-white border border-bree-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck className="w-4 h-4 text-bree-primary" />
            <h2 className="text-base font-bold text-bree-text-primary uppercase tracking-wide">
              Your Membership Benefits
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <BenefitItem
              icon={<Truck className="w-4 h-4" />}
              label="Free Shipping"
              sub="On every subscription order"
            />
            <BenefitItem
              icon={<RefreshCw className="w-4 h-4" />}
              label="Auto Renewal"
              sub="Never miss your wellness routine"
            />
            <BenefitItem
              icon={<Bell className="w-4 h-4" />}
              label="Email Renewal Reminders"
              sub="Notified before each cycle"
            />
            <BenefitItem
              icon={<HeadphonesIcon className="w-4 h-4" />}
              label="Priority Support"
              sub="Dedicated subscription help"
            />
            <BenefitItem
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Cancel Anytime"
              sub="No lock-in, full flexibility"
            />
          </div>
        </div>

        {/* ── Welcome Message ── */}
        <div className="rounded-[28px] bg-gradient-to-br from-bree-primary/5 to-bree-bg border border-bree-primary/15 p-7 text-center">
          <div className="w-10 h-10 rounded-2xl bg-bree-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-5 h-5 text-bree-primary" />
          </div>
          <h2 className="text-lg font-semibold text-bree-text-primary mb-2">
            Welcome to the Community
          </h2>
          <p className="text-sm text-bree-text-secondary leading-relaxed max-w-md mx-auto">
            Thank you for choosing BREE Wellness. Your subscription gives you
            uninterrupted access to your wellness routine with automatic
            renewals, free shipping, and flexible subscription management.
          </p>
        </div>

        {/* ── CTAs ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            onClick={() => navigate("/subscriptions")}
            className="flex-1 py-4 rounded-full bg-bree-primary hover:bg-bree-primary-hover text-white font-medium"
          >
            Manage Subscription
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            type="button"
            onClick={() => navigate("/shop")}
            variant="outline"
            className="flex-1 py-4 rounded-full border-bree-border font-medium"
          >
            Continue Shopping
          </Button>
          <Button
            type="button"
            onClick={() => navigate("/profile?tab=orders")}
            variant="outline"
            className="flex-1 py-4 rounded-full border-bree-border font-medium sm:flex-none"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Track Orders
          </Button>
        </div>

        {/* ── Support Card ── */}
        <div className="rounded-[28px] border border-bree-primary/20 bg-bree-primary/5 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-bree-primary/10 flex items-center justify-center shrink-0 text-bree-primary mt-0.5">
              <HeadphonesIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-bree-text-primary">
                Need Help?
              </p>
              <p className="text-xs text-bree-text-secondary mt-1 leading-relaxed max-w-sm">
                Manage renewals, billing, delivery schedules, and subscription
                settings anytime from your account dashboard.
              </p>
            </div>
          </div>
          <button className="shrink-0 flex items-center gap-2 rounded-2xl bg-white border border-bree-border px-4 py-2.5 text-sm font-medium text-bree-text-primary hover:border-bree-primary hover:text-bree-primary transition-colors whitespace-nowrap">
            Contact Support
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
