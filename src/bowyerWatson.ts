import * as THREE from "three";
import { Delaunay2D } from "./delaunate";
import renderer from "./renderer";

export class DelaunayVisualizer {
  public scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private delaunay: Delaunay2D;

  private currentIndex = 0;
  private triangleLines?: THREE.LineSegments;
  private pointMesh?: THREE.Points;

  public auto = false;

  constructor(delaunay: Delaunay2D, width = 400, height = 400) {
    this.delaunay = delaunay;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    // Camera
    const size = 200;
    this.camera = new THREE.OrthographicCamera(
      -size, size, size, -size, 0.1, 1000
    );
    this.camera.position.z = 10;

    const container = document.querySelector("#delauney-vis");
    if (!container) {
        throw new Error("Container for delauney visualizer not found");
    }

    // Renderer
    // renderer.setSize(width, height);
    // container.appendChild(renderer.domElement);

    // Remove super triangle
    this.delaunay.triangles = [];

    this.renderPoints();
    this.renderTriangles();
  }

  // --------------------------------------------------

  public step() {
    if (this.currentIndex >= this.delaunay.points.length - 3) return;

    this.delaunay.insertPoint(this.currentIndex);
    this.currentIndex++;

    this.renderPoints();
    this.renderTriangles();
  }

  public update() {
    if (this.auto) {
      this.step();
    }
  }

  public render() {
    renderer.render(this.scene, this.camera);
  }

  // --------------------------------------------------

  private renderPoints() {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];

    for (let i = 0; i < this.currentIndex; i++) {
      const p = this.delaunay.points[i];
      vertices.push(p.x, p.y, 0);
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );

    const material = new THREE.PointsMaterial({
      color: 0xff4444,
      size: 4,
      sizeAttenuation: false
    });

    if (this.pointMesh) this.scene.remove(this.pointMesh);

    this.pointMesh = new THREE.Points(geometry, material);
    this.scene.add(this.pointMesh);
  }

  private renderTriangles() {
    const vertices: number[] = [];

    for (const t of this.delaunay.triangles) {
      const A = this.delaunay.points[t.a];
      const B = this.delaunay.points[t.b];
      const C = this.delaunay.points[t.c];

      vertices.push(
        A.x, A.y, 0, B.x, B.y, 0,
        B.x, B.y, 0, C.x, C.y, 0,
        C.x, C.y, 0, A.x, A.y, 0
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );

    const material = new THREE.LineBasicMaterial({ color: 0xffffff });

    if (this.triangleLines) this.scene.remove(this.triangleLines);

    this.triangleLines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.triangleLines);
  }
}
