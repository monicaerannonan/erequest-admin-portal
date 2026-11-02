import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../../../firebase/firebaseConfig";
import { addActivityLog } from "../../dashboard/activityLogService";
import {
  buildGuidelineId,
  createDocumentIfAbsent
} from "../../../utils/idUtils";
import {
  encryptCatalogField,
  decryptCatalogField
} from "../../../utils/vaultCrypto.js";

const GUIDELINES_COLLECTION = "department_guidelines";
const TRANSACTIONS_COLLECTION = "transactions";


/* =========================================
   GET ALL GUIDELINES
   ========================================= */

export async function getAllGuidelines() {
  const snapshot = await getDocs(
    collection(db, GUIDELINES_COLLECTION)
  );

  const guidelines = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        guidelineText: await decryptCatalogField(data.guidelineText)
      };
    })
  );

  guidelines.sort((a, b) => {
    const transactionCompare =
      (a.transactionId || "").localeCompare(
        b.transactionId || ""
      );

    if (transactionCompare !== 0) {
      return transactionCompare;
    }

    return (a.displayOrder || 0) - (b.displayOrder || 0);
  });

  return guidelines;
}


/* =========================================
   GET GUIDELINES BY TRANSACTION ID
   ========================================= */

export async function getGuidelinesByTransactionId(transactionId) {
  if (!transactionId) {
    return [];
  }

  const q = query(
    collection(db, GUIDELINES_COLLECTION),
    where("transactionId", "==", transactionId)
  );

  const snapshot = await getDocs(q);

  const guidelines = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        guidelineText: await decryptCatalogField(data.guidelineText)
      };
    })
  );

  guidelines.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  return guidelines;
}


/* =========================================
   GET TRANSACTION NAME
   For Recent Updates
   ========================================= */

const transactionNameCache = new Map();

async function getTransactionName(transactionId) {
  if (!transactionId) {
    return "";
  }

  if (transactionNameCache.has(transactionId)) {
    return transactionNameCache.get(transactionId);
  }

  try {
    const docRef = doc(
      db,
      TRANSACTIONS_COLLECTION,
      transactionId
    );

    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return "";
    }

    const rawName = docSnap.data()?.name || "";
    const name = await decryptCatalogField(rawName);
    if (name) {
      transactionNameCache.set(transactionId, name);
    }
    return name;
  } catch (error) {
    console.error(
      "Failed to get transaction name:",
      error
    );
    return "";
  }
}


/* =========================================
   ADD GUIDELINE
   ========================================= */

export async function addGuideline(
  transactionId,
  guidelineText,
  displayOrder
) {
  const cleanTransactionId = transactionId.trim();
  const cleanGuidelineText = guidelineText.trim();
  const cleanDisplayOrder = Number(displayOrder);

  if (!cleanTransactionId) {
    throw new Error(
      "Transaction ID is required."
    );
  }

  if (!cleanGuidelineText) {
    throw new Error(
      "Guideline is required."
    );
  }

  if (
    !Number.isInteger(cleanDisplayOrder) ||
    cleanDisplayOrder < 1
  ) {
    throw new Error(
      "Display order must be greater than 0."
    );
  }

  const guidelineId = buildGuidelineId(
    cleanTransactionId,
    cleanGuidelineText
  );

  const encryptedGuidelineText = await encryptCatalogField(cleanGuidelineText);

  await createDocumentIfAbsent(
    db,
    GUIDELINES_COLLECTION,
    guidelineId,
    {
      transactionId: cleanTransactionId,
      guidelineText: encryptedGuidelineText,
      displayOrder: cleanDisplayOrder,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    `A guideline with the text "${cleanGuidelineText}" already exists for this transaction.`
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  (async () => {
    try {
      const transactionName =
        await getTransactionName(cleanTransactionId);
      await addActivityLog({
        type: "guideline",
        action: "added",
        title: cleanGuidelineText,
        description: "New guideline added",
        parentName: transactionName,
        parentId: cleanTransactionId,
        recordId: guidelineId
      });
    } catch (logErr) {
      console.warn("Guideline activity log notice:", logErr?.message || logErr);
    }
  })();

  return guidelineId;
}


/* =========================================
   UPDATE GUIDELINE
   ========================================= */

export async function updateGuideline(
  guidelineId,
  transactionId,
  guidelineText,
  displayOrder
) {
  const cleanTransactionId = transactionId.trim();
  const cleanGuidelineText = guidelineText.trim();
  const cleanDisplayOrder = Number(displayOrder);

  if (!guidelineId) {
    throw new Error(
      "Guideline ID is required."
    );
  }

  if (!cleanTransactionId) {
    throw new Error(
      "Transaction ID is required."
    );
  }

  if (!cleanGuidelineText) {
    throw new Error(
      "Guideline is required."
    );
  }

  if (
    !Number.isInteger(cleanDisplayOrder) ||
    cleanDisplayOrder < 1
  ) {
    throw new Error(
      "Display order must be greater than 0."
    );
  }

  const guidelineRef = doc(
    db,
    GUIDELINES_COLLECTION,
    guidelineId
  );

  const encryptedGuidelineText = await encryptCatalogField(cleanGuidelineText);

  await updateDoc(guidelineRef, {
    transactionId: cleanTransactionId,
    guidelineText: encryptedGuidelineText,
    displayOrder: cleanDisplayOrder,
    updatedAt: serverTimestamp()
  });

  /* ACTIVITY LOG (NON-BLOCKING) */
  (async () => {
    try {
      const transactionName =
        await getTransactionName(cleanTransactionId);
      await addActivityLog({
        type: "guideline",
        action: "updated",
        title: cleanGuidelineText,
        description: "Guideline information updated",
        parentName: transactionName,
        parentId: cleanTransactionId,
        recordId: guidelineId
      });
    } catch (logErr) {
      console.warn("Guideline activity log notice:", logErr?.message || logErr);
    }
  })();
}


/* =========================================
   ACTIVATE / DEACTIVATE GUIDELINE
   ========================================= */

export async function setGuidelineActiveStatus(
  guidelineId,
  isActive
) {
  if (!guidelineId) {
    throw new Error(
      "Guideline ID is required."
    );
  }

  const guidelineRef = doc(
    db,
    GUIDELINES_COLLECTION,
    guidelineId
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  const logPromise = (async () => {
    try {
      const guidelineSnap = await getDoc(guidelineRef);
      const guidelineData = guidelineSnap.exists()
        ? guidelineSnap.data()
        : null;
      const rawText =
        guidelineData?.guidelineText || "Guideline";
      const guidelineName = await decryptCatalogField(rawText);
      const transactionId =
        guidelineData?.transactionId || "";
      const transactionName =
        await getTransactionName(transactionId);

      await addActivityLog({
        type: "guideline",
        action: isActive ? "activated" : "deactivated",
        title: guidelineName,
        description: isActive
          ? "Guideline activated"
          : "Guideline deactivated",
        parentName: transactionName,
        parentId: transactionId,
        recordId: guidelineId
      });
    } catch (logErr) {
      console.warn("Guideline activity log notice:", logErr?.message || logErr);
    }
  })();

  await updateDoc(guidelineRef, {
    isActive,
    updatedAt: serverTimestamp()
  });

  logPromise.catch(() => {});
}


/* =========================================
   DELETE GUIDELINE
   ========================================= */

export async function deleteGuideline(guidelineId) {
  if (!guidelineId) {
    throw new Error(
      "Guideline ID is required."
    );
  }

  const guidelineRef = doc(
    db,
    GUIDELINES_COLLECTION,
    guidelineId
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  const logPromise = (async () => {
    try {
      const guidelineSnap = await getDoc(guidelineRef);
      const guidelineData = guidelineSnap.exists()
        ? guidelineSnap.data()
        : null;
      const rawText =
        guidelineData?.guidelineText || "Guideline";
      const guidelineName = await decryptCatalogField(rawText);
      const transactionId =
        guidelineData?.transactionId || "";
      const transactionName =
        await getTransactionName(transactionId);

      await addActivityLog({
        type: "guideline",
        action: "deleted",
        title: guidelineName,
        description: "Guideline deleted",
        parentName: transactionName,
        parentId: transactionId,
        recordId: guidelineId
      });
    } catch (logErr) {
      console.warn("Guideline activity log notice:", logErr?.message || logErr);
    }
  })();

  await deleteDoc(guidelineRef);
  logPromise.catch(() => {});
}
