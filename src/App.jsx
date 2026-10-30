import {
  lazy,
  Suspense
} from "react";

import {
  HashRouter,
  Navigate,
  Route,
  Routes
} from "react-router-dom";

import ProtectedRoute
  from "./features/auth/ProtectedRoute";

import AdminLayout
  from "./layouts/AdminLayout";

import LoginPage
  from "./features/auth/LoginPage";

const DashboardPage =
  lazy(() => import("./features/dashboard/DashboardPage"));

const ServicesPage =
  lazy(() => import("./features/services/ServicesPage"));

const AddServicePage =
  lazy(() => import("./features/services/AddServicePage"));

const TransactionsPage =
  lazy(() => import("./features/transactions/TransactionsPage"));

const AddTransactionPage =
  lazy(() => import("./features/transactions/AddTransactionPage"));

const AnnouncementsPage =
  lazy(() => import("./features/announcements/AnnouncementsPage"));

const AddAnnouncementPage =
  lazy(() => import("./features/announcements/AddAnnouncementPage"));

const AdminProfilePage =
  lazy(() => import("./features/profile/AdminProfilePage"));

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

function App() {

  return (

    <HashRouter>

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

    </HashRouter>

  );

}


export default App;