import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "firebase/firestore";

import {
  auth,
  db
} from "../../firebase/firebaseConfig.js";

import {
  DEFAULT_ADMIN_EMAIL
} from "../auth/authService.js";

import {
  convertTimestampToDate
} from "../../utils/timestampUtils.js";

import {
  encryptCatalogField,
  decryptCatalogField
} from "../../utils/vaultCrypto.js";

const ACTIVITY_LOGS_COLLECTION = "activity_logs";

/* =========================================================
   ADD ACTIVITY LOG

   Used whenever the admin:
   - adds
   - updates
   - deletes
   - activates
   - deactivates
   a record.

   Guaranteed non-blocking: wrapped in try/catch so logging
   failures never abort or crash the main database operations.
   ========================================================= */

export async function addActivityLog({
  type,
  action,
  title,
  description = "",
  details = "",
  parentName = "",
  parentId = "",
  recordId = "",
  adminEmail = ""
}) {
  const cleanType = String(type || "record").trim();
  const cleanAction = String(action || "updated").trim();
  const cleanTitle = String(title || "Administrator Action").trim();
  const cleanDescription = String(description || details || "").trim();
  const cleanDetails = String(details || description || "").trim();

  const resolvedEmail = String(
    adminEmail ||
    auth?.currentUser?.email ||
    DEFAULT_ADMIN_EMAIL
  ).trim();

  let encryptedDescription = cleanDescription;
  let encryptedDetails = cleanDetails;
  try {
    if (cleanDescription) {
      encryptedDescription = await encryptCatalogField(cleanDescription);
    }
    if (cleanDetails) {
      encryptedDetails = await encryptCatalogField(cleanDetails);
    }
  } catch {
    // Fall back to clean strings if encryption is unavailable
  }

  const payload = {
    type: cleanType,
    action: cleanAction,
    title: cleanTitle,
    description: encryptedDescription,
    details: encryptedDetails,
    parentName: String(parentName || "").trim(),
    parentId: String(parentId || "").trim(),
    recordId: String(recordId || "").trim(),
    adminEmail: resolvedEmail,
    createdAt: serverTimestamp(),
    timestamp: serverTimestamp()
  };

  try {
    const activityLogsRef = collection(db, ACTIVITY_LOGS_COLLECTION);
    const docRef = await addDoc(activityLogsRef, payload);
    return {
      success: true,
      id: docRef.id
    };
  } catch (err) {
    console.warn(
      "[ActivityLogService] Non-blocking logging notice:",
      err?.message || err
    );
    return {
      success: false,
      error: err
    };
  }
}

/* =========================================================
   GET RECENT ACTIVITY LOGS (ONE-TIME FETCH)
   ========================================================= */

export async function getRecentActivityLogs(maxLogs = 5) {
  try {
    const activityLogsRef = collection(db, ACTIVITY_LOGS_COLLECTION);
    const recentActivitiesQuery = query(
      activityLogsRef,
      orderBy("createdAt", "desc"),
      limit(maxLogs)
    );

    const snapshot = await getDocs(recentActivitiesQuery);

    return await Promise.all(
      snapshot.docs.map(async (document) => {
        const data = document.data();
        const [decDesc, decDetails] = await Promise.all([
          decryptCatalogField(data.description),
          decryptCatalogField(data.details)
        ]);
        return {
          id: document.id,
          ...data,
          description: decDesc || data.description,
          details: decDetails || data.details,
          createdAt: data.createdAt || data.timestamp || null,
          timestamp: data.timestamp || data.createdAt || null
        };
      })
    );
  } catch (err) {
    console.warn("Failed to fetch activity logs:", err?.message || err);
    return [];
  }
}

/* =========================================================
   REAL-TIME SUBSCRIPTION FOR RECENT UPDATES (onSnapshot)

   Allows the dashboard Recent Updates feed to reactively
   display new administrator actions instantaneously without
   requiring manual page refresh.
   ========================================================= */

export function subscribeToRecentActivityLogs(
  onUpdate,
  onError,
  maxLogs = 5
) {
  if (typeof onUpdate !== "function") {
    return () => {};
  }

  try {
    const activityLogsRef = collection(db, ACTIVITY_LOGS_COLLECTION);
    const recentActivitiesQuery = query(
      activityLogsRef,
      orderBy("createdAt", "desc"),
      limit(maxLogs)
    );

    const unsubscribe = onSnapshot(
      recentActivitiesQuery,
      async (snapshot) => {
        try {
          const logs = await Promise.all(
            snapshot.docs.map(async (document) => {
              const data = document.data();
              const [decDesc, decDetails] = await Promise.all([
                decryptCatalogField(data.description),
                decryptCatalogField(data.details)
              ]);
              return {
                id: document.id,
                ...data,
                description: decDesc || data.description,
                details: decDetails || data.details,
                createdAt: data.createdAt || data.timestamp || null,
                timestamp: data.timestamp || data.createdAt || null
              };
            })
          );
          onUpdate(logs);
        } catch (processErr) {
          console.warn("Failed to process real-time activity logs:", processErr);
          if (typeof onError === "function") {
            onError(processErr);
          }
        }
      },
      (snapshotError) => {
        console.warn(
          "Activity logs onSnapshot listener notice:",
          snapshotError?.message || snapshotError
        );
        if (typeof onError === "function") {
          onError(snapshotError);
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn("Could not attach activity logs real-time listener:", err);
    if (typeof onError === "function") {
      onError(err);
    }
    return () => {};
  }
}

/* =========================================================
   CONVERT FIRESTORE TIMESTAMP TO JAVASCRIPT DATE
   (Re-exported for backward compatibility)
   ========================================================= */

export { convertTimestampToDate };

/* =========================================================
   FORMAT DATE

   Example:
   October 2, 2026
   ========================================================= */

export function formatActivityDate(timestamp) {
  const date = convertTimestampToDate(timestamp);
  if (!date) {
    return "";
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/* =========================================================
   FORMAT TIME

   Example:
   12:45 AM
   ========================================================= */

export function formatActivityTime(timestamp) {
  const date = convertTimestampToDate(timestamp);
  if (!date) {
    return "";
  }

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

/* =========================================================
   FORMAT DATE + TIME

   Example:
   October 2, 2026 • 12:45 AM
   ========================================================= */

export function formatActivityDateTime(timestamp) {
  const formattedDate = formatActivityDate(timestamp);
  const formattedTime = formatActivityTime(timestamp);

  if (!formattedDate && !formattedTime) {
    return "";
  }

  if (!formattedDate) {
    return formattedTime;
  }

  if (!formattedTime) {
    return formattedDate;
  }

  return `${formattedDate} • ${formattedTime}`;
}
