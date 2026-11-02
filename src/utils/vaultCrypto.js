/**
 * Vault Cryptographic Engine
 * Provides bank-grade AES-256-GCM encryption and PBKDF2 key derivation
 * using the standard browser Web Crypto API (window.crypto.subtle).
 *
 * Guaranteed zero external dependencies, high performance, and hardware acceleration.
 */

const PBKDF2_ITERATIONS = 100000;
const HASH_ALGO = "SHA-256";
const AES_ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12; // Standard 96-bit IV for AES-GCM
const SALT_LENGTH_BYTES = 16;
export const CIPHER_PREFIX = "enc:v1:";
export const CANARY_PHRASE = "VAULT_VERIFIED_OK_2026";

function getCrypto() {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API is not available in this environment.");
}

/* =========================================================
   BYTE & BASE64 / HEX CONVERSION HELPERS
   ========================================================= */

export function uint8ArrayToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToUint8Array(hexString) {
  const clean = String(hexString || "").replace(/[^0-9a-fA-F]/g, "");
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes) {
  if (typeof globalThis !== "undefined" && typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64String) {
  if (typeof globalThis !== "undefined" && typeof globalThis.Buffer !== "undefined") {
    const buf = globalThis.Buffer.from(base64String, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64String);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/* =========================================================
   RANDOM GENERATORS
   ========================================================= */

export function generateRandomSalt(bytes = SALT_LENGTH_BYTES) {
  const salt = new Uint8Array(bytes);
  getCrypto().getRandomValues(salt);
  return uint8ArrayToHex(salt);
}

export function generateRecoveryKey() {
  const randomBytes = new Uint8Array(16);
  getCrypto().getRandomValues(randomBytes);
  const hex = uint8ArrayToHex(randomBytes).toUpperCase();
  // Formats into: EREQ-XXXX-XXXX-XXXX-XXXX-VAULT
  return `EREQ-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-VAULT`;
}

/* =========================================================
   KEY DERIVATION (PBKDF2)
   ========================================================= */

/**
 * Derives a 256-bit AES-GCM CryptoKey from a user password and hex salt.
 */
export async function deriveKeyFromPassword(password, saltHex) {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string.");
  }
  const encoder = new TextEncoder();
  const passwordKey = await getCrypto().subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const saltBytes = hexToUint8Array(saltHex);

  return await getCrypto().subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGO
    },
    passwordKey,
    { name: AES_ALGO, length: KEY_LENGTH },
    true, // Extractable so it can be stored in sessionStorage during the active admin session
    ["encrypt", "decrypt"]
  );
}

export const CATALOG_ENCRYPTION_SEED = "erequest_production_catalog_aes_gcm_seed_2026";
let cachedCatalogKey = null;

/**
 * Returns a 256-bit AES-GCM CryptoKey for catalog content (services, announcements, requirements).
 * Deterministically derived from SHA-256 of the catalog seed so Android App and Web Admin match.
 */
export async function getCatalogCryptoKey() {
  if (cachedCatalogKey) {
    return cachedCatalogKey;
  }
  const encoder = new TextEncoder();
  const rawHash = await getCrypto().subtle.digest("SHA-256", encoder.encode(CATALOG_ENCRYPTION_SEED));
  cachedCatalogKey = await getCrypto().subtle.importKey(
    "raw",
    rawHash,
    { name: AES_ALGO, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
  return cachedCatalogKey;
}

/**
 * Encrypts a catalog field (services, transactions, requirements, etc.)
 * using the deterministic catalog encryption key.
 */
export async function encryptCatalogField(text) {
  if (text === null || text === undefined) return text;
  const catalogKey = await getCatalogCryptoKey();
  return await encryptVaultField(text, catalogKey);
}

export const catalogDecryptedCache = new Map();

/**
 * Decrypts a catalog field (services, transactions, requirements, admin position/dept, etc.)
 * using the deterministic catalog encryption key.
 * If not encrypted or if decryption fails, returns original text.
 */
export async function decryptCatalogField(ciphertext) {
  if (ciphertext === null || ciphertext === undefined) return ciphertext;
  const str = String(ciphertext);
  if (!str.startsWith(CIPHER_PREFIX)) return str;
  if (catalogDecryptedCache.has(str)) {
    return catalogDecryptedCache.get(str);
  }
  const catalogKey = await getCatalogCryptoKey();
  const decrypted = await decryptVaultField(str, catalogKey, str);
  if (decrypted && !decrypted.startsWith(CIPHER_PREFIX)) {
    catalogDecryptedCache.set(str, decrypted);
  }
  return decrypted;
}

/**
 * Derives a CryptoKey from an Emergency Recovery Key string.
 */
export async function deriveKeyFromRecoveryKey(recoveryKey, saltHex) {
  const cleanKey = String(recoveryKey || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return await deriveKeyFromPassword(cleanKey, saltHex);
}

/* =========================================================
   ENCRYPTION / DECRYPTION
   ========================================================= */

/**
 * Encrypts a plaintext string into "enc:v1:<base64IV>:<base64Ciphertext>"
 */
export async function encryptVaultField(plainText, cryptoKey) {
  if (plainText === null || plainText === undefined) {
    return plainText;
  }
  const strValue = String(plainText);
  if (!strValue.trim()) {
    return strValue;
  }
  // Already encrypted check
  if (strValue.startsWith(CIPHER_PREFIX)) {
    return strValue;
  }

  const iv = new Uint8Array(IV_LENGTH_BYTES);
  getCrypto().getRandomValues(iv);

  const encoder = new TextEncoder();
  const encodedPlain = encoder.encode(strValue);

  const encryptedBuffer = await getCrypto().subtle.encrypt(
    {
      name: AES_ALGO,
      iv: iv
    },
    cryptoKey,
    encodedPlain
  );

  const ivBase64 = uint8ArrayToBase64(iv);
  const cipherBase64 = uint8ArrayToBase64(new Uint8Array(encryptedBuffer));

  return `${CIPHER_PREFIX}${ivBase64}:${cipherBase64}`;
}

/**
 * Decrypts an "enc:v1:<base64IV>:<base64Ciphertext>" string.
 * If not encrypted, returns original value.
 * If decryption fails (e.g. wrong key), returns fallback placeholder or throws.
 */
export async function decryptVaultField(cipherText, cryptoKey, fallbackPlaceholder = null) {
  if (cipherText === null || cipherText === undefined) {
    return cipherText;
  }
  const strValue = String(cipherText);
  if (!strValue.startsWith(CIPHER_PREFIX)) {
    return strValue; // Unencrypted legacy data
  }

  if (!cryptoKey) {
    return fallbackPlaceholder ?? "🔒 [Encrypted]";
  }

  try {
    const payload = strValue.slice(CIPHER_PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 2) {
      return strValue;
    }
    const [ivBase64, cipherBase64] = parts;
    const iv = base64ToUint8Array(ivBase64);
    const cipherBytes = base64ToUint8Array(cipherBase64);

    const decryptedBuffer = await getCrypto().subtle.decrypt(
      {
        name: AES_ALGO,
        iv: iv
      },
      cryptoKey,
      cipherBytes
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch {
    if (fallbackPlaceholder !== null) {
      return fallbackPlaceholder;
    }
    return "🔒 [Encrypted]";
  }
}

/* =========================================================
   CANARY VERIFICATION
   ========================================================= */

/**
 * Generates an encrypted canary string to store in Firestore for password verification.
 */
export async function generateCanary(cryptoKey) {
  return await encryptVaultField(CANARY_PHRASE, cryptoKey);
}

/**
 * Verifies if a given CryptoKey can decrypt the canary ciphertext.
 * Returns true if valid, false if wrong password.
 */
export async function verifyCanary(canaryCiphertext, cryptoKey) {
  if (!canaryCiphertext || !cryptoKey) {
    return false;
  }
  try {
    const decrypted = await decryptVaultField(canaryCiphertext, cryptoKey, null);
    return decrypted === CANARY_PHRASE;
  } catch {
    return false;
  }
}

/* =========================================================
   SESSION STORAGE KEY CACHE
   ========================================================= */

const SESSION_STORAGE_VAULT_KEY = "erequest_admin_vault_raw_key";

export async function saveVaultKeyToSession(cryptoKey) {
  try {
    const exported = await getCrypto().subtle.exportKey("raw", cryptoKey);
    const base64 = uint8ArrayToBase64(new Uint8Array(exported));
    sessionStorage.setItem(SESSION_STORAGE_VAULT_KEY, base64);
  } catch (err) {
    console.warn("[VaultCrypto] Unable to cache key to sessionStorage:", err);
  }
}

export async function loadVaultKeyFromSession() {
  try {
    const base64 = sessionStorage.getItem(SESSION_STORAGE_VAULT_KEY);
    if (!base64) {
      return null;
    }
    const rawBytes = base64ToUint8Array(base64);
    return await getCrypto().subtle.importKey(
      "raw",
      rawBytes,
      { name: AES_ALGO, length: KEY_LENGTH },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    console.warn("[VaultCrypto] Unable to restore key from sessionStorage:", err);
    return null;
  }
}

export function clearVaultKeyFromSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_VAULT_KEY);
  } catch (err) {
    console.warn("[VaultCrypto] Error clearing session key:", err);
  }
}
