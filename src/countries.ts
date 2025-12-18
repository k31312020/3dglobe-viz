import { latLonToSphere, randomColor } from "./helper";
import { offsetPolygon } from "./offset";
import type { CountryData, LatLon } from "./types";
import { Delaunay2D, type Vec2 } from './delaunate';

const LARGE_COUNTRIES = ['Russia', 'Antartica'];

export let countries: CountryData[] = [];

export async function loadAllCountries() {
  const res = await fetch('/public/countries.geo.json');
  const geojson = await res.json();

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

    return {
      name: feature.properties?.ADMIN || feature.properties?.name || "Unknown",
      polygons,
      points: [],
      spherePoints: [],
      triangles: [],
      pointsMesh: [],
      edges: [],
      mesh: [],
      color: randomColor()
    };
  });
}

export function pointInPolygon(point: LatLon, polygon: LatLon[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

export function isAwayFromEdges(p: LatLon, polygon: LatLon[], minDist: number): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];

    const d = pointSegmentDistance(
      p.lon, p.lat,
      a.lon, a.lat,
      b.lon, b.lat
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

export function samplePointsInPolygon(polygon: LatLon[], num: number, offset = 0): LatLon[] {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;

  const polygonOffsetBoundary: LatLon[] = offsetPolygon(polygon, 10000);

  // include original polygon in the triangulation
  let pts: LatLon[] = polygon.map((p, i) => ({ lat: p.lat, lon: p.lon, boundary: true, boundaryIndex: i }));

  pts = [...pts, ...polygonOffsetBoundary];

  for (let i = 0; i < polygonOffsetBoundary.length; i++) {
    minLat = Math.min(minLat, polygonOffsetBoundary[i].lat);
    minLon = Math.min(minLon, polygonOffsetBoundary[i].lon);
    maxLat = Math.max(maxLat, polygonOffsetBoundary[i].lat);
    maxLon = Math.max(maxLon, polygonOffsetBoundary[i].lon);
  }

  while (pts.length < num) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lon = minLon + Math.random() * (maxLon - minLon);
    const p = { lat, lon };
    if (pointInPolygon({ lat, lon }, polygon) && isAwayFromEdges(p, polygon, offset)) pts.push({ lat, lon });
  }
  return pts;
}

export function generateCountryData() {
  for (const country of countries) {
    country.points = [];
    country.spherePoints = [];
    country.triangles = [];
    for (const polygon of country.polygons) {
      if (polygon.length < 20) {
        country.points.push([]);
        country.spherePoints.push([]);
        country.triangles.push([]);
        continue;
      }
      const numOfIntermediatePoints = Math.min(LARGE_COUNTRIES.includes(country.name) ? 2000 : 1000, Math.max(polygonArea2D(polygon) * 2, 100));
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

function areSequential(a: LatLon, b: LatLon, polygon: LatLon[]): boolean {
  const isInsidePolygon = pointInPolygon(a, polygon) && pointInPolygon(b, polygon);
  if (!a.boundary || !b.boundary) return !isInsidePolygon;

  const diff = Math.abs(a.boundaryIndex! - b.boundaryIndex!);
  return (diff !== 1) || !isInsidePolygon;
}

export function isBoundarySequenceTriangle(pA: LatLon, pB: LatLon, pC: LatLon, polygon: LatLon[]): boolean {
  const ab = areSequential(pA, pB, polygon);
  const bc = areSequential(pB, pC, polygon);
  const ca = areSequential(pC, pA, polygon);

  // triangle qualifies if *at least* one pair is sequential
  return (ab && bc) || (ab && ca) || (bc && ca);
}

// --- Triangulate 2D using Delaunay ---
function triangulate2D(flatPoints: Vec2[]): [number, number, number][] {
  const delaunay = new Delaunay2D(flatPoints);
  for (let i = 0; i < flatPoints.length; i++) delaunay.insertPoint(i);
  delaunay.finalize();
//   drawCircumcircles(delaunay); // Draw circumcircles in 2D
  return delaunay.triangles.map(t => [t.a, t.b, t.c] as [number, number, number]);
}