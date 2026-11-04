import { openDB } from "idb";

const DB_NAME = "pioneer_base";
const DB_VERSION = 1;

// Simple unique id generator (avoids extra deps; crypto.randomUUID is local).
export const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const now = () => new Date().toISOString();

export const isArchived = (p) => !!(p && (p.archivedAt || p.status === "archived"));

let _dbPromise = null;

export function getDB() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta"); // key/value: auth, flags
        }
        if (!db.objectStoreNames.contains("genres")) {
          const s = db.createObjectStore("genres", { keyPath: "id" });
          s.createIndex("name", "name");
        }
        if (!db.objectStoreNames.contains("projects")) {
          const s = db.createObjectStore("projects", { keyPath: "id" });
          s.createIndex("genreId", "genreId");
          s.createIndex("isPrimary", "isPrimary");
          s.createIndex("lastOpenedAt", "lastOpenedAt");
        }
        if (!db.objectStoreNames.contains("entries")) {
          const s = db.createObjectStore("entries", { keyPath: "id" });
          s.createIndex("projectId", "projectId");
          s.createIndex("date", "date");
        }
        if (!db.objectStoreNames.contains("media")) {
          const s = db.createObjectStore("media", { keyPath: "id" });
          s.createIndex("projectId", "projectId");
        }
        if (!db.objectStoreNames.contains("milestones")) {
          const s = db.createObjectStore("milestones", { keyPath: "id" });
          s.createIndex("projectId", "projectId");
          s.createIndex("date", "date");
        }
        if (!db.objectStoreNames.contains("reminders")) {
          const s = db.createObjectStore("reminders", { keyPath: "id" });
          s.createIndex("projectId", "projectId");
          s.createIndex("dueAt", "dueAt");
        }
        if (!db.objectStoreNames.contains("ideas")) {
          const s = db.createObjectStore("ideas", {
            keyPath: "number",
            autoIncrement: true,
          });
          s.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return _dbPromise;
}

/* ------------------------------------------------------------------ */
/* meta (key/value)                                                    */
/* ------------------------------------------------------------------ */
export async function metaGet(key) {
  return (await getDB()).get("meta", key);
}
export async function metaSet(key, value) {
  return (await getDB()).put("meta", value, key);
}

/* ------------------------------------------------------------------ */
/* genres                                                              */
/* ------------------------------------------------------------------ */
export async function listGenres() {
  const all = await (await getDB()).getAll("genres");
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
export async function getGenre(id) {
  return (await getDB()).get("genres", id);
}
export async function saveGenre(genre) {
  const db = await getDB();
  const record = {
    id: genre.id || uid(),
    name: genre.name?.trim() || "Untitled",
    color: genre.color || "#00b0be",
    tags: genre.tags || [],
    createdAt: genre.createdAt || now(),
  };
  await db.put("genres", record);
  return record;
}
export async function deleteGenre(id) {
  const db = await getDB();
  // Detach projects from a removed genre rather than orphaning them.
  const projects = await db.getAllFromIndex("projects", "genreId", id);
  const tx = db.transaction(["genres", "projects"], "readwrite");
  await tx.objectStore("genres").delete(id);
  for (const p of projects) {
    await tx.objectStore("projects").put({ ...p, genreId: null });
  }
  await tx.done;
}

/* ------------------------------------------------------------------ */
/* projects                                                            */
/* ------------------------------------------------------------------ */
export async function listProjects() {
  return (await getDB()).getAll("projects");
}
export async function listActiveProjects() {
  return (await listProjects()).filter((p) => !isArchived(p));
}
export async function listArchivedProjects() {
  return (await listProjects())
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt || b.updatedAt || "").localeCompare(a.archivedAt || a.updatedAt || ""));
}
export async function listProjectsByGenre(genreId) {
  const all = await (await getDB()).getAllFromIndex("projects", "genreId", genreId);
  return all.filter((p) => !isArchived(p));
}
export async function getProject(id) {
  return (await getDB()).get("projects", id);
}
export async function getPrimaryProject() {
  const all = await listActiveProjects();
  return all.find((p) => p.isPrimary) || null;
}
export async function saveProject(project) {
  const db = await getDB();
  const existing = project.id ? await db.get("projects", project.id) : null;
  const record = {
    ...(existing || {}),
    id: project.id || existing?.id || uid(),
    genreId: project.genreId !== undefined ? project.genreId : existing?.genreId ?? null,
    title: project.title?.trim() || existing?.title || "Untitled project",
    kind: project.kind || existing?.kind || "project",
    overview: project.overview !== undefined ? project.overview : existing?.overview ?? "",
    status: project.status || existing?.status || "active",
    isPrimary: project.isPrimary ?? existing?.isPrimary ?? false,
    tags: project.tags !== undefined ? project.tags : existing?.tags ?? [],
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
    lastOpenedAt: project.lastOpenedAt !== undefined ? project.lastOpenedAt : existing?.lastOpenedAt ?? null,
    archivedAt: project.archivedAt !== undefined ? project.archivedAt : existing?.archivedAt ?? null,
    report: project.report !== undefined ? project.report : existing?.report ?? null,
  };
  await db.put("projects", record);
  return record;
}
export async function archiveProject(id) {
  const p = await getProject(id);
  if (!p) return null;
  return saveProject({
    ...p,
    status: "archived",
    isPrimary: false,
    archivedAt: p.archivedAt || now(),
  });
}
export async function reopenProject(id) {
  const p = await getProject(id);
  if (!p) return null;
  return saveProject({
    ...p,
    status: "active",
    archivedAt: null,
  });
}
export async function setPrimaryProject(id) {
  const db = await getDB();
  const all = await db.getAll("projects");
  const tx = db.transaction("projects", "readwrite");
  for (const p of all) {
    const shouldBe = p.id === id;
    if (p.isPrimary !== shouldBe) {
      await tx.store.put({ ...p, isPrimary: shouldBe, updatedAt: now() });
    }
  }
  await tx.done;
}
export async function touchProject(id) {
  const db = await getDB();
  const p = await db.get("projects", id);
  if (p) await db.put("projects", { ...p, lastOpenedAt: now() });
}
export async function getLastOpenedProject() {
  const all = await listActiveProjects();
  const opened = all
    .filter((p) => p.lastOpenedAt)
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  return opened[0] || null;
}
export async function deleteProject(id) {
  const db = await getDB();
  const tx = db.transaction(
    ["projects", "entries", "media", "milestones", "reminders"],
    "readwrite"
  );
  await tx.objectStore("projects").delete(id);
  for (const store of ["entries", "media", "milestones", "reminders"]) {
    const idx = tx.objectStore(store).index("projectId");
    let cursor = await idx.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

/* ------------------------------------------------------------------ */
/* entries (logs)                                                      */
/* ------------------------------------------------------------------ */
export async function listEntries(projectId) {
  const all = await (await getDB()).getAllFromIndex(
    "entries",
    "projectId",
    projectId
  );
  return all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
export async function saveEntry(entry) {
  const db = await getDB();
  const existing = entry.id ? await db.get("entries", entry.id) : null;
  const record = {
    id: entry.id || uid(),
    projectId: entry.projectId,
    kind: entry.kind || "note",
    title: entry.title?.trim() || existing?.title || "",
    body: entry.body ?? existing?.body ?? "",
    mediaId: entry.mediaId ?? existing?.mediaId ?? null,
    date: entry.date || existing?.date || now(),
    createdAt: existing?.createdAt || now(),
  };
  await db.put("entries", record);
  return record;
}
export async function recentEntries(limit = 6) {
  const all = await (await getDB()).getAll("entries");
  return all
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
}
export async function deleteEntry(id) {
  const db = await getDB();
  const entry = await db.get("entries", id);
  const tx = db.transaction(["entries", "media"], "readwrite");
  await tx.objectStore("entries").delete(id);
  if (entry?.mediaId) await tx.objectStore("media").delete(entry.mediaId);
  await tx.done;
}

/* ------------------------------------------------------------------ */
/* media (blobs)                                                       */
/* ------------------------------------------------------------------ */
export async function saveMedia({ projectId, blob, mimeType, filename }) {
  const db = await getDB();
  const record = {
    id: uid(),
    projectId,
    blob,
    mimeType,
    filename: filename || "",
    size: blob?.size || 0,
    createdAt: now(),
  };
  await db.put("media", record);
  return record;
}
export async function getMedia(id) {
  if (!id) return null;
  return (await getDB()).get("media", id);
}
export async function listMedia(projectId) {
  return (await getDB()).getAllFromIndex("media", "projectId", projectId);
}
export async function projectByteSize(projectId) {
  const media = await listMedia(projectId);
  return media.reduce((n, m) => n + (m.size || 0), 0);
}

/* ------------------------------------------------------------------ */
/* milestones (timeline)                                               */
/* ------------------------------------------------------------------ */
export async function listMilestones(projectId) {
  const all = await (await getDB()).getAllFromIndex(
    "milestones",
    "projectId",
    projectId
  );
  return all.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}
export async function saveMilestone(m) {
  const db = await getDB();
  const existing = m.id ? await db.get("milestones", m.id) : null;
  const record = {
    id: m.id || uid(),
    projectId: m.projectId,
    title: m.title?.trim() || existing?.title || "Milestone",
    date: m.date || existing?.date || now(),
    done: m.done ?? existing?.done ?? false,
    createdAt: existing?.createdAt || now(),
  };
  await db.put("milestones", record);
  return record;
}
export async function deleteMilestone(id) {
  return (await getDB()).delete("milestones", id);
}

/* ------------------------------------------------------------------ */
/* reminders                                                           */
/* ------------------------------------------------------------------ */
export async function listReminders(projectId) {
  const all = await (await getDB()).getAllFromIndex(
    "reminders",
    "projectId",
    projectId
  );
  return all.sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
}
export async function saveReminder(r) {
  const db = await getDB();
  const existing = r.id ? await db.get("reminders", r.id) : null;
  const record = {
    id: r.id || uid(),
    projectId: r.projectId,
    text: r.text?.trim() || existing?.text || "Reminder",
    dueAt: r.dueAt || existing?.dueAt || now(),
    done: r.done ?? existing?.done ?? false,
    createdAt: existing?.createdAt || now(),
  };
  await db.put("reminders", record);
  return record;
}
export async function deleteReminder(id) {
  return (await getDB()).delete("reminders", id);
}

/* ------------------------------------------------------------------ */
/* ideas (numbered vault)                                              */
/* ------------------------------------------------------------------ */
export async function listIdeas() {
  const all = await (await getDB()).getAll("ideas");
  return all.sort((a, b) => b.number - a.number);
}
export async function addIdea({
  text,
  source = "text",
  linkedProjectId = null,
  tags = [],
}) {
  const db = await getDB();
  const record = {
    text: text?.trim() || "",
    source,
    linkedProjectId,
    tags: tags || [],
    createdAt: now(),
  };
  const number = await db.add("ideas", record);
  return { ...record, number };
}
export async function updateIdea(idea) {
  return (await getDB()).put("ideas", idea);
}
export async function deleteIdea(number) {
  return (await getDB()).delete("ideas", number);
}

/* ------------------------------------------------------------------ */
/* full-vault dump / replace (portable backup, origin-independent)     */
/* ------------------------------------------------------------------ */
const VAULT_STORES = [
  "meta",
  "genres",
  "projects",
  "entries",
  "media",
  "milestones",
  "reminders",
  "ideas",
];

export async function dumpVaultRecords() {
  const db = await getDB();
  const dump = {};
  const metaItems = [];
  let cursor = await db.transaction("meta").store.openCursor();
  while (cursor) {
    metaItems.push({ key: cursor.key, value: cursor.value });
    cursor = await cursor.continue();
  }
  dump.meta = metaItems;
  for (const name of VAULT_STORES) {
    if (name === "meta") continue;
    dump[name] = db.objectStoreNames.contains(name) ? await db.getAll(name) : [];
  }
  return dump;
}

export async function replaceVaultRecords(dump) {
  const db = await getDB();
  const names = VAULT_STORES.filter((n) => db.objectStoreNames.contains(n));
  const tx = db.transaction(names, "readwrite");
  for (const name of names) {
    await tx.objectStore(name).clear();
  }
  for (const item of dump.meta || []) {
    await tx.objectStore("meta").put(item.value, item.key);
  }
  for (const name of names) {
    if (name === "meta") continue;
    for (const rec of dump[name] || []) {
      await tx.objectStore(name).put(rec);
    }
  }
  await tx.done;
}

/* ------------------------------------------------------------------ */
/* search (keyword across projects, entries, ideas)                    */
/* ------------------------------------------------------------------ */
export async function search(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return { projects: [], entries: [], ideas: [] };

  const [projects, entriesAll, ideas, genres] = await Promise.all([
    listProjects(),
    (await getDB()).getAll("entries"),
    listIdeas(),
    listGenres(),
  ]);
  const genreName = (id) => genres.find((g) => g.id === id)?.name || "";

  const match = (...fields) =>
    fields
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);

  return {
    projects: projects.filter((p) =>
      match(p.title, p.overview, p.kind, genreName(p.genreId), (p.tags || []).join(" "))
    ),
    entries: entriesAll.filter((e) => match(e.title, e.body, e.kind)),
    ideas: ideas.filter((i) => match(i.text)),
  };
}
