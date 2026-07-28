import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Suspense, lazy } from "react";
import { HelmetProvider } from "react-helmet-async"; // FIX: Missing HelmetProvider wrapper
import ScrollToTop from "@/components/ScrollToTop";

// Lazy-loaded Pages
const Home = lazy(() => import("@/pages/Home"));
const Shop = lazy(() => import("@/pages/Shop"));
const About = lazy(() => import("@/pages/About"));
const Benefits = lazy(() => import("@/pages/Benefits"));
const Contact = lazy(() => import("@/pages/Contact"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));

const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register")); // FIX: Register page was imported in routes but missing lazy import
const Profile = lazy(() => import("@/pages/Profile"));
const OrderTracking = lazy(() => import("@/pages/OrderTracking"));
const Support = lazy(() => import("@/pages/Support"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// Admin Pages
const AdminLogin = lazy(() => import("@/pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const Orders = lazy(() => import("@/pages/admin/Orders"));
const Customers = lazy(() => import("@/pages/admin/Customers"));
const Products = lazy(() => import("@/pages/admin/Products"));
const BulkOrders = lazy(() => import("@/pages/admin/BulkOrders"));
const ContactInquiries = lazy(() => import("@/pages/admin/ContactInquiries"));
const TestimonialAdmin = lazy(() => import("@/pages/admin/Testimonialadmin"));
const AdminSubscriptions = lazy(
  () => import("@/pages/admin/AdminSubscriptions"),
);
const AdminSubscriptionDetails = lazy(
  () => import("@/pages/admin/AdminSubscriptionDetails"),
);
const SubscriptionAnalytics = lazy(
  () => import("@/pages/admin/SubscriptionAnalytics"),
);

const SubscriptionCheckout = lazy(() => import("@/pages/SubscriptionCheckout"));

const SubscriptionSuccess = lazy(() => import("@/pages/SubscriptionSuccess"));
const MySubscriptions = lazy(() => import("@/pages/MySubscriptions"));
const SubscriptionDetails = lazy(() => import("@/pages/SubscriptionDetails"));

// Admin Guard — NOT lazy (tiny, always needed for route protection)
// FIX: ProtectedAdminRoute should NOT be lazy — it causes a flash/delay on protected routes
import ProtectedAdminRoute from "@/components/admin/ProtectedAdminRoute";
import { AdminAuthProvider } from "@/context/AdminAuthContext";

// Components
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProtectedRoute from "@/components/ProtectedRoute";
import { CartProvider } from "@/context/CartContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import BulkBookings from "./pages/BulkBookings";

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bree-bg">
      <div className="spinner w-10 h-10" />
    </div>
  );
}

function AppRouter() {
  const location = useLocation();
  const { loading } = useAuth();

  if (loading) return <PageLoader />;

  // Admin routes — rendered without public Header/Footer
  if (location.pathname.startsWith("/admin")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <ProtectedAdminRoute>
                <AdminDashboard />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedAdminRoute>
                <AdminDashboard />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedAdminRoute>
                <Orders />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <ProtectedAdminRoute>
                <AdminSubscriptions />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/subscriptions/:id"
            element={
              <ProtectedAdminRoute>
                <AdminSubscriptionDetails />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/subscription-analytics"
            element={
              <ProtectedAdminRoute>
                <SubscriptionAnalytics />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <ProtectedAdminRoute>
                <Customers />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedAdminRoute>
                <Products />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/bulk-bookings"
            element={
              <ProtectedAdminRoute>
                <BulkOrders />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/inquiries"
            element={
              <ProtectedAdminRoute>
                <ContactInquiries />
              </ProtectedAdminRoute>
            }
          />
          <Route
            path="/admin/testimonials"
            element={
              <ProtectedAdminRoute>
                <TestimonialAdmin />
              </ProtectedAdminRoute>
            }
          />
          {/* FIX: Catch-all for unknown admin routes → redirect to dashboard */}
          <Route
            path="/admin/*"
            element={
              <ProtectedAdminRoute>
                <AdminDashboard />
              </ProtectedAdminRoute>
            }
          />
        </Routes>
      </Suspense>
    );
  }

  // Public routes
  return (
    <Suspense fallback={<PageLoader />}>
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/about" element={<About />} />
          <Route path="/benefits" element={<Benefits />} />
          <Route path="/bulk" element={<BulkBookings />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/support" element={<Support />} />
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />
          <Route path="/checkout/success" element={<CheckoutSuccess />} />
          <Route
            path="/subscription-checkout"
            element={
              <ProtectedRoute>
                <SubscriptionCheckout />
              </ProtectedRoute>
            }
          />

          <Route
            path="/subscription-success"
            element={
              <ProtectedRoute>
                <SubscriptionSuccess />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <ProtectedRoute>
                <MySubscriptions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/subscriptions/:id"
            element={
              <ProtectedRoute>
                <SubscriptionDetails />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="/order/:id" element={<OrderRedirect />} />
          <Route path="/order/:id/tracking" element={<OrderTracking />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        {/* <Route
          path="/order/:id"
          element={
            <ProtectedRoute>
            <OrderDetails />
            </ProtectedRoute>
            }
            /> */}
      </main>
      <Footer />
    </Suspense>
  );
}

function App() {
  return (
    // FIX: Wrap entire app in HelmetProvider — required for react-helmet-async to work
    <HelmetProvider>
      <AuthProvider>
        <AdminAuthProvider>
          <CartProvider>
            <div className="App app-shell flex min-h-0 flex-col bg-bree-bg">
              <BrowserRouter>
                <ScrollToTop />
                <AppRouter />
              </BrowserRouter>
              {/* FIX: Toaster moved inside BrowserRouter wrapper so it can access router context if needed */}
              <Toaster position="top-center" richColors />
            </div>
          </CartProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </HelmetProvider>
  );
}

export default App;
