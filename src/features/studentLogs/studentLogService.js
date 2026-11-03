import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  limit,
  updateDoc
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebaseConfig.js";
import {
  convertTimestampToDate,
  convertTimestampToMillis
} from "../../utils/timestampUtils.js";
import {
  CIPHER_PREFIX,
  decryptVaultField,
  encryptVaultField,
  getActiveMasterCryptoKey,
  getCatalogCryptoKey
} from "../../utils/vaultCrypto.js";

export const STUDENT_ACTIVITY_LOGS_COLLECTION = "student_activity_logs";
export const STUDENTS_COLLECTION = "students";
export const MAX_ACCOUNT_SWITCHES_PER_DEVICE = 3;
export const MAX_DAILY_ACCOUNT_SWITCHES = 3; // Backward compatibility alias
export const DEFAULT_STUDENT_LOGS_QUERY_LIMIT = 200;

/* =========================================================
   PHILIPPINE TIMEZONE DATE HELPER (YYYY-MM-DD)
   Used for activity timestamp representation.
   ========================================================= */

export function getManilaDateKey(dateInput = new Date()) {
  if (!(dateInput instanceof Date) || Number.isNaN(dateInput.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(dateInput);
  } catch {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, "0");
    const day = String(dateInput.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/* =========================================================
   NORMALIZE STUDENT NUMBER KEY FOR DEDUPLICATION
   Ensures a student logged in on multiple devices is counted
   strictly once regardless of casing or whitespace.
   ========================================================= */

export function normalizeStudentNumberKey(value) {
  const clean = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!clean || clean === "—") {
    return "";
  }
  return clean;
}

export function formatDeviceNameDisplay(val, fallback = "") {
  if (!val) return fallback || "Unknown Device";
  const str = String(val).trim();
  if (str.startsWith("enc:v1:") || str === "🔒 [Encrypted]") {
    return fallback || "Android Device";
  }
  return str;
}

export function formatOsVersionDisplay(val, fallback = "") {
  if (!val) return fallback || "";
  const str = String(val).trim();
  if (str.startsWith("enc:v1:") || str === "🔒 [Encrypted]") {
    return fallback || "";
  }
  return str;
}

/* =========================================================
   NORMALIZE STUDENT ACTIVITY LOG DOCUMENT
   Strictly Student Number only (no student names).
   Enforces device 3-switch limit display (maximum 3 accounts per device).
   ========================================================= */

function dedupeStudentIdsPreserveOrder(items = []) {
  const seen = new Set();
  const ordered = [];

  for (const raw of items) {
    const clean = String(raw || "").trim();
    if (!clean || clean === "—") {
      continue;
    }
    const key = clean.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(clean);
    }
  }

  return ordered;
}

export function normalizeStudentActivityLog(id, data = {}) {
  const studentNumber = String(data.studentNumber || "").trim();
  const currentStudentNumber = String(
    data.currentStudentNumber || data.studentNumber || ""
  ).trim();

  const rawLoggedList = Array.isArray(data.loggedStudentNumbers)
    ? data.loggedStudentNumbers
    : [];
  const rawDailyList = Array.isArray(data.dailyStudentNumbers)
    ? data.dailyStudentNumbers
    : [];
  const rawExtraList = Array.isArray(data.studentNumbers)
    ? data.studentNumbers
    : [];

  // Ordered with the most recently opened account at index 0, followed by all saved accounts on this phone
  // Strictly bounded to maximum 3 accounts per device (never 4 or 5)
  const loggedStudentNumbers = dedupeStudentIdsPreserveOrder([
    currentStudentNumber,
    ...rawLoggedList,
    ...rawDailyList,
    ...rawExtraList,
    studentNumber
  ]).slice(0, MAX_ACCOUNT_SWITCHES_PER_DEVICE);

  const rawDeviceName = data.deviceName || data.deviceModel || data.model || data.device || "";
  const rawModelFallback = data.deviceModel || data.model || data.device || "";
  const fallbackDeviceName = (!String(data.deviceName || "").startsWith("enc:v1:") && data.deviceName)
    ? data.deviceName
    : (rawModelFallback || "Android Device");

  const rawOsVersion = data.osVersion || data.os || data.androidVersion || "";
  const fallbackOsVersion = (!String(data.osVersion || "").startsWith("enc:v1:") && data.osVersion)
    ? data.osVersion
    : (data.os || data.androidVersion || "");

  const deviceName = String(rawDeviceName || "Unknown Device").trim();
  const osVersion = String(rawOsVersion || "").trim();
  const installationId = String(data.installationId || id || "").trim();

  const parsedOpenCount = Number(data.openCount ?? 0);
  const openCount = Number.isFinite(parsedOpenCount)
    ? Math.max(0, Math.floor(parsedOpenCount))
    : 0;

  const candidateTimestamps = [
    data.lastActiveAt,
    data.updatedAt,
    data.timestamp,
    data.lastLoginAt,
    data.createdAt
  ].filter(Boolean);

  let rawTimestamp =
    data.lastActiveAt ??
    data.updatedAt ??
    data.timestamp ??
    data.lastLoginAt ??
    data.createdAt ??
    null;
  let activityMillis = convertTimestampToMillis(rawTimestamp) ?? 0;

  for (const candidate of candidateTimestamps) {
    const ms = convertTimestampToMillis(candidate) ?? 0;
    if (ms > activityMillis) {
      activityMillis = ms;
      rawTimestamp = candidate;
    }
  }

  const activityDate = convertTimestampToDate(rawTimestamp);

  const todayKey = getManilaDateKey(new Date());
  const rawSwitchDate = String(data.switchDate || "").trim();
  const inferredSwitchDate =
    rawSwitchDate || (activityDate ? getManilaDateKey(activityDate) : "");

  const parsedSwitchCount = Number(
    data.dailySwitchCount ?? data.switchAccountCount ?? 0
  );
  const sanitizedSwitchCount = Number.isFinite(parsedSwitchCount)
    ? Math.max(0, Math.floor(parsedSwitchCount))
    : 0;

  const isActiveToday = Boolean(
    activityDate && getManilaDateKey(activityDate) === todayKey
  );

  // Switch limit is per-device (maximum 3 accounts per device), not restricted to daily reset
  const switchCount = Math.min(
    MAX_ACCOUNT_SWITCHES_PER_DEVICE,
    sanitizedSwitchCount
  );

  const dailyStudentNumbers = dedupeStudentIdsPreserveOrder([
    ...(isActiveToday && currentStudentNumber ? [currentStudentNumber] : []),
    ...rawDailyList
  ]).slice(0, MAX_ACCOUNT_SWITCHES_PER_DEVICE);

  let status = "normal";
  if (switchCount >= MAX_ACCOUNT_SWITCHES_PER_DEVICE) {
    status = "limit_reached";
  } else if (data.status === "switched" || data.status === "normal") {
    status = data.status;
  } else if (switchCount > 0) {
    status = "switched";
  }

  const isDifferentActiveStudent = Boolean(
    studentNumber &&
      currentStudentNumber &&
      studentNumber.toLowerCase() !== currentStudentNumber.toLowerCase()
  );

  return {
    id,
    studentNumber: studentNumber || "—",
    currentStudentNumber: currentStudentNumber || studentNumber || "—",
    loggedStudentNumbers,
    dailyStudentNumbers,
    studentNumbers: loggedStudentNumbers,
    isDifferentActiveStudent,
    deviceName,
    osVersion,
    fallbackDeviceName,
    fallbackOsVersion,
    installationId: installationId || "—",
    openCount,
    switchCount,
    dailySwitchCount: switchCount,
    switchDate: inferredSwitchDate,
    status,
    rawTimestamp,
    activityDate,
    activityMillis,
    isActiveToday
  };
}

function sortLogsNewestFirst(logs) {
  return [...logs].sort((a, b) => b.activityMillis - a.activityMillis);
}

function getStudentRecordTimestampMillis(student = {}) {
  const candidates = [
    student.lastLoginAt,
    student.updatedAt,
    student.registeredAt,
    student.createdAt
  ].filter(Boolean);
  let bestMs = 0;
  let bestRaw = null;
  for (const c of candidates) {
    const ms = convertTimestampToMillis(c) ?? 0;
    if (ms > bestMs) {
      bestMs = ms;
      bestRaw = c;
    }
  }
  return { millis: bestMs, rawTimestamp: bestRaw };
}

/**
 * Merges `student_activity_logs` documents with `students` documents so that
 * whenever a student registers or logs in on the Android app (even if `students`
 * updates slightly after or before `student_activity_logs`), the Admin Portal
 * immediately reflects the latest active student and timestamp on each device.
 */
function mergeActivityLogsWithStudents(rawLogDocs = [], rawStudentDocs = [], maxLimit = 0) {
  const logMap = new Map();
  for (const logDoc of rawLogDocs) {
    if (!logDoc) continue;
    const key = String(logDoc.installationId || logDoc.id || "").trim();
    if (!key) continue;
    logMap.set(key, { ...logDoc, id: logDoc.id || key, installationId: key });
  }

  const studentsByDevice = new Map();
  for (const student of rawStudentDocs) {
    if (!student || student.status === "blocked") continue;
    const deviceId = String(student.deviceId || "").trim();
    const studentNumber = String(student.studentNumber || student.id || "").trim();
    if (!deviceId || !studentNumber) continue;
    if (!studentsByDevice.has(deviceId)) {
      studentsByDevice.set(deviceId, []);
    }
    studentsByDevice.get(deviceId).push({
      ...student,
      studentNumber,
      ...getStudentRecordTimestampMillis(student)
    });
  }

  for (const [deviceId, deviceStudents] of studentsByDevice.entries()) {
    deviceStudents.sort((a, b) => b.millis - a.millis);
    const mostRecentStudent = deviceStudents[0];
    const existingLog = logMap.get(deviceId);

    if (existingLog) {
      const existingNormalized = normalizeStudentActivityLog(existingLog.id, existingLog);
      if (mostRecentStudent && mostRecentStudent.millis > existingNormalized.activityMillis) {
        existingLog.lastActiveAt = mostRecentStudent.rawTimestamp;
        const alreadyLoggedOnPhone = existingNormalized.loggedStudentNumbers.some(
          (id) => id.toLowerCase() === mostRecentStudent.studentNumber.toLowerCase()
        );
        if (
          alreadyLoggedOnPhone ||
          existingNormalized.loggedStudentNumbers.length < MAX_ACCOUNT_SWITCHES_PER_DEVICE
        ) {
          existingLog.currentStudentNumber = mostRecentStudent.studentNumber;
          existingLog.loggedStudentNumbers = dedupeStudentIdsPreserveOrder([
            mostRecentStudent.studentNumber,
            ...existingNormalized.loggedStudentNumbers
          ]).slice(0, MAX_ACCOUNT_SWITCHES_PER_DEVICE);
        }
      }
      if (!existingLog.deviceName && mostRecentStudent?.deviceName) {
        existingLog.deviceName = mostRecentStudent.deviceName;
      }
      if (!existingLog.osVersion && mostRecentStudent?.osVersion) {
        existingLog.osVersion = mostRecentStudent.osVersion;
      }
    } else if (mostRecentStudent) {
      // Synthesize a device activity log if a student registered on a device not yet in student_activity_logs
      const studentIdsOnDevice = dedupeStudentIdsPreserveOrder(
        deviceStudents.map((s) => s.studentNumber)
      ).slice(0, MAX_ACCOUNT_SWITCHES_PER_DEVICE);
      logMap.set(deviceId, {
        id: deviceId,
        installationId: deviceId,
        studentNumber: deviceStudents[deviceStudents.length - 1].studentNumber,
        currentStudentNumber: mostRecentStudent.studentNumber,
        loggedStudentNumbers: studentIdsOnDevice,
        dailyStudentNumbers: studentIdsOnDevice,
        deviceName: mostRecentStudent.deviceName || "Android Device",
        osVersion: mostRecentStudent.osVersion || "",
        openCount: Math.max(1, deviceStudents.length),
        dailySwitchCount: Math.min(MAX_ACCOUNT_SWITCHES_PER_DEVICE, studentIdsOnDevice.length),
        status:
          studentIdsOnDevice.length >= MAX_ACCOUNT_SWITCHES_PER_DEVICE
            ? "limit_reached"
            : studentIdsOnDevice.length > 1
            ? "switched"
            : "normal",
        lastActiveAt: mostRecentStudent.rawTimestamp,
        updatedAt: mostRecentStudent.rawTimestamp
      });
    }
  }

  const normalizedList = Array.from(logMap.values()).map((item) =>
    normalizeStudentActivityLog(item.id, item)
  );
  const sorted = sortLogsNewestFirst(normalizedList);
  return maxLimit > 0 ? sorted.slice(0, maxLimit) : sorted;
}

const inFlightAutoEncryptIds = new Set();

async function autoEncryptPlaintextStudentDocs(rawLogDocs = [], rawStudentDocs = []) {
  if (!auth?.currentUser) return;
  try {
    const catalogKey = await getCatalogCryptoKey();
    const deviceKey = getActiveMasterCryptoKey() || catalogKey;

    for (const logDoc of rawLogDocs) {
      const docId = logDoc?.id;
      if (!docId || inFlightAutoEncryptIds.has(`log:${docId}`)) continue;
      const updates = {};
      if (logDoc.deviceName && !String(logDoc.deviceName).startsWith(CIPHER_PREFIX)) {
        updates.deviceName = await encryptVaultField(logDoc.deviceName, deviceKey);
      }
      if (logDoc.osVersion && !String(logDoc.osVersion).startsWith(CIPHER_PREFIX)) {
        updates.osVersion = await encryptVaultField(logDoc.osVersion, deviceKey);
      }
      if (Object.keys(updates).length > 0) {
        inFlightAutoEncryptIds.add(`log:${docId}`);
        updateDoc(doc(db, STUDENT_ACTIVITY_LOGS_COLLECTION, docId), updates)
          .catch(() => {})
          .finally(() => inFlightAutoEncryptIds.delete(`log:${docId}`));
      }
    }

    for (const stDoc of rawStudentDocs) {
      const docId = stDoc?.id;
      if (!docId || inFlightAutoEncryptIds.has(`st:${docId}`)) continue;
      const updates = {};
      if (stDoc.email) {
        const emailStr = String(stDoc.email);
        if (!emailStr.startsWith(CIPHER_PREFIX)) {
          updates.email = await encryptVaultField(emailStr, catalogKey);
        } else if (getActiveMasterCryptoKey()) {
          const decCatalog = await decryptVaultField(emailStr, catalogKey, null);
          if (!decCatalog || decCatalog.startsWith(CIPHER_PREFIX)) {
            const decMaster = await decryptVaultField(emailStr, getActiveMasterCryptoKey(), null);
            if (decMaster && !decMaster.startsWith(CIPHER_PREFIX) && decMaster !== "🔒 [Encrypted]") {
              updates.email = await encryptVaultField(decMaster, catalogKey);
            }
          }
        }
      }
      if (stDoc.deviceName && !String(stDoc.deviceName).startsWith(CIPHER_PREFIX)) {
        updates.deviceName = await encryptVaultField(stDoc.deviceName, deviceKey);
      }
      if (stDoc.osVersion && !String(stDoc.osVersion).startsWith(CIPHER_PREFIX)) {
        updates.osVersion = await encryptVaultField(stDoc.osVersion, deviceKey);
      }
      if (Object.keys(updates).length > 0) {
        inFlightAutoEncryptIds.add(`st:${docId}`);
        updateDoc(doc(db, STUDENTS_COLLECTION, docId), updates)
          .catch(() => {})
          .finally(() => inFlightAutoEncryptIds.delete(`st:${docId}`));
      }
    }
  } catch {
    // Non-blocking background encryption
  }
}

/* =========================================================
   ONE-TIME FETCH ALL STUDENT ACTIVITY LOGS
   ========================================================= */

export async function getAllStudentActivityLogs(options = {}) {
  const maxLimit =
    typeof options === "number"
      ? options
      : (options?.maxLimit ?? DEFAULT_STUDENT_LOGS_QUERY_LIMIT);

  try {
    const logsRef = collection(db, STUDENT_ACTIVITY_LOGS_COLLECTION);
    const logsQuery = maxLimit > 0 ? query(logsRef, limit(maxLimit)) : logsRef;
    const studentsRef = collection(db, STUDENTS_COLLECTION);

    const [logsSnapshot, studentsSnapshot] = await Promise.all([
      getDocs(logsQuery),
      getDocs(studentsRef).catch(() => null)
    ]);

    const rawLogs = logsSnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    const rawStudents = studentsSnapshot
      ? studentsSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
      : [];

    autoEncryptPlaintextStudentDocs(rawLogs, rawStudents);

    return mergeActivityLogsWithStudents(rawLogs, rawStudents, maxLimit);
  } catch (err) {
    if (err?.code === "permission-denied" && !auth?.currentUser) {
      console.warn(
        "[StudentLogService] Local fallback session active without Firebase Auth token; returning empty logs."
      );
      return [];
    }
    throw err;
  }
}

/* =========================================================
   REAL-TIME SUBSCRIPTION FOR STUDENT ACTIVITY LOGS
   Combines dual-collection onSnapshot (student_activity_logs + students)
   with automatic reconnect, window focus/visibility sync, and a 2.5s
   live heartbeat so new student logins/switches appear instantaneously
   without requiring a manual browser refresh.
   ========================================================= */

export function subscribeToStudentActivityLogs(onUpdate, onError, options = {}) {
  if (typeof onUpdate !== "function") {
    return () => {};
  }

  const maxLimit =
    typeof options === "number"
      ? options
      : (options?.maxLimit ?? DEFAULT_STUDENT_LOGS_QUERY_LIMIT);

  let logsUnsubscribe = null;
  let studentsUnsubscribe = null;
  let retryTimer = null;
  let pollInterval = null;
  let disposed = false;

  let latestRawLogs = [];
  let latestRawStudents = [];
  let hasLogsSnapshot = false;

  const cleanupSnapshot = () => {
    if (typeof logsUnsubscribe === "function") {
      logsUnsubscribe();
      logsUnsubscribe = null;
    }
    if (typeof studentsUnsubscribe === "function") {
      studentsUnsubscribe();
      studentsUnsubscribe = null;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const emitMergedLogs = () => {
    if (disposed || !hasLogsSnapshot) {
      return;
    }
    try {
      autoEncryptPlaintextStudentDocs(latestRawLogs, latestRawStudents);
      const merged = mergeActivityLogsWithStudents(
        latestRawLogs,
        latestRawStudents,
        maxLimit
      );
      onUpdate(merged);
    } catch (processErr) {
      console.error(
        "[StudentLogService] Error processing student logs:",
        processErr
      );
      if (typeof onError === "function") {
        onError(processErr);
      }
    }
  };

  const pollLatestSilently = async () => {
    if (disposed || !auth?.currentUser) {
      return;
    }
    try {
      const logsRef = collection(db, STUDENT_ACTIVITY_LOGS_COLLECTION);
      const logsQuery = maxLimit > 0 ? query(logsRef, limit(maxLimit)) : logsRef;
      const studentsRef = collection(db, STUDENTS_COLLECTION);

      const [logsSnap, studentsSnap] = await Promise.all([
        getDocs(logsQuery),
        getDocs(studentsRef).catch(() => null)
      ]);
      if (disposed) return;

      latestRawLogs = logsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      if (studentsSnap) {
        latestRawStudents = studentsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
      }
      hasLogsSnapshot = true;
      emitMergedLogs();
    } catch {
      // Ignore transient poll errors; onSnapshot remains active
    }
  };

  const scheduleReconnect = () => {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!disposed) {
        attachSnapshotListener();
      }
    }, 1500);
  };

  const attachSnapshotListener = () => {
    cleanupSnapshot();
    if (disposed) {
      return;
    }

    try {
      const logsRef = collection(db, STUDENT_ACTIVITY_LOGS_COLLECTION);
      const logsQuery = maxLimit > 0 ? query(logsRef, limit(maxLimit)) : logsRef;

      logsUnsubscribe = onSnapshot(
        logsQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (disposed) {
            return;
          }
          latestRawLogs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          hasLogsSnapshot = true;
          emitMergedLogs();
        },
        (snapshotErr) => {
          if (disposed) {
            return;
          }

          console.warn(
            "[StudentLogService] Real-time subscription notice:",
            snapshotErr?.code || snapshotErr?.message || snapshotErr
          );

          if (snapshotErr?.code === "permission-denied" && !auth?.currentUser) {
            onUpdate([]);
            return;
          }

          scheduleReconnect();
        }
      );

      const studentsRef = collection(db, STUDENTS_COLLECTION);
      studentsUnsubscribe = onSnapshot(
        studentsRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (disposed) {
            return;
          }
          latestRawStudents = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          emitMergedLogs();
        },
        () => {
          // Non-fatal if students listener reconnects later
        }
      );
    } catch (err) {
      console.warn(
        "[StudentLogService] Unable to attach listener:",
        err?.message || err
      );
      if (!disposed && typeof onError === "function") {
        onError(err);
      }
      scheduleReconnect();
    }
  };

  attachSnapshotListener();

  const authUnsubscribe = onAuthStateChanged(auth, () => {
    attachSnapshotListener();
    pollLatestSilently();
  });

  if (typeof window !== "undefined") {
    pollInterval = window.setInterval(pollLatestSilently, 2500);
    window.addEventListener("focus", pollLatestSilently);
    window.addEventListener("online", pollLatestSilently);
  }
  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      pollLatestSilently();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return () => {
    disposed = true;
    cleanupSnapshot();
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", pollLatestSilently);
      window.removeEventListener("online", pollLatestSilently);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof authUnsubscribe === "function") {
      authUnsubscribe();
    }
  };
}

/* =========================================================
   UNIQUE REGISTERED STUDENTS COUNTER (DEVICE-INDEPENDENT)
   Deduplicates unique Student Numbers across both:
   - `students` collection (registered student accounts)
   - `student_activity_logs` (`studentNumber`, `currentStudentNumber`,
     and `studentNumbers` history)
   So a student open on 2+ devices is counted strictly once,
   and multiple students switching on 1 device are each counted.
   ========================================================= */

export function computeUniqueRegisteredStudentCount(
  studentRecordList = [],
  activityLogRawList = []
) {
  const uniqueIds = new Set();

  for (const record of studentRecordList) {
    if (record && record.isActive !== false) {
      const key = normalizeStudentNumberKey(record.studentNumber || record.id);
      if (key) {
        uniqueIds.add(key);
      }
    }
  }

  for (const logData of activityLogRawList) {
    if (!logData) continue;

    const primaryKey = normalizeStudentNumberKey(logData.studentNumber);
    if (primaryKey) {
      uniqueIds.add(primaryKey);
    }

    const activeKey = normalizeStudentNumberKey(logData.currentStudentNumber);
    if (activeKey) {
      uniqueIds.add(activeKey);
    }

    const listCandidates = [
      ...(Array.isArray(logData.loggedStudentNumbers)
        ? logData.loggedStudentNumbers
        : []),
      ...(Array.isArray(logData.dailyStudentNumbers)
        ? logData.dailyStudentNumbers
        : []),
      ...(Array.isArray(logData.studentNumbers) ? logData.studentNumbers : [])
    ];

    for (const entry of listCandidates) {
      const entryKey = normalizeStudentNumberKey(entry);
      if (entryKey) {
        uniqueIds.add(entryKey);
      }
    }
  }

  return uniqueIds.size;
}

export function subscribeToRegisteredStudentsCount(onCountUpdate, onError) {
  if (typeof onCountUpdate !== "function") {
    return () => {};
  }

  let logsUnsub = null;
  let studentsUnsub = null;
  let pollInterval = null;
  let disposed = false;

  let latestStudentDocs = [];
  let latestActivityDocs = [];
  let logsReady = false;
  let studentsReady = false;

  const emitIfReady = () => {
    if (disposed || (!logsReady && !studentsReady)) {
      return;
    }
    const count = computeUniqueRegisteredStudentCount(
      latestStudentDocs,
      latestActivityDocs
    );
    onCountUpdate(count);
  };

  const pollCountSilently = async () => {
    if (disposed || !auth?.currentUser) return;
    try {
      const [logsSnap, studentsSnap] = await Promise.all([
        getDocs(collection(db, STUDENT_ACTIVITY_LOGS_COLLECTION)),
        getDocs(collection(db, STUDENTS_COLLECTION)).catch(() => null)
      ]);
      if (disposed) return;
      latestActivityDocs = logsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      logsReady = true;
      if (studentsSnap) {
        latestStudentDocs = studentsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        studentsReady = true;
      }
      emitIfReady();
    } catch {
      // Ignore transient poll errors
    }
  };

  const cleanupListeners = () => {
    if (typeof logsUnsub === "function") {
      logsUnsub();
      logsUnsub = null;
    }
    if (typeof studentsUnsub === "function") {
      studentsUnsub();
      studentsUnsub = null;
    }
  };

  const attachListeners = () => {
    cleanupListeners();
    if (disposed) {
      return;
    }

    try {
      const logsRef = collection(db, STUDENT_ACTIVITY_LOGS_COLLECTION);
      logsUnsub = onSnapshot(
        logsRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (disposed) return;
          latestActivityDocs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          logsReady = true;
          emitIfReady();
        },
        (err) => {
          if (disposed) return;
          console.warn(
            "[StudentLogService] Registered count (activity logs) notice:",
            err?.code || err?.message || err
          );
          logsReady = true;
          emitIfReady();
          if (
            !(err?.code === "permission-denied" && !auth?.currentUser) &&
            typeof onError === "function"
          ) {
            onError(err);
          }
        }
      );

      const studentsRef = collection(db, STUDENTS_COLLECTION);
      studentsUnsub = onSnapshot(
        studentsRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (disposed) return;
          latestStudentDocs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          studentsReady = true;
          emitIfReady();
        },
        (err) => {
          if (disposed) return;
          // Gracefully continue using activity logs if `students` rules/collection isn't populated
          console.warn(
            "[StudentLogService] Registered count (students collection) notice:",
            err?.code || err?.message || err
          );
          studentsReady = true;
          emitIfReady();
        }
      );
    } catch (err) {
      console.warn(
        "[StudentLogService] Unable to attach registered students listener:",
        err?.message || err
      );
      if (!disposed) {
        onCountUpdate(0);
      }
    }
  };

  attachListeners();

  const authUnsubscribe = onAuthStateChanged(auth, () => {
    attachListeners();
    pollCountSilently();
  });

  if (typeof window !== "undefined") {
    pollInterval = window.setInterval(pollCountSilently, 2500);
    window.addEventListener("focus", pollCountSilently);
    window.addEventListener("online", pollCountSilently);
  }

  return () => {
    disposed = true;
    cleanupListeners();
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", pollCountSilently);
      window.removeEventListener("online", pollCountSilently);
    }
    if (typeof authUnsubscribe === "function") {
      authUnsubscribe();
    }
  };
}

/* =========================================================
   DATE & TIME FORMATTERS
   ========================================================= */

export function formatStudentLogDate(timestamp) {
  const date =
    timestamp instanceof Date ? timestamp : convertTimestampToDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function formatStudentLogTime(timestamp) {
  const date =
    timestamp instanceof Date ? timestamp : convertTimestampToDate(timestamp);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}
