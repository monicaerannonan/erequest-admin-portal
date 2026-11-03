import { useEffect, useMemo, useState } from "react";

import {
  MAX_ACCOUNT_SWITCHES_PER_DEVICE,
  formatStudentLogDate,
  formatStudentLogTime,
  getAllStudentActivityLogs,
  subscribeToStudentActivityLogs,
  formatDeviceNameDisplay,
  formatOsVersionDisplay
} from "./studentLogService";
import { useVault } from "../vault/VaultContext";
import { getActiveMasterCryptoKey } from "../../utils/vaultCrypto";

import "./StudentActivityLogsPage.css";

const PAGE_SIZE = 10;

/* =========================================================
   INLINE SVG ICONS
   ========================================================= */

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="6"
        y="2.5"
        width="12"
        height="19"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M10 18.5h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldAlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l7.5 3.5v5.3c0 4.6-3.1 8.6-7.5 9.7-4.4-1.1-7.5-5.1-7.5-9.7V6.5L12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.5v4.5M12 16h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M20 20l-3.8-3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function truncateInstallationId(uuid = "") {
  if (!uuid || uuid === "—") {
    return "—";
  }
  if (uuid.length <= 18) {
    return uuid;
  }
  return `${uuid.slice(0, 13)}...${uuid.slice(-4)}`;
}

/* =========================================================
   STUDENT ACTIVITY LOGS PAGE
   ========================================================= */

function StudentActivityLogsPage() {
  const { vaultKey, decryptText, openVaultModal, lockVault } = useVault();
  const isMasterActive = Boolean(vaultKey || getActiveMasterCryptoKey());
  const [logs, setLogs] = useState([]);
  const [decryptedMap, setDecryptedMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [fetchLimit, setFetchLimit] = useState(200);
  const [copiedId, setCopiedId] = useState("");
  const [openDropdownRowId, setOpenDropdownRowId] = useState("");

  /* Decrypt encrypted fields in real time automatically when Master Key is active */
  const activeDecryptedMap = useMemo(
    () => (isMasterActive ? decryptedMap : {}),
    [isMasterActive, decryptedMap]
  );

  useEffect(() => {
    let active = true;
    if (!isMasterActive) {
      return undefined;
    }
    async function decryptAll() {
      const map = {};
      for (const log of logs) {
        if (log.deviceName && String(log.deviceName).startsWith("enc:v1:")) {
          map[log.deviceName] = await decryptText(log.deviceName, log.deviceName);
        }
        if (log.osVersion && String(log.osVersion).startsWith("enc:v1:")) {
          map[log.osVersion] = await decryptText(log.osVersion, log.osVersion);
        }
      }
      if (active) {
        setDecryptedMap(map);
      }
    }
    decryptAll();
    return () => {
      active = false;
    };
  }, [logs, isMasterActive, decryptText]);

  useEffect(() => {
    if (!openDropdownRowId) return undefined;

    const handleOutsideClick = (event) => {
      if (!event.target.closest(".student-updated-id-dropdown-wrap")) {
        setOpenDropdownRowId("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpenDropdownRowId("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openDropdownRowId]);

  /* =========================================================
     REAL-TIME LISTENER & MANUAL RETRY
     ========================================================= */

  useEffect(() => {
    let ignore = false;

    const unsubscribe = subscribeToStudentActivityLogs(
      (incomingLogs) => {
        if (!ignore) {
          setLogs(incomingLogs);
          setErrorMessage("");
          setLoading(false);
        }
      },
      (error) => {
        console.error("Failed to subscribe to student activity logs:", error);
        if (!ignore) {
          setErrorMessage("Unable to load student activity logs right now.");
          setLoading(false);
        }
      },
      { maxLimit: fetchLimit }
    );

    return () => {
      ignore = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [fetchLimit]);

  const handleRetryLoad = async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      const freshLogs = await getAllStudentActivityLogs({ maxLimit: fetchLimit });
      setLogs(freshLogs);
    } catch (error) {
      console.error("Retry loading student logs failed:", error);
      setErrorMessage("Unable to load student activity logs right now.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     COPY UUID HANDLER
     ========================================================= */

  const handleCopyInstallationId = async (installationId) => {
    if (!installationId || installationId === "—") {
      return;
    }

    try {
      await navigator.clipboard.writeText(installationId);
      setCopiedId(installationId);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === installationId ? "" : prev));
      }, 1800);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  };

  /* =========================================================
     SUMMARY COUNTS & FILTERED DATA
     ========================================================= */

  const counts = useMemo(() => {
    let normal = 0;
    let switched = 0;
    let limitReached = 0;

    for (const item of logs) {
      if (item.status === "limit_reached") {
        limitReached += 1;
      } else if (item.status === "switched") {
        switched += 1;
      } else {
        normal += 1;
      }
    }

    return {
      total: logs.length,
      normal,
      switched,
      limitReached
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const cleanQuery = searchQuery.trim().toLowerCase();

    return logs.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!cleanQuery) {
        return true;
      }

      const matchesLoggedList = Array.isArray(item.loggedStudentNumbers)
        ? item.loggedStudentNumbers.some((acct) =>
            String(acct).toLowerCase().includes(cleanQuery)
          )
        : false;

      const resolvedDevice = formatDeviceNameDisplay(
        activeDecryptedMap[item.deviceName] || item.deviceName,
        item.fallbackDeviceName,
        isMasterActive
      ).toLowerCase();
      const resolvedOs = formatOsVersionDisplay(
        activeDecryptedMap[item.osVersion] || item.osVersion,
        item.fallbackOsVersion,
        isMasterActive
      ).toLowerCase();

      return (
        item.studentNumber.toLowerCase().includes(cleanQuery) ||
        item.currentStudentNumber.toLowerCase().includes(cleanQuery) ||
        matchesLoggedList ||
        resolvedDevice.includes(cleanQuery) ||
        resolvedOs.includes(cleanQuery) ||
        item.installationId.toLowerCase().includes(cleanQuery)
      );
    });
  }, [logs, activeDecryptedMap, searchQuery, statusFilter, isMasterActive]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedLogs = useMemo(() => {
    const startIndex = (safePage - 1) * PAGE_SIZE;
    return filteredLogs.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredLogs, safePage]);

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
  };

  const handleFilterChange = (nextFilter) => {
    setStatusFilter(nextFilter);
    setCurrentPage(1);
  };

  /* =========================================================
     RENDER HELPERS
     ========================================================= */

  const renderUpdatedStudentBadge = (log) => {
    const rawAccounts =
      Array.isArray(log.loggedStudentNumbers) &&
      log.loggedStudentNumbers.length > 0
        ? log.loggedStudentNumbers
        : [log.currentStudentNumber || "—"];

    // Strictly enforce maximum 3 accounts per device display (never 4 or 5)
    const validAccounts = rawAccounts
      .filter((id) => id && id !== "—")
      .slice(0, MAX_ACCOUNT_SWITCHES_PER_DEVICE);
    const accounts = validAccounts.length > 0 ? validAccounts : [rawAccounts[0] || "—"];

    const mostRecentId = accounts[0] || log.currentStudentNumber || "—";
    const totalAccountsOnPhone = Math.min(
      MAX_ACCOUNT_SWITCHES_PER_DEVICE,
      accounts.filter((id) => id && id !== "—").length
    );
    const isDropdownOpen = openDropdownRowId === log.id;

    let badgeToneClass = "active-id-normal";
    if (log.status === "limit_reached") {
      badgeToneClass = "active-id-limit";
    } else if (log.status === "switched" || log.isDifferentActiveStudent) {
      badgeToneClass = "active-id-switched";
    }

    const helperLabel =
      totalAccountsOnPhone > 1
        ? `Most recent open • ${totalAccountsOnPhone} accounts on phone`
        : "Most recent open on phone";

    return (
      <div className="student-updated-id-cell student-updated-id-dropdown-wrap">
        <button
          type="button"
          className={`student-active-id-badge student-active-id-dropdown-btn ${badgeToneClass} ${
            isDropdownOpen ? "dropdown-open" : ""
          }`}
          onClick={() =>
            setOpenDropdownRowId((prev) => (prev === log.id ? "" : log.id))
          }
          aria-expanded={isDropdownOpen}
          title="Click to view all student accounts logged in on this phone"
        >
          <span className="student-active-id-dot" />
          <span className="student-active-id-primary-text">{mostRecentId}</span>
          {totalAccountsOnPhone > 1 && (
            <span className="student-active-id-count-pill">
              +{totalAccountsOnPhone - 1}
            </span>
          )}
          <span className="student-active-id-chevron">
            <ChevronDownIcon />
          </span>
        </button>

        {isDropdownOpen && totalAccountsOnPhone > 0 && (
          <div className="student-accounts-dropdown-menu" role="listbox">
            <div className="student-accounts-dropdown-header">
              Accounts on this phone ({totalAccountsOnPhone})
            </div>
            <ul className="student-accounts-dropdown-list">
              {accounts.map((acctId, idx) => {
                const isMostRecent = idx === 0;

                return (
                  <li
                    key={`${log.id}-${acctId}-${idx}`}
                    className={
                      isMostRecent
                        ? "student-accounts-dropdown-item item-most-recent"
                        : "student-accounts-dropdown-item"
                    }
                  >
                    <div className="student-dropdown-item-left">
                      <span
                        className={
                          isMostRecent
                            ? "student-dropdown-rank rank-recent"
                            : "student-dropdown-rank"
                        }
                      >
                        #{idx + 1}
                      </span>
                      <span className="student-dropdown-id">{acctId}</span>
                    </div>
                    <span
                      className={
                        isMostRecent
                          ? "student-dropdown-tag tag-recent"
                          : "student-dropdown-tag"
                      }
                    >
                      {isMostRecent
                        ? "Most Recent • Open"
                        : "Saved on Phone"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <span className="student-updated-id-caption">{helperLabel}</span>
      </div>
    );
  };

  const renderStatusBadge = (log) => {
    if (log.status === "limit_reached") {
      return (
        <span className="student-status-badge status-limit-reached">
          <span className="student-status-dot" />
          Limit Reached ({log.dailySwitchCount}/{MAX_ACCOUNT_SWITCHES_PER_DEVICE})
        </span>
      );
    }

    if (log.status === "switched") {
      return (
        <span className="student-status-badge status-switched">
          <span className="student-status-dot" />
          Switched ({log.dailySwitchCount}/{MAX_ACCOUNT_SWITCHES_PER_DEVICE})
        </span>
      );
    }

    return (
      <span className="student-status-badge status-normal">
        <span className="student-status-dot" />
        {log.dailySwitchCount > 0
          ? `Normal (${log.dailySwitchCount}/${MAX_ACCOUNT_SWITCHES_PER_DEVICE})`
          : "Normal"}
      </span>
    );
  };

  return (
    <div className="student-logs-page">
      {/* HEADER */}
      <header className="student-logs-header">
        <div className="student-logs-header-text">
          <h1>Student Activity Logs</h1>
          <p>
            Monitor student numbers, active Student ID open on each phone,
            unique device UUIDs, app opens, and device account switches.
          </p>
        </div>

        <div className="student-logs-header-vault">
          {isMasterActive ? (
            <div className="student-vault-badge unlocked" title="Master Password active: hardware device models and OS versions are decrypted.">
              <span className="vault-badge-indicator" />
              <div className="vault-badge-text">
                <span className="vault-badge-label">Master Key Active</span>
                <span className="vault-badge-subtext">Unit Models Revealed</span>
              </div>
              <button
                type="button"
                className="vault-badge-action-btn lock"
                onClick={lockVault}
                title="Lock vault to mask device names back to 'Android Device'"
              >
                Mask (Lock)
              </button>
            </div>
          ) : (
            <div className="student-vault-badge locked" title="Normal Password mode: hardware device models are masked as 'Android Device' for security and privacy.">
              <span className="vault-badge-indicator" />
              <div className="vault-badge-text">
                <span className="vault-badge-label">Normal Password Mode</span>
                <span className="vault-badge-subtext">Generic Device View</span>
              </div>
              <button
                type="button"
                className="vault-badge-action-btn unlock"
                onClick={() => openVaultModal("unlock")}
                title="Enter Master Password to reveal real device unit names"
              >
                Reveal Unit Names
              </button>
            </div>
          )}
        </div>
      </header>

      {/* SUMMARY CARDS */}
      <section className="student-logs-summary">
        <div className="student-summary-card summary-border-blue">
          <div>
            <span className="student-summary-title">Logged Devices</span>
            <strong className="student-summary-number">
              {loading ? "..." : counts.total}
            </strong>
            <span className="student-summary-desc">
              Total tracked student devices
            </span>
          </div>
          <div className="student-summary-icon icon-blue">
            <DeviceIcon />
          </div>
        </div>

        <div className="student-summary-card summary-border-red">
          <div>
            <span className="student-summary-title">
              Switch Limit ({MAX_ACCOUNT_SWITCHES_PER_DEVICE}/
              {MAX_ACCOUNT_SWITCHES_PER_DEVICE})
            </span>
            <strong className="student-summary-number">
              {loading ? "..." : counts.limitReached}
            </strong>
            <span className="student-summary-desc">
              Devices at max account limit (3/3)
            </span>
          </div>
          <div className="student-summary-icon icon-red">
            <ShieldAlertIcon />
          </div>
        </div>
      </section>

      {errorMessage && (
        <div className="student-logs-error-banner">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="student-logs-retry-btn"
            onClick={handleRetryLoad}
          >
            Retry
          </button>
        </div>
      )}

      {/* MAIN TABLE CARD */}
      <section className="student-logs-card">
        {/* TOOLBAR */}
        <div className="student-logs-toolbar">
          <div className="student-logs-filter-tabs" role="tablist">
            <button
              type="button"
              className={
                statusFilter === "all"
                  ? "student-filter-tab active"
                  : "student-filter-tab"
              }
              onClick={() => handleFilterChange("all")}
            >
              All ({counts.total})
            </button>

            <button
              type="button"
              className={
                statusFilter === "normal"
                  ? "student-filter-tab active"
                  : "student-filter-tab"
              }
              onClick={() => handleFilterChange("normal")}
            >
              Normal ({counts.normal})
            </button>

            <button
              type="button"
              className={
                statusFilter === "switched"
                  ? "student-filter-tab active"
                  : "student-filter-tab"
              }
              onClick={() => handleFilterChange("switched")}
            >
              Switched ({counts.switched})
            </button>

            <button
              type="button"
              className={
                statusFilter === "limit_reached"
                  ? "student-filter-tab active"
                  : "student-filter-tab"
              }
              onClick={() => handleFilterChange("limit_reached")}
            >
              Limit Reached 3/3 ({counts.limitReached})
            </button>
          </div>

          <div className="student-logs-toolbar-actions">
            <div className="student-logs-limit-box">
              <label htmlFor="studentLogsFetchLimit" className="student-logs-limit-label">
                Limit:
              </label>
              <select
                id="studentLogsFetchLimit"
                className="student-logs-limit-select"
                value={fetchLimit}
                onChange={(e) => {
                  setFetchLimit(Number(e.target.value));
                  setLoading(true);
                  setCurrentPage(1);
                }}
                aria-label="Server query limit for student activity logs"
              >
                <option value="50">50 latest</option>
                <option value="100">100 latest</option>
                <option value="200">200 latest</option>
                <option value="500">500 latest</option>
                <option value="0">All records</option>
              </select>
            </div>

            <div className="student-logs-search-box">
              <span className="student-logs-search-icon">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search Student #, Updated ID, Device, or UUID..."
                aria-label="Search student activity logs"
              />
            </div>
          </div>
        </div>

        {/* CONTENT STATES */}
        {loading ? (
          <div className="student-logs-state-box">
            Loading student activity logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="student-logs-empty-box">
            <div className="student-logs-empty-icon">
              <DeviceIcon />
            </div>
            <strong>
              {logs.length === 0
                ? "No student activity logs yet"
                : "No matching student logs found"}
            </strong>
            <span>
              {logs.length === 0
                ? "Student app logins, device UUIDs, and account switch counts will appear here automatically."
                : "Try adjusting your search keywords or selected status filter."}
            </span>
          </div>
        ) : (
          <>
            <div className="student-logs-table-wrapper">
              <table className="student-logs-table">
                <thead>
                  <tr>
                    <th>Student Number</th>
                    <th>Updated Student ID (Open on Phone)</th>
                    <th>Device Name</th>
                    <th>Unique Installation ID (UUID)</th>
                    <th>Date &amp; Time</th>
                    <th className="col-center">App Opens</th>
                    <th className="col-center">Account Switches</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => {
                    const isCopied = copiedId === log.installationId;
                    const formattedDate = formatStudentLogDate(
                      log.activityDate
                    );
                    const formattedTime = formatStudentLogTime(
                      log.activityDate
                    );

                    return (
                      <tr
                        key={log.id}
                        className={
                          log.status === "limit_reached"
                            ? "row-limit-reached"
                            : ""
                        }
                      >
                        {/* 1. STUDENT NUMBER */}
                        <td>
                          <div className="student-primary-id">
                            {log.studentNumber}
                          </div>
                          <div className="student-cell-subtext">
                            Initial / Logged ID
                          </div>
                        </td>

                        {/* 2. UPDATED STUDENT ID CURRENTLY OPEN ON PHONE */}
                        <td>{renderUpdatedStudentBadge(log)}</td>

                        {/* 3. DEVICE NAME */}
                        <td>
                          <div className="student-device-name">
                            {formatDeviceNameDisplay(
                              activeDecryptedMap[log.deviceName] || log.deviceName,
                              log.fallbackDeviceName,
                              isMasterActive
                            )}
                          </div>
                          {Boolean(
                            formatOsVersionDisplay(
                              activeDecryptedMap[log.osVersion] || log.osVersion,
                              log.fallbackOsVersion,
                              isMasterActive
                            )
                          ) && (
                            <div className="student-cell-subtext">
                              {formatOsVersionDisplay(
                                activeDecryptedMap[log.osVersion] || log.osVersion,
                                log.fallbackOsVersion,
                                isMasterActive
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. UNIQUE INSTALLATION ID (UUID) */}
                        <td>
                          <div className="student-uuid-group">
                            <code
                              className={
                                log.status === "limit_reached"
                                  ? "student-uuid-chip uuid-chip-alert"
                                  : "student-uuid-chip"
                              }
                              title={log.installationId}
                            >
                              {truncateInstallationId(log.installationId)}
                            </code>

                            {log.installationId !== "—" && (
                              <button
                                type="button"
                                className={
                                  isCopied
                                    ? "student-uuid-copy-btn copied"
                                    : "student-uuid-copy-btn"
                                }
                                onClick={() =>
                                  handleCopyInstallationId(log.installationId)
                                }
                                title={
                                  isCopied
                                    ? "Copied!"
                                    : `Copy full UUID: ${log.installationId}`
                                }
                                aria-label="Copy unique installation ID"
                              >
                                {isCopied ? <CheckIcon /> : <CopyIcon />}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 5. DATE & TIME */}
                        <td className="col-nowrap">
                          <div className="student-date-primary">
                            {formattedDate}
                          </div>
                          {formattedTime && (
                            <div className="student-cell-subtext">
                              {formattedTime}
                            </div>
                          )}
                        </td>

                        {/* 6. APP OPENS */}
                        <td className="col-center">
                          <span className="student-opens-pill">
                            {log.openCount}x
                          </span>
                        </td>

                        {/* 7. ACCOUNT SWITCHES (MAX 3 PER DEVICE) */}
                        <td className="col-center">
                          <span
                            className={`student-switches-pill switch-level-${log.status}`}
                          >
                            {log.dailySwitchCount} /{" "}
                            {MAX_ACCOUNT_SWITCHES_PER_DEVICE}
                          </span>
                        </td>

                        {/* 8. SECURITY STATUS */}
                        <td className="col-nowrap">
                          {renderStatusBadge(log)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION FOOTER */}
            <div className="student-logs-footer">
              <span className="student-logs-footer-info">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filteredLogs.length)} of{" "}
                {filteredLogs.length} student activity{" "}
                {filteredLogs.length === 1 ? "record" : "records"}
              </span>

              <div className="student-logs-pagination">
                <button
                  type="button"
                  className="student-page-btn"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>

                <span className="student-page-indicator">
                  Page {safePage} of {totalPages}
                </span>

                <button
                  type="button"
                  className="student-page-btn"
                  disabled={safePage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default StudentActivityLogsPage;
