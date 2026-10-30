import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "firebase/firestore";

import { db } from "../../../firebase/firebaseConfig";
import { addActivityLog } from "../../dashboard/activityLogService";
import {
  buildTransactionId,
  createDocumentIfAbsent
} from "../../../utils/idUtils";
import { withTimeout } from "../../../utils/asyncUtils";

const TRANSACTIONS_COLLECTION = "transactions";
const SERVICES_COLLECTION = "services";


/* =========================================
   GET ALL TRANSACTIONS
   ========================================= */

export async function getAllTransactions() {
  const snapshot = await withTimeout(
    getDocs(collection(db, TRANSACTIONS_COLLECTION)),
    10000,
    "Fetching transactions"
  );

  const transactions = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data()
  }));

  transactions.sort((a, b) =>
    String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
  );

  return transactions;
}


/* =========================================
   GET TRANSACTION BY ID
   ========================================= */

export async function getTransactionById(transactionId) {
  if (!transactionId) {
    return null;
  }

  const docRef = doc(
    db,
    TRANSACTIONS_COLLECTION,
    transactionId
  );

  const docSnap = await withTimeout(
    getDoc(docRef),
    10000,
    "Fetching transaction by ID"
  );

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data()
  };
}


/* =========================================
   GET ACTIVE SERVICES
   ========================================= */

export async function getActiveServices() {
  const snapshot = await withTimeout(
    getDocs(collection(db, SERVICES_COLLECTION)),
    10000,
    "Fetching active services"
  );

  const services = snapshot.docs
    .map((document) => ({
      id: document.id,
      ...document.data()
    }))
    .filter((service) => service.isActive === true);

  services.sort((a, b) =>
    String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
  );

  return services;
}


/* =========================================
   GET SERVICE NAME
   Used for Recent Updates
   ========================================= */

async function getServiceName(serviceId) {
  if (!serviceId) {
    return "";
  }

  try {
    const docRef = doc(
      db,
      SERVICES_COLLECTION,
      serviceId
    );

    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return "";
    }

    return docSnap.data()?.name || "";
  } catch (error) {
    console.error(
      "Failed to get service name:",
      error
    );
    return "";
  }
}


/* =========================================
   ADD TRANSACTION
   ========================================= */

export async function addTransaction(
  serviceId,
  name,
  description,
  officeName,
  officeSchedule
) {
  const cleanServiceId = serviceId.trim();
  const cleanName = name.trim();
  const cleanDescription = description.trim();
  const cleanOfficeName = officeName.trim();
  const cleanOfficeSchedule = officeSchedule.trim();

  if (!cleanServiceId) {
    throw new Error("Please select a service.");
  }

  if (!cleanName) {
    throw new Error("Transaction name is required.");
  }

  const transactionId = buildTransactionId(cleanName);

  await createDocumentIfAbsent(
    db,
    TRANSACTIONS_COLLECTION,
    transactionId,
    {
      serviceId: cleanServiceId,
      name: cleanName,
      description: cleanDescription,
      officeName: cleanOfficeName,
      officeSchedule: cleanOfficeSchedule,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    `A transaction with the name "${cleanName}" already exists.`
  );

  const serviceName =
    await getServiceName(cleanServiceId);

  try {
    await addActivityLog({
      type: "transaction",
      action: "added",
      title: cleanName,
      description: "New transaction added",
      parentName: serviceName,
      parentId: cleanServiceId,
      recordId: transactionId
    });
  } catch (logErr) {
    console.warn("Transaction activity log notice:", logErr?.message || logErr);
  }

  return transactionId;
}


/* =========================================
   UPDATE TRANSACTION
   ID DOES NOT CHANGE
   ========================================= */

export async function updateTransaction(
  transactionId,
  serviceId,
  name,
  description,
  officeName,
  officeSchedule
) {
  const cleanServiceId = serviceId.trim();
  const cleanName = name.trim();

  if (!transactionId) {
    throw new Error("Transaction ID is required.");
  }

  if (!cleanServiceId) {
    throw new Error("Please select a service.");
  }

  if (!cleanName) {
    throw new Error("Transaction name is required.");
  }

  const transactionRef = doc(
    db,
    TRANSACTIONS_COLLECTION,
    transactionId
  );

  await updateDoc(transactionRef, {
    serviceId: cleanServiceId,
    name: cleanName,
    description: description.trim(),
    officeName: officeName.trim(),
    officeSchedule: officeSchedule.trim(),
    updatedAt: serverTimestamp()
  });

  const serviceName =
    await getServiceName(cleanServiceId);

  try {
    await addActivityLog({
      type: "transaction",
      action: "updated",
      title: cleanName,
      description: "Transaction information updated",
      parentName: serviceName,
      parentId: cleanServiceId,
      recordId: transactionId
    });
  } catch (logErr) {
    console.warn("Transaction activity log notice:", logErr?.message || logErr);
  }
}


/* =========================================
   ACTIVATE / DEACTIVATE TRANSACTION
   ========================================= */

export async function setTransactionActiveStatus(
  transactionId,
  isActive
) {
  if (!transactionId) {
    throw new Error("Transaction ID is required.");
  }

  const transactionRef = doc(
    db,
    TRANSACTIONS_COLLECTION,
    transactionId
  );

  const transactionSnap =
    await getDoc(transactionRef);

  const transactionData =
    transactionSnap.exists()
      ? transactionSnap.data()
      : null;

  const transactionName =
    transactionData?.name || "Transaction";

  const serviceId =
    transactionData?.serviceId || "";

  const serviceName =
    await getServiceName(serviceId);

  await updateDoc(transactionRef, {
    isActive,
    updatedAt: serverTimestamp()
  });

  try {
    await addActivityLog({
      type: "transaction",
      action: isActive
        ? "activated"
        : "deactivated",
      title: transactionName,
      description: isActive
        ? "Transaction activated"
        : "Transaction deactivated",
      parentName: serviceName,
      parentId: serviceId,
      recordId: transactionId
    });
  } catch (logErr) {
    console.warn("Transaction activity log notice:", logErr?.message || logErr);
  }
}


/* =========================================
   GET TRANSACTION CHILD COUNTS
   Used to prevent orphaned records on transaction deletion
   ========================================= */

export async function getTransactionChildCounts(
  transactionId
) {
  if (!transactionId) {
    return {
      requirements: 0,
      procedures: 0,
      guidelines: 0,
      total: 0
    };
  }

  const [reqSnapshot, procSnapshot, guideSnapshot] =
    await Promise.all([
      getDocs(
        query(
          collection(db, "requirements"),
          where("transactionId", "==", transactionId)
        )
      ),
      getDocs(
        query(
          collection(db, "procedure_steps"),
          where("transactionId", "==", transactionId)
        )
      ),
      getDocs(
        query(
          collection(db, "department_guidelines"),
          where("transactionId", "==", transactionId)
        )
      )
    ]);

  const requirements = reqSnapshot.size;
  const procedures = procSnapshot.size;
  const guidelines = guideSnapshot.size;
  const total = requirements + procedures + guidelines;

  return {
    requirements,
    procedures,
    guidelines,
    total
  };
}


/* =========================================
   DELETE TRANSACTION
   ========================================= */

export async function deleteTransaction(
  transactionId
) {
  if (!transactionId) {
    throw new Error("Transaction ID is required.");
  }

  /*
   * Check if child records exist.
   * Prevent deletion to avoid orphaned records.
   */
  const childCounts =
    await getTransactionChildCounts(transactionId);

  if (childCounts.total > 0) {
    const parts = [];

    if (childCounts.requirements > 0) {
      parts.push(`${childCounts.requirements} requirement(s)`);
    }

    if (childCounts.procedures > 0) {
      parts.push(`${childCounts.procedures} procedure step(s)`);
    }

    if (childCounts.guidelines > 0) {
      parts.push(`${childCounts.guidelines} guideline(s)`);
    }

    throw new Error(
      `Cannot delete this transaction because it contains ${parts.join(
        ", "
      )}. Please remove these child records first, or deactivate this transaction instead.`
    );
  }

  /*
   * Get transaction information BEFORE
   * deleting it so the Recent Update
   * still knows its name and service.
   */
  const transactionRef = doc(
    db,
    TRANSACTIONS_COLLECTION,
    transactionId
  );

  const transactionSnap =
    await getDoc(transactionRef);

  const transactionData =
    transactionSnap.exists()
      ? transactionSnap.data()
      : null;

  const transactionName =
    transactionData?.name || "Transaction";

  const serviceId =
    transactionData?.serviceId || "";

  const serviceName =
    await getServiceName(serviceId);

  await deleteDoc(transactionRef);

  try {
    await addActivityLog({
      type: "transaction",
      action: "deleted",
      title: transactionName,
      description: "Transaction deleted",
      parentName: serviceName,
      parentId: serviceId,
      recordId: transactionId
    });
  } catch (logErr) {
    console.warn("Transaction activity log notice:", logErr?.message || logErr);
  }
}
