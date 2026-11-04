import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects, listGenres, listEntries, listMedia, projectByteSize } from "../db.js";
import { exportBatch } from "../lib/export.js";
import { humanSize } from "../lib/media.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import Icon from "../components/Icon.jsx";
import { kindMeta, projectCode, fmtDate } from "../lib/ui.js";

export default function Export() {
  const [status, setStatus] = useState("loading");
  const [projects, setProjects] = useState([]);
  const [genres, setGenres] = useState([]);
  const [meta, setMeta] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [format, setFormat] = useState("zip");
  const [busy, setBusy] = useState(false);
  const [include, setInclude] = useState({
    includeAbstract: true,
    includeLogs: true,
    includeMilestones: true,
    includeMedia: true,
    includeAttestation: true,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setStatus("loading");
      try {
        const [p, g] = await Promise.all([listProjects(), listGenres()]);
        if (!alive) return;
        setProjects(p);
        setGenres(g);
        const map = {};
        await Promise.all(
          p.map(async (proj) => {
            const [entries, media, bytes] = await Promise.all([
              listEntries(proj.id),
              listMedia(proj.id),
              projectByteSize(proj.id),
            ]);
            map[proj.id] = { logs: entries.length, media: media.length, bytes };
          })
        );
        if (!alive) return;
        setMeta(map);
        setSelected(new Set(p.filter((x) => x.status !== "archived").map((x) => x.id)));
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const genreMap = useMemo(
    () => Object.fromEntries(genres.map((g) => [g.id, g])),
    [genres]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (scope === "active" && (p.archivedAt || p.status === "archived")) return false;
      if (scope === "archived" && !(p.archivedAt || p.status === "archived")) return false;
      if (!q) return true;
      return [p.title, p.kind, (p.tags || []).join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [projects, query, scope]);

  const selectedList = visible.filter((p) => selected.has(p.id));
  const payload = selectedList.reduce((n, p) => n + (meta[p.id]?.bytes || 0), 0);
  const pct = Math.min(100, Math.round((payload / (512 * 1024 * 1024)) * 1000) / 10);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectVisible() {
    setSelected(new Set(visible.map((p) => p.id)));
  }
  function selectActive() {
    setSelected(
      new Set(
        visible.filter((p) => !(p.archivedAt || p.status === "archived")).map((p) => p.id)
      )
    );
  }

  async function runExport() {
    if (!selectedList.length) return;
    setBusy(true);
    try {
      await exportBatch(
        selectedList.map((p) => p.id),
        format,
        include
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <LoadingBlock />;
  if (status === "error") return <ErrorState />;

  return (
    <div className="space-y-5">
      <div className="panel p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-headline-sm text-headline-sm text-text-primary uppercase tracking-tight flex items-center gap-1.5">
            <Icon name="inventory_2" className="text-[18px] text-primary" />
            Export suite // Vault dock
          </span>
          <span className="chip chip-nominal">Airgapped</span>
        </div>
        <div className="flex items-center justify-between mt-2 panel-2 px-2 py-1.5">
          <span className="font-label-sm text-label-sm text-text-muted">
            Stage buffer:{" "}
            <span className="text-primary font-telemetry-val">
              {selectedList.length}/{visible.length} selected
            </span>
          </span>
          <span className="font-label-sm text-label-sm text-secondary font-bold">
            {humanSize(payload) || "0 B"}
          </span>
        </div>
      </div>

      <div className="panel-2 p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="label flex items-center gap-1.5">
            <Icon name="sd_card" className="text-[16px] text-secondary" /> Staging allocator
          </span>
          <span className="font-label-sm text-label-sm text-primary">{pct}% of 512 MB</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
          <div className="h-full bg-primary-container" style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
            <Icon name="search" className="text-[18px]" />
          </span>
          <input
            className="field pl-10"
            placeholder="Filter project, code, or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Chip active={scope === "all"} onClick={() => setScope("all")}>
            All ({projects.length})
          </Chip>
          <Chip active={scope === "active"} onClick={() => setScope("active")}>
            Active
          </Chip>
          <Chip active={scope === "archived"} onClick={() => setScope("archived")}>
            Archived
          </Chip>
          <button className="btn-ghost !py-1 !px-2" onClick={selectVisible}>
            Select all
          </button>
          <button className="btn-ghost !py-1 !px-2" onClick={selectActive}>
            Active only
          </button>
          <button className="btn-ghost !py-1 !px-2" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="folder_off" title="Nothing to export." />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="label">Candidate dossiers</span>
            <span className="font-label-sm text-label-sm text-text-muted">Tap card to toggle</span>
          </div>
          {visible.map((p) => {
            const on = selected.has(p.id);
            const km = kindMeta(p.kind);
            const g = genreMap[p.genreId];
            const s = meta[p.id] || { logs: 0, media: 0, bytes: 0 };
            const archived = !!(p.archivedAt || p.status === "archived");
            return (
              <label
                key={p.id}
                className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                  on
                    ? "bg-surface-overlay border-primary/40"
                    : "bg-surface-container-low border-transparent opacity-85"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary h-4 w-4"
                      checked={on}
                      onChange={() => toggle(p.id)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-label-md text-label-md text-primary font-bold">
                          [{projectCode(p)}]
                        </span>
                        <span className="font-body-md text-body-md font-semibold text-text-primary truncate">
                          {p.title}
                        </span>
                      </div>
                      <span className="font-label-sm text-label-sm text-text-muted">
                        {g ? g.name : "Unfiled"} • {km.label}
                        {archived ? " • Archived" : ""}
                      </span>
                    </div>
                  </div>
                  <span className="font-telemetry-val text-label-lg text-secondary flex-shrink-0">
                    {humanSize(s.bytes) || "0 B"}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2 panel-2 px-2 py-1.5 font-label-sm text-label-sm text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <Icon name="description" className="text-[13px] text-primary" /> {s.logs} logs
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="perm_media" className="text-[13px] text-primary" /> {s.media} media
                  </span>
                  <span className="ml-auto text-text-muted">
                    {fmtDate(p.updatedAt, { month: "short", day: "numeric" })}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <div className="panel p-3 space-y-3">
        <span className="label">Bundle packaging</span>
        <label className="flex items-center justify-between panel-2 p-2.5 cursor-pointer">
          <span>
            <span className="font-body-md text-body-md font-semibold text-text-primary block">
              [ZIP] Multi-folder lab tree
            </span>
            <span className="font-label-sm text-label-sm text-text-muted">
              Markdown + JSON per project
            </span>
          </span>
          <input
            type="radio"
            name="fmt"
            className="accent-primary"
            checked={format === "zip"}
            onChange={() => setFormat("zip")}
          />
        </label>
        <label className="flex items-center justify-between panel-2 p-2.5 cursor-pointer">
          <span>
            <span className="font-body-md text-body-md font-semibold text-text-primary block">
              [MD] Unified markdown
            </span>
            <span className="font-label-sm text-label-sm text-text-muted">
              One printable lab notebook
            </span>
          </span>
          <input
            type="radio"
            name="fmt"
            className="accent-primary"
            checked={format === "md"}
            onChange={() => setFormat("md")}
          />
        </label>
        <label className="flex items-center justify-between panel-2 p-2.5 cursor-pointer">
          <span>
            <span className="font-body-md text-body-md font-semibold text-text-primary block">
              [JSON] Machine dossier
            </span>
            <span className="font-label-sm text-label-sm text-text-muted">
              Structured records, no media blobs
            </span>
          </span>
          <input
            type="radio"
            name="fmt"
            className="accent-primary"
            checked={format === "json"}
            onChange={() => setFormat("json")}
          />
        </label>
        <div className="panel-2 p-2.5 space-y-2">
          <span className="label">Payload members</span>
          {Object.entries({
            includeAbstract: "Hypothesis & project summary",
            includeLogs: "Lab logs",
            includeMilestones: "Timeline / milestones",
            includeMedia: "Media index",
            includeAttestation: "Attestation",
          }).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 font-body-sm text-body-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={include[k]}
                onChange={(e) => setInclude((s) => ({ ...s, [k]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <button
        className="btn-primary w-full !py-3"
        disabled={!selectedList.length || busy}
        onClick={runExport}
      >
        <Icon name="download" className="text-[20px]" />
        {busy
          ? "Packing…"
          : `Export batch (${selectedList.length} • ${humanSize(payload) || "0 B"})`}
      </button>
      <p className="text-center font-label-sm text-label-sm text-text-muted">
        For a fillable PDF of one experiment, open the project and use Lab PDF.
        For a full lab backup that survives a new site address, use{" "}
        <Link to="/settings" className="text-primary hover:underline">
          Settings → Download vault backup
        </Link>
        .
      </p>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded font-label-sm text-label-sm whitespace-nowrap shrink-0 ${
        active ? "bg-surface-container-high text-primary" : "bg-surface-panel text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function LoadingBlock() {
  return (
    <div className="py-20 flex flex-col items-center gap-3 text-text-muted">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      <span className="font-label-md text-label-md tracking-widest uppercase">Loading…</span>
    </div>
  );
}
