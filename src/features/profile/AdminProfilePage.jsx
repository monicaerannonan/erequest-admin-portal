import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getInitials
} from "./profileService";
import { useAdminProfileSync } from "./AdminProfileContext";
import { logoutAdmin } from "../auth/authService";

import "./AdminProfilePage.css";

/* =========================================================
   ICONS
   ========================================================= */

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/* =========================================================
   ADMIN PROFILE PAGE COMPONENT
   ========================================================= */

function AdminProfilePage() {
  const navigate = useNavigate();
  const {
    profile,
    loading,
    isSyncing,
    updateProfile
  } = useAdminProfileSync();

  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isNavigatingToReset, setIsNavigatingToReset] = useState(false);

  // Form State
  const [name, setName] = useState(() => profile?.name || "");
  const [position, setPosition] = useState(() => profile?.position || "");
  const [department, setDepartment] = useState(() => profile?.department || "");
  const [phone, setPhone] = useState(() => profile?.phone || "");

  // Track previous profile reference to adjust form state when remote Firestore changes arrive (cross-device sync)
  const [prevProfile, setPrevProfile] = useState(profile);
  if (profile !== prevProfile) {
    setPrevProfile(profile);
    if (!isDirty && profile) {
      setName(profile.name || "");
      setPosition(profile.position || "");
      setDepartment(profile.department || "");
      setPhone(profile.phone || "");
    }
  }

  // Feedback states
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Direct immediately to forgot password with session logout & history replacement
  const handleGoToPasswordReset = async (e) => {
    if (e) e.preventDefault();
    if (isNavigatingToReset) return;

    try {
      setIsNavigatingToReset(true);
      // 1. Revoke active administrator session so browser Back cannot re-enter protected routes
      await logoutAdmin();
    } catch (err) {
      console.warn("Notice signing out before password reset:", err);
    } finally {
      // 2. Replace the current protected /profile page in history with /login,
      // then push /forgot-password so browser Back on /forgot-password lands cleanly on /login
      // and never returns to the admin user profile
      window.history.replaceState(null, "", "#/login");
      navigate("/forgot-password");
    }
  };

  // Handle Form Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    const cleanName = name.trim();
    const cleanPosition = position.trim();
    const cleanDepartment = department.trim();

    if (!cleanName) {
      setErrorMessage("Please enter the administrator's name.");
      return;
    }
    if (!cleanPosition) {
      setErrorMessage("Please enter or select a position.");
      return;
    }
    if (!cleanDepartment) {
      setErrorMessage("Please enter or select a department.");
      return;
    }

    try {
      setSaving(true);
      const res = await updateProfile({
        name: cleanName,
        position: cleanPosition,
        department: cleanDepartment,
        phone: phone.trim()
      });

      if (res.success) {
        setIsDirty(false);
        setSuccessMessage(
          "Administrator profile updated successfully!"
        );
      }
    } catch (err) {
      console.error("Save profile error:", err);
      const isPermissionError =
        err?.code === "permission-denied" ||
        String(err?.message || "").toLowerCase().includes("permission");

      if (isPermissionError) {
        setErrorMessage(
          "Missing or insufficient permissions: Firestore Security Rules prevented updating /admins/{uid}. Please publish the updated firestore.rules to your Firebase project to allow admin profile updates."
        );
      } else {
        setErrorMessage(err.message || "Failed to update admin profile.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-profile-page">
        <div className="admin-profile-loading">
          <div className="admin-profile-spinner" />
          <p>Loading administrator profile from cloud...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-profile-page">
      {/* PAGE HEADER */}
      <header className="admin-profile-header">
        <div className="admin-profile-header-text">
          <h1>Admin Profile</h1>
          <p>View and manage your administrator details, designated position, and assigned department.</p>
        </div>
        <div className="admin-profile-status-badge">
          <ShieldCheckIcon />
          <span>{isSyncing ? "Syncing..." : "Active Administrator"}</span>
        </div>
      </header>

      {/* FEEDBACK BANNERS */}
      {successMessage && (
        <div className="admin-profile-alert admin-profile-alert-success" role="alert">
          <div className="admin-profile-alert-icon">
            <CheckIcon />
          </div>
          <div className="admin-profile-alert-content">
            <strong>Success</strong>
            <p>{successMessage}</p>
          </div>
          <button
            type="button"
            className="admin-profile-alert-dismiss"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss alert"
          >
            &times;
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="admin-profile-alert admin-profile-alert-error" role="alert">
          <div className="admin-profile-alert-icon">
            <AlertIcon />
          </div>
          <div className="admin-profile-alert-content">
            <strong>Error</strong>
            <p>{errorMessage}</p>
          </div>
          <button
            type="button"
            className="admin-profile-alert-dismiss"
            onClick={() => setErrorMessage("")}
            aria-label="Dismiss alert"
          >
            &times;
          </button>
        </div>
      )}

      {/* HERO BANNER CARD */}
      <section className="admin-profile-hero">
        <div className="admin-profile-avatar-large">
          <span>{getInitials(isDirty ? name : profile?.name || name || "Admin User")}</span>
        </div>

        <div className="admin-profile-hero-info">
          <div className="admin-profile-hero-title-row">
            <h2>{isDirty ? name : profile?.name || name || "Admin User"}</h2>
            <span className="admin-profile-role-pill">Administrator</span>
          </div>

          <div className="admin-profile-hero-meta">
            <span className="admin-profile-meta-item" title="Position">
              <BriefcaseIcon />
              <strong>Position:</strong> {isDirty ? position : profile?.position || position || "System Administrator"}
            </span>

            <span className="admin-profile-meta-item" title="Department">
              <BuildingIcon />
              <strong>Department:</strong> {isDirty ? department : profile?.department || department || "Registrar's Office"}
            </span>

            <span className="admin-profile-meta-item" title="Email">
              <MailIcon />
              {profile?.email || "erequesticctadmin@gmail.com"}
            </span>
          </div>
        </div>
      </section>

      {/* MAIN TWO-COLUMN CONTENT */}
      <div className="admin-profile-grid">
        {/* LEFT COLUMN: EDIT PROFILE FORM */}
        <div className="admin-profile-card">
          <div className="admin-profile-card-header">
            <h3>Profile Information</h3>
            <p>Update your personal information, position, and department designation.</p>
          </div>

          <form onSubmit={handleSubmit} className="admin-profile-form">
            {/* FULL NAME */}
            <div className="admin-profile-form-group">
              <label htmlFor="admin-name">
                Full Name <span className="admin-profile-required">*</span>
              </label>
              <div className="admin-profile-input-wrapper">
                <input
                  id="admin-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. Juan Dela Cruz"
                  required
                />
              </div>
              <span className="admin-profile-input-hint">
                The name displayed in the portal header and activity logs.
              </span>
            </div>

            {/* POSITION */}
            <div className="admin-profile-form-group">
              <label htmlFor="admin-position">
                Position / Designation <span className="admin-profile-required">*</span>
              </label>
              <div className="admin-profile-input-wrapper">
                <input
                  id="admin-position"
                  type="text"
                  value={position}
                  onChange={(e) => {
                    setPosition(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. Registrar Officer, System Administrator"
                  required
                />
              </div>
            </div>

            {/* DEPARTMENT */}
            <div className="admin-profile-form-group">
              <label htmlFor="admin-department">
                Department / Office <span className="admin-profile-required">*</span>
              </label>
              <div className="admin-profile-input-wrapper">
                <input
                  id="admin-department"
                  type="text"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. Registrar's Office, Admissions Office"
                  required
                />
              </div>
            </div>

            {/* CONTACT PHONE (OPTIONAL) */}
            <div className="admin-profile-form-group">
              <label htmlFor="admin-phone">Contact Number (Optional)</label>
              <div className="admin-profile-input-wrapper">
                <input
                  id="admin-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. +63 912 345 6789"
                />
              </div>
            </div>

            {/* EMAIL (READ-ONLY) */}
            <div className="admin-profile-form-group">
              <label htmlFor="admin-email">Administrator Email</label>
              <div className="admin-profile-input-wrapper">
                <input
                  id="admin-email"
                  type="email"
                  value={profile?.email || ""}
                  disabled
                  readOnly
                  className="admin-profile-input-disabled"
                />
              </div>
              <span className="admin-profile-input-hint">
                Primary email used for administrator sign-in and security notifications.
              </span>
            </div>

            {/* ROLE (READ-ONLY) */}
            <div className="admin-profile-form-group">
              <label htmlFor="admin-role">System Role</label>
              <div className="admin-profile-input-wrapper">
                <input
                  id="admin-role"
                  type="text"
                  value="Administrator (Full Access)"
                  disabled
                  readOnly
                  className="admin-profile-input-disabled"
                />
              </div>
            </div>

            {/* ACTIONS */}
            <div className="admin-profile-form-actions">
              <button
                type="submit"
                disabled={saving}
                className="admin-profile-btn-primary"
              >
                {saving ? (
                  <>
                    <span className="admin-profile-btn-spinner"></span>
                    Saving Profile...
                  </>
                ) : (
                  <>
                    <CheckIcon />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: OVERVIEW & CREDENTIALS CARDS */}
        <div className="admin-profile-side-column">
          {/* PROFILE SUMMARY CARD */}
          <div className="admin-profile-card">
            <div className="admin-profile-card-header">
              <h3>Profile Summary</h3>
              <p>Current active administrator credentials.</p>
            </div>

            <div className="admin-profile-summary-list">
              <div className="admin-profile-summary-item">
                <span className="summary-label">Full Name</span>
                <strong className="summary-value">{profile?.name || "Admin User"}</strong>
              </div>

              <div className="admin-profile-summary-item">
                <span className="summary-label">Position</span>
                <strong className="summary-value">{profile?.position || "System Administrator"}</strong>
              </div>

              <div className="admin-profile-summary-item">
                <span className="summary-label">Department</span>
                <strong className="summary-value">{profile?.department || "Registrar's Office"}</strong>
              </div>

              <div className="admin-profile-summary-item">
                <span className="summary-label">Assigned Role</span>
                <span className="summary-badge">Admin</span>
              </div>

              <div className="admin-profile-summary-item">
                <span className="summary-label">Last Updated</span>
                <span className="summary-date">
                  {profile?.updatedAt
                    ? new Date(profile.updatedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })
                    : "Default profile"}
                </span>
              </div>
            </div>
          </div>

          {/* ACCESS & RESPONSIBILITIES CARD */}
          <div className="admin-profile-card">
            <div className="admin-profile-card-header">
              <h3>Administrative Privileges</h3>
              <p>Permissions authorized for this administrator.</p>
            </div>

            <ul className="admin-profile-permissions-list">
              <li>
                <span className="permission-bullet"></span>
                <span>Manage School Services & Department Guidelines</span>
              </li>
              <li>
                <span className="permission-bullet"></span>
                <span>Manage Transactions & Step-by-Step Procedures</span>
              </li>
              <li>
                <span className="permission-bullet"></span>
                <span>Publish & Broadcast School Announcements</span>
              </li>
              <li>
                <span className="permission-bullet"></span>
                <span>Search Portal Database & Inspect Activity Audit Logs</span>
              </li>
            </ul>
          </div>

          {/* SECURITY & CREDENTIALS CARD */}
          <div className="admin-profile-card admin-profile-security-card">
            <div className="admin-profile-card-header">
              <h3>Security & Password</h3>
            </div>

            <div className="admin-profile-security-body">
              <button
                type="button"
                className="admin-profile-security-link"
                onClick={handleGoToPasswordReset}
                disabled={isNavigatingToReset}
              >
                {isNavigatingToReset
                  ? "Directing to Password Reset..."
                  : "Go to Password Reset / Sign In"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminProfilePage;
