import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Delaunay2D } from './delaunate';
import type { CountryData } from './types';
import { countries, generateCountryData, isBoundarySequenceTriangle, loadAllCountries } from './countries';

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

async function regenerate() {
  await loadAllCountries();
  generateCountryData();
  ptsGroup.clear();
  triGroup.clear();
  surfaceGroup.clear();
  for (const country of countries) {
    for (let i = 0; i < country.polygons.length; i++) {
      drawCountry(country, i);
    }
  }
}

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

function getMeshLabelPosition(mesh: THREE.Mesh) {
  const geometry = mesh.geometry
  geometry.computeBoundingBox()

  const box = geometry.boundingBox!
  const center = new THREE.Vector3()
  box.getCenter(center)

  return center
}

function drawLabel(name: string, shape: THREE.Mesh) {
  const nameDiv = document.createElement('div');
  nameDiv.className = 'label';
  nameDiv.textContent = name;
  nameDiv.style.color = 'white';
  nameDiv.style.fontSize = '8px'
  const nameLabel = new CSS2DObject(nameDiv);

  const horizonThreshold = 0.7
  const globeCenter = new THREE.Vector3(0, 0, 0)

  const tmpPos = new THREE.Vector3()
  const tmpCamDir = new THREE.Vector3()

  nameLabel.onBeforeRender = (renderer, scene, camera) => {
    // World position of the label
    nameLabel.getWorldPosition(tmpPos)

    // Normal from globe center
    const normal = tmpPos.sub(globeCenter).normalize()

    // Direction to camera
    tmpCamDir
      .copy(camera.position)
      .sub(globeCenter)
      .normalize()

    const dot = normal.dot(tmpCamDir)

    nameLabel.element.style.display =
      dot > horizonThreshold ? 'block' : 'none'
  }

  nameLabel.position.copy(getMeshLabelPosition(shape));
  shape.add(nameLabel);
}

function drawCountry(country: CountryData, index: number) {
  // --- Points ---
  const ptsGeom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const colorBoundary = new THREE.Color(0xff0000);
  const colorInternal = new THREE.Color(0xffcc00);
  const colorOffset = new THREE.Color(0x6feb17);

  for (let i = 0; i < country.spherePoints[index].length; i++) {
    const p = country.spherePoints[index][i];
    positions.push(p.x, p.y, p.z);
    const c = country.points[index][i].boundary ? colorBoundary : country.points[index][i].offset ? colorOffset : colorInternal;
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
  country.mesh?.push(new THREE.Mesh(geomSurf, new THREE.MeshStandardMaterial({ color: country.color, side: THREE.DoubleSide })));
  country.mesh?.[index] && surfaceGroup.add(country.mesh[index]);

  country.mesh?.length && drawLabel(country.name, country.mesh[0]);

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
  labelRenderer.render(scene, camera);
}
animate();

