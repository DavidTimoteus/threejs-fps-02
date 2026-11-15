# threejs-fps-02: Tactical Strike (CS-Style Tactical FPS)

[![make.fun](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/DavidTimoteus/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/DavidTimoteus/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02)

Tactical round-based first-person shooter built on Three.js 0.187.0 featuring classic Counter-Strike dynamics.

## Key Features
- **Tactical Rounds & Bomb Objective**: Defusal objective at Bomb Sites A & B with C4 planting, ticking timer, and defusal mechanics.
- **Weapon Arsenal & Buy Menu**: Tactical economy ($800 starting cash, kill rewards, round bonuses) with buy menu (B key) for Pistols, Rifles, SMGs, Shotguns, Armor, Defusal Kits, and Grenades.
- **Advanced Ballistics & Movement**: Recoil impulse, movement bloom penalty (stopping to aim rewards accuracy), headshot hit multipliers (3x head, 1x torso, 0.75x limbs), smooth crouching and jumping physics.
- **Tactical AI Opponents**: Behavior-tree driven bots that navigate lanes, hold angles, react to gunfire audio, peek corners, and engage in bomb site battles.
- **Zero-Allocation Fixed-Step Loop**: 60 Hz deterministic simulation tick decoupled from rendering, with object pooling for vectors and particles.
- **Original Three-Lane Map ("Sandstone Outpost")**: High-contrast, styled desert outpost geometry with distinct sightlines, cover crates, and bomb sites.

## Controls
- **WASD**: Movement
- **Mouse**: Aim / Look
- **Left Click**: Fire weapon
- **Right Click**: Weapon ADS / Zoom
- **R**: Reload
- **B**: Buy Menu (during Buy Time)
- **E**: Plant / Defuse C4 / Interact
- **Shift**: Walk (silent movement & reduced spread)
- **Ctrl / C**: Crouch (recoil reduction)
- **Space**: Jump
- **1, 2, 3, 4**: Primary, Secondary, Knife, Grenades

## Running Locally
```bash
node serve.ts
# Open http://localhost:8080 in Chrome
```

## License
MIT (see LICENSE)
