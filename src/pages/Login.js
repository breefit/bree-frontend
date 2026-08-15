import { Helmet } from "react-helmet-async";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Phone, KeyRound, Loader2, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";

const RESEND_SECONDS = 30;

// Masks a 10-digit mobile number for display, keeping the first 2 and
// last 2 digits visible (e.g. 6281241187 -> 62******87). The country
// code is handled separately by the caller and is never touched here.
// Falls back to returning the value unchanged if it isn't a full
// 10-digit number, so we never show something misleading or throw.
const maskMobileNumber = (mobile) => {
  if (!mobile || typeof mobile !== "string" || mobile.length < 10) {
    return mobile;
  }
  const first = mobile.slice(0, 2);
  const last = mobile.slice(-2);
  const masked = "*".repeat(mobile.length - 4);
  return `${first}${masked}${last}`;
};

const Login = () => {
  const {
    loginWithGoogle,
    sendOtp,
    verifyOtp,
    resendOtp,
    completeProfile,
    authenticating,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // `from` may be a plain path string, or `{ pathname, state }` when the
  // caller needs to hand back data (e.g. the selected product/subscription
  // details) for the destination page to pick up after login. React
  // Router's navigate(to, opts) only reads pathname/search/hash off `to` —
  // any `state` nested inside `to` itself is silently dropped, so it must
  // be pulled out here and passed as its own `state` option below.
  const from = location.state?.from;
  const redirectPath = (typeof from === "string" ? from : from?.pathname) || "/";
  const redirectState = typeof from === "object" ? from?.state : undefined;

  const [step, setStep] = useState("mobile"); // 'mobile' | 'otp' | 'profile'
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef(null);
  const mobileInputRef = useRef(null);
  const otpInputRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (resendTimer <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [resendTimer]);

  useEffect(() => {
    if (step === "mobile") {
      mobileInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (step === "otp") {
      otpInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (step === "profile") {
      nameInputRef.current?.focus();
    }
  }, [step]);

  const handleMobileChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setMobile(value);
  };

  const handleOtpChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(value);
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (mobile.length !== 10) {
      return;
    }

    setIsLoading(true);
    try {
      await sendOtp(mobile);
      setStep("otp");
      setResendTimer(RESEND_SECONDS);
    } catch (error) {
      // Error toast already shown by AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      return;
    }

    setIsLoading(true);
    try {
      // verifyOtp() must resolve with the backend response shape:
      // existing user -> { success, isNewUser: false, user, accessToken }
      // new user      -> { success, isNewUser: true, mobile }
      const response = await verifyOtp(mobile, otp);
      if (response?.isNewUser === true) {
        setStep("profile");
      } else {
        navigate(redirectPath, { replace: true, state: redirectState });
      }
    } catch (error) {
      // Error toast already shown by AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setIsLoading(true);
    try {
      await resendOtp(mobile);
      setResendTimer(RESEND_SECONDS);
    } catch (error) {
      // Error toast already shown by AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeNumber = () => {
    setStep("mobile");
    setOtp("");
    setName("");
    setResendTimer(0);
  };

  const handleCompleteProfile = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      return;
    }

    setIsLoading(true);
    try {
      await completeProfile({
        mobile,
        name: name.trim(),
      });
      navigate(redirectPath, { replace: true, state: redirectState });
    } catch (error) {
      // Error toast already shown by AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Login — BREE Wellness</title>
        <meta
          name="description"
          content="Sign in to your BREE account to manage orders, addresses, and your wellness subscription."
        />
      </Helmet>
      <div className="pt-24 min-h-screen bg-bree-bg flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white p-8 md:p-10 rounded-3xl shadow-sm"
          >
            <div className="text-center mb-8">
              <span className="text-xs tracking-[0.2em] uppercase font-semibold text-bree-primary">
                Welcome Back
              </span>
              <h1 className="font-outfit text-3xl font-light text-bree-text-primary mt-2">
                {step === "profile" ? "Welcome to BREE" : "Sign In"}
              </h1>
              {step === "profile" && (
                <p className="text-sm text-bree-text-secondary mt-3">
                  Please tell us your name to finish creating your account.
                </p>
              )}
            </div>

            {/* Google Login Button */}
            {step !== "profile" && (
              <>
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      await loginWithGoogle();
                      navigate(redirectPath, { replace: true, state: redirectState });
                    } catch (error) {
                      // error handled in AuthContext
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  data-testid="google-login-btn"
                  disabled={authenticating || isLoading}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 border border-bree-border rounded-full hover:bg-bree-bg transition-colors mb-6 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {authenticating ? (
                    <span className="flex items-center gap-2 font-medium text-bree-text-primary">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    <span className="font-medium text-bree-text-primary">
                      Continue with Google
                    </span>
                  )}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-bree-border" />
                  <span className="text-sm text-bree-text-secondary">or</span>
                  <div className="flex-1 h-px bg-bree-border" />
                </div>
              </>
            )}

            {/* Mobile OTP Form */}
            {step === "mobile" && (
              <form
                onSubmit={handleSendOtp}
                className="space-y-4"
                data-testid="mobile-otp-form"
              >
                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-bree-text-primary">
                    Mobile Number
                  </Label>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-bree-text-secondary" />
                    <span className="absolute left-10 top-1/2 -translate-y-1/2 text-bree-text-primary font-medium">
                      +91
                    </span>
                    <Input
                      ref={mobileInputRef}
                      id="mobile"
                      name="mobile"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={mobile}
                      onChange={handleMobileChange}
                      placeholder="10-digit mobile number"
                      data-testid="auth-mobile"
                      className="pl-20 rounded-xl border-bree-border"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || mobile.length !== 10}
                  data-testid="send-otp-btn"
                  className="w-full bg-bree-primary hover:bg-bree-primary-hover text-white py-6 rounded-full font-medium"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending OTP...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Send OTP
                      <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>
              </form>
            )}

            {/* OTP Verify Form */}
            {step === "otp" && (
              <form
                onSubmit={handleVerifyOtp}
                className="space-y-4"
                data-testid="otp-verify-form"
              >
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-bree-text-primary">
                    Enter OTP
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-bree-text-secondary" />
                    <Input
                      ref={otpInputRef}
                      id="otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={handleOtpChange}
                      placeholder="6-digit OTP"
                      data-testid="auth-otp"
                      className="pl-10 rounded-xl border-bree-border"
                    />
                  </div>
                  <p className="text-sm text-bree-text-secondary">
                    OTP sent to +91 {maskMobileNumber(mobile)} via WhatsApp.{" "}
                    <button
                      type="button"
                      onClick={handleChangeNumber}
                      className="text-bree-primary font-medium hover:underline"
                      data-testid="change-mobile-btn"
                    >
                      Change number
                    </button>
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || otp.length !== 6}
                  data-testid="verify-otp-btn"
                  className="w-full bg-bree-primary hover:bg-bree-primary-hover text-white py-6 rounded-full font-medium"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Verify OTP
                      <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendTimer > 0 || isLoading}
                  data-testid="resend-otp-btn"
                  className="w-full text-center text-sm text-bree-primary font-medium hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
                >
                  {resendTimer > 0
                    ? `Resend OTP in ${resendTimer}s`
                    : "Resend OTP"}
                </button>
              </form>
            )}

            {/* Complete Profile Form */}
            {step === "profile" && (
              <form
                onSubmit={handleCompleteProfile}
                className="space-y-4"
                data-testid="complete-profile-form"
              >
                <div className="rounded-xl bg-bree-bg px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-bree-text-secondary">
                    Mobile Number
                  </p>
                  <p className="text-bree-text-primary font-medium mt-0.5">
                    +91 {mobile}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name" className="text-bree-text-primary">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-bree-text-secondary" />
                    <Input
                      ref={nameInputRef}
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                      data-testid="profile-name"
                      className="pl-10 rounded-xl border-bree-border"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || name.trim().length < 2}
                  data-testid="complete-profile-btn"
                  className="w-full bg-bree-primary hover:bg-bree-primary-hover text-white py-6 rounded-full font-medium"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default Login;