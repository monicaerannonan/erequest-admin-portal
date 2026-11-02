import { useState } from "react";
import { useVault } from "./VaultContext";
import { encryptEntireDatabase } from "./vaultMigrationService";
import "./VaultModal.css";

export default function VaultModal() {
  const {
    isModalOpen,
    modalMode,
    openVaultModal,
    closeVaultModal,
    setupMasterKey,
    unlockWithPassword,
    unlockWithRecovery,
    lockVault,
    vaultKey
  } = useVault();

  // Form states
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Recovery Key Display state after setup
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [activeSetupKey, setActiveSetupKey] = useState(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);

  // Migration states
  const [migrationProgress, setMigrationProgress] = useState(null);
  const [migrationSuccess, setMigrationSuccess] = useState(null);

  if (!isModalOpen) {
    return null;
  }

  // Handle Setup
  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Master Secret Key must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await setupMasterKey(password);
      setGeneratedRecoveryKey(res.recoveryKey);
      if (res.cryptoKey) {
        setActiveSetupKey(res.cryptoKey);
      }
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err?.message || "Failed to set up Security Vault.");
    } finally {
      setLoading(false);
    }
  };

  // Complete Setup after confirming recovery key
  const handleFinishSetup = async () => {
    if (!confirmedSaved) {
      setError("Please check the confirmation box indicating you have saved your Recovery Key.");
      return;
    }
    // Auto-run encryption migration for existing database records right after setup!
    const keyToUse = vaultKey || activeSetupKey;
    if (!keyToUse) {
      setError("Active Master Key not found. Please re-open the vault.");
      return;
    }
    setLoading(true);
    try {
      await encryptEntireDatabase(keyToUse, (prog) => {
        setMigrationProgress(prog);
      });
      setMigrationSuccess("Database successfully encrypted in Firebase!");
      setTimeout(() => {
        setGeneratedRecoveryKey("");
        setActiveSetupKey(null);
        closeVaultModal();
      }, 1500);
    } catch (err) {
      console.warn("Migration notice:", err);
      setGeneratedRecoveryKey("");
      setActiveSetupKey(null);
      closeVaultModal();
    } finally {
      setLoading(false);
    }
  };

  // Handle Unlock
  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!password) {
      setError("Please enter your Database Master Secret Key.");
      return;
    }

    setLoading(true);
    try {
      await unlockWithPassword(password);
      setPassword("");
    } catch (err) {
      setError(err?.message || "Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Recovery
  const handleRecoverySubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!recoveryCode.trim()) {
      setError("Please enter your Emergency Recovery Key.");
      return;
    }
    if (password.length < 8) {
      setError("New Master Secret Key must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await unlockWithRecovery(recoveryCode.trim(), password);
      setGeneratedRecoveryKey(res.newRecoveryKey);
      setPassword("");
      setConfirmPassword("");
      setRecoveryCode("");
    } catch (err) {
      setError(err?.message || "Unable to recover vault. Please verify your recovery key.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Migration Run from Manager
  const handleRunMigration = async () => {
    if (!vaultKey) return;
    setLoading(true);
    setMigrationSuccess(null);
    setError("");
    try {
      const res = await encryptEntireDatabase(vaultKey, (prog) => {
        setMigrationProgress(prog);
      });
      setMigrationSuccess(
        `Successfully encrypted ${res.totalEncrypted} records in Firebase Console!`
      );
    } catch (err) {
      setError(err?.message || "An error occurred while encrypting the database.");
    } finally {
      setLoading(false);
    }
  };

  // Copy Recovery Key to Clipboard
  const handleCopyRecovery = () => {
    if (generatedRecoveryKey) {
      navigator.clipboard.writeText(generatedRecoveryKey);
      setCopiedRecovery(true);
      setTimeout(() => setCopiedRecovery(false), 2500);
    }
  };

  // Download Recovery Key
  const handleDownloadRecovery = () => {
    if (!generatedRecoveryKey) return;
    const content = `E-REQUEST PORTAL - DATABASE EMERGENCY RECOVERY KEY\n` +
      `Date Generated: ${new Date().toLocaleString()}\n\n` +
      `RECOVERY KEY: ${generatedRecoveryKey}\n\n` +
      `IMPORTANT:\n` +
      `Store this file in a secure location (e.g. encrypted USB drive or password manager).\n` +
      `If you forget Password 2, this is the ONLY way to unlock or recover your encrypted Firebase database.`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `EREQUEST_RECOVERY_KEY_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="vault-modal-overlay" role="dialog" aria-modal="true">
      <div className="vault-modal-card">

        {/* =========================================================
            HEADER
            ========================================================= */}
        <div className="vault-modal-header">
          <div className="vault-modal-icon-badge">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h2 className="vault-modal-title">
              {generatedRecoveryKey
                ? "Emergency Recovery Key"
                : modalMode === "setup"
                ? "Database Master Secret Key (Password 2)"
                : modalMode === "recovery"
                ? "Emergency Vault Recovery"
                : modalMode === "manager"
                ? "Database Security Vault Manager"
                : "Security Vault Locked"}
            </h2>
            {/* Subtitle omitted on setup mode per user request */}
            {modalMode !== "setup" && (
              <p className="vault-modal-subtitle">
                {generatedRecoveryKey
                  ? "Store this key in a secure location before continuing."
                  : modalMode === "recovery"
                  ? "Reset your Master Secret Key using your Emergency Recovery Key."
                  : modalMode === "manager"
                  ? "Database protection and encryption status in Firebase."
                  : "Enter your Password 2 to decrypt and view database records."}
              </p>
            )}
          </div>
          {modalMode === "manager" && (
            <button
              type="button"
              className="vault-close-btn"
              onClick={closeVaultModal}
              title="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* ERROR NOTIFICATION */}
        {error && (
          <div className="vault-alert error">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* SUCCESS NOTIFICATION */}
        {migrationSuccess && (
          <div className="vault-alert success">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{migrationSuccess}</span>
          </div>
        )}

        {/* =========================================================
            STATE 1: RECOVERY KEY DISPLAY (AFTER SETUP OR RESET)
            ========================================================= */}
        {generatedRecoveryKey ? (
          <div className="vault-recovery-display">
            <div className="vault-recovery-warning">
              ⚠️ <strong>DO NOT LOSE THIS KEY:</strong> Firebase does not store a copy of your Master Secret Key. This recovery key is the ONLY way to unlock or recover your database if you forget your password.
            </div>

            <div className="vault-key-box">
              <code>{generatedRecoveryKey}</code>
            </div>

            <div className="vault-key-actions">
              <button
                type="button"
                className="vault-btn secondary"
                onClick={handleCopyRecovery}
              >
                {copiedRecovery ? "✓ Copied!" : "📋 Copy Key"}
              </button>
              <button
                type="button"
                className="vault-btn secondary"
                onClick={handleDownloadRecovery}
              >
                💾 Download as TXT
              </button>
            </div>

            <label className="vault-checkbox-label">
              <input
                type="checkbox"
                checked={confirmedSaved}
                onChange={(e) => setConfirmedSaved(e.target.checked)}
              />
              <span>I have safely saved my Emergency Recovery Key in a secure place.</span>
            </label>

            {migrationProgress && (
              <div className="vault-progress-text">
                ⏳ {migrationProgress.stage} ({migrationProgress.totalEncrypted} records)
              </div>
            )}

            <button
              type="button"
              className="vault-btn primary full"
              disabled={!confirmedSaved || loading}
              onClick={handleFinishSetup}
            >
              {loading ? "Encrypting Database..." : "Finish Setup & Encrypt Database"}
            </button>
          </div>
        ) : modalMode === "setup" ? (
          /* =========================================================
             STATE 2: SETUP MASTER SECRET KEY (PASSWORD 2)
             Circled subtitle & hints removed per user request
             ========================================================= */
          <form onSubmit={handleSetupSubmit} className="vault-form">
            <div className="vault-input-group">
              <label>New Master Secret Key (Password 2)</label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="vault-input-group">
              <label>Confirm Master Secret Key</label>
              <input
                type="password"
                placeholder="Re-type Master Secret Key"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="vault-btn primary full"
              disabled={loading}
            >
              {loading ? "Generating Cryptographic Keys..." : "Create Master Key (Password 2)"}
            </button>
          </form>
        ) : modalMode === "unlock" ? (
          /* =========================================================
             STATE 3: UNLOCK VAULT
             ========================================================= */
          <form onSubmit={handleUnlockSubmit} className="vault-form">
            <div className="vault-input-group">
              <label>Database Master Secret Key (Password 2)</label>
              <input
                type="password"
                placeholder="Enter Password 2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="vault-btn primary full"
              disabled={loading}
            >
              {loading ? "Verifying Key..." : "Unlock Vault"}
            </button>

            <div className="vault-modal-footer-links">
              <button
                type="button"
                className="vault-text-link"
                onClick={() => {
                  setError("");
                  setPassword("");
                  openVaultModal("recovery");
                }}
              >
                Forgot Password 2? Use Emergency Recovery Key
              </button>
            </div>
          </form>
        ) : modalMode === "recovery" ? (
          /* =========================================================
             STATE 4: EMERGENCY RECOVERY
             ========================================================= */
          <form onSubmit={handleRecoverySubmit} className="vault-form">
            <div className="vault-input-group">
              <label>Emergency Recovery Key</label>
              <input
                type="text"
                placeholder="EREQ-XXXX-XXXX-XXXX-XXXX-VAULT"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="vault-input-group">
              <label>New Master Secret Key (Password 2)</label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="vault-input-group">
              <label>Confirm New Master Secret Key</label>
              <input
                type="password"
                placeholder="Re-type new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="vault-btn primary full"
              disabled={loading}
            >
              {loading ? "Recovering Vault..." : "Reset & Unlock with Recovery Key"}
            </button>

            <div className="vault-modal-footer-links">
              <button
                type="button"
                className="vault-text-link"
                onClick={() => {
                  setError("");
                  setPassword("");
                  openVaultModal("unlock");
                }}
              >
                Back to standard unlock
              </button>
            </div>
          </form>
        ) : (
          /* =========================================================
             STATE 5: VAULT MANAGER & MIGRATION TOOL
             ========================================================= */
          <div className="vault-manager-body">
            <div className="vault-status-card">
              <div className="vault-status-indicator active">
                <span className="vault-status-dot" />
                <strong>Status: Active &amp; Unlocked</strong>
              </div>
              <p>
                Your session is protected with <strong>AES-256-GCM Bank-Grade Encryption</strong>. All sensitive fields are automatically encrypted before saving to Firebase.
              </p>
            </div>

            <div className="vault-migration-card">
              <h4>Database Encryption Tool</h4>
              <p>
                Scan and encrypt all existing records in Firebase (including student activity logs, registered students, admin profiles, and system logs) so they appear as <code>enc:v1:...</code> in the Firebase Console.
              </p>

              {migrationProgress && (
                <div className="vault-progress-text">
                  ⏳ {migrationProgress.stage} (Encrypted: {migrationProgress.totalEncrypted} records)
                </div>
              )}

              <button
                type="button"
                className="vault-btn primary full"
                onClick={handleRunMigration}
                disabled={loading}
              >
                {loading ? "Encrypting Records..." : "🔒 Encrypt All Existing Records in Database"}
              </button>
            </div>

            <div className="vault-manager-actions">
              <button
                type="button"
                className="vault-btn secondary full"
                onClick={() => {
                  lockVault();
                  closeVaultModal();
                }}
              >
                🔒 Lock Vault Now
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
