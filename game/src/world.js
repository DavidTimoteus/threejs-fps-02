// Sandstone Outpost: A tactical 3-lane Counter-Strike style competitive map.
// Distinct sightlines, cover crates, tactical lanes (Long A, Mid, B-Apartments), and Bomb Sites A & B.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const [key, color] of Object.entries(PALETTE)) {
    materials[key] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: key === 'sand' || key === 'darkSand' ? 0.88 : key === 'crate' ? 0.75 : key === 'metal' ? 0.35 : 0.65,
      metalness: key === 'metal' ? 0.6 : 0.05,
    });
  }

  const colliders = [];
  const shootables = [];

  function addBox(w, h, d, x, y, z, matKey) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[matKey] || materials.sand);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function addMarker(x, z, radius, colorHex, label) {
    // Glowing tactical ground circle for bomb site
    const ringGeo = new THREE.RingGeometry(radius - 0.25, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    group.add(ring);

    // Center pulsating beacon pillar
    const beaconGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 12);
    const beaconMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(x, 1.75, z);
    group.add(beacon);

    return { x, z, radius, label };
  }

  // --- Foundation & Outer Perimeter (54m x 54m) ---
  addBox(54, 0.4, 54, 0, -0.4, 0, 'surface'); // Ground foundation
  addBox(0.8, 5.5, 54, -27, 0, 0, 'sand');    // West wall
  addBox(0.8, 5.5, 54, 27, 0, 0, 'sand');     // East wall
  addBox(54, 5.5, 0.8, 0, 0, -27, 'sand');    // North wall (CT Back)
  addBox(54, 5.5, 0.8, 0, 0, 27, 'sand');     // South wall (T Back)

  // --- Spawns ---
  // CT Spawn Platform & Barrier (North)
  addBox(14, 0.3, 8, 0, 0, -22, 'surface');
  addBox(4, 2.2, 0.8, -4, 0, -18, 'darkSand');
  addBox(4, 2.2, 0.8, 4, 0, -18, 'darkSand');

  // T Spawn Platform & Barrier (South)
  addBox(14, 0.3, 8, 0, 0, 22, 'surface');
  addBox(4, 2.2, 0.8, -4, 0, 18, 'darkSand');
  addBox(4, 2.2, 0.8, 4, 0, 18, 'darkSand');

  // --- Long A Lane (West corridor: x around -18, z from 20 to -16) ---
  // Outer divider wall separating Long A from Mid
  addBox(0.8, 4.5, 26, -11, 0, 5, 'sand');
  // Cover crates in Long A
  addBox(2.2, 1.4, 1.4, -18, 0, 10, 'crate');
  addBox(1.4, 2.4, 1.4, -16.5, 0, 4, 'crate');
  addBox(2.8, 1.2, 1.2, -19, 0, -2, 'metal');
  // Pit / corner alcove
  addBox(4.5, 3.8, 0.8, -24, 0, 12, 'darkSand');

  // --- Mid Courtyard (Center: x in [-8, 8], z in [-12, 12]) ---
  // Double archway structure at z=0
  addBox(5.5, 4.8, 1.0, -5.5, 0, 0, 'sand');
  addBox(5.5, 4.8, 1.0, 5.5, 0, 0, 'sand');
  addBox(6.0, 1.2, 1.0, 0, 3.6, 0, 'darkSand'); // Arch lintel

  // Mid cover & sniper perches
  addBox(1.8, 1.3, 1.8, -2.5, 0, -6, 'crate');
  addBox(1.8, 1.3, 1.8, 2.5, 0, 6, 'crate');
  addBox(3.0, 0.9, 1.5, 0, 0, 0, 'metal');

  // --- B Apartments / Alleys (East corridor: x around 18, z from 20 to -16) ---
  // Divider wall separating B from Mid
  addBox(0.8, 4.5, 26, 11, 0, 5, 'sand');
  // Apartment hallway structures & corners
  addBox(6.5, 3.8, 0.8, 16, 0, 12, 'darkSand');
  addBox(1.6, 2.2, 1.6, 19, 0, 3, 'crate');
  addBox(2.4, 1.4, 1.4, 15, 0, -2, 'metal');
  addBox(1.8, 1.4, 1.8, 20, 0, -6, 'crate');

  // --- Bomb Site A (West North: [-17, 0, -13]) ---
  // Raised tactical platform
  addBox(9.0, 0.45, 9.0, -17, 0, -13, 'surface');
  // Site cover boxes & steel container
  addBox(3.2, 2.2, 1.6, -18.5, 0.45, -11, 'crate');
  addBox(2.0, 1.4, 2.0, -14, 0.45, -15, 'metal');
  addBox(1.4, 2.8, 1.4, -19.5, 0.45, -15.5, 'darkSand');
  const siteA = addMarker(-17, -13, 4.2, 0x44d7b6, 'A');

  // --- Bomb Site B (East North: [17, 0, -13]) ---
  // Raised tactical platform
  addBox(9.0, 0.45, 9.0, 17, 0, -13, 'surface');
  // Site cover storage & barrels
  addBox(3.6, 2.4, 2.0, 16, 0.45, -14, 'metal');
  addBox(2.2, 1.3, 1.4, 19, 0.45, -11, 'crate');
  addBox(1.5, 1.8, 1.5, 13.5, 0.45, -11.5, 'crate');
  const siteB = addMarker(17, -13, 4.2, 0xd744b6, 'B');

  // --- Connectors (A Short / CT Connector & B Door) ---
  addBox(0.8, 4.0, 7.0, -9, 0, -16, 'darkSand'); // CT to A corridor
  addBox(0.8, 4.0, 7.0, 9, 0, -16, 'darkSand');  // CT to B corridor

  // --- Lighting & Atmosphere ---
  // Warm golden sun key light with crisp soft shadows
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.2);
  sun.position.set(16, 26, 14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Cool sky hemisphere ambient fill
  const ambient = new THREE.HemisphereLight(new THREE.Color(PALETTE.sand), new THREE.Color(PALETTE.canvas), 0.95);
  scene.add(ambient);

  // Secondary tactical fill light
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.6);
  fill.position.set(-16, 18, -16);
  scene.add(fill);

  return {
    group,
    colliders,
    shootables,
    sites: { A: siteA, B: siteB },
    spawnPoints: {
      CT: new THREE.Vector3(0, 0.3, -22),
      T: new THREE.Vector3(0, 0.3, 22),
      LongA_CT: new THREE.Vector3(-18, 0, -8),
      LongA_T: new THREE.Vector3(-18, 0, 16),
      Mid_CT: new THREE.Vector3(0, 0, -10),
      Mid_T: new THREE.Vector3(0, 0, 10),
      B_CT: new THREE.Vector3(17, 0, -8),
      B_T: new THREE.Vector3(17, 0, 16),
    }
  };
}
