import {
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "firebase/firestore";

import { updateProfile as updateAuthProfile } from "firebase/auth";

import {
  auth,
  db
} from "../../firebase/firebaseConfig.js";

import {
  DEFAULT_ADMIN_EMAIL
} from "../auth/authService.js";

import { addActivityLog } from "../dashboard/activityLogService.js";

export const DEFAULT_PROFILE = {
  name: "Admin User",
  position: "System Administrator",
  department: "Registrar's Office",
  email: DEFAULT_ADMIN_EMAIL,
  phone: "",
  role: "Administrator"
};

export const PRESET_DEPARTMENTS = [
  "Registrar's Office",
  "Admissions Office",
  "Accounting & Finance Office",
  "Information Technology Department",
  "Student Affairs & Services (SAS)",
  "Academic Affairs (OVPAA)",
  "College of Computer Studies",
  "College of Business Administration",
  "College of Education & Arts",
  "Guidance & Counseling Center"
];

export const PRESET_POSITIONS = [
  "System Administrator",
  "Registrar Officer",
  "Records Custodian",
  "Admissions Officer",
  "Accounting Officer",
  "Department Head",
  "Administrative Assistant",
  "Student Services Coordinator"
];

export const PRIMARY_ADMIN_UID = "uha6UPkMw4ajlIXe8hp1qkSqxwI2";
export const KNOWN_ADMIN_UIDS = [
  "uha6UPkMw4ajlIXe8hp1qkSqxwI2", // erequesticctadmin@gmail.com
  "RitMvAmyajPOG8PzDeYEjiCBOzC2", // erequestadmin@gmail.com
  "eDt4PFlPTKbM0sZ29Ru1d3yGoGb2"  // admin.erequesticct@gmail.com
];

const PROFILE_STORAGE_PREFIX = "erequest_admin_profile_";
const ACTIVE_PROFILE_STORAGE_KEY = "erequest_admin_active_profile";
const PROFILE_UPDATE_EVENT = "admin-profile-updated";

/**
 * Extracts 1 or 2 uppercase initials from a full name.
 * e.g., "Juan Dela Cruz" -> "JC" (first and last), "Admin User" -> "AU", "Registrar" -> "R"
 */
export function getInitials(name = "") {
  const clean = String(name || "").trim();
  if (!clean) return "A";

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return (first + last).toUpperCase();
}

/**
 * Validates admin profile inputs.
 * Ensures name, position, and department are present and properly formatted.
 */
export function validateProfile(data = {}) {
  const errors = {};

  const name = String(data.name || "").trim();
  const position = String(data.position || "").trim();
  const department = String(data.department || "").trim();

  if (!name) {
    errors.name = "Full name is required.";
  } else if (name.length < 2) {
    errors.name = "Full name must be at least 2 characters.";
  }

  if (!position) {
    errors.position = "Position / designation is required.";
  } else if (position.length < 2) {
    errors.position = "Position must be at least 2 characters.";
  }

  if (!department) {
    errors.department = "Department / office is required.";
  } else if (department.length < 2) {
    errors.department = "Department must be at least 2 characters.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Resolves the appropriate cache key for localStorage.
 */
function getStorageKey(userId) {
  if (userId) {
    return `${PROFILE_STORAGE_PREFIX}${userId}`;
  }
  const currentUid = auth.currentUser?.uid;
  if (currentUid) {
    return `${PROFILE_STORAGE_PREFIX}${currentUid}`;
  }
  return ACTIVE_PROFILE_STORAGE_KEY;
}

/**
 * Retrieves the cached admin profile from localStorage.
 */
export function getCachedAdminProfile(userId) {
  try {
    if (typeof localStorage !== "undefined") {
      const key = getStorageKey(userId);
      const raw = localStorage.getItem(key) || localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          email: auth.currentUser?.email || parsed.email || DEFAULT_ADMIN_EMAIL
        };
      }
    }
  } catch (err) {
    console.warn("Could not read cached admin profile:", err);
  }

  return {
    ...DEFAULT_PROFILE,
    email: auth.currentUser?.email || DEFAULT_ADMIN_EMAIL
  };
}

/**
 * Saves profile data to local cache.
 */
export function cacheAdminProfile(profileData, userId) {
  try {
    if (typeof localStorage !== "undefined") {
      const serialized = JSON.stringify(profileData);
      const key = getStorageKey(userId);
      localStorage.setItem(key, serialized);
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, serialized);
    }
  } catch (err) {
    console.warn("Could not cache admin profile:", err);
  }
}

/**
 * Normalizes raw admin document data against defaults.
 * Cloud-First: Always prefers live Firestore data over any local fallback.
 */
export function normalizeProfileData(raw = {}, uid, fallback = null) {
  const currentEmail =
    raw.email || auth.currentUser?.email || fallback?.email || DEFAULT_ADMIN_EMAIL;

  return {
    name:
      raw.name ||
      auth.currentUser?.displayName ||
      fallback?.name ||
      DEFAULT_PROFILE.name,
    position:
      raw.position || fallback?.position || DEFAULT_PROFILE.position,
    department:
      raw.department || fallback?.department || DEFAULT_PROFILE.department,
    email: currentEmail,
    phone: raw.phone || fallback?.phone || "",
    role:
      raw.role === "admin"
        ? "Administrator"
        : raw.role || fallback?.role || "Administrator",
    updatedAt: raw.updatedAt || fallback?.updatedAt || null
  };
}

/**
 * Loads the admin profile directly from Cloud Firestore (admins/{userId}).
 * Single source of truth: Firebase Cloud Firestore.
 */
export async function getAdminProfile(userId) {
  const currentUid = userId || auth.currentUser?.uid;

  if (!currentUid) {
    return {
      ...DEFAULT_PROFILE,
      email: auth.currentUser?.email || DEFAULT_ADMIN_EMAIL
    };
  }

  try {
    const adminDocRef = doc(db, "admins", currentUid);
    const snap = await getDoc(adminDocRef);

    if (snap.exists()) {
      return normalizeProfileData(snap.data(), currentUid);
    }
  } catch (err) {
    console.warn("Firestore admin profile read notice:", err.message);
  }

  return {
    ...DEFAULT_PROFILE,
    email: auth.currentUser?.email || DEFAULT_ADMIN_EMAIL
  };
}

/**
 * Updates the admin profile directly in Cloud Firestore.
 * Once written, Firestore onSnapshot automatically broadcasts changes to all active devices.
 */
export async function updateAdminProfile(updatedFields = {}, userId) {
  const currentUid = userId || auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error("Administrator must be signed in to update profile.");
  }

  const currentEmail = auth.currentUser?.email || DEFAULT_ADMIN_EMAIL;

  // Retrieve current live cloud data to preserve unchanged fields
  let currentRemote = {};
  try {
    const adminDocRef = doc(db, "admins", currentUid);
    const snap = await getDoc(adminDocRef);
    if (snap.exists()) {
      currentRemote = snap.data();
    }
  } catch {
    // If read fails, proceed with defaults
  }

  const cleanName = String(
    updatedFields.name ?? currentRemote.name ?? DEFAULT_PROFILE.name
  ).trim();
  const cleanPosition = String(
    updatedFields.position ?? currentRemote.position ?? DEFAULT_PROFILE.position
  ).trim();
  const cleanDepartment = String(
    updatedFields.department ?? currentRemote.department ?? DEFAULT_PROFILE.department
  ).trim();
  const cleanPhone = String(
    updatedFields.phone ?? currentRemote.phone ?? ""
  ).trim();

  // 1. Validation
  const validation = validateProfile({
    name: cleanName,
    position: cleanPosition,
    department: cleanDepartment
  });

  if (!validation.isValid) {
    const firstError = Object.values(validation.errors)[0];
    throw new Error(firstError || "Invalid profile data.");
  }

  const nowIso = new Date().toISOString();

  const payload = {
    name: cleanName,
    position: cleanPosition,
    department: cleanDepartment,
    phone: cleanPhone,
    email: currentEmail,
    role: "admin",
    updatedAt: nowIso
  };

  // 2. Direct Write to Cloud Firestore (Single Source of Truth)
  const adminDocRef = doc(db, "admins", currentUid);
  await setDoc(adminDocRef, payload, { merge: true });

  // 2b. Synchronize companion admin documents so all sessions across all devices stay identical
  for (const companionUid of KNOWN_ADMIN_UIDS) {
    if (companionUid === currentUid) continue;
    try {
      const compRef = doc(db, "admins", companionUid);
      setDoc(
        compRef,
        {
          name: cleanName,
          position: cleanPosition,
          department: cleanDepartment,
          phone: cleanPhone,
          role: "admin",
          updatedAt: nowIso
        },
        { merge: true }
      ).catch(() => {});
    } catch {
      // Non-blocking companion sync
    }
  }

  // 3. Update Firebase Auth displayName if changed
  if (auth.currentUser && auth.currentUser.displayName !== cleanName) {
    try {
      await updateAuthProfile(auth.currentUser, { displayName: cleanName });
    } catch (authErr) {
      console.warn("Auth displayName update notice:", authErr.message);
    }
  }

  // 4. Record Activity Log (Non-blocking)
  addActivityLog({
    type: "admin_profile",
    action: "updated",
    title: `Profile updated for ${cleanName}`,
    description: `Position: ${cleanPosition} | Department: ${cleanDepartment}`,
    recordId: currentUid
  }).catch((logErr) => {
    console.warn("Profile activity log notice:", logErr.message);
  });

  const resolvedProfile = normalizeProfileData(payload, currentUid);

  return {
    success: true,
    profile: resolvedProfile,
    firestoreSaved: true
  };
}

/**
 * Subscribes to real-time updates for an admin profile document in Firestore (admins/{userId}).
 * Automatically synchronizes profile changes across all devices and sessions without manual page refresh.
 *
 * @param {string|function} userIdOrCallback - Optional user ID (or callback function)
 * @param {function} [onUpdateOrCallback] - Callback invoked when profile updates
 * @param {function} [onError] - Optional error handler callback
 * @returns {function(): void} Unsubscribe function
 */
export function subscribeToAdminProfile(userIdOrCallback, onUpdateOrCallback, onError) {
  const explicitUid =
    typeof userIdOrCallback === "string" && userIdOrCallback.trim()
      ? userIdOrCallback.trim()
      : null;

  const updateCallback =
    typeof userIdOrCallback === "function" ? userIdOrCallback : onUpdateOrCallback;

  const errorCallback =
    typeof userIdOrCallback === "function" ? onUpdateOrCallback : onError;

  if (typeof updateCallback !== "function") {
    return () => {};
  }

  // If explicit UID was provided, subscribe directly to that document
  if (explicitUid) {
    return subscribeToAdminDoc(explicitUid, updateCallback, errorCallback);
  }

  // Otherwise, reactively track the authenticated user's UID to keep the subscription current
  let docUnsub = null;
  let isCleanedUp = false;

  const currentUid = auth.currentUser?.uid;
  if (currentUid) {
    docUnsub = subscribeToAdminDoc(currentUid, updateCallback, errorCallback);
  }

  const authUnsub =
    typeof auth?.onAuthStateChanged === "function"
      ? auth.onAuthStateChanged((user) => {
          if (isCleanedUp) return;
          const targetUid = user?.uid || auth.currentUser?.uid;
          if (targetUid) {
            if (docUnsub) docUnsub();
            docUnsub = subscribeToAdminDoc(targetUid, updateCallback, errorCallback);
          } else {
            updateCallback({
              ...DEFAULT_PROFILE,
              email: DEFAULT_ADMIN_EMAIL
            });
          }
        })
      : null;

  return () => {
    isCleanedUp = true;
    if (typeof authUnsub === "function") authUnsub();
    if (typeof docUnsub === "function") docUnsub();
  };
}

/**
 * Attaches Firestore onSnapshot listener to the specific admin document.
 * Cloud-First: Live Firestore document (/admins/{uid}) is the sole authority.
 */
function subscribeToAdminDoc(uid, onUpdate, onError) {
  try {
    const adminDocRef = doc(db, "admins", uid);

    const unsubscribe = onSnapshot(
      adminDocRef,
      (snapshot) => {
        try {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const resolved = normalizeProfileData(data, uid);

            // Notify local tab listeners
            if (typeof window !== "undefined") {
              try {
                window.dispatchEvent(
                  new CustomEvent(PROFILE_UPDATE_EVENT, { detail: resolved })
                );
              } catch {
                // Ignore restricted window dispatch errors
              }
            }

            onUpdate(resolved);
          } else {
            // If doc doesn't exist for this UID yet, inherit from primary admin doc
            if (uid !== PRIMARY_ADMIN_UID) {
              const primaryRef = doc(db, "admins", PRIMARY_ADMIN_UID);
              getDoc(primaryRef)
                .then((pSnap) => {
                  if (pSnap.exists()) {
                    onUpdate(normalizeProfileData(pSnap.data(), uid));
                  } else {
                    onUpdate({
                      ...DEFAULT_PROFILE,
                      email: auth.currentUser?.email || DEFAULT_ADMIN_EMAIL
                    });
                  }
                })
                .catch(() => {
                  onUpdate({
                    ...DEFAULT_PROFILE,
                    email: auth.currentUser?.email || DEFAULT_ADMIN_EMAIL
                  });
                });
            } else {
              onUpdate({
                ...DEFAULT_PROFILE,
                email: auth.currentUser?.email || DEFAULT_ADMIN_EMAIL
              });
            }
          }
        } catch (err) {
          console.warn("Failed to process real-time admin profile update:", err);
          if (typeof onError === "function") {
            onError(err);
          }
        }
      },
      (error) => {
        console.warn("Firestore real-time profile listener notice:", error?.message || error);
        if (typeof onError === "function") {
          onError(error);
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn("Could not initiate Firestore profile subscription:", err);
    if (typeof onError === "function") {
      onError(err);
    }
    return () => {};
  }
}

/**
 * Registers a listener callback for profile updates.
 * Bridges real-time Firestore updates across devices with local tab events.
 * Returns an unsubscribe function.
 */
export function onAdminProfileChange(callback) {
  if (typeof window === "undefined" || typeof callback !== "function") {
    return () => {};
  }

  // 1. Subscribe to real-time Firestore listener for cross-device updates
  const firestoreUnsub = subscribeToAdminProfile(callback);

  // 2. Also listen for same-tab custom events
  const handler = (event) => {
    if (event?.detail) {
      callback(event.detail);
    }
  };

  window.addEventListener(PROFILE_UPDATE_EVENT, handler);

  return () => {
    if (typeof firestoreUnsub === "function") {
      firestoreUnsub();
    }
    window.removeEventListener(PROFILE_UPDATE_EVENT, handler);
  };
}
