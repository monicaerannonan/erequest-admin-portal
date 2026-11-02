import test from "node:test";
import assert from "node:assert/strict";

import {
  generateRandomSalt,
  generateRecoveryKey,
  deriveKeyFromPassword,
  deriveKeyFromRecoveryKey,
  getCatalogCryptoKey,
  encryptCatalogField,
  decryptCatalogField,
  encryptVaultField,
  decryptVaultField,
  generateCanary,
  verifyCanary,
  CIPHER_PREFIX
} from "../src/utils/vaultCrypto.js";

test("generateRandomSalt generates 32 hex characters (16 bytes)", () => {
  const salt = generateRandomSalt(16);
  assert.equal(typeof salt, "string");
  assert.equal(salt.length, 32);
  assert.match(salt, /^[0-9a-f]{32}$/);
});

test("generateRecoveryKey generates format EREQ-XXXX-XXXX-XXXX-XXXX-VAULT", () => {
  const key = generateRecoveryKey();
  assert.match(key, /^EREQ-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-VAULT$/);
});

test("AES-256-GCM encryption and decryption roundtrip works accurately", async () => {
  const salt = generateRandomSalt();
  const password = "MasterSecretPassword#2026!";
  const cryptoKey = await deriveKeyFromPassword(password, salt);

  const plainText = "Realme RMX5111 - CA-2023-02087";
  const encrypted = await encryptVaultField(plainText, cryptoKey);

  assert.ok(encrypted.startsWith(CIPHER_PREFIX));
  assert.notEqual(encrypted, plainText);

  const decrypted = await decryptVaultField(encrypted, cryptoKey);
  assert.equal(decrypted, plainText);
});

test("Canary verification succeeds with correct password and fails with wrong password", async () => {
  const salt = generateRandomSalt();
  const correctPassword = "CorrectVaultKey#123";
  const wrongPassword = "WrongVaultKey#456";

  const correctKey = await deriveKeyFromPassword(correctPassword, salt);
  const wrongKey = await deriveKeyFromPassword(wrongPassword, salt);

  const canaryCiphertext = await generateCanary(correctKey);
  assert.ok(canaryCiphertext.startsWith(CIPHER_PREFIX));

  const isVerifiedCorrect = await verifyCanary(canaryCiphertext, correctKey);
  assert.equal(isVerifiedCorrect, true);

  const isVerifiedWrong = await verifyCanary(canaryCiphertext, wrongKey);
  assert.equal(isVerifiedWrong, false);
});

test("Recovery key can derive matching encryption key", async () => {
  const salt = generateRandomSalt();
  const recoveryKey = generateRecoveryKey();
  const keyFromRecovery = await deriveKeyFromRecoveryKey(recoveryKey, salt);

  const plain = "Confidential Student Record";
  const encrypted = await encryptVaultField(plain, keyFromRecovery);

  const decrypted = await decryptVaultField(encrypted, keyFromRecovery);
  assert.equal(decrypted, plain);
});

test("decryptVaultField passes unencrypted legacy text unchanged", async () => {
  const legacyText = "Normal Plaintext String";
  const result = await decryptVaultField(legacyText, null);
  assert.equal(result, legacyText);
});

test("getCatalogCryptoKey encrypts and decrypts catalog text consistently", async () => {
  const key = await getCatalogCryptoKey();
  const sampleRequirement = "Official Receipt of Tuition Payment";
  const encrypted = await encryptVaultField(sampleRequirement, key);

  assert.ok(encrypted.startsWith(CIPHER_PREFIX));
  assert.notEqual(encrypted, sampleRequirement);

  const decrypted = await decryptVaultField(encrypted, key);
  assert.equal(decrypted, sampleRequirement);
});

test("encryptCatalogField and decryptCatalogField roundtrip correctly", async () => {
  const serviceName = "Registrar Services - Transcript of Records";
  const encrypted = await encryptCatalogField(serviceName);

  assert.ok(encrypted.startsWith(CIPHER_PREFIX));
  assert.notEqual(encrypted, serviceName);

  const decrypted = await decryptCatalogField(encrypted);
  assert.equal(decrypted, serviceName);
});

test("decryptCatalogField handles plaintext legacy input gracefully", async () => {
  const plain = "Plaintext Without Cipher Prefix";
  const result = await decryptCatalogField(plain);
  assert.equal(result, plain);
});

test("checkIfMasterPassword detects default master password and rejects normal password", async () => {
  const { checkIfMasterPassword, DEFAULT_MASTER_PASSWORD } = await import("../src/features/vault/vaultService.js");
  const { terminate } = await import("firebase/firestore");
  const { db } = await import("../src/firebase/firebaseConfig.js");

  // Default master password check
  const masterCheck = await checkIfMasterPassword(DEFAULT_MASTER_PASSWORD);
  assert.equal(masterCheck.isMaster, true);

  // Normal password should not match master password
  const normalCheck = await checkIfMasterPassword("#Icct4228");
  assert.equal(normalCheck.isMaster, false);

  // Invalid / empty password
  const emptyCheck = await checkIfMasterPassword("");
  assert.equal(emptyCheck.isMaster, false);

  await terminate(db).catch(() => {});
});
