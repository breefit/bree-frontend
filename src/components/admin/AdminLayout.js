import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminAuth } from "@/context/AdminAuthContext";

import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Package,
  MessageSquare,
  BriefcaseBusiness,
  Repeat,
  BarChart3,
  LogOut,
  X,
  Star,
  Menu,
  User as UserIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

const NAV_ITEMS = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/admin",
  },

  {
    icon: ShoppingBag,
    label: "Orders",
    path: "/admin/orders",
  },

  {
    icon: BriefcaseBusiness,
    label: "Bulk Bookings",
    path: "/admin/bulk-bookings",
  },

  {
    icon: Users,
    label: "Customers",
    path: "/admin/customers",
  },

  {
    icon: Package,
    label: "Products",
    path: "/admin/products",
  },

  {
    icon: Repeat,
    label: "Subscriptions",
    path: "/admin/subscriptions",
  },

  {
    icon: BarChart3,
    label: "Analytics",
    path: "/admin/subscription-analytics",
  },

  {
    icon: MessageSquare,
    label: "Inquiries",
    path: "/admin/inquiries",
  },

  {
    icon: Star,
    label: "Testimonials",
    path: "/admin/testimonials",
  },
];

const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_bree-daily-ritual/artifacts/9o6pw5yg_a2475dc8-5e69-4671-af95-51ab7af4142f.png";

// Footer identity block. Name/email come from the AdminAuthContext, which is
// populated only from the DB (GET /api/admin/me on mount, or the login
// response). A 401 from /me clears that state and ProtectedAdminRoute
// redirects to /admin/login, so no extra fetch is needed here.
const SidebarProfile = () => {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-2" aria-busy="true">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }

  const name = admin?.name?.trim() || "";
  const email = admin?.email?.trim() || "";

  if (!name && !email) {
    // Neutral fallback: no fake identity.
    return (
      <div className="flex items-center gap-3 px-2">
        <Avatar className="w-10 h-10">
          <AvatarFallback className="bg-bree-accent text-bree-primary">
            <UserIcon className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
        <p className="flex-1 min-w-0 text-sm text-bree-text-secondary truncate">
          Account details unavailable
        </p>
      </div>
    );
  }

  const initial = (name || email).charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-2">
      <Avatar className="w-10 h-10">
        <AvatarFallback className="bg-bree-accent text-bree-primary font-semibold text-sm">
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium text-bree-text-primary truncate"
          title={name || email}
        >
          {name || email}
        </p>

        {name && email && (
          <p className="text-xs text-bree-text-secondary truncate" title={email}>
            {email}
          </p>
        )}
      </div>
    </div>
  );
};

const SidebarContent = ({ onClose }) => {
  const navigate = useNavigate();
  const { logoutAdmin } = useAdminAuth();

  const handleLogout = async () => {
    await logoutAdmin();
    navigate("/admin/login");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="relative flex items-center justify-center">
            {/* Glow */}
            <div className="absolute inset-0 bg-bree-primary/15 blur-xl rounded-full scale-125" />

            {/* Logo Image */}
            <div className="relative w-16 h-16 rounded-2xl bg-white shadow-[0_10px_30px_rgba(132,169,93,0.25)] border border-bree-border flex items-center justify-center overflow-hidden">
              <img
                src={LOGO_URL}
                alt="BREE Logo"
                className="w-12 h-12 object-contain drop-shadow-md"
              />
            </div>
          </div>

          {/* Text */}
          <div>
            <h1 className="font-outfit font-bold text-3xl leading-none tracking-tight text-bree-text-primary">
              BREE
            </h1>

            <p className="text-sm text-bree-text-secondary tracking-[0.35em] uppercase mt-1">
              Admin
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bree-bg text-bree-text-secondary lg:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ icon: Icon, label, path }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/admin"}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-bree-primary text-white shadow-sm"
                  : "text-bree-text-secondary hover:bg-bree-bg hover:text-bree-text-primary"
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />

            {label}
          </NavLink>
        ))}
      </nav>

      {/* Profile + Logout */}
      <div className="px-4 py-4 border-t border-bree-border space-y-3">
        {/* User */}
        <SidebarProfile />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
};

const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-bree-bg overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-bree-border flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full w-64 bg-white z-50 lg:hidden shadow-2xl"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-bree-border flex items-center justify-between px-4 md:px-6 flex-shrink-0">
          {/* Mobile Menu */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-bree-bg text-bree-text-secondary transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Right actions: profile / placeholders */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-2xl font-bold text-bree-text-primary">
              Admin Panel
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
