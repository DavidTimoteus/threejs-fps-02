// Tactical High-Explosive (HE) Grenade & Ballistics Simulation.
// Implements parabolic trajectory, realistic surface bouncing, timed fuze, concussive shockwave, and area damage.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createGrenades(scene, colliders, audio) {
  const activeGrenades = [];
  const activeExplosions = [];

  // Reusable materials & geometries for zero-allocation performance
  const grenadeGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a38, metalness: 0.6, roughness: 0.4 }); // Olive tactical drab
  const pinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), metalness: 0.9, roughness: 0.2 });

  const blastGeo = new THREE.SphereGeometry(1, 16, 12);
  const blastMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.85 });

  function createGrenadeMesh() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(grenadeGeo, grenadeMat);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12), pinMat);
    pin.position.set(0, 0.07, 0.02);
    pin.rotation.y = Math.PI / 4;
    group.add(body, pin);
    return group;
  }

  return {
    get activeCount() { return activeGrenades.length; },

    throwGrenade(origin, forwardDir, playerVelocity, throwerName = 'Player') {
      const mesh = createGrenadeMesh();
      mesh.position.copy(origin).addScaledVector(forwardDir, 0.4);
      scene.add(mesh);

      // Ballistic throw vector: forward speed 18 m/s with arc lift
      const vel = new THREE.Vector3()
        .copy(forwardDir)
        .multiplyScalar(18.0)
        .add(new THREE.Vector3(0, 3.8, 0))
        .addScaledVector(playerVelocity, 0.4);

      activeGrenades.push({
        mesh,
        vel,
        pos: mesh.position,
        timer: 1.8, // 1.8s fuse
        throwerName,
        rotSpeed: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 14)
      });

      if (audio) audio.playGrenadeThrow();
    },

    step(dt, bots, player, hud, onScreenshake) {
      // 1. Step Grenade Physics
      for (let i = activeGrenades.length - 1; i >= 0; i--) {
        const g = activeGrenades[i];
        g.timer -= dt;

        // Apply gravity
        g.vel.y -= 22.0 * dt;

        // Step position
        g.pos.x += g.vel.x * dt;
        g.pos.y += g.vel.y * dt;
        g.pos.z += g.vel.z * dt;

        // Tumble rotation
        g.mesh.rotation.x += g.rotSpeed.x * dt;
        g.mesh.rotation.y += g.rotSpeed.y * dt;
        g.mesh.rotation.z += g.rotSpeed.z * dt;

        // Floor collision
        if (g.pos.y <= 0.08) {
          g.pos.y = 0.08;
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.82;
          g.vel.z *= 0.82;
          if (audio && Math.abs(g.vel.y) > 1.2) audio.playGrenadeBounce();
        }

        // Map wall / obstacle collisions
        for (const col of colliders) {
          if (
            g.pos.x >= col.minX - 0.1 && g.pos.x <= col.maxX + 0.1 &&
            g.pos.z >= col.minZ - 0.1 && g.pos.z <= col.maxZ + 0.1 &&
            g.pos.y >= col.minY && g.pos.y <= col.maxY
          ) {
            // Reflect velocity with bounce damping
            const dxMin = Math.abs(g.pos.x - col.minX);
            const dxMax = Math.abs(g.pos.x - col.maxX);
            const dzMin = Math.abs(g.pos.z - col.minZ);
            const dzMax = Math.abs(g.pos.z - col.maxZ);
            const minD = Math.min(dxMin, dxMax, dzMin, dzMax);

            if (minD === dxMin || minD === dxMax) {
              g.vel.x *= -0.55;
            } else {
              g.vel.z *= -0.55;
            }
            if (audio) audio.playGrenadeBounce();
            break;
          }
        }

        // Fuze detonation
        if (g.timer <= 0) {
          this.detonate(g, bots, player, hud, onScreenshake);
          scene.remove(g.mesh);
          activeGrenades.splice(i, 1);
        }
      }

      // 2. Step Active Explosions
      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const exp = activeExplosions[i];
        exp.age += dt;
        const progress = exp.age / exp.maxAge;
        if (progress >= 1.0) {
          scene.remove(exp.mesh);
          activeExplosions.splice(i, 1);
        } else {
          const scale = THREE.MathUtils.lerp(0.4, exp.targetRadius, Math.sqrt(progress));
          exp.mesh.scale.set(scale, scale, scale);
          exp.mesh.material.opacity = (1.0 - progress) * 0.85;
        }
      }
    },

    detonate(g, bots, player, hud, onScreenshake) {
      if (audio) audio.playExplosion();
      if (onScreenshake) onScreenshake(0.08);

      // Create visual shockwave sphere
      const expMesh = new THREE.Mesh(blastGeo, blastMat.clone());
      expMesh.position.copy(g.pos);
      expMesh.scale.set(0.4, 0.4, 0.4);
      scene.add(expMesh);
      activeExplosions.push({ mesh: expMesh, age: 0, maxAge: 0.38, targetRadius: 4.8 });

      const blastRadius = 6.8;

      // 1. Damage bots in range
      if (bots && bots.items) {
        for (const bot of bots.items) {
          if (!bot.alive) continue;
          const dist = bot.position.distanceTo(g.pos);
          if (dist <= blastRadius) {
            const dmg = Math.round(85 * (1.0 - dist / blastRadius));
            const killed = bots.damage(bot.torso, dmg, false, g.throwerName);
            if (hud) hud.hitMarker(killed, 140);
          }
        }
      }

      // 2. Damage player in range
      if (player && player.state.health > 0) {
        const pDist = player.state.position.distanceTo(g.pos);
        if (pDist <= blastRadius) {
          const pDmg = Math.round(75 * (1.0 - pDist / blastRadius));
          player.damage(pDmg, false);
          if (hud) hud.setHealth(player.state.health, player.state.armor);
        }
      }
    },

    reset() {
      for (const g of activeGrenades) scene.remove(g.mesh);
      activeGrenades.length = 0;
      for (const e of activeExplosions) scene.remove(e.mesh);
      activeExplosions.length = 0;
    }
  };
}
