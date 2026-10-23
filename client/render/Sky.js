// Gradient sky dome with a soft sun glow. Follows the camera; the horizon colour matches the map's
// fog so distant geometry melts into the sky.
import * as THREE from 'three';

export function buildSky({ top, horizon, bottom, sunDir, sunColor }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(top) },
      horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) },
      sunDir: { value: new THREE.Vector3(...sunDir).normalize() },
      sunColor: { value: new THREE.Color(sunColor) },
      sunOn: { value: 1 }, // the sun glow is per pixel; Low quality turns it off
    },
    vertexShader: /* glsl */`
      uniform vec3 top, horizon, bottom;
      varying vec3 vDir;
      varying vec3 vCol;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        float h = vDir.y; // the gradient is computed per vertex: cheap on any GPU
        vCol = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.35), 0.55)) : mix(horizon, bottom, min(1.0, -h * 4.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // always at the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sunColor;
      uniform float sunOn;
      varying vec3 vDir;
      varying vec3 vCol;
      void main() {
        vec3 col = vCol;
        if (sunOn > 0.5) {
          float s = max(0.0, dot(normalize(vDir), sunDir));
          col += sunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.28);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
