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
import {
  encryptCatalogField,
  decryptCatalogField
} from "../../../utils/vaultCrypto.js";

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

  const transactions = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        name: await decryptCatalogField(data.name),
        description: await decryptCatalogField(data.description),
        officeName: await decryptCatalogField(data.officeName),
        officeSchedule: await decryptCatalogField(data.officeSchedule)
      };
    })
  );

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

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    name: await decryptCatalogField(data.name),
    description: await decryptCatalogField(data.description),
    officeName: await decryptCatalogField(data.officeName),
    officeSchedule: await decryptCatalogField(data.officeSchedule)
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

  const services = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        name: await decryptCatalogField(data.name),
        description: await decryptCatalogField(data.description)
      };
    })
  );

  const activeServices = services.filter((service) => service.isActive === true);

  activeServices.sort((a, b) =>
    String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
  );

  return activeServices;
}


/* =========================================
   GET SERVICE NAME
   Used for Recent Updates
   ========================================= */

const serviceNameCache = new Map();

async function getServiceName(serviceId) {
  if (!serviceId) {
    return "";
  }

  if (serviceNameCache.has(serviceId)) {
    return serviceNameCache.get(serviceId);
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

    const rawName = docSnap.data()?.name || "";
    const name = await decryptCatalogField(rawName);
    serviceNameCache.set(serviceId, name);
    return name;
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

  const encryptedName = await encryptCatalogField(cleanName);
  const encryptedDescription = await encryptCatalogField(cleanDescription);
  const encryptedOfficeName = await encryptCatalogField(cleanOfficeName);
  const encryptedOfficeSchedule = await encryptCatalogField(cleanOfficeSchedule);

  await createDocumentIfAbsent(
    db,
    TRANSACTIONS_COLLECTION,
    transactionId,
    {
      serviceId: cleanServiceId,
      name: encryptedName,
      description: encryptedDescription,
      officeName: encryptedOfficeName,
      officeSchedule: encryptedOfficeSchedule,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    `A transaction with the name "${cleanName}" already exists.`
  );

  // Non-blocking background activity log
  getServiceName(cleanServiceId)
    .then((serviceName) => {
      addActivityLog({
        type: "transaction",
        action: "added",
        title: cleanName,
        description: "New transaction added",
        parentName: serviceName,
        parentId: cleanServiceId,
        recordId: transactionId
      }).catch((logErr) => {
        console.warn("Transaction activity log notice:", logErr?.message || logErr);
      });
    })
    .catch(() => {});

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

  const encryptedName = await encryptCatalogField(cleanName);
  const encryptedDescription = await encryptCatalogField(description.trim());
  const encryptedOfficeName = await encryptCatalogField(officeName.trim());
  const encryptedOfficeSchedule = await encryptCatalogField(officeSchedule.trim());

  await updateDoc(transactionRef, {
    serviceId: cleanServiceId,
    name: encryptedName,
    description: encryptedDescription,
    officeName: encryptedOfficeName,
    officeSchedule: encryptedOfficeSchedule,
    updatedAt: serverTimestamp()
  });

  // Non-blocking background activity log
  getServiceName(cleanServiceId)
    .then((serviceName) => {
      addActivityLog({
        type: "transaction",
        action: "updated",
        title: cleanName,
        description: "Transaction information updated",
        parentName: serviceName,
        parentId: cleanServiceId,
        recordId: transactionId
      }).catch((logErr) => {
        console.warn("Transaction activity log notice:", logErr?.message || logErr);
      });
    })
    .catch(() => {});
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

  const rawName =
    transactionData?.name || "Transaction";
  const transactionName = await decryptCatalogField(rawName);

  const serviceId =
    transactionData?.serviceId || "";

  await updateDoc(transactionRef, {
    isActive,
    updatedAt: serverTimestamp()
  });

  // Non-blocking background activity log
  getServiceName(serviceId)
    .then((serviceName) => {
      addActivityLog({
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
      }).catch((logErr) => {
        console.warn("Transaction activity log notice:", logErr?.message || logErr);
      });
    })
    .catch(() => {});
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

  const rawName =
    transactionData?.name || "Transaction";
  const transactionName = await decryptCatalogField(rawName);

  const serviceId =
    transactionData?.serviceId || "";

  await deleteDoc(transactionRef);

  // Non-blocking background activity log
  getServiceName(serviceId)
    .then((serviceName) => {
      addActivityLog({
        type: "transaction",
        action: "deleted",
        title: transactionName,
        description: "Transaction deleted",
        parentName: serviceName,
        parentId: serviceId,
        recordId: transactionId
      }).catch((logErr) => {
        console.warn("Transaction activity log notice:", logErr?.message || logErr);
      });
    })
    .catch(() => {});
}
