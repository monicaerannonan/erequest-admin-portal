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
import { uploadProcedureImage } from "../../services/cloudinaryService.js";
import {
  encryptCatalogField,
  decryptCatalogField,
  catalogDecryptedCache,
  CIPHER_PREFIX
} from "../../utils/vaultCrypto.js";

export const DEFAULT_PROFILE = {
  name: "Admin User",
  position: "System Administrator",
  department: "Registrar's Office",
  email: DEFAULT_ADMIN_EMAIL,
  phone: "",
  photoUrl: "",
  role: "Administrator"
};

const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function compressImageToDataUrl(file, size = 256, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid or corrupted image file."));
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Unable to process image preview."));
            return;
          }

          // Center-crop square avatar
          const minSide = Math.min(img.width, img.height);
          const sx = Math.floor((img.width - minSide) / 2);
          const sy = Math.floor((img.height - minSide) / 2);

          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an admin profile picture to Cloudinary with automatic compressed
 * square avatar fallback so photo uploads succeed reliably.
 */
export async function uploadAdminProfilePhoto(file) {
  if (!file) {
    throw new Error("Please select an image file.");
  }

  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file (JPG, PNG, WEBP).");
  }

  if (file.size > MAX_AVATAR_FILE_SIZE) {
    throw new Error("Profile picture must not exceed 5 MB.");
  }

  try {
    const cloudUrl = await uploadProcedureImage(file);
    if (cloudUrl) {
      return cloudUrl;
    }
  } catch (cloudErr) {
    console.warn(
      "[ProfileService] Cloudinary upload notice, using compressed avatar fallback:",
      cloudErr?.message || cloudErr
    );
  }

  return await compressImageToDataUrl(file, 256, 0.84);
}

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
 * Checks the in-memory decrypted catalog cache so ciphertext is never displayed as raw enc:v1:.
 */
export function normalizeProfileData(raw = {}, uid, fallback = null) {
  const currentEmail =
    raw.email || auth.currentUser?.email || fallback?.email || DEFAULT_ADMIN_EMAIL;

  const resolvedPhotoUrl =
    typeof raw.photoUrl === "string"
      ? raw.photoUrl
      : fallback?.photoUrl ?? auth.currentUser?.photoURL ?? "";

  const rawPosition = raw.position || fallback?.position || DEFAULT_PROFILE.position;
  const rawDepartment = raw.department || fallback?.department || DEFAULT_PROFILE.department;
  const rawPhone = raw.phone || fallback?.phone || "";

  // Check in-memory decrypted cache, or if still raw cipher without cached decrypt, use human-readable fallback
  const resolvedPosition =
    catalogDecryptedCache.get(rawPosition) ||
    (String(rawPosition).startsWith(CIPHER_PREFIX)
      ? (fallback?.position && !String(fallback.position).startsWith(CIPHER_PREFIX)
          ? fallback.position
          : DEFAULT_PROFILE.position)
      : rawPosition);

  const resolvedDepartment =
    catalogDecryptedCache.get(rawDepartment) ||
    (String(rawDepartment).startsWith(CIPHER_PREFIX)
      ? (fallback?.department && !String(fallback.department).startsWith(CIPHER_PREFIX)
          ? fallback.department
          : DEFAULT_PROFILE.department)
      : rawDepartment);

  const resolvedPhone =
    catalogDecryptedCache.get(rawPhone) ||
    (String(rawPhone).startsWith(CIPHER_PREFIX)
      ? (fallback?.phone && !String(fallback.phone).startsWith(CIPHER_PREFIX)
          ? fallback.phone
          : "")
      : rawPhone);

  return {
    name:
      raw.name ||
      auth.currentUser?.displayName ||
      fallback?.name ||
      DEFAULT_PROFILE.name,
    position: resolvedPosition,
    department: resolvedDepartment,
    email: currentEmail,
    phone: resolvedPhone,
    photoUrl: resolvedPhotoUrl,
    role:
      raw.role === "admin"
        ? "Administrator"
        : raw.role || fallback?.role || "Administrator",
    updatedAt: raw.updatedAt || fallback?.updatedAt || null
  };
}

/**
 * Asynchronously normalizes raw admin document data, decrypting any encrypted
 * fields (position, department, phone) with bank-grade AES-256.
 */
export async function normalizeProfileDataAsync(raw = {}, uid, fallback = null) {
  const rawPosition = raw.position || fallback?.position || DEFAULT_PROFILE.position;
  const rawDepartment = raw.department || fallback?.department || DEFAULT_PROFILE.department;
  const rawPhone = raw.phone || fallback?.phone || "";

  let decryptedPosition = rawPosition;
  let decryptedDepartment = rawDepartment;
  let decryptedPhone = rawPhone;

  try {
    const [p, d, ph] = await Promise.all([
      decryptCatalogField(rawPosition),
      decryptCatalogField(rawDepartment),
      decryptCatalogField(rawPhone)
    ]);
    decryptedPosition = p || DEFAULT_PROFILE.position;
    decryptedDepartment = d || DEFAULT_PROFILE.department;
    decryptedPhone = ph || "";
  } catch (err) {
    console.warn("[ProfileService] Decryption notice:", err);
  }

  // If decryption failed and still has cipher prefix, revert to default
  if (String(decryptedPosition).startsWith(CIPHER_PREFIX)) {
    decryptedPosition = DEFAULT_PROFILE.position;
  }
  if (String(decryptedDepartment).startsWith(CIPHER_PREFIX)) {
    decryptedDepartment = DEFAULT_PROFILE.department;
  }
  if (String(decryptedPhone).startsWith(CIPHER_PREFIX)) {
    decryptedPhone = "";
  }

  const base = normalizeProfileData(raw, uid, fallback);
  return {
    ...base,
    position: decryptedPosition,
    department: decryptedDepartment,
    phone: decryptedPhone
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
      return await normalizeProfileDataAsync(snap.data(), currentUid);
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
  const cleanPhotoUrl =
    updatedFields.photoUrl !== undefined
      ? String(updatedFields.photoUrl || "").trim()
      : String(currentRemote.photoUrl || "").trim();

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

  // Encrypt position, department, and phone with AES-256 for Firestore storage
  const encryptedPosition = await encryptCatalogField(cleanPosition);
  const encryptedDepartment = await encryptCatalogField(cleanDepartment);
  const encryptedPhone = cleanPhone ? await encryptCatalogField(cleanPhone) : "";

  // Prime local decrypted cache immediately
  if (encryptedPosition) catalogDecryptedCache.set(encryptedPosition, cleanPosition);
  if (encryptedDepartment) catalogDecryptedCache.set(encryptedDepartment, cleanDepartment);
  if (encryptedPhone) catalogDecryptedCache.set(encryptedPhone, cleanPhone);

  const payload = {
    name: cleanName,
    position: encryptedPosition,
    department: encryptedDepartment,
    phone: encryptedPhone,
    photoUrl: cleanPhotoUrl,
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
          position: encryptedPosition,
          department: encryptedDepartment,
          phone: encryptedPhone,
          photoUrl: cleanPhotoUrl,
          role: "admin",
          updatedAt: nowIso
        },
        { merge: true }
      ).catch(() => {});
    } catch {
      // Non-blocking companion sync
    }
  }

  // 3. Update Firebase Auth displayName (and HTTP photoURL if within Auth URL limits)
  if (auth.currentUser) {
    const authPatch = {};
    if (auth.currentUser.displayName !== cleanName) {
      authPatch.displayName = cleanName;
    }
    const canSyncAuthPhoto =
      cleanPhotoUrl === "" ||
      (cleanPhotoUrl.startsWith("http") && cleanPhotoUrl.length <= 2000);
    if (canSyncAuthPhoto && (auth.currentUser.photoURL || "") !== cleanPhotoUrl) {
      authPatch.photoURL = cleanPhotoUrl;
    }
    if (Object.keys(authPatch).length > 0) {
      try {
        await updateAuthProfile(auth.currentUser, authPatch);
      } catch (authErr) {
        console.warn("Auth profile update notice:", authErr.message);
      }
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

  const resolvedProfile = {
    name: cleanName,
    position: cleanPosition,
    department: cleanDepartment,
    phone: cleanPhone,
    photoUrl: cleanPhotoUrl,
    email: currentEmail,
    role: "Administrator",
    updatedAt: nowIso
  };

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
      async (snapshot) => {
        try {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const resolved = await normalizeProfileDataAsync(data, uid);

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
                .then(async (pSnap) => {
                  if (pSnap.exists()) {
                    onUpdate(await normalizeProfileDataAsync(pSnap.data(), uid));
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
