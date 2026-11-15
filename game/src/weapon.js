// Tactical Weapon Arsenal & Ballistics Engine.
// Models Knife, Deagle, AK-47, and AWP with distinct recoil tables, spread bloom, reload state machine, and ADS zoom.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPON_TYPES = {
  knife: {
    id: 'knife',
    name: 'Tactical Knife',
    slot: 3,
    type: 'melee',
    damage: 55,
    backstabDamage: 125,
    range: 2.2,
    fireRate: 0.45,
    magSize: 0,
    reserveMax: 0,
    recoil: 0,
    baseSpread: 0,
    movePenalty: 0,
    adsFov: 74,
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 2,
    type: 'pistol',
    damage: 48,
    fireRate: 0.22,
    reloadTime: 2.1,
    magSize: 7,
    reserveMax: 35,
    recoil: 0.035,
    recoilRecovery: 8.0,
    baseSpread: 0.004,
    movePenalty: 0.025,
    crouchBonus: 0.65,
    adsFov: 62,
  },
  ak47: {
    id: 'ak47',
    name: 'AK-47 Rifle',
    slot: 1,
    type: 'rifle',
    damage: 36,
    fireRate: 0.10,
    reloadTime: 2.5,
    magSize: 30,
    reserveMax: 90,
    recoil: 0.024,
    recoilRecovery: 9.5,
    baseSpread: 0.007,
    movePenalty: 0.045,
    crouchBonus: 0.55,
    adsFov: 58,
  },
  awp: {
    id: 'awp',
    name: 'AWP Sniper',
    slot: 1,
    type: 'sniper',
    damage: 115,
    fireRate: 1.35,
    reloadTime: 3.4,
    magSize: 5,
    reserveMax: 20,
    recoil: 0.08,
    recoilRecovery: 5.0,
    baseSpread: 0.001,
    movePenalty: 0.15,
    crouchBonus: 0.40,
    adsFov: 24, // 3x High Zoom
  }
};

export function createWeapon(camera) {
  const group = new THREE.Group();
  camera.add(group);

  // Reusable materials
  const gunMetalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), metalness: 0.8, roughness: 0.35 });
  const gunWoodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crate), roughness: 0.75 });
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });

  // Procedural weapon meshes
  const weaponMeshes = {};

  // 1. Knife Mesh
  const knifeGroup = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.22), gunMetalMat);
  blade.position.set(0, 0, -0.11);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.12), gunWoodMat);
  handle.position.set(0, -0.01, 0.06);
  knifeGroup.add(blade, handle);
  knifeGroup.position.set(0.24, -0.22, -0.42);
  knifeGroup.rotation.set(0.1, -0.2, 0);
  group.add(knifeGroup);
  weaponMeshes.knife = knifeGroup;

  // 2. Deagle Mesh
  const deagleGroup = new THREE.Group();
  const dSlide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.24), gunMetalMat);
  const dGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.06), gunWoodMat);
  dGrip.position.set(0, -0.08, 0.06);
  dGrip.rotation.x = -0.25;
  deagleGroup.add(dSlide, dGrip);
  deagleGroup.position.set(0.25, -0.24, -0.48);
  group.add(deagleGroup);
  weaponMeshes.deagle = deagleGroup;

  // 3. AK-47 Mesh
  const akGroup = new THREE.Group();
  const akBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.44), gunMetalMat);
  const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), gunMetalMat);
  akBarrel.rotation.x = Math.PI / 2;
  akBarrel.position.set(0, 0.015, -0.36);
  const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.22), gunWoodMat);
  akStock.position.set(0, -0.03, 0.28);
  const akMag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.07), gunMetalMat);
  akMag.position.set(0, -0.10, -0.08);
  akMag.rotation.x = 0.25;
  akGroup.add(akBody, akBarrel, akStock, akMag);
  akGroup.position.set(0.26, -0.22, -0.52);
  group.add(akGroup);
  weaponMeshes.ak47 = akGroup;

  // 4. AWP Sniper Mesh
  const awpGroup = new THREE.Group();
  const awpBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.52), gunMetalMat);
  const awpLongBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.48, 8), gunMetalMat);
  awpLongBarrel.rotation.x = Math.PI / 2;
  awpLongBarrel.position.set(0, 0.02, -0.48);
  const awpScope = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.22, 12), gunMetalMat);
  awpScope.rotation.x = Math.PI / 2;
  awpScope.position.set(0, 0.075, -0.05);
  awpGroup.add(awpBody, awpLongBarrel, awpScope);
  awpGroup.position.set(0.28, -0.24, -0.56);
  group.add(awpGroup);
  weaponMeshes.awp = awpGroup;

  // Muzzle Flash
  const flashMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), flashMat);
  flashMesh.position.set(0.26, -0.18, -0.92);
  group.add(flashMesh);

  // Weapon inventory state
  const inventory = {
    knife: { currentMag: 0, reserve: 0 },
    deagle: { currentMag: 7, reserve: 35 },
    ak47: { currentMag: 30, reserve: 90 },
    awp: { currentMag: 5, reserve: 20 },
  };

  let currentId = 'ak47';
  let weaponDef = WEAPON_TYPES.ak47;
  let cooldown = 0;
  let reloadTimer = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let flashTime = 0;
  let shotCount = 0;
  let isAds = false;

  function updateActiveMesh() {
    for (const [id, mesh] of Object.entries(weaponMeshes)) {
      mesh.visible = id === currentId;
    }
  }
  updateActiveMesh();

  return {
    get current() { return currentId; },
    get def() { return weaponDef; },
    get isAds() { return isAds; },
    get state() {
      const inv = inventory[currentId];
      return {
        id: currentId,
        name: weaponDef.name,
        mag: inv.currentMag,
        reserve: inv.reserve,
        isReloading: reloadTimer > 0,
        recoilPitch,
        recoilYaw
      };
    },
    equip(id) {
      if (!WEAPON_TYPES[id] || id === currentId) return;
      currentId = id;
      weaponDef = WEAPON_TYPES[id];
      cooldown = 0.25;
      reloadTimer = 0;
      shotCount = 0;
      isAds = false;
      updateActiveMesh();
    },
    setAds(active) {
      isAds = active && weaponDef.type !== 'knife';
    },
    ready() {
      return cooldown <= 0 && reloadTimer <= 0;
    },
    takeRound() {
      if (weaponDef.type === 'melee') return true;
      const inv = inventory[currentId];
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
      flashTime = 0.045;
      flashMesh.material.opacity = 1.0;

      // Recoil kick impulse
      const kick = weaponDef.recoil;
      recoilPitch += kick;
      recoilYaw += (Math.random() - 0.5) * kick * 0.75;
    },
    reload() {
      if (weaponDef.type === 'melee' || reloadTimer > 0) return;
      const inv = inventory[currentId];
      if (inv.currentMag >= weaponDef.magSize || inv.reserve <= 0) return;
      reloadTimer = weaponDef.reloadTime;
    },
    refill() {
      for (const [id, def] of Object.entries(WEAPON_TYPES)) {
        if (inventory[id]) {
          inventory[id].currentMag = def.magSize;
          inventory[id].reserve = def.reserveMax;
        }
      }
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
      if (isAds && weaponDef.type === 'sniper') s = 0.0005;
      return s;
    },
    step(dt) {
      if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
      if (cooldown === 0 && shotCount > 0) shotCount = Math.max(0, shotCount - 1);

      // Flash decay
      if (flashTime > 0) {
        flashTime -= dt;
        if (flashTime <= 0) flashMesh.material.opacity = 0;
      }

      // Recoil recovery
      const recFactor = Math.exp(-(weaponDef.recoilRecovery || 8.0) * dt);
      recoilPitch *= recFactor;
      recoilYaw *= recFactor;

      // Reload state machine
      if (reloadTimer > 0) {
        reloadTimer -= dt;
        if (reloadTimer <= 0) {
          const inv = inventory[currentId];
          const needed = weaponDef.magSize - inv.currentMag;
          const transfer = Math.min(needed, inv.reserve);
          inv.currentMag += transfer;
          inv.reserve -= transfer;
          shotCount = 0;
        }
      }

      // Weapon sway / bob
      const activeMesh = weaponMeshes[currentId];
      if (activeMesh) {
        if (reloadTimer > 0) {
          activeMesh.rotation.x = -0.4;
          activeMesh.position.y = -0.32;
        } else {
          activeMesh.rotation.x = THREE.MathUtils.lerp(activeMesh.rotation.x, 0, 0.15);
          activeMesh.position.y = THREE.MathUtils.lerp(activeMesh.position.y, isAds ? -0.15 : -0.22, 0.2);
          activeMesh.position.x = THREE.MathUtils.lerp(activeMesh.position.x, isAds ? 0 : 0.26, 0.2);
        }
      }
    }
  };
}
