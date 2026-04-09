import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import renderer from "./renderer";

/* ============================================================
   TARGET CONTAINER
============================================================ */

const container = document.querySelector("#simple-surface");
if (!container) {
  throw new Error("Container #simple-surface not found");
}

/* ============================================================
   SCENE, CAMERA, RENDERER
============================================================ */

export const scene = new THREE.Scene();

// make background transparent
scene.background =  null;

export const camera = new THREE.PerspectiveCamera(
  75,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
camera.position.set(3, 3, 5);
camera.lookAt(0, 0, 0);

// renderer.setSize(container.clientWidth, container.clientHeight);
// renderer.setPixelRatio(window.devicePixelRatio);

// 🔑 Mount renderer INSIDE the div
// container.appendChild(renderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.minDistance = 2;
controls.maxDistance = 8;

/* ============================================================
   DRAW POINTS
============================================================ */

const points = {
  A: new THREE.Vector3(0.0, 1.0, 1.0),
  B: new THREE.Vector3(2.0, 0.0, 1.0),
  C: new THREE.Vector3(1.0, 1.0, 0.0),
};

function createPointLabel(
  text: string,
  color: string
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 128;
  canvas.height = 128;

  ctx.fillStyle = color;
  ctx.font = "100px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);

  sprite.scale.set(0.4, 0.4, 0.4);
  return sprite;
}

function createPointMarker(
  position: THREE.Vector3,
  color: number
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.06, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(position);
  return sphere;
}


// Point A
const pointA = createPointMarker(points.A, 0xffffff);
const labelA = createPointLabel("A", "white");
labelA.position.copy(points.A).add(new THREE.Vector3(0, 0.3, 0));
scene.add(pointA, labelA);

// Point B
const pointB = createPointMarker(points.B, 0xffffff);
const labelB = createPointLabel("B", "white");
labelB.position.copy(points.B).add(new THREE.Vector3(0, 0.3, 0));
scene.add(pointB, labelB);

// Point C
const pointC = createPointMarker(points.C, 0xffffff);
const labelC = createPointLabel("C", "white");
labelC.position.copy(points.C).add(new THREE.Vector3(0, 0.3, 0));
scene.add(pointC, labelC);

/* ============================================================
   TRIANGLE
============================================================ */

const geometry = new THREE.BufferGeometry();

const {A,B,C} = points;

const vertices = new Float32Array([
  A.x, A.y, A.z,
  B.x, B.y, B.z,
  C.x, C.y, C.z,
]);

geometry.setAttribute(
  "position",
  new THREE.BufferAttribute(vertices, 3)
);

const material = new THREE.MeshBasicMaterial({
  color: 0xfff000,
  side: THREE.DoubleSide
});

const triangle = new THREE.Mesh(geometry, material);
scene.add(triangle);

/* ============================================================
   AXES
============================================================ */

const axisLength = 3;

scene.add(new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 0),
  axisLength,
  0xff0000
));

scene.add(new THREE.ArrowHelper(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 0),
  axisLength,
  0x00ff00
));

scene.add(new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, 0),
  axisLength,
  0x0000ff
));

/* ============================================================
   AXIS LABELS
============================================================ */

function createAxisLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 128;
  canvas.height = 128;

  ctx.fillStyle = color;
  ctx.font = "70px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.5, 0.5, 0.5);

  return sprite;
}

const xLabel = createAxisLabel("X", "red");
xLabel.position.set(axisLength + 0.3, 0, 0);
scene.add(xLabel);

const yLabel = createAxisLabel("Y", "green");
yLabel.position.set(0, axisLength + 0.3, 0);
scene.add(yLabel);

const zLabel = createAxisLabel("Z", "blue");
zLabel.position.set(0, 0, axisLength + 0.3);
scene.add(zLabel);

/* ============================================================
   EXPORTED ANIMATE FUNCTION
============================================================ */

export function animate(): void {
  controls.update();
  renderer.render(scene, camera);
}

/* ============================================================
   RESIZE HANDLING (DIV-BASED)
============================================================ */

window.addEventListener("resize", () => {
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});
