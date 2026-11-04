import {
  Suspense,
  useEffect
} from "react";

import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation
} from "react-router-dom";

import ProtectedRoute
  from "./features/auth/ProtectedRoute";

import AdminLayout
  from "./layouts/AdminLayout";

import LoginPage
  from "./features/auth/LoginPage";

import DashboardPage
  from "./features/dashboard/DashboardPage";

import ServicesPage
  from "./features/services/ServicesPage";

import AddServicePage
  from "./features/services/AddServicePage";

import TransactionsPage
  from "./features/transactions/TransactionsPage";

import AddTransactionPage
  from "./features/transactions/AddTransactionPage";

import AnnouncementsPage
  from "./features/announcements/AnnouncementsPage";

import AddAnnouncementPage
  from "./features/announcements/AddAnnouncementPage";

import AdminProfilePage
  from "./features/profile/AdminProfilePage";

import StudentActivityLogsPage
  from "./features/studentLogs/StudentActivityLogsPage";

import VaultProvider from "./features/vault/VaultProvider";
import VaultModal from "./features/vault/VaultModal";
import ErrorBoundary from "./components/ErrorBoundary";

function RouteLoadingFallback() {
  return (
    <div className="admin-splash-screen" style={{ minHeight: "60vh", background: "transparent" }}>
      <div className="admin-splash-logo-container" style={{ width: "54px", height: "54px" }}>
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="E-ReQuest Logo"
          className="admin-splash-logo-img"
        />
      </div>
      <div className="admin-splash-text" style={{ fontSize: "14px" }}>
        Loading...
      </div>
    </div>
  );
}

function PageSecurityGuard() {
  const location = useLocation();

  useEffect(() => {
    // 1. Block right-click context menu across all pages
    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    // 2. Block Inspect Element & View Source keyboard combinations
    const handleKeyDown = (e) => {
      const key = (e.key || "").toLowerCase();
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // Block View Page Source (Ctrl+U / Cmd+U) and Save Page (Ctrl+S / Cmd+S)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && (key === "u" || key === "s")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Block DevTools shortcuts: F12, Ctrl+Shift+I/J/C/K, Cmd+Opt+I/J/C
      const isF12 = e.key === "F12" || e.keyCode === 123;
      const isDevToolsCombo =
        (isCtrlOrMeta && e.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
        (e.metaKey && e.altKey && ["i", "j", "c", "k"].includes(key));

      if (isF12 || isDevToolsCombo) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [location.pathname]);

  return null;
}

function App() {

  return (

    <HashRouter>

      <PageSecurityGuard />

      <ErrorBoundary>

        <VaultProvider>

          <VaultModal />

          <Suspense fallback={<RouteLoadingFallback />}>

        <Routes>


        {/* =====================================================
            DEFAULT / LOGIN
            ===================================================== */}

        <Route
          path="/"
          element={<LoginPage initialMode="login" />}
        />


        {/* =====================================================
            LOGIN
            ===================================================== */}

        <Route
          path="/login"
          element={<LoginPage initialMode="login" />}
        />


        {/* =====================================================
            FORGOT PASSWORD / PASSWORD RECOVERY
            ===================================================== */}

        <Route
          path="/forgot-password"
          element={<LoginPage initialMode="forgot_password" />}
        />


        {/* =====================================================
            PROTECTED ADMIN ROUTES
            ===================================================== */}

        <Route element={<ProtectedRoute />}>

          <Route element={<AdminLayout />}>


            {/* DASHBOARD */}

            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />


            {/* SERVICES */}

            <Route
              path="/services"
              element={<ServicesPage />}
            />


            {/* ADD SERVICE */}

            <Route
              path="/services/add"
              element={<AddServicePage />}
            />


            {/* EDIT SERVICE */}

            <Route
              path="/services/edit/:serviceId"
              element={<AddServicePage />}
            />


            {/* TRANSACTIONS */}

            <Route
              path="/transactions"
              element={<TransactionsPage />}
            />


            {/* ADD TRANSACTION */}

            <Route
              path="/transactions/add"
              element={<AddTransactionPage />}
            />


            {/* EDIT TRANSACTION */}

            <Route
              path="/transactions/edit/:transactionId"
              element={<AddTransactionPage />}
            />


            {/* MANAGE TRANSACTION */}

            <Route
              path="/transactions/manage/:transactionId"
              element={<AddTransactionPage />}
            />


            {/* REDIRECT LEGACY REQUIREMENTS */}

            <Route
              path="/requirements"
              element={
                <Navigate
                  to="/transactions"
                  replace
                />
              }
            />


            {/* ANNOUNCEMENTS */}

            <Route
              path="/announcements"
              element={<AnnouncementsPage />}
            />


            {/* ADD ANNOUNCEMENT */}

            <Route
              path="/announcements/add"
              element={<AddAnnouncementPage />}
            />


            {/* EDIT ANNOUNCEMENT */}

            <Route
              path="/announcements/edit/:announcementId"
              element={<AddAnnouncementPage />}
            />


            {/* STUDENT ACTIVITY LOGS */}

            <Route
              path="/student-logs"
              element={<StudentActivityLogsPage />}
            />


            {/* ADMIN PROFILE */}

            <Route
              path="/profile"
              element={<AdminProfilePage />}
            />


          </Route>

        </Route>


        {/* =====================================================
            UNKNOWN ROUTE (TYPO OR INVALID URL)
            ===================================================== */}

        <Route
          path="*"
          element={<LoginPage initialMode="login" />}
        />


      </Routes>

      </Suspense>

      </VaultProvider>

      </ErrorBoundary>

    </HashRouter>

  );

}


export default App;