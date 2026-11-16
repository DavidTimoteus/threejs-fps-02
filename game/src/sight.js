// Line-of-sight queries shared by bots: map geometry (slab test against the map's AABB colliders)
// plus volumetric smoke occlusion supplied by the grenade system. Zero allocations per query.

const EPS = 1e-6;
const span = { tMin: 0, tMax: 1 };

// Clip the running [tMin, tMax] interval against one slab; false when the interval empties.
function clipSlab(origin, dir, lo, hi) {
  if (Math.abs(dir) < EPS) return origin >= lo && origin <= hi;
  let t1 = (lo - origin) / dir;
  let t2 = (hi - origin) / dir;
  if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
  if (t1 > span.tMin) span.tMin = t1;
  if (t2 < span.tMax) span.tMax = t2;
  return span.tMin <= span.tMax;
}

// Segment a + t*d, t in [0, 1], against an axis-aligned THREE.Box3.
function segmentHitsBox(a, dx, dy, dz, box) {
  span.tMin = 0;
  span.tMax = 1;
  return clipSlab(a.x, dx, box.min.x, box.max.x)
    && clipSlab(a.y, dy, box.min.y, box.max.y)
    && clipSlab(a.z, dz, box.min.z, box.max.z);
}

export function createSight(colliders, smoke) {
  // Only boxes tall enough to hide a head occlude; the floor slab and raised site platforms do not.
  const occluders = colliders.filter((c) => c.max.y > 0.6);

  function wallBetween(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    for (let i = 0; i < occluders.length; i += 1) {
      if (segmentHitsBox(a, dx, dy, dz, occluders[i])) return true;
    }
    return false;
  }

  return {
    wallBetween,
    // Ground point (x, z) inside a live smoke cloud: bots wait at its edge rather than walk in blind.
    inSmoke(x, z) {
      return smoke ? smoke.insideSmoke(x, z) : false;
    },
    // Clear view: no smoke cloud and no wall between the two points.
    canSee(a, b) {
      if (smoke && smoke.smokeBlocks(a, b)) return false;
      return !wallBetween(a, b);
    },
  };
}
