import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { auth } from "../../firebase/firebaseConfig";
import {
  loginAdmin,
  sendPasswordResetOTP,
  verifyPasswordResetOTP,
  setNewAdminPassword,
  logoutAdmin,
  validatePasswordCriteria,
  isSameAsOlderPassword,
  DEFAULT_ADMIN_EMAIL
} from "./authService";
import "./LoginPage.css";

const OFFICIAL_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

function LoginPage({ initialMode = "login" }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Helper to determine starting mode based on route path, search params, state, or prop
  const resolveInitialMode = () => {
    if (location.pathname === "/forgot-password") {
      return "forgot_password";
    }
    const params = new URLSearchParams(location.search);
    const paramMode = params.get("mode");
    if (paramMode === "forgot_password" || paramMode === "forgot-password") {
      return "forgot_password";
    }
    if (location.state?.mode) {
      return location.state.mode;
    }
    return initialMode || "login";
  };

  // Mode: "login" | "forgot_password" | "verify_otp" | "set_new_password"
  const [mode, setMode] = useState(resolveInitialMode);

  // Login form state
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password & OTP state
  const [resetEmail, setResetEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Cooldown timer for resending OTP
  const [resendCooldown, setResendCooldown] = useState(0);

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // Live password complexity & matching evaluation
  const passwordCriteria = validatePasswordCriteria(newPassword);
  const isSameAsOlder = isSameAsOlderPassword(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  // Synchronize mode when browser Back / Forward buttons or hash changes occur
  useEffect(() => {
    if (location.pathname === "/forgot-password") {
      if (mode === "login") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode("forgot_password");
        setErrorMessage("");
        setSuccessMessage("");
      }
    } else if (location.pathname === "/login" || location.pathname === "/") {
      const params = new URLSearchParams(location.search);
      const isModeForgot =
        params.get("mode") === "forgot_password" ||
        params.get("mode") === "forgot-password" ||
        location.state?.mode === "forgot_password";

      if (!isModeForgot && mode !== "login") {
        setMode("login");
        setOtp("");
        setNewPassword("");
        setConfirmPassword("");
        setErrorMessage("");
      }
    }
  }, [location.pathname, location.search, location.state, mode]);

  // Security guard: Ensure active session is revoked when entering password recovery
  // so browser Back cannot re-enter protected routes
  useEffect(() => {
    if (location.pathname === "/forgot-password" || mode === "forgot_password") {
      if (auth?.currentUser) {
        logoutAdmin().catch((err) => {
          console.warn("Notice signing out previous session:", err);
        });
      }
    }
  }, [location.pathname, mode]);

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  /* =========================================================
     HANDLE LOGIN
     ========================================================= */
  const handleLogin = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setErrorMessage("Please enter your email address and password.");
      return;
    }

    try {
      setLoading(true);

      const result = await loginAdmin(cleanEmail, password);
      console.log("Admin login successful:", result.user.email);

      // Successful admin login -> route to dashboard
      navigate("/dashboard", {
        replace: true
      });
    } catch (error) {
      console.error("Login error:", error);

      switch (error.code) {
        case "auth/invalid-email":
          setErrorMessage("Please enter a valid email address.");
          break;

        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
          setErrorMessage("Incorrect email or password.");
          break;

        case "auth/user-disabled":
          setErrorMessage("This account has been disabled.");
          break;

        case "auth/too-many-requests":
          setErrorMessage("Too many login attempts. Please try again later.");
          break;

        case "auth/network-request-failed":
          setErrorMessage(
            "Network error connecting to Firebase. Please check your connection."
          );
          break;

        default:
          setErrorMessage(
            error.message || "Unable to sign in. Please try again."
          );
      }
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     STAGE 1: SEND OTP VIA EMAILJS
     ========================================================= */
  const handleSendOTP = async (event) => {
    if (event) event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");

    const targetEmail = resetEmail.trim();
    if (!targetEmail) {
      setErrorMessage("Please enter your administrator email address.");
      return;
    }

    try {
      setLoading(true);

      await sendPasswordResetOTP(targetEmail);

      setResendCooldown(60);
      setOtp("");
      setMode("verify_otp");

      // STRICT SECURITY RULE: The OTP must NOT be displayed or shown on the screen.
      // The UI displays ONLY a notification stating that the OTP has been successfully sent to the registered email.
      setSuccessMessage(
        `OTP has been successfully sent to ${targetEmail}. Please check your Gmail.`
      );
    } catch (error) {
      console.error("Failed to send OTP:", error);
      setErrorMessage(
        error.message || "Failed to send verification OTP. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     STAGE 2: VERIFY OTP (DEDICATED PAGE)
     ========================================================= */
  const handleVerifyOTP = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");

    const cleanOtp = otp.trim().toUpperCase();
    if (!cleanOtp) {
      setErrorMessage("Please enter the 6-character verification code.");
      return;
    }

    try {
      setLoading(true);

      await verifyPasswordResetOTP(resetEmail.trim(), cleanOtp);

      // OTP verified successfully -> navigate to the separate new password page!
      setMode("set_new_password");
      setSuccessMessage(
        "Verification code confirmed! Please enter your new administrator password below."
      );
    } catch (error) {
      console.error("OTP verification failed:", error);
      setErrorMessage(
        error.message || "Invalid verification code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     STAGE 3: SET NEW PASSWORD (DEDICATED PAGE)
     ========================================================= */
  const handleSetNewPassword = async (event) => {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");

    if (!newPassword) {
      setErrorMessage("Please enter your new administrator password.");
      return;
    }

    if (newPassword.includes(" ") || /\s/.test(newPassword)) {
      setErrorMessage("Space detected! Spaces are not allowed in passwords. Please remove any spaces to proceed.");
      return;
    }

    const nonSpaceLength = newPassword.replace(/\s/g, "").length;
    if (nonSpaceLength < 8) {
      setErrorMessage("New password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setErrorMessage("New password must contain at least one uppercase letter (A-Z).");
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setErrorMessage("New password must contain at least one lowercase letter (a-z).");
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setErrorMessage("New password must contain at least one number (0-9).");
      return;
    }

    if (/[^A-Za-z0-9!&#*_\s]/.test(newPassword)) {
      setErrorMessage("Only !, &, #, *, and _ are allowed as special characters.");
      return;
    }

    if (!/[!&#*_]/.test(newPassword)) {
      setErrorMessage("New password must contain at least one special character (!, &, #, *, _).");
      return;
    }

    if (isSameAsOlderPassword(newPassword)) {
      setErrorMessage("New password cannot be the same as your older password. Please choose a different password to proceed.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirm password do not match.");
      return;
    }

    try {
      setLoading(true);

      await setNewAdminPassword(
        resetEmail.trim(),
        newPassword,
        confirmPassword
      );

      // Return to login mode with success notification
      setMode("login");
      setEmail(resetEmail.trim());
      setPassword("");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage(
        "Password reset successful! You can now sign in with your new password."
      );
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
    } catch (error) {
      console.error("Failed to update password:", error);
      setErrorMessage(
        error.message || "Failed to update password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     NAVIGATION HELPERS
     ========================================================= */
  const handleOpenForgotPassword = () => {
    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");
    setResetEmail(email.trim() || DEFAULT_ADMIN_EMAIL);
    setMode("forgot_password");
    if (location.pathname !== "/forgot-password") {
      navigate("/forgot-password");
    }
  };

  const handleBackToLogin = () => {
    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setMode("login");
    if (location.pathname !== "/login") {
      navigate("/login");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* ===================================================
            HEADER
            =================================================== */}
        <div className="login-header">
          <div className="login-logo">
            <img
              src={OFFICIAL_LOGO_URL}
              alt="E-ReQuest Logo"
              className="login-logo-img"
            />
          </div>

          <h1>E-ReQuest</h1>

          {mode === "login" && <p>Administrator Portal</p>}
          {mode === "forgot_password" && <p>Password Recovery</p>}
          {mode === "verify_otp" && <p>Verify OTP Code</p>}
          {mode === "set_new_password" && <p>Create New Password</p>}
        </div>

        {/* ===================================================
            ALERT BANNERS
            =================================================== */}
        {errorMessage && <div className="login-error">{errorMessage}</div>}
        {successMessage && <div className="login-success">{successMessage}</div>}
        {infoMessage && <div className="login-info">{infoMessage}</div>}

        {/* ===================================================
            PAGE 1: SIGN IN FORM
            =================================================== */}
        {mode === "login" && (
          <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Enter admin email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  className="show-password-button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="login-helper-row">
              <button
                type="button"
                className="forgot-password-link"
                onClick={handleOpenForgotPassword}
                disabled={loading}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {/* ===================================================
            PAGE 2: FORGOT PASSWORD - REQUEST OTP
            =================================================== */}
        {mode === "forgot_password" && (
          <form className="login-form" onSubmit={handleSendOTP}>
            <div className="form-instruction">
              Enter your administrator email address to receive a 6-character OTP via EmailJS.
            </div>

            <div className="form-group">
              <label htmlFor="resetEmail">Admin Email Address</label>
              <input
                id="resetEmail"
                type="email"
                placeholder="erequesticctadmin@gmail.com"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                disabled={loading}
                autoComplete="email"
                required
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Sending OTP..." : "Send Verification Code"}
            </button>

            <button
              type="button"
              className="login-secondary-button"
              onClick={handleBackToLogin}
              disabled={loading}
            >
              Back to Sign In
            </button>
          </form>
        )}

        {/* ===================================================
            PAGE 3: VERIFY OTP (DEDICATED SEPARATE PAGE)
            =================================================== */}
        {mode === "verify_otp" && (
          <form className="login-form" onSubmit={handleVerifyOTP}>
            <div className="auth-step-indicator">
              <span className="auth-step-badge">Step 1 of 2</span>
              <span>Verify Your Identity</span>
            </div>

            <div className="form-instruction">
              Please enter the One-Time-Passcode sent to{" "}
              <strong>{resetEmail}</strong>.
            </div>

            <div className="form-group">
              <label htmlFor="otp">Verification Code (OTP)</label>
              <input
                id="otp"
                type="text"
                className="otp-input"
                placeholder="Enter verification code"
                value={otp}
                maxLength={6}
                onChange={(event) =>
                  setOtp(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                disabled={loading}
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Verifying Code..." : "Verify Code & Continue"}
            </button>

            <div className="otp-resend-container">
              {resendCooldown > 0 ? (
                <span className="resend-cooldown-text">
                  Resend code in {resendCooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  className="resend-otp-button"
                  onClick={() => handleSendOTP(null)}
                  disabled={loading}
                >
                  Resend OTP Code
                </button>
              )}
            </div>

            <button
              type="button"
              className="login-secondary-button"
              onClick={handleBackToLogin}
              disabled={loading}
            >
              Cancel and Return to Sign In
            </button>
          </form>
        )}

        {/* ===================================================
            PAGE 4: SET NEW PASSWORD (DEDICATED SEPARATE PAGE)
            =================================================== */}
        {mode === "set_new_password" && (
          <form className="login-form" onSubmit={handleSetNewPassword}>
            <div className="auth-step-indicator">
              <span className="auth-step-badge auth-step-badge-success">Step 2 of 2</span>
              <span>Create New Password</span>
            </div>

            <div className="form-instruction">
              Identity verified. Choose a secure new password for{" "}
              <strong>{resetEmail}</strong>.
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="password-field">
                <input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new password (min. 8 characters)"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="show-password-button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={loading}
                >
                  {showNewPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Space Detected Warning Box */}
              {newPassword.includes(" ") && (
                <div className="space-warning-banner" role="alert">
                  <span className="space-warning-icon">⚠</span>
                  <span>Space detected! Spaces are not allowed in passwords. You cannot proceed with a space.</span>
                </div>
              )}

              {/* Same as Older Password Warning Box */}
              {isSameAsOlder && (
                <div className="same-password-warning-banner" role="alert">
                  <span className="same-password-warning-icon">⚠</span>
                  <span>New password cannot be the same as your older password. Please choose a different password to proceed.</span>
                </div>
              )}

              {/* Dynamic Live Password Requirements Checklist */}
              <div className="password-requirements-card">
                <div className="password-requirements-title">
                  Password Requirements:
                </div>
                <ul className="password-requirements-list">
                  <li className={passwordCriteria.isMinLength ? "req-met" : "req-unmet"}>
                    <span className="req-icon">{passwordCriteria.isMinLength ? "✓" : "✕"}</span>
                    <span>Minimum 8 characters</span>
                  </li>
                  <li className={passwordCriteria.hasUppercase ? "req-met" : "req-unmet"}>
                    <span className="req-icon">{passwordCriteria.hasUppercase ? "✓" : "✕"}</span>
                    <span>At least one uppercase letter (A-Z)</span>
                  </li>
                  <li className={passwordCriteria.hasLowercase ? "req-met" : "req-unmet"}>
                    <span className="req-icon">{passwordCriteria.hasLowercase ? "✓" : "✕"}</span>
                    <span>At least one lowercase letter (a-z)</span>
                  </li>
                  <li className={passwordCriteria.hasNumber ? "req-met" : "req-unmet"}>
                    <span className="req-icon">{passwordCriteria.hasNumber ? "✓" : "✕"}</span>
                    <span>At least one number (0-9)</span>
                  </li>
                  <li className={passwordCriteria.hasSpecialOnly ? "req-met" : "req-unmet"}>
                    <span className="req-icon">{passwordCriteria.hasSpecialOnly ? "✓" : "✕"}</span>
                    <span>Special character (! & # * _ only)</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <div className="password-field">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="show-password-button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <div
                  className={`password-match-indicator ${
                    passwordsMatch ? "match-success" : "match-error"
                  }`}
                >
                  <span className="req-icon">{passwordsMatch ? "✓" : "✕"}</span>
                  <span>{passwordsMatch ? "Passwords match" : "Passwords do not match"}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={
                loading ||
                newPassword.includes(" ") ||
                !passwordCriteria.isValid ||
                isSameAsOlder ||
                !passwordsMatch
              }
            >
              {loading ? "Updating Password..." : "Confirm & Update Password"}
            </button>

            <button
              type="button"
              className="login-secondary-button"
              onClick={handleBackToLogin}
              disabled={loading}
            >
              Cancel
            </button>
          </form>
        )}

        {/* ===================================================
            FOOTER
            =================================================== */}
        <div className="login-footer">
          <p>Authorized administrators only</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
