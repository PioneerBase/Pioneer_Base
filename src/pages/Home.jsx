import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getPrimaryProject,
  getLastOpenedProject,
  listGenres,
  listActiveProjects,
  listProjectsByGenre,
  listMilestones,
  listEntries,
  recentEntries,
  getGenre,
  metaGet,
} from "../db.js";
import { useApp } from "../store.js";
import { seedIfNeeded } from "../lib/seed.js";
import { backupIsStale, downloadVaultBackup } from "../lib/vault.js";
import ProjectCard from "../components/ProjectCard.jsx";
import Timeline from "../components/Timeline.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import Modal from "../components/Modal.jsx";
import ProjectForm from "../components/ProjectForm.jsx";
import Icon from "../components/Icon.jsx";
import {
  kindMeta,
  accent,
  statusMeta,
  projectCode,
  progressPct,
  entryMeta,
  fmtDate,
} from "../lib/ui.js";

export default function Home() {
  const navigate = useNavigate();
  const { dataVersion, bumpData } = useApp();
  const [status, setStatus] = useState("loading");
  const [primary, setPrimary] = useState(null);
  const [primaryGenre, setPrimaryGenre] = useState(null);
  const [primaryMilestones, setPrimaryMilestones] = useState([]);
  const [primaryHypothesis, setPrimaryHypothesis] = useState(null);
  const [lastOpened, setLastOpened] = useState(null);
  const [genres, setGenres] = useState([]);
  const [projects, setProjects] = useState([]);
  const [recent, setRecent] = useState([]);
  const [projMap, setProjMap] = useState({});
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStatus("loading");
      try {
        const [p, last, g, all, rec] = await Promise.all([
          getPrimaryProject(),
          getLastOpenedProject(),
          listGenres(),
          listActiveProjects(),
          recentEntries(6),
        ]);
        if (!alive) return;
        setPrimary(p);
        setLastOpened(last);
        setGenres(g);
        setProjects(all);
        setRecent(rec);
        setProjMap(Object.fromEntries(all.map((x) => [x.id, x])));
        setLastBackupAt((await metaGet("lastBackupAt")) || null);
        if (p) {
          const [pg, ms, entries] = await Promise.all([
            p.genreId ? getGenre(p.genreId) : null,
            listMilestones(p.id),
            listEntries(p.id),
          ]);
          if (!alive) return;
          setPrimaryGenre(pg);
          setPrimaryMilestones(ms);
          setPrimaryHypothesis(entries.find((e) => e.kind === "hypothesis") || null);
        } else {
          setPrimaryGenre(null);
          setPrimaryMilestones([]);
          setPrimaryHypothesis(null);
        }
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  function runSearch(e) {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  if (status === "loading")
    return <LoadingBlock />;
  if (status === "error") return <ErrorState onRetry={bumpData} />;

  const hasAnything = projects.length > 0 || genres.length > 0;
  const activeCount = projects.filter((p) => (p.status || "active") === "active").length;

  const stats = [
    { label: "Inventions", value: projects.length, icon: "science", color: "primary" },
    { label: "Branches", value: genres.length, icon: "account_tree", color: "secondary" },
    { label: "Active", value: activeCount, icon: "bolt", color: "status-nominal" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="label text-primary">Welcome back, Pioneer</p>
          <h1 className="font-headline-lg text-headline-lg text-text-primary mt-1">Dashboard</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="add" className="text-[18px]" /> New
        </button>
      </header>

      {hasAnything && backupIsStale(lastBackupAt) && (
        <div className="panel p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-tertiary/40">
          <div className="min-w-0 flex-1">
            <p className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider flex items-center gap-1.5">
              <Icon name="save" className="text-[16px]" /> Vault backup
            </p>
            <p className="font-body-sm text-body-sm text-text-muted mt-1">
              This lab lives only in this browser. Download a vault file so an update, a new
              site address, or cleared site data cannot take the work with it.
            </p>
          </div>
          <button
            className="btn-primary flex-shrink-0"
            disabled={backupBusy}
            onClick={async () => {
              setBackupBusy(true);
              try {
                await downloadVaultBackup();
                setLastBackupAt(new Date().toISOString());
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <Icon name="download" className="text-[16px]" /> Save vault backup
          </button>
        </div>
      )}

      {/* Telemetry stat bar */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => {
          const a = accent(s.color);
          return (
            <div key={s.label} className="panel p-space-sm flex items-center gap-2.5">
              <span className={`h-9 w-9 rounded-lg grid place-items-center ${a.bg} ${a.text} flex-shrink-0`}>
                <Icon name={s.icon} className="text-[18px]" />
              </span>
              <div className="min-w-0">
                <div className={`font-telemetry-val text-telemetry-val ${a.text}`}>{s.value}</div>
                <div className="font-label-sm text-label-sm text-text-muted uppercase tracking-wider truncate">
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Offline search */}
      <form onSubmit={runSearch} className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
          <Icon name="search" className="text-[18px]" />
        </span>
        <input
          className="field pl-10"
          placeholder="Search projects, logs, and ideas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      {!hasAnything && (
        <EmptyState
          title="No experiments yet."
          hint="Create your first project, experiment, or invention to get started."
          action={
            <div className="flex flex-col sm:flex-row gap-2">
              <button className="btn-primary" onClick={() => setShowNew(true)}>
                <Icon name="add" className="text-[18px]" /> New project
              </button>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await seedIfNeeded();
                  bumpData();
                }}
              >
                <Icon name="science" className="text-[18px]" /> Load sample lab
              </button>
            </div>
          }
        />
      )}

      {hasAnything && (
        <>
          {/* Resume */}
          {lastOpened && (!primary || lastOpened.id !== primary.id) && (
            <Link
              to={`/project/${lastOpened.id}`}
              className="flex items-center justify-between panel-2 px-4 py-3 hover:border-primary/40 transition-colors"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Icon name="history" className="text-[18px] text-secondary flex-shrink-0" />
                <span className="font-body-sm text-body-sm text-text-muted truncate">
                  Resume —{" "}
                  <span className="text-on-surface font-medium">{lastOpened.title}</span>
                </span>
              </span>
              <Icon name="arrow_forward" className="text-[18px] text-primary flex-shrink-0" />
            </Link>
          )}

          {/* Hero: main experiment */}
          <section>
            <SectionTitle icon="experiment">Main experiment</SectionTitle>
            {primary ? (
              <div className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <HeroExperiment
                    project={primary}
                    genre={primaryGenre}
                    milestones={primaryMilestones}
                    hypothesis={primaryHypothesis}
                  />
                </div>
                <div className="panel p-space-md">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Icon name="alt_route" className="text-[18px] text-secondary" />
                    <span className="label">Lifecycle</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto pr-1">
                    <Timeline milestones={primaryMilestones} />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="experiment"
                title="No primary experiment set."
                hint="Open a project and mark it primary, or create one here."
                action={
                  <button className="btn-ghost" onClick={() => setShowNew(true)}>
                    <Icon name="add" className="text-[18px]" /> New project
                  </button>
                }
              />
            )}
          </section>

          {/* Genre folders */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon="account_tree" className="mb-0">
                Genre folders
              </SectionTitle>
              <Link
                to="/genres"
                className="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-1"
              >
                Folder tree <Icon name="arrow_forward" className="text-[14px]" />
              </Link>
            </div>
            {genres.length === 0 ? (
              <p className="font-body-sm text-body-sm text-text-muted">No genres yet.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {genres.map((g) => (
                  <GenreTile key={g.id} genre={g} />
                ))}
              </div>
            )}
          </section>

          {/* Recent activity */}
          {recent.length > 0 && (
            <section>
              <SectionTitle icon="dynamic_feed">Recent lab activity</SectionTitle>
              <div className="space-y-2">
                {recent.map((e) => {
                  const m = entryMeta(e.kind);
                  const a = accent(m.accent);
                  const proj = projMap[e.projectId];
                  return (
                    <Link
                      key={e.id}
                      to={`/project/${e.projectId}`}
                      className="flex items-center gap-3 panel-2 px-3 py-2.5 hover:border-primary/40 transition-colors"
                    >
                      <span className={`h-8 w-8 rounded-lg grid place-items-center ${a.bg} ${a.text} flex-shrink-0`}>
                        <Icon name={m.icon} className="text-[16px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-body-md text-body-md text-on-surface truncate">
                          {e.title || m.label}
                        </div>
                        <div className="font-label-sm text-label-sm text-text-muted truncate">
                          {proj ? proj.title : "Project"} • {m.label}
                        </div>
                      </div>
                      <span className="font-label-sm text-label-sm text-text-muted flex-shrink-0">
                        {fmtDate(e.date, { month: "short", day: "numeric" })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New project">
        <ProjectForm
          onCancel={() => setShowNew(false)}
          onSaved={(p) => {
            setShowNew(false);
            bumpData();
            navigate(`/project/${p.id}`);
          }}
        />
      </Modal>
    </div>
  );
}

function SectionTitle({ icon, children, className = "mb-3" }) {
  return (
    <h2 className={`flex items-center gap-1.5 label ${className}`}>
      <Icon name={icon} className="text-[16px] text-text-muted" />
      {children}
    </h2>
  );
}

function HeroExperiment({ project, genre, milestones, hypothesis }) {
  const km = kindMeta(project.kind);
  const a = accent(km.accent);
  const sm = statusMeta(project.status);
  const sa = accent(sm.color);
  const pct = progressPct(milestones);
  const statement = hypothesis?.body || project.overview;

  return (
    <Link
      to={`/project/${project.id}`}
      className="relative block panel p-space-md overflow-hidden hover:border-primary/50 transition-colors"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`chip ${a.soft} font-bold`}>#{projectCode(project)}</span>
          {genre && (
            <span className="chip" style={{ color: genre.color }}>
              {genre.name}
            </span>
          )}
        </div>
        <span className={`chip ${sa.soft}`}>
          {sm.pulse && <span className={`w-1.5 h-1.5 rounded-full ${sa.bar} animate-pulse`} />}
          Primary
        </span>
      </div>

      <div className="relative flex items-center gap-2 mt-3">
        <Icon name={km.icon} className={`text-[22px] ${a.text}`} />
        <h3 className="font-headline-lg-mobile text-headline-lg-mobile text-text-primary tracking-tight">
          {project.title}
        </h3>
      </div>

      {statement && (
        <div className="relative panel-2 p-3 mt-3">
          <div className="flex items-center gap-1.5 text-primary mb-1">
            <Icon name="psychology" className="text-[15px]" />
            <span className="label text-primary">
              {hypothesis ? "Core hypothesis" : "Overview"}
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant line-clamp-3">
            {statement}
          </p>
        </div>
      )}

      <div className="relative flex items-center gap-2 mt-3">
        <div className="w-full bg-surface-container-lowest rounded-full h-2 overflow-hidden">
          <div className={`${a.bar} h-full rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`font-telemetry-val text-label-lg ${a.text} flex-shrink-0`}>{pct}%</span>
      </div>
    </Link>
  );
}

function GenreTile({ genre }) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    listProjectsByGenre(genre.id).then((p) => setCount(p.length));
  }, [genre.id]);
  return (
    <Link
      to={`/genres?genre=${genre.id}`}
      className="panel p-space-md hover:-translate-y-0.5 hover:border-primary/40 transition-all block"
    >
      <div className="flex items-center gap-3">
        <span
          className="h-9 w-9 rounded-lg grid place-items-center text-surface-base font-headline-sm font-bold flex-shrink-0"
          style={{ background: genre.color, boxShadow: `0 0 10px ${genre.color}55` }}
        >
          {genre.name[0]?.toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="font-headline-sm text-headline-sm text-text-primary truncate">
            {genre.name}
          </div>
          <div className="font-label-sm text-label-sm text-text-muted">
            {count == null ? "…" : `${count} item${count === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>
      {genre.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {genre.tags.slice(0, 3).map((t) => (
            <span key={t} className="chip">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Link>
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
