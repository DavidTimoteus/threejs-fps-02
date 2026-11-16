// Weapon arsenal: knife, Desert Eagle, MP5-SD, AK-47, AWP, HE and smoke grenades.
// Per-weapon recoil, spread bloom, reload state machine and ADS zoom, plus ownership: only the
// knife and pistol are free; everything else is bought in the buy menu and kept until death.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_TYPES = {
  knife: {
    id: 'knife', name: 'Tactical Knife', slot: 3, type: 'melee',
    damage: 55, range: 2.2, fireRate: 0.45, magSize: 0, reserveMax: 0,
    recoil: 0, baseSpread: 0, movePenalty: 0, adsFov: 74, noise: 4,
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 2, type: 'pistol',
    damage: 48, fireRate: 0.22, reloadTime: 2.1, magSize: 7, reserveMax: 35,
    recoil: 0.035, recoilRecovery: 8.0, baseSpread: 0.004, movePenalty: 0.025, crouchBonus: 0.65, adsFov: 62, noise: 26,
  },
  mp5: {
    id: 'mp5', name: 'MP5-SD', slot: 1, type: 'smg',
    damage: 26, fireRate: 0.075, reloadTime: 2.2, magSize: 30, reserveMax: 120,
    recoil: 0.014, recoilRecovery: 11.0, baseSpread: 0.009, movePenalty: 0.022, crouchBonus: 0.7, adsFov: 64, noise: 11,
  },
  ak47: {
    id: 'ak47', name: 'AK-47 Rifle', slot: 1, type: 'rifle',
    damage: 36, fireRate: 0.10, reloadTime: 2.5, magSize: 30, reserveMax: 90,
    recoil: 0.024, recoilRecovery: 9.5, baseSpread: 0.007, movePenalty: 0.045, crouchBonus: 0.55, adsFov: 58, noise: 30,
  },
  awp: {
    id: 'awp', name: 'AWP Sniper', slot: 1, type: 'sniper',
    damage: 115, fireRate: 1.35, reloadTime: 3.4, magSize: 5, reserveMax: 20,
    recoil: 0.08, recoilRecovery: 5.0, baseSpread: 0.001, movePenalty: 0.15, crouchBonus: 0.40, adsFov: 24, noise: 36,
  },
  heGrenade: {
    id: 'heGrenade', name: 'HE Grenade', slot: 4, type: 'grenade', kind: 'he',
    damage: 85, fireRate: 0.75, reloadTime: 0, magSize: 1, reserveMax: 0,
    recoil: 0.01, recoilRecovery: 10.0, baseSpread: 0, movePenalty: 0, adsFov: 74, noise: 6,
  },
  smokeGrenade: {
    id: 'smokeGrenade', name: 'Smoke Grenade', slot: 5, type: 'grenade', kind: 'smoke',
    damage: 0, fireRate: 0.75, reloadTime: 0, magSize: 1, reserveMax: 0,
    recoil: 0.01, recoilRecovery: 10.0, baseSpread: 0, movePenalty: 0, adsFov: 74, noise: 6,
  },
};

const FREE_WEAPONS = ['knife', 'deagle'];

export function createWeapon(camera) {
  const group = new THREE.Group();
  camera.add(group);

  const gunMetalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), metalness: 0.8, roughness: 0.35 });
  const gunWoodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.75 });
  const polymerMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6 });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffde7a, transparent: true, opacity: 0 });

  const weaponMeshes = {};
  function part(geo, mat, x = 0, y = 0, z = 0, rx = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    return m;
  }
  function addMesh(id, parts, x, y, z) {
    const g = new THREE.Group();
    g.add(...parts);
    g.position.set(x, y, z);
    g.userData.rest = new THREE.Vector3(x, y, z);
    group.add(g);
    weaponMeshes[id] = g;
    return g;
  }
  const barrel = (r, len) => new THREE.CylinderGeometry(r, r, len, 8);

  addMesh('knife', [
    part(new THREE.BoxGeometry(0.03, 0.06, 0.22), gunMetalMat, 0, 0, -0.11),
    part(new THREE.BoxGeometry(0.035, 0.04, 0.12), gunWoodMat, 0, -0.01, 0.06),
  ], 0.24, -0.22, -0.42).rotation.set(0.1, -0.2, 0);
  addMesh('deagle', [
    part(new THREE.BoxGeometry(0.045, 0.06, 0.24), gunMetalMat),
    part(new THREE.BoxGeometry(0.04, 0.13, 0.06), gunWoodMat, 0, -0.08, 0.06, -0.25),
  ], 0.25, -0.24, -0.48);
  addMesh('mp5', [
    part(new THREE.BoxGeometry(0.05, 0.07, 0.34), polymerMat),
    part(barrel(0.022, 0.26), gunMetalMat, 0, 0.012, -0.29, Math.PI / 2), // integral suppressor
    part(new THREE.BoxGeometry(0.035, 0.15, 0.05), gunMetalMat, 0, -0.1, -0.06, 0.3),
    part(new THREE.BoxGeometry(0.04, 0.06, 0.18), polymerMat, 0, -0.01, 0.24),
  ], 0.25, -0.22, -0.5);
  addMesh('ak47', [
    part(new THREE.BoxGeometry(0.05, 0.07, 0.44), gunMetalMat),
    part(barrel(0.012, 0.32), gunMetalMat, 0, 0.015, -0.36, Math.PI / 2),
    part(new THREE.BoxGeometry(0.045, 0.09, 0.22), gunWoodMat, 0, -0.03, 0.28),
    part(new THREE.BoxGeometry(0.04, 0.16, 0.07), gunMetalMat, 0, -0.10, -0.08, 0.25),
  ], 0.26, -0.22, -0.52);
  addMesh('awp', [
    part(new THREE.BoxGeometry(0.06, 0.08, 0.52), gunMetalMat),
    part(barrel(0.014, 0.48), gunMetalMat, 0, 0.02, -0.48, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.026, 0.026, 0.22, 12), gunMetalMat, 0, 0.075, -0.05, Math.PI / 2),
  ], 0.28, -0.24, -0.56);
  const grenadeBody = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10);
  const grenadePin = new THREE.TorusGeometry(0.02, 0.005, 6, 12);
  for (const [id, color] of [['heGrenade', 0x3d4a38], ['smokeGrenade', 0x8d969e]]) {
    const pin = part(grenadePin, gunMetalMat, 0, 0.07, 0.02);
    pin.rotation.y = Math.PI / 4;
    addMesh(id, [part(grenadeBody, new THREE.MeshStandardMaterial({ color, roughness: 0.5 })), pin], 0.22, -0.20, -0.40);
  }

  const flashMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), flashMat);
  flashMesh.position.set(0.26, -0.20, -0.86);
  group.add(flashMesh);

  // Ammunition per weapon and the set of weapons the player owns this life.
  const inventory = {};
  for (const id of Object.keys(WEAPON_TYPES)) inventory[id] = { currentMag: 0, reserve: 0 };
  const owned = new Set(FREE_WEAPONS);
  let primary = null;

  let currentId = 'deagle';
  let weaponDef = WEAPON_TYPES.deagle;
  let cooldown = 0;
  let reloadTimer = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let flashTime = 0;
  let shotCount = 0;
  let isAds = false;
  const stateView = { id: '', name: '', mag: 0, reserve: 0, isReloading: false, recoilPitch: 0, recoilYaw: 0 };

  function fillAmmo(id) {
    const def = WEAPON_TYPES[id];
    if (def.type === 'grenade') return;
    inventory[id].currentMag = def.magSize;
    inventory[id].reserve = def.reserveMax;
  }

  function updateActiveMesh() {
    for (const id in weaponMeshes) weaponMeshes[id].visible = id === currentId;
  }
  fillAmmo('deagle');
  updateActiveMesh();

  function equip(id) {
    if (!WEAPON_TYPES[id] || id === currentId || !owned.has(id)) return false;
    currentId = id;
    weaponDef = WEAPON_TYPES[id];
    cooldown = 0.25;
    reloadTimer = 0;
    shotCount = 0;
    isAds = false;
    updateActiveMesh();
    return true;
  }

  return {
    get current() { return currentId; },
    get def() { return weaponDef; },
    get isAds() { return isAds; },
    get primary() { return primary; },
    get state() {
      const inv = inventory[currentId];
      stateView.id = currentId;
      stateView.name = weaponDef.name;
      stateView.mag = inv.currentMag;
      stateView.reserve = inv.reserve;
      stateView.isReloading = reloadTimer > 0;
      stateView.recoilPitch = recoilPitch;
      stateView.recoilYaw = recoilYaw;
      return stateView;
    },
    owns(id) { return owned.has(id); },
    grenadeCount() { return inventory.heGrenade.currentMag + inventory.smokeGrenade.currentMag; },
    equip,
    // Slot keys: 1 primary, 2 pistol, 3 knife, 4 HE, 5 smoke.
    equipSlot(slot) {
      if (slot === 1 && primary) return equip(primary);
      if (slot === 2) return equip('deagle');
      if (slot === 3) return equip('knife');
      if (slot === 4) return equip('heGrenade');
      if (slot === 5) return equip('smokeGrenade');
      return false;
    },
    // A bought weapon: guns arrive full, grenades stack one at a time (one of each kind).
    give(id) {
      const def = WEAPON_TYPES[id];
      if (!def) return false;
      if (def.type === 'grenade') {
        if (inventory[id].currentMag >= 1) return false;
        inventory[id].currentMag = 1;
      } else {
        if (def.slot === 1 && primary && primary !== id) owned.delete(primary);
        if (def.slot === 1) primary = id;
        fillAmmo(id);
      }
      owned.add(id);
      if (currentId === id) { currentId = ''; }
      return equip(id);
    },
    // Death: everything but the free weapons is dropped.
    loseAll() {
      owned.clear();
      for (const id of FREE_WEAPONS) owned.add(id);
      primary = null;
      inventory.heGrenade.currentMag = 0;
      inventory.smokeGrenade.currentMag = 0;
      currentId = '';
      equip('deagle');
    },
    setAds(active) {
      isAds = active && weaponDef.type !== 'melee' && weaponDef.type !== 'grenade';
    },
    ready() {
      return cooldown <= 0 && reloadTimer <= 0;
    },
    takeRound() {
      if (weaponDef.type === 'melee') return true;
      const inv = inventory[currentId];
      if (weaponDef.type === 'grenade') {
        if (inv.currentMag <= 0) return false;
        inv.currentMag = 0;
        owned.delete(currentId);
        return true;
      }
      if (inv.currentMag <= 0) {
        this.reload();
        return false;
      }
      inv.currentMag -= 1;
      shotCount += 1;
      return true;
    },
    pullTrigger() {
      cooldown = weaponDef.fireRate;
      if (weaponDef.type !== 'grenade' && weaponDef.type !== 'melee') {
        flashTime = 0.045;
        flashMesh.material.opacity = 1.0;
      }
      const kick = weaponDef.recoil;
      recoilPitch += kick;
      recoilYaw += (Math.random() - 0.5) * kick * 0.75;
    },
    reload() {
      if (weaponDef.type === 'melee' || weaponDef.type === 'grenade' || reloadTimer > 0) return;
      const inv = inventory[currentId];
      if (inv.currentMag >= weaponDef.magSize || inv.reserve <= 0) return;
      reloadTimer = weaponDef.reloadTime;
    },
    // New round: owned guns are topped up; grenades are only what was bought.
    refill() {
      for (const id of owned) fillAmmo(id);
      cooldown = 0;
      reloadTimer = 0;
      shotCount = 0;
    },
    spread(speed, isCrouching, isWalking) {
      let s = weaponDef.baseSpread;
      if (isCrouching) s *= (weaponDef.crouchBonus || 0.6);
      if (isWalking) s *= 0.8;
      s += (speed / 5.5) * weaponDef.movePenalty;
      s += Math.min(0.04, shotCount * 0.002);
      if (isAds && weaponDef.type === 'sniper') s = 0.0005 + (speed / 5.5) * weaponDef.movePenalty;
      return s;
    },
    addRecoil(pitch, yaw) {
      recoilPitch += pitch;
      recoilYaw += yaw;
    },
    step(dt) {
      if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
      if (cooldown === 0 && shotCount > 0) shotCount = Math.max(0, shotCount - 1);
      if (flashTime > 0) {
        flashTime -= dt;
        if (flashTime <= 0) flashMesh.material.opacity = 0;
      }
      const recFactor = Math.exp(-(weaponDef.recoilRecovery || 8.0) * dt);
      recoilPitch *= recFactor;
      recoilYaw *= recFactor;

      if (reloadTimer > 0) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
          const inv = inventory[currentId];
          const transfer = Math.min(weaponDef.magSize - inv.currentMag, inv.reserve);
          inv.currentMag += transfer;
          inv.reserve -= transfer;
          shotCount = 0;
        }
      }

      const activeMesh = weaponMeshes[currentId];
      if (activeMesh) {
        const rest = activeMesh.userData.rest;
        if (reloadTimer > 0) {
          activeMesh.rotation.x = -0.4;
          activeMesh.position.y = rest.y - 0.1;
        } else {
          activeMesh.rotation.x = THREE.MathUtils.lerp(activeMesh.rotation.x, 0, 0.15);
          activeMesh.position.y = THREE.MathUtils.lerp(activeMesh.position.y, isAds ? rest.y + 0.07 : rest.y, 0.2);
          activeMesh.position.x = THREE.MathUtils.lerp(activeMesh.position.x, isAds ? 0 : rest.x, 0.2);
        }
      }
    },
  };
}
