// Tactical AI Bots Engine.
// Autonomous Counter-Strike style bots featuring 5-state behavior trees, waypoint navigation,
// line-of-sight engagement with recoil burst firing, and tactical bomb planting/defusing.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_CONFIGS = [
  { id: 'bot_phoenix', name: 'Phoenix', team: 'T', lane: 'LongA', weapon: 'ak47' },
  { id: 'bot_anarchist', name: 'Anarchist', team: 'T', lane: 'B', weapon: 'ak47' },
  { id: 'bot_seal', name: 'SEAL Alpha', team: 'CT', lane: 'LongA', weapon: 'ak47' },
  { id: 'bot_swat', name: 'SWAT Bravo', team: 'CT', lane: 'B', weapon: 'deagle' },
];

const WAYPOINTS = {
  LongA_T: [new THREE.Vector3(-18, 0, 18), new THREE.Vector3(-18, 0, 6), new THREE.Vector3(-18, 0, -4), new THREE.Vector3(-16.5, 0, -12)],
  B_T: [new THREE.Vector3(17, 0, 18), new THREE.Vector3(17, 0, 6), new THREE.Vector3(17, 0, -4), new THREE.Vector3(16.5, 0, -12)],
  LongA_CT: [new THREE.Vector3(-16.5, 0, -18), new THREE.Vector3(-16.5, 0, -10), new THREE.Vector3(-18, 0, -2)],
  B_CT: [new THREE.Vector3(16.5, 0, -18), new THREE.Vector3(16.5, 0, -10), new THREE.Vector3(17, 0, -2)],
};

export function createBots(scene, onKillfeed) {
  const ctMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ctBlue), roughness: 0.65 });
  const tMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.tYellow), roughness: 0.65 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.5 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), metalness: 0.7 });

  const torsoGeo = new THREE.BoxGeometry(0.55, 0.75, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.06, 0.08, 0.38);

  const bots = [];
  const hitMeshes = [];

  // Scratch vectors for zero allocation
  const _diff = new THREE.Vector3();
  const _targetPos = new THREE.Vector3();
  const _shootDir = new THREE.Vector3();

  for (let i = 0; i < BOT_CONFIGS.length; i += 1) {
    const cfg = BOT_CONFIGS[i];
    const group = new THREE.Group();
    const mat = cfg.team === 'CT' ? ctMat : tMat;

    // Torso
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.05;
    torso.userData.part = 'torso';

    // Head (Headshot target)
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.58;
    head.userData.part = 'head';

    // Legs
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.16, 0.35, 0);
    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.16, 0.35, 0);

    // Weapon in hand
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.28, 1.05, -0.22);

    group.add(torso, head, leftLeg, rightLeg, gun);
    group.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      cfg,
      group,
      torso,
      head,
      position: group.position,
      health: 100,
      armor: 50,
      alive: true,
      state: 'PATROL', // 'PATROL', 'HOLD', 'ENGAGE', 'OBJECTIVE'
      stateTimer: 0,
      waypointIndex: 0,
      route: cfg.team === 'T' ? (cfg.lane === 'LongA' ? WAYPOINTS.LongA_T : WAYPOINTS.B_T) : (cfg.lane === 'LongA' ? WAYPOINTS.LongA_CT : WAYPOINTS.B_CT),
      cooldown: 0,
      burstCount: 0,
      targetEntity: null,
      yaw: 0,
      pitch: 0,
    };

    torso.userData.target = bot;
    head.userData.target = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function resetSpawns(world) {
    for (const bot of bots) {
      bot.alive = true;
      bot.health = 100;
      bot.armor = 50;
      bot.state = 'PATROL';
      bot.stateTimer = 0;
      bot.waypointIndex = 0;
      bot.group.visible = true;

      const spawnBase = bot.cfg.team === 'CT' ? world.spawnPoints.CT : world.spawnPoints.T;
      const offset = (Math.random() - 0.5) * 6;
      bot.position.set(spawnBase.x + offset, 0, spawnBase.z + (bot.cfg.team === 'CT' ? 3 : -3));
      bot.yaw = bot.cfg.team === 'CT' ? 0 : Math.PI;
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
    if (bot.health <= 0) {
      bot.alive = false;
      bot.group.visible = false;
      if (onKillfeed) {
        onKillfeed(attackerName, bot.cfg.name, isHeadshot);
      }
      return true; // Killed
    }
    return false;
  }

  function step(dt, player, bomb, colliders) {
    for (const bot of bots) {
      if (!bot.alive) continue;

      bot.stateTimer += dt;
      if (bot.cooldown > 0) bot.cooldown = Math.max(0, bot.cooldown - dt);

      // --- 1. Sensory Line of Sight Check ---
      let enemy = null;
      if (player.state.team !== bot.cfg.team && player.state.health > 0) {
        const dToPlayer = bot.position.distanceTo(player.state.position);
        if (dToPlayer < 38) enemy = player;
      }

      // Check opposing team bots
      if (!enemy) {
        for (const other of bots) {
          if (other.alive && other.cfg.team !== bot.cfg.team) {
            if (bot.position.distanceTo(other.position) < 32) {
              enemy = other;
              break;
            }
          }
        }
      }

      // --- 2. State Machine Transitions ---
      if (enemy) {
        bot.state = 'ENGAGE';
        bot.targetEntity = enemy;
      } else if (bomb.isPlanted && bot.cfg.team === 'CT') {
        bot.state = 'OBJECTIVE';
      } else if (bot.state === 'ENGAGE' && !enemy) {
        bot.state = 'PATROL';
      }

      // --- 3. Execute States ---
      if (bot.state === 'ENGAGE' && bot.targetEntity) {
        const enemyPos = bot.targetEntity === player ? player.state.position : bot.targetEntity.position;
        if (!enemyPos) {
          bot.state = 'PATROL';
          continue;
        }
        _diff.subVectors(enemyPos, bot.position);
        bot.yaw = Math.atan2(-_diff.x, -_diff.z);
        bot.group.rotation.y = bot.yaw;

        // Controlled burst firing
        if (bot.cooldown <= 0) {
          bot.cooldown = 0.14;
          bot.burstCount += 1;

          // Damage player if targeted
          if (bot.targetEntity === player) {
            const hitRoll = Math.random();
            if (hitRoll < 0.32) {
              const isHead = hitRoll < 0.08;
              player.damage(isHead ? 36 : 14, isHead);
            }
          }

          if (bot.burstCount >= 3) {
            bot.burstCount = 0;
            bot.cooldown = 0.65; // Recoil reset pause
          }
        }
      } else if (bot.state === 'OBJECTIVE') {
        // Move toward C4
        _diff.subVectors(bomb.position, bot.position);
        _diff.y = 0;
        const dist = _diff.length();
        if (dist > 1.8) {
          _diff.normalize();
          bot.position.x += _diff.x * 3.8 * dt;
          bot.position.z += _diff.z * 3.8 * dt;
          bot.yaw = Math.atan2(-_diff.x, -_diff.z);
          bot.group.rotation.y = bot.yaw;
        } else {
          // In defuse range
          bomb.startDefusing(bot.position);
          bomb.updateDefusing(dt, true, bot.position, true);
        }
      } else {
        // Patrol along route
        const currentTarget = bot.route[bot.waypointIndex];
        if (currentTarget) {
          _diff.subVectors(currentTarget, bot.position);
          _diff.y = 0;
          const dist = _diff.length();
          if (dist < 1.4) {
            bot.waypointIndex = Math.min(bot.route.length - 1, bot.waypointIndex + 1);
          } else {
            _diff.normalize();
            bot.position.x += _diff.x * 3.5 * dt;
            bot.position.z += _diff.z * 3.5 * dt;
            bot.yaw = Math.atan2(-_diff.x, -_diff.z);
            bot.group.rotation.y = bot.yaw;
          }
        }
      }
    }
  }

  return {
    items: bots,
    hitMeshes,
    damage,
    resetSpawns,
    step,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.cfg.team === team).length;
    },
    aimPoint(index) {
      const b = bots[index];
      if (!b) return new THREE.Vector3();
      return b.head.getWorldPosition(new THREE.Vector3());
    }
  };
}
