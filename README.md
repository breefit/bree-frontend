# BREE Wellness — Frontend  ------ Updated on 14-Aug-2026 9:00pm ---------

React storefront (with an embedded admin dashboard) for the BREE Wellness D2C e‑commerce platform.

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Technology Stack](#2-technology-stack)
- [3. Project Structure](#3-project-structure)
- [4. User Features](#4-user-features)
- [5. Authentication](#5-authentication)
- [6. Product System](#6-product-system)
- [7. Subscription System](#7-subscription-system)
- [8. Recurring Package / Multi-Cycle Fulfillment](#8-recurring-package--multi-cycle-fulfillment)
- [9. Bulk Order System](#9-bulk-order-system)
- [10. Razorpay Magic Checkout (Bulk Orders)](#10-razorpay-magic-checkout-bulk-orders)
- [11. Order Management](#11-order-management)
- [12. Return / Refund System](#12-return--refund-system)
- [13. Customer Profile](#13-customer-profile)
- [14. Admin Frontend](#14-admin-frontend)
- [15. Notifications](#15-notifications)
- [16. API Integration](#16-api-integration)
- [17. State Management](#17-state-management)
- [18. Routing](#18-routing)
- [19. Environment Variables](#19-environment-variables)
- [20. Local Development](#20-local-development)
- [21. Build & Deployment](#21-build--deployment)
- [22. Security](#22-security)
- [23. Responsive Design](#23-responsive-design)
- [24. Error / Loading Handling](#24-error--loading-handling)
- [25. Important Business Flows](#25-important-business-flows)
- [26. Troubleshooting](#26-troubleshooting)
- [27. Development Guidelines](#27-development-guidelines)
- [28. Project Status](#28-project-status)

---

## 1. Project Overview

BREE Wellness is a Direct‑to‑Consumer (D2C) wellness e‑commerce website. This repository is its **customer-facing storefront and embedded admin dashboard**, built as a single React application.

The frontend covers:

- Product browsing and a subscription-aware product catalog
- Cart and one-time checkout via Razorpay
- Mobile OTP and Google authentication
- Recurring **subscription** products (auto‑renewing, e.g. every 30 days)
- **Recurring package** products (a single payment fulfilled across multiple shipping cycles)
- A separate **Bulk Order** enquiry → quote → payment workflow for corporate/bulk buyers, using Razorpay Magic Checkout
- Order tracking with live Delhivery shipment status
- A customer-facing return/refund support flow (48‑hour post-delivery window)
- Customer profile, addresses, order history, and subscription management
- An embedded admin dashboard for orders, products, customers, bulk bookings, subscriptions, testimonials, and contact inquiries
- Toast-based notifications for success/error feedback throughout

---

## 2. Technology Stack

Versions below are taken directly from `package.json`.

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | ^18.3.1 | UI library |
| `react-scripts` (Create React App) | 5.0.1 | Build tooling, run via CRACO |
| `@craco/craco` | ^7.1.0 | CRA config override (webpack alias, ESLint rules, optional health-check plugin) |
| `react-router-dom` | ^7.5.1 | Client-side routing |
| `tailwindcss` | ^3.4.17 | Utility-first CSS |
| `tailwindcss-animate`, `tailwind-merge`, `clsx`, `class-variance-authority` | latest | Tailwind/shadcn styling helpers |
| `@radix-ui/react-*` (accordion, dialog, dropdown-menu, select, tabs, toast, tooltip, etc.) | latest | Headless UI primitives underlying the shadcn/ui component set in `src/components/ui/` |
| `framer-motion` | ^12.38.0 | Animations/transitions |
| `axios` | ^1.8.4 | HTTP client (single shared instance, see [API Integration](#16-api-integration)) |
| `sonner` | ^2.0.3 | Toast notifications |
| `lucide-react` | ^0.507.0 | Icon set |
| `react-icons` | ^5.6.0 | Additional icons |
| `firebase` | ^10.14.1 | Google Sign-In only (`firebase/auth`) — no other Firebase services are used |
| `socket.io-client` | ^4.8.3 | Real-time order/product update events from the backend |
| `react-helmet-async` | ^2.0.5 | Per-page `<title>`/meta tags |
| `input-otp` | ^1.4.2 | OTP input UI component |
| `next-themes` | ^0.4.6 | Theme primitive used by shadcn/ui components |

**Razorpay**: there is no Razorpay npm package. Both Standard and Magic Checkout are loaded at runtime via the Razorpay `<script>` tag (see [`src/lib/razorpayLoader.js`](src/lib/razorpayLoader.js)); the publishable key is never stored in the frontend — it is returned by the backend at order-creation time.

**Build system**: this is a **Create React App** project (`react-scripts`), customized via **CRACO** (`craco.config.js`) — it is **not** Vite.

**Component library**: [shadcn/ui](https://ui.shadcn.com) is configured (`components.json`, style `new-york`) and its generated primitives live in `src/components/ui/`.

---

## 3. Project Structure

```
bree-frontend/
├── src/
│   ├── components/
│   │   ├── admin/              # AdminLayout, ProductModal, ProductRelationsModal, ProtectedAdminRoute
│   │   ├── orders/              # orderStatus.js (status enum/labels), OrderTrackingCard, TrackingTimeline
│   │   ├── support/              # PrivacyPolicy, ReturnsPolicy, ShippingPolicy, TermsConditions, SupportHero/Navigation
│   │   ├── ui/                   # shadcn/ui primitives (button, dialog, input, select, toast, ...)
│   │   ├── Header.js / Footer.js
│   │   ├── ProductCard.js        # Product tile — handles Add to Cart / Subscribe Now
│   │   ├── CartDrawer.js / CartUpdateModal.js
│   │   ├── ProtectedRoute.js     # Customer route guard (redirects to /login)
│   │   ├── TestimonialForm.js
│   │   └── Bottle3D.js, ScrollToTop.jsx, DevelopedByStaffArc.js
│   ├── context/
│   │   ├── AuthContext.js        # Customer auth (OTP, Google, session)
│   │   ├── AdminAuthContext.js   # Admin auth (email/password)
│   │   └── CartContext.js        # Cart state, localStorage persistence, server-side cart sync
│   ├── hooks/
│   │   ├── use-toast.js
│   │   ├── useOrdersSync.js      # Subscribes to the `order:updated` socket event
│   │   └── useProductsSync.js    # Subscribes to product:created/updated/deleted socket events
│   ├── lib/
│   │   ├── api.js                # Shared axios instance (base URL, auth headers, 401 refresh)
│   │   ├── razorpayLoader.js     # Loads Razorpay script, opens Standard/Magic Checkout
│   │   ├── socket.js             # socket.io-client singleton
│   │   ├── cache.js              # localStorage/sessionStorage TTL cache helper
│   │   ├── assets.js             # CDN/env-driven asset URL resolution (logo, default product image, 3D bottle)
│   │   └── firebase.js           # Firebase app/auth init for Google Sign-In
│   ├── pages/                    # Route-level views (see §18 Routing)
│   │   └── admin/                # Admin-only route-level views
│   ├── services/
│   │   ├── subscriptionService.js
│   │   └── adminSubscriptionService.js
│   ├── App.js                    # Root component, providers, and route table
│   ├── App.css / index.css
│   └── index.js                  # React entry point
├── public/                       # Static assets (favicon, manifest, images)
├── plugins/health-check/         # Optional CRACO dev-server health-check plugin (opt-in via ENABLE_HEALTH_CHECK)
├── craco.config.js               # Webpack `@` alias → src/, ESLint rules, optional health-check plugin
├── components.json               # shadcn/ui configuration
├── tailwind.config.js
├── vercel.json                   # SPA rewrite rule for Vercel hosting
└── package.json
```

The `@/` import alias (e.g. `import axios from "@/lib/api"`) resolves to `src/`, configured in both `craco.config.js` (webpack) and `jsconfig.json` (editor tooling).

---

## 4. User Features

- **Home** (`/`) — hero, benefits, "how it works" steps, featured products, testimonials, testimonial submission form.
- **Shop** (`/shop`) — product catalog with **category filtering** (categories are derived from the loaded product list; there is no free-text product search in the current implementation).
- **Product cards** (`ProductCard.js`) — price, MRP, computed discount %, shipping info, out-of-stock state, and either an **Add to Cart** or **Subscribe Now** action depending on whether the product is flagged as a subscription product.
- **Cart** — drawer-based cart (`CartDrawer.js`) backed by `CartContext`, persisted to `localStorage`, and synced against the backend (price/stock/availability) via `POST /api/orders/validate-cart`.
- **Checkout** (`/checkout`, login required) — Razorpay-based one-time payment checkout with cart review, price/shipping breakdown, and a cart-changed confirmation modal.
- **Authentication** — mobile OTP and Google Sign-In (see [§5](#5-authentication)).
- **Profile** (`/profile`, login required) — tabbed page: Profile info, Addresses (CRUD), Orders (with tracking + recurring-package cycle badges), and a link into Subscriptions.
- **Order tracking** (`/order/:id/tracking`) — shipment status, live Delhivery tracking timeline, shipping address, order items/summary, and return-window support panel.
- **Contact** (`/contact`) — contact form, posts to the backend inquiries endpoint.
- **Support** (`/support`) — Privacy Policy, Returns Policy, Shipping Policy, and Terms & Conditions content, with anchor-link navigation.
- **Responsive UI** — Tailwind-based responsive layout across all customer pages (see [§23](#23-responsive-design)).
- **Toast notifications** — `sonner`-based toasts throughout (see [§15](#15-notifications)).
- **Loading/error states** — per-page skeletons/spinners and toast-driven error handling (see [§24](#24-error--loading-handling)).

---

## 5. Authentication

Authentication state and actions live in [`src/context/AuthContext.js`](src/context/AuthContext.js), exposed via `useAuth()`.

- **Session check**: on mount, `checkAuth()` calls `GET /api/auth/verify` (cookie-based) to restore the session; the resolved user is kept in `user` state, and `loading` gates route rendering until this resolves.
- **Mobile OTP login** (`/login`, `/register`): `sendOtp(mobile)` → `POST /api/auth/send-otp`, `verifyOtp(mobile, otp)` → `POST /api/auth/verify-otp`. A first-time number triggers a `completeProfile({ mobile, name })` → `POST /api/auth/complete-profile` step before the session is established.
- **Google authentication**: `loginWithGoogle()` opens a Firebase `signInWithPopup`, then exchanges the Firebase ID token via `POST /api/auth/google`.
- **Logout**: `logout()` calls `POST /api/auth/logout`, signs out of Firebase if applicable, and clears local session state.
- **Session expiry**: the shared axios instance listens for `401`s on session-sensitive endpoints and attempts a silent refresh (`GET /api/auth/verify`); if that also fails it dispatches an `auth:expired` window event, which `AuthContext` handles by logging out and toasting "Your session has expired. Please log in again."
- **Authenticated requests**: the shared axios instance (`src/lib/api.js`) sends cookies (`withCredentials: true`) and, for non-admin API calls, also attaches `Authorization: Bearer <token>` from `localStorage` (`bree_access_token`) as a fallback for browsers (Safari) that can race on cross-site cookie writes.
- **Protected customer routes**: [`ProtectedRoute.js`](src/components/ProtectedRoute.js) redirects unauthenticated users to `/login`, passing the current path as redirect state.
- **Admin authentication** is a **separate** system — see [§14](#14-admin-frontend).

### Login-gated Subscribe and Bulk Order flows

Both the Subscribe and Bulk Order entry points are gated behind login, using a shared pattern in `Login.js`: the caller navigates to `/login` with `state.from` set to either a path string, or `{ pathname, state }` when data needs to be restored after login. `Login.js` extracts both parts and, after a successful login, navigates to `pathname` with that `state` re-attached.

**Subscribe (`ProductCard.js` → `handleSubscribe`)**

```
Logged-out user clicks "Subscribe Now"
  → toast: "Please log in to continue with your subscription."
  → redirect to /login, carrying { product, frequency, subscriptionPrice }
  → successful login
  → automatically continues to /subscription-checkout
    with the original product/subscription data restored
```

Logged-in users skip straight to `/subscription-checkout`.

**Bulk Order (`BulkBookings.js` → `handleSubmit`)**

```
Logged-out user clicks "Request a Quote" (submit)
  → toast: "Please log in to submit a bulk order request."
  → redirect to /login, with from: "/bulk" (no form state carried)
  → successful login
  → returns to the Bulk Order request page (/bulk)
  → the form is NOT auto-submitted — the user re-fills/re-submits manually
```

Logged-in users' submissions proceed directly to `POST /api/bulk-bookings`, which itself requires authentication server-side (see [§16](#16-api-integration)).

---

## 6. Product System

Product data and flags are read from the backend product record (`ProductCard.js`, `Shop.js`, admin `Products.js`/`ProductModal.js`):

- **Pricing**: `price` (selling price) vs `mrp`, with a discount percentage computed client-side.
- **Stock**: `status === "Out Of Stock"` disables Add to Cart/Subscribe and shows an "Out Of Stock" badge.
- **Shipping**: `is_free_shipping` / `shipping_charge` drive a "Free Shipping" or "Shipping ₹X" label per product.
- **Features**: a list of bullet features rendered on the card.
- **Categories**: `product.category`, used to drive Shop page filtering.

### Normal Product vs Subscription Product vs Recurring Package Product

These are three **mutually exclusive** product models, configured by the admin in `ProductModal.js`:

| Model | Flag | Customer flow |
|---|---|---|
| **Normal Product** | (neither flag set) | Add to Cart → one-time Checkout |
| **Subscription Product** | `is_subscription` | "Subscribe Now" → login-gated → recurring billing every N days via Razorpay Subscriptions |
| **Recurring Package Product** | `is_recurring_package`, with `package_duration_months` (number of cycles) and `package_fulfillment_interval_days` (days between shipments) | One payment; the backend fulfills the product across multiple shipping cycles — see [§8](#8-recurring-package--multi-cycle-fulfillment) |

The admin UI enforces `is_subscription` and `is_recurring_package` as mutually exclusive (enabling one disables the other).

---

## 7. Subscription System

- **Identification**: a product is a subscription product when `is_subscription` is truthy; `ProductCard.js` then renders a **"Subscribe Now"** button instead of "Add to Cart".
- **Login protection**: clicking "Subscribe Now" while logged out shows a toast and redirects to `/login`, preserving the selected product/frequency/price; after login the user is sent straight back into `/subscription-checkout` with that data restored (see [§5](#5-authentication)).
- **Subscription Checkout** (`/subscription-checkout`, `ProtectedRoute`): collects/selects a shipping address and contact details, then calls `createSubscription()` (`src/services/subscriptionService.js`) → `POST /api/subscriptions/create`.
- **Frequency & price**: currently fixed at every 30 days (`frequency: 30`) at the price shown on the product card; displayed throughout as "Every {frequency} days".
- **Payment**: the backend returns a Razorpay `subscription_id` + `key_id`; the frontend opens Razorpay Checkout via `openRazorpayCheckout()` (`src/lib/razorpayLoader.js`) and then calls `POST /api/payment/verify` to confirm the payment server-side.
- **Managing subscriptions** (`/subscriptions`, `/subscriptions/:id`, both `ProtectedRoute`): list and detail pages backed by `subscriptionService.js` (`GET /api/subscriptions/my`), supporting **Pause**, **Resume**, and **Cancel** (`POST /api/subscriptions/:id/pause|resume|cancel`). Cancellation is modeled as `subscription_status = "cancellation_requested"` until the current billing cycle ends, at which point the backend/webhook finalizes it as `cancelled`.
- **Authentication requirement**: `POST /api/subscriptions/create` (and all subscription management endpoints) require a valid session — enforced server-side, independent of the frontend gate.

---

## 8. Recurring Package / Multi-Cycle Fulfillment

A **Recurring Package Product** is configured by an admin with:

- `package_duration_months` — number of fulfillment cycles ("Number of Cycles" in the admin Product form)
- `package_fulfillment_interval_days` — days between shipments ("Days Between Shipments" in the admin Product form)

**One customer payment covers the entire package.** The frontend does not schedule, trigger, or perform the recurring fulfillment itself — cycle scheduling and shipment creation are handled by the backend. The frontend's role is to **display** package/cycle state wherever the resulting fulfillment orders appear:

- **Customer → Profile → Orders tab**: an order created from a package cycle shows a badge (`{package_number} · Cycle {fulfillment_cycle} of {package_total_cycles}`), and, while the package is active, the next scheduled fulfillment date (`package_next_fulfillment_date`).
- **Admin → Orders**: the order detail view shows a "Recurring Package — Fulfillment Order" panel (package number, cycle X of Y, package status, next fulfillment date) whenever `order.parent_package_id` is present.
- **Admin → Products list**: recurring package products show a "Package · Nx" badge.

There is no dedicated recurring-package landing page in the current implementation — package/cycle information surfaces as metadata on the orders it produces.

---

## 9. Bulk Order System

The Bulk Order flow is a separate, quote-driven purchase path for corporate/bulk buyers, spread across several routes:

```
Customer (logged in)
  → /bulk                         Bulk Order request form (BulkBookings.js)
  → submits enquiry               POST /api/bulk-bookings (auth required)
  → Admin prepares a quote        (admin Bulk Orders dashboard)
  → customer notified             (quote-ready notification, backend-driven)
  → /bulk-order/:bookingId        Quote review + approval (BulkQuoteApproval.js)
  → approve quote                 POST /api/bulk-bookings/:id/approve-quote
  → /bulk-order/:bookingId/pay    Make Payment (BulkPayment.js)
  → Razorpay Magic Checkout opens
  → payment completes             POST /api/bulk-bookings/:id/verify-payment
  → /bulk-order/payment-success   or /bulk-order/payment-failed
  → Order created (backend)
```

**Request form** (`BulkBookings.js`, route `/bulk`): collects company name, contact person, email, mobile number, estimated quantity (minimum enforced client-side), additional requirements, and a single free-text **Address** field. Submission requires login (see [§5](#5-authentication)).

**Address model** — there are two distinct addresses in this flow, and they are never the same value:

1. **Enquiry Address** — the single `Address` field collected on the initial Bulk Order request form. It is reference-only, used at the enquiry/quote stage.
2. **Final Shipping Address** — collected later by **Razorpay Magic Checkout**, during payment (`BulkPayment.js`). This is the address the resulting Order actually ships to.

**Quote approval** (`BulkQuoteApproval.js`, route `/bulk-order/:bookingId`): fetches the quote via `GET /api/bulk-bookings/:id/quote` and displays quote amount/details; "Approve" posts to `POST /api/bulk-bookings/:id/approve-quote` and redirects to the payment page.

**Payment** (`BulkPayment.js`, route `/bulk-order/:bookingId/pay`): fetches payment details (`GET /api/bulk-bookings/:id/payment`), then opens Razorpay **Magic Checkout** (see [§10](#10-razorpay-magic-checkout-bulk-orders)) and, on success, calls `POST /api/bulk-bookings/:id/verify-payment`. Payment status and duplicate-payment/duplicate-order protections are enforced server-side.

**Payment outcome pages**: `/bulk-order/payment-success` and `/bulk-order/payment-failed` are display-only pages that read the outcome passed via navigation state.

---

## 10. Razorpay Magic Checkout

Bulk Order payments have been **migrated from Razorpay Standard Checkout to Razorpay Magic Checkout**. This is currently specific to the Bulk Order flow:

- `BulkPayment.js` opens Razorpay Checkout with **`one_click_checkout: true`** — the flag that activates Magic Checkout instead of Standard Checkout.
- Magic Checkout itself collects the customer's **final shipping address** inside the Razorpay payment popup — the frontend does not present a separate shipping-address form for Bulk Order payment.
- After the popup reports success, the frontend calls `POST /api/bulk-bookings/:id/verify-payment` with the Razorpay payment/order/signature identifiers; **payment verification and order creation happen entirely on the backend.** The frontend never marks a Bulk Order payment as successful on its own — it only reflects the backend's response.

**Distinguishing the three payment paths in this codebase:**

| Flow | Checkout mode | Address source |
|---|---|---|
| Normal product Checkout (`/checkout`) | Razorpay Checkout (line items configured server-side; see `Checkout.js`/`razorpayLoader.js`) | Collected in Razorpay's popup during checkout |
| Subscription Checkout (`/subscription-checkout`) | Razorpay Checkout for a `subscription_id` | Collected/selected on the Subscription Checkout page before payment |
| Bulk Order Payment (`/bulk-order/:bookingId/pay`) | Razorpay **Magic Checkout** (`one_click_checkout: true`) | Collected by Magic Checkout during payment |

`src/lib/razorpayLoader.js` is the single shared Razorpay integration used by all three flows — there is one Razorpay script loader and one `openRazorpayCheckout()` helper, not separate implementations per flow.

---

## 11. Order Management

Customer-facing order functionality lives mainly in `Profile.js` (Orders tab) and `OrderTracking.js`:

- **Order history** (Profile → Orders tab): `GET /api/orders`, showing order number, items, total, status, and (for package fulfillment orders) cycle badges.
- **Order tracking** (`/order/:id/tracking`): `GET /api/orders/:id/tracking` for order + status history, plus live Delhivery tracking via `GET /api/shipping/track/:awb` when a shipment (AWB) exists. Falls back to the order's own status history timeline when no live tracking data is available yet.
- **Order redirect** (`/order/:id`): a thin redirect route (`OrderRedirect.js`) that forwards to `/order/:id/tracking`.
- **Live updates**: both the Orders tab and the tracking page subscribe to the `order:updated` socket event via `useOrdersSync()` so status changes reflect without a manual refresh; the tracking page also polls live Delhivery status every 30 seconds while the shipment is in a non-terminal state.
- **Payment/order status labels**: centralized in `src/components/orders/orderStatus.js` (`pending_payment`, `paid`, `processing`, `ready_to_ship`, `shipped`, `out_for_delivery`, `delivered`, `cancelled`, `returned`).
- **Recurring package cycle info**: surfaced on both the Orders tab and the tracking flow wherever an order was produced by a package cycle (see [§8](#8-recurring-package--multi-cycle-fulfillment)).

---

## 12. Return / Refund System

Business rule: **after an order is marked delivered, the customer has 48 hours to raise a return/issue.**

```
Order Delivered
  → 48-hour return window opens
  → customer notices a damaged/incorrect/defective product
  → customer contacts BREE Support (WhatsApp / Email / Contact page)
  → BREE Support team manually verifies the request
  → Admin approves the return (admin dashboard)
  → reverse shipment is created and the product is returned
  → inspection/QC
  → refund is processed
```

On the **Order Tracking page**, a "Returns & Support" panel (shown only for delivered orders with no return already on file) computes the same 48‑hour window the backend enforces (from the order's `delivered_at` timestamp) and displays one of three states:

- **Not yet delivered** — generic "contact within 48 hours of delivery" guidance.
- **Window open** — confirms the window is open, and shows WhatsApp / Email / Contact Support links plus a reminder to keep the Order ID and photos/videos ready.
- **Window expired** — a "Return window expired" message; the quick-action contact tiles are no longer shown.

The frontend **only displays eligibility and routes the customer to support** — it does not let the customer directly create a return shipment or self-approve a return; all approval, reverse-shipment creation, inspection, and refund steps are performed by BREE's admin team. The 48-hour eligibility window is a **display convenience only** — final eligibility is independently re-verified by the backend on every admin action.

---

## 13. Customer Profile

`Profile.js` (`/profile`, login required) is a tabbed page:

- **Profile tab**: view/edit name, email, phone; view customer number; change password (hidden for Google-authenticated accounts, which show "Password is managed by your Google account").
- **Addresses tab**: full CRUD on saved addresses (`GET/POST/PUT/DELETE /api/addresses`), plus "Set Default".
- **Orders tab**: order history with status badges, "Track Order" links, and recurring-package cycle badges/next-fulfillment date where applicable (see [§8](#8-recurring-package--multi-cycle-fulfillment) and [§11](#11-order-management)).
- **Subscriptions tab**: a summary card linking out to the full `/subscriptions` management page (see [§7](#7-subscription-system)).

---

## 14. Admin Frontend

The admin dashboard is part of this same frontend project, rendered without the public `Header`/`Footer` for any route under `/admin`, and guarded by a **separate** authentication system.

**Admin authentication**: `AdminAuthContext.js` — email/password login (`POST /api/admin/login`), a JWT stored in `localStorage` (`bree_admin_token`) and sent as an `Authorization: Bearer` header, session check via `GET /api/admin/me`, and logout via `POST /api/admin/logout`. `ProtectedAdminRoute.js` guards every admin route and redirects to `/admin/login` when unauthenticated.

| Page | Route | Purpose |
|---|---|---|
| `AdminLogin.js` | `/admin/login` | Admin sign-in |
| `AdminDashboard.js` | `/admin`, `/admin/dashboard` | Stat cards (orders, revenue, customers, pending orders, bulk booking counts by stage) and a recent-orders table |
| `Orders.js` | `/admin/orders` | Full order management: search/filter/sort/paginate, status updates (single + bulk), Delhivery shipment creation/tracking/label/cancel/pickup, and the full return/refund/QC/inspection workflow (approve/reject return, reverse shipment, mark returned, QC approve/reject, refund approve/reject/complete via Razorpay); also surfaces recurring-package and bulk-order metadata on individual orders |
| `Products.js` + `ProductModal.js` + `ProductRelationsModal.js` | `/admin/products` | Product CRUD (image upload, pricing, stock, shipping config, Journey Level, Subscription/Recurring Package toggles and their fields) and related-product management (recommend/upsell/alternative) |
| `BulkOrders.js` | `/admin/bulk-bookings` | Bulk Order request management — status workflow (New → In Progress → Quoted → Confirmed → Completed/Cancelled), quote entry, Enquiry Address display, communication log, and linked-Order view once payment completes |
| `Customers.js` | `/admin/customers` | Read-only customer list with search and spend/order stats |
| `AdminSubscriptions.js` + `AdminSubscriptionDetails.js` | `/admin/subscriptions`, `/admin/subscriptions/:id` | Subscription list/detail with search/filter and Pause/Resume/Cancel actions, billing history, and renewal-order links |
| `SubscriptionAnalytics.js` | `/admin/subscription-analytics` | Read-only subscription/revenue analytics (active/paused/cancelled counts, MRR, renewal success rate, monthly growth chart) |
| `ContactInquiries.js` | `/admin/inquiries` | Contact form submissions — mark contacted, WhatsApp reply link, delete |
| `Testimonialadmin.js` | `/admin/testimonials` | Testimonial moderation — approve/reject/delete |

Any unmatched `/admin/*` path falls back to the Dashboard (still behind `ProtectedAdminRoute`).

---

## 15. Notifications

All in-app notifications use a single shared toast system (`sonner`, mounted once in `App.js` as `<Toaster position="top-center" richColors />`), invoked via `toast.success(...)` / `toast.error(...)` / `toast.info(...)` throughout the codebase. Representative examples actually present in the code:

- **Login**: "Please log in to continue with your subscription.", "Please log in to submit a bulk order request.", "Login successful.", "Your session has expired. Please log in again."
- **Subscription**: "Subscription {action} requested successfully.", subscription load/action failures.
- **Bulk Order**: enquiry submission success/failure, quote approval success, payment success/failure messages on the Bulk Order pages.
- **Payments/Orders**: cart sync/price-change notices, checkout failure messages, order/tracking load errors.
- **Profile**: profile/address save/delete confirmations and failures.

The frontend integrates with — but does not implement — the backend's email/WhatsApp notification flows (e.g. quote-ready, order confirmation); those are backend concerns and out of scope for this document.

---

## 16. API Integration

All requests go through the single shared axios instance in [`src/lib/api.js`](src/lib/api.js) (base URL from `REACT_APP_BACKEND_URL`/`REACT_APP_API_URL`, `withCredentials: true`, automatic bearer-token attachment, and 401 retry/refresh handling). Endpoint paths confirmed directly from the source (not exhaustive, grouped by area):

- **Authentication**: `GET /api/auth/verify`, `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/resend-otp`, `POST /api/auth/complete-profile`, `POST /api/auth/google`, `POST /api/auth/logout`
- **Profile / Addresses**: `GET/PUT /api/profile`, `PUT /api/profile/password`, `GET/POST /api/addresses`, `PUT/DELETE /api/addresses/:id`, `PUT /api/addresses/:id/default`
- **Products**: `GET /api/products` (Shop/Home), admin `GET/POST/PUT/DELETE /api/admin/products`, `GET/POST /api/admin/products/:id/relations`
- **Cart / Checkout**: `POST /api/orders/validate-cart`, `POST /api/payment/create-order`, `POST /api/payment/verify`
- **Orders**: `GET /api/orders`, `GET /api/orders/:id/tracking`, admin `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`, `PATCH /api/admin/orders/bulk-status`, plus the admin return/refund endpoints under `/api/admin/orders/:id/return/*` and `/refund/*`
- **Shipping**: `GET /api/shipping/track/:awb`, admin `POST /api/shipping/create-shipment/:orderId`, `POST /api/shipping/pickup/:orderId`, `POST /api/shipping/cancel/:orderId`, `GET /api/shipping/label/:awb`
- **Subscriptions**: `POST /api/subscriptions/create`, `GET /api/subscriptions/my`, `POST /api/subscriptions/:id/pause|resume|cancel`
- **Bulk Orders**: `POST /api/bulk-bookings`, `GET /api/bulk-bookings/:id/quote`, `POST /api/bulk-bookings/:id/approve-quote`, `GET /api/bulk-bookings/:id/payment`, `POST /api/bulk-bookings/:id/verify-payment`, admin `GET /api/admin/bulk-bookings`, `GET /api/admin/bulk-bookings/stats`
- **Testimonials / Contact**: `POST /api/testimonials`, `POST /api/contact`, admin `GET /api/admin/testimonials`, `PATCH /api/admin/testimonials/:id/approve|reject`, admin `GET /api/admin/inquiries`, `PATCH /api/admin/inquiries/:id/contacted`
- **Admin auth**: `POST /api/admin/login`, `GET /api/admin/me`, `POST /api/admin/logout`

No endpoint URLs are invented here beyond what the source code calls.

---

## 17. State Management

- **`AuthContext`** (`src/context/AuthContext.js`) — customer session (`user`, `loading`, `authenticating`), OTP/Google login actions, logout, and cross-tab session sync via a `storage` event + `bree-auth-event` `localStorage` key.
- **`AdminAuthContext`** (`src/context/AdminAuthContext.js`) — separate admin session state and actions, independent of `AuthContext`.
- **`CartContext`** (`src/context/CartContext.js`) — cart items, count, subtotal, and computed shipping; persists to `localStorage` (`bree_cart_items`) and reconciles against the backend via `syncCart()` (price/stock/availability changes).
- **`localStorage` usage**: `bree_access_token` (customer access token, used as an `Authorization` fallback), `bree_admin_token` (admin JWT), `bree_cart_items` (cart), plus a generic TTL-based cache under the `bree_cache:` prefix (`src/lib/cache.js`), used for non-critical, cacheable GET responses.
- **Routing state**: React Router's `location.state` is used to pass data across navigations without a global store — most notably the post-login redirect payload described in [§5](#5-authentication), and the Bulk Order payment outcome passed into the success/failure pages.
- **Real-time state**: `socket.io-client` (`src/lib/socket.js`) plus the `useOrdersSync`/`useProductsSync` hooks push live `order:updated` and `product:created|updated|deleted` events into local component state (no global store — each consumer merges updates into its own `useState`).
- There is no Redux/Zustand/MobX in this project — state is managed with React Context + local component state.

---

## 18. Routing

Routing is defined in `App.js` using `react-router-dom` v7 (`BrowserRouter`/`Routes`/`Route`), with route-level code splitting via `React.lazy`. Admin routes (`/admin/*`) render without the public `Header`/`Footer`.

### Public routes (no auth required to view)

| Path | Page |
|---|---|
| `/` | Home |
| `/shop` | Shop |
| `/about` | About |
| `/benefits` | Benefits |
| `/bulk` | Bulk Order request form |
| `/contact` | Contact |
| `/support` | Support (policies) |
| `/checkout/success` | Checkout success |
| `/bulk-order/:bookingId` | Bulk quote approval |
| `/bulk-order/:bookingId/pay` | Bulk order payment |
| `/bulk-order/payment-success` | Bulk payment success |
| `/bulk-order/payment-failed` | Bulk payment failed |
| `/login` | Login |
| `/register` | Register (name + mobile OTP signup) |
| `/order/:id` | Redirects to `/order/:id/tracking` |
| `/order/:id/tracking` | Order tracking |
| `*` | Not Found |

### Customer routes (wrapped in `ProtectedRoute`, redirect to `/login` if not authenticated)

| Path | Page |
|---|---|
| `/checkout` | Checkout |
| `/subscription-checkout` | Subscription Checkout |
| `/subscription-success` | Subscription Success |
| `/subscriptions` | My Subscriptions |
| `/subscriptions/:id` | Subscription Details |
| `/profile` | Profile |

### Admin routes (wrapped in `ProtectedAdminRoute`, redirect to `/admin/login` if not authenticated)

`/admin/login` (unguarded), `/admin`, `/admin/dashboard`, `/admin/orders`, `/admin/subscriptions`, `/admin/subscriptions/:id`, `/admin/subscription-analytics`, `/admin/customers`, `/admin/products`, `/admin/bulk-bookings`, `/admin/inquiries`, `/admin/testimonials`, and a catch-all `/admin/*` → Dashboard.

### Payment / tracking routes

Razorpay payment does not have its own dedicated route — checkout is invoked inline from `/checkout`, `/subscription-checkout`, and `/bulk-order/:bookingId/pay`. Post-payment outcomes are shown on `/checkout/success`, `/subscription-success`, `/bulk-order/payment-success`, and `/bulk-order/payment-failed`. Order/shipment tracking lives at `/order/:id/tracking`.

---

## 19. Environment Variables

All frontend environment variables are Create React App–style `REACT_APP_*` variables (embedded at build time), confirmed by usage in the source and `.env.example`. Set them in a `.env` file at the project root (`bree-frontend/.env`).

```env
# Backend API base URL
REACT_APP_BACKEND_URL=YOUR_VALUE_HERE
# Optional fallback if REACT_APP_BACKEND_URL is not set
REACT_APP_API_URL=YOUR_VALUE_HERE

# Environment label (used for conditional behavior, e.g. dev-only logging)
REACT_APP_ENVIRONMENT=YOUR_VALUE_HERE

# WhatsApp contact number used in support/contact links
REACT_APP_WHATSAPP_NUMBER=YOUR_VALUE_HERE

# Firebase client config — required for Google Sign-In
REACT_APP_FIREBASE_API_KEY=YOUR_VALUE_HERE
REACT_APP_FIREBASE_AUTH_DOMAIN=YOUR_VALUE_HERE
REACT_APP_FIREBASE_PROJECT_ID=YOUR_VALUE_HERE
REACT_APP_FIREBASE_STORAGE_BUCKET=YOUR_VALUE_HERE
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=YOUR_VALUE_HERE
REACT_APP_FIREBASE_APP_ID=YOUR_VALUE_HERE

# Optional — override default/branding asset URLs (src/lib/assets.js)
REACT_APP_LOGO_URL=YOUR_VALUE_HERE
REACT_APP_DEFAULT_PRODUCT_IMAGE=YOUR_VALUE_HERE
REACT_APP_BOTTLE_3D_IMAGE=YOUR_VALUE_HERE
```

Additional variables that affect local tooling only (not application code):

- `WDS_SOCKET_PORT` — CRA dev-server websocket port override.
- `ENABLE_HEALTH_CHECK` — set to `"true"` to enable an optional CRACO webpack health-check plugin/dev endpoints (see `plugins/health-check/`).

**There is no `REACT_APP_RAZORPAY_KEY`** — the Razorpay publishable key is returned by backend API responses at checkout/order-creation time and is never configured as a frontend build-time secret.

> Never commit real values for the above — only placeholders belong in version control (`.env.example` is already set up this way).

---

## 20. Local Development

Commands below are exactly what's defined in `package.json` — no others exist.

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:3000 by default)
npm start

# Production build (outputs to build/)
npm run build

# Run tests (CRA/Jest, via CRACO)
npm test
```

There is no `npm run dev` or `npm run preview` script in this project — use `npm start` for development and serve the `build/` output for a production preview.

**Setup steps:**

1. `cd bree-frontend`
2. `npm install`
3. Copy `.env.example` to `.env` and fill in real values (see [§19](#19-environment-variables))
4. Ensure the backend API is running and reachable at the URL set in `REACT_APP_BACKEND_URL`
5. `npm start`

Node.js version is pinned in `package.json` → `engines`: Node `20.x`, npm `>=10.0.0`.

---

## 21. Build & Deployment

- **Build command**: `npm run build` (CRACO wrapping `react-scripts build`), output directory: **`build/`**.
- **Hosting**: a `vercel.json` is present at the project root with a catch-all SPA rewrite (`"/(.*)" → "/index.html"`), indicating this project is configured for deployment on **Vercel**. No other hosting-provider config (Netlify, Hostinger, etc.) is present in the repository.
- **SPA routing requirement**: because this is a client-side-routed single-page app, any static host must rewrite unmatched paths to `index.html` (as `vercel.json` already does for Vercel) — otherwise a hard refresh on a deep route (e.g. `/order/abc/tracking`) will 404.
- **Environment variables**: must be set on the hosting platform for the target environment (all `REACT_APP_*` variables listed in [§19](#19-environment-variables)) — CRA embeds them at build time, so they must be present **before** `npm run build` runs, not only at runtime.
- `.env.development` / `.env.production` exist locally as environment-specific defaults for local tooling; production secrets/URLs for a real deployment should be configured via the hosting platform's environment variable settings, not committed files.

---

## 22. Security

Frontend security practices actually present in this codebase:

- **Authenticated routes are guarded client-side** (`ProtectedRoute.js`, `ProtectedAdminRoute.js`) — but this is a UX convenience, not the source of truth.
- **All state-changing APIs are independently authenticated server-side** — e.g. `POST /api/subscriptions/create` and `POST /api/bulk-bookings` both require a valid session; the frontend's login gates (toasts + redirects) are a UX layer on top of that backend enforcement, not a substitute for it.
- **No payment secrets in the frontend** — the Razorpay key is provided by the backend per-transaction; there is no Razorpay secret key anywhere in frontend code or environment variables.
- **Payment verification is backend-only** — the frontend never marks a payment/order/subscription as successful itself; it always calls a backend verify endpoint (`/api/payment/verify`, `/api/bulk-bookings/:id/verify-payment`) and renders the backend's response.
- **Session tokens**: the customer session uses an httpOnly cookie as the primary mechanism, with a `localStorage`-held access token used only as a header fallback (see [§5](#5-authentication)); the admin session uses a JWT in `localStorage` sent as a bearer header.
- **No secrets committed**: `.env`, `.env.development`, and `.env.production` are present locally but are expected to be excluded from version control via `.gitignore`; only `.env.example` (placeholders) is meant to be committed.

---

## 23. Responsive Design

The UI is built with Tailwind CSS responsive utilities (`sm:`, `md:`, `lg:`, `xl:` breakpoints) throughout, and is designed to work across desktop, tablet, and mobile. Confirmed responsive behavior includes:

- Collapsible/mobile navigation in `Header.js` and the admin `AdminLayout.js` sidebar (fixed on desktop, slide-in drawer on mobile).
- Responsive grid layouts on Shop, Home, Profile, Subscription, and Bulk Order pages (column counts change by breakpoint).
- A cart drawer and modal dialogs sized appropriately for small viewports.

---

## 24. Error / Loading Handling

- **Loading states**: page-level `PageLoader` (route-level `Suspense` fallback in `App.js`), plus per-page skeletons/spinners (e.g. `LoadingSkeleton` on Bulk Payment, animated skeleton cards on Subscriptions, `Loader2` spinners on Profile/Orders/Tracking while fetching).
- **API errors**: the shared axios instance normalizes error messages (`getApiErrorMessage()` in `src/lib/api.js`) and surfaces network-vs-backend failures distinctly; most pages show a `toast.error(...)` with the backend's message when available, falling back to a generic message.
- **Empty states**: e.g. "No orders yet. Start your wellness journey!", "No Wellness Memberships Yet", "No addresses saved yet.", "No bulk bookings found." (admin).
- **Out-of-stock state**: disabled Add to Cart/Subscribe buttons with an "Out Of Stock" badge on `ProductCard.js`.
- **Payment failure handling**: Razorpay popup dismissal/failure is caught in `razorpayLoader.js` and surfaced as a toast (e.g. "Payment cancelled."); Bulk Order payment failures redirect to `/bulk-order/payment-failed`.
- **Authentication errors**: invalid OTP / failed Google sign-in surface as toasts from within `AuthContext`; expired sessions trigger the `auth:expired` flow described in [§5](#5-authentication).

---

## 25. Important Business Flows

**Normal Purchase**

```
Product → Add to Cart → /checkout (login required) → Razorpay Checkout
        → Payment → Order created → /checkout/success → Delivery (tracked via /order/:id/tracking)
```

**Subscription**

```
Subscription Product → "Subscribe Now" → Login required (if logged out, redirected and restored after login)
        → /subscription-checkout → Razorpay Checkout (subscription) → Payment
        → Subscription created → manage via /subscriptions
```

**Bulk Order**

```
Login → /bulk (Bulk Request, single Enquiry Address) → Admin prepares Quote
      → Customer reviews & approves Quote (/bulk-order/:bookingId)
      → Make Payment → Razorpay Magic Checkout → Final Shipping Address collected
      → Payment verified (backend) → Order created
```

**Recurring Package**

```
Recurring Package Product → One Payment → Cycle 1 fulfillment
        → Cycle 2 → Cycle 3 → ... → Final Cycle
```
(Cycle scheduling and fulfillment order creation are backend-driven; the frontend only displays cycle/package status on the resulting orders — see [§8](#8-recurring-package--multi-cycle-fulfillment).)

**Return**

```
Order Delivered → 48-hour return window
        → Customer contacts BREE Support (WhatsApp / Email / Contact page)
        → Admin verification → Return approval (admin) → Reverse shipment
        → Inspection/QC → Refund
```

---

## 26. Troubleshooting

- **App loads but all API calls fail / network errors**: confirm the backend is running and `REACT_APP_BACKEND_URL` (or `REACT_APP_API_URL`) in `.env` points to it; `src/lib/api.js` will surface `"Unable to reach the backend..."` when there's no response at all.
- **CORS errors in the browser console**: the backend must allow the frontend's origin and `credentials: true` (the frontend always sends `withCredentials: true`); check the backend CORS configuration, not the frontend.
- **Environment variable changes not taking effect**: CRA embeds `REACT_APP_*` variables at build/start time — restart `npm start` (or rebuild) after editing `.env`.
- **Razorpay checkout not opening**: check the browser console for `[RazorpayLoader]` errors — usually a blocked/failed script load (`https://checkout.razorpay.com/...`) or a missing `key_id`/`order_id` in the backend's order-creation response; `openRazorpayCheckout()` throws a clear error for each case.
- **Login redirect doesn't return you to where you started**: the redirect relies on `location.state.from`; if you navigated to `/login` directly (no `state`), you'll land on `/` after login — this is expected, not a bug.
- **Build errors after pulling changes**: delete `node_modules` and reinstall (`rm -rf node_modules && npm install`) — a dependency version drift is the most common cause with CRA/CRACO.
- **Refreshing a deep route (e.g. `/order/abc/tracking`) 404s in production**: the hosting platform must be configured with an SPA rewrite to `index.html` (already set up for Vercel via `vercel.json`); other hosts need an equivalent rule.
- **Google Sign-In fails with a Firebase config error**: verify all six `REACT_APP_FIREBASE_*` variables are set — `src/lib/firebase.js` disables Firebase entirely (with a console warning) if any are missing.

---

## 27. Development Guidelines

Conventions observed in this codebase — follow them when extending it:

- **Reuse existing components** — shadcn/ui primitives live in `src/components/ui/`; prefer them over introducing new UI libraries.
- **Reuse `AuthContext` / `AdminAuthContext`** for any auth-dependent logic — do not read tokens/cookies directly in page components.
- **Reuse the shared axios instance** (`src/lib/api.js`) for all API calls — it already handles base URL resolution, credentials, auth headers, and 401 handling; do not instantiate a second axios client.
- **Reuse the toast system** (`sonner`, already mounted in `App.js`) for all user-facing success/error feedback.
- **Do not create a second Razorpay integration** — all checkout flows share `src/lib/razorpayLoader.js`.
- **Keep payment verification server-side** — never set an order/subscription/bulk-booking to a "paid"/"success" state from the frontend alone; always call the backend verify endpoint and render its response.
- **Do not expose secrets in frontend code or `.env`** — only publishable/public configuration belongs in `REACT_APP_*` variables.
- **Preserve existing business workflows** — the Subscribe, Bulk Order, and Checkout flows encode specific product/business rules (login gating, address models, payment modes); changes to one should not alter the others unless explicitly intended.

---

## 28. Project Status

Current, implemented state of this frontend:

- ✅ Product catalog, cart, and one-time Razorpay checkout
- ✅ Mobile OTP + Google authentication, with session persistence and cross-tab sync
- ✅ Subscription products — subscribe, checkout, pause/resume/cancel, billing history
- ✅ Login-gated Subscribe flow, with product/subscription data restored after login
- ✅ Login-gated Bulk Order request flow (manual re-submit after login, no auto-submit)
- ✅ Bulk Order request → admin quote → customer approval → Magic Checkout payment → order creation
- ✅ Razorpay Magic Checkout for Bulk Orders, with backend-side payment verification
- ✅ Recurring package (multi-cycle fulfillment) display on customer and admin order views
- ✅ Order tracking with live Delhivery status and a 48-hour return-eligibility support panel
- ✅ Customer profile (profile info, addresses, orders, subscriptions overview)
- ✅ Admin dashboard: orders (incl. shipping + full return/refund/QC workflow), products, bulk bookings, customers, subscriptions + analytics, testimonials, contact inquiries
- ✅ Real-time order/product updates via Socket.IO
- ✅ Toast-based notifications and consistent loading/error/empty states throughout

This section reflects the current implementation only — it is not a historical changelog or QA audit log.
