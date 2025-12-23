import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { CountryData } from './types';
import { countries, generateCountryData, isBoundarySequenceTriangle, loadAllCountries } from './countries';
import { formatPopulationData, loadCSV } from './helper';


const populationCsv = await loadCSV('API_SP.POP.TOTL_DS2_en_csv_v2_34.csv');
const populationData = formatPopulationData(populationCsv);
let populationYear = '2024';
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
    color: 0x195F89, transparent: false, opacity: 0.25,
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

async function buildScene() {
  await loadAllCountries();
  generateCountryData();
  surfaceGroup.children.forEach(mesh => {
    mesh.children
    .filter(c => c instanceof CSS2DObject)
    .forEach(label => {
      mesh.remove(label);
      label.element.remove(); // IMPORTANT
    });
  });
  ptsGroup.clear();
  triGroup.clear();
  surfaceGroup.clear();
  let previousCountry: CountryData | undefined = undefined;
  for (const country of countries) {
    if(previousCountry && previousCountry.mesh && previousCountry.name !== country.name) {
      const meshIndex = meshNumber[previousCountry.name] || 0;
      const population = populationData?.countries?.[previousCountry.name]?.[populationYear];
      previousCountry.label = drawLabel(previousCountry.name, previousCountry.mesh[meshIndex], population?.population);
    }
    for (let i = 0; i < country.polygons.length; i++) {
      drawCountry(country, i);
    }
    previousCountry = country;
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

function formatPopulationForDisplay(population: number) {
  if (isNaN(population)) return 'No Data';
  const populationAsString = String(population);
  let formatted = '';
  let distance = 0;
  for (let i = populationAsString.length - 1; i > -1; i--) {
    formatted = populationAsString[i] + formatted;
    distance++;
    if (distance === 3 && i !== 0) {
      formatted = ',' + formatted;
      distance = 0;
    }
  }
  return formatted;
}

function drawLabel(
  name: string,
  shape: THREE.Mesh,
  population: number
): CSS2DObject {

  const nameDiv = document.createElement('div');
  nameDiv.className = 'label';
  nameDiv.style.color = 'white';
  nameDiv.style.fontSize = '8px';

  const nameP = document.createElement('p');
  nameP.textContent = name;

  const populationP = document.createElement('p');
  populationP.style.fontWeight = 'bold';
  populationP.textContent = formatPopulationForDisplay(population);

  nameDiv.appendChild(nameP);
  nameDiv.appendChild(populationP);

  const label = new CSS2DObject(nameDiv);

  // store reference for later updates
  (label as any).populationEl = populationP;

  // horizon culling (your existing logic)
  const tmpPos = new THREE.Vector3();
  const tmpCamDir = new THREE.Vector3();
  const globeCenter = new THREE.Vector3();

  label.onBeforeRender = (_, __, camera) => {
    label.getWorldPosition(tmpPos);
    const normal = tmpPos.sub(globeCenter).normalize();
    tmpCamDir.copy(camera.position).sub(globeCenter).normalize();
    label.element.style.display =
      normal.dot(tmpCamDir) > 0.7 ? 'block' : 'none';
  };

  label.position.copy(getMeshLabelPosition(shape));
  shape.add(label);

  return label;
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
  const population = populationData?.countries?.[country.name]?.[populationYear];
  country.mesh?.push(new THREE.Mesh(geomSurf, new THREE.MeshStandardMaterial({ color: population?.color || 0xffffff, side: THREE.DoubleSide })));
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

const meshNumber: Record<string, number> = {
  'Indonesia': 7,
  'China': 1,
  'North Korea': 1,
  'Philippines': 1,
  'Chile': 1,
  'South Africa': 1,
  'Angola': 1,
  'France': 1,
  'Russia': 1,
  'Norway': 1,
  'United Kingdom': 1,
  'Greece': 1,
  'Australia': 1,
  'Antarctica': 7
}

const uiContainer = document.createElement('div');
uiContainer.style.position = 'fixed';
uiContainer.style.fontFamily = 'Arial';
uiContainer.style.fontSize = '12px';
uiContainer.style.top = '50px';
uiContainer.style.left = '10px';
uiContainer.style.backgroundColor = 'rgba(0,0,0,0.4)';
uiContainer.style.padding = '10px';
uiContainer.style.borderRadius = '5px';
uiContainer.style.zIndex = '10';
uiContainer.style.color = '#fff';
document.body.appendChild(uiContainer);

function createToggle(labelText: string, targetGroup: THREE.Group, defaultValue = true) {
  targetGroup.visible = defaultValue;

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

export function createRangeSlider({
  min = 1960,
  max = 2024,
  step = 1,
  value = max,
  onChange
}: {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
}) {
  const slider = document.createElement('input');
  slider.type = 'range';

  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);

  slider.addEventListener('input', () => {
    onChange?.(Number(slider.value));
  });

  uiContainer.appendChild(slider);
}

function updatePopulationYear() {
  for (const country of countries) {
    const pop = populationData?.countries?.[country.name]?.[populationYear];
    if (!pop) continue;

    // update mesh colors
    country.mesh?.forEach(mesh => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(pop.color);
      material.needsUpdate = true;
    });

    // update label text
    if (country.label) {
      const popEl = (country.label as any).populationEl as HTMLParagraphElement;
      popEl.textContent = formatPopulationForDisplay(pop.population);
    }
  }
}

createToggle('Show Points', ptsGroup, false);
createToggle('Show Edges', triGroup, false);
createToggle('Show Surfaces', surfaceGroup, true);
createRangeSlider({onChange: (value) => {
  populationYear = String(value);
  updatePopulationYear();
}});

// --- Start ---
buildScene();
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

