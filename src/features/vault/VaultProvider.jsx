import {
  useCallback,
  useEffect,
  useState
} from "react";

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../../firebase/firebaseConfig.js";
import {
  decryptVaultField,
  encryptVaultField
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("unlock"); // 'setup' | 'unlock' | 'recovery' | 'manager'

  const isVaultUnlocked = Boolean(vaultKey);

  // Load vault configuration from Firestore
  const refreshVaultConfig = useCallback(async () => {
    try {
      const cfg = await getVaultConfig();
      setVaultConfig(cfg);
      setIsVaultConfigured(Boolean(cfg && cfg.isConfigured));
      return cfg;
    } catch (err) {
      console.warn("[VaultProvider] Refresh error:", err);
      return null;
    }
  }, []);

  // Listen to Auth state and load vault configuration
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setIsCheckingSession(true);
        const cfg = await refreshVaultConfig();
        if (cfg && cfg.isConfigured) {
          // Attempt session restore
          const cachedKey = await restoreVaultSession(cfg);
          if (cachedKey) {
            setVaultKey(cachedKey);
          } else {
            // Vault is configured but locked -> open unlock modal
            setModalMode("unlock");
            setIsModalOpen(true);
          }
        } else {
          // Not configured -> open setup modal
          setModalMode("setup");
          setIsModalOpen(true);
        }
        setIsCheckingSession(false);
      } else {
        setVaultKey(null);
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
      return result; // contains { recoveryKey, cryptoKey }
    },
    [refreshVaultConfig]
  );

  const unlockWithPassword = useCallback(
    async (password2) => {
      const cfg = vaultConfig || (await refreshVaultConfig());
      const key = await unlockVaultWithPassword(password2, cfg);
      setVaultKey(key);
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
      return await decryptVaultField(cipherText, vaultKey, fallback);
    },
    [vaultKey]
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
