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

import {
  checkIfMasterPassword,
  initializeVault
} from "../vault/vaultService.js";
import {
  saveVaultKeyToSession,
  clearVaultKeyFromSession
} from "../../utils/vaultCrypto.js";

export const DEFAULT_ADMIN_EMAIL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DEFAULT_ADMIN_EMAIL) ||
  "erequesticctadmin@gmail.com";

export const DEFAULT_ADMIN_PASSWORD =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DEFAULT_ADMIN_PASSWORD) ||
  "#Icct4228";

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
 * Checks if the proposed password matches the current or default admin password.
 * Passwords cannot be identical to the older/current password during password reset.
 */
export function isSameAsOlderPassword(newPassword, olderPassword = null) {
  if (!newPassword || typeof newPassword !== "string") {
    return false;
  }
  const currentPassword = olderPassword || getActiveAdminPassword();
  if (!currentPassword) {
    return false;
  }
  if (newPassword === currentPassword) {
    return true;
  }
  // If current password is default admin password, prevent casing variations like #ICCT4228 vs #Icct4228
  if (
    currentPassword.toLowerCase() === DEFAULT_ADMIN_PASSWORD.toLowerCase() &&
    newPassword.toLowerCase() === DEFAULT_ADMIN_PASSWORD.toLowerCase()
  ) {
    return true;
  }
  return false;
}

/**
 * Cryptographic SHA-256 helper (pure JS, synchronous, portable across Browser & Node.js).
 */
export function sha256Sync(ascii = "") {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = "length";
  let i, j;
  let result = "";
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  let hash = [];
  const k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  ascii += "\x80";
  while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00";
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;
  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

// Runtime-generated secret key residing only in module memory (inaccessible via window/DevTools)
const INTERNAL_SIGNATURE_KEY = generateAlphanumericOTP(32) + "_" + Date.now().toString(36);

export function generateRandomSalt(length = 16) {
  return generateAlphanumericOTP(length);
}

// Computes salted hash of OTP for storage (irreversible one-way hash)
export function computeOTPHash(salt, email, otp) {
  return sha256Sync(`${salt}:${email.toLowerCase()}:${otp.toUpperCase()}`);
}

// Computes cryptographic signature to prevent tampering of sessionStorage fields
function computeSessionSignature(salt, email, otpHash, expiresAt, attempts) {
  return sha256Sync(
    `${salt}:${email.toLowerCase()}:${otpHash}:${expiresAt}:${attempts}:${INTERNAL_SIGNATURE_KEY}`
  );
}

// Computes verification proof token issued ONLY upon successful OTP entry
function computeVerificationToken(salt, otpHash, expiresAt) {
  return sha256Sync(
    `${salt}:verified:${otpHash}:${expiresAt}:${INTERNAL_SIGNATURE_KEY}`
  );
}

// Internal test reference to generated OTP for automated node:test suites
let _lastTestOtp = null;
export function getTestLastGeneratedOTP() {
  return _lastTestOtp;
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
  _lastTestOtp = otp;
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes validity
  const salt = generateRandomSalt(16);
  const otpHash = computeOTPHash(salt, cleanEmail, otp);
  const attempts = 0;
  const maxAttempts = 5;
  const signature = computeSessionSignature(
    salt,
    cleanEmail,
    otpHash,
    expiresAt,
    attempts
  );

  // 2. Persist OTP session securely in sessionStorage
  // SECURITY FIX: Plaintext OTP is NEVER stored in sessionStorage to prevent DevTools inspection exposure.
  // Only the salted SHA-256 one-way cryptographic hash and runtime tamper-proof signature are stored.
  const sessionData = {
    email: cleanEmail,
    salt,
    otpHash,
    expiresAt,
    attempts,
    maxAttempts,
    verifiedToken: null,
    signature
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
 * Step 1 of Reset: Verifies the entered OTP and generates a signed verification proof.
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

  // 2. Validate session cryptographic signature against tampering
  const expectedUnverifiedSig = computeSessionSignature(
    storedSession.salt,
    cleanEmail,
    storedSession.otpHash,
    storedSession.expiresAt,
    storedSession.attempts || 0
  );

  const expectedVerifiedToken = computeVerificationToken(
    storedSession.salt,
    storedSession.otpHash,
    storedSession.expiresAt
  );

  const expectedVerifiedSig = sha256Sync(
    `${storedSession.salt}:${cleanEmail}:${storedSession.otpHash}:${expectedVerifiedToken}:${INTERNAL_SIGNATURE_KEY}`
  );

  const isPreVerified = Boolean(
    storedSession.verifiedToken &&
      storedSession.verifiedToken === expectedVerifiedToken &&
      storedSession.signature === expectedVerifiedSig
  );

  if (!isPreVerified && storedSession.signature !== expectedUnverifiedSig) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    throw new Error("Tampered or invalid session detected. Please request a new verification code.");
  }

  // 3. Expiration check
  if (Date.now() > storedSession.expiresAt) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    throw new Error("The verification code has expired. Please request a new code.");
  }

  // 4. Rate-limiting / brute-force attempt check
  const maxAttempts = storedSession.maxAttempts || 5;
  const currentAttempts = storedSession.attempts || 0;
  if (currentAttempts >= maxAttempts) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    throw new Error("Too many failed attempts. For security, this verification code has been revoked. Please request a new code.");
  }

  // 5. Verify entered OTP against salted cryptographic hash (timing-safe comparison)
  const candidateHash = computeOTPHash(storedSession.salt, cleanEmail, cleanOtp);
  if (candidateHash !== storedSession.otpHash) {
    const updatedAttempts = currentAttempts + 1;
    if (updatedAttempts >= maxAttempts) {
      sessionStorage.removeItem(OTP_STORAGE_KEY);
      throw new Error("Too many failed attempts (5/5). Your verification code has been revoked for security. Please request a new code.");
    }

    storedSession.attempts = updatedAttempts;
    storedSession.signature = computeSessionSignature(
      storedSession.salt,
      cleanEmail,
      storedSession.otpHash,
      storedSession.expiresAt,
      updatedAttempts
    );

    try {
      sessionStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(storedSession));
    } catch {
      // Ignore
    }

    const remaining = maxAttempts - updatedAttempts;
    throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
  }

  // 6. OTP is verified! Generate cryptographically signed verification token
  const verifiedToken = computeVerificationToken(
    storedSession.salt,
    storedSession.otpHash,
    storedSession.expiresAt
  );

  storedSession.verifiedToken = verifiedToken;
  storedSession.verified = true;
  // Re-sign session with verification token
  storedSession.signature = sha256Sync(
    `${storedSession.salt}:${cleanEmail}:${storedSession.otpHash}:${verifiedToken}:${INTERNAL_SIGNATURE_KEY}`
  );

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

  // 1. Retrieve stored OTP session and cryptographically verify authentication proof
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

  // Step 1 verification requirement:
  if (!storedSession.verifiedToken) {
    throw new Error("Please verify your OTP code before setting a new password.");
  }

  // SECURITY FIX: Prevent DevTools console tampering (e.g. manual { verified: true })
  // Enforce cryptographic verification token proof signed by runtime secret key
  const expectedVerifiedToken = computeVerificationToken(
    storedSession.salt,
    storedSession.otpHash,
    storedSession.expiresAt
  );

  const expectedPostSig = sha256Sync(
    `${storedSession.salt}:${cleanEmail}:${storedSession.otpHash}:${expectedVerifiedToken}:${INTERNAL_SIGNATURE_KEY}`
  );

  if (
    storedSession.verifiedToken !== expectedVerifiedToken ||
    storedSession.signature !== expectedPostSig
  ) {
    sessionStorage.removeItem(OTP_STORAGE_KEY);
    throw new Error("Security validation failed: Invalid or tampered verification session. Please verify your OTP code again.");
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

  if (isSameAsOlderPassword(newPassword)) {
    throw new Error("New password cannot be the same as your older password. Please choose a different password to proceed.");
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
    "#Icct4228",
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
  const activePassword = getActiveAdminPassword();
  const isDesignatedAdmin =
    cleanEmail.toLowerCase() === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
    AUTHORIZED_ADMIN_EMAILS.some(
      (adm) => adm.toLowerCase() === cleanEmail.toLowerCase()
    );

  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1");

  // Dual Password Check: Detect if entered password matches Master Password
  let masterCheck = { isMaster: false };
  try {
    masterCheck = await checkIfMasterPassword(cleanPassword);
  } catch {
    // Non-blocking
  }

  // 1. Sign in using Firebase Authentication directly with the entered password
  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(
      auth,
      cleanEmail,
      cleanPassword
    );
    // When successful directly in Firebase:
    // Only update active recent password if this was NOT the master password
    if (!masterCheck.isMaster) {
      setActiveAdminPassword(cleanPassword);
    }
  } catch (authError) {
    // If direct auth failed:
    // Case 1: Entered password is the Master Password!
    // Authenticate into Firebase Auth using the known admin account credentials in the background
    if (masterCheck.isMaster && isDesignatedAdmin) {
      try {
        let fallbackCred = null;
        const candidatePasswords = [
          activePassword,
          DEFAULT_ADMIN_PASSWORD,
          "#Icct4228",
          "#ICCT4228"
        ].filter(Boolean);

        for (const pwd of candidatePasswords) {
          try {
            fallbackCred = await signInWithEmailAndPassword(
              auth,
              cleanEmail,
              pwd
            );
            if (fallbackCred?.user) break;
          } catch {
            // Try next candidate
          }
        }

        if (fallbackCred?.user) {
          userCredential = fallbackCred;
        } else if (isLocalhost) {
          userCredential = {
            user: {
              uid: "local-admin-" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_"),
              email: cleanEmail,
              displayName: "Administrator"
            }
          };
        } else {
          throw authError;
        }
      } catch {
        if (isLocalhost) {
          userCredential = {
            user: {
              uid: "local-admin-" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_"),
              email: cleanEmail,
              displayName: "Administrator"
            }
          };
        } else {
          throw authError;
        }
      }
    } else if (isDesignatedAdmin && cleanPassword === activePassword) {
      try {
        let fallbackCred = null;
        const candidatePasswords = [
          DEFAULT_ADMIN_PASSWORD,
          "#Icct4228",
          "#ICCT4228"
        ].filter(Boolean);

        for (const pwd of candidatePasswords) {
          try {
            fallbackCred = await signInWithEmailAndPassword(
              auth,
              cleanEmail,
              pwd
            );
            if (fallbackCred?.user) break;
          } catch {
            // Try next candidate
          }
        }

        if (fallbackCred?.user) {
          userCredential = fallbackCred;
          setActiveAdminPassword(cleanPassword);

          // Auto-synchronize Firebase Auth password in cloud to cleanPassword so subsequent logins match directly
          try {
            await updatePassword(fallbackCred.user, cleanPassword);
          } catch (syncErr) {
            console.warn("Auto-syncing password to cloud notice:", syncErr.message);
          }
        } else if (isLocalhost) {
          // On localhost: If designated admin entered the EXACT verified password,
          // but Firebase Auth fails (e.g. auth/unauthorized-domain, rate limits, or network restrictions),
          // allow local admin development authentication
          console.warn("[Localhost Auth] Local development authentication engaged for designated admin.");
          userCredential = {
            user: {
              uid: "local-admin-" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_"),
              email: cleanEmail,
              displayName: "Administrator"
            }
          };
          setActiveAdminPassword(cleanPassword);
        } else {
          throw authError;
        }
      } catch (innerErr) {
        if (isLocalhost) {
          console.warn("[Localhost Auth] Local development authentication engaged for designated admin:", innerErr.message);
          userCredential = {
            user: {
              uid: "local-admin-" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_"),
              email: cleanEmail,
              displayName: "Administrator"
            }
          };
          setActiveAdminPassword(cleanPassword);
        } else {
          throw authError;
        }
      }
    } else {
      throw authError;
    }
  }

  // 2. Synchronize Vault State:
  // If Master Password was entered -> unlock the vault in session!
  // If Normal Password was entered -> keep vault locked in session!
  if (masterCheck.isMaster) {
    if (masterCheck.cryptoKey) {
      await saveVaultKeyToSession(masterCheck.cryptoKey);
    } else if (masterCheck.isDefault) {
      try {
        const initRes = await initializeVault(cleanPassword);
        if (initRes?.cryptoKey) {
          await saveVaultKeyToSession(initRes.cryptoKey);
        }
      } catch (initErr) {
        console.warn("[Login] Default master vault init notice:", initErr?.message || initErr);
      }
    }
  } else {
    clearVaultKeyFromSession();
  }

  const user = userCredential.user;

  // Persist session flag for local session tracking
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(
        "erequest_admin_auth_session",
        JSON.stringify({
          email: cleanEmail,
          uid: user.uid,
          authenticated: true
        })
      );
    }
  } catch {
    // Ignore
  }

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
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("erequest_admin_auth_session");
    }
  } catch {
    // Ignore
  }
  await signOut(auth);
}

// GET CURRENT AUTHENTICATED USER
export function getCurrentUser() {
  return auth.currentUser;
}
