// Pooled visual effects: tracers (one LineSegments), impact sparks (one Points), remote muzzle flashes.
import * as THREE from 'three';

const MAX_TRACERS = 48;
const MAX_PARTICLES = 160;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.scale = 1; // particle budget multiplier (graphics quality)

    // Tracers
    this.tPos = new Float32Array(MAX_TRACERS * 6);
    this.tCol = new Float32Array(MAX_TRACERS * 8);
    this.tLife = new Float32Array(MAX_TRACERS);
    this.tNext = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);

    // Particles
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pNext = 0;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -9999;

    // Remote muzzle flashes: a small pool of sprites
    const fm = new THREE.SpriteMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(fm);
      s.scale.setScalar(0.45);
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, t: 0 });
    }
    this.fNext = 0;
  }

  tracer(from, to, color = [1, 0.85, 0.5], life = 0.09) {
    const i = this.tNext; this.tNext = (this.tNext + 1) % MAX_TRACERS;
    // Start a little in front of the muzzle so the tracer doesn't sit on the camera
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const st = Math.min(0.6, len * 0.5) / len;
    this.tPos.set([from[0] + dx * st, from[1] + dy * st, from[2] + dz * st, to[0], to[1], to[2]], i * 6);
    this.tCol.set([color[0], color[1], color[2], 0.0, color[0], color[1], color[2], 0.9], i * 8);
    this.tLife[i] = life;
  }

  impact(p, n, color = [0.95, 0.85, 0.6], count = 6) {
    count = Math.max(1, Math.round(count * this.scale));
    for (let k = 0; k < count; k++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % MAX_PARTICLES;
      this.pPos[i * 3] = p[0] + n[0] * 0.03; this.pPos[i * 3 + 1] = p[1] + n[1] * 0.03; this.pPos[i * 3 + 2] = p[2] + n[2] * 0.03;
      const sp = 2 + Math.random() * 3;
      this.pVel[i * 3] = (n[0] + (Math.random() - 0.5) * 1.2) * sp;
      this.pVel[i * 3 + 1] = (n[1] + Math.random() * 0.8) * sp;
      this.pVel[i * 3 + 2] = (n[2] + (Math.random() - 0.5) * 1.2) * sp;
      this.pCol[i * 3] = color[0]; this.pCol[i * 3 + 1] = color[1]; this.pCol[i * 3 + 2] = color[2];
      this.pLife[i] = 0.25 + Math.random() * 0.25;
    }
  }

  muzzle(pos) {
    const f = this.flashes[this.fNext]; this.fNext = (this.fNext + 1) % this.flashes.length;
    f.s.position.set(pos[0], pos[1], pos[2]);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.visible = true;
    f.t = 0.05;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.tLife[i] <= 0) continue;
      this.tLife[i] -= dt;
      const a = Math.max(0, this.tLife[i] / 0.09);
      this.tCol[i * 8 + 7] = 0.9 * a;
      this.tCol[i * 8 + 3] = 0.15 * a;
      if (this.tLife[i] <= 0) { this.tPos.fill(0, i * 6, i * 6 + 6); }
      any = true;
    }
    if (any) {
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.tracers.geometry.attributes.color.needsUpdate = true;
    }
    let anyP = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 14 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -9999;
      anyP = true;
    }
    if (anyP) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
    for (const f of this.flashes) {
      if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    }
  }
}
