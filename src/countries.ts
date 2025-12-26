// this module helps load the countries GeoJSON and setup for rendering

import { latLonToSphere, randomColor } from "./helper";
import { offsetPolygon } from "./offset";
import type { CountryData, LatLon } from "./types";
import { Delaunay2D, type Vec2 } from './delaunate';

const LARGE_COUNTRIES = ['Russia', 'Antartica'];

export let countries: CountryData[] = [];

export async function loadAllCountries() {
  const res = await fetch('/public/countries.geo.json');
  const geojson = await res.json();

  const meshColorUSA = randomColor();

  const meshColorCanada = randomColor();

  countries = geojson.features.map((feature: any) => {
    let coords: number[][][] = [];

    if (feature.geometry.type === "Polygon") {
      coords = feature.geometry.coordinates; // wrap single polygon in an array
    } else if (feature.geometry.type === "MultiPolygon") {
      coords = feature.geometry.coordinates.flat(); // flatten MultiPolygon
    }

    const polygons = coords.map(ring =>
      ring.map(([lon, lat]) => ({ lon, lat }))
    );

    const name =feature.properties?.ADMIN || feature.properties?.name || "Unknown";

    const color = name.includes('America') ? meshColorUSA : name.includes('Canada') ? meshColorCanada : randomColor();

    return {
      name,
      polygons,
      points: [],
      spherePoints: [],
      triangles: [],
      pointsMesh: [],
      edges: [],
      mesh: [],
      color
    };
  });
}

export function pointInPolygon(point: LatLon, polygon: LatLon[]): boolean {
  if (!point || !polygon || polygon.length < 3) return false; // guard

  let inside = false;
  const epsilon = 1e-12;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;

    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / ((yj - yi) + epsilon) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}


export function isAwayFromEdges(p: LatLon, polygon: LatLon[], minDist: number): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];

    const {x: px, y: py} = latLonToSphere(p.lat, p.lon);
    const {x: ax, y: ay} = latLonToSphere(a.lat, a.lon);
    const {x: bx, y: by} = latLonToSphere(b.lat, b.lon);

    const d = pointSegmentDistance(
      px, py,
      ax, ay,
      bx, by
    );

    if (d < minDist) return false;
  }
  return true;
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;

  // Handle degenerate edge
  if (dx === 0 && dy === 0) {
    const dxp = px - ax;
    const dyp = py - ay;
    return Math.sqrt(dxp * dxp + dyp * dyp);
  }

  // t = projection of P onto AB
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);

  if (t <= 0) {
    // closest to A
    const dxp = px - ax;
    const dyp = py - ay;
    return Math.sqrt(dxp * dxp + dyp * dyp);
  }

  if (t >= 1) {
    // closest to B
    const dxp = px - bx;
    const dyp = py - by;
    return Math.sqrt(dxp * dxp + dyp * dyp);
  }

  // closest point lies on segment
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const dxp = px - cx;
  const dyp = py - cy;
  return Math.sqrt(dxp * dxp + dyp * dyp);
}

export function samplePointsInPolygon(polygon: LatLon[], num: number): LatLon[] {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  // include original polygon in the triangulation
  let pts: LatLon[] = polygon.map((p, i) => ({ lat: p.lat, lon: p.lon, boundary: true, boundaryIndex: i }));

  if (polygon.length > 100) {
    const polygonOffsetBoundary: LatLon[] = offsetPolygon(polygon, 0.5).filter(p => pointInPolygon(p, polygon));
    pts = [...pts, ...polygonOffsetBoundary];

    for (let i = 0; i < polygonOffsetBoundary.length; i++) {
      minLat = Math.min(minLat, polygonOffsetBoundary[i].lat);
      minLon = Math.min(minLon, polygonOffsetBoundary[i].lon);
      maxLat = Math.max(maxLat, polygonOffsetBoundary[i].lat);
      maxLon = Math.max(maxLon, polygonOffsetBoundary[i].lon); 
    }
  } else {
    for (let i = 0; i < polygon.length; i++) {
      minLat = Math.min(minLat, polygon[i].lat);
      minLon = Math.min(minLon, polygon[i].lon);
      maxLat = Math.max(maxLat, polygon[i].lat);
      maxLon = Math.max(maxLon, polygon[i].lon); 
    }
  }

  while (pts.length < num) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lon = minLon + Math.random() * (maxLon - minLon);
    if (pointInPolygon({ lat, lon }, polygon)) pts.push({ lat, lon });
  }
  return pts;
}


export function generateCountryData() {
  for (const country of countries) {
    country.points = [];
    country.spherePoints = [];
    country.triangles = [];
    for (const polygon of country.polygons) {
      if (polygon.length < 5) {
        country.points.push([]);
        country.spherePoints.push([]);
        country.triangles.push([]);
        continue;
      }

      const numOfIntermediatePoints = Math.min(LARGE_COUNTRIES.includes(country.name) ? 2000 : 1000, Math.max(polygonArea2D(polygon), 100));
      const points = samplePointsInPolygon(polygon, numOfIntermediatePoints);

      const flat = points.map(p => ({ x: p.lon, y: p.lat }));

      const triangles = triangulate2D(flat);

      country.points.push(points);
      country.spherePoints.push([...points.map(p => latLonToSphere(p.lat, p.lon))]);
      country.triangles.push(triangles);
    }
  }
}

function polygonArea2D(polygon: LatLon[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].lon * polygon[j].lat - polygon[j].lon * polygon[i].lat;
  }
  return Math.abs(area) / 2;
}

export function allEdgesAreBoundary(pA: LatLon, pB: LatLon, pC: LatLon): boolean {
  return (!!pA.boundary && !!pB.boundary && !!pC.boundary);
}

// --- Triangulate 2D using Delaunay ---
function triangulate2D(flatPoints: Vec2[]): [number, number, number][] {
  const delaunay = new Delaunay2D(flatPoints);
  for (let i = 0; i < flatPoints.length; i++) delaunay.insertPoint(i);
  delaunay.finalize();
  return delaunay.triangles.map(t => [t.a, t.b, t.c] as [number, number, number]);
}