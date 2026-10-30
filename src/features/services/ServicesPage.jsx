import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  getAllServices,
  setServiceActiveStatus,
  deleteService,
  getServiceTransactionCount
} from "./serviceService";

import DeleteConfirmationModal from "../../components/DeleteConfirmationModal";

import "./ServicesPage.css";


function ServicesPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState(
    () => location.state?.successMessage || ""
  );

  const [searchQuery, setSearchQuery] = useState("");

  /* DELETE MODAL */
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedDetails, setBlockedDetails] = useState([]);

  /* CLEAR NAVIGATION STATE */
  useEffect(() => {
    if (location.state?.successMessage) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  /* FILTERED SERVICES BY SEARCH */
  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) {
      return services;
    }
    const clean = searchQuery.toLowerCase().trim();
    return services.filter((service) => {
      const matchName = (service.name || "").toLowerCase().includes(clean);
      const matchDesc = (service.description || "").toLowerCase().includes(clean);
      return matchName || matchDesc;
    });
  }, [services, searchQuery]);


  /* =========================================================
     LOAD SERVICES
     ========================================================= */

  const loadServices = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await getAllServices();

      setServices(data || []);

    } catch (error) {
      console.error(
        "Failed to load services:",
        error
      );

      setErrorMessage(
        error.message?.includes("timed out")
          ? "Connection timed out loading services. Please check your network connection."
          : "Unable to load services. Please try again."
      );

    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    let ignore = false;

    const fetchInitialData = async () => {
      try {
        const data = await getAllServices();

        if (!ignore) {
          setServices(data || []);
        }

      } catch (error) {
        console.error(
          "Failed to load services:",
          error
        );

        if (!ignore) {
          setErrorMessage(
            error.message?.includes("timed out")
              ? "Connection timed out loading services. Please check your network connection."
              : "Unable to load services. Please try again."
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
     EDIT SERVICE (NAVIGATES TO DEDICATED EDIT PAGE)
     ========================================================= */

  const handleEdit = (service) => {
    navigate(`/services/edit/${service.id}`, {
      state: { service }
    });
  };


  /* =========================================================
     ACTIVATE / DEACTIVATE
     ========================================================= */

  const handleStatusChange = async (service) => {
    const newStatus = !service.isActive;

    try {
      setErrorMessage("");
      setSuccessMessage("");

      /* Optimistic UI update */
      setServices((prev) =>
        prev.map((item) =>
          item.id === service.id ? { ...item, isActive: newStatus } : item
        )
      );

      await setServiceActiveStatus(
        service.id,
        newStatus
      );

      setSuccessMessage(
        newStatus
          ? "Service activated successfully."
          : "Service deactivated successfully."
      );

    } catch (error) {
      console.error(
        "Failed to update service status:",
        error
      );

      /* Revert optimistic update */
      setServices((prev) =>
        prev.map((item) =>
          item.id === service.id ? { ...item, isActive: !newStatus } : item
        )
      );

      setErrorMessage(
        error.message ||
        "Unable to update service status."
      );
    }
  };


  /* =========================================================
     OPEN DELETE CONFIRMATION
     ========================================================= */

  const handleDelete = async (service) => {
    setErrorMessage("");
    setSuccessMessage("");

    try {
      setDeleting(true);

      const transactionCount =
        await getServiceTransactionCount(service.id);

      if (transactionCount > 0) {
        setIsBlocked(true);
        setBlockedDetails([
          `${transactionCount} Transaction(s) belong to this service.`
        ]);
      } else {
        setIsBlocked(false);
        setBlockedDetails([]);
      }

      setServiceToDelete(service);
    } catch (error) {
      console.error(
        "Failed to verify service transactions:",
        error
      );

      setIsBlocked(false);
      setBlockedDetails([]);
      setServiceToDelete(service);
    } finally {
      setDeleting(false);
    }
  };


  /* =========================================================
     CANCEL DELETE
     ========================================================= */

  const handleCancelDelete = () => {
    if (deleting) {
      return;
    }

    setServiceToDelete(null);
    setIsBlocked(false);
    setBlockedDetails([]);
  };


  /* =========================================================
     CONFIRM PERMANENT DELETE
     ========================================================= */

  const handleConfirmDelete = async () => {
    if (!serviceToDelete) {
      return;
    }

    const deletedId = serviceToDelete.id;

    try {
      setDeleting(true);

      setErrorMessage("");
      setSuccessMessage("");

      await deleteService(
        deletedId
      );

      setSuccessMessage(
        "Service deleted successfully."
      );

      /* Optimistic deletion update */
      setServices((prev) => prev.filter((item) => item.id !== deletedId));
      setServiceToDelete(null);

    } catch (error) {
      console.error(
        "Failed to delete service:",
        error
      );

      setErrorMessage(
        error.message ||
        "Unable to delete service."
      );

    } finally {
      setDeleting(false);
    }
  };


  /* =========================================================
     UI
     ========================================================= */

  return (
    <div className="services-page">

      <div className="services-container">

        {/* ===================================================
            HEADER
            =================================================== */}

        <header className="services-header">

          <div className="services-header-content">

            <div>
              <h1>
                Services
              </h1>

              <p>
                Manage school departments and service
                categories available in E-ReQuest.
              </p>
            </div>

            <div className="services-header-actions">

              {/* CONTEXTUAL SEARCH BAR */}
              <div className="services-search-bar">
                <input
                  type="text"
                  className="services-search-input"
                  placeholder="Search services..."
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.target.value)
                  }
                  aria-label="Search services"
                />

                {searchQuery && (
                  <button
                    type="button"
                    className="services-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}

              </div>


              {/* ADD SERVICE BUTTON */}
              <button
                type="button"
                className="service-primary-button"
                onClick={() => navigate("/services/add")}
              >
                + Add Service
              </button>

            </div>

          </div>

        </header>


        {/* MESSAGES */}

        {errorMessage && (
          <div className="service-error" style={{ marginBottom: "20px" }}>
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="service-success" style={{ marginBottom: "20px" }}>
            {successMessage}
          </div>
        )}


        {/* ===================================================
            EXISTING SERVICES
            =================================================== */}

        <section className="services-card">

          <h2>
            Existing Services
          </h2>


          {loading ? (

            <p className="services-state-message">
              Loading services...
            </p>

          ) : errorMessage && services.length === 0 ? (

            <div className="services-state-message" style={{ textAlign: "center", padding: "24px 16px" }}>
              <p style={{ color: "#d32f2f", marginBottom: "16px", fontWeight: "500" }}>
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={loadServices}
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

          ) : filteredServices.length === 0 ? (

            <p className="services-state-message">
              {searchQuery
                ? `No services found matching "${searchQuery}".`
                : "No services found."}
            </p>

          ) : (

            <div className="services-list">

              {filteredServices.map((service) => (

                <article
                  key={service.id}
                  className="service-item"
                >

                  {/* SERVICE INFORMATION */}

                  <div className="service-item-top">

                    <div>

                      <h3>
                        {service.name}
                      </h3>

                      <p className="service-description">
                        {service.description ||
                          "No description"}
                      </p>

                    </div>


                    {/* STATUS */}

                    <span
                      className={
                        service.isActive
                          ? "service-status active"
                          : "service-status inactive"
                      }
                    >
                      {service.isActive
                        ? "Active"
                        : "Inactive"}
                    </span>

                  </div>


                  {/* ACTION BUTTONS */}

                  <div className="service-item-actions">

                    {/* EDIT */}

                    <button
                      type="button"
                      className="service-edit-button"
                      onClick={() =>
                        handleEdit(service)
                      }
                    >
                      Edit
                    </button>


                    {/* ACTIVATE / DEACTIVATE */}

                    <button
                      type="button"
                      className="service-status-button"
                      onClick={() =>
                        handleStatusChange(
                          service
                        )
                      }
                    >
                      {service.isActive
                        ? "Deactivate"
                        : "Activate"}
                    </button>


                    {/* DELETE */}

                    <button
                      type="button"
                      className="service-delete-button"
                      onClick={() =>
                        handleDelete(service)
                      }
                    >
                      Delete
                    </button>

                  </div>

                </article>

              ))}

            </div>

          )}

        </section>

      </div>


      {/* =====================================================
          DELETE CONFIRMATION MODAL
          ===================================================== */}

      <DeleteConfirmationModal
        isOpen={serviceToDelete !== null}
        itemType="Service"
        itemName={serviceToDelete?.name || ""}
        deleting={deleting}
        isBlocked={isBlocked}
        blockedDetails={blockedDetails}
        recommendation="Please delete or reassign those Transactions first, or use Deactivate instead."
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

    </div>
  );
}


export default ServicesPage;
