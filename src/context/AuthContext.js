import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import axios, { getApiErrorMessage } from "@/lib/api";
import {
  firebaseAuth,
  googleAuthProvider,
  firebaseInitError,
} from "@/lib/firebase";
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  setPersistence,
  onAuthStateChanged,
  browserLocalPersistence,
} from "firebase/auth";
import { toast } from "sonner";

const AuthContext = createContext();
const ACCESS_TOKEN_KEY = "bree_access_token";

const normalizeOtpMobile = (mobile) => {
  const digits = String(mobile || "")
    .trim()
    .replace(/\D/g, "");

  return digits.startsWith("91") && digits.length === 12
    ? digits.slice(2)
    : digits;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const AUTH_EVENT_KEY = "bree-auth-event";
  const authCheckPromiseRef = useRef(null);
  const authExpiryHandledRef = useRef(false);

  const broadcastAuthEvent = (action) => {
    window.dispatchEvent(new Event("auth:updated"));
    localStorage.setItem(
      AUTH_EVENT_KEY,
      JSON.stringify({ action, timestamp: Date.now() }),
    );
  };

  const checkAuth = useCallback(async () => {
    if (authCheckPromiseRef.current) {
      return authCheckPromiseRef.current;
    }

    setLoading(true);
    authCheckPromiseRef.current = (async () => {
      try {
        // Always verify via cookie — don't gate on localStorage
        // Dev-only diagnostic (never logs tokens/cookies): one line per
        // verify outcome. The dedupe above guarantees at most one verify
        // per initialization burst, so this cannot log-loop.
        if (process.env.NODE_ENV === "development") {
          console.info("[auth] verify started");
        }
        const response = await axios.get("/api/auth/verify");
        if (process.env.NODE_ENV === "development") {
          console.info("[auth] verify finished: authenticated");
        }
        setUser(response.data);
        if (response.data?.accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
        }
        return response.data;
      } catch {
        // Verify failed — user is not logged in. This is the EXPECTED outcome
        // for every logged-out visitor: handle it as terminal state. The
        // axios interceptor (lib/api.js) short-circuits verify 401s so they
        // cannot trigger the refresh/auth:expired flow, and this promise is
        // deduped — so no loop is possible from here.
        if (process.env.NODE_ENV === "development") {
          console.info("[auth] verify finished: unauthenticated");
        }
        setUser(null);
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        return null;
      } finally {
        setLoading(false);
        authCheckPromiseRef.current = null;
      }
    })();

    return authCheckPromiseRef.current;
  }, []);

  useEffect(() => {
    // authCheckPromiseRef dedupes concurrent calls (StrictMode double-mount,
    // multiple listeners) into a single /api/auth/verify request.
    checkAuth();
  }, [checkAuth]);

  // FIX #3: auth:expired does a full graceful logout — revoking cookies +
  // refresh tokens on the backend — but MUST NOT flip `loading` back to true.
  // FIX (auth 429 root cause): setLoading(true) here unmounted the entire
  // routed tree (AppRouter returns <PageLoader/> while loading), so the page
  // the expiry happened on was destroyed and remounted right after — its
  // data-fetch effects re-ran, and any auth check that raced the logout POST
  // could re-verify and fire auth:expired again. The user state change below
  // is enough for every consumer (ProtectedRoute redirects, Header re-renders);
  // the routed tree stays mounted, so no effect storm and no extra requests.
  useEffect(() => {
    const handleAuthExpired = async () => {
      if (authExpiryHandledRef.current) return;
      authExpiryHandledRef.current = true;
      try {
        await axios.post("/api/auth/logout", {});
      } catch {
        // Session already gone on the backend — ignore the error
      }
      if (firebaseAuth) {
        firebaseSignOut(firebaseAuth).catch(() => null);
      }
      setUser(null);
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      broadcastAuthEvent("logout");
      toast.error("Your session has expired. Please log in again.");
      authExpiryHandledRef.current = false;
    };

    const handleStorageEvent = (event) => {
      if (event.key === AUTH_EVENT_KEY && event.newValue) {
        checkAuth();
      }
    };

    window.addEventListener("auth:expired", handleAuthExpired);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      window.removeEventListener("auth:expired", handleAuthExpired);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [checkAuth]);

  useEffect(() => {
    if (!firebaseAuth) return;

    setPersistence(firebaseAuth, browserLocalPersistence).catch((error) => {
      console.warn(
        "Unable to set Firebase persistence:",
        error.message || error,
      );
    });

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (!firebaseUser) return;
      firebaseUser.getIdToken(true).catch(() => null);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    if (!firebaseAuth) {
      const error =
        firebaseInitError || new Error("Firebase is not configured correctly.");
      console.error("Google login blocked:", error);
      toast.error(
        "Google login is unavailable. Verify REACT_APP_FIREBASE_* variables and restart the front-end server.",
      );
      throw error;
    }

    setAuthenticating(true);

    try {
      const result = await signInWithPopup(firebaseAuth, googleAuthProvider);
      const firebaseToken = await result.user.getIdToken();
      const response = await axios.post("/api/auth/google", {
        token: firebaseToken,
      });
      setUser(response.data);
      if (response.data?.accessToken) {
        localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
      }
      broadcastAuthEvent("login");
      toast.success(
        `Welcome back, ${response.data.name || "wellness friend"}!`,
      );
      return response.data;
    } catch (error) {
      const code = error?.code;
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        toast.error("Google sign-in was closed before completion.");
      } else if (firebaseInitError) {
        toast.error(firebaseInitError.message);
      } else {
        const apiMessage =
          error?.response?.data?.message ||
          error?.message ||
          "Unable to complete Google login.";
        toast.error(apiMessage);
      }
      console.error("Google login failed:", error);
      throw error;
    } finally {
      setAuthenticating(false);
    }
  };

  const sendOtp = async (mobile) => {
    try {
      const normalizedMobile = normalizeOtpMobile(mobile);
      const response = await axios.post("/api/auth/send-otp", {
        mobile: normalizedMobile,
      });
      toast.success("OTP sent successfully to your WhatsApp.");
      return response.data;
    } catch (error) {
      toast.error(getApiErrorMessage(error) || "Failed to send OTP.");
      throw error;
    }
  };

  const verifyOtp = async (mobile, otp) => {
    try {
      const normalizedMobile = normalizeOtpMobile(mobile);
      const response = await axios.post("/api/auth/verify-otp", {
        mobile: normalizedMobile,
        otp,
      });

      setUser(response.data);
      if (response.data?.accessToken) {
        localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
      }
      broadcastAuthEvent("login");
      toast.success("Login successful.");
      return response.data;
    } catch (error) {
      toast.error(getApiErrorMessage(error) || "Invalid OTP.");
      throw error;
    }
  };

  const resendOtp = async (mobile) => {
    try {
      const normalizedMobile = normalizeOtpMobile(mobile);
      const response = await axios.post("/api/auth/resend-otp", {
        mobile: normalizedMobile,
      });
      toast.success("OTP resent successfully.");
      return response.data;
    } catch (error) {
      toast.error(getApiErrorMessage(error) || "Failed to resend OTP.");
      throw error;
    }
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout", {});
    } catch {
      // ignore logout network failure
    }

    if (firebaseAuth) {
      firebaseSignOut(firebaseAuth).catch(() => null);
    }

    setUser(null);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    broadcastAuthEvent("logout");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authenticating,
        loginWithGoogle,
        sendOtp,
        verifyOtp,
        resendOtp,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
