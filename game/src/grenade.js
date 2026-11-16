// Tactical grenades: HE (fragmentation blast) and Smoke (8-second vision-blocking cloud).
// Pooled projectiles with per-axis bounce against the map's boxes, a timed fuze, a pooled blast
// shockwave and pooled smoke clouds. Every mesh, material and vector is made once at start-up.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 22.0;
const RADIUS = 0.06;
const MAX_PROJECTILES = 6;
const MAX_BLASTS = 3;
const MAX_CLOUDS = 3;
const PUFFS = 16;

export const GRENADE_KINDS = {
  he: { fuse: 1.8, color: 0x3d4a38, blastRadius: 6.8, botDamage: 85, playerDamage: 75 },
  smoke: { fuse: 1.6, color: 0x8d969e },
};

export const SMOKE = { life: 8.0, grow: 1.1, fadeFrom: 6.6, radius: 4.2, height: 1.3 };

export function createGrenades(scene, colliders, audio, onNoise) {
  const solids = colliders.filter((c) => c.max.y > 0.01);

  // --- Projectile pool ---
  const bodyGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10);
  const pinGeo = new THREE.TorusGeometry(0.02, 0.005, 6, 12);
  const pinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), metalness: 0.9, roughness: 0.2 });
  const bodyMats = {
    he: new THREE.MeshStandardMaterial({ color: GRENADE_KINDS.he.color, metalness: 0.6, roughness: 0.4 }),
    smoke: new THREE.MeshStandardMaterial({ color: GRENADE_KINDS.smoke.color, metalness: 0.4, roughness: 0.5 }),
  };
  const projectiles = [];
  for (let i = 0; i < MAX_PROJECTILES; i += 1) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMats.he);
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(0, 0.07, 0.02);
    pin.rotation.y = Math.PI / 4;
    mesh.add(body, pin);
    mesh.visible = false;
    scene.add(mesh);
    projectiles.push({ active: false, kind: 'he', mesh, body, pos: mesh.position, vel: new THREE.Vector3(), spin: new THREE.Vector3(), timer: 0, thrower: '', resting: false });
  }

  // --- HE blast pool ---
  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  const blasts = [];
  for (let i = 0; i < MAX_BLASTS; i += 1) {
    const mesh = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0, depthWrite: false }));
    mesh.visible = false;
    scene.add(mesh);
    blasts.push({ active: false, mesh, age: 0, maxAge: 0.38, targetRadius: 4.8 });
  }

  // --- Smoke cloud pool: soft grey puffs in a squat dome around the landing point ---
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const clouds = [];
  for (let i = 0; i < MAX_CLOUDS; i += 1) {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: 0xb9bcc0, transparent: true, opacity: 0, depthWrite: false });
    const puffs = [];
    for (let p = 0; p < PUFFS; p += 1) {
      const a = (p / PUFFS) * Math.PI * 2 * 2.618; // golden-angle spiral, deterministic layout
      const ring = 0.25 + 0.75 * ((p * 7) % PUFFS) / PUFFS;
      const puff = new THREE.Mesh(puffGeo, material);
      puff.userData.home = new THREE.Vector3(Math.cos(a) * ring, ((p * 5) % PUFFS) / PUFFS * 0.9 - 0.15, Math.sin(a) * ring);
      puff.userData.size = 0.45 + ((p * 3) % 5) * 0.07;
      group.add(puff);
      puffs.push(puff);
    }
    group.visible = false;
    scene.add(group);
    clouds.push({ active: false, group, material, puffs, center: new THREE.Vector3(), age: 0, radius: 0 });
  }

  function hitsSolid(p) {
    for (let i = 0; i < solids.length; i += 1) {
      const c = solids[i];
      if (p.x > c.min.x - RADIUS && p.x < c.max.x + RADIUS
        && p.z > c.min.z - RADIUS && p.z < c.max.z + RADIUS
        && p.y > c.min.y - RADIUS && p.y < c.max.y + RADIUS) return true;
    }
    return false;
  }

  function bounceSound(speed) {
    if (audio && speed > 1.5) audio.playGrenadeBounce();
  }

  function deploySmoke(position) {
    let cloud = clouds.find((c) => !c.active);
    if (!cloud) cloud = clouds.reduce((oldest, c) => (c.age > oldest.age ? c : oldest), clouds[0]);
    cloud.active = true;
    cloud.age = 0;
    cloud.radius = 0;
    cloud.center.set(position.x, SMOKE.height, position.z);
    cloud.group.position.set(position.x, 0, position.z);
    cloud.group.visible = true;
    if (audio) audio.playSmokePop();
    if (onNoise) onNoise(position, 14);
    return cloud;
  }

  function detonateHe(g, bots, player, hud, onShake) {
    const spec = GRENADE_KINDS.he;
    if (audio) audio.playExplosion();
    if (onShake) onShake(0.08);
    if (onNoise) onNoise(g.pos, 32);

    const blast = blasts.find((b) => !b.active) ?? blasts[0];
    blast.active = true;
    blast.age = 0;
    blast.mesh.position.copy(g.pos);
    blast.mesh.scale.setScalar(0.4);
    blast.mesh.visible = true;

    if (bots) {
      for (const bot of bots.items) {
        if (!bot.alive) continue;
        const dist = bot.position.distanceTo(g.pos);
        if (dist <= spec.blastRadius) {
          const killed = bots.damage(bot.torso, Math.round(spec.botDamage * (1 - dist / spec.blastRadius)), false, g.thrower);
          if (hud && g.thrower === 'Player') hud.hitMarker(killed, 140);
        }
      }
    }
    if (player && player.state.health > 0) {
      const dist = player.state.position.distanceTo(g.pos);
      if (dist <= spec.blastRadius) {
        player.damage(Math.round(spec.playerDamage * (1 - dist / spec.blastRadius)), false);
        if (hud) hud.setHealth(player.state.health, player.state.armor);
      }
    }
  }

  function stepProjectile(g, dt) {
    if (g.resting) return;
    g.vel.y -= GRAVITY * dt;

    // Per-axis integration: whichever axis moves the grenade into a box is reflected and damped.
    g.pos.x += g.vel.x * dt;
    if (hitsSolid(g.pos)) { g.pos.x -= g.vel.x * dt; bounceSound(Math.abs(g.vel.x)); g.vel.x *= -0.5; }
    g.pos.z += g.vel.z * dt;
    if (hitsSolid(g.pos)) { g.pos.z -= g.vel.z * dt; bounceSound(Math.abs(g.vel.z)); g.vel.z *= -0.5; }
    g.pos.y += g.vel.y * dt;
    let landed = false;
    if (hitsSolid(g.pos)) {
      g.pos.y -= g.vel.y * dt;
      landed = g.vel.y < 0;
      bounceSound(Math.abs(g.vel.y));
      g.vel.y *= -0.4;
      g.vel.x *= 0.78;
      g.vel.z *= 0.78;
    }
    if (g.pos.y <= RADIUS) {
      g.pos.y = RADIUS;
      landed = true;
      bounceSound(Math.abs(g.vel.y));
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.78;
      g.vel.z *= 0.78;
    }
    if (landed && g.vel.lengthSq() < 0.5) {
      g.vel.set(0, 0, 0);
      g.resting = true;
    }
    g.mesh.rotation.x += g.spin.x * dt;
    g.mesh.rotation.y += g.spin.y * dt;
    g.mesh.rotation.z += g.spin.z * dt;
  }

  function stepCloud(cloud, dt) {
    cloud.age += dt;
    if (cloud.age >= SMOKE.life) {
      cloud.active = false;
      cloud.group.visible = false;
      cloud.radius = 0;
      return;
    }
    const grow = Math.min(1, cloud.age / SMOKE.grow);
    const eased = 1 - (1 - grow) * (1 - grow);
    cloud.radius = SMOKE.radius * eased;
    const fade = cloud.age > SMOKE.fadeFrom ? 1 - (cloud.age - SMOKE.fadeFrom) / (SMOKE.life - SMOKE.fadeFrom) : 1;
    cloud.material.opacity = 0.93 * fade;
    const drift = cloud.age * 0.35;
    for (let i = 0; i < cloud.puffs.length; i += 1) {
      const puff = cloud.puffs[i];
      const home = puff.userData.home;
      const s = cloud.radius * puff.userData.size * (0.92 + 0.08 * Math.sin(drift + i));
      puff.scale.setScalar(Math.max(0.01, s));
      puff.position.set(home.x * cloud.radius, SMOKE.height * 0.55 + home.y * cloud.radius, home.z * cloud.radius);
    }
  }

  return {
    get clouds() { return clouds; },

    throwGrenade(origin, forwardDir, inheritVelocity, thrower = 'Player', kind = 'he') {
      const g = projectiles.find((p) => !p.active);
      if (!g) return false;
      g.active = true;
      g.kind = kind;
      g.thrower = thrower;
      g.timer = GRENADE_KINDS[kind].fuse;
      g.resting = false;
      g.body.material = bodyMats[kind];
      g.pos.copy(origin).addScaledVector(forwardDir, 0.4);
      g.vel.copy(forwardDir).multiplyScalar(18.0).addScaledVector(inheritVelocity, 0.4);
      g.vel.y += 3.8;
      g.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 14);
      g.mesh.visible = true;
      if (audio) audio.playGrenadeThrow();
      return true;
    },

    step(dt, bots, player, hud, onShake) {
      for (let i = 0; i < projectiles.length; i += 1) {
        const g = projectiles[i];
        if (!g.active) continue;
        stepProjectile(g, dt);
        g.timer -= dt;
        if (g.timer <= 0) {
          if (g.kind === 'smoke') deploySmoke(g.pos);
          else detonateHe(g, bots, player, hud, onShake);
          g.active = false;
          g.mesh.visible = false;
        }
      }
      for (let i = 0; i < blasts.length; i += 1) {
        const b = blasts[i];
        if (!b.active) continue;
        b.age += dt;
        const progress = b.age / b.maxAge;
        if (progress >= 1) {
          b.active = false;
          b.mesh.visible = false;
        } else {
          b.mesh.scale.setScalar(THREE.MathUtils.lerp(0.4, b.targetRadius, Math.sqrt(progress)));
          b.mesh.material.opacity = (1 - progress) * 0.85;
        }
      }
      for (let i = 0; i < clouds.length; i += 1) {
        if (clouds[i].active) stepCloud(clouds[i], dt);
      }
    },

    // True when the segment a->b passes through a live smoke cloud (thin edges and the last
    // moments of the fade let sight through).
    smokeBlocks(a, b) {
      for (let i = 0; i < clouds.length; i += 1) {
        const c = clouds[i];
        if (!c.active || c.radius < 0.8 || c.age > SMOKE.life - 0.6) continue;
        const r = c.radius * 0.9;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const lenSq = dx * dx + dy * dy + dz * dz;
        let t = lenSq > 0 ? ((c.center.x - a.x) * dx + (c.center.y - a.y) * dy + (c.center.z - a.z) * dz) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + dx * t - c.center.x;
        const py = (a.y + dy * t - c.center.y) * 1.6; // squat dome: thinner vertically
        const pz = a.z + dz * t - c.center.z;
        if (px * px + py * py + pz * pz < r * r) return true;
      }
      return false;
    },

    insideSmoke(x, z) {
      for (let i = 0; i < clouds.length; i += 1) {
        const c = clouds[i];
        if (!c.active || c.radius < 0.8 || c.age > SMOKE.life - 0.6) continue;
        const dx = x - c.center.x;
        const dz = z - c.center.z;
        if (dx * dx + dz * dz < c.radius * c.radius * 0.81) return true;
      }
      return false;
    },

    // Deterministic smoke for screenshots: deploy and advance a cloud to a given age.
    spawnSmokeAt(position, age = 2.5) {
      const cloud = deploySmoke(position);
      stepCloud(cloud, age);
      return cloud;
    },

    reset() {
      for (const g of projectiles) { g.active = false; g.mesh.visible = false; }
      for (const b of blasts) { b.active = false; b.mesh.visible = false; }
      for (const c of clouds) { c.active = false; c.group.visible = false; c.radius = 0; }
    },
  };
}
