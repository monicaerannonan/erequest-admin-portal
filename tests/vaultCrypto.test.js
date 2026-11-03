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
  setActiveMasterCryptoKey,
  CIPHER_PREFIX
} from "../src/utils/vaultCrypto.js";
import {
  formatDeviceNameDisplay,
  formatOsVersionDisplay,
  normalizeStudentActivityLog,
  MAX_ACCOUNT_SWITCHES_PER_DEVICE
} from "../src/features/studentLogs/studentLogService.js";

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

test("encryptCatalogField encrypts by default and roundtrips with the catalog key", async () => {
  const serviceName = "Registrar Services - Transcript of Records";

  const encrypted = await encryptCatalogField(serviceName);
  assert.ok(encrypted.startsWith(CIPHER_PREFIX));
  assert.notEqual(encrypted, serviceName);

  const decrypted = await decryptCatalogField(encrypted);
  assert.equal(decrypted, serviceName);

  // Explicit opt-out keeps plain text
  const plain = await encryptCatalogField(serviceName, { forceEncrypt: false });
  assert.equal(plain, serviceName);
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

  const customSalt = generateRandomSalt();
  const customMasterPwd = "CustomMasterKey#2026";
  const customKey = await deriveKeyFromPassword(customMasterPwd, customSalt);
  const customCanary = await generateCanary(customKey);
  const mockCfg = {
    isConfigured: true,
    saltHex: customSalt,
    canaryCiphertext: customCanary
  };

  // Custom configured master password check
  const customCheck = await checkIfMasterPassword(customMasterPwd, mockCfg);
  assert.equal(customCheck.isMaster, true);

  // Default master password check when unconfigured
  const masterCheck = await checkIfMasterPassword(DEFAULT_MASTER_PASSWORD, null);
  assert.equal(masterCheck.isMaster, true);

  // Normal password should not match master password
  const normalCheck = await checkIfMasterPassword("#Icct4228", mockCfg);
  assert.equal(normalCheck.isMaster, false);

  // Invalid / empty password
  const emptyCheck = await checkIfMasterPassword("");
  assert.equal(emptyCheck.isMaster, false);

  await terminate(db).catch(() => {});
});

test("formatDeviceNameDisplay and formatOsVersionDisplay handle plaintext, encrypted, and placeholders cleanly", () => {
  // Plaintext display
  assert.equal(formatDeviceNameDisplay("Samsung Galaxy A53"), "Samsung Galaxy A53");
  assert.equal(formatOsVersionDisplay("Android 13"), "Android 13");

  // Ciphertext fallback
  assert.equal(formatDeviceNameDisplay("enc:v1:abc1234:xyz7890"), "Android Device");
  assert.equal(formatOsVersionDisplay("enc:v1:abc1234:xyz7890"), "");

  // Placeholder fallback
  assert.equal(formatDeviceNameDisplay("🔒 [Encrypted]"), "Android Device");
  assert.equal(formatOsVersionDisplay("🔒 [Encrypted]"), "");

  // Empty / null fallback
  assert.equal(formatDeviceNameDisplay(""), "Unknown Device");
  assert.equal(formatDeviceNameDisplay(null), "Unknown Device");
  assert.equal(formatOsVersionDisplay(""), "");
  assert.equal(formatOsVersionDisplay(null), "");

  // Normal password mode (isMasterActive = false) masks hardware model to Android Device & Android OS
  assert.equal(formatDeviceNameDisplay("Samsung Galaxy A53", "", false), "Android Device");
  assert.equal(formatDeviceNameDisplay("Xiaomi 2312DRA50G", "", false), "Android Device");
  assert.equal(formatOsVersionDisplay("Android 13", "", false), "Android OS");
  assert.equal(formatOsVersionDisplay("16", "", false), "Android OS");
});

test("decryptCatalogField decrypts ciphertext encrypted with active master key seamlessly", async () => {
  const salt = generateRandomSalt();
  const masterKey = await deriveKeyFromPassword("MasterKey2026#", salt);
  setActiveMasterCryptoKey(masterKey);

  const deviceName = "Xiaomi Poco X4 Pro 5G";
  const encrypted = await encryptVaultField(deviceName, masterKey);
  assert.ok(encrypted.startsWith(CIPHER_PREFIX));

  const decrypted = await decryptCatalogField(encrypted);
  assert.equal(decrypted, deviceName);
});

test("Student Activity Logs strictly enforces maximum 3 accounts per device (never 4 or 5)", () => {
  assert.equal(MAX_ACCOUNT_SWITCHES_PER_DEVICE, 3);

  // Raw data containing 5 accounts on a single phone
  const rawDataWith5Accounts = {
    studentNumber: "AU-2023-00001",
    currentStudentNumber: "AU-2023-00005",
    loggedStudentNumbers: [
      "AU-2023-00005",
      "AU-2023-00004",
      "AU-2023-00003",
      "AU-2023-00002",
      "AU-2023-00001"
    ],
    studentNumbers: [
      "AU-2023-00005",
      "AU-2023-00004",
      "AU-2023-00003",
      "AU-2023-00002",
      "AU-2023-00001"
    ],
    dailyStudentNumbers: [
      "AU-2023-00005",
      "AU-2023-00004",
      "AU-2023-00003",
      "AU-2023-00002"
    ],
    deviceName: "Samsung Galaxy A53",
    installationId: "device-uuid-12345"
  };

  const normalized = normalizeStudentActivityLog("device-uuid-12345", rawDataWith5Accounts);

  // Must strictly contain 3 accounts, never 4 or 5
  assert.equal(normalized.loggedStudentNumbers.length, 3);
  assert.deepEqual(normalized.loggedStudentNumbers, [
    "AU-2023-00005",
    "AU-2023-00004",
    "AU-2023-00003"
  ]);
  assert.equal(normalized.studentNumbers.length, 3);
  assert.equal(normalized.dailyStudentNumbers.length, 3);
});

test("decryptCatalogField decrypts master-key data only when the master key is active (no password guessing)", async () => {
  const salt = generateRandomSalt();
  setActiveMasterCryptoKey(null);

  const masterKey = await deriveKeyFromPassword("typed-master-password", salt);
  const deviceName = "Infinix Zero 5G";
  const cipher = await encryptVaultField(deviceName, masterKey);

  // Master password not typed yet -> stays locked
  const locked = await decryptCatalogField(cipher);
  assert.equal(locked, cipher);

  // Once the admin types the master password the key becomes active
  setActiveMasterCryptoKey(masterKey);
  const unlocked = await decryptCatalogField(cipher);
  assert.equal(unlocked, deviceName);
  setActiveMasterCryptoKey(null);
});

test("formatDeviceNameDisplay and formatOsVersionDisplay use fallback when provided", () => {
  assert.equal(
    formatDeviceNameDisplay("enc:v1:someciphertext", "Redmi Note 10 Pro"),
    "Redmi Note 10 Pro"
  );
  assert.equal(
    formatOsVersionDisplay("enc:v1:someciphertext", "Android 12"),
    "Android 12"
  );
  assert.equal(
    formatDeviceNameDisplay("🔒 [Encrypted]", "Samsung A12"),
    "Samsung A12"
  );
});

