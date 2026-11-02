import { useEffect, useState } from "react";
import {
  Navigate,
  Outlet
} from "react-router-dom";

import {
  onAuthStateChanged
} from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";

import {
  auth,
  db
} from "../../firebase/firebaseConfig";

import {
  DEFAULT_ADMIN_EMAIL,
  AUTHORIZED_ADMIN_EMAILS
} from "./authService";

import { AdminProfileProvider } from "../profile/AdminProfileProvider";
import VaultModal from "../vault/VaultModal";


// Only a REAL Firebase Auth session is accepted. A locally-stored/fake session would pass this
// guard but Firestore rules would deny every read, leaving the portal empty.
function getStoredLocalAuth() {
  return null;
}


function ProtectedRoute() {

  const effectiveUser = auth.currentUser || getStoredLocalAuth();
  const currentEmail = (effectiveUser?.email || "").toLowerCase();
  const initialIsDesignated = Boolean(
    effectiveUser &&
      (currentEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
        AUTHORIZED_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === currentEmail))
  );

  const [loading, setLoading] = useState(!initialIsDesignated);
  const [isAuthorized, setIsAuthorized] = useState(initialIsDesignated);


  useEffect(() => {

    let isMounted = true;


    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {

        if (!isMounted) {
          return;
        }

        const activeUser = user || getStoredLocalAuth();

        if (!activeUser) {

          setIsAuthorized(false);
          setLoading(false);

          return;
        }

        const userEmail = (activeUser.email || "").toLowerCase();
        const isDesignatedAdmin =
          userEmail === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
          AUTHORIZED_ADMIN_EMAILS.some((adm) => adm.toLowerCase() === userEmail);

        try {

          const adminRef = doc(
            db,
            "admins",
            activeUser.uid
          );


          const adminSnapshot =
            await getDoc(adminRef);


          if (!isMounted) {
            return;
          }


          const authorized =
            (adminSnapshot.exists() &&
              adminSnapshot.data().role === "admin") ||
            isDesignatedAdmin;


          setIsAuthorized(authorized);


        } catch (error) {

          console.warn(
            "Admin authorization check note:",
            error?.message || error
          );


          if (isMounted) {
            setIsAuthorized(isDesignatedAdmin);
          }


        } finally {

          if (isMounted) {
            setLoading(false);
          }

        }

      }
    );


    const handlePageShow = (event) => {
      if (event.persisted && !auth.currentUser && !getStoredLocalAuth()) {
        setIsAuthorized(false);
        setLoading(false);
      }
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {

      isMounted = false;

      unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);

    };

  }, []);


  if (loading) {

    return (
      <div className="admin-splash-screen">
        <div className="admin-splash-logo-container">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="E-ReQuest Logo"
            className="admin-splash-logo-img"
          />
        </div>
        <div className="admin-splash-text">
          Checking administrator access...
        </div>
      </div>
    );

  }


  if (!isAuthorized) {

    return (
      <Navigate
        to="/login"
        replace
      />
    );

  }


  return (
    <AdminProfileProvider userId={auth.currentUser?.uid || effectiveUser?.uid}>
      <VaultModal />
      <Outlet />
    </AdminProfileProvider>
  );

}


export default ProtectedRoute;