// Tactical Strike: Fixed 60 Hz simulation loop and deterministic renderer.
// Ties together player physics, multi-weapon ballistics, HE & smoke grenades, acoustic/LOS bot AI, C4 objectives, and economy.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createBomb } from './bomb.js';
import { createBots } from './bots.js';
import { createEconomy } from './economy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createGrenades } from './grenade.js';
import { createSight } from './sight.js';

const FIXED_STEP = 1 / 60;
const BUY_ORDER = ['deagle', 'mp5', 'ak47', 'awp', 'armor', 'defuseKit', 'heGrenade', 'smokeGrenade'];
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
const audio = createAudio();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders);
const bomb = createBomb(scene, world.sites);

let bots = null;
const grenades = createGrenades(scene, world.colliders, audio, (pos, radius) => {
  if (bots) bots.hearNoise(pos, radius, null);
});
const sight = createSight(world.colliders, grenades);

bots = createBots(scene, {
  colliders: world.colliders,
  sight,
  onKill(killer, victim, isHeadshot) {
    hud.pushKillfeed(killer, victim, isHeadshot);
  },
  onFire(bot, dist) {
    if (audio) audio.playGunshot(bot.cfg.weapon, Math.max(0.08, 1 - dist / 45));
  },
  onPlayerHit() {
    if (audio) audio.playHurt();
    hud.damageFlash();
    hud.setHealth(player.state.health, player.state.armor);
  },
});

let ctScore = 0;
let tScore = 0;
let roundTimer = 115.0;
let buyTimeLeft = 15.0;
let simTime = 0;
let footstepTimer = 0;
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

const input = createInput(renderer.domElement, onLockChange);
const shootables = world.shootables.concat(bots.hitMeshes);

function syncHudLoadout() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setLoadout(weapon.state.name, weapon.owns('heGrenade'), weapon.owns('smokeGrenade'));
  hud.setHealth(player.state.health, player.state.armor);
  hud.setMoney(economy.money);
}

function buyItem(buyId) {
  if (!buyId || buyTimeLeft <= 0) return;
  const item = economy.buy(buyId, {
    armor: player.state.armor,
    hasKit: player.state.hasKit,
    alreadyOwned: weapon.owns(buyId),
  });
  if (!item) return;
  if (item.id === 'armor') player.giveArmor();
  else if (item.id === 'defuseKit') player.state.hasKit = true;
  else weapon.give(item.id);
  syncHudLoadout();
}

// --- Tactical Buy Menu Setup ---
document.querySelectorAll('.buy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    buyItem(btn.getAttribute('data-buy'));
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

  const targetFov = weapon.isAds ? weapon.def.adsFov : 74;
  if (camera.fov !== targetFov) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.25);
    camera.updateProjectionMatrix();
    input.setSensitivityScale(weapon.isAds ? 0.45 : 1.0);
  }
}

function shoot() {
  if (weapon.def.type === 'grenade') {
    const kind = weapon.def.kind || 'he';
    if (!weapon.takeRound()) return false;
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_shootDir);
    grenades.throwGrenade(_origin, _shootDir, player.state.velocity, 'Player', kind);
    weapon.pullTrigger();
    weapon.equip(weapon.primary || 'deagle');
    syncHudLoadout();
    return true;
  }

  if (!weapon.takeRound()) return false;
  if (audio) audio.playGunshot(weapon.def.id);
  bots.hearNoise(player.state.position, weapon.def.noise || 26, player.state.team);

  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_shootDir);
  _right.crossVectors(_shootDir, camera.up).normalize();
  _up.crossVectors(_right, _shootDir).normalize();

  const spreadAngle = weapon.spread(player.groundSpeed(), player.state.isCrouching, player.state.isWalking);
  const spreadX = (random() * 2 - 1) * spreadAngle;
  const spreadY = (random() * 2 - 1) * spreadAngle;

  _shootDir.addScaledVector(_right, spreadX).addScaledVector(_up, spreadY).normalize();

  scene.updateMatrixWorld(true);
  _raycaster.set(_origin, _shootDir);
  _raycaster.far = weapon.def.type === 'melee' ? weapon.def.range : 120;
  const hits = _raycaster.intersectObjects(shootables, false);

  if (hits.length > 0) {
    const hit = hits[0];
    if (hit.object.userData.target) {
      const isHead = hit.object.userData.part === 'head';
      const killed = bots.damage(hit.object, weapon.def.damage, isHead, 'Player');
      hud.hitMarker(killed, isHead ? 150 : 80);
      if (audio) audio.playHit(isHead);
      if (killed) {
        economy.rewardKill(weapon.def);
        hud.setMoney(economy.money);
      }
    }
  }

  weapon.pullTrigger();
  syncHudLoadout();
  return true;
}

function restartRound(winnerTeam = null) {
  const diedLastRound = player.state.health <= 0;
  roundEnded = false;
  roundTimer = 115.0;
  buyTimeLeft = 15.0;
  isBuyMenuOpen = false;
  hud.toggleBuyMenu(false);
  bomb.reset();
  grenades.reset();
  bots.resetSpawns(world);
  player.reset(player.state.team === 'CT' ? world.spawnPoints.CT : world.spawnPoints.T, player.state.team);

  if (winnerTeam === null) {
    // Initial deployment loadout
    player.giveArmor();
    player.state.hasKit = true;
    weapon.give('heGrenade');
    weapon.give('smokeGrenade');
    weapon.give('ak47');
  } else {
    if (diedLastRound) weapon.loseAll();
    weapon.refill();
    economy.onRoundEnd(winnerTeam, player.state.team, bomb.isPlanted);
    if (winnerTeam === 'CT') ctScore += 1;
    else tScore += 1;
  }

  hud.setScores(ctScore, tScore, roundTimer, bots.aliveCount('CT') + 1, bots.aliveCount('T'));
  syncHudLoadout();
  hud.showObjective('');
}

function step(dt) {
  if (roundEnded) return;
  simTime += dt;

  roundTimer = Math.max(0, roundTimer - dt);
  if (buyTimeLeft > 0) {
    buyTimeLeft = Math.max(0, buyTimeLeft - dt);
    if (buyTimeLeft <= 0 && isBuyMenuOpen) {
      isBuyMenuOpen = false;
      hud.toggleBuyMenu(false);
    }
  }

  if (input.takeBuyKey() && buyTimeLeft > 0) {
    isBuyMenuOpen = !isBuyMenuOpen;
    hud.toggleBuyMenu(isBuyMenuOpen, null, economy);
  }

  const slot = input.takeSlotRequest();
  if (slot !== null) {
    if (isBuyMenuOpen && buyTimeLeft > 0) {
      buyItem(BUY_ORDER[slot - 1]);
    } else if (weapon.equipSlot(slot)) {
      syncHudLoadout();
    }
  }

  weapon.setAds(input.state.aiming);

  // C4 Interaction
  const isHoldingUse = input.state.keys.has('KeyE');
  if (bomb.isPlanted) {
    if (player.state.team === 'CT' && bomb.checkDefusable(player.state.position)) {
      hud.showObjective('HOLD [E] TO DEFUSE C4', bomb.defuseProgress);
      if (isHoldingUse) {
        bomb.startDefusing(player.state.position);
        if (bomb.updateDefusing(dt, true, player.state.position, player.state.hasKit)) {
          if (audio) audio.playDefuse();
          roundEnded = true;
          restartRound('CT');
          hud.showOverlay('end', ctScore * 100);
          return;
        }
      } else {
        bomb.updateDefusing(dt, false, player.state.position, player.state.hasKit);
      }
    } else {
      hud.showObjective(`BOMB PLANTED [${Math.ceil(bomb.fuse)}s]`);
    }
  } else if (player.state.team === 'T' && bomb.checkPlantable(player.state.position)) {
    hud.showObjective('HOLD [E] TO PLANT C4', bomb.plantProgress);
    if (isHoldingUse) {
      bomb.startPlanting(player.state.position);
      if (bomb.updatePlanting(dt, true, player.state.position)) {
        hud.showObjective('BOMB HAS BEEN PLANTED!');
      }
    } else {
      bomb.updatePlanting(dt, false, player.state.position);
    }
  } else {
    hud.showObjective('');
  }

  // Step Systems
  player.step(dt, input.state.keys);
  const speed = player.groundSpeed();
  if (player.state.onGround && speed > 3.5 && !player.state.isWalking && !player.state.isCrouching) {
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      footstepTimer = 0.38;
      if (audio) audio.playFootstep(0.12);
      bots.hearNoise(player.state.position, 13, player.state.team);
    }
  }

  weapon.step(dt);
  bots.step(dt, player, bomb, simTime);
  grenades.step(dt, bots, player, hud, (shake) => {
    weapon.addRecoil((random() - 0.5) * shake, (random() - 0.5) * shake);
  });
  const bombEvent = bomb.step(dt);

  if (bombEvent === 'detonated') {
    roundEnded = true;
    restartRound('T');
    hud.showOverlay('end', tScore * 100);
    return;
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
    hud.drawRadar(player, bots.items, world.sites, bomb, grenades.clouds);
  }

  renderer.render(scene, camera);
}

// --- Deterministic Screenshot Support (?shot=start|play|end) ---
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  restartRound();
  hud.hideOverlay();
  player.state.pitch = 0;
  player.state.yaw = 0;

  if (name === 'play') {
    player.state.position.set(-2.5, 0, 4.0);
    player.state.yaw = Math.PI * 0.95;
    player.state.pitch = -0.05;
    weapon.give('ak47');
    grenades.spawnSmokeAt(new THREE.Vector3(-4.0, 0, -4.5), 2.4);
    settle(25);
    shoot();
    hud.pushKillfeed('Player', 'Anarchist', true);
  } else if (name === 'end') {
    player.state.position.set(-16.0, 0.45, -11.0);
    player.state.yaw = -0.4;
    weapon.give('awp');
    settle(40);
    hud.showObjective('BOMB PLANTED - DEFEND THE SITE');
    hud.pushKillfeed('Player', 'Phoenix', false);
    hud.showOverlay('end', 1500);
  } else {
    player.state.position.set(0, 0.3, -20);
    player.state.yaw = 0;
    weapon.give('ak47');
    settle(10);
    hud.showOverlay('start', 0);
  }

  hud.setScores(2, 1, 95, 2, 1);
  syncHudLoadout();
  hud.setMoney(3400);

  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    hud.drawRadar(player, bots.items, world.sites, bomb, grenades.clouds);
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
