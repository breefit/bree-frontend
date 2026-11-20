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
import { refreshSocketAuth } from "@/lib/socket";

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

  // FIX (Socket.IO security audit): the server assigns order-event rooms
  // at handshake time from the session, so the socket re-handshakes
  // whenever the signed-in identity changes (login, logout, session
  // restored on reload). No-op until a page has opened the socket.
  useEffect(() => {
    refreshSocketAuth();
  }, [admin?.id]);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  // Set when GET /api/admin/me fails for a reason other than "not signed in"
  // (network error, 5xx). The session is NOT cleared in that case, so a
  // transient backend error doesn't bounce the admin to the login page.
  const [error, setError] = useState(null);

  // The admin's identity (id, name, email) always comes from the DB via
  // GET /api/admin/me or the login response — never from browser storage or
  // from decoding a JWT client-side.
  const verifyAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/admin/me");
      setAdmin(data.admin || null);
      setError(null);
      return data.admin || null;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 404) {
        // Not authenticated, or the admin row no longer exists: clear auth
        // state. ProtectedAdminRoute then redirects to /admin/login.
        setAdmin(null);
        clearAdminToken();
        setError(null);
      } else {
        setError(err);
      }
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
      setError(null);
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
      setError(null);
      clearAdminToken();
    }
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        loading,
        error,
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
