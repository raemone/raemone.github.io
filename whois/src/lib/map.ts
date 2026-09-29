import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import worldTopology from 'world-atlas/countries-110m.json';
import { projects as allProjects } from './content';
import type { Project } from './schema';

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 480;

export interface MapPoint {
  id: string;
  x: number;
  y: number;
}

export interface MapGeometry {
  width: number;
  height: number;
  /** One SVG path string per country, rendered as a static backdrop. */
  countries: string[];
  graticule: string;
  /** Outer sphere outline, used as a subtle frame around the projection. */
  sphere: string;
  points: MapPoint[];
}

/**
 * Projects the world and every engagement into SVG coordinates at build time.
 *
 * Doing this on the server means neither d3-geo nor the 110m TopoJSON file
 * (~100 KB) ever reaches the browser — the island only ships hover and filter
 * behaviour.
 */
export function buildMapGeometry(projects: Project[] = allProjects): MapGeometry {
  // The cast is needed because the TopoJSON file is typed as plain JSON.
  const collection = feature(
    worldTopology as never,
    (worldTopology as never as { objects: { countries: unknown } }).objects.countries as never,
  ) as unknown as FeatureCollection<Geometry>;

  const projection = geoNaturalEarth1().fitExtent(
    [
      [8, 8],
      [MAP_WIDTH - 8, MAP_HEIGHT - 8],
    ],
    collection,
  );

  const pathBuilder = geoPath(projection);

  const countries = collection.features
    .map((countryFeature) => pathBuilder(countryFeature))
    .filter((path): path is string => path !== null);

  const points: MapPoint[] = [];
  for (const project of projects) {
    const projected = projection([project.lng, project.lat]);
    if (!projected) continue;
    points.push({ id: project.id, x: projected[0], y: projected[1] });
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    countries,
    graticule: pathBuilder(geoGraticule10()) ?? '',
    sphere: pathBuilder({ type: 'Sphere' }) ?? '',
    points,
  };
}
