import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Delaunay2D, type Vec2 } from './delaunate';

// --- Types ---
interface LatLon { lon: number; lat: number; boundary?: boolean }
interface Vec3 { x: number; y: number; z: number; }

// --- Load GeoJSON ---
async function loadAustraliaPolygon(): Promise<LatLon[][]> {
  const res = await fetch('/public/australia.geojson');
  const geojson = await res.json();
  const coords: number[][][][] = geojson.features[0].geometry.coordinates;
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

function pointInPolygon(point: LatLon, polygon: LatLon[][]): boolean {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lon, yi = ring[i].lat;
      const xj = ring[j].lon, yj = ring[j].lat;
      const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

function samplePointsInPolygon(polygon: LatLon[][], num: number): LatLon[] {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const ring of polygon) {
    for (const p of ring) {
      minLat = Math.min(minLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLat = Math.max(maxLat, p.lat);
      maxLon = Math.max(maxLon, p.lon);
    }
  }
  // include original polygon in the triangulation
  const pts: LatLon[] = [...polygon.flat().map(p => ({ lat: p.lat, lon: p.lon, boundary: true }))];

  while (pts.length < num) {
    const lat = minLat + (maxLat - minLat) * Math.random();
    const lon = minLon + (maxLon - minLon) * Math.random();
    if (pointInPolygon({ lat, lon }, polygon)) pts.push({ lat, lon });
  }
  return pts;
}

// --- Three.js setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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
let numRandom = 500;
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
    console.log(randomLatLon[a].boundary && randomLatLon[b].boundary);
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
async function regenerate() {
  const polygon = await loadAustraliaPolygon();
  randomLatLon = samplePointsInPolygon(polygon, numRandom);
  randomSpherePoints = randomLatLon.map(p => latLonToSphere(p.lat, p.lon));
  const flat = randomLatLon.map(p => ({ x: p.lon, y: p.lat, boundary: true }));
  triangles = triangulate2D(flat);
  drawSpherePoints();
  drawSphereTriangles();
  drawSphereSurfaces();
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
