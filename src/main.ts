import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Delaunay2D, type Vec2 } from './delaunate';
interface CountryData {
  name: string;
  polygons: LatLon[][];
  points: LatLon[][];
  spherePoints: Vec3[][];
  triangles: [number, number, number][][];
  pointsMesh?: THREE.Points[];
  mesh?: THREE.Mesh[];       // optional, for the surface
  edges?: THREE.LineSegments[]; // optional, for edges
}

let countries: CountryData[] = [];

// --- Types ---
interface LatLon { lon: number; lat: number; boundary?: boolean, boundaryIndex?: number }
interface Vec3 { x: number; y: number; z: number; }


async function loadAllCountries() {
  const res = await fetch('/public/countries.geo.json');
  const geojson = await res.json();

  countries = geojson.features.map((feature: any) => {
    let coords: number[][][] = [];

    if (feature.geometry.type === "Polygon") {
      coords = [feature.geometry.coordinates]; // wrap single polygon in an array
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
      mesh: []
    };
  }).filter((_: CountryData, i: number) => i < 1);

  console.log(countries)
}
// --- Load GeoJSON ---
async function loadPolygons(): Promise<LatLon[][]> {
  const res = await fetch('/public/countries.geo.json');
  const geojson = await res.json();
  return geojson;
}

async function extractBoundary(index: number, geojson: { features: { geometry: { coordinates: [] } }[] }) {
  const coords: number[][][][] = geojson.features[index].geometry.coordinates;
  return coords.flat().map(ring => ring.map(([lon, lat]) => ({ lon, lat })));
}

// --- Utilities ---
function latLonToSphere(lat: number, lon: number): Vec3 {
  const φ = THREE.MathUtils.degToRad(lat);
  const λ = THREE.MathUtils.degToRad(lon);
  return {
    x: Math.cos(φ) * Math.cos(λ),
    y: Math.cos(φ) * Math.sin(λ),
    z: Math.sin(φ)
  };
}

function pointInPolygon(point: LatLon, polygon: LatLon[]): boolean {
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

function isAwayFromEdges(p: LatLon, polygon: LatLon[], minDist: number): boolean {
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
    return Math.sqrt(dxp*dxp + dyp*dyp);
  }

  // t = projection of P onto AB
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx*dx + dy*dy);

  if (t <= 0) {
    // closest to A
    const dxp = px - ax;
    const dyp = py - ay;
    return Math.sqrt(dxp*dxp + dyp*dyp);
  }

  if (t >= 1) {
    // closest to B
    const dxp = px - bx;
    const dyp = py - by;
    return Math.sqrt(dxp*dxp + dyp*dyp);
  }

  // closest point lies on segment
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const dxp = px - cx;
  const dyp = py - cy;
  return Math.sqrt(dxp*dxp + dyp*dyp);
}

function samplePointsInPolygon(polygon: LatLon[], num: number, offset = 0.1): LatLon[] {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  // for (const ring of polygon) {
  for (const p of polygon) {
    minLat = Math.min(minLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLat = Math.max(maxLat, p.lat);
    maxLon = Math.max(maxLon, p.lon);
  }
  // }
  // include original polygon in the triangulation
  const pts: LatLon[] = polygon.map((p, i) => ({ lat: p.lat, lon: p.lon, boundary: true, boundaryIndex: i }));

  while (pts.length < num) {
    const lat = minLat + Math.random() * (maxLat - minLat);
    const lon = minLon + Math.random() * (maxLon - minLon);
      const p = { lat, lon };
    if (pointInPolygon({ lat, lon }, polygon) && isAwayFromEdges(p, polygon, offset)) pts.push({ lat, lon });
  }
  return pts;
}

// --- Three.js setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); // fully transparent
document.body.appendChild(renderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.minDistance = 0;
controls.maxDistance = 10;

// Sphere
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshStandardMaterial({
    color: 0x004E7C, transparent: false, opacity: 0.25,
    roughness: 1.0,
    metalness: 0.0,
  })
);
scene.add(sphere);

// --- Groups ---
const ptsGroup = new THREE.Group();
const triGroup = new THREE.Group();
const circumGroup = new THREE.Group();
const surfaceGroup = new THREE.Group();
scene.add(ptsGroup, triGroup, circumGroup, surfaceGroup);

// add lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// Main sun-like light
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 3, 2);
scene.add(sun);

// --- Points, triangles ---
let numRandom = 100;
let randomLatLon: LatLon[] = [];
let randomSpherePoints: Vec3[] = [];
let triangles: [number, number, number][] = [];

// --- Triangulate 2D using Delaunay ---
function triangulate2D(flatPoints: Vec2[]): [number, number, number][] {
  const delaunay = new Delaunay2D(flatPoints);
  for (let i = 0; i < flatPoints.length; i++) delaunay.insertPoint(i);
  delaunay.finalize();
  drawCircumcircles(delaunay); // Draw circumcircles in 2D
  return delaunay.triangles.map(t => [t.a, t.b, t.c] as [number, number, number]);
}

// --- Draw circumcircles ---
let showCircles = true;
function drawCircumcircles(delaunay: Delaunay2D) {
  circumGroup.clear();
  if (!showCircles) return;

  for (const t of delaunay.triangles) {
    if (!t.circum || !isFinite(t.circum.r2)) continue;
    const c = t.circum;
    const segments = 32;
    const points: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = c.x + Math.sqrt(c.r2) * Math.cos(angle);
      const y = c.y + Math.sqrt(c.r2) * Math.sin(angle);
      points.push(x, y, 0);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xff8800 }));
    circumGroup.add(line);
  }
}

// --- Draw helpers ---
function drawSpherePoints() {
  ptsGroup.clear();

  const positions: number[] = [];
  const colors: number[] = [];

  const colorBoundary = new THREE.Color(0xff0000); // red
  const colorInternal = new THREE.Color(0xffcc00); // yellow

  for (let i = 0; i < randomSpherePoints.length; i++) {
    positions.push(randomSpherePoints[i].x, randomSpherePoints[i].y, randomSpherePoints[i].z);
    const isBoundaryPoint = randomLatLon[i]?.boundary;
    const c = isBoundaryPoint ? colorBoundary : colorInternal;
    colors.push(c.r, c.g, c.b);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  ptsGroup.add(
    new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        size: 0.015,
        vertexColors: true, // ← IMPORTANT
      })
    )
  );
}
function drawSphereTriangles() {
  triGroup.clear();
  const positions: number[] = [];

  for (const t of triangles) {
    const [a, b, c] = t;
    const A = randomSpherePoints[a];
    const B = randomSpherePoints[b];
    const C = randomSpherePoints[c];
    // Only add edge if not connecting two boundary points
    if (!randomLatLon[a].boundary || !randomLatLon[b].boundary || (randomLatLon[a].boundary && randomLatLon[b].boundary && b === a + 1)) {
      positions.push(A.x, A.y, A.z, B.x, B.y, B.z);
    }
    if (!randomLatLon[b].boundary || !randomLatLon[c].boundary || (randomLatLon[b].boundary && randomLatLon[c].boundary && c === b + 1)) {
      positions.push(B.x, B.y, B.z, C.x, C.y, C.z);
    }
    if (!randomLatLon[c].boundary || !randomLatLon[a].boundary || (randomLatLon[c].boundary && randomLatLon[a].boundary && a === c + 1)) {
      positions.push(C.x, C.y, C.z, A.x, A.y, A.z);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
  triGroup.add(new THREE.LineSegments(geom, mat));
}

function drawSphereSurfaces() {
  surfaceGroup.clear();

  const positions: number[] = [];
  const colors: number[] = [];

  const extrudeHeight = 0.05; // 5% of radius, adjust as needed

  const colorBoundary = new THREE.Color(0x0066ff);
  const colorInternal = new THREE.Color(0x00ff88);

  for (const t of triangles) {
    const [a, b, c] = t;

    const boundaryTriangle = randomLatLon[a].boundary && randomLatLon[b].boundary && randomLatLon[c].boundary;

    const A = randomSpherePoints[a];
    const B = randomSpherePoints[b];
    const C = randomSpherePoints[c];

    if (!A || !B || !C || boundaryTriangle) continue;

    // Convert to normalized THREE vectors
    const A0 = new THREE.Vector3(A.x, A.y, A.z);
    const B0 = new THREE.Vector3(B.x, B.y, B.z);
    const C0 = new THREE.Vector3(C.x, C.y, C.z);

    // Normalize for extrusion direction
    const An = A0.clone().normalize().multiplyScalar(extrudeHeight);
    const Bn = B0.clone().normalize().multiplyScalar(extrudeHeight);
    const Cn = C0.clone().normalize().multiplyScalar(extrudeHeight);

    // Top vertices (extruded outward)
    const A1 = A0.clone().add(An);
    const B1 = B0.clone().add(Bn);
    const C1 = C0.clone().add(Cn);

    // Pick color
    const col = (randomLatLon[a].boundary ||
      randomLatLon[b].boundary ||
      randomLatLon[c].boundary)
      ? colorBoundary
      : colorInternal;

    // --- TRIANGLES ---
    // Bottom triangle (A0,B0,C0)
    pushTri(A0, B0, C0, col);
    // Top triangle (A1,B1,C1)
    pushTri(A1, C1, B1, col); // reverse winding for correct normals

    // --- SIDE FACES (3 rectangular quads → 6 triangles) ---
    pushQuad(A0, B0, A1, B1, col); // side AB
    pushQuad(B0, C0, B1, C1, col); // side BC
    pushQuad(C0, A0, C1, A1, col); // side CA
  }

  // ---- Build geometry ----
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x44aa88,
    // flatShading: false,
    side: THREE.DoubleSide,
    // depthWrite: true,
    // depthTest: true,
    transparent: false,
  });

  surfaceGroup.add(new THREE.Mesh(geom, mat));

  // ---- Helper: push one triangle ----
  function pushTri(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, color: THREE.Color) {
    positions.push(
      v1.x, v1.y, v1.z,
      v2.x, v2.y, v2.z,
      v3.x, v3.y, v3.z
    );
    for (let i = 0; i < 3; i++) {
      colors.push(color.r, color.g, color.b);
    }
  }

  // ---- Helper: push quad as 2 triangles ----
  function pushQuad(a: THREE.Vector3, b: THREE.Vector3, a2: THREE.Vector3, b2: THREE.Vector3, color: THREE.Color) {
    // Quad structure:
    // a ---- b
    // |      |
    // a2 --- b2

    pushTri(a, b, a2, color);  // first triangle
    pushTri(b, b2, a2, color); // second triangle
  }
}


// --- Regenerate ---
// async function regenerate() {
//   const polygons = await loadPolygons();
//   randomLatLon = samplePointsInPolygon(polygon, numRandom);
//   randomSpherePoints = randomLatLon.map(p => latLonToSphere(p.lat, p.lon));
//   const flat = randomLatLon.map(p => ({ x: p.lon, y: p.lat, boundary: true }));
//   triangles = triangulate2D(flat);
//   drawSpherePoints();
//   drawSphereTriangles();
//   drawSphereSurfaces();
// }

async function regenerate() {
  await loadAllCountries();
  generateCountryData(200);
  ptsGroup.clear();
  triGroup.clear();
  surfaceGroup.clear();
  for (const country of countries) {
    for(let i = 0; i < country.polygons.length; i ++) {
      drawCountry(country, i);
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

function generateCountryData(numPointsPerCountry = 200) {
  for (const country of countries) {
    country.points = [];
    country.spherePoints = [];
    country.triangles = [];
    console.log(country);
    for (const polygon of country.polygons) {
      const triangles = [];
      const spherePoints = [];
      const points = [];
      const numOfIntermediatePoints = Math.max(polygonArea2D(polygon) * 2, 100);
      console.log(numOfIntermediatePoints)
      const pts = samplePointsInPolygon(polygon, numOfIntermediatePoints);
      const sp = pts.map(p => latLonToSphere(p.lat, p.lon));
      const flat = pts.map(p => ({ x: p.lon, y: p.lat }));
      const tris = triangulate2D(flat);

      // Shift indices to global country.points array
      // const indexOffset = country.points.flat().length;
      points.push(...pts);
      country.points.push(points);
      spherePoints.push(...pts.map(p => latLonToSphere(p.lat, p.lon)));
      country.spherePoints.push(spherePoints);
      triangles.push(...tris.map(t => [t[0], t[1], t[2]]));
      country.triangles.push(triangles);
    }
  }
}

function areSequential(a: LatLon, b: LatLon, polygon: LatLon[]): boolean {
  const isInsidePolygon = pointInPolygon(a, polygon) && pointInPolygon(b, polygon);
  if (!a.boundary || !b.boundary) return !isInsidePolygon;

  const diff = Math.abs(a.boundaryIndex! - b.boundaryIndex!);
  return (diff !== 1) || !isInsidePolygon;
}

function isBoundarySequenceTriangle(pA: LatLon, pB: LatLon, pC: LatLon, polygon: LatLon[]): boolean {
  const ab = areSequential(pA, pB, polygon);
  const bc = areSequential(pB, pC, polygon);
  const ca = areSequential(pC, pA, polygon);

  // triangle qualifies if *at least* one pair is sequential
  return (ab && bc) || (ab && ca) || (bc && ca);
}

function drawCountry(country: CountryData, index: number) {
  // --- Points ---
  const ptsGeom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const colorBoundary = new THREE.Color(0xff0000);
  const colorInternal = new THREE.Color(0xffcc00);

  for (let i = 0; i < country.spherePoints[index].length; i++) {
    const p = country.spherePoints[index][i];
    positions.push(p.x, p.y, p.z);
    const c = country.points[index][i].boundary ? colorBoundary : colorInternal;
    colors.push(c.r, c.g, c.b);
  }


  ptsGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ptsGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  country.pointsMesh?.push(new THREE.Points(ptsGeom, new THREE.PointsMaterial({ size: 0.01, vertexColors: true })));
  country.pointsMesh?.[index] && ptsGroup.add(country.pointsMesh[index]);

  // --- Triangles ---
  const triPositions: number[] = [];
  for (const t of country.triangles[index]) {
    const [a, b, c] = t;
    const A = country.spherePoints[index][a], B = country.spherePoints[index][b], C = country.spherePoints[index][c];
    // Only draw if at least one point is not a boundary
    const polygonEdgeTri = isBoundarySequenceTriangle(
      country.points[index][a],
      country.points[index][b],
      country.points[index][c],
      country.polygons[index]
    );

    if (polygonEdgeTri) continue;

    // Add edges
    triPositions.push(
      A.x, A.y, A.z, B.x, B.y, B.z,
      B.x, B.y, B.z, C.x, C.y, C.z,
      C.x, C.y, C.z, A.x, A.y, A.z
    );
  }
  const triGeom = new THREE.BufferGeometry();
  triGeom.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
  country.edges?.push(new THREE.LineSegments(triGeom, new THREE.LineBasicMaterial({ color: 0xffffff })));
  country.edges?.[index] && triGroup.add(country.edges[index]);

  // --- Surface ---
  const positionsSurf: number[] = [];
  const colorsSurf: number[] = [];
  const extrudeHeight = 0.02;

  for (const t of country.triangles[index]) {
    const [a, b, c] = t;

    const polygonEdgeTri = isBoundarySequenceTriangle(
      country.points[index][a],
      country.points[index][b],
      country.points[index][c],
      country.polygons[index]
    );

    if (polygonEdgeTri) continue;

    const A0 = new THREE.Vector3(...Object.values(country.spherePoints[index][a]));
    const B0 = new THREE.Vector3(...Object.values(country.spherePoints[index][b]));
    const C0 = new THREE.Vector3(...Object.values(country.spherePoints[index][c]));
    const An = A0.clone().normalize().multiplyScalar(extrudeHeight);
    const Bn = B0.clone().normalize().multiplyScalar(extrudeHeight);
    const Cn = C0.clone().normalize().multiplyScalar(extrudeHeight);

    const A1 = A0.clone().add(An);
    const B1 = B0.clone().add(Bn);
    const C1 = C0.clone().add(Cn);

    const col = new THREE.Color(0x44aa88);

    pushTriSurf(A0, B0, C0, col);
    pushTriSurf(A1, C1, B1, col);
    pushQuadSurf(A0, B0, A1, B1, col);
    pushQuadSurf(B0, C0, B1, C1, col);
    pushQuadSurf(C0, A0, C1, A1, col);
  }

  const geomSurf = new THREE.BufferGeometry();
  geomSurf.setAttribute("position", new THREE.Float32BufferAttribute(positionsSurf, 3));
  geomSurf.setAttribute("color", new THREE.Float32BufferAttribute(colorsSurf, 3));
  geomSurf.computeVertexNormals();
  country.mesh?.push(new THREE.Mesh(geomSurf, new THREE.MeshStandardMaterial({ color: 0x44aa88, side: THREE.DoubleSide })));
  country.mesh?.[index] && surfaceGroup.add(country.mesh[index]);

  function pushTriSurf(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, color: THREE.Color) {
    positionsSurf.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
    for (let i = 0; i < 3; i++) colorsSurf.push(color.r, color.g, color.b);
  }
  function pushQuadSurf(a: THREE.Vector3, b: THREE.Vector3, a2: THREE.Vector3, b2: THREE.Vector3, color: THREE.Color) {
    pushTriSurf(a, b, a2, color);
    pushTriSurf(b, b2, a2, color);
  }
}


// --- UI ---
const slider = document.createElement('input');
slider.type = 'range';
slider.min = '100';
slider.max = '4000';
slider.value = String(numRandom);
slider.style.position = 'fixed';
slider.style.left = '10px';
slider.style.top = '10px';
slider.style.zIndex = '10';
document.body.appendChild(slider);
slider.addEventListener('input', () => { numRandom = +slider.value; regenerate(); });

const uiContainer = document.createElement('div');
uiContainer.style.position = 'fixed';
uiContainer.style.top = '50px';
uiContainer.style.left = '10px';
uiContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
uiContainer.style.padding = '10px';
uiContainer.style.borderRadius = '5px';
uiContainer.style.zIndex = '10';
uiContainer.style.color = '#fff';
document.body.appendChild(uiContainer);

function createToggle(labelText: string, targetGroup: THREE.Group, defaultValue = true) {
  const label = document.createElement('label');
  label.style.display = 'block';
  label.style.cursor = 'pointer';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = defaultValue;
  checkbox.style.marginRight = '5px';
  checkbox.addEventListener('change', () => { targetGroup.visible = checkbox.checked; });

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(labelText));
  uiContainer.appendChild(label);
}

createToggle('Show Points', ptsGroup, true);
createToggle('Show Edges', triGroup, true);
createToggle('Show Circumcircles', circumGroup, true);
createToggle('Show Surfaces', surfaceGroup, true);

// --- Start ---
regenerate();
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
