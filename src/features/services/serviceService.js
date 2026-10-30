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

import {
  db
} from "../../firebase/firebaseConfig";

import {
  addActivityLog
} from "../dashboard/activityLogService";

import {
  buildServiceId,
  createDocumentIfAbsent
} from "../../utils/idUtils";
import { withTimeout } from "../../utils/asyncUtils";


const SERVICES_COLLECTION =
  "services";

/* =========================================================
   GET ALL SERVICES
   ========================================================= */

export async function getAllServices() {

  const servicesRef =
    collection(
      db,
      SERVICES_COLLECTION
    );


  const snapshot =
    await withTimeout(
      getDocs(servicesRef),
      10000,
      "Fetching services"
    );


  const services =
    snapshot.docs.map(
      (document) => ({

        id:
          document.id,

        ...document.data()

      })
    );


  services.sort(
    (a, b) =>
      String(a?.name ?? "").localeCompare(
        String(b?.name ?? "")
      )
  );


  return services;

}


/* =========================================================
   GET SERVICE BY ID
   ========================================================= */

export async function getServiceById(serviceId) {
  if (!serviceId) {
    return null;
  }

  const serviceRef = doc(
    db,
    SERVICES_COLLECTION,
    serviceId
  );

  const snapshot = await getDoc(serviceRef);

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}


/* =========================================================
   ADD NEW SERVICE
   ========================================================= */

export async function addService(
  name,
  description
) {

  const cleanName =
    name.trim();

  const cleanDescription =
    description.trim();


  if (!cleanName) {

    throw new Error(
      "Service name is required."
    );

  }


  const serviceId =
    buildServiceId(cleanName);


  await createDocumentIfAbsent(
    db,
    SERVICES_COLLECTION,
    serviceId,
    {

      name:
        cleanName,

      description:
        cleanDescription,

      isActive:
        true,

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()

    },
    `A service with the name "${cleanName}" already exists.`
  );


  /* =======================================================
     ACTIVITY LOG (NON-BLOCKING)
     ======================================================= */

  try {
    await addActivityLog({
      type: "service",
      action: "added",
      title: cleanName,
      description: "New service added",
      recordId: serviceId
    });
  } catch (logErr) {
    console.warn("Service activity log notice:", logErr?.message || logErr);
  }


  return serviceId;

}


/* =========================================================
   UPDATE EXISTING SERVICE
   ========================================================= */

export async function updateService(
  serviceId,
  name,
  description
) {

  const cleanName =
    name.trim();

  const cleanDescription =
    description.trim();


  if (!serviceId) {

    throw new Error(
      "Service ID is required."
    );

  }


  if (!cleanName) {

    throw new Error(
      "Service name is required."
    );

  }


  const serviceRef =
    doc(
      db,
      SERVICES_COLLECTION,
      serviceId
    );


  await updateDoc(
    serviceRef,
    {

      name:
        cleanName,

      description:
        cleanDescription,

      updatedAt:
        serverTimestamp()

    }
  );


  /* =======================================================
     ACTIVITY LOG (NON-BLOCKING)
     ======================================================= */

  try {
    await addActivityLog({
      type: "service",
      action: "updated",
      title: cleanName,
      description: "Service information updated",
      recordId: serviceId
    });
  } catch (logErr) {
    console.warn("Service activity log notice:", logErr?.message || logErr);
  }

}


/* =========================================================
   ACTIVATE / DEACTIVATE SERVICE
   ========================================================= */

export async function setServiceActiveStatus(
  serviceId,
  isActive
) {

  if (!serviceId) {

    throw new Error(
      "Service ID is required."
    );

  }


  const serviceRef =
    doc(
      db,
      SERVICES_COLLECTION,
      serviceId
    );


  /*
   * Get the service first so we can save
   * its actual name in the activity log.
   */

  const serviceSnap =
    await getDoc(
      serviceRef
    );


  const serviceName =
    (serviceSnap.exists() && serviceSnap.data()?.name) ||
    "Service";


  await updateDoc(
    serviceRef,
    {

      isActive:
        isActive,

      updatedAt:
        serverTimestamp()

    }
  );


  /* =======================================================
     ACTIVITY LOG (NON-BLOCKING)
     ======================================================= */

  try {
    await addActivityLog({
      type: "service",
      action: isActive ? "activated" : "deactivated",
      title: serviceName,
      description: isActive ? "Service activated" : "Service deactivated",
      recordId: serviceId
    });
  } catch (logErr) {
    console.warn("Service activity log notice:", logErr?.message || logErr);
  }

}


/* =========================================================
   GET SERVICE TRANSACTION COUNT
   Used to prevent orphaned records on service deletion
   ========================================================= */

export async function getServiceTransactionCount(
  serviceId
) {

  if (!serviceId) {
    return 0;
  }

  const transactionsQuery =
    query(
      collection(
        db,
        "transactions"
      ),
      where(
        "serviceId",
        "==",
        serviceId
      )
    );

  const snapshot =
    await getDocs(
      transactionsQuery
    );

  return snapshot.size;

}


/* =========================================================
   DELETE SERVICE
   ========================================================= */

export async function deleteService(
  serviceId
) {

  if (!serviceId) {

    throw new Error(
      "Service ID is required."
    );

  }

  /*
   * Check if child transactions exist.
   * Prevent deletion to avoid orphaned records.
   */
  const transactionCount =
    await getServiceTransactionCount(
      serviceId
    );

  if (transactionCount > 0) {
    throw new Error(
      `Cannot delete this service because it contains ${transactionCount} transaction(s). Please delete or reassign those transactions first, or deactivate this service instead.`
    );
  }


  /*
   * Get the service before deleting it.
   * After deletion, we would no longer
   * be able to retrieve its name.
   */

  const serviceRef =
    doc(
      db,
      SERVICES_COLLECTION,
      serviceId
    );


  const serviceSnap =
    await getDoc(
      serviceRef
    );


  const serviceName =
    (serviceSnap.exists() && serviceSnap.data()?.name) ||
    "Service";


  await deleteDoc(
    serviceRef
  );


  /* =======================================================
     ACTIVITY LOG (NON-BLOCKING)
     ======================================================= */

  try {
    await addActivityLog({
      type: "service",
      action: "deleted",
      title: serviceName,
      description: "Service deleted",
      recordId: serviceId
    });
  } catch (logErr) {
    console.warn("Service activity log notice:", logErr?.message || logErr);
  }

}
