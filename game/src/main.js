// Tactical Strike: Fixed 60 Hz simulation loop and deterministic renderer.
// Ties together player physics, multi-weapon ballistics, bot state machines, C4 bomb objectives, and the tactical economy.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPON_TYPES } from './weapon.js';
import { createBomb } from './bomb.js';
import { createBots } from './bots.js';
import { createEconomy, CATALOG } from './economy.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// --- Renderer & Scene Initialization ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 75);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

// --- Game Systems ---
const world = createWorld(scene);
const economy = createEconomy();
const hud = createHud();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders);
const bomb = createBomb(scene, world.sites);

let ctScore = 0;
let tScore = 0;
let roundTimer = 115.0; // 1:55 round
let buyTimeLeft = 15.0;
let roundEnded = false;
let isBuyMenuOpen = false;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

// Zero-allocation static raycast vectors
const _raycaster = new THREE.Raycaster();
_raycaster.far = 120;
const _shootDir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const bots = createBots(scene, (killer, victim, isHeadshot) => {
  hud.pushKillfeed(killer, victim, isHeadshot);
});

const input = createInput(renderer.domElement, onLockChange);
const shootables = world.shootables.concat(bots.hitMeshes);

// --- Tactical Buy Menu Setup ---
document.querySelectorAll('.buy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const buyId = btn.getAttribute('data-buy');
    if (buyId && buyTimeLeft > 0) {
      const item = economy.buy(buyId, {
        armor: player.state.armor,
        hasHelmet: player.state.hasHelmet,
        hasKit: player.state.hasKit,
      });
      if (item) {
        hud.setMoney(economy.money);
        if (item.category === 'pistol' || item.category === 'rifle' || item.category === 'smg' || item.category === 'sniper') {
          weapon.equip(item.id);
        } else if (item.id === 'armor') {
          player.heal(0, 100);
        } else if (item.id === 'helmet') {
          player.heal(0, 100);
        } else if (item.id === 'defuseKit') {
          player.state.hasKit = true;
        }
        hud.setAmmo(weapon.state.mag, weapon.state.reserve);
        hud.setHealth(player.state.health, player.state.armor);
      }
    }
  });
});

hud.onPlay(() => {
  if (shot) return;
  if (roundEnded) restartRound();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (!roundEnded) {
    hud.showOverlay(started ? 'paused' : 'start', 0);
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + weapon.state.recoilPitch, body.yaw + weapon.state.recoilYaw, 0, 'YXZ');

  // ADS Zoom FOV
  const targetFov = input.state.aiming ? weapon.def.adsFov : 74;
  if (camera.fov !== targetFov) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.25);
    camera.updateProjectionMatrix();
    input.setSensitivityScale(input.state.aiming ? 0.45 : 1.0);
  }
}

function shoot() {
  if (!weapon.takeRound()) return false;

  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_shootDir);
  _right.crossVectors(_shootDir, camera.up).normalize();
  _up.crossVectors(_right, _shootDir).normalize();

  // Dynamic spread based on velocity & stance
  const spreadAngle = weapon.spread(player.groundSpeed(), player.state.isCrouching, player.state.isWalking);
  const spreadX = (random() * 2 - 1) * spreadAngle;
  const spreadY = (random() * 2 - 1) * spreadAngle;

  _shootDir.addScaledVector(_right, spreadX).addScaledVector(_up, spreadY).normalize();

  scene.updateMatrixWorld(true);
  _raycaster.set(_origin, _shootDir);
  const hits = _raycaster.intersectObjects(shootables, false);

  if (hits.length > 0) {
    const hit = hits[0];
    if (hit.object.userData.target) {
      const isHead = hit.object.userData.part === 'head';
      const killed = bots.damage(hit.object, weapon.def.damage, isHead, 'Player');
      hud.hitMarker(killed, isHead ? 150 : 80);
      if (killed) {
        economy.add(weapon.def.id === 'knife' ? 1500 : weapon.def.type === 'sniper' ? 100 : 300);
        hud.setMoney(economy.money);
      }
    }
  }

  weapon.pullTrigger();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function restartRound(winnerTeam = null) {
  roundEnded = false;
  roundTimer = 115.0;
  buyTimeLeft = 15.0;
  bomb.reset();
  bots.resetSpawns(world);
  player.reset(player.state.team === 'CT' ? world.spawnPoints.CT : world.spawnPoints.T, player.state.team);
  weapon.refill();

  if (winnerTeam) {
    economy.onRoundEnd(winnerTeam, player.state.team, bomb.isPlanted);
    if (winnerTeam === 'CT') ctScore += 1;
    else tScore += 1;
  }

  hud.setScores(ctScore, tScore, roundTimer, bots.aliveCount('CT') + 1, bots.aliveCount('T'));
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setMoney(economy.money);
  hud.showObjective('');
}

function step(dt) {
  if (roundEnded) return;

  // Round Clock
  roundTimer = Math.max(0, roundTimer - dt);
  if (buyTimeLeft > 0) buyTimeLeft = Math.max(0, buyTimeLeft - dt);

  // Keyboard toggles
  if (input.takeBuyKey() && buyTimeLeft > 0) {
    isBuyMenuOpen = !isBuyMenuOpen;
    hud.toggleBuyMenu(isBuyMenuOpen, null, economy);
  }

  const slot = input.takeSlotRequest();
  if (slot === 1) weapon.equip('ak47');
  else if (slot === 2) weapon.equip('deagle');
  else if (slot === 3) weapon.equip('knife');
  else if (slot === 4) weapon.equip('awp');

  // C4 Interaction
  const isHoldingUse = input.state.keys.has('KeyE');
  if (bomb.isPlanted) {
    if (player.state.team === 'CT' && bomb.checkDefusable(player.state.position)) {
      hud.showObjective('HOLD [E] TO DEFUSE C4', bomb.defuseProgress);
      bomb.startDefusing(player.state.position);
      if (bomb.updateDefusing(dt, isHoldingUse, player.state.position, player.state.hasKit)) {
        roundEnded = true;
        restartRound('CT');
        hud.showOverlay('end', ctScore * 100);
      }
    } else {
      hud.showObjective(`BOMB PLANTED [${Math.ceil(bomb.fuse)}s]`);
    }
  } else if (player.state.team === 'T' && bomb.checkPlantable(player.state.position)) {
    hud.showObjective('HOLD [E] TO PLANT C4', bomb.plantProgress);
    if (isHoldingUse) {
      bomb.startPlanting(player.state.position);
      if (bomb.updatePlanting(dt, isHoldingUse, player.state.position)) {
        hud.showObjective('BOMB HAS BEEN PLANTED!');
      }
    }
  } else {
    hud.showObjective('');
  }

  // Step Systems
  player.step(dt, input.state.keys);
  weapon.step(dt);
  bots.step(dt, player, bomb, world.colliders);
  const bombEvent = bomb.step(dt);

  if (bombEvent === 'detonated') {
    roundEnded = true;
    restartRound('T');
    hud.showOverlay('end', tScore * 100);
  }

  // Check Round Elimination
  const ctAlive = bots.aliveCount('CT') + (player.state.team === 'CT' && player.state.health > 0 ? 1 : 0);
  const tAlive = bots.aliveCount('T') + (player.state.team === 'T' && player.state.health > 0 ? 1 : 0);

  if (ctAlive === 0 && !bomb.isPlanted) {
    roundEnded = true;
    restartRound('T');
    hud.showOverlay('end', tScore * 100);
  } else if (tAlive === 0 && !bomb.isPlanted) {
    roundEnded = true;
    restartRound('CT');
    hud.showOverlay('end', ctScore * 100);
  } else if (roundTimer <= 0 && !bomb.isPlanted) {
    roundEnded = true;
    restartRound('CT');
    hud.showOverlay('end', ctScore * 100);
  }

  hud.setScores(ctScore, tScore, roundTimer, ctAlive, tAlive);
  hud.setHealth(player.state.health, player.state.armor);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);

    if (input.state.firing && weapon.ready()) {
      shoot();
    }
    if (input.state.keys.has('KeyR')) {
      weapon.reload();
    }

    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;

    syncCamera();
    hud.drawRadar(player, bots.items, world.sites, bomb);
  }

  renderer.render(scene, camera);
}

// --- Deterministic Screenshot Support (?shot=start|play|end) ---
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  player.state.pitch = 0;
  player.state.yaw = 0;

  if (name === 'play') {
    // Action frame: Player engaging in Mid with bots visible
    player.state.position.set(-2.5, 0, 4.0);
    player.state.yaw = Math.PI * 0.95;
    player.state.pitch = -0.05;
    weapon.equip('ak47');
    settle(25);
    shoot();
    hud.pushKillfeed('Player', 'Anarchist', true);
  } else if (name === 'end') {
    // Bomb site plant & victory frame
    player.state.position.set(-16.0, 0.45, -11.0);
    player.state.yaw = -0.4;
    weapon.equip('awp');
    settle(40);
    hud.showObjective('BOMB PLANTED - DEFEND THE SITE');
    hud.pushKillfeed('Player', 'Phoenix', false);
    hud.showOverlay('end', 1500);
  } else {
    // Start deploy frame
    player.state.position.set(0, 0.3, -20);
    player.state.yaw = 0;
    weapon.equip('ak47');
    settle(10);
    hud.showOverlay('start', 0);
  }

  hud.setScores(2, 1, 95, 2, 1);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setMoney(3400);

  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    hud.drawRadar(player, bots.items, world.sites, bomb);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
bots.resetSpawns(world);
if (shot) runShot(shot);
else {
  restartRound();
  requestAnimationFrame(frame);
}
