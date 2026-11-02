import {
  useEffect,
  useState,
  useCallback,
  useMemo
} from "react";

import {
  DEFAULT_PROFILE,
  subscribeToAdminProfile,
  updateAdminProfile,
  getAdminProfile,
  getInitials
} from "./profileService";

import { auth } from "../../firebase/firebaseConfig";
import { AdminProfileContext } from "./AdminProfileContext";

/**
 * Provides real-time synchronized admin profile state to all child components.
 * Subscribes to Firestore onSnapshot on mount and cleanly unsubscribes on unmount.
 * Cloud-First Single Source of Truth: Firestore (/admins/{uid}) without local storage caching.
 */
const PROFILE_SCHEMA_REV = 2;

export function AdminProfileProvider({ children, userId }) {
  const schemaRev = PROFILE_SCHEMA_REV;
  const [profile, setProfile] = useState(() => ({
    ...DEFAULT_PROFILE,
    email: auth?.currentUser?.email || DEFAULT_PROFILE.email
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = subscribeToAdminProfile(
      userId,
      (updatedProfile) => {
        if (!isMounted) return;
        setProfile((prev) => ({
          ...prev,
          ...updatedProfile,
          photoUrl:
            typeof updatedProfile?.photoUrl === "string"
              ? updatedProfile.photoUrl
              : prev?.photoUrl || ""
        }));
        setLoading(false);
        setIsSyncing(false);
        setLastSyncTime(new Date());
        setError(null);
      },
      (syncError) => {
        if (!isMounted) return;
        console.warn("[AdminProfileSync] Sync notice:", syncError?.message || syncError);
        setError(syncError);
        setIsSyncing(false);
        setLoading(false);
      }
    );

    getAdminProfile(userId)
      .then((latest) => {
        if (!isMounted || !latest) return;
        setProfile((prev) => ({
          ...prev,
          ...latest,
          photoUrl:
            typeof latest.photoUrl === "string"
              ? latest.photoUrl
              : prev?.photoUrl || ""
        }));
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [userId, schemaRev]);

  /**
   * Updates admin profile with immediate local optimism and Firestore real-time broadcast.
   */
  const handleUpdateProfile = useCallback(
    async (updatedFields) => {
      setIsSyncing(true);
      try {
        const result = await updateAdminProfile(updatedFields, userId);
        if (result.success && result.profile) {
          setProfile((prev) => ({
            ...prev,
            ...result.profile,
            photoUrl:
              typeof result.profile.photoUrl === "string"
                ? result.profile.photoUrl
                : prev?.photoUrl || ""
          }));
        }
        setIsSyncing(false);
        return result;
      } catch (err) {
        setIsSyncing(false);
        throw err;
      }
    },
    [userId]
  );

  /**
   * Forces a manual re-fetch if requested.
   */
  const handleRefresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      const refreshed = await getAdminProfile(userId);
      if (refreshed) {
        setProfile((prev) => ({
          ...prev,
          ...refreshed,
          photoUrl:
            typeof refreshed.photoUrl === "string"
              ? refreshed.photoUrl
              : prev?.photoUrl || ""
        }));
      }
      setIsSyncing(false);
      return refreshed;
    } catch (err) {
      setIsSyncing(false);
      throw err;
    }
  }, [userId]);

  const initials = useMemo(
    () => getInitials(profile?.name || DEFAULT_PROFILE.name),
    [profile?.name]
  );

  const contextValue = useMemo(
    () => ({
      profile,
      loading,
      error,
      isSyncing,
      lastSyncTime,
      initials,
      updateProfile: handleUpdateProfile,
      refreshProfile: handleRefresh
    }),
    [profile, loading, error, isSyncing, lastSyncTime, initials, handleUpdateProfile, handleRefresh]
  );

  return (
    <AdminProfileContext.Provider value={contextValue}>
      {children}
    </AdminProfileContext.Provider>
  );
}

export default AdminProfileProvider;
