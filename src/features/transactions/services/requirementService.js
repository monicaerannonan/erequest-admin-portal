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
  buildRequirementId,
  createDocumentIfAbsent
} from "../../../utils/idUtils";

const REQUIREMENTS_COLLECTION = "requirements";
const TRANSACTIONS_COLLECTION = "transactions";


/* =========================================
   GET ALL REQUIREMENTS
   ========================================= */

export async function getAllRequirements() {
  const snapshot = await getDocs(
    collection(db, REQUIREMENTS_COLLECTION)
  );

  const requirements = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data()
  }));

  requirements.sort((a, b) => {
    const transactionCompare =
      (a.transactionId || "").localeCompare(
        b.transactionId || ""
      );

    if (transactionCompare !== 0) {
      return transactionCompare;
    }

    return (a.displayOrder || 0) - (b.displayOrder || 0);
  });

  return requirements;
}


/* =========================================
   GET REQUIREMENTS BY TRANSACTION ID
   ========================================= */

export async function getRequirementsByTransactionId(transactionId) {
  if (!transactionId) {
    return [];
  }

  const q = query(
    collection(db, REQUIREMENTS_COLLECTION),
    where("transactionId", "==", transactionId)
  );

  const snapshot = await getDocs(q);

  const requirements = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data()
  }));

  requirements.sort(
    (a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)
  );

  return requirements;
}


/* =========================================
   GET ACTIVE TRANSACTIONS
   ========================================= */

export async function getActiveTransactions() {
  const snapshot = await getDocs(
    collection(db, TRANSACTIONS_COLLECTION)
  );

  const transactions = snapshot.docs
    .map((document) => ({
      id: document.id,
      ...document.data()
    }))
    .filter(
      (transaction) =>
        transaction.isActive === true
    );

  transactions.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  return transactions;
}


/* =========================================
   GET TRANSACTION NAME
   Used for Recent Updates
   ========================================= */

async function getTransactionName(transactionId) {
  if (!transactionId) {
    return "";
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

    return docSnap.data()?.name || "";
  } catch (error) {
    console.error(
      "Failed to get transaction name:",
      error
    );
    return "";
  }
}


/* =========================================
   ADD REQUIREMENT
   ========================================= */

export async function addRequirement(
  transactionId,
  requirementText,
  displayOrder
) {
  const cleanTransactionId = transactionId.trim();
  const cleanRequirementText = requirementText.trim();
  const cleanDisplayOrder = Number(displayOrder);

  if (!cleanTransactionId) {
    throw new Error(
      "Please select a transaction."
    );
  }

  if (!cleanRequirementText) {
    throw new Error(
      "Requirement is required."
    );
  }

  if (
    !Number.isInteger(cleanDisplayOrder) ||
    cleanDisplayOrder < 1
  ) {
    throw new Error(
      "Display order must be a number greater than 0."
    );
  }

  const requirementId = buildRequirementId(
    cleanTransactionId,
    cleanRequirementText
  );

  await createDocumentIfAbsent(
    db,
    REQUIREMENTS_COLLECTION,
    requirementId,
    {
      transactionId: cleanTransactionId,
      requirementText: cleanRequirementText,
      displayOrder: cleanDisplayOrder,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    `A requirement with the text "${cleanRequirementText}" already exists for this transaction.`
  );

  /* ACTIVITY LOG (NON-BLOCKING) */

  const transactionName =
    await getTransactionName(cleanTransactionId);

  try {
    await addActivityLog({
      type: "requirement",
      action: "added",
      title: cleanRequirementText,
      description: "New requirement added",
      parentName: transactionName,
      parentId: cleanTransactionId,
      recordId: requirementId
    });
  } catch (logErr) {
    console.warn("Requirement activity log notice:", logErr?.message || logErr);
  }

  return requirementId;
}


/* =========================================
   UPDATE REQUIREMENT
   ========================================= */

export async function updateRequirement(
  requirementId,
  transactionId,
  requirementText,
  displayOrder
) {
  const cleanTransactionId = transactionId.trim();
  const cleanRequirementText = requirementText.trim();
  const cleanDisplayOrder = Number(displayOrder);

  if (!requirementId) {
    throw new Error(
      "Requirement ID is required."
    );
  }

  if (!cleanTransactionId) {
    throw new Error(
      "Please select a transaction."
    );
  }

  if (!cleanRequirementText) {
    throw new Error(
      "Requirement is required."
    );
  }

  if (
    !Number.isInteger(cleanDisplayOrder) ||
    cleanDisplayOrder < 1
  ) {
    throw new Error(
      "Display order must be a number greater than 0."
    );
  }

  const requirementRef = doc(
    db,
    REQUIREMENTS_COLLECTION,
    requirementId
  );

  await updateDoc(requirementRef, {
    transactionId: cleanTransactionId,
    requirementText: cleanRequirementText,
    displayOrder: cleanDisplayOrder,
    updatedAt: serverTimestamp()
  });

  /* ACTIVITY LOG (NON-BLOCKING) */

  const transactionName =
    await getTransactionName(cleanTransactionId);

  try {
    await addActivityLog({
      type: "requirement",
      action: "updated",
      title: cleanRequirementText,
      description: "Requirement information updated",
      parentName: transactionName,
      parentId: cleanTransactionId,
      recordId: requirementId
    });
  } catch (logErr) {
    console.warn("Requirement activity log notice:", logErr?.message || logErr);
  }
}


/* =========================================
   ACTIVATE / DEACTIVATE REQUIREMENT
   ========================================= */

export async function setRequirementActiveStatus(
  requirementId,
  isActive
) {
  if (!requirementId) {
    throw new Error(
      "Requirement ID is required."
    );
  }

  const requirementRef = doc(
    db,
    REQUIREMENTS_COLLECTION,
    requirementId
  );

  /* Get requirement before updating */
  const requirementSnap =
    await getDoc(requirementRef);

  const requirementData =
    requirementSnap.exists()
      ? requirementSnap.data()
      : null;

  const requirementName =
    requirementData?.requirementText || "Requirement";

  const transactionId =
    requirementData?.transactionId || "";

  const transactionName =
    await getTransactionName(transactionId);

  await updateDoc(requirementRef, {
    isActive,
    updatedAt: serverTimestamp()
  });

  /* ACTIVITY LOG (NON-BLOCKING) */

  try {
    await addActivityLog({
      type: "requirement",
      action: isActive
        ? "activated"
        : "deactivated",
      title: requirementName,
      description: isActive
        ? "Requirement activated"
        : "Requirement deactivated",
      parentName: transactionName,
      parentId: transactionId,
      recordId: requirementId
    });
  } catch (logErr) {
    console.warn("Requirement activity log notice:", logErr?.message || logErr);
  }
}


/* =========================================
   DELETE REQUIREMENT
   ========================================= */

export async function deleteRequirement(
  requirementId
) {
  if (!requirementId) {
    throw new Error(
      "Requirement ID is required."
    );
  }

  const requirementRef = doc(
    db,
    REQUIREMENTS_COLLECTION,
    requirementId
  );

  /*
   * Get information BEFORE deletion.
   */
  const requirementSnap =
    await getDoc(requirementRef);

  const requirementData =
    requirementSnap.exists()
      ? requirementSnap.data()
      : null;

  const requirementName =
    requirementData?.requirementText || "Requirement";

  const transactionId =
    requirementData?.transactionId || "";

  const transactionName =
    await getTransactionName(transactionId);

  await deleteDoc(requirementRef);

  /* ACTIVITY LOG (NON-BLOCKING) */

  try {
    await addActivityLog({
      type: "requirement",
      action: "deleted",
      title: requirementName,
      description: "Requirement deleted",
      parentName: transactionName,
      parentId: transactionId,
      recordId: requirementId
    });
  } catch (logErr) {
    console.warn("Requirement activity log notice:", logErr?.message || logErr);
  }
}
