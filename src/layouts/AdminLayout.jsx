import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate
} from "react-router-dom";

import { logoutAdmin } from "../features/auth/authService";
import { useAdminProfile } from "../features/profile/AdminProfileContext";

import "./AdminLayout.css";

const OFFICIAL_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

function sanitizeAdminDisplay(val, fallback) {
  if (!val) return fallback;
  const str = String(val).trim();
  if (str.startsWith("enc:v1:")) return fallback;
  return str;
}


/* =========================================================
   SIMPLE SVG ICONS
   No additional package required
   ========================================================= */

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
    </svg>
  );
}


function ServicesIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M4 7h6l2-2h8v14H4V7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function TransactionsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M7 3h7l4 4v14H7V3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M14 3v5h4M10 12h5M10 16h5"
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
        d="M4 9v6h4l8 4V5L8 9H4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      <path
        d="M8 15l1.5 5H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}


function StudentLogsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect
        x="5"
        y="3"
        width="14"
        height="18"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 8h6M9 12h6M9 16h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}


function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="7"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}


/* =========================================================
   ADMIN LAYOUT
   ========================================================= */

function AdminLayout() {

  const navigate = useNavigate();
  const location = useLocation();
  const { profile, initials } = useAdminProfile();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState("");
  const activeAvatarUrl = String(profile?.photoUrl || "").trim();
  const showAvatarPhoto = Boolean(
    activeAvatarUrl && activeAvatarUrl !== failedAvatarUrl
  );

  /* Keep viewport position pristine and scroll to top upon page navigation */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);


  /* =========================================================
     LOGOUT
     ========================================================= */

  const handleLogout = async () => {

    try {

      await logoutAdmin();

      navigate(
        "/login",
        {
          replace: true
        }
      );

    } catch (error) {

      console.error(
        "Failed to log out administrator:",
        error
      );

      alert(
        error.message ||
        "Unable to log out. Please try again."
      );

    }

  };


  return (

    <div className="admin-layout">


      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside className="admin-sidebar">


        {/* BRAND */}

        <div className="admin-sidebar-brand">

          <div className="admin-sidebar-logo">
            <img
              src={OFFICIAL_LOGO_URL}
              alt="E-ReQuest Logo"
              className="admin-sidebar-logo-img"
            />
          </div>


          <div className="admin-sidebar-brand-text">

            <strong>
              E-ReQuest
            </strong>

            <span>
              Admin Portal
            </span>

          </div>

        </div>



        {/* ===================================================
            NAVIGATION
            =================================================== */}

        <nav className="admin-sidebar-navigation">

          {/* DASHBOARD */}

          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? "admin-nav-item active"
                : "admin-nav-item"
            }
          >

            <span className="admin-nav-icon">
              <DashboardIcon />
            </span>

            <span>
              Dashboard
            </span>

          </NavLink>


          {/* SERVICES */}

          <NavLink
            to="/services"
            className={({ isActive }) =>
              isActive
                ? "admin-nav-item active"
                : "admin-nav-item"
            }
          >

            <span className="admin-nav-icon">
              <ServicesIcon />
            </span>

            <span>
              Services
            </span>

          </NavLink>


          {/* TRANSACTIONS */}

          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              isActive
                ? "admin-nav-item active"
                : "admin-nav-item"
            }
          >

            <span className="admin-nav-icon">
              <TransactionsIcon />
            </span>

            <span>
              Transactions
            </span>

          </NavLink>


          {/* ANNOUNCEMENTS */}

          <NavLink
            to="/announcements"
            className={({ isActive }) =>
              isActive
                ? "admin-nav-item active"
                : "admin-nav-item"
            }
          >

            <span className="admin-nav-icon">
              <AnnouncementIcon />
            </span>

            <span>
              Announcements
            </span>

          </NavLink>


          {/* STUDENT ACTIVITY LOGS */}

          <NavLink
            to="/student-logs"
            className={({ isActive }) =>
              isActive
                ? "admin-nav-item active"
                : "admin-nav-item"
            }
          >

            <span className="admin-nav-icon">
              <StudentLogsIcon />
            </span>

            <span>
              Student Activity Logs
            </span>

          </NavLink>


          {/* ADMIN PROFILE */}

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              isActive
                ? "admin-nav-item active"
                : "admin-nav-item"
            }
          >

            <span className="admin-nav-icon">
              <ProfileIcon />
            </span>

            <span>
              Profile
            </span>

          </NavLink>

        </nav>


        {/* ===================================================
            ADMIN ACCOUNT
            =================================================== */}

        <div className="admin-sidebar-bottom">

          <NavLink
            to="/profile"
            className="admin-user-profile-link"
            title="View & manage admin profile"
          >

            <div className="admin-user">

              <div className="admin-user-avatar">
                {showAvatarPhoto ? (
                  <img
                    src={activeAvatarUrl}
                    alt={profile?.name || "Admin User"}
                    className="admin-user-avatar-img"
                    onError={() => setFailedAvatarUrl(activeAvatarUrl)}
                  />
                ) : (
                  initials
                )}
              </div>

              <div className="admin-user-details">

                <strong title={profile?.name || "Admin User"}>
                  {profile?.name || "Admin User"}
                </strong>

                <span
                  className="admin-user-position"
                  title={sanitizeAdminDisplay(profile?.position, "System Administrator")}
                >
                  {sanitizeAdminDisplay(profile?.position, "System Administrator")}
                </span>

                <span
                  className="admin-user-department"
                  title={sanitizeAdminDisplay(profile?.department, "Registrar's Office")}
                >
                  {sanitizeAdminDisplay(profile?.department, "Registrar's Office")}
                </span>

              </div>

            </div>

          </NavLink>

          <button
            type="button"
            className="admin-logout-button"
            onClick={handleLogout}
          >

            <span className="admin-nav-icon">
              <LogoutIcon />
            </span>

            <span>
              Logout
            </span>

          </button>

        </div>


      </aside>



      {/* =====================================================
          STATIONARY WATERMARK SEAL (LOCKED IN POSITION ACROSS ALL ROUTES)
          ===================================================== */}
      <div className="admin-portal-watermark" aria-hidden="true">
        <div className="admin-portal-watermark-seal" />
      </div>



      {/* =====================================================
          PAGE CONTENT
          ===================================================== */}

      <main className="admin-main-content">

        <Outlet />

      </main>


    </div>

  );

}


export default AdminLayout;
