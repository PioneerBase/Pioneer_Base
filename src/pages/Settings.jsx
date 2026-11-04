import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../store.js";
import {
  setPasscode,
  verifyPasscode,
  biometricsSupported,
  biometricsEnrolled,
  enrollBiometrics,
  disableBiometrics,
} from "../lib/auth.js";
import { getDB, metaGet } from "../db.js";
import {
  backupIsStale,
  downloadVaultBackup,
  requestPersistentStorage,
  restoreVaultFile,
  storageIsPersisted,
} from "../lib/vault.js";
import Icon from "../components/Icon.jsx";

const STORE_META = {
  projects: { label: "Projects", icon: "science" },
  entries: { label: "Logs", icon: "dynamic_feed" },
  media: { label: "Media", icon: "perm_media" },
  ideas: { label: "Ideas", icon: "lightbulb" },
  genres: { label: "Branches", icon: "account_tree" },
};

export default function Settings() {
  const navigate = useNavigate();
  const lock = useApp((s) => s.lock);
  const bumpData = useApp((s) => s.bumpData);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [msgErr, setMsgErr] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [counts, setCounts] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [persisted, setPersisted] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultMsg, setVaultMsg] = useState("");
  const [vaultMsgErr, setVaultMsgErr] = useState(false);

  useEffect(() => {
    (async () => {
      setBioSupported(biometricsSupported());
      setBioOn(await biometricsEnrolled());
      await loadStats();
    })();
  }, []);

  async function loadStats() {
    const db = await getDB();
    const stores = ["projects", "entries", "media", "ideas", "genres"];
    const entries = await Promise.all(stores.map(async (s) => [s, await db.count(s)]));
    setCounts(Object.fromEntries(entries));
    if (navigator.storage?.estimate) {
      setEstimate(await navigator.storage.estimate());
    }
    setLastBackupAt((await metaGet("lastBackupAt")) || null);
    setPersisted(await storageIsPersisted());
  }

  function flash(text, isErr = false) {
    setMsg(text);
    setMsgErr(isErr);
  }

  async function changePasscode(e) {
    e.preventDefault();
    flash("");
    if (!(await verifyPasscode(current))) return flash("Current passcode is incorrect.", true);
    if (next.length < 4) return flash("New passcode must be at least 4 characters.", true);
    await setPasscode(next);
    setCurrent("");
    setNext("");
    flash("Passcode updated.");
  }

  async function toggleBio() {
    try {
      if (bioOn) {
        await disableBiometrics();
        setBioOn(false);
      } else {
        await enrollBiometrics();
        setBioOn(true);
      }
    } catch {
      flash("Could not change fingerprint setting.", true);
    }
  }

  function humanSize(bytes) {
    if (!bytes) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(1)} ${u[i]}`;
  }

  const usagePct =
    estimate?.quota ? Math.min(100, Math.round((estimate.usage / estimate.quota) * 100)) : 0;

  return (
    <div className="space-y-5 max-w-2xl">
      <header>
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Settings</h1>
        <p className="font-body-sm text-body-sm text-text-muted mt-1">
          Security and on-device storage.
        </p>
      </header>

      {/* Security */}
      <section className="panel p-space-md">
        <h2 className="label mb-4 flex items-center gap-1.5">
          <Icon name="shield_lock" className="text-[16px] text-primary" /> Security
        </h2>
        <form onSubmit={changePasscode} className="space-y-3">
          <input
            type="password"
            className="field-mono"
            placeholder="Current passcode"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <input
            type="password"
            className="field-mono"
            placeholder="New passcode"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <button className="btn-primary" type="submit">
            <Icon name="key" className="text-[16px]" /> Update passcode
          </button>
          {msg && (
            <p
              className={`font-label-sm text-label-sm flex items-center gap-1 ${
                msgErr ? "text-status-critical" : "text-status-nominal"
              }`}
            >
              <Icon name={msgErr ? "error" : "check_circle"} className="text-[15px]" />
              {msg}
            </p>
          )}
        </form>

        {bioSupported && (
          <div className="flex items-center justify-between mt-5 pt-5 border-t border-surface-border/70">
            <span className="flex items-center gap-2 font-body-md text-body-md text-on-surface">
              <Icon name="fingerprint" className="text-[18px] text-secondary" />
              Unlock with fingerprint / device
            </span>
            <button onClick={toggleBio} className={bioOn ? "btn-primary" : "btn-ghost"}>
              {bioOn ? "Enabled" : "Enable"}
            </button>
          </div>
        )}
      </section>

      {/* Storage */}
      <section className="panel p-space-md">
        <h2 className="label mb-4 flex items-center gap-1.5">
          <Icon name="database" className="text-[16px] text-secondary" /> On-device storage
        </h2>
        {counts ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(counts).map(([k, v]) => {
              const m = STORE_META[k] || { label: k, icon: "folder" };
              return (
                <div key={k} className="panel-2 p-3">
                  <div className="flex items-center gap-1.5 font-label-sm text-label-sm text-text-muted uppercase tracking-wider">
                    <Icon name={m.icon} className="text-[14px]" /> {m.label}
                  </div>
                  <div className="font-telemetry-val text-telemetry-val text-text-primary mt-1">
                    {v}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="font-body-sm text-body-sm text-text-muted">Loading…</p>
        )}
        {estimate && (
          <div className="mt-4">
            <div className="w-full bg-surface-container-lowest rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full" style={{ width: `${usagePct}%` }} />
            </div>
            <p className="font-label-sm text-label-sm text-text-muted mt-2">
              Using {humanSize(estimate.usage)} of {humanSize(estimate.quota)} available.
            </p>
          </div>
        )}
        <p className="font-body-sm text-body-sm text-text-muted mt-3 flex items-center gap-1.5">
          <Icon name="cloud_off" className="text-[15px] text-status-nominal" />
          All data lives in this browser on this device. Nothing is uploaded.
        </p>
        <p className="font-label-sm text-label-sm text-text-muted mt-2">
          {persisted
            ? "This browser has promised not to evict the vault for disk space."
            : "Storage is not marked persistent yet — backups still matter."}
        </p>
      </section>

      <section className="panel p-space-md">
        <h2 className="label mb-3 flex items-center gap-1.5">
          <Icon name="save" className="text-[16px] text-tertiary" /> Vault backup
        </h2>
        <p className="font-body-sm text-body-sm text-text-muted">
          App updates do not move your lab. It stays in this browser, on this site address.
          A GitHub username change, a different browser, or clearing site data starts an empty
          vault. Keep a backup file somewhere safe (drive, USB, another folder).
        </p>
        {lastBackupAt ? (
          <p className={`font-label-sm text-label-sm mt-3 ${backupIsStale(lastBackupAt) ? "text-tertiary" : "text-status-nominal"}`}>
            Last backup: {new Date(lastBackupAt).toLocaleString()}
          </p>
        ) : (
          <p className="font-label-sm text-label-sm text-tertiary mt-3">No vault backup on this device yet.</p>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            className="btn-primary"
            disabled={vaultBusy}
            onClick={async () => {
              setVaultBusy(true);
              setVaultMsg("");
              try {
                await downloadVaultBackup();
                await requestPersistentStorage();
                await loadStats();
                setVaultMsgErr(false);
                setVaultMsg("Vault file saved. Keep it off this browser.");
              } catch {
                setVaultMsgErr(true);
                setVaultMsg("Could not write the vault backup.");
              } finally {
                setVaultBusy(false);
              }
            }}
          >
            <Icon name="download" className="text-[16px]" /> Download vault backup
          </button>
          <label className={`btn-ghost cursor-pointer ${vaultBusy ? "opacity-50 pointer-events-none" : ""}`}>
            <Icon name="upload" className="text-[16px]" /> Restore vault file
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              disabled={vaultBusy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const ok = window.confirm(
                  "Restore replaces every project, log, idea, and file currently in this browser with the backup. Continue?"
                );
                if (!ok) return;
                setVaultBusy(true);
                setVaultMsg("");
                try {
                  await restoreVaultFile(file);
                  await loadStats();
                  bumpData();
                  setVaultMsgErr(false);
                  setVaultMsg("Vault restored. Unlock with the passcode from that backup if prompted.");
                } catch (err) {
                  setVaultMsgErr(true);
                  setVaultMsg(err.message || "Could not restore that file.");
                } finally {
                  setVaultBusy(false);
                }
              }}
            />
          </label>
        </div>
        {vaultMsg && (
          <p
            className={`font-label-sm text-label-sm flex items-center gap-1 mt-3 ${
              vaultMsgErr ? "text-status-critical" : "text-status-nominal"
            }`}
          >
            <Icon name={vaultMsgErr ? "error" : "check_circle"} className="text-[15px]" />
            {vaultMsg}
          </p>
        )}
      </section>

      <section className="panel p-space-md">
        <h2 className="label mb-3 flex items-center gap-1.5">
          <Icon name="inventory_2" className="text-[16px] text-primary" /> Vaults & export
        </h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <Link to="/archive" className="btn-ghost justify-start">
            <Icon name="lock" className="text-[16px]" /> Archive vault
          </Link>
          <Link to="/export" className="btn-ghost justify-start">
            <Icon name="folder_zip" className="text-[16px]" /> Batch export
          </Link>
          <Link to="/search" className="btn-ghost justify-start">
            <Icon name="search" className="text-[16px]" /> Search
          </Link>
          <Link to="/genres" className="btn-ghost justify-start">
            <Icon name="account_tree" className="text-[16px]" /> Research vault
          </Link>
        </div>
      </section>

      {/* Session */}
      <section className="panel p-space-md">
        <h2 className="label mb-3 flex items-center gap-1.5">
          <Icon name="lock" className="text-[16px] text-tertiary" /> Session
        </h2>
        <button
          className="btn-ghost"
          onClick={() => {
            lock();
            navigate("/unlock", { replace: true });
          }}
        >
          <Icon name="lock" className="text-[16px]" /> Lock now
        </button>
      </section>

      <p className="text-center text-text-muted font-label-sm text-label-sm tracking-widest uppercase">
        Pioneer Base · Local-first
      </p>
    </div>
  );
}
