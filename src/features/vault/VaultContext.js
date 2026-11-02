import { createContext, useContext } from "react";

export const VaultContext = createContext(null);

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within a VaultProvider.");
  }
  return context;
}

export default VaultContext;
