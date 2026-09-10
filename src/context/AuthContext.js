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
        const response = await axios.get("/api/auth/verify");
        setUser(response.data);
        if (response.data?.accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, response.data.accessToken);
        }
        return response.data;
      } catch {
        // Verify failed — user is not logged in
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
    checkAuth();
  }, [checkAuth]);

  // FIX #3: auth:expired now does a full graceful logout with loading state
  // instead of bare setUser(null), preventing abrupt mid-page redirects and
  // ensuring cookies + refresh tokens are properly revoked on the backend.
  useEffect(() => {
    const handleAuthExpired = async () => {
      if (authExpiryHandledRef.current) return;
      authExpiryHandledRef.current = true;
      setLoading(true);
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
      setLoading(false);
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
