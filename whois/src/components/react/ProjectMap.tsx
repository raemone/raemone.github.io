import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.6;

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
  const [isPanning, setIsPanning] = useState(false);

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

  const hideTimer = useRef<number | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  /**
   * Closing is delayed by a grace period so the pointer can cross the gap
   * between a pin and its card without the card vanishing on the way. Entering
   * the card cancels the pending close, which is what lets it be read, its text
   * selected and its links clicked.
   */
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setActiveId(null), 220);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  const showPin = useCallback(
    (id: string) => {
      cancelHide();
      setActiveId(id);
    },
    [cancelHide],
  );

  /**
   * Zoom is a plain transform over the map layer rather than a d3-zoom
   * behaviour, which keeps d3 out of the browser bundle. `k` scales, `x` and
   * `y` translate, both in viewBox units.
   */
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  /** Keeps the scaled map covering the frame, so panning never reveals empty space beside the world. */
  const clampPan = useCallback(
    (k: number, x: number, y: number) => ({
      k,
      x: Math.min(0, Math.max(geometry.width * (1 - k), x)),
      y: Math.min(0, Math.max(geometry.height * (1 - k), y)),
    }),
    [geometry.width, geometry.height],
  );

  /** Scales around a fixed point, so whatever is under the cursor stays under it. */
  const zoomAbout = useCallback(
    (factor: number, px: number, py: number) => {
      setZoom((current) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
        if (k === current.k) return current;
        const worldX = (px - current.x) / current.k;
        const worldY = (py - current.y) / current.k;
        return clampPan(k, px - worldX * k, py - worldY * k);
      });
    },
    [clampPan],
  );

  const zoomByStep = useCallback(
    (factor: number) => zoomAbout(factor, geometry.width / 2, geometry.height / 2),
    [zoomAbout, geometry.width, geometry.height],
  );

  const resetZoom = useCallback(() => setZoom({ k: 1, x: 0, y: 0 }), []);

  const toViewBox = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: ((clientX - rect.left) / rect.width) * geometry.width,
        y: ((clientY - rect.top) / rect.height) * geometry.height,
      };
    },
    [geometry.width, geometry.height],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      // A plain wheel must keep scrolling the page. Only a modifier zooms,
      // which is the usual convention for a map embedded in a document.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const point = toViewBox(event.clientX, event.clientY);
      if (point) zoomAbout(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, point.x, point.y);
    };

    // Registered by hand because React attaches wheel passively, which would
    // make preventDefault a no-op and let the page scroll as well as zoom.
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toViewBox, zoomAbout]);

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
          <div className="relative">
            <div className="overflow-hidden rounded-xl border border-border bg-bg-subtle">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              className={`block h-auto w-full touch-none ${
                zoom.k > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''
              }`}
              role="img"
              aria-label={labels.hint}
              onPointerDown={(event) => {
                // Only empty map drags; a pin keeps its own click and focus.
                if (zoom.k <= 1 || (event.target as Element).closest('[role="button"]')) return;
                dragRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: zoom.x,
                  originY: zoom.y,
                };
                setIsPanning(true);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                const rect = svgRef.current?.getBoundingClientRect();
                if (!drag || drag.pointerId !== event.pointerId || !rect) return;
                const dx = ((event.clientX - drag.startX) / rect.width) * geometry.width;
                const dy = ((event.clientY - drag.startY) / rect.height) * geometry.height;
                setZoom((current) => clampPan(current.k, drag.originX + dx, drag.originY + dy));
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId !== event.pointerId) return;
                dragRef.current = null;
                setIsPanning(false);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                dragRef.current = null;
                setIsPanning(false);
              }}
              onDoubleClick={(event) => {
                const point = toViewBox(event.clientX, event.clientY);
                if (point) zoomAbout(ZOOM_STEP, point.x, point.y);
              }}
            >
              {/* The land layer scales and translates; pins sit outside it so
                  they stay the same size at every zoom level. */}
              <g transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`}>
                <path d={geometry.sphere} className="fill-surface stroke-border" strokeWidth={1 / zoom.k} />
                <path
                  d={geometry.graticule}
                  className="fill-none stroke-border"
                  strokeWidth={0.4 / zoom.k}
                  opacity={0.5}
                />
                {geometry.countries.map((path, index) => (
                  <path
                    key={index}
                    d={path}
                    className="fill-border stroke-bg-subtle"
                    strokeWidth={0.5 / zoom.k}
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
                      transform={`translate(${point.x * zoom.k + zoom.x} ${point.y * zoom.k + zoom.y})`}
                      tabIndex={isVisible ? 0 : -1}
                      role="button"
                      aria-label={`${project.project} — ${project.city}, ${project.country}, ${project.year}`}
                      aria-pressed={pinnedId === point.id}
                      onMouseEnter={() => isVisible && showPin(point.id)}
                      onMouseLeave={scheduleHide}
                      onFocus={() => isVisible && showPin(point.id)}
                      onBlur={scheduleHide}
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

              <div className="absolute right-3 top-3 flex flex-col gap-1">
                <ZoomButton label={labels.zoomIn} onClick={() => zoomByStep(ZOOM_STEP)} disabled={zoom.k >= MAX_ZOOM}>
                  <path d="M8 3.5v9M3.5 8h9" />
                </ZoomButton>
                <ZoomButton label={labels.zoomOut} onClick={() => zoomByStep(1 / ZOOM_STEP)} disabled={zoom.k <= MIN_ZOOM}>
                  <path d="M3.5 8h9" />
                </ZoomButton>
                <ZoomButton label={labels.resetZoom} onClick={resetZoom} disabled={zoom.k <= MIN_ZOOM}>
                  <path d="M3.5 8a4.5 4.5 0 1 1 1.6 3.44" />
                  <path d="M3 12.5V9h3.5" />
                </ZoomButton>
              </div>
            </div>

            {shownProject && shownPoint && (
              <Tooltip
                project={shownProject}
                xPercent={((shownPoint.x * zoom.k + zoom.x) / geometry.width) * 100}
                yPercent={((shownPoint.y * zoom.k + zoom.y) / geometry.height) * 100}
                outcomeLabel={labels.outcome}
                pinned={pinnedId === shownProject.id}
                onClose={() => setPinnedId(null)}
                onPointerEnter={cancelHide}
                onPointerLeave={scheduleHide}
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

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg border border-border bg-surface/90 text-muted backdrop-blur transition-colors hover:border-border-strong hover:text-text disabled:pointer-events-none disabled:opacity-40"
    >
      <svg
        className="size-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
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
  onPointerEnter,
  onPointerLeave,
}: {
  project: MapProject;
  xPercent: number;
  yPercent: number;
  outcomeLabel: string;
  pinned: boolean;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  // Keep the card inside the frame when the pin sits near a side edge.
  const clampedX = Math.min(Math.max(xPercent, 22), 78);
  // Flip the card to whichever side of the pin has more room. Below the
  // halfway line there is more space above, and vice versa.
  const showBelow = yPercent < 45;

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
        The card takes the pointer so it can be read, its text selected and its
        close button clicked. The parent delays closing for a moment, so moving
        the cursor off the pin and onto the card does not tear it down on the
        way across the gap.
      */}
      <div
        onMouseEnter={onPointerEnter}
        onMouseLeave={onPointerLeave}
        className="pointer-events-auto rounded-xl border border-border-strong bg-surface-raised p-4 shadow-2xl"
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
