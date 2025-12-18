import * as THREE from 'three';

export interface CountryData {
  name: string;
  polygons: LatLon[][];
  points: LatLon[][];
  spherePoints: Vec3[][];
  triangles: [number, number, number][][];
  pointsMesh?: THREE.Points[];
  mesh?: THREE.Mesh[];       // optional, for the surface
  edges?: THREE.LineSegments[]; // optional, for edges
  color: string;
}

export interface LatLon {
  lon: number; lat: number; 
  boundary?: boolean, 
  boundaryIndex?: number,
  offset?: boolean
}

export interface Vec3 { x: number; y: number; z: number; }
