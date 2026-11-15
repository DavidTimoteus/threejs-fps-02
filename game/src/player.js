// Tactical First-Person Controller.
// Handles player physics, collision sliding, health/armor damage absorption, crouching, and recoil offsets.

import * as THREE from 'three';

const GRAVITY = -14.0;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.15;
const STAND_EYE = 1.60;
const CROUCH_EYE = 1.02;
const RADIUS = 0.35;

export function createPlayer(colliders) {
  const position = new THREE.Vector3(0, 0.3, -20);
  const velocity = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let eyeHeight = STAND_EYE;
  let onGround = false;
  let isCrouching = false;
  let isWalking = false;

  // Combat status
  let health = 100;
  let armor = 100;
  let hasHelmet = true;
  let hasKit = true;
  let team = 'CT';

  const playerBox = new THREE.Box3();
  const moveVec = new THREE.Vector3();

  function updateBoundingBox() {
    const h = isCrouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    playerBox.min.set(position.x - RADIUS, position.y, position.z - RADIUS);
    playerBox.max.set(position.x + RADIUS, position.y + h, position.z + RADIUS);
  }

  function resolveCollisions() {
    updateBoundingBox();
    for (const collider of colliders) {
      if (!playerBox.intersectsBox(collider)) continue;

      const overlapX = Math.min(playerBox.max.x - collider.min.x, collider.max.x - playerBox.min.x);
      const overlapZ = Math.min(playerBox.max.z - collider.min.z, collider.max.z - playerBox.min.z);
      const overlapY = Math.min(playerBox.max.y - collider.min.y, collider.max.y - playerBox.min.y);

      if (overlapY < overlapX && overlapY < overlapZ) {
        if (velocity.y < 0 && position.y >= collider.max.y - 0.25) {
          position.y = collider.max.y;
          velocity.y = 0;
          onGround = true;
        } else if (velocity.y > 0) {
          position.y = collider.min.y - (isCrouching ? CROUCH_HEIGHT : STAND_HEIGHT);
          velocity.y = 0;
        }
      } else if (overlapX < overlapZ) {
        if (position.x < collider.min.x) position.x -= overlapX;
        else position.x += overlapX;
        velocity.x = 0;
      } else {
        if (position.z < collider.min.z) position.z -= overlapZ;
        else position.z += overlapZ;
        velocity.z = 0;
      }
      updateBoundingBox();
    }
  }

  return {
    state: {
      position,
      velocity,
      get yaw() { return yaw; },
      set yaw(v) { yaw = v; },
      get pitch() { return pitch; },
      set pitch(v) { pitch = v; },
      get eye() { return eyeHeight; },
      get health() { return health; },
      get armor() { return armor; },
      get hasHelmet() { return hasHelmet; },
      get hasKit() { return hasKit; },
      set hasKit(v) { hasKit = v; },
      get team() { return team; },
      set team(v) { team = v; },
      get isCrouching() { return isCrouching; },
      get isWalking() { return isWalking; },
      get onGround() { return onGround; },
    },
    damage(amount, isHeadshot) {
      if (health <= 0) return true;
      let effectiveDmg = amount;
      if (isHeadshot) effectiveDmg *= 3.0;

      // Armor absorption (50% absorption if armor > 0)
      if (armor > 0) {
        const absorbed = effectiveDmg * 0.45;
        armor = Math.max(0, armor - absorbed);
        effectiveDmg -= absorbed;
      }

      health = Math.max(0, health - effectiveDmg);
      return health <= 0;
    },
    heal(hp, arm) {
      health = Math.min(100, health + hp);
      armor = Math.min(100, armor + arm);
    },
    reset(spawnPos, newTeam = 'CT') {
      if (spawnPos) position.copy(spawnPos);
      velocity.set(0, 0, 0);
      yaw = newTeam === 'CT' ? 0 : Math.PI;
      pitch = 0;
      health = 100;
      armor = 100;
      hasHelmet = true;
      hasKit = newTeam === 'CT';
      team = newTeam;
      onGround = false;
    },
    look(dx, dy) {
      yaw -= dx * 0.0022;
      pitch = Math.max(-1.48, Math.min(1.48, pitch - dy * 0.0022));
    },
    recoil(recoilPitch, recoilYaw) {
      pitch = Math.max(-1.48, Math.min(1.48, pitch + recoilPitch));
      yaw += recoilYaw;
    },
    groundSpeed() {
      return Math.hypot(velocity.x, velocity.z);
    },
    step(dt, keys) {
      isCrouching = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight');
      isWalking = keys.has('ShiftLeft') || keys.has('ShiftRight');

      // Smooth eye transition for crouching
      const targetEye = isCrouching ? CROUCH_EYE : STAND_EYE;
      eyeHeight = THREE.MathUtils.lerp(eyeHeight, targetEye, 0.22);

      // Target horizontal movement speed
      const baseSpeed = isCrouching ? 2.2 : isWalking ? 2.8 : 5.4;
      moveVec.set(0, 0, 0);
      if (keys.has('KeyW')) moveVec.z -= 1;
      if (keys.has('KeyS')) moveVec.z += 1;
      if (keys.has('KeyA')) moveVec.x -= 1;
      if (keys.has('KeyD')) moveVec.x += 1;

      if (moveVec.lengthSq() > 0) {
        moveVec.normalize();
        moveVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        moveVec.multiplyScalar(baseSpeed);
      }

      // Acceleration and friction
      const accelRate = onGround ? 12.0 : 2.5;
      velocity.x = THREE.MathUtils.lerp(velocity.x, moveVec.x, accelRate * dt);
      velocity.z = THREE.MathUtils.lerp(velocity.z, moveVec.z, accelRate * dt);

      // Jump
      if (onGround && keys.has('Space')) {
        velocity.y = 4.8;
        onGround = false;
      }

      // Gravity
      velocity.y += GRAVITY * dt;

      // Integrate motion
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;
      position.z += velocity.z * dt;

      // Ground plane floor limit
      if (position.y <= 0) {
        position.y = 0;
        velocity.y = 0;
        onGround = true;
      }

      resolveCollisions();
    }
  };
}
