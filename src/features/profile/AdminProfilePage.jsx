import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getInitials,
  uploadAdminProfilePhoto
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

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/* =========================================================
   ADMIN PROFILE PAGE COMPONENT
   ========================================================= */

function AdminProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const {
    profile,
    loading,
    isSyncing,
    updateProfile
  } = useAdminProfileSync();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isNavigatingToReset, setIsNavigatingToReset] = useState(false);

  // Form State
  const [name, setName] = useState(() => profile?.name || "");
  const [position, setPosition] = useState(() => profile?.position || "");
  const [department, setDepartment] = useState(() => profile?.department || "");
  const [phone, setPhone] = useState(() => profile?.phone || "");
  const [photoUrl, setPhotoUrl] = useState(() => profile?.photoUrl || "");

  // Track previous profile reference to adjust form state when remote Firestore changes arrive (cross-device sync)
  const [prevProfile, setPrevProfile] = useState(profile);
  if (profile !== prevProfile) {
    setPrevProfile(profile);
    if (!isEditing && !isDirty && profile) {
      setName(profile.name || "");
      setPosition(profile.position || "");
      setDepartment(profile.department || "");
      setPhone(profile.phone || "");
      if (typeof profile.photoUrl === "string") {
        setPhotoUrl(profile.photoUrl);
      }
    }
  }

  // Feedback states
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activePhotoUrl = String(
    isEditing ? photoUrl : photoUrl || profile?.photoUrl || ""
  ).trim();
  const hasVisiblePhoto = Boolean(
    activePhotoUrl && activePhotoUrl !== failedPhotoUrl
  );
  const displayName = isEditing
    ? name || profile?.name || "Admin User"
    : profile?.name || name || "Admin User";

  const handleStartEditing = (e) => {
    if (e) e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");
    setName(profile?.name || "");
    setPosition(profile?.position || "");
    setDepartment(profile?.department || "");
    setPhone(profile?.phone || "");
    setPhotoUrl(
      typeof profile?.photoUrl === "string" && profile.photoUrl
        ? profile.photoUrl
        : photoUrl || ""
    );
    setIsDirty(false);
    setIsEditing(true);
  };

  const handleCancelEditing = (e) => {
    if (e) e.preventDefault();
    setErrorMessage("");
    setName(profile?.name || "");
    setPosition(profile?.position || "");
    setDepartment(profile?.department || "");
    setPhone(profile?.phone || "");
    setPhotoUrl(
      typeof profile?.photoUrl === "string" ? profile.photoUrl : ""
    );
    setFailedPhotoUrl("");
    setIsDirty(false);
    setIsEditing(false);
  };

  const handleTriggerPhotoPicker = () => {
    if (!isEditing || uploadingPhoto || saving) return;
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    // Reset input so selecting the same file again still fires onChange
    e.target.value = "";
    if (!file || !isEditing) return;

    setSuccessMessage("");
    setErrorMessage("");

    try {
      setUploadingPhoto(true);
      const uploadedUrl = await uploadAdminProfilePhoto(file);
      setPhotoUrl(uploadedUrl);
      setFailedPhotoUrl("");
      setIsDirty(true);
    } catch (err) {
      console.error("Upload profile photo error:", err);
      setErrorMessage(err.message || "Failed to upload profile picture.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    if (!isEditing || !activePhotoUrl || uploadingPhoto || saving) return;
    setSuccessMessage("");
    setErrorMessage("");
    setPhotoUrl("");
    setFailedPhotoUrl("");
    setIsDirty(true);
  };

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
    if (!isEditing) return;

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
        phone: phone.trim(),
        photoUrl
      });

      if (res.success) {
        const savedPhotoUrl =
          typeof res?.profile?.photoUrl === "string"
            ? res.profile.photoUrl
            : photoUrl;
        setPhotoUrl(savedPhotoUrl);
        setFailedPhotoUrl("");
        setIsDirty(false);
        setIsEditing(false);
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
        <div className="admin-profile-avatar-wrapper">
          <div className="admin-profile-avatar-large">
            {hasVisiblePhoto ? (
              <img
                src={activePhotoUrl}
                alt={displayName}
                className="admin-profile-avatar-img"
                onError={() => setFailedPhotoUrl(activePhotoUrl)}
              />
            ) : (
              <span>{getInitials(displayName)}</span>
            )}
          </div>
          {isEditing && (
            <button
              type="button"
              className="admin-profile-avatar-camera-btn"
              onClick={handleTriggerPhotoPicker}
              disabled={uploadingPhoto || saving}
              title={hasVisiblePhoto ? "Change profile picture" : "Add profile picture"}
              aria-label={hasVisiblePhoto ? "Change profile picture" : "Add profile picture"}
            >
              <CameraIcon />
            </button>
          )}
        </div>

        <div className="admin-profile-hero-info">
          <div className="admin-profile-hero-title-row">
            <h2>{displayName}</h2>
            <span className="admin-profile-role-pill">Administrator</span>
          </div>

          <div className="admin-profile-hero-meta">
            <span className="admin-profile-meta-item" title="Position">
              <BriefcaseIcon />
              <strong>Position:</strong>{" "}
              {isEditing
                ? position || profile?.position || "System Administrator"
                : profile?.position || position || "System Administrator"}
            </span>

            <span className="admin-profile-meta-item" title="Department">
              <BuildingIcon />
              <strong>Department:</strong>{" "}
              {isEditing
                ? department || profile?.department || "Registrar's Office"
                : profile?.department || department || "Registrar's Office"}
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
          <div className="admin-profile-card-header admin-profile-card-header-row">
            <div>
              <h3>Profile Information</h3>
              <p>
                {isEditing
                  ? "Edit your personal information, picture, position, and department, then click Save Changes."
                  : "Profile details are locked. Click Edit below to make changes."}
              </p>
            </div>
            <span
              className={
                isEditing
                  ? "admin-profile-mode-badge editing"
                  : "admin-profile-mode-badge locked"
              }
            >
              {isEditing ? (
                <>
                  <EditIcon />
                  Editing
                </>
              ) : (
                <>
                  <LockIcon />
                  Locked
                </>
              )}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="admin-profile-form">
            {/* PROFILE PICTURE UPLOAD */}
            <div
              className={
                isEditing
                  ? "admin-profile-photo-section"
                  : "admin-profile-photo-section locked"
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                onChange={handlePhotoChange}
                disabled={!isEditing}
                hidden
              />

              <div className="admin-profile-photo-preview">
                {hasVisiblePhoto ? (
                  <img
                    src={activePhotoUrl}
                    alt={displayName}
                    className="admin-profile-avatar-img"
                    onError={() => setFailedPhotoUrl(activePhotoUrl)}
                  />
                ) : (
                  <span>{getInitials(displayName)}</span>
                )}
              </div>

              <div className="admin-profile-photo-controls">
                <span className="admin-profile-photo-label">Profile Picture</span>
                <div className="admin-profile-photo-buttons">
                  <button
                    type="button"
                    className="admin-profile-btn-upload"
                    onClick={handleTriggerPhotoPicker}
                    disabled={!isEditing || uploadingPhoto || saving}
                    title={
                      !isEditing
                        ? "Click Edit below to unlock profile picture changes"
                        : undefined
                    }
                  >
                    {uploadingPhoto ? (
                      <>
                        <span className="admin-profile-btn-spinner admin-profile-btn-spinner-dark"></span>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <CameraIcon />
                        {hasVisiblePhoto ? "Change Picture" : "Add Picture"}
                      </>
                    )}
                  </button>

                  {hasVisiblePhoto && (
                    <button
                      type="button"
                      className="admin-profile-btn-remove-photo"
                      onClick={handleRemovePhoto}
                      disabled={!isEditing || uploadingPhoto || saving}
                      title={
                        !isEditing
                          ? "Click Edit below to unlock profile picture changes"
                          : undefined
                      }
                    >
                      <TrashIcon />
                      Remove
                    </button>
                  )}
                </div>
                <span className="admin-profile-input-hint">
                  {isEditing
                    ? "JPG, PNG, or WEBP up to 5 MB. Click Save Changes below to apply."
                    : "Click Edit below to add, change, or remove your profile picture."}
                </span>
              </div>
            </div>

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
                    if (!isEditing) return;
                    setName(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. Juan Dela Cruz"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className={!isEditing ? "admin-profile-input-locked" : ""}
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
                    if (!isEditing) return;
                    setPosition(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. Registrar Officer, System Administrator"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className={!isEditing ? "admin-profile-input-locked" : ""}
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
                    if (!isEditing) return;
                    setDepartment(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. Registrar's Office, Admissions Office"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className={!isEditing ? "admin-profile-input-locked" : ""}
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
                    if (!isEditing) return;
                    setPhone(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="e.g. +63 912 345 6789"
                  disabled={!isEditing}
                  readOnly={!isEditing}
                  className={!isEditing ? "admin-profile-input-locked" : ""}
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
              {!isEditing ? (
                <button
                  key="edit-profile-btn"
                  type="button"
                  onClick={handleStartEditing}
                  className="admin-profile-btn-primary"
                >
                  <EditIcon />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    key="save-profile-btn"
                    type="submit"
                    disabled={saving || uploadingPhoto}
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
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    disabled={saving || uploadingPhoto}
                    className="admin-profile-btn-secondary"
                  >
                    Cancel
                  </button>
                </>
              )}
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
