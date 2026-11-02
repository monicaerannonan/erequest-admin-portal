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
  clearVaultKeyFromSession,
  setActiveMasterCryptoKey
} from "../../utils/vaultCrypto.js";

export const VAULT_CONFIG_COLLECTION = "vault_config";
export const VAULT_PRIMARY_DOC_ID = "primary";
export const DEFAULT_MASTER_PASSWORD = "#IcctMaster4228";
const VAULT_CONFIG_CACHE_KEY = "erequest_vault_config_cache";

function writeVaultConfigCache(cfg) {
  try {
    if (typeof localStorage !== "undefined") {
      if (cfg && cfg.isConfigured) {
        localStorage.setItem(
          VAULT_CONFIG_CACHE_KEY,
          JSON.stringify({
            id: cfg.id || VAULT_PRIMARY_DOC_ID,
            isConfigured: Boolean(cfg.isConfigured),
            saltHex: cfg.saltHex || "",
            canaryCiphertext: cfg.canaryCiphertext || "",
            recoveryCanary: cfg.recoveryCanary || ""
          })
        );
      } else {
        localStorage.removeItem(VAULT_CONFIG_CACHE_KEY);
      }
    }
  } catch {
    // Ignore storage quota errors
  }
}

function readVaultConfigCache() {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(VAULT_CONFIG_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.isConfigured && parsed.saltHex && parsed.canaryCiphertext) {
          return parsed;
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

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
      writeVaultConfigCache(null);
      return null;
    }
    const data = snap.data();
    const cfg = {
      id: snap.id,
      isConfigured: Boolean(data.isConfigured),
      saltHex: data.saltHex,
      canaryCiphertext: data.canaryCiphertext,
      recoveryCanary: data.recoveryCanary || "",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
    writeVaultConfigCache(cfg);
    return cfg;
  } catch (err) {
    console.warn("[VaultService] Notice reading vault configuration:", err?.message || err);
    return readVaultConfigCache();
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

  // 3. Save to Firestore (preserve createdAt if document already exists)
  const docRef = doc(db, VAULT_CONFIG_COLLECTION, VAULT_PRIMARY_DOC_ID);
  let existingCreatedAt = null;
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists() && existingSnap.data()?.createdAt) {
      existingCreatedAt = existingSnap.data().createdAt;
    }
  } catch {
    // Document may not exist yet
  }

  const payload = {
    isConfigured: true,
    saltHex: saltHex,
    canaryCiphertext: canaryCiphertext,
    recoveryCanary: recoveryCanary,
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, payload);
  writeVaultConfigCache({ id: VAULT_PRIMARY_DOC_ID, ...payload });

  // 4. Cache key in session and set active in-memory master key
  await saveVaultKeyToSession(primaryCryptoKey);
  setActiveMasterCryptoKey(primaryCryptoKey);

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
  setActiveMasterCryptoKey(candidateKey);
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

  writeVaultConfigCache({
    ...vaultConfig,
    isConfigured: true,
    canaryCiphertext: newCanary,
    recoveryCanary: newRecoveryCanary
  });

  await saveVaultKeyToSession(newPrimaryCryptoKey);
  setActiveMasterCryptoKey(newPrimaryCryptoKey);

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
  setActiveMasterCryptoKey(null);
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

/* =========================================================
   DUAL PASSWORD DETECTOR: CHECK IF ENTERED PASSWORD IS MASTER
   ========================================================= */

/**
 * Checks if a candidate password entered in the single login password box
 * matches the Master Password (canary verification in vault_config/primary).
 *
 * @param {string} candidatePassword
 * @returns {Promise<{ isMaster: boolean, cryptoKey?: CryptoKey, cfg?: object, isDefault?: boolean }>}
 */
export async function checkIfMasterPassword(candidatePassword, customVaultConfig = undefined) {
  if (!candidatePassword || typeof candidatePassword !== "string") {
    return { isMaster: false };
  }
  const clean = candidatePassword.trim();
  if (!clean) {
    return { isMaster: false };
  }

  const isDefaultCandidate =
    clean === DEFAULT_MASTER_PASSWORD ||
    clean.toLowerCase() === DEFAULT_MASTER_PASSWORD.toLowerCase();

  // 1. Check against Firestore vault_config/primary canary
  try {
    const cfg = customVaultConfig !== undefined ? customVaultConfig : await getVaultConfig();
    if (cfg && cfg.isConfigured && cfg.saltHex && cfg.canaryCiphertext) {
      const candidateKey = await deriveKeyFromPassword(clean, cfg.saltHex);
      const isValid = await verifyCanary(cfg.canaryCiphertext, candidateKey);
      if (isValid) {
        return { isMaster: true, cryptoKey: candidateKey, cfg };
      }
      // When a custom Master Password is configured in vault_config/primary,
      // reject any password that does not match its canary.
      return { isMaster: false };
    }
    // Not yet configured -> only match DEFAULT_MASTER_PASSWORD
    if (isDefaultCandidate) {
      return { isMaster: true, isDefault: true };
    }
  } catch (err) {
    console.warn("[VaultService] Master password verification notice:", err?.message || err);
    if (isDefaultCandidate) {
      return { isMaster: true, isDefault: true };
    }
  }

  return { isMaster: false };
}

