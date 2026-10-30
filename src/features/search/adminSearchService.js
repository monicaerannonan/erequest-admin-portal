import {
  getAllServices
} from "../services/serviceService";

import {
  getAllTransactions
} from "../transactions/services/transactionService";

import {
  getAllRequirements
} from "../transactions/services/requirementService";

import {
  getAllProcedureSteps
} from "../transactions/services/procedureService";

import {
  getAllGuidelines
} from "../transactions/services/guidelineService";

import {
  getAllAnnouncements
} from "../announcements/announcementService";


/* =========================================
   LOAD ALL SEARCHABLE ADMIN DATA
   ========================================= */

export async function getAdminSearchData() {

  const [
    services,
    transactions,
    requirements,
    procedures,
    guidelines,
    announcements
  ] = await Promise.all([

    getAllServices(),

    getAllTransactions(),

    getAllRequirements(),

    getAllProcedureSteps(),

    getAllGuidelines(),

    getAllAnnouncements()

  ]);


  return {
    services,
    transactions,
    requirements,
    procedures,
    guidelines,
    announcements
  };
}


/* =========================================
   NORMALIZE TEXT
   ========================================= */

function normalizeText(value) {

  return String(value || "")
    .toLowerCase()
    .trim();
}


/* =========================================
   CHECK IF TEXT MATCHES SEARCH
   ========================================= */

function matchesSearch(
  query,
  ...values
) {

  const cleanQuery =
    normalizeText(query);


  if (!cleanQuery) {
    return false;
  }


  return values.some(
    (value) =>
      normalizeText(value).includes(
        cleanQuery
      )
  );
}


/* =========================================
   SEARCH ADMIN DATA
   ========================================= */

export function searchAdminData(
  data,
  query
) {

  const cleanQuery =
    normalizeText(query);


  if (!cleanQuery) {
    return [];
  }


  const results = [];


  /* =====================================
     SERVICES
     ===================================== */

  data.services.forEach(
    (service) => {

      if (
        matchesSearch(
          cleanQuery,
          service.name,
          service.description
        )
      ) {

        results.push({
          id: service.id,

          type: "Service",

          title:
            service.name ||
            "Unnamed Service",

          subtitle:
            service.description ||
            "Service",

          route:
            "/services"
        });

      }

    }
  );


  /* =====================================
     TRANSACTIONS
     ===================================== */

  data.transactions.forEach(
    (transaction) => {

      if (
        matchesSearch(
          cleanQuery,
          transaction.name,
          transaction.description,
          transaction.officeName,
          transaction.officeSchedule
        )
      ) {

        results.push({
          id: transaction.id,

          type: "Transaction",

          title:
            transaction.name ||
            "Unnamed Transaction",

          subtitle:
            transaction.officeName ||
            "Transaction / Document",

          transactionId:
            transaction.id,

          route:
            `/transactions/manage/${transaction.id}`
        });

      }

    }
  );


  /* =====================================
     REQUIREMENTS
     ===================================== */

  data.requirements.forEach(
    (requirement) => {

      if (
        matchesSearch(
          cleanQuery,
          requirement.requirementText
        )
      ) {

        const parentTransaction =
          data.transactions.find(
            (transaction) =>
              transaction.id ===
              requirement.transactionId
          );


        results.push({
          id: requirement.id,

          type: "Requirement",

          title:
            requirement.requirementText ||
            "Requirement",

          subtitle:
            parentTransaction?.name
              ? `Under: ${parentTransaction.name}`
              : "Requirement",

          transactionId:
            requirement.transactionId,

          route:
            `/transactions/manage/${requirement.transactionId}`
        });

      }

    }
  );


  /* =====================================
     PROCEDURE STEPS
     ===================================== */

  data.procedures.forEach(
    (procedure) => {

      if (
        matchesSearch(
          cleanQuery,
          procedure.instruction,
          procedure.imageCaption,
          procedure.websiteName,
          procedure.websiteUrl,
          `step ${procedure.stepNumber}`
        )
      ) {

        const parentTransaction =
          data.transactions.find(
            (transaction) =>
              transaction.id ===
              procedure.transactionId
          );


        results.push({
          id: procedure.id,

          type: "Procedure",

          title:
            `Step ${procedure.stepNumber}: ${
              procedure.instruction ||
              "Procedure Step"
            }`,

          subtitle:
            parentTransaction?.name
              ? `Under: ${parentTransaction.name}`
              : "Procedure Step",

          transactionId:
            procedure.transactionId,

          route:
            `/transactions/manage/${procedure.transactionId}`
        });

      }

    }
  );


  /* =====================================
     GUIDELINES
     ===================================== */

  data.guidelines.forEach(
    (guideline) => {

      if (
        matchesSearch(
          cleanQuery,
          guideline.guidelineText
        )
      ) {

        const parentTransaction =
          data.transactions.find(
            (transaction) =>
              transaction.id ===
              guideline.transactionId
          );


        results.push({
          id: guideline.id,

          type: "Guideline",

          title:
            guideline.guidelineText ||
            "Guideline",

          subtitle:
            parentTransaction?.name
              ? `Under: ${parentTransaction.name}`
              : "Guideline",

          transactionId:
            guideline.transactionId,

          route:
            `/transactions/manage/${guideline.transactionId}`
        });

      }

    }
  );


  /* =====================================
     ANNOUNCEMENTS
     ===================================== */

  data.announcements.forEach(
    (announcement) => {

      if (
        matchesSearch(
          cleanQuery,
          announcement.title,
          announcement.message,
          announcement.content
        )
      ) {

        results.push({
          id: announcement.id,

          type: "Announcement",

          title:
            announcement.title ||
            "Announcement",

          subtitle:
            announcement.message ||
            announcement.content ||
            "Announcement",

          route:
            "/announcements"
        });

      }

    }
  );


  /* =====================================
     RETURN RESULTS
     ===================================== */

  return results;
}