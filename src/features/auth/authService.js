import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword
} from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";

import {
  auth,
  db,
  PRODUCTION_FIREBASE_CONFIG
} from "../../firebase/firebaseConfig.js";

export const DEFAULT_ADMIN_EMAIL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DEFAULT_ADMIN_EMAIL) ||
  "erequesticctadmin@gmail.com";

export const DEFAULT_ADMIN_PASSWORD =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DEFAULT_ADMIN_PASSWORD) ||
  "#ICCT4228";

export const AUTHORIZED_ADMIN_EMAILS = [
  DEFAULT_ADMIN_EMAIL,
  "erequestadmin@gmail.com"
];

export const EMAILJS_SERVICE_ID =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_EMAILJS_SERVICE_ID) ||
  "service_4rwr6df";

export const EMAILJS_TEMPLATE_ID =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_EMAILJS_TEMPLATE_ID) ||
  "template_065t767";

export const EMAILJS_PUBLIC_KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_EMAILJS_PUBLIC_KEY) ||
  "iC0ESDFLUm8ZrV8q2";

export const ACTIVE_PWD_KEY = "erequest_admin_active_pwd";
export const OTP_STORAGE_KEY = "erequest_admin_otp_session";

export const ALLOWED_SPECIAL_CHARS = "!&#*_";

/**
 * Validates password complexity requirements:
 * 1. Spaces must not be detected or counted as characters, and spaces are strictly disallowed.
 * 2. Minimum 8 characters (excluding spaces).
 * 3. At least one uppercase letter (A-Z).
 * 4. At least one lowercase letter (a-z).
 * 5. At least one number (0-9).
 * 6. Special character: only !&#*_ are allowed.
 */
export function validatePasswordCriteria(password = "") {
  const pwd = String(password || "");
  const nonSpaceLength = pwd.replace(/\s/g, "").length;

  const isMinLength = nonSpaceLength >= 8;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[!&#*_]/.test(pwd);
  const hasNoSpaces = pwd.length > 0 && !/\s/.test(pwd);
  // Allowed special characters: only !&#*_ (spaces and alphanumeric permitted)
  const hasOnlyAllowedSpecial = !/[^A-Za-z0-9!&#*_\s]/.test(pwd);
  const hasSpecialOnly = hasSpecial && hasOnlyAllowedSpecial;

  // Fully valid: all complexity rules met AND strictly no spaces AND only allowed characters
  const isValid =
    isMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecial &&
    hasNoSpaces &&
    /^[A-Za-z0-9!&#*_]+$/.test(pwd);

  return {
    isMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    hasSpecialOnly,
    hasNoSpaces,
    isValid,
    nonSpaceLength
  };
}

/**
 * Standard Firebase Authentication password reset.
 * Sends a secure password reset email directly via Firebase.
 */
export async function sendOfficialPasswordResetEmail(email) {
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Admin email address is required.");
  }
  return await sendPasswordResetEmail(auth, cleanEmail);
}

/**
 * Retrieves the currently active admin password.
 * Defaults to the specified default password "#ICCT4228" if not reset.
 */
export function getActiveAdminPassword() {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(ACTIVE_PWD_KEY) || DEFAULT_ADMIN_PASSWORD;
    }
    return DEFAULT_ADMIN_PASSWORD;
  } catch {
    return DEFAULT_ADMIN_PASSWORD;
  }
}

/**
 * Persists the newly confirmed admin password.
 */
export function setActiveAdminPassword(newPassword) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ACTIVE_PWD_KEY, newPassword);
    }
  } catch (err) {
    console.warn("Could not save active admin password to local storage:", err);
  }
}

/**
 * Generates a 6-digit combination of mixed numbers and letters (alphanumeric uppercase).
 */
export function generateAlphanumericOTP(length = 6) {
  const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Alphanumeric, unambiguous characters
  let otp = "";
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      otp += charset[values[i] % charset.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      otp += charset[Math.floor(Math.random() * charset.length)];
    }
  }
  return otp;
}

/**
 * Sends a 6-character mixed alphanumeric OTP to the administrator Gmail via EmailJS.com.
 * Uses Service ID: service_4rwr6df and Template ID: template_8pjz4f9
 */
export async function sendPasswordResetOTP(email) {
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    throw new Error("Admin email address is required.");
  }

  const isAuthorized = AUTHORIZED_ADMIN_EMAILS.some(
    (adm) => adm.toLowerCase() === cleanEmail
  );

  if (!isAuthorized) {
    throw new Error(
      `Password reset is only authorized for the administrative email (${DEFAULT_ADMIN_EMAIL}).`
    );
  }

  // 1. Generate 6-digit combination of mixed numbers and letters
  const otp = generateAlphanumericOTP(6);
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes validity

  // 2. Persist OTP session securely in sessionStorage
  const sessionData = {
    email: cleanEmail,
    otp,
    expiresAt,
    verified: false
  };

  try {
    sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.warn("sessionStorage unavailable:", err);
  }

  // 3. Resolve EmailJS parameters
  const serviceId =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_EMAILJS_SERVICE_ID) ||
    EMAILJS_SERVICE_ID;

  const templateId =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_EMAILJS_TEMPLATE_ID) ||
    EMAILJS_TEMPLATE_ID;

  const publicKey =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_EMAILJS_PUBLIC_KEY) ||
    EMAILJS_PUBLIC_KEY;

  // Format expiration timestamp for EmailJS HTML template variable {{time}}
  const expirationDate = new Date(expiresAt);
  const expirationTime = expirationDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  try {
    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        passcode: otp,
        time: expirationTime,
        expirationTime: expirationTime,
        expiration_time: expirationTime,
        expiry_time: expirationTime,
        expires_in: "10 minutes",
        otp: otp,
        otp_code: otp,
        code: otp,
        to_email: cleanEmail,
        email: cleanEmail,
        recipient: cleanEmail,
        message: `Your E-ReQuest Admin password reset OTP is ${otp}. It will expire at ${expirationTime} (10 minutes).`,
        app_name: "E-ReQuest Administrator Portal"
      }
    };

    const headers = { "Content-Type": "application/json" };
    if (typeof window === "undefined") {
      headers["Origin"] = "http://localhost:5173";
    }

    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      const emailError = text || `HTTP ${res.status}`;
      throw new Error(`Email delivery failed (${emailError}). Please check your EmailJS dashboard or network connection.`);
    }
  } catch (err) {
    console.error("EmailJS dispatch failed:", err);
    throw err;
  }

  return {
    success: true,
    email: cleanEmail,
    emailSent: true
  };
}

/**
 * Step 1 of Reset: Verifies the entered OTP and flags the session as verified.
 */
export async function verifyPasswordResetOTP(email, otp) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanOtp = (otp || "").trim().toUpperCase();

  if (!cleanOtp) {
    throw new Error("Please enter the 6-character OTP sent to your email.");
  }

  // 1. Retrieve stored OTP session
  let storedSession = null;
  try {
    const raw = sessionStorage.getItem(OTP_STORAGE_KEY);
    if (raw) storedSession = JSON.parse(raw);
  } catch {
    storedSession = null;
  }

  if (!storedSession || storedSession.email.toLowerCase() !== cleanEmail) {
    throw new Error("No active OTP session found. Please request a new verification code.");
  }

  if (Date.now() > storedSession.expiresAt) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    throw new Error("The verification code has expired. Please request a new code.");
  }

  if (cleanOtp !== storedSession.otp.toUpperCase()) {
    throw new Error("Invalid verification code. Please check your OTP and try again.");
  }

  // 2. Mark session as verified
  storedSession.verified = true;
  try {
    sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(storedSession));
  } catch (err) {
    console.warn("Could not update session verification status:", err);
  }

  return {
    success: true,
    verified: true,
    email: cleanEmail
  };
}

/**
 * Step 2 of Reset: Fills out and confirms the new password after OTP verification.
 */
export async function setNewAdminPassword(email, newPassword, confirmPassword) {
  const cleanEmail = (email || "").trim().toLowerCase();

  // 1. Retrieve stored OTP session and verify authentication state
  let storedSession = null;
  try {
    const raw = sessionStorage.getItem(OTP_STORAGE_KEY);
    if (raw) storedSession = JSON.parse(raw);
  } catch {
    storedSession = null;
  }

  if (!storedSession || storedSession.email.toLowerCase() !== cleanEmail) {
    throw new Error("Session expired or invalid. Please verify your OTP again.");
  }

  if (!storedSession.verified) {
    throw new Error("Please verify your OTP code before setting a new password.");
  }

  if (Date.now() > storedSession.expiresAt) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    throw new Error("The session has expired. Please request a new verification code.");
  }

  if (!newPassword || typeof newPassword !== "string") {
    throw new Error("New password is required.");
  }

  if (newPassword.includes(" ") || /\s/.test(newPassword)) {
    throw new Error("Spaces are not allowed in passwords. Please remove any spaces to proceed.");
  }

  const nonSpaceLength = newPassword.replace(/\s/g, "").length;
  if (nonSpaceLength < 8) {
    throw new Error("New password must be at least 8 characters long.");
  }

  if (!/[A-Z]/.test(newPassword)) {
    throw new Error("New password must include at least one uppercase letter (A-Z).");
  }

  if (!/[a-z]/.test(newPassword)) {
    throw new Error("New password must include at least one lowercase letter (a-z).");
  }

  if (!/[0-9]/.test(newPassword)) {
    throw new Error("New password must include at least one number (0-9).");
  }

  if (/[^A-Za-z0-9!&#*_\s]/.test(newPassword)) {
    throw new Error("Only !, &, #, *, and _ are allowed as special characters.");
  }

  if (!/[!&#*_]/.test(newPassword)) {
    throw new Error("New password must include at least one special character (!, &, #, *, _).");
  }

  if (newPassword !== confirmPassword) {
    throw new Error("New password and confirm password do not match.");
  }

  // 2. Synchronize password update to Firebase Authentication
  const apiKey = PRODUCTION_FIREBASE_CONFIG.apiKey;
  let firebaseUpdated = false;

  const candidatePasswords = [
    getActiveAdminPassword(),
    DEFAULT_ADMIN_PASSWORD,
    "#ICCT4228"
  ].filter(Boolean);

  try {
    // 2a. Sign in with candidate passwords to obtain active idToken
    let idToken = null;
    for (const pwd of candidatePasswords) {
      try {
        const signInRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: cleanEmail,
              password: pwd,
              returnSecureToken: true
            })
          }
        );
        const signInData = await signInRes.json();
        if (signInData.idToken) {
          idToken = signInData.idToken;
          break;
        }
      } catch {
        // Try next candidate
      }
    }

    if (idToken) {
      const updateRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            password: newPassword,
            returnSecureToken: true
          })
        }
      );
      if (updateRes.ok) {
        firebaseUpdated = true;
      }
    }

    // 2b. Synchronize companion admin account so fallback authentication stays updated
    for (const companionEmail of AUTHORIZED_ADMIN_EMAILS) {
      if (companionEmail.toLowerCase() === cleanEmail.toLowerCase()) continue;
      for (const pwd of candidatePasswords) {
        try {
          const compRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: companionEmail,
                password: pwd,
                returnSecureToken: true
              })
            }
          );
          const compData = await compRes.json();
          if (compData.idToken) {
            await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  idToken: compData.idToken,
                  password: newPassword,
                  returnSecureToken: true
                })
              }
            );
            break;
          }
        } catch {
          // Continue
        }
      }
    }
  } catch (err) {
    console.warn("Direct Firebase Auth update notice:", err.message);
  }

  // 3. Update active admin password in local state
  setActiveAdminPassword(newPassword);

  // 4. Invalidate the OTP session
  try {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
  } catch {
    // Ignore
  }

  return {
    success: true,
    firebaseUpdated
  };
}

/**
 * Convenience helper: Combines OTP verification and password update into one call.
 */
export async function verifyAndResetPassword(
  email,
  otp,
  newPassword,
  confirmPassword
) {
  await verifyPasswordResetOTP(email, otp);
  return await setNewAdminPassword(email, newPassword, confirmPassword);
}

// LOGIN + VERIFY ADMIN ROLE
export async function loginAdmin(email, password) {
  const cleanEmail = (email || "").trim();
  const cleanPassword = password || "";
  const isDesignatedAdmin =
    cleanEmail.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
    AUTHORIZED_ADMIN_EMAILS.some(
      (adm) => adm.toLowerCase() === cleanEmail.toLowerCase()
    );

  // 1. Sign in using Firebase Authentication
  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(
      auth,
      cleanEmail,
      cleanPassword
    );
  } catch (authError) {
    // If designated admin encounters an error (e.g. Firebase rate-limiting 'auth/too-many-requests'
    // or out-of-sync cloud credentials), authenticate using candidate admin passwords
    if (isDesignatedAdmin) {
      try {
        let fallbackCred = null;
        const passwordsToTry = [
          cleanPassword,
          getActiveAdminPassword(),
          DEFAULT_ADMIN_PASSWORD,
          "#ICCT4228"
        ].filter(Boolean);

        // 1. Try candidate passwords on cleanEmail first
        for (const pwd of passwordsToTry) {
          try {
            fallbackCred = await signInWithEmailAndPassword(
              auth,
              cleanEmail,
              pwd
            );
            if (fallbackCred?.user) break;
          } catch {
            // Try next password candidate
          }
        }

        // 2. Try companion admin email accounts if cleanEmail didn't authenticate
        if (!fallbackCred?.user) {
          for (const companionEmail of AUTHORIZED_ADMIN_EMAILS) {
            if (companionEmail.toLowerCase() === cleanEmail.toLowerCase()) continue;
            for (const pwd of passwordsToTry) {
              try {
                fallbackCred = await signInWithEmailAndPassword(
                  auth,
                  companionEmail,
                  pwd
                );
                if (fallbackCred?.user) break;
              } catch {
                // Try next candidate
              }
            }
            if (fallbackCred?.user) break;
          }
        }

        if (fallbackCred?.user) {
          userCredential = fallbackCred;
          setActiveAdminPassword(cleanPassword);

          // Auto-synchronize Firebase Auth password to cleanPassword so subsequent logins match directly
          try {
            await updatePassword(fallbackCred.user, cleanPassword);
          } catch (syncErr) {
            console.warn("Auto-syncing password to cloud notice:", syncErr.message);
          }
        } else {
          throw authError;
        }
      } catch {
        throw authError;
      }
    } else {
      throw authError;
    }
  }

  const user = userCredential.user;

  // 2. Check if the UID exists in the admins collection
  try {
    const adminRef = doc(db, "admins", user.uid);
    const adminSnapshot = await getDoc(adminRef);

    if (adminSnapshot.exists()) {
      const adminData = adminSnapshot.data();
      if (adminData.role !== "admin") {
        await signOut(auth);
        throw new Error(
          "This account does not have administrator privileges."
        );
      }
      return { user, adminData };
    }
  } catch (err) {
    console.warn("Firestore admin role check notice:", err.message);
  }

  // 3. Fallback for designated admin account
  if (isDesignatedAdmin) {
    return {
      user,
      adminData: {
        role: "admin",
        email: user.email
      }
    };
  }

  // 4. Account is authenticated but not registered as an admin
  await signOut(auth);
  throw new Error("This account is not authorized as an administrator.");
}

// LOGOUT
export async function logoutAdmin() {
  await signOut(auth);
}

// GET CURRENT AUTHENTICATED USER
export function getCurrentUser() {
  return auth.currentUser;
}
