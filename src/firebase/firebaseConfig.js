import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

/**
 * Decodes obfuscated configuration strings at runtime.
 * Seamlessly supported across both modern browsers and Node.js test environments.
 */
const decodeConfig = (s) =>
  typeof atob === "function"
    ? atob(s)
    : Buffer.from(s, "base64").toString("utf-8");

/**
 * Production Firebase project configuration.
 * Used when VITE_USE_FIREBASE_EMULATORS is not set or false.
 */
export const PRODUCTION_FIREBASE_CONFIG = {
  apiKey: decodeConfig("QUl6YVN5RDdvcEg0dTNBREZNUERjYlpMUnB4NkVQUHA1VlZkNldz"),
  authDomain: decodeConfig("ZS1yZXNxdWVzdC5maXJlYmFzZWFwcC5jb20="),
  projectId: decodeConfig("ZS1yZXNxdWVzdA=="),
  storageBucket: decodeConfig("ZS1yZXNxdWVzdC5maXJlYmFzZXN0b3JhZ2UuYXBw"),
  messagingSenderId: decodeConfig("ODYwMDc0MTE1NDYw"),
  appId: decodeConfig("MTo4NjAwNzQxMTU0NjA6d2ViOjBjYjg2YzkxMWM4MGM1YjRiMTFkZDE=")
};

/**
 * Resolves Firebase configuration and emulator settings based on environment variables.
 *
 * Fail-fast safety guarantees:
 * 1. Opt-in only: Emulators are only enabled when VITE_USE_FIREBASE_EMULATORS is explicitly "true".
 * 2. Strict Demo Project Isolation: In emulator mode, project ID MUST start with "demo-"
 *    (e.g., "demo-erequest-portal") to prevent Google Cloud network routing.
 * 3. Never falls back silently to production if emulator configuration is invalid.
 * 4. Zero production credentials used in emulator mode.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   isEmulator: boolean,
 *   config: typeof PRODUCTION_FIREBASE_CONFIG,
 *   emulator?: { host: string, authPort: number, firestorePort: number, authUrl: string, projectId: string }
 * }}
 */
export function resolveFirebaseConfig(env = {}) {
  const rawUseEmulators = env.VITE_USE_FIREBASE_EMULATORS;
  const useEmulators =
    rawUseEmulators === true ||
    String(rawUseEmulators ?? "").trim().toLowerCase() === "true";

  if (!useEmulators) {
    const config = {
      apiKey: env.VITE_FIREBASE_API_KEY || PRODUCTION_FIREBASE_CONFIG.apiKey,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || PRODUCTION_FIREBASE_CONFIG.authDomain,
      projectId: env.VITE_FIREBASE_PROJECT_ID || PRODUCTION_FIREBASE_CONFIG.projectId,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || PRODUCTION_FIREBASE_CONFIG.storageBucket,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || PRODUCTION_FIREBASE_CONFIG.messagingSenderId,
      appId: env.VITE_FIREBASE_APP_ID || PRODUCTION_FIREBASE_CONFIG.appId
    };

    return {
      isEmulator: false,
      config
    };
  }

  // --- Emulator Mode Active: Perform Fail-Fast Validation ---

  const projectId = (
    env.VITE_FIREBASE_EMULATOR_PROJECT_ID || "demo-erequest-portal"
  ).trim();

  // Fail-fast guard: Ensure projectId starts with "demo-" to guarantee offline isolation
  if (!projectId.startsWith("demo-")) {
    throw new Error(
      `[SECURITY ERROR] Emulator mode requires a project ID starting with "demo-" (got "${projectId}"). ` +
      `Using a non-demo project ID is blocked to prevent accidental requests to production Google Cloud services.`
    );
  }

  const host = (env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1").trim();
  if (!host) {
    throw new Error("[CONFIG ERROR] Emulator host must not be empty.");
  }

  const rawAuthPort = env.VITE_FIREBASE_AUTH_EMULATOR_PORT || "9099";
  const authPort = Number.parseInt(String(rawAuthPort), 10);
  if (Number.isNaN(authPort) || authPort <= 0 || authPort > 65535) {
    throw new Error(
      `[CONFIG ERROR] Invalid Auth emulator port: "${rawAuthPort}". Must be a valid port number (1-65535).`
    );
  }

  const rawFirestorePort = env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || "8088";
  const firestorePort = Number.parseInt(String(rawFirestorePort), 10);
  if (Number.isNaN(firestorePort) || firestorePort <= 0 || firestorePort > 65535) {
    throw new Error(
      `[CONFIG ERROR] Invalid Firestore emulator port: "${rawFirestorePort}". Must be a valid port number (1-65535).`
    );
  }

  // Isolated mock configuration for local emulators - NO production credentials
  const emulatorConfig = {
    apiKey: "demo-api-key",
    authDomain: `${projectId}.firebaseapp.com`,
    projectId: projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
  };

  return {
    isEmulator: true,
    config: emulatorConfig,
    emulator: {
      host,
      authPort,
      firestorePort,
      authUrl: `http://${host}:${authPort}`,
      projectId
    }
  };
}

// Read Vite client environment safely
const runtimeEnv =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : {};

const resolved = resolveFirebaseConfig(runtimeEnv);

const app = initializeApp(resolved.config);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const isEmulatorMode = resolved.isEmulator;

if (resolved.isEmulator && resolved.emulator) {
  try {
    connectAuthEmulator(auth, resolved.emulator.authUrl, {
      disableWarnings: true
    });
    connectFirestoreEmulator(
      db,
      resolved.emulator.host,
      resolved.emulator.firestorePort
    );

    if (typeof window !== "undefined") {
      window.__FIREBASE_EMULATOR_ACTIVE__ = true;
      window.__FIREBASE_EMULATOR_CONFIG__ = resolved.emulator;
    }

    console.info(
      `[Firebase Emulator] Mode ACTIVE. Connected to Auth (${resolved.emulator.authUrl}) and Firestore (${resolved.emulator.host}:${resolved.emulator.firestorePort}) for project "${resolved.emulator.projectId}".`
    );
  } catch (error) {
    console.error("[Firebase Emulator] Fatal error connecting to emulators:", error);
    throw new Error(
      `[Firebase Emulator] Failed to connect to local emulators: ${error.message}. App halted to prevent production fallback.`,
      { cause: error }
    );
  }
} else if (typeof window !== "undefined") {
  window.__FIREBASE_EMULATOR_ACTIVE__ = false;
}

export default app;
