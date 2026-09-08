import fs from "fs";
import path from "path";
import { getApiErrorMessage } from "./api";

const loginSource = fs.readFileSync(
  path.join(__dirname, "../pages/Login.js"),
  "utf8",
);
const authSource = fs.readFileSync(
  path.join(__dirname, "../context/AuthContext.js"),
  "utf8",
);

describe("login request stability", () => {
  test("does not call an API from a Login mount effect", () => {
    const mountCode = loginSource.slice(
      0,
      loginSource.indexOf("const handleSendOtp"),
    );

    expect(mountCode).not.toMatch(/sendOtp\s*\(/);
    expect(mountCode).not.toMatch(/verifyOtp\s*\(/);
  });

  test("only requests OTP from the explicit send handler", () => {
    const sendHandler = loginSource.slice(
      loginSource.indexOf("const handleSendOtp"),
      loginSource.indexOf("const handleVerifyOtp"),
    );

    expect(sendHandler).toContain("await sendOtp(mobile)");
    expect(sendHandler).toContain("e.preventDefault()");
  });

  test("does not reload the page after a failed request", () => {
    expect(loginSource).not.toMatch(/location\.reload|window\.location/);
    expect(authSource).not.toMatch(/location\.reload|window\.location/);
  });

  test("deduplicates authentication initialization", () => {
    expect(authSource).toContain("authCheckPromiseRef");
    expect(authSource).toContain('axios.get("/api/auth/verify")');
  });

  test("maps 429 responses to a clear terminal message", () => {
    expect(getApiErrorMessage({ response: { status: 429, data: {} } })).toBe(
      "Too many attempts. Please wait a moment and try again.",
    );
  });

  test("preserves the successful post-OTP redirect", () => {
    expect(loginSource).toContain("await verifyOtp(mobile, otp)");
    expect(loginSource).toContain("navigate(redirectPath, { replace: true");
  });
});
