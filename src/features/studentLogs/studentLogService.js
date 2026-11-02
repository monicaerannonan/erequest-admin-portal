import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  limit
} from "firebase/firestore";

import { auth, db } from "../../firebase/firebaseConfig.js";
import {
  convertTimestampToDate,
  convertTimestampToMillis
} from "../../utils/timestampUtils.js";

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

  const rawTimestamp =
    data.lastActiveAt ??
    data.updatedAt ??
    data.timestamp ??
    data.createdAt ??
    null;

  const activityDate = convertTimestampToDate(rawTimestamp);
  const activityMillis = convertTimestampToMillis(rawTimestamp) ?? 0;

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
    const snapshot = await getDocs(logsQuery);

    const logs = snapshot.docs.map((docSnap) =>
      normalizeStudentActivityLog(docSnap.id, docSnap.data())
    );

    return sortLogsNewestFirst(logs);
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
   Waits for / reacts to Firebase Auth state restoration so
   page reloads do not prematurely fail before auth hydrates.
   Enforces server-side query limiting to protect Firestore read quotas.
   ========================================================= */

export function subscribeToStudentActivityLogs(onUpdate, onError, options = {}) {
  if (typeof onUpdate !== "function") {
    return () => {};
  }

  const maxLimit =
    typeof options === "number"
      ? options
      : (options?.maxLimit ?? DEFAULT_STUDENT_LOGS_QUERY_LIMIT);

  let snapshotUnsubscribe = null;
  let disposed = false;

  const cleanupSnapshot = () => {
    if (typeof snapshotUnsubscribe === "function") {
      snapshotUnsubscribe();
      snapshotUnsubscribe = null;
    }
  };

  const attachSnapshotListener = () => {
    cleanupSnapshot();
    if (disposed) {
      return;
    }

    try {
      const logsRef = collection(db, STUDENT_ACTIVITY_LOGS_COLLECTION);
      const logsQuery = maxLimit > 0 ? query(logsRef, limit(maxLimit)) : logsRef;

      snapshotUnsubscribe = onSnapshot(
        logsQuery,
        (snapshot) => {
          if (disposed) {
            return;
          }
          try {
            const logs = snapshot.docs.map((docSnap) =>
              normalizeStudentActivityLog(docSnap.id, docSnap.data())
            );
            onUpdate(sortLogsNewestFirst(logs));
          } catch (processErr) {
            console.error(
              "[StudentLogService] Error processing student logs:",
              processErr
            );
            if (typeof onError === "function") {
              onError(processErr);
            }
          }
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

          if (typeof onError === "function") {
            onError(snapshotErr);
          }
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
    }
  };

  const authUnsubscribe = onAuthStateChanged(auth, () => {
    attachSnapshotListener();
  });

  return () => {
    disposed = true;
    cleanupSnapshot();
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

  const authUnsubscribe = onAuthStateChanged(auth, () => {
    attachListeners();
  });

  return () => {
    disposed = true;
    cleanupListeners();
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
