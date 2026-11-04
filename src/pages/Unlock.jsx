import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store.js";
import {
  setPasscode,
  verifyPasscode,
  enrollBiometrics,
  biometricsSupported,
  biometricsEnrolled,
  unlockWithBiometrics,
} from "../lib/auth.js";
import { restoreVaultFile } from "../lib/vault.js";
import Icon from "../components/Icon.jsx";

export default function Unlock() {
  const navigate = useNavigate();
  const { ready, needsSetup, unlock, completeSetup, refreshAuthGate } = useApp();
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioOffer, setBioOffer] = useState(false);
  const [hasBio, setHasBio] = useState(false);
  const [restored, setRestored] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [needsSetup]);

  useEffect(() => {
    (async () => {
      setBioOffer(biometricsSupported());
      setHasBio(await biometricsEnrolled());
    })();
  }, [needsSetup, restored]);

  // Auto-try fingerprint on arrival if it's set up.
  useEffect(() => {
    if (ready && !needsSetup && hasBio) {
      tryBiometrics().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, needsSetup, hasBio]);

  async function handleSetup(e) {
    e.preventDefault();
    setError("");
    if (code.length < 4) return setError("Use at least 4 characters.");
    if (code !== confirm) return setError("Passcodes do not match.");
    setBusy(true);
    try {
      await setPasscode(code);
      if (bioOffer) {
        const wantBio = window.confirm(
          "Passcode set. Enable fingerprint / device unlock too?"
        );
        if (wantBio) {
          try {
            await enrollBiometrics();
          } catch {
            /* user can enable later in Settings */
          }
        }
      }
      completeSetup();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Could not set passcode.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (await verifyPasscode(code)) {
        unlock();
        navigate("/", { replace: true });
      } else {
        setError("Incorrect passcode.");
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function tryBiometrics() {
    setError("");
    try {
      if (await unlockWithBiometrics()) {
        unlock();
        navigate("/", { replace: true });
      }
    } catch {
      setError("Fingerprint unlock was cancelled or failed.");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm panel p-8 fade-in">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-14 w-14 rounded-xl grid place-items-center bg-primary/10 text-primary border border-primary/30">
            <Icon name="science" className="text-[30px]" />
          </div>
          <h1 className="font-headline-md text-headline-md tracking-[0.2em] text-text-primary">
            PIONEER BASE
          </h1>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-status-nominal animate-pulse" />
            <p className="font-label-sm text-label-sm text-text-muted uppercase tracking-wider">
              {needsSetup ? "Create your passcode" : "Welcome back"}
            </p>
          </div>
        </div>

        <form onSubmit={needsSetup ? handleSetup : handleUnlock} className="space-y-3">
          <input
            ref={inputRef}
            type="password"
            inputMode="text"
            autoComplete={needsSetup ? "new-password" : "current-password"}
            placeholder="Passcode"
            className="field-mono text-center tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {needsSetup && (
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm passcode"
              className="field-mono text-center tracking-[0.3em]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}

          {error && (
            <p className="text-status-critical font-label-sm text-label-sm text-center flex items-center justify-center gap-1">
              <Icon name="error" className="text-[15px]" />
              {error}
            </p>
          )}
          {restored && !error && (
            <p className="text-status-nominal font-label-sm text-label-sm text-center flex items-center justify-center gap-1">
              <Icon name="check_circle" className="text-[15px]" />
              Vault restored. {needsSetup ? "Create a passcode to open it." : "Unlock with that lab's passcode."}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            <Icon name={needsSetup ? "lock" : "lock_open"} className="text-[18px]" />
            {needsSetup ? "Create passcode" : "Unlock"}
          </button>
        </form>

        {!needsSetup && hasBio && (
          <button
            onClick={tryBiometrics}
            className="btn-ghost w-full mt-3"
            disabled={busy}
          >
            <Icon name="fingerprint" className="text-[18px]" /> Use fingerprint
          </button>
        )}

        <label className={`btn-ghost w-full mt-3 cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          <Icon name="upload" className="text-[18px]" /> Restore vault backup
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError("");
              setBusy(true);
              try {
                await restoreVaultFile(file);
                await refreshAuthGate();
                setRestored(true);
                setCode("");
                setConfirm("");
              } catch (err) {
                setError(err.message || "Could not restore that vault file.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>

        <p className="text-center text-text-muted font-body-sm text-body-sm mt-6">
          Everything stays on this device. App updates do not copy your lab to a new
          address — keep a vault backup in Settings.
        </p>
      </div>
    </div>
  );
}
