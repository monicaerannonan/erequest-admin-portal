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
  buildProcedureStepId,
  createDocumentIfAbsent
} from "../../../utils/idUtils";
import {
  encryptCatalogField,
  decryptCatalogField
} from "../../../utils/vaultCrypto.js";

const PROCEDURES_COLLECTION = "procedure_steps";
const TRANSACTIONS_COLLECTION = "transactions";


/* =========================================
   GET ALL PROCEDURE STEPS
   ========================================= */

export async function getAllProcedureSteps() {
  const snapshot = await getDocs(
    collection(db, PROCEDURES_COLLECTION)
  );

  const procedures = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        instruction: await decryptCatalogField(data.instruction),
        imageCaption: await decryptCatalogField(data.imageCaption),
        websiteName: await decryptCatalogField(data.websiteName)
      };
    })
  );

  procedures.sort((a, b) => {
    const transactionCompare =
      (a.transactionId || "").localeCompare(
        b.transactionId || ""
      );

    if (transactionCompare !== 0) {
      return transactionCompare;
    }

    return (a.stepNumber || 0) - (b.stepNumber || 0);
  });

  return procedures;
}


/* =========================================
   GET PROCEDURE STEPS BY TRANSACTION ID
   ========================================= */

export async function getProcedureStepsByTransactionId(transactionId) {
  if (!transactionId) {
    return [];
  }

  const q = query(
    collection(db, PROCEDURES_COLLECTION),
    where("transactionId", "==", transactionId)
  );

  const snapshot = await getDocs(q);

  const procedures = await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        instruction: await decryptCatalogField(data.instruction),
        imageCaption: await decryptCatalogField(data.imageCaption),
        websiteName: await decryptCatalogField(data.websiteName)
      };
    })
  );

  procedures.sort((a, b) => (a.stepNumber || 0) - (b.stepNumber || 0));

  return procedures;
}


/* =========================================
   GET TRANSACTION NAME
   Used for Recent Updates
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
   ADD PROCEDURE STEP
   ========================================= */

export async function addProcedureStep(
  transactionId,
  stepNumber,
  instruction,
  imageCaption = "",
  remoteImageUrl = "",
  localImagePath = "",
  websiteName = "",
  websiteUrl = ""
) {
  const cleanTransactionId = transactionId.trim();
  const cleanInstruction = instruction.trim();
  const cleanImageCaption = imageCaption.trim();
  const cleanRemoteImageUrl = remoteImageUrl.trim();
  const cleanLocalImagePath = localImagePath.trim();
  const cleanWebsiteName = websiteName.trim();
  const cleanWebsiteUrl = cleanWebsiteUrlValue(websiteUrl);
  const cleanStepNumber = Number(stepNumber);

  if (!cleanTransactionId) {
    throw new Error(
      "Transaction ID is required."
    );
  }

  if (
    !Number.isInteger(cleanStepNumber) ||
    cleanStepNumber < 1
  ) {
    throw new Error(
      "Step number must be greater than 0."
    );
  }

  if (!cleanInstruction) {
    throw new Error(
      "Procedure instruction is required."
    );
  }

  if (cleanWebsiteUrl && !cleanWebsiteName) {
    throw new Error(
      "Please enter a link name for the website."
    );
  }

  if (cleanWebsiteName && !cleanWebsiteUrl) {
    throw new Error(
      "Please enter the website URL."
    );
  }

  const procedureId = buildProcedureStepId(
    cleanTransactionId,
    cleanStepNumber
  );

  const encryptedInstruction = await encryptCatalogField(cleanInstruction);
  const encryptedImageCaption = await encryptCatalogField(cleanImageCaption);
  const encryptedWebsiteName = await encryptCatalogField(cleanWebsiteName);

  await createDocumentIfAbsent(
    db,
    PROCEDURES_COLLECTION,
    procedureId,
    {
      transactionId: cleanTransactionId,
      stepNumber: cleanStepNumber,
      instruction: encryptedInstruction,
      remoteImageUrl: cleanRemoteImageUrl,
      localImagePath: cleanLocalImagePath,
      imageCaption: encryptedImageCaption,
      websiteName: encryptedWebsiteName,
      websiteUrl: cleanWebsiteUrl,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    `Step number ${cleanStepNumber} already exists for this transaction.`
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  (async () => {
    try {
      const transactionName =
        await getTransactionName(cleanTransactionId);
      await addActivityLog({
        type: "procedure",
        action: "added",
        title: `Step ${cleanStepNumber}: ${cleanInstruction}`,
        description: "New procedure step added",
        parentName: transactionName,
        parentId: cleanTransactionId,
        recordId: procedureId
      });
    } catch (logErr) {
      console.warn("Procedure activity log notice:", logErr?.message || logErr);
    }
  })();

  return procedureId;
}


/* =========================================
   UPDATE PROCEDURE STEP
   ========================================= */

export async function updateProcedureStep(
  procedureId,
  transactionId,
  stepNumber,
  instruction,
  imageCaption = "",
  remoteImageUrl = "",
  localImagePath = "",
  websiteName = "",
  websiteUrl = ""
) {
  const cleanTransactionId = transactionId.trim();
  const cleanInstruction = instruction.trim();
  const cleanImageCaption = imageCaption.trim();
  const cleanRemoteImageUrl = remoteImageUrl.trim();
  const cleanLocalImagePath = localImagePath.trim();
  const cleanWebsiteName = websiteName.trim();
  const cleanWebsiteUrl = cleanWebsiteUrlValue(websiteUrl);
  const cleanStepNumber = Number(stepNumber);

  if (!procedureId) {
    throw new Error(
      "Procedure ID is required."
    );
  }

  if (!cleanTransactionId) {
    throw new Error(
      "Transaction ID is required."
    );
  }

  if (
    !Number.isInteger(cleanStepNumber) ||
    cleanStepNumber < 1
  ) {
    throw new Error(
      "Step number must be greater than 0."
    );
  }

  if (!cleanInstruction) {
    throw new Error(
      "Procedure instruction is required."
    );
  }

  if (cleanWebsiteUrl && !cleanWebsiteName) {
    throw new Error(
      "Please enter a link name for the website."
    );
  }

  if (cleanWebsiteName && !cleanWebsiteUrl) {
    throw new Error(
      "Please enter the website URL."
    );
  }

  const procedureRef = doc(
    db,
    PROCEDURES_COLLECTION,
    procedureId
  );

  const encryptedInstruction = await encryptCatalogField(cleanInstruction);
  const encryptedImageCaption = await encryptCatalogField(cleanImageCaption);
  const encryptedWebsiteName = await encryptCatalogField(cleanWebsiteName);

  await updateDoc(procedureRef, {
    transactionId: cleanTransactionId,
    stepNumber: cleanStepNumber,
    instruction: encryptedInstruction,
    remoteImageUrl: cleanRemoteImageUrl,
    localImagePath: cleanLocalImagePath,
    imageCaption: encryptedImageCaption,
    websiteName: encryptedWebsiteName,
    websiteUrl: cleanWebsiteUrl,
    updatedAt: serverTimestamp()
  });

  /* ACTIVITY LOG (NON-BLOCKING) */
  (async () => {
    try {
      const transactionName =
        await getTransactionName(cleanTransactionId);
      await addActivityLog({
        type: "procedure",
        action: "updated",
        title: `Step ${cleanStepNumber}: ${cleanInstruction}`,
        description: "Procedure step updated",
        parentName: transactionName,
        parentId: cleanTransactionId,
        recordId: procedureId
      });
    } catch (logErr) {
      console.warn("Procedure activity log notice:", logErr?.message || logErr);
    }
  })();
}


/* =========================================
   ACTIVATE / DEACTIVATE PROCEDURE STEP
   ========================================= */

export async function setProcedureStepActiveStatus(
  procedureId,
  isActive
) {
  if (!procedureId) {
    throw new Error(
      "Procedure ID is required."
    );
  }

  const procedureRef = doc(
    db,
    PROCEDURES_COLLECTION,
    procedureId
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  const logPromise = (async () => {
    try {
      const procedureSnap = await getDoc(procedureRef);
      const procedureData = procedureSnap.exists()
        ? procedureSnap.data()
        : null;
      const rawInstruction =
        procedureData?.instruction || "Procedure Step";
      const instruction = await decryptCatalogField(rawInstruction);
      const stepNumber =
        procedureData?.stepNumber || "";
      const transactionId =
        procedureData?.transactionId || "";
      const transactionName =
        await getTransactionName(transactionId);

      await addActivityLog({
        type: "procedure",
        action: isActive ? "activated" : "deactivated",
        title: stepNumber
          ? `Step ${stepNumber}: ${instruction}`
          : instruction,
        description: isActive
          ? "Procedure step activated"
          : "Procedure step deactivated",
        parentName: transactionName,
        parentId: transactionId,
        recordId: procedureId
      });
    } catch (logErr) {
      console.warn("Procedure activity log notice:", logErr?.message || logErr);
    }
  })();

  await updateDoc(procedureRef, {
    isActive,
    updatedAt: serverTimestamp()
  });

  logPromise.catch(() => {});
}


/* =========================================
   DELETE PROCEDURE STEP
   ========================================= */

export async function deleteProcedureStep(
  procedureId
) {
  if (!procedureId) {
    throw new Error(
      "Procedure ID is required."
    );
  }

  const procedureRef = doc(
    db,
    PROCEDURES_COLLECTION,
    procedureId
  );

  /* ACTIVITY LOG (NON-BLOCKING) */
  const logPromise = (async () => {
    try {
      const procedureSnap = await getDoc(procedureRef);
      const procedureData = procedureSnap.exists()
        ? procedureSnap.data()
        : null;
      const rawInstruction =
        procedureData?.instruction || "Procedure Step";
      const instruction = await decryptCatalogField(rawInstruction);
      const stepNumber =
        procedureData?.stepNumber || "";
      const transactionId =
        procedureData?.transactionId || "";
      const transactionName =
        await getTransactionName(transactionId);

      await addActivityLog({
        type: "procedure",
        action: "deleted",
        title: stepNumber
          ? `Step ${stepNumber}: ${instruction}`
          : instruction,
        description: "Procedure step deleted",
        parentName: transactionName,
        parentId: transactionId,
        recordId: procedureId
      });
    } catch (logErr) {
      console.warn("Procedure activity log notice:", logErr?.message || logErr);
    }
  })();

  await deleteDoc(procedureRef);
  logPromise.catch(() => {});
}


/* =========================================
   OPTIONAL WEBSITE URL VALIDATION
   ========================================= */

function cleanWebsiteUrlValue(
  websiteUrl = ""
) {
  const cleanUrl = websiteUrl.trim();

  if (!cleanUrl) {
    return "";
  }

  if (
    !cleanUrl.startsWith("https://") &&
    !cleanUrl.startsWith("http://")
  ) {
    throw new Error(
      "Website URL must start with http:// or https://"
    );
  }

  return cleanUrl;
}
