import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../../firebase/firebaseConfig.js";
import {
  generateRandomSalt,
  generateRecoveryKey,
  deriveKeyFromPassword,
  deriveKeyFromRecoveryKey,
  generateCanary,
  verifyCanary,
  saveVaultKeyToSession,
  loadVaultKeyFromSession,
  clearVaultKeyFromSession
} from "../../utils/vaultCrypto.js";

export const VAULT_CONFIG_COLLECTION = "vault_config";
export const VAULT_PRIMARY_DOC_ID = "primary";

/* =========================================================
   VAULT CONFIG LOADER
   ========================================================= */

/**
 * Loads the current Vault configuration from Firestore.
 * Returns null if not yet configured.
 */
export async function getVaultConfig() {
  try {
    const docRef = doc(db, VAULT_CONFIG_COLLECTION, VAULT_PRIMARY_DOC_ID);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    return {
      id: snap.id,
      isConfigured: Boolean(data.isConfigured),
      saltHex: data.saltHex,
      canaryCiphertext: data.canaryCiphertext,
      recoveryCanary: data.recoveryCanary || "",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  } catch (err) {
    console.warn("[VaultService] Notice reading vault configuration:", err?.message || err);
    return null;
  }
}

/* =========================================================
   INITIALIZE / REGISTER VAULT (PASSWORD 2 SETUP)
   ========================================================= */

/**
 * One-time setup of the Master Secret Key (Password 2).
 * Generates PBKDF2 salt, canary check token, and Emergency Recovery Key.
 * Writes to Firestore: vault_config/primary.
 */
export async function initializeVault(password2) {
  if (!password2 || typeof password2 !== "string" || password2.length < 8) {
    throw new Error("Master Secret Key (Password 2) must be at least 8 characters long.");
  }

  const saltHex = generateRandomSalt(16);
  const recoveryKey = generateRecoveryKey();

  // 1. Derive primary key from Password 2
  const primaryCryptoKey = await deriveKeyFromPassword(password2, saltHex);
  const canaryCiphertext = await generateCanary(primaryCryptoKey);

  // 2. Derive key from Recovery Key to generate backup recovery canary
  const recoveryCryptoKey = await deriveKeyFromRecoveryKey(recoveryKey, saltHex);
  const recoveryCanary = await generateCanary(recoveryCryptoKey);

  // 3. Save to Firestore
  const docRef = doc(db, VAULT_CONFIG_COLLECTION, VAULT_PRIMARY_DOC_ID);
  await setDoc(docRef, {
    isConfigured: true,
    saltHex: saltHex,
    canaryCiphertext: canaryCiphertext,
    recoveryCanary: recoveryCanary,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // 4. Cache key in session
  await saveVaultKeyToSession(primaryCryptoKey);

  return {
    recoveryKey,
    cryptoKey: primaryCryptoKey
  };
}

/* =========================================================
   UNLOCK VAULT WITH PASSWORD 2
   ========================================================= */

/**
 * Validates Password 2 against the stored canary in vault_config.
 * If valid, saves to sessionStorage and returns the CryptoKey.
 */
export async function unlockVaultWithPassword(password2, vaultConfig) {
  if (!password2) {
    throw new Error("Please enter your Database Master Secret Key.");
  }
  if (!vaultConfig || !vaultConfig.saltHex || !vaultConfig.canaryCiphertext) {
    throw new Error("Security Vault is not yet configured.");
  }

  const candidateKey = await deriveKeyFromPassword(password2, vaultConfig.saltHex);
  const isValid = await verifyCanary(vaultConfig.canaryCiphertext, candidateKey);

  if (!isValid) {
    throw new Error("Incorrect Database Master Secret Key (Password 2). Please try again.");
  }

  await saveVaultKeyToSession(candidateKey);
  return candidateKey;
}

/* =========================================================
   UNLOCK / RESET WITH EMERGENCY RECOVERY KEY
   ========================================================= */

/**
 * Recovers access using the Emergency Recovery Key and sets a new Password 2.
 */
export async function resetVaultWithRecoveryKey(recoveryKey, newPassword2, vaultConfig) {
  if (!recoveryKey) {
    throw new Error("Please enter your Emergency Recovery Key.");
  }
  if (!newPassword2 || newPassword2.length < 8) {
    throw new Error("New Password 2 must be at least 8 characters long.");
  }
  if (!vaultConfig || !vaultConfig.saltHex || !vaultConfig.recoveryCanary) {
    throw new Error("No Recovery Key configuration found in database.");
  }

  const recoveryCryptoKey = await deriveKeyFromRecoveryKey(recoveryKey, vaultConfig.saltHex);
  const isRecoveryValid = await verifyCanary(vaultConfig.recoveryCanary, recoveryCryptoKey);

  if (!isRecoveryValid) {
    throw new Error("Invalid Emergency Recovery Key. Please verify the code.");
  }

  // Derive new primary key from newPassword2 using same salt
  const newPrimaryCryptoKey = await deriveKeyFromPassword(newPassword2, vaultConfig.saltHex);
  const newCanary = await generateCanary(newPrimaryCryptoKey);

  // Generate a new recovery key as well
  const newRecoveryKey = generateRecoveryKey();
  const newRecoveryKeyCryptoKey = await deriveKeyFromRecoveryKey(newRecoveryKey, vaultConfig.saltHex);
  const newRecoveryCanary = await generateCanary(newRecoveryKeyCryptoKey);

  const docRef = doc(db, VAULT_CONFIG_COLLECTION, VAULT_PRIMARY_DOC_ID);
  await updateDoc(docRef, {
    canaryCiphertext: newCanary,
    recoveryCanary: newRecoveryCanary,
    updatedAt: serverTimestamp()
  });

  await saveVaultKeyToSession(newPrimaryCryptoKey);

  return {
    newRecoveryKey,
    cryptoKey: newPrimaryCryptoKey
  };
}

/* =========================================================
   LOCK VAULT
   ========================================================= */

export function lockVaultSession() {
  clearVaultKeyFromSession();
}

/* =========================================================
   SESSION RESTORE
   ========================================================= */

export async function restoreVaultSession(vaultConfig) {
  const cachedKey = await loadVaultKeyFromSession();
  if (!cachedKey || !vaultConfig || !vaultConfig.canaryCiphertext) {
    return null;
  }
  const isValid = await verifyCanary(vaultConfig.canaryCiphertext, cachedKey);
  if (!isValid) {
    clearVaultKeyFromSession();
    return null;
  }
  return cachedKey;
}
