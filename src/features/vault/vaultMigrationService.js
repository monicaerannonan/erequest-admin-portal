import {
  collection,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../../firebase/firebaseConfig.js";
import {
  encryptVaultField,
  decryptVaultField,
  getCatalogCryptoKey,
  CIPHER_PREFIX
} from "../../utils/vaultCrypto.js";

async function ensureEncryptedWithMasterKey(rawValue, masterCryptoKey, catalogKey) {
  if (!rawValue || typeof rawValue !== "string") return null;
  if (!rawValue.startsWith(CIPHER_PREFIX)) {
    return await encryptVaultField(rawValue, masterCryptoKey);
  }
  const decryptedByMaster = await decryptVaultField(rawValue, masterCryptoKey);
  if (decryptedByMaster !== rawValue && !decryptedByMaster.startsWith(CIPHER_PREFIX)) {
    return null;
  }
  const decryptedByCatalog = await decryptVaultField(rawValue, catalogKey);
  if (decryptedByCatalog !== rawValue && !decryptedByCatalog.startsWith(CIPHER_PREFIX)) {
    return await encryptVaultField(decryptedByCatalog, masterCryptoKey);
  }
  return null;
}

async function ensureEncryptedWithCatalogKey(rawValue, masterCryptoKey, catalogKey) {
  if (!rawValue || typeof rawValue !== "string") return null;
  if (!rawValue.startsWith(CIPHER_PREFIX)) {
    return await encryptVaultField(rawValue, catalogKey);
  }
  const decryptedByCatalog = await decryptVaultField(rawValue, catalogKey, null);
  if (decryptedByCatalog && decryptedByCatalog !== rawValue && !decryptedByCatalog.startsWith(CIPHER_PREFIX)) {
    return null;
  }
  if (masterCryptoKey) {
    const decryptedByMaster = await decryptVaultField(rawValue, masterCryptoKey, null);
    if (decryptedByMaster && decryptedByMaster !== rawValue && !decryptedByMaster.startsWith(CIPHER_PREFIX)) {
      return await encryptVaultField(decryptedByMaster, catalogKey);
    }
  }
  return null;
}

/**
 * Encrypts all existing plaintext records in the database:
 * - Sensitive logs, admin profiles, student device metadata (using user's Master cryptoKey)
 * - Services, transactions, requirements, procedures, guidelines, announcements (using catalogKey)
 *
 * Safe & idempotent: skips any fields that already start with "enc:v1:".
 */
export async function encryptEntireDatabase(cryptoKey, onProgress = null) {
  if (!cryptoKey) {
    throw new Error("Active Master Key is required to encrypt database.");
  }

  const catalogKey = await getCatalogCryptoKey();

  const results = {
    services: { scanned: 0, encrypted: 0 },
    transactions: { scanned: 0, encrypted: 0 },
    requirements: { scanned: 0, encrypted: 0 },
    procedureSteps: { scanned: 0, encrypted: 0 },
    guidelines: { scanned: 0, encrypted: 0 },
    announcements: { scanned: 0, encrypted: 0 },
    studentActivityLogs: { scanned: 0, encrypted: 0 },
    students: { scanned: 0, encrypted: 0 },
    admins: { scanned: 0, encrypted: 0 },
    activityLogs: { scanned: 0, encrypted: 0 },
    totalEncrypted: 0,
    errors: []
  };

  const report = (stage) => {
    if (typeof onProgress === "function") {
      onProgress({ stage, ...results });
    }
  };

  // 1. SERVICES
  report("Encrypting services...");
  try {
    const snap = await getDocs(collection(db, "services"));
    for (const docSnap of snap.docs) {
      results.services.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.name && !String(data.name).startsWith(CIPHER_PREFIX)) {
        updates.name = await encryptVaultField(data.name, catalogKey);
      }
      if (data.description && !String(data.description).startsWith(CIPHER_PREFIX)) {
        updates.description = await encryptVaultField(data.description, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "services", docSnap.id), updates);
        results.services.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`services error: ${err.message}`);
  }

  // 2. TRANSACTIONS
  report("Encrypting transactions...");
  try {
    const snap = await getDocs(collection(db, "transactions"));
    for (const docSnap of snap.docs) {
      results.transactions.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.name && !String(data.name).startsWith(CIPHER_PREFIX)) {
        updates.name = await encryptVaultField(data.name, catalogKey);
      }
      if (data.description && !String(data.description).startsWith(CIPHER_PREFIX)) {
        updates.description = await encryptVaultField(data.description, catalogKey);
      }
      if (data.officeName && !String(data.officeName).startsWith(CIPHER_PREFIX)) {
        updates.officeName = await encryptVaultField(data.officeName, catalogKey);
      }
      if (data.officeSchedule && !String(data.officeSchedule).startsWith(CIPHER_PREFIX)) {
        updates.officeSchedule = await encryptVaultField(data.officeSchedule, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "transactions", docSnap.id), updates);
        results.transactions.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`transactions error: ${err.message}`);
  }

  // 3. REQUIREMENTS
  report("Encrypting requirements...");
  try {
    const snap = await getDocs(collection(db, "requirements"));
    for (const docSnap of snap.docs) {
      results.requirements.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.requirementText && !String(data.requirementText).startsWith(CIPHER_PREFIX)) {
        updates.requirementText = await encryptVaultField(data.requirementText, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "requirements", docSnap.id), updates);
        results.requirements.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`requirements error: ${err.message}`);
  }

  // 4. PROCEDURE STEPS
  report("Encrypting procedure steps...");
  try {
    const snap = await getDocs(collection(db, "procedure_steps"));
    for (const docSnap of snap.docs) {
      results.procedureSteps.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.instruction && !String(data.instruction).startsWith(CIPHER_PREFIX)) {
        updates.instruction = await encryptVaultField(data.instruction, catalogKey);
      }
      if (data.websiteName && !String(data.websiteName).startsWith(CIPHER_PREFIX)) {
        updates.websiteName = await encryptVaultField(data.websiteName, catalogKey);
      }
      if (data.websiteUrl && !String(data.websiteUrl).startsWith(CIPHER_PREFIX)) {
        updates.websiteUrl = await encryptVaultField(data.websiteUrl, catalogKey);
      }
      if (data.imageCaption && !String(data.imageCaption).startsWith(CIPHER_PREFIX)) {
        updates.imageCaption = await encryptVaultField(data.imageCaption, catalogKey);
      }
      if (data.remoteImageUrl && !String(data.remoteImageUrl).startsWith(CIPHER_PREFIX)) {
        updates.remoteImageUrl = await encryptVaultField(data.remoteImageUrl, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "procedure_steps", docSnap.id), updates);
        results.procedureSteps.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`procedure_steps error: ${err.message}`);
  }

  // 5. DEPARTMENT GUIDELINES
  report("Encrypting department guidelines...");
  try {
    const snap = await getDocs(collection(db, "department_guidelines"));
    for (const docSnap of snap.docs) {
      results.guidelines.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.guidelineText && !String(data.guidelineText).startsWith(CIPHER_PREFIX)) {
        updates.guidelineText = await encryptVaultField(data.guidelineText, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "department_guidelines", docSnap.id), updates);
        results.guidelines.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`department_guidelines error: ${err.message}`);
  }

  // 6. ANNOUNCEMENTS
  report("Encrypting announcements...");
  try {
    const snap = await getDocs(collection(db, "announcements"));
    for (const docSnap of snap.docs) {
      results.announcements.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.title && !String(data.title).startsWith(CIPHER_PREFIX)) {
        updates.title = await encryptVaultField(data.title, catalogKey);
      }
      if (data.message && !String(data.message).startsWith(CIPHER_PREFIX)) {
        updates.message = await encryptVaultField(data.message, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "announcements", docSnap.id), updates);
        results.announcements.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`announcements error: ${err.message}`);
  }

  // 7. STUDENT ACTIVITY LOGS
  report("Encrypting student activity logs...");
  try {
    const snap = await getDocs(collection(db, "student_activity_logs"));
    for (const docSnap of snap.docs) {
      results.studentActivityLogs.scanned++;
      const data = docSnap.data();
      const updates = {};

      const nextDeviceName = await ensureEncryptedWithMasterKey(data.deviceName, cryptoKey, catalogKey);
      if (nextDeviceName) {
        updates.deviceName = nextDeviceName;
      }
      const nextOsVersion = await ensureEncryptedWithMasterKey(data.osVersion, cryptoKey, catalogKey);
      if (nextOsVersion) {
        updates.osVersion = nextOsVersion;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "student_activity_logs", docSnap.id), updates);
        results.studentActivityLogs.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`student_activity_logs error: ${err.message}`);
  }

  // 8. STUDENTS METADATA
  report("Encrypting students metadata...");
  try {
    const snap = await getDocs(collection(db, "students"));
    for (const docSnap of snap.docs) {
      results.students.scanned++;
      const data = docSnap.data();
      const updates = {};

      const nextEmail = await ensureEncryptedWithCatalogKey(data.email, cryptoKey, catalogKey);
      if (nextEmail) {
        updates.email = nextEmail;
      }
      const nextDeviceName = await ensureEncryptedWithMasterKey(data.deviceName, cryptoKey, catalogKey);
      if (nextDeviceName) {
        updates.deviceName = nextDeviceName;
      }
      const nextOsVersion = await ensureEncryptedWithMasterKey(data.osVersion, cryptoKey, catalogKey);
      if (nextOsVersion) {
        updates.osVersion = nextOsVersion;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "students", docSnap.id), updates);
        results.students.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`students error: ${err.message}`);
  }

  // 9. ADMINS
  report("Encrypting admin profiles...");
  try {
    const snap = await getDocs(collection(db, "admins"));
    for (const docSnap of snap.docs) {
      results.admins.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.name && !String(data.name).startsWith(CIPHER_PREFIX)) {
        updates.name = await encryptVaultField(data.name, catalogKey);
      }
      if (data.department && !String(data.department).startsWith(CIPHER_PREFIX)) {
        updates.department = await encryptVaultField(data.department, catalogKey);
      }
      if (data.position && !String(data.position).startsWith(CIPHER_PREFIX)) {
        updates.position = await encryptVaultField(data.position, catalogKey);
      }
      if (data.phone && !String(data.phone).startsWith(CIPHER_PREFIX)) {
        updates.phone = await encryptVaultField(data.phone, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "admins", docSnap.id), updates);
        results.admins.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`admins error: ${err.message}`);
  }

  // 10. ACTIVITY LOGS
  report("Encrypting system activity logs...");
  try {
    const snap = await getDocs(collection(db, "activity_logs"));
    for (const docSnap of snap.docs) {
      results.activityLogs.scanned++;
      const data = docSnap.data();
      const updates = {};

      if (data.title && !String(data.title).startsWith(CIPHER_PREFIX)) {
        updates.title = await encryptVaultField(data.title, catalogKey);
      }
      if (data.details && !String(data.details).startsWith(CIPHER_PREFIX)) {
        updates.details = await encryptVaultField(data.details, catalogKey);
      }
      if (data.description && !String(data.description).startsWith(CIPHER_PREFIX)) {
        updates.description = await encryptVaultField(data.description, catalogKey);
      }
      if (data.parentName && !String(data.parentName).startsWith(CIPHER_PREFIX)) {
        updates.parentName = await encryptVaultField(data.parentName, catalogKey);
      }
      if (data.adminName && !String(data.adminName).startsWith(CIPHER_PREFIX)) {
        updates.adminName = await encryptVaultField(data.adminName, catalogKey);
      }
      if (data.adminEmail && !String(data.adminEmail).startsWith(CIPHER_PREFIX)) {
        updates.adminEmail = await encryptVaultField(data.adminEmail, catalogKey);
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "activity_logs", docSnap.id), updates);
        results.activityLogs.encrypted++;
        results.totalEncrypted++;
      }
    }
  } catch (err) {
    results.errors.push(`activity_logs error: ${err.message}`);
  }

  report("Encryption completed!");
  return results;
}
