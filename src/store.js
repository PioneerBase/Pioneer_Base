import { create } from "zustand";
import { hasPasscode } from "./lib/auth.js";
import { requestPersistentStorage } from "./lib/vault.js";

// App-wide state. Keeps the auth gate (locked/unlocked), whether a passcode has
// been set up yet, and a counter the pages bump to force data re-reads after
// mutations.
export const useApp = create((set, get) => ({
  ready: false,
  unlocked: false,
  needsSetup: false, // no passcode configured yet -> first-run setup
  dataVersion: 0,

  async boot() {
    try {
      requestPersistentStorage();
      const configured = await hasPasscode();
      set({ ready: true, needsSetup: !configured, unlocked: false });
    } catch (e) {
      console.error("boot failed", e);
      set({ ready: true, needsSetup: false, unlocked: false });
    }
  },

  completeSetup() {
    requestPersistentStorage();
    set({ needsSetup: false, unlocked: true });
  },

  async refreshAuthGate() {
    const configured = await hasPasscode();
    set({ needsSetup: !configured, unlocked: false, dataVersion: get().dataVersion + 1 });
  },

  unlock() {
    requestPersistentStorage();
    set({ unlocked: true });
  },

  lock() {
    set({ unlocked: false });
  },

  // Pages subscribe to dataVersion so a single call refreshes their queries.
  bumpData() {
    set({ dataVersion: get().dataVersion + 1 });
  },
}));
