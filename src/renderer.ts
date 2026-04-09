import * as THREE from 'three';

let renderer: THREE.WebGLRenderer;

if (!(window as any).__THREE_RENDERER__) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  (window as any).__THREE_RENDERER__ = renderer;
} else {
  renderer = (window as any).__THREE_RENDERER__;
}

export default renderer;