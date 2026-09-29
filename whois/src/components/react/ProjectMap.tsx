import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapGeometry } from '@/lib/map';

/** A project flattened to the active language, so the island carries no i18n logic. */
export interface MapProject {
  id: string;
  customer: string;
  project: string;
  description: string;
  country: string;
  countryCode: string;
  city: string;
  year: number;
  industry: string;
  industryKey: string;
  tech: string[];
  outcome?: string;
}

export interface MapLabels {
  filterIndustry: string;
  filterYear: string;
  all: string;
  reset: string;
  showing: string;
  of: string;
  hint: string;
  listView: string;
  mapView: string;
  outcome: string;
  none: string;
}

interface Props {
  geometry: MapGeometry;
  projects: MapProject[];
  labels: MapLabels;
}

type View = 'map' | 'list';

export default function ProjectMap({ geometry, projects, labels }: Props) {
  const [industry, setIndustry] = useState('all');
  const [year, setYear] = useState('all');
  const [view, setView] = useState<View>('map');
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Set by a click or keyboard activation; survives mouse-out so touch users can read the card. */
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const industries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const project of projects) {
      if (!seen.has(project.industryKey)) seen.set(project.industryKey, project.industry);
    }
    return [...seen.entries()];
  }, [projects]);

  const years = useMemo(
    () => [...new Set(projects.map((project) => project.year))].sort((a, b) => b - a),
    [projects],
  );

  const filtered = useMemo(
    () =>
      projects.filter(
        (project) =>
          (industry === 'all' || project.industryKey === industry) &&
          (year === 'all' || String(project.year) === year),
      ),
    [projects, industry, year],
  );

  const visibleIds = useMemo(() => new Set(filtered.map((project) => project.id)), [filtered]);
  const pointsById = useMemo(
    () => new Map(geometry.points.map((point) => [point.id, point])),
    [geometry.points],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const shownId = pinnedId ?? activeId;
  const shownProject = shownId ? projectsById.get(shownId) : undefined;
  const shownPoint = shownId ? pointsById.get(shownId) : undefined;

  // A pinned card must not linger once its pin is filtered out of view.
  useEffect(() => {
    if (pinnedId && !visibleIds.has(pinnedId)) setPinnedId(null);
    if (activeId && !visibleIds.has(activeId)) setActiveId(null);
  }, [visibleIds, pinnedId, activeId]);

  useEffect(() => {
    if (!pinnedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinnedId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinnedId]);

  const reset = useCallback(() => {
    setIndustry('all');
    setYear('all');
    setPinnedId(null);
    setActiveId(null);
  }, []);

  const isFiltered = industry !== 'all' || year !== 'all';

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-x-5 gap-y-4">
        <Select
          label={labels.filterIndustry}
          value={industry}
          onChange={setIndustry}
          options={[{ value: 'all', label: labels.all }, ...industries.map(([key, name]) => ({ value: key, label: name }))]}
        />
        <Select
          label={labels.filterYear}
          value={year}
          onChange={setYear}
          options={[{ value: 'all', label: labels.all }, ...years.map((value) => ({ value: String(value), label: String(value) }))]}
        />

        {isFiltered && (
          <button
            type="button"
            onClick={reset}
            className="pb-2 text-xs text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
          >
            {labels.reset}
          </button>
        )}

        <div className="ml-auto flex items-end gap-4">
          <p className="pb-2 font-mono text-xs text-faint tabular-nums">
            {labels.showing} {filtered.length} {labels.of} {projects.length}
          </p>
          <div className="flex rounded-lg border border-border p-0.5" role="tablist">
            {(['map', 'list'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={view === mode}
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === mode ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
                }`}
              >
                {mode === 'map' ? labels.mapView : labels.listView}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'map' ? (
        <>
          <div className="relative overflow-hidden rounded-xl border border-border bg-bg-subtle">
            <svg
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              className="block h-auto w-full"
              role="img"
              aria-label={labels.hint}
            >
              <path d={geometry.sphere} className="fill-surface stroke-border" strokeWidth={1} />
              <path d={geometry.graticule} className="fill-none stroke-border" strokeWidth={0.4} opacity={0.5} />
              <g>
                {geometry.countries.map((path, index) => (
                  <path
                    key={index}
                    d={path}
                    className="fill-border stroke-bg-subtle"
                    strokeWidth={0.5}
                    opacity={0.75}
                  />
                ))}
              </g>

              <g>
                {geometry.points.map((point, index) => {
                  const project = projectsById.get(point.id);
                  if (!project) return null;
                  const isVisible = visibleIds.has(point.id);
                  const isActive = shownId === point.id;
                  return (
                    <g
                      key={point.id}
                      transform={`translate(${point.x} ${point.y})`}
                      tabIndex={isVisible ? 0 : -1}
                      role="button"
                      aria-label={`${project.project} — ${project.city}, ${project.country}, ${project.year}`}
                      aria-pressed={pinnedId === point.id}
                      onMouseEnter={() => isVisible && setActiveId(point.id)}
                      onMouseLeave={() => setActiveId(null)}
                      onFocus={() => isVisible && setActiveId(point.id)}
                      onBlur={() => setActiveId(null)}
                      onClick={() => isVisible && setPinnedId((current) => (current === point.id ? null : point.id))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setPinnedId((current) => (current === point.id ? null : point.id));
                        }
                      }}
                      className={`outline-none ${isVisible ? 'cursor-pointer' : 'pointer-events-none'}`}
                      style={{
                        opacity: isVisible ? 1 : 0.12,
                        transition: `opacity 320ms cubic-bezier(0.16,1,0.3,1) ${index * 25}ms`,
                      }}
                    >
                      {isVisible && (
                        <circle r={5} className="fill-accent" opacity={0.35} pointerEvents="none">
                          <animate
                            attributeName="r"
                            values="5;14;5"
                            dur="2.8s"
                            begin={`${index * 0.22}s`}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.35;0;0.35"
                            dur="2.8s"
                            begin={`${index * 0.22}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}

                      {/*
                        A fixed, invisible hit area is the only thing that takes
                        pointer events. The pulse ring animates its radius from
                        5 to 14 and back; while it was hittable the hover target
                        grew and shrank several times a second, so the tooltip
                        flickered in and out. The visible pin also opts out, so
                        its hover-grow cannot move the boundary either.
                      */}
                      <circle r={13} fill="transparent" />

                      <circle
                        r={isActive ? 7 : 4.5}
                        className="fill-accent stroke-bg"
                        strokeWidth={1.5}
                        pointerEvents="none"
                        style={{ transition: 'r 220ms cubic-bezier(0.34,1.56,0.64,1)' }}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>

            {shownProject && shownPoint && (
              <Tooltip
                project={shownProject}
                xPercent={(shownPoint.x / geometry.width) * 100}
                yPercent={(shownPoint.y / geometry.height) * 100}
                outcomeLabel={labels.outcome}
                pinned={pinnedId === shownProject.id}
                onClose={() => setPinnedId(null)}
              />
            )}
          </div>

          <p className="mt-3 text-xs text-faint">{labels.hint}</p>

          {filtered.length === 0 && <p className="mt-6 text-sm text-muted">{labels.none}</p>}
        </>
      ) : (
        <ProjectList projects={filtered} outcomeLabel={labels.outcome} emptyLabel={labels.none} />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-36 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors hover:border-border-strong focus:border-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tooltip({
  project,
  xPercent,
  yPercent,
  outcomeLabel,
  pinned,
  onClose,
}: {
  project: MapProject;
  xPercent: number;
  yPercent: number;
  outcomeLabel: string;
  pinned: boolean;
  onClose: () => void;
}) {
  // Keep the card inside the frame when the pin sits near an edge.
  const clampedX = Math.min(Math.max(xPercent, 22), 78);
  const showBelow = yPercent < 34;

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-72 motion-safe:animate-[tip-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
      style={{
        left: `${clampedX}%`,
        top: `${yPercent}%`,
        transform: showBelow ? 'translate(-50%, 16px)' : 'translate(-50%, calc(-100% - 16px))',
      }}
    >
      {/*
        Only a pinned card accepts the pointer, so that its close button and
        text are usable. A hover card stays inert: if it took pointer events,
        moving the cursor toward it would cross the gap, fire mouseleave on the
        pin and tear the card down mid-reach.
      */}
      <div
        className={`rounded-xl border border-border-strong bg-surface-raised p-4 shadow-2xl ${
          pinned ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <p className="label-mono">{project.industry}</p>
            <p className="text-sm font-semibold text-text">{project.customer}</p>
          </div>
          {pinned && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded p-1 text-faint transition-colors hover:text-text"
            >
              <svg className="size-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-sm font-medium text-accent">{project.project}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">{project.description}</p>

        {project.outcome && (
          <p className="mt-2 border-l-2 border-accent pl-2.5 text-xs leading-relaxed text-muted">
            <span className="label-mono block">{outcomeLabel}</span>
            {project.outcome}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <span className="font-mono text-[0.65rem] text-faint">
            {project.city}, {project.country} · {project.year}
          </span>
        </div>

        {project.tech.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {project.tech.map((item) => (
              <span key={item} className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.6rem] text-muted">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes tip-in { from { opacity: 0; transform: translate(-50%, calc(-100% - 8px)) } }`}</style>
    </div>
  );
}

function ProjectList({
  projects,
  outcomeLabel,
  emptyLabel,
}: {
  projects: MapProject[];
  outcomeLabel: string;
  emptyLabel: string;
}) {
  if (projects.length === 0) return <p className="text-sm text-muted">{emptyLabel}</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <article key={project.id} id={project.id} className="card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-mono">{project.industry}</p>
            <span className="font-mono text-xs text-faint tabular-nums">{project.year}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-text">{project.project}</h3>
          <p className="text-sm text-accent">{project.customer}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{project.description}</p>

          {project.outcome && (
            <p className="mt-3 border-l-2 border-accent pl-3 text-sm leading-relaxed text-muted">
              <span className="label-mono block">{outcomeLabel}</span>
              {project.outcome}
            </p>
          )}

          <p className="mt-3 font-mono text-xs text-faint">
            {project.city}, {project.country}
          </p>

          {project.tech.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.tech.map((item) => (
                <span key={item} className="rounded border border-border px-2 py-0.5 font-mono text-[0.65rem] text-muted">
                  {item}
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
