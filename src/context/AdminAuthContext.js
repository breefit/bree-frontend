import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import axios from "@/lib/api";
import { toast } from "sonner";
import { setAdminToken, clearAdminToken } from "@/lib/tokenStore";

const AdminAuthContext = createContext();

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
};

export const AdminAuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);

  const verifyAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/admin/me");
      setAdmin(data.admin || null);
      return data.admin || null;
    } catch (error) {
      setAdmin(null);
      clearAdminToken();
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // FIX (ISSUE-008 — admin token must not live in localStorage): this used
  // to gate the mount-time check on a stored localStorage token ("avoids
  // 401 spam on public pages"), which relied on that token surviving a
  // reload. The token now lives in memory only (lib/tokenStore.js) and is
  // lost on reload by design, so this always re-verifies via the httpOnly
  // admin cookie instead — the same pattern AuthContext.js's checkAuth()
  // already uses correctly. The admin app has no real "public" pages other
  // than the login screen itself, where a single expected 401 is harmless
  // (identical to how the customer-facing app already behaves).
  useEffect(() => {
    verifyAdmin();
  }, [verifyAdmin]);

  const loginAdmin = async (email, password) => {
    setAuthenticating(true);
    try {
      const { data } = await axios.post("/api/admin/login", {
        email,
        password,
      });
      setAdmin(data.admin || null);
      setAdminToken(data.token);

      return data.admin;
    } catch (error) {
      throw error;
    } finally {
      setAuthenticating(false);
    }
  };

  const logoutAdmin = async () => {
    try {
      await axios.post("/api/admin/logout");
    } catch (err) {
      toast.error(
        "Unable to log out cleanly. You will still be signed out locally.",
      );
    } finally {
      setAdmin(null);
      clearAdminToken();
    }
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
        authenticating,
        loginAdmin,
        logoutAdmin,
        verifyAdmin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};
