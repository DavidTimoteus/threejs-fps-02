// Tactical bots: per-team routes through Sandstone Outpost, held angles, bomb plant / retake,
// sight checks against walls and smoke (sight.js), hearing (gunfire, footsteps, grenades),
// teammate callouts, reaction time and burst fire whose accuracy falls with range and target motion.
// Scratch vectors only: no allocation inside step().

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_RADIUS = 0.35;
const EYE = 1.55;
const CHEST = 1.05;
const WALK_SPEED = 3.4;
const TURN_RATE = 7.0;
const FOV_COS = Math.cos(THREE.MathUtils.degToRad(65));

const BOT_WEAPONS = {
  ak47: { damage: 27, interval: 0.12, burst: 3, pause: 0.55, range: 40 },
  deagle: { damage: 34, interval: 0.34, burst: 2, pause: 0.6, range: 34 },
};

const v = (x, z) => new THREE.Vector3(x, 0, z);

// Each route: waypoints from spawn, the spot it ends on, and the point that spot watches.
const ROUTES = {
  T_A: { path: [v(-8, 20.6), v(-15, 20.6), v(-15, 14), v(-15, 6), v(-15, -3), v(-15, -7)], hold: v(-15.5, -12.3), watch: v(-11, -19.5) },
  T_B: { path: [v(8, 20.6), v(22, 20.6), v(22, 8), v(22, -8), v(21.5, -12.4)], hold: v(18, -12.4), watch: v(11, -19.5) },
  CT_A: { path: [v(-6, -20.6), v(-12, -20.6), v(-12, -14)], hold: v(-13.2, -11.2), watch: v(-16, 2) },
  CT_B: { path: [v(6, -20.6), v(12, -20.6), v(12, -14)], hold: v(12.6, -9.2), watch: v(21, 2) },
};

const BOT_CONFIGS = [
  { name: 'Phoenix', team: 'T', route: 'T_A', weapon: 'ak47' },
  { name: 'Anarchist', team: 'T', route: 'T_B', weapon: 'ak47' },
  { name: 'SEAL Alpha', team: 'CT', route: 'CT_A', weapon: 'ak47' },
  { name: 'SWAT Bravo', team: 'CT', route: 'CT_B', weapon: 'deagle' },
];

function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function createBots(scene, options) {
  const { colliders, sight, onKill, onFire } = options;
  const blockers = colliders.filter((c) => c.max.y > 0.5 && c.min.y < 1.6);

  const ctMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ctBlue), roughness: 0.65 });
  const tMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.tYellow), roughness: 0.65 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.5 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), metalness: 0.7 });
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const torsoGeo = new THREE.BoxGeometry(0.55, 0.75, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.06, 0.08, 0.38);
  const flashGeo = new THREE.OctahedronGeometry(0.07, 0);

  const bots = [];
  const hitMeshes = [];
  let bombRef = null;

  const _diff = new THREE.Vector3();
  const _eye = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  const _aimChest = new THREE.Vector3();

  for (const cfg of BOT_CONFIGS) {
    const group = new THREE.Group();
    const mat = cfg.team === 'CT' ? ctMat : tMat;
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = CHEST;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.58;
    head.userData.part = 'head';
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.16, 0.35, 0);
    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.16, 0.35, 0);
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.28, 1.05, -0.22);
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0.28, 1.07, -0.46);
    flash.visible = false;
    group.add(torso, head, leftLeg, rightLeg, gun, flash);
    group.traverse((m) => {
      if (m.isMesh && m !== flash) { m.castShadow = true; m.receiveShadow = true; }
    });
    scene.add(group);

    const route = ROUTES[cfg.route];
    const bot = {
      cfg,
      name: cfg.name,
      team: cfg.team,
      group, torso, head, leftLeg, rightLeg, flash,
      position: group.position,
      route,
      weapon: BOT_WEAPONS[cfg.weapon],
      watchYaw: Math.atan2(-(route.watch.x - route.hold.x), -(route.watch.z - route.hold.z)),
      health: 100,
      armor: 50,
      alive: true,
      state: 'ROUTE', // ROUTE | HOLD | PLANT | ENGAGE | INVESTIGATE | RETAKE
      waypoint: 0,
      yaw: 0,
      target: null,
      targetIsPlayer: false,
      cover: 0,
      lastSeen: new THREE.Vector3(),
      investigate: new THREE.Vector3(),
      investigateTimer: 0,
      lostTimer: 0,
      reactTimer: 0,
      alertTimer: 0,
      cooldown: 0,
      burst: 0,
      flashTimer: 0,
      stuckTimer: 0,
      walkPhase: Math.random() * 6,
      moving: false,
      planting: false,
      defusing: false,
    };
    torso.userData.target = bot;
    head.userData.target = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function pushOutOfWalls(bot) {
    const p = bot.position;
    for (let i = 0; i < blockers.length; i += 1) {
      const c = blockers[i];
      const cx = Math.max(c.min.x, Math.min(p.x, c.max.x));
      const cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= BOT_RADIUS * BOT_RADIUS) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (BOT_RADIUS - d);
        p.z += (dz / d) * (BOT_RADIUS - d);
      } else {
        // Centre inside the box: leave by the nearest face.
        const left = p.x - c.min.x; const right = c.max.x - p.x;
        const near = p.z - c.min.z; const far = c.max.z - p.z;
        const m = Math.min(left, right, near, far);
        if (m === left) p.x = c.min.x - BOT_RADIUS; else if (m === right) p.x = c.max.x + BOT_RADIUS;
        else if (m === near) p.z = c.min.z - BOT_RADIUS; else p.z = c.max.z + BOT_RADIUS;
      }
    }
  }

  function turnToward(bot, desiredYaw, dt) {
    const delta = wrapAngle(desiredYaw - bot.yaw);
    const maxTurn = TURN_RATE * dt;
    bot.yaw = wrapAngle(bot.yaw + Math.max(-maxTurn, Math.min(maxTurn, delta)));
    bot.group.rotation.y = bot.yaw;
    return Math.abs(delta);
  }

  function yawTo(from, to) {
    return Math.atan2(-(to.x - from.x), -(to.z - from.z));
  }

  // Walk toward a point; returns the remaining horizontal distance. Bots wait at the edge of smoke.
  function moveToward(bot, point, dt, speed = WALK_SPEED) {
    _diff.subVectors(point, bot.position);
    _diff.y = 0;
    const dist = _diff.length();
    if (dist < 0.05) return dist;
    turnToward(bot, Math.atan2(-_diff.x, -_diff.z), dt);
    _diff.multiplyScalar(1 / dist);
    const stepLen = Math.min(dist, speed * dt);
    const nx = bot.position.x + _diff.x * stepLen;
    const nz = bot.position.z + _diff.z * stepLen;
    if (sight.inSmoke(nx, nz) && !sight.inSmoke(bot.position.x, bot.position.z)) return dist;
    const ox = bot.position.x;
    const oz = bot.position.z;
    bot.position.x = nx;
    bot.position.z = nz;
    pushOutOfWalls(bot);
    const moved = Math.hypot(bot.position.x - ox, bot.position.z - oz);
    bot.moving = moved > 0.2 * stepLen;
    bot.stuckTimer = bot.moving ? 0 : bot.stuckTimer + dt;
    return dist;
  }

  function cancelObjective(bot, bomb, dt) {
    if (bot.planting) { bomb.updatePlanting(dt, false, bot.position); bot.planting = false; }
    if (bot.defusing) { bomb.updateDefusing(dt, false, bot.position, true); bot.defusing = false; }
  }

  // Head first, then chest: a target behind waist-high cover can still show its head.
  function visibility(bot, targetPos, eyeHeight) {
    _eye.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    _aim.set(targetPos.x, targetPos.y + eyeHeight, targetPos.z);
    _aimChest.set(targetPos.x, targetPos.y + eyeHeight * 0.66, targetPos.z);
    if (sight.canSee(_eye, _aimChest)) return 2; // body visible
    if (sight.canSee(_eye, _aim)) return 1; // head only
    return 0;
  }

  function inView(bot, targetPos, dist) {
    if (bot.alertTimer > 0 || dist < 4) return true;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    return ((targetPos.x - bot.position.x) * fx + (targetPos.z - bot.position.z) * fz) / Math.max(dist, 1e-4) > FOV_COS;
  }

  // Closest visible enemy (player or bot); fills bot.target / bot.targetIsPlayer / bot.cover.
  function perceive(bot, player) {
    let best = null;
    let bestDist = Infinity;
    let bestIsPlayer = false;
    let bestVis = 0;
    const range = bot.weapon.range;
    if (player.state.team !== bot.team && player.state.health > 0) {
      const p = player.state.position;
      const dist = Math.hypot(p.x - bot.position.x, p.z - bot.position.z);
      if (dist < range && inView(bot, p, dist)) {
        const vis = visibility(bot, p, player.state.eye);
        if (vis > 0) { best = player; bestDist = dist; bestIsPlayer = true; bestVis = vis; }
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const dist = Math.hypot(other.position.x - bot.position.x, other.position.z - bot.position.z);
      if (dist >= range || dist >= bestDist || !inView(bot, other.position, dist)) continue;
      const vis = visibility(bot, other.position, 1.58);
      if (vis > 0) { best = other; bestDist = dist; bestIsPlayer = false; bestVis = vis; }
    }
    bot.cover = bestVis;
    if (best !== bot.target) {
      bot.target = best;
      bot.targetIsPlayer = bestIsPlayer;
      if (best) bot.reactTimer = 0.32 + Math.random() * 0.22; // reaction time before the first shot
    }
    return best ? bestDist : 0;
  }

  function callout(bot, pos) {
    for (const mate of bots) {
      if (mate === bot || !mate.alive || mate.team !== bot.team || mate.state === 'ENGAGE') continue;
      if (mate.position.distanceTo(pos) < 26) setInvestigate(mate, pos, 6, true);
    }
  }

  function setInvestigate(bot, pos, time, fromCallout = false) {
    bot.alertTimer = Math.max(bot.alertTimer, 3.5);
    // A bot holding an angle turns to the sound but keeps its spot unless it is close.
    if ((bot.state === 'HOLD' || bot.state === 'PLANT' || bot.state === 'RETAKE') && bot.position.distanceTo(pos) > (fromCallout ? 9 : 12)) {
      bot.investigate.copy(pos);
      bot.investigateTimer = -time; // negative: look only
      return;
    }
    bot.state = 'INVESTIGATE';
    bot.investigate.copy(pos);
    bot.investigateTimer = time;
  }

  function fire(bot, player, dist) {
    if (bot.cooldown > 0 || bot.reactTimer > 0) return;
    const w = bot.weapon;
    bot.cooldown = w.interval;
    bot.burst += 1;
    if (bot.burst >= w.burst) { bot.burst = 0; bot.cooldown = w.pause; }
    bot.flashTimer = 0.05;
    bot.flash.visible = true;
    if (onFire) onFire(bot, dist);

    const target = bot.target;
    const targetMoving = bot.targetIsPlayer ? player.groundSpeed() > 3.0 : target.moving;
    let p = 0.62 * (1 - dist / (w.range * 1.25));
    if (targetMoving) p *= 0.6;
    if (bot.targetIsPlayer && player.state.isCrouching) p *= 0.85;
    if (bot.burst !== 1) p *= 0.8; // recoil climbs after the first round of a burst
    if (bot.cover === 1) p *= 0.35; // only the head shows over cover
    p = Math.max(0.04, Math.min(0.75, p));
    const roll = Math.random();
    if (roll >= p) return;
    const isHead = bot.cover === 1 || roll < p * 0.22;
    if (bot.targetIsPlayer) {
      const killed = player.damage(w.damage, isHead);
      if (options.onPlayerHit) options.onPlayerHit(bot, killed, isHead);
      if (killed && onKill) onKill(bot.name, 'You', isHead);
    } else {
      damage(isHead ? target.head : target.torso, w.damage, isHead, bot.name);
    }
  }

  function resetSpawns(world) {
    let tIndex = 0;
    let ctIndex = 0;
    for (const bot of bots) {
      bot.alive = true;
      bot.health = 100;
      bot.armor = 50;
      bot.state = 'ROUTE';
      bot.waypoint = 0;
      bot.target = null;
      bot.alertTimer = 0;
      bot.investigateTimer = 0;
      bot.lostTimer = 0;
      bot.cooldown = 0;
      bot.burst = 0;
      bot.stuckTimer = 0;
      bot.planting = false;
      bot.defusing = false;
      bot.flash.visible = false;
      bot.group.visible = true;
      const isCT = bot.team === 'CT';
      const index = isCT ? ctIndex++ : tIndex++;
      const base = isCT ? world.spawnPoints.CT : world.spawnPoints.T;
      bot.position.set(base.x + (index === 0 ? -1.2 : 1.2), 0, base.z + (isCT ? 3 : -3));
      bot.yaw = isCT ? Math.PI : 0;
      bot.group.rotation.y = bot.yaw;
    }
  }

  function damage(mesh, amount, isHeadshot, attackerName = 'Player') {
    const bot = mesh.userData.target;
    if (!bot || !bot.alive) return false;
    let dmg = amount;
    if (isHeadshot) dmg *= 3.0;
    if (bot.armor > 0) {
      const absorbed = dmg * 0.45;
      bot.armor = Math.max(0, bot.armor - absorbed);
      dmg -= absorbed;
    }
    bot.health = Math.max(0, bot.health - dmg);
    bot.alertTimer = 4;
    if (bot.health <= 0) {
      if (bombRef) cancelObjective(bot, bombRef, 0);
      bot.alive = false;
      bot.group.visible = false;
      if (onKill) onKill(attackerName, bot.name, isHeadshot);
      return true;
    }
    return false;
  }

  // A sound at pos reaches every enemy bot within radius (sourceTeam null: everyone).
  function hearNoise(pos, radius, sourceTeam = null) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === sourceTeam || bot.state === 'ENGAGE') continue;
      if (bot.position.distanceTo(pos) <= radius) setInvestigate(bot, pos, 7);
    }
  }

  function stepObjective(bot, bomb, dt) {
    if (bot.team === 'T') {
      if (bomb.isPlanted) {
        // Post-plant: guard the bomb from a few metres away, watching the CT entrance.
        if (moveToward(bot, bomb.position, dt) > 4.5) return;
        bot.state = 'HOLD';
        return;
      }
      if (moveToward(bot, bot.route.hold, dt) > 0.6) return;
      bot.state = 'PLANT';
      if (!bot.planting && bomb.startPlanting(bot.position)) bot.planting = true;
      if (bot.planting && bomb.updatePlanting(dt, true, bot.position)) {
        bot.planting = false;
        bot.state = 'HOLD';
      } else if (!bot.planting && !bomb.checkPlantable(bot.position)) {
        bot.state = 'HOLD';
      }
      return;
    }
    // CT
    if (bomb.isPlanted) {
      bot.state = 'RETAKE';
      if (moveToward(bot, bomb.position, dt, WALK_SPEED * 1.15) > 1.6) return;
      if (!bot.defusing && bomb.startDefusing(bot.position)) bot.defusing = true;
      if (bot.defusing && bomb.updateDefusing(dt, true, bot.position, true)) bot.defusing = false;
      return;
    }
    if (moveToward(bot, bot.route.hold, dt) > 0.4) return;
    bot.state = 'HOLD';
  }

  function step(dt, player, bomb, time) {
    bombRef = bomb;
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.cooldown > 0) bot.cooldown -= dt;
      if (bot.reactTimer > 0) bot.reactTimer -= dt;
      if (bot.alertTimer > 0) bot.alertTimer -= dt;
      if (bot.flashTimer > 0) { bot.flashTimer -= dt; if (bot.flashTimer <= 0) bot.flash.visible = false; }
      bot.moving = false;

      // 1. Sight
      const dist = perceive(bot, player);
      if (bot.target) {
        const tp = bot.targetIsPlayer ? player.state.position : bot.target.position;
        if (bot.state !== 'ENGAGE') callout(bot, tp);
        bot.state = 'ENGAGE';
        bot.lastSeen.copy(tp);
        bot.lostTimer = 0;
        bot.alertTimer = 4;
        cancelObjective(bot, bomb, dt);
        // Stop to aim (bots, like players, shoot straighter standing still) and fire when on target.
        const err = turnToward(bot, yawTo(bot.position, tp), dt);
        if (err < 0.2) fire(bot, player, dist);
      } else if (bot.state === 'ENGAGE') {
        // Lost sight (wall or smoke): wait a moment, then push the last known position.
        bot.lostTimer += dt;
        turnToward(bot, yawTo(bot.position, bot.lastSeen), dt);
        if (bot.lostTimer > 0.9) setInvestigate(bot, bot.lastSeen, 5);
      } else if (bot.state === 'INVESTIGATE') {
        bot.investigateTimer -= dt;
        const remaining = moveToward(bot, bot.investigate, dt);
        if (remaining < 1.2) turnToward(bot, bot.yaw + dt * 2.5, dt); // check corners on arrival
        if (bot.investigateTimer <= 0 || bot.stuckTimer > 1.2) {
          bot.state = 'ROUTE';
          bot.stuckTimer = 0;
        }
      } else if (bot.state === 'ROUTE') {
        if (bomb.isPlanted) { stepObjective(bot, bomb, dt); }
        else if (bot.waypoint < bot.route.path.length) {
          const remaining = moveToward(bot, bot.route.path[bot.waypoint], dt);
          if (remaining < 1.0 || bot.stuckTimer > 1.2) { bot.waypoint += 1; bot.stuckTimer = 0; }
        } else {
          stepObjective(bot, bomb, dt);
        }
      } else if (bot.state === 'PLANT' || bot.state === 'RETAKE') {
        stepObjective(bot, bomb, dt);
      } else if (bot.state === 'HOLD') {
        if ((bot.team === 'CT' && bomb.isPlanted) || (bot.team === 'T' && bomb.isPlanted && bot.position.distanceTo(bomb.position) > 6)) {
          bot.state = 'ROUTE';
          bot.waypoint = bot.route.path.length;
        } else if (bot.investigateTimer < 0) {
          // Heard something from the held spot: face it without giving up the angle.
          bot.investigateTimer += dt;
          turnToward(bot, yawTo(bot.position, bot.investigate), dt);
        } else {
          // Sweep the held angle.
          turnToward(bot, bot.watchYaw + Math.sin(time * 0.7 + bot.walkPhase) * 0.45, dt);
        }
      }

      // Walk cycle on the legs (purely visual).
      if (bot.moving) {
        bot.walkPhase += dt * 9;
        const swing = Math.sin(bot.walkPhase) * 0.5;
        bot.leftLeg.rotation.x = swing;
        bot.rightLeg.rotation.x = -swing;
      } else {
        bot.leftLeg.rotation.x *= 0.8;
        bot.rightLeg.rotation.x *= 0.8;
      }
    }
  }

  return {
    items: bots,
    hitMeshes,
    damage,
    hearNoise,
    resetSpawns,
    step,
    aliveCount(team) {
      let n = 0;
      for (const b of bots) if (b.alive && b.team === team) n += 1;
      return n;
    },
  };
}
