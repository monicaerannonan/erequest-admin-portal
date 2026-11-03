import {
  useCallback,
  useEffect,
  useState
} from "react";

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../../firebase/firebaseConfig.js";
import {
  encryptVaultField,
  decryptCatalogField,
  setActiveMasterCryptoKey,
  onMasterCryptoKeyChange,
  saveVaultKeyToSession
} from "../../utils/vaultCrypto.js";
import {
  getVaultConfig,
  initializeVault,
  lockVaultSession,
  resetVaultWithRecoveryKey,
  restoreVaultSession,
  unlockVaultWithPassword
} from "./vaultService.js";
import { VaultContext } from "./VaultContext.js";

export function VaultProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(auth?.currentUser ?? null);
  const [vaultConfig, setVaultConfig] = useState(null);
  const [isVaultConfigured, setIsVaultConfigured] = useState(null);
  const [vaultKey, setVaultKey] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Modal State (kept for backward compatibility, modals disabled)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("unlock");

  const isVaultUnlocked = Boolean(vaultKey);
  const isMasterActive = Boolean(vaultKey);

  // Keep React state in sync whenever loginAdmin sets or clears the active Master Key
  useEffect(() => {
    return onMasterCryptoKeyChange((nextKey) => {
      setVaultKey(nextKey || null);
    });
  }, []);

  // Load vault configuration from Firestore
  const refreshVaultConfig = useCallback(async () => {
    try {
      const cfg = await getVaultConfig();
      setVaultConfig(cfg);
      setIsVaultConfigured(Boolean(cfg && cfg.isConfigured));
      if (cfg?.saltHex) {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("erequest_vault_salt_hex", cfg.saltHex);
        }
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("erequest_vault_salt_hex", cfg.saltHex);
        }
      }
      return cfg;
    } catch (err) {
      console.warn("[VaultProvider] Refresh error:", err);
      return null;
    }
  }, []);

  // Listen to Auth state and load vault configuration seamlessly
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setIsCheckingSession(true);
        const cfg = await refreshVaultConfig();
        let activeKey = null;

        if (cfg && cfg.isConfigured) {
          // 1. Attempt session restore if key exists in session / localStorage
          activeKey = await restoreVaultSession(cfg);
          setIsModalOpen(false);
        } else {
          // 2. Vault is not configured yet -> prompt admin with "Create Master Key" setup modal
          lockVaultSession();
          setModalMode("setup");
          setIsModalOpen(true);
        }

        if (activeKey) {
          setVaultKey(activeKey);
          setActiveMasterCryptoKey(activeKey);
          await saveVaultKeyToSession(activeKey);
        } else {
          setVaultKey(null);
          setActiveMasterCryptoKey(null);
        }
        setIsCheckingSession(false);
      } else {
        setVaultKey(null);
        setActiveMasterCryptoKey(null);
        setIsModalOpen(false);
        setIsCheckingSession(false);
      }
    });

    return () => unsub();
  }, [refreshVaultConfig]);

  // Actions
  const openVaultModal = useCallback((mode = "manager") => {
    setModalMode(mode);
    setIsModalOpen(true);
  }, []);

  const closeVaultModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const setupMasterKey = useCallback(
    async (password2) => {
      const result = await initializeVault(password2);
      await refreshVaultConfig();
      setVaultKey(result.cryptoKey);
      setActiveMasterCryptoKey(result.cryptoKey);
      return result; // contains { recoveryKey, cryptoKey }
    },
    [refreshVaultConfig]
  );

  const unlockWithPassword = useCallback(
    async (password2) => {
      const cfg = vaultConfig || (await refreshVaultConfig());
      const key = await unlockVaultWithPassword(password2, cfg);
      setVaultKey(key);
      setActiveMasterCryptoKey(key);
      setIsModalOpen(false);
      return key;
    },
    [vaultConfig, refreshVaultConfig]
  );

  const unlockWithRecovery = useCallback(
    async (recoveryKey, newPassword2) => {
      const cfg = vaultConfig || (await refreshVaultConfig());
      const result = await resetVaultWithRecoveryKey(
        recoveryKey,
        newPassword2,
        cfg
      );
      await refreshVaultConfig();
      setVaultKey(result.cryptoKey);
      setActiveMasterCryptoKey(result.cryptoKey);
      return result;
    },
    [vaultConfig, refreshVaultConfig]
  );

  const lockVault = useCallback(() => {
    lockVaultSession();
    setVaultKey(null);
  }, []);

  const decryptText = useCallback(
    async (cipherText, fallback = null) => {
      return await decryptCatalogField(cipherText, fallback);
    },
    []
  );

  const encryptText = useCallback(
    async (plainText) => {
      if (!vaultKey) {
        throw new Error("Vault is locked. Cannot encrypt.");
      }
      return await encryptVaultField(plainText, vaultKey);
    },
    [vaultKey]
  );

  const value = {
    currentUser,
    vaultConfig,
    isVaultConfigured,
    isVaultUnlocked,
    isMasterActive,
    vaultKey,
    isCheckingSession,
    isModalOpen,
    modalMode,
    openVaultModal,
    closeVaultModal,
    setupMasterKey,
    unlockWithPassword,
    unlockWithRecovery,
    lockVault,
    decryptText,
    encryptText,
    refreshVaultConfig
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export default VaultProvider;
