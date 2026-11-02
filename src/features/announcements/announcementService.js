import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../../firebase/firebaseConfig";
import { addActivityLog } from "../dashboard/activityLogService";
import {
  encryptCatalogField,
  decryptCatalogField
} from "../../utils/vaultCrypto.js";

const ANNOUNCEMENTS_COLLECTION = "announcements";


/* =========================================================
   GET ALL ANNOUNCEMENTS
   ========================================================= */

export const getAllAnnouncements = async () => {
  const snapshot = await getDocs(
    collection(db, ANNOUNCEMENTS_COLLECTION)
  );

  return await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        title: await decryptCatalogField(data.title),
        message: await decryptCatalogField(data.message)
      };
    })
  );
};


/* =========================================================
   GET ANNOUNCEMENT BY ID
   ========================================================= */

export const getAnnouncementById = async (announcementId) => {
  if (!announcementId) {
    return null;
  }

  const announcementRef = doc(
    db,
    ANNOUNCEMENTS_COLLECTION,
    announcementId
  );

  const snapshot = await getDoc(announcementRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    title: await decryptCatalogField(data.title),
    message: await decryptCatalogField(data.message)
  };
};


/* =========================================================
   ADD ANNOUNCEMENT
   ========================================================= */

export const addAnnouncement = async (
  title,
  message,
  displayOrder
) => {
  const cleanTitle = title.trim();
  const cleanMessage = message.trim();
  const order = Number(displayOrder);

  if (!cleanTitle) {
    throw new Error(
      "Announcement title is required."
    );
  }

  if (!cleanMessage) {
    throw new Error(
      "Announcement message is required."
    );
  }

  if (Number.isNaN(order)) {
    throw new Error(
      "Display order must be a number."
    );
  }

  const encryptedTitle = await encryptCatalogField(cleanTitle);
  const encryptedMessage = await encryptCatalogField(cleanMessage);

  const documentReference = await addDoc(
    collection(db, ANNOUNCEMENTS_COLLECTION),
    {
      title: encryptedTitle,
      message: encryptedMessage,
      displayOrder: order,
      isActive: true,
      datePosted: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  addActivityLog({
    type: "announcement",
    action: "added",
    title: cleanTitle,
    description: "New announcement added",
    recordId: documentReference.id
  }).catch((logErr) => {
    console.warn("Announcement activity log notice:", logErr?.message || logErr);
  });

  return documentReference.id;
};


/* =========================================================
   UPDATE ANNOUNCEMENT
   ========================================================= */

export const updateAnnouncement = async (
  announcementId,
  title,
  message,
  displayOrder
) => {
  if (!announcementId) {
    throw new Error(
      "Unable to update announcement: missing document ID."
    );
  }

  const cleanTitle = title.trim();
  const cleanMessage = message.trim();
  const order = Number(displayOrder);

  if (!cleanTitle) {
    throw new Error(
      "Announcement title is required."
    );
  }

  if (!cleanMessage) {
    throw new Error(
      "Announcement message is required."
    );
  }

  if (Number.isNaN(order)) {
    throw new Error(
      "Display order must be a number."
    );
  }

  const announcementRef = doc(
    db,
    ANNOUNCEMENTS_COLLECTION,
    announcementId
  );

  const encryptedTitle = await encryptCatalogField(cleanTitle);
  const encryptedMessage = await encryptCatalogField(cleanMessage);

  await updateDoc(announcementRef, {
    title: encryptedTitle,
    message: encryptedMessage,
    displayOrder: order,
    updatedAt: serverTimestamp()
  });

  /* ACTIVITY LOG (NON-BLOCKING) */
  addActivityLog({
    type: "announcement",
    action: "updated",
    title: cleanTitle,
    description: "Announcement information updated",
    recordId: announcementId
  }).catch((logErr) => {
    console.warn("Announcement activity log notice:", logErr?.message || logErr);
  });
};


/* =========================================================
   ACTIVATE / DEACTIVATE ANNOUNCEMENT
   ========================================================= */

export const setAnnouncementActiveStatus = async (
  announcementId,
  isActive
) => {
  if (!announcementId) {
    throw new Error(
      "Unable to change announcement status: missing document ID."
    );
  }

  const announcementRef = doc(
    db,
    ANNOUNCEMENTS_COLLECTION,
    announcementId
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  const logPromise = (async () => {
    try {
      const announcementSnap = await getDoc(announcementRef);
      const rawTitle =
        (announcementSnap.exists() && announcementSnap.data()?.title) ||
        "Announcement";
      const announcementTitle = await decryptCatalogField(rawTitle);

      await addActivityLog({
        type: "announcement",
        action: isActive ? "activated" : "deactivated",
        title: announcementTitle,
        description: isActive
          ? "Announcement activated"
          : "Announcement deactivated",
        recordId: announcementId
      });
    } catch (logErr) {
      console.warn("Announcement activity log notice:", logErr?.message || logErr);
    }
  })();

  await updateDoc(announcementRef, {
    isActive: Boolean(isActive),
    updatedAt: serverTimestamp()
  });

  logPromise.catch(() => {});
};


/* =========================================================
   DELETE ANNOUNCEMENT
   ========================================================= */

export const deleteAnnouncement = async (
  announcementId
) => {
  if (!announcementId) {
    throw new Error(
      "Unable to delete announcement: missing document ID."
    );
  }

  const announcementRef = doc(
    db,
    ANNOUNCEMENTS_COLLECTION,
    announcementId
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  const logPromise = (async () => {
    try {
      const announcementSnap = await getDoc(announcementRef);
      const rawTitle =
        (announcementSnap.exists() && announcementSnap.data()?.title) ||
        "Announcement";
      const announcementTitle = await decryptCatalogField(rawTitle);

      await addActivityLog({
        type: "announcement",
        action: "deleted",
        title: announcementTitle,
        description: "Announcement deleted",
        recordId: announcementId
      });
    } catch (logErr) {
      console.warn("Announcement activity log notice:", logErr?.message || logErr);
    }
  })();

  await deleteDoc(announcementRef);
  logPromise.catch(() => {});
};