// C4 Bomb Mechanics Engine.
// Full plant, ticking fuse with accelerating beep LED, defusal timer, and detonation.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createBomb(scene, sites) {
  const c4Group = new THREE.Group();
  c4Group.visible = false;
  scene.add(c4Group);

  // C4 explosive pack geometry
  const packMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8 });
  const packMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.22), packMat);
  packMesh.position.y = 0.06;

  // Digital LED timer / beeper
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) });
  const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.04), ledMat);
  ledMesh.position.set(0, 0.13, 0.04);
  c4Group.add(packMesh, ledMesh);

  // Internal state
  let state = 'idle'; // 'idle', 'planting', 'planted', 'defusing', 'detonated', 'defused'
  let activeSite = null;
  let fuseTime = 40.0;
  let plantProgress = 0;
  let defuseProgress = 0;
  let beepTimer = 0;
  let ledFlash = false;
  const plantTimeNeeded = 3.0;
  const c4Position = new THREE.Vector3();

  function checkInSite(pos) {
    for (const [key, site] of Object.entries(sites)) {
      const dist = Math.hypot(pos.x - site.x, pos.z - site.z);
      if (dist <= site.radius) return key;
    }
    return null;
  }

  return {
    get state() { return state; },
    get activeSite() { return activeSite; },
    get fuse() { return fuseTime; },
    get plantProgress() { return plantProgress / plantTimeNeeded; },
    get defuseProgress() { return defuseProgress; },
    get position() { return c4Position; },
    get isPlanted() { return state === 'planted' || state === 'defusing'; },

    checkPlantable(playerPos) {
      return state === 'idle' && checkInSite(playerPos) !== null;
    },

    startPlanting(playerPos) {
      if (state !== 'idle') return false;
      const site = checkInSite(playerPos);
      if (!site) return false;
      activeSite = site;
      state = 'planting';
      plantProgress = 0;
      return true;
    },

    updatePlanting(dt, isHoldingUse, playerPos) {
      if (state !== 'planting') return false;
      if (!isHoldingUse || !checkInSite(playerPos)) {
        state = 'idle';
        plantProgress = 0;
        return false;
      }
      plantProgress += dt;
      if (plantProgress >= plantTimeNeeded) {
        state = 'planted';
        fuseTime = 40.0;
        c4Position.copy(playerPos);
        c4Position.y = 0.06;
        c4Group.position.copy(c4Position);
        c4Group.visible = true;
        return true; // Successfully planted
      }
      return false;
    },

    checkDefusable(playerPos) {
      if (state !== 'planted' && state !== 'defusing') return false;
      return playerPos.distanceTo(c4Position) <= 2.8;
    },

    startDefusing(playerPos) {
      if (state !== 'planted') return false;
      if (playerPos.distanceTo(c4Position) > 2.8) return false;
      state = 'defusing';
      return true;
    },

    updateDefusing(dt, isHoldingUse, playerPos, hasDefuseKit) {
      if (state !== 'defusing') return false;
      if (!isHoldingUse || playerPos.distanceTo(c4Position) > 3.0) {
        state = 'planted';
        defuseProgress = 0;
        return false;
      }
      const timeNeeded = hasDefuseKit ? 2.5 : 5.0;
      defuseProgress += dt / timeNeeded;
      if (defuseProgress >= 1.0) {
        state = 'defused';
        c4Group.visible = false;
        return true; // Successfully defused
      }
      return false;
    },

    step(dt) {
      if (state === 'planted' || state === 'defusing') {
        fuseTime -= dt;

        // Exponential beep acceleration
        const beepInterval = Math.max(0.12, (fuseTime / 40.0) * 0.9);
        beepTimer += dt;
        if (beepTimer >= beepInterval) {
          beepTimer = 0;
          ledFlash = true;
          ledMat.color.setHex(0xffffff);
        } else if (ledFlash && beepTimer > 0.05) {
          ledFlash = false;
          ledMat.color.setHex(0xe64c4c);
        }

        if (fuseTime <= 0) {
          state = 'detonated';
          c4Group.visible = false;
          return 'detonated';
        }
      }
      return null;
    },

    reset() {
      state = 'idle';
      activeSite = null;
      fuseTime = 40.0;
      plantProgress = 0;
      defuseProgress = 0;
      beepTimer = 0;
      c4Group.visible = false;
    }
  };
}
