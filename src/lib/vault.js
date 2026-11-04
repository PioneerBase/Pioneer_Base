import { dumpVaultRecords, metaSet, now, replaceVaultRecords } from "../db.js";
import { download } from "./export.js";

export const VAULT_FORMAT = "pioneer-base-vault";
export const VAULT_VERSION = 1;

const BACKUP_STALE_MS = 14 * 24 * 60 * 60 * 1000;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const comma = text.indexOf(",");
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read media."));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

async function serializeMedia(records) {
  const out = [];
  for (const rec of records || []) {
    const { blob, ...rest } = rec;
    let blobBase64 = null;
    if (blob instanceof Blob && blob.size > 0) {
      blobBase64 = await blobToBase64(blob);
    }
    out.push({
      ...rest,
      mimeType: rec.mimeType || blob?.type || "",
      size: rec.size || blob?.size || 0,
      blobBase64,
    });
  }
  return out;
}

function reviveMedia(records) {
  return (records || []).map((rec) => {
    const { blobBase64, ...rest } = rec;
    const blob = blobBase64
      ? base64ToBlob(blobBase64, rec.mimeType)
      : rec.blob instanceof Blob
        ? rec.blob
        : null;
    return { ...rest, blob };
  });
}

export function vaultFilename() {
  const day = new Date().toISOString().slice(0, 10);
  return `pioneer-base-vault-${day}.json`;
}

export async function buildVaultPayload() {
  const dump = await dumpVaultRecords();
  return {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    exportedAt: now(),
    origin: typeof location !== "undefined" ? location.origin : "",
    meta: dump.meta,
    genres: dump.genres,
    projects: dump.projects,
    entries: dump.entries,
    milestones: dump.milestones,
    reminders: dump.reminders,
    ideas: dump.ideas,
    media: await serializeMedia(dump.media),
  };
}

export async function downloadVaultBackup() {
  const payload = await buildVaultPayload();
  download(vaultFilename(), JSON.stringify(payload), "application/json");
  const stamped = now();
  await metaSet("lastBackupAt", stamped);
  return { ...payload, exportedAt: stamped };
}

export function parseVaultPayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || data.format !== VAULT_FORMAT) {
    throw new Error("This file is not a Pioneer Base vault backup.");
  }
  return data;
}

export async function restoreVaultPayload(payload) {
  const data = parseVaultPayload(payload);
  await replaceVaultRecords({
    meta: data.meta || [],
    genres: data.genres || [],
    projects: data.projects || [],
    entries: data.entries || [],
    milestones: data.milestones || [],
    reminders: data.reminders || [],
    ideas: data.ideas || [],
    media: reviveMedia(data.media),
  });
  await metaSet("lastBackupAt", now());
  return data;
}

export async function restoreVaultFile(file) {
  const text = await file.text();
  return restoreVaultPayload(text);
}

export function backupIsStale(lastBackupAt) {
  if (!lastBackupAt) return true;
  const t = new Date(lastBackupAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > BACKUP_STALE_MS;
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* browsers may deny silently */
  }
  return false;
}

export async function storageIsPersisted() {
  try {
    if (navigator.storage?.persisted) return await navigator.storage.persisted();
  } catch {
    /* ignore */
  }
  return false;
}
