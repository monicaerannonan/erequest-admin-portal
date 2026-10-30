import { useEffect, useState } from "react";

import {
  subscribeToRecentActivityLogs,
  formatActivityDateTime
} from "./activityLogService";

import { getAllServices } from "../services/serviceService";
import { getAllTransactions } from "../transactions/services/transactionService";
import { getAllAnnouncements } from "../announcements/announcementService";
import AdminSearch from "../search/AdminSearch";

import "./DashboardPage.css";


/* =========================================================
   ICONS
   ========================================================= */

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M3.5 7.5h6l2-2h9v13h-17v-11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M6 3.5h8l4 4V20H6V3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.5v4h4M9 12h6M9 16h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AnnouncementIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M4 13V9h4l8-4v12l-8-4H4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 13l1.5 5H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 7.5V12l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}


/* =========================================================
   ACTIVITY HELPERS
   ========================================================= */

function formatWord(value = "") {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getActivityHeading(activity) {
  return `${formatWord(activity.type || "Record")} ${formatWord(
    activity.action || "Updated"
  )}`;
}

function getActivityClass(type) {
  switch (type) {
    case "service":
      return "activity-blue";

    case "transaction":
      return "activity-blue";

    case "requirement":
      return "activity-green";

    case "procedure":
      return "activity-purple";

    case "guideline":
      return "activity-purple";

    case "announcement":
      return "activity-orange";

    default:
      return "activity-blue";
  }
}

function ActivityIcon({ type }) {
  if (type === "announcement") {
    return <AnnouncementIcon />;
  }

  if (
    type === "transaction" ||
    type === "requirement" ||
    type === "procedure" ||
    type === "guideline"
  ) {
    return <DocumentIcon />;
  }

  return <FolderIcon />;
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function DashboardPage() {
  const [serviceCount, setServiceCount] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);

  const [recentActivities, setRecentActivities] = useState([]);

  const [loading, setLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);

  const [errorMessage, setErrorMessage] = useState("");


  /* =========================================================
     LOAD DASHBOARD DATA & REAL-TIME ACTIVITY LISTENER
     ========================================================= */

  useEffect(() => {
    let ignore = false;

    async function fetchDashboardData() {
      try {
        const [services, transactions, announcements] = await Promise.all([
          getAllServices(),
          getAllTransactions(),
          getAllAnnouncements()
        ]);

        if (!ignore) {
          setServiceCount(
            services.filter((item) => item.isActive === true).length
          );

          setTransactionCount(
            transactions.filter((item) => item.isActive === true).length
          );

          setAnnouncementCount(
            announcements.filter((item) => item.isActive === true).length
          );
        }
      } catch (error) {
        console.error("Dashboard error:", error);
        if (!ignore) {
          setErrorMessage("Unable to load dashboard information.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchDashboardData();

    // Subscribe to real-time activity logs with onSnapshot
    const unsubscribe = subscribeToRecentActivityLogs((activities) => {
        if (!ignore) {
          setRecentActivities(activities);
          setRecentLoading(false);
        }
      },
      (error) => {
        console.error("Recent updates subscription error:", error);
        if (!ignore) {
          setRecentLoading(false);
        }
      },
      5
    );

    return () => {
      ignore = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);


  /* =========================================================
     UI
     ========================================================= */

  return (
    <div className="dashboard-page">

      {/* HEADER */}
      <header className="dashboard-header">
        <div className="dashboard-header-text">
          <h1>Dashboard</h1>

          <p>
            Welcome to the E-ReQuest Administrator Portal.
          </p>
        </div>

        <div className="dashboard-header-search">
          <AdminSearch />
        </div>
      </header>


      {/* SUMMARY */}
      <section className="dashboard-summary">

        <div className="summary-card summary-card-services">
          <div>
            <span className="summary-title">Services</span>

            <strong className="summary-number">
              {loading ? "..." : serviceCount}
            </strong>

            <span className="summary-description">
              Active services
            </span>
          </div>

          <div className="summary-icon summary-icon-blue">
            <FolderIcon />
          </div>
        </div>


        <div className="summary-card summary-card-transactions">
          <div>
            <span className="summary-title">
              Transactions / Documents
            </span>

            <strong className="summary-number">
              {loading ? "..." : transactionCount}
            </strong>

            <span className="summary-description">
              Active transactions
            </span>
          </div>

          <div className="summary-icon summary-icon-green">
            <DocumentIcon />
          </div>
        </div>


        <div className="summary-card summary-card-announcements">
          <div>
            <span className="summary-title">
              Announcements
            </span>

            <strong className="summary-number">
              {loading ? "..." : announcementCount}
            </strong>

            <span className="summary-description">
              Active announcements
            </span>
          </div>

          <div className="summary-icon summary-icon-orange">
            <AnnouncementIcon />
          </div>
        </div>

      </section>


      {errorMessage && (
        <div className="dashboard-error-message">
          {errorMessage}
        </div>
      )}


      {/* =====================================================
          RECENT UPDATES
          ===================================================== */}

      <section className="recent-updates-card">

        <div className="recent-updates-header">

          <div className="recent-updates-title">
            <div className="recent-clock-icon">
              <ClockIcon />
            </div>

            <h2>Recent Updates</h2>
          </div>

          <span className="recent-updates-count">
            Latest 5
          </span>

        </div>


        {/* LOADING */}

        {recentLoading && (
          <div className="recent-updates-message">
            Loading recent updates...
          </div>
        )}


        {/* EMPTY */}

        {!recentLoading && recentActivities.length === 0 && (
          <div className="recent-updates-empty">
            <div className="recent-empty-icon">
              <ClockIcon />
            </div>

            <strong>No recent updates</strong>

            <span>
              Administrator activities will appear here.
            </span>
          </div>
        )}


        {/* LIST */}

        {!recentLoading && recentActivities.length > 0 && (
          <div className="recent-updates-list">

            {recentActivities.map((activity) => (
              <div
                className="recent-update-row"
                key={activity.id}
              >

                <div
                  className={`recent-update-icon ${getActivityClass(
                    activity.type
                  )}`}
                >
                  <ActivityIcon type={activity.type} />
                </div>


                <div className="recent-update-details">

                  <strong className="recent-update-heading">
                    {getActivityHeading(activity)}
                  </strong>


                  <span className="recent-update-description">

                    {activity.title || "Updated record"}

                    {(activity.description || activity.details)
                      ? ` — ${activity.description || activity.details}`
                      : ""}

                  </span>


                  {activity.adminEmail && (
                    <span className="recent-update-parent">
                      Admin: {activity.adminEmail}
                      {activity.parentName ? ` • ${activity.parentName}` : ""}
                    </span>
                  )}

                  {!activity.adminEmail && activity.parentName && (
                    <span className="recent-update-parent">
                      {activity.parentName}
                    </span>
                  )}

                </div>


                <div className="recent-update-date">
                  {formatActivityDateTime(
                    activity.createdAt || activity.timestamp
                  ) || "Just now"}
                </div>

              </div>
            ))}

          </div>
        )}

      </section>

    </div>
  );
}

export default DashboardPage;
