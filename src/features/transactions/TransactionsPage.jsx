import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  useLocation,
  useNavigate
} from "react-router-dom";

import {
  getAllTransactions,
  getActiveServices,
  setTransactionActiveStatus,
  deleteTransaction,
  getTransactionChildCounts
} from "./services/transactionService";

import DeleteConfirmationModal from "../../components/DeleteConfirmationModal";

import "./TransactionsPage.css";


function TransactionsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [transactions, setTransactions] =
    useState([]);

  const [services, setServices] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [updatingId, setUpdatingId] =
    useState(null);

  const [deletingId, setDeletingId] =
    useState(null);

  const [transactionToDelete, setTransactionToDelete] =
    useState(null);

  const [isBlocked, setIsBlocked] =
    useState(false);

  const [blockedDetails, setBlockedDetails] =
    useState([]);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState(
      () => location.state?.successMessage || ""
    );

  const [serviceFilter, setServiceFilter] =
    useState("");

  const [searchQuery, setSearchQuery] =
    useState("");


  /* =========================================================
     CLEAR NAVIGATION STATE
     ========================================================= */

  useEffect(() => {
    if (location.state?.successMessage) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);


  /* =========================================================
     LOAD DATA
     ========================================================= */

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        transactionResult,
        serviceResult
      ] = await Promise.allSettled([
        getAllTransactions(),
        getActiveServices()
      ]);

      if (transactionResult.status === "fulfilled") {
        setTransactions(transactionResult.value || []);
      } else {
        console.error(
          "Failed to load transactions:",
          transactionResult.reason
        );
        setErrorMessage(
          transactionResult.reason?.message?.includes("timed out")
            ? "Connection timed out loading transactions. Please check your network connection."
            : "Unable to load transactions. Please try again."
        );
      }

      if (serviceResult.status === "fulfilled") {
        setServices(serviceResult.value || []);
      } else {
        console.error(
          "Failed to load active services for filter:",
          serviceResult.reason
        );
      }

    } catch (error) {
      console.error(
        "Unexpected error in loadData:",
        error
      );

      setErrorMessage(
        "Unable to load transactions. Please try again."
      );

    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    let ignore = false;

    const fetchInitialData = async () => {
      try {
        const [
          transactionResult,
          serviceResult
        ] = await Promise.allSettled([
          getAllTransactions(),
          getActiveServices()
        ]);

        if (!ignore) {
          if (transactionResult.status === "fulfilled") {
            setTransactions(transactionResult.value || []);
          } else {
            console.error(
              "Failed to load transactions:",
              transactionResult.reason
            );
            setErrorMessage(
              transactionResult.reason?.message?.includes("timed out")
                ? "Connection timed out loading transactions. Please check your network connection."
                : "Unable to load transactions. Please try again."
            );
          }

          if (serviceResult.status === "fulfilled") {
            setServices(serviceResult.value || []);
          } else {
            console.error(
              "Failed to load active services for filter:",
              serviceResult.reason
            );
          }
        }

      } catch (error) {
        console.error(
          "Failed to load transactions:",
          error
        );

        if (!ignore) {
          setErrorMessage(
            "Unable to load transactions. Please try again."
          );
        }

      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchInitialData();

    return () => {
      ignore = true;
    };
  }, []);


  /* =========================================================
     NAVIGATION
     ========================================================= */

  const handleAddTransaction = () => {
    navigate("/transactions/add");
  };

  const handleOpenEditManage = (transaction) => {
    navigate(`/transactions/edit/${transaction.id}`);
  };


  /* =========================================================
     SERVICE NAME
     ========================================================= */

  const getServiceName = (
    transactionServiceId
  ) => {
    const service =
      services.find(
        (item) =>
          item.id === transactionServiceId
      );

    return service
      ? service.name
      : transactionServiceId ||
          "Unknown Service";
  };


  /* =========================================================
     ACTIVATE / DEACTIVATE (SMOOTH STATE TOGGLE)
     ========================================================= */

  const handleStatusChange = async (
    transaction
  ) => {
    const newStatus =
      !transaction.isActive;

    try {
      setUpdatingId(
        transaction.id
      );

      setErrorMessage("");
      setSuccessMessage("");

      /* Optimistic local state update for smooth UI feedback */
      setTransactions((prev) =>
        prev.map((item) =>
          item.id === transaction.id
            ? { ...item, isActive: newStatus }
            : item
        )
      );

      await setTransactionActiveStatus(
        transaction.id,
        newStatus
      );

      const statusMsg = newStatus
        ? `${transaction.name} activated successfully.`
        : `${transaction.name} deactivated successfully.`;

      setSuccessMessage(statusMsg);

    } catch (error) {
      console.error(
        "Failed to update transaction status:",
        error
      );

      /* Rollback optimistic update on failure */
      setTransactions((prev) =>
        prev.map((item) =>
          item.id === transaction.id
            ? { ...item, isActive: !newStatus }
            : item
        )
      );

      const errMsg =
        error.message ||
        "Unable to update transaction status.";

      setErrorMessage(errMsg);

    } finally {
      setUpdatingId(null);
    }
  };


  /* =========================================================
     OPEN DELETE CONFIRMATION
     ========================================================= */

  const handleDelete = async (
    transaction
  ) => {
    setErrorMessage("");
    setSuccessMessage("");

    try {
      setUpdatingId(transaction.id);

      const counts =
        await getTransactionChildCounts(
          transaction.id
        );

      if (counts.total > 0) {
        const details = [];

        if (counts.requirements > 0) {
          details.push(
            `${counts.requirements} Requirement(s)`
          );
        }

        if (counts.procedures > 0) {
          details.push(
            `${counts.procedures} Procedure Step(s)`
          );
        }

        if (counts.guidelines > 0) {
          details.push(
            `${counts.guidelines} Guideline(s)`
          );
        }

        setIsBlocked(true);
        setBlockedDetails(details);
      } else {
        setIsBlocked(false);
        setBlockedDetails([]);
      }

      setTransactionToDelete(
        transaction
      );
    } catch (error) {
      console.error(
        "Failed to verify transaction child records:",
        error
      );

      setIsBlocked(false);
      setBlockedDetails([]);
      setTransactionToDelete(
        transaction
      );
    } finally {
      setUpdatingId(null);
    }
  };


  /* =========================================================
     CANCEL DELETE
     ========================================================= */

  const handleCancelDelete = () => {
    if (deletingId) {
      return;
    }

    setTransactionToDelete(null);
    setIsBlocked(false);
    setBlockedDetails([]);
  };


  /* =========================================================
     CONFIRM PERMANENT DELETE
     ========================================================= */

  const handleConfirmDelete = async () => {
    if (!transactionToDelete) {
      return;
    }

    const targetId =
      transactionToDelete.id;
    const targetName =
      transactionToDelete.name;

    try {
      setDeletingId(targetId);

      setErrorMessage("");
      setSuccessMessage("");

      await deleteTransaction(targetId);

      setSuccessMessage(
        `${targetName} deleted successfully.`
      );

      /* Optimistically remove from state */
      setTransactions((prev) => prev.filter((item) => item.id !== targetId));
      setTransactionToDelete(null);

    } catch (error) {
      console.error(
        "Failed to delete transaction:",
        error
      );

      const errMsg =
        error.message ||
        "Unable to delete transaction.";

      setErrorMessage(errMsg);

    } finally {
      setDeletingId(null);
    }
  };


  /* =========================================================
     FILTER (SERVICE + SEARCH QUERY)
     ========================================================= */

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (
        serviceFilter &&
        transaction.serviceId !== serviceFilter
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const clean =
          searchQuery.toLowerCase().trim();
        const service = services.find(
          (s) => s.id === transaction.serviceId
        );
        const serviceName = (
          service?.name || ""
        ).toLowerCase();
        const name = (
          transaction.name || ""
        ).toLowerCase();
        const desc = (
          transaction.description || ""
        ).toLowerCase();
        const office = (
          transaction.officeName || ""
        ).toLowerCase();
        const schedule = (
          transaction.officeSchedule || ""
        ).toLowerCase();

        const match =
          name.includes(clean) ||
          desc.includes(clean) ||
          office.includes(clean) ||
          schedule.includes(clean) ||
          serviceName.includes(clean);

        if (!match) {
          return false;
        }
      }

      return true;
    });
  }, [
    transactions,
    serviceFilter,
    searchQuery,
    services
  ]);


  /* =========================================================
     UI
     ========================================================= */

  return (
    <div className="transactions-page">

      <div className="transactions-container">

        {/* HEADER */}

        <header className="transactions-header">

          <div className="transactions-header-content">

            <div>
              <h1>
                Transactions / Documents
              </h1>

              <p>
                Manage school transactions and
                documents available in E-ReQuest.
              </p>
            </div>


            <div className="transactions-header-actions">

              {/* CONTEXTUAL SEARCH BAR */}
              <div className="transactions-search-bar">
                <input
                  type="text"
                  className="transactions-search-input"
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.target.value)
                  }
                  aria-label="Search transactions"
                />

                {searchQuery && (
                  <button
                    type="button"
                    className="transactions-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}

              </div>


              <button
                type="button"
                className="transaction-primary-button"
                onClick={handleAddTransaction}
              >
                + Add Transaction / Document
              </button>

            </div>

          </div>

        </header>


        {/* MESSAGES */}

        {errorMessage && (
          <div className="transaction-error transaction-page-message">
            {errorMessage}
          </div>
        )}


        {successMessage && (
          <div className="transaction-success transaction-page-message">
            {successMessage}
          </div>
        )}


        {/* TRANSACTION LIST */}

        <section className="transactions-card">

          <div className="transaction-list-heading">

            <div>
              <h2>
                Available Transactions / Documents
              </h2>

              <p>
                Select a transaction to edit its
                information, requirements, procedures,
                and guidelines, or update its status.
              </p>
            </div>


            {/* SERVICE FILTER */}

            <div className="transaction-filter">

              <label htmlFor="serviceFilter">
                Filter by Service
              </label>

              <select
                id="serviceFilter"
                value={serviceFilter}
                onChange={(event) =>
                  setServiceFilter(
                    event.target.value
                  )
                }
              >
                <option value="">
                  All Services
                </option>

                {services.map(
                  (service) => (
                    <option
                      key={service.id}
                      value={service.id}
                    >
                      {service.name}
                    </option>
                  )
                )}
              </select>

            </div>

          </div>


          {loading ? (

            <p className="transactions-state-message">
              Loading transactions...
            </p>

          ) : errorMessage && transactions.length === 0 ? (

            <div className="transactions-state-message" style={{ textAlign: "center", padding: "24px 16px" }}>
              <p style={{ color: "#d32f2f", marginBottom: "16px", fontWeight: "500" }}>
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={loadData}
                style={{
                  padding: "8px 18px",
                  background: "#1976d2",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              >
                Retry Loading
              </button>
            </div>

          ) : filteredTransactions.length === 0 ? (

            <p className="transactions-state-message">
              {searchQuery
                ? `No transactions found matching "${searchQuery}".`
                : "No transactions found."}
            </p>

          ) : (

            <div className="transactions-list">

              {filteredTransactions.map(
                (transaction) => (

                  <article
                    key={transaction.id}
                    className="transaction-item"
                  >

                    {/* TOP */}

                    <div className="transaction-item-top">

                      <div className="transaction-information">

                        <div className="transaction-title-row">
                          <h3 className="transaction-title">
                            {transaction.name}
                          </h3>

                          <span className="transaction-service-badge">
                            {getServiceName(
                              transaction.serviceId
                            )}
                          </span>
                        </div>

                        <p className="transaction-description">
                          {transaction.description ||
                            "No description"}
                        </p>


                        <div className="transaction-meta">

                          <p>
                            <strong>
                              Office:
                            </strong>{" "}

                            {transaction.officeName ||
                              "Not specified"}
                          </p>

                          <p>
                            <strong>
                              Schedule:
                            </strong>{" "}

                            {transaction.officeSchedule ||
                              "Not specified"}
                          </p>

                        </div>

                      </div>


                      {/* STATUS */}

                      <span
                        className={
                          transaction.isActive
                            ? "transaction-status active"
                            : "transaction-status inactive"
                        }
                      >
                        {transaction.isActive
                          ? "Active"
                          : "Inactive"}
                      </span>

                    </div>


                    {/* CARD FOOTER ACTION BUTTONS:
                        1. Edit Info
                        2. Deactivate / Activate
                        3. Delete */}

                    <div className="transaction-item-actions">

                      {/* 1. EDIT INFO (Opens Unified Edit Transaction View) */}

                      <button
                        type="button"
                        className="transaction-edit-button"
                        onClick={() =>
                          handleOpenEditManage(
                            transaction
                          )
                        }
                        disabled={
                          deletingId ===
                          transaction.id
                        }
                      >
                        Edit Info
                      </button>


                      {/* 2. DEACTIVATE / ACTIVATE */}

                      <button
                        type="button"
                        className="transaction-status-button"
                        onClick={() =>
                          handleStatusChange(
                            transaction
                          )
                        }
                        disabled={
                          updatingId ===
                            transaction.id ||
                          deletingId ===
                            transaction.id
                        }
                      >
                        {updatingId ===
                        transaction.id
                          ? "Updating..."
                          : transaction.isActive
                            ? "Deactivate"
                            : "Activate"}
                      </button>


                      {/* 3. DELETE */}

                      <button
                        type="button"
                        className="transaction-delete-button"
                        onClick={() =>
                          handleDelete(
                            transaction
                          )
                        }
                        disabled={
                          deletingId ===
                            transaction.id ||
                          updatingId ===
                            transaction.id
                        }
                      >
                        {deletingId ===
                        transaction.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>

                    </div>

                  </article>

                )
              )}

            </div>

          )}

        </section>

      </div>


      {/* =====================================================
          DELETE CONFIRMATION MODAL
          ===================================================== */}

      <DeleteConfirmationModal
        isOpen={
          transactionToDelete !== null
        }
        itemType="Transaction"
        itemName={
          transactionToDelete?.name || ""
        }
        deleting={
          deletingId !== null
        }
        isBlocked={isBlocked}
        blockedDetails={blockedDetails}
        recommendation="Please remove these records first, or use Deactivate instead."
        onCancel={
          handleCancelDelete
        }
        onConfirm={
          handleConfirmDelete
        }
      />

    </div>
  );
}

export default TransactionsPage;
