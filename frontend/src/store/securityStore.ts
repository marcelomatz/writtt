import { create } from 'zustand';

/**
 * Client-side mirror of the two independent security states:
 *
 * - `vaultUnlocked`: true when UnlockVault()/UnlockVaultWithPIN() has been
 *   called and the activePassword is stored in the backend.
 * - `vaultPINEnabled`: mirrors SecurityConfigDTO.vault_pin_enabled.
 *
 * Note: app-level locked state (LockScreen) lives directly in App.tsx
 * as `locked` so it controls the very first render gate.
 */
interface SecurityState {
  vaultUnlocked: boolean;
  vaultPINEnabled: boolean;
  setVaultUnlocked: (v: boolean) => void;
  setVaultPINEnabled: (v: boolean) => void;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  vaultUnlocked: false,
  vaultPINEnabled: false,
  setVaultUnlocked: (v) => set({ vaultUnlocked: v }),
  setVaultPINEnabled: (v) => set({ vaultPINEnabled: v }),
}));
