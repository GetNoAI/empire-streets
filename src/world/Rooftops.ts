import type { District } from '../creatures/Data';
import { districtAt } from '../creatures/SpawnRules';
import { Rng } from '../util/rng';
import type { Building, CityLayout, Rect } from './CityLayout';

/**
 * Rooftop plan (engine-free, unit-tested): which roofs you can walk on, how you get up (fire
 * escapes, elevators, garage ramps), jump pads between roofs of different heights, hidden jump
 * spots onto secret roofs, and loot stashes. Built once from the city layout with a fixed seed,
 * so stash ids stay the same between sessions.
 */

export const ROOFS = {
  /** Walkable roofs: low and mid-rise, no setback tower, at least this big (m). */
  minHeight: 6,
  maxHeight: 40,
  minSize: 8,
  /** Elevator roofs: tall buildings. */
  tallMin: 40,
  /** One fire escape per this many walkable buildings (at least 3 per district). */
  fireEscapeEvery: 3,
  minFireEscapes: 3,
  elevatorsPerDistrict: 2,
  /** Garage: two neighbouring lots this long in total become a parking garage with a ramp. */
  garageMinLength: 44,
  garageDeck: 9,
  garageLane: 6.5,
  garageLanding: 8,
  /** Flat apron at the bottom of the lane to swing in from the sidewalk before the climb. */
  garageApron: 6,
  /** Roofs this close are neighbours (m). */
  touch: 0.6,
  /** Walk between neighbours up to this step; drop down at most this far. */
  walkStep: 0.7,
  maxDrop: 12,
  /** Jump pads lift up to this much; hidden spots up to `hiddenMax`. */
  padMax: 12,
  hiddenMax: 26,
  padsPerDistrict: 8,
  hiddenPerDistrict: 2,
  stashesPerDistrict: 4,
  /** Pad 3 m back from the edge; land 2.5 m beyond it; clear the higher roof by this much. */
  padBack: 3,
  landIn: 2.5,
  apexClear: 1.6,
  gravity: 9.81,
  /** Interaction radius for access points and stashes (m). */
  useRadius: 1.8,
  /**
   * No soft locks: what the player can really do. Step up without jumping (the controller's
   * autostep is 0.4), stairs between roofs up to `stairMax` apart, drops that cost little health
   * (`freeDrop`) and drops you survive at full health (`survivableDrop`).
   */
  stepUp: 0.38,
  stairMax: 3,
  stairRise: 0.3,
  stairTread: 0.45,
  stairWidth: 1.8,
  freeDrop: 12,
  survivableDrop: 29,
} as const;

export type Face = 'n' | 's' | 'e' | 'w';

export interface RoofSpot {
  id: number;
  rect: Rect;
  top: number;
  district: District;
  /** 'podium': the ledge around a stepped tower (not a destination, but you can land on it). */
  kind: 'roof' | 'tall' | 'garage' | 'podium';
}

/** Steps up from a lower roof to a neighbour up to `ROOFS.stairMax` higher, against their shared edge. */
export interface Stair {
  id: string;
  lowRoof: number;
  highRoof: number;
  /** Middle of the shared edge, and the direction from the low roof into the high one. */
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  bottom: number;
  top: number;
  steps: number;
  tread: number;
  width: number;
}

export interface Access {
  id: string;
  kind: 'fireEscape' | 'elevator';
  roofId: number;
  district: District;
  face: Face;
  /** Where you stand on the street (feet), and where you arrive on the roof (feet). */
  street: { x: number; y: number; z: number };
  roof: { x: number; y: number; z: number };
}

export interface Garage {
  id: string;
  district: District;
  rect: Rect;
  face: Face;
  deck: number;
  /** The ramp lane (street side), the deck (the rest) and the landing at the top of the lane. */
  lane: Rect;
  deckRect: Rect;
  landing: Rect;
  /** Ramp from foot (x, street height) to top (x, deck height), along x. */
  footX: number;
  topX: number;
  dir: 1 | -1;
}

export interface JumpPad {
  id: string;
  fromRoof: number;
  toRoof: number;
  hidden: boolean;
  x: number;
  y: number;
  z: number;
  land: { x: number; y: number; z: number };
  /** Launch velocity (m/s). */
  vx: number;
  vy: number;
  vz: number;
  /** Seconds in the air. */
  flight: number;
}

export interface Stash {
  id: string;
  roofId: number;
  secret: boolean;
  x: number;
  y: number;
  z: number;
  loot: Array<[string, number]>;
}

export interface RooftopPlan {
  roofs: RoofSpot[];
  access: Access[];
  garages: Garage[];
  pads: JumpPad[];
  stashes: Stash[];
  /** Roof ids reachable on foot from any access point. */
  reachable: Set<number>;
  stairs: Stair[];
  /** Every roof you can end up on (including painful drops); each has a way back to the street. */
  walkable: Set<number>;
}

const w = (r: Rect): number => r.x1 - r.x0;
const d = (r: Rect): number => r.z1 - r.z0;
const cx = (r: Rect): number => (r.x0 + r.x1) / 2;
const cz = (r: Rect): number => (r.z0 + r.z1) / 2;
const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const SIDEWALK = 0.15;

/**
 * Picks one pair of neighbouring lots per district (not the park) to become a parking garage,
 * removes those buildings from the layout (so the city builder doesn't build them) and drops the
 * parked cars in front of the ramp. Call before the city is built. Deterministic.
 */
export function planGarages(layout: CityLayout, seed = 7311): Garage[] {
  const rng = new Rng(seed);
  const out: Garage[] = [];
  const used = new Set<Building>();
  const byDistrict = new Map<District, Array<{ a: Building; b: Building; face: Face }>>();
  const bs = layout.buildings;
  for (const a of bs) {
    if (a.setback) continue;
    for (const b of bs) {
      if (b === a || b.setback) continue;
      if (Math.abs(a.rect.x1 - b.rect.x0) > 0.3 || Math.abs(a.rect.z0 - b.rect.z0) > 0.3 || Math.abs(a.rect.z1 - b.rect.z1) > 0.3) continue;
      const len = b.rect.x1 - a.rect.x0;
      if (len < ROOFS.garageMinLength || d(a.rect) < 16) continue;
      const merged: Rect = { x0: a.rect.x0, z0: a.rect.z0, x1: b.rect.x1, z1: a.rect.z1 };
      // Not at the corner of a block: cars need a straight run along the sidewalk onto the ramp.
      const blk = layout.blocks.find((k) => inRect(k, cx(merged), cz(merged)));
      if (!blk || merged.x0 - 18 < blk.x0) continue;
      const face = streetFace(layout, merged, (x, z) => bs.some((o) => o !== a && o !== b && inRect(o.rect, x, z)));
      if (!face || (face !== 'n' && face !== 's')) continue;
      const dist = districtAt(layout, cx(merged), cz(merged));
      if (dist === 'park') continue;
      let list = byDistrict.get(dist);
      if (!list) byDistrict.set(dist, (list = []));
      list.push({ a, b, face });
    }
  }
  for (const [dist, list] of [...byDistrict.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    const free = list.filter((c) => !used.has(c.a) && !used.has(c.b));
    if (!free.length) continue;
    const c = free[Math.floor(rng.next() * free.length)];
    used.add(c.a);
    used.add(c.b);
    const rect: Rect = { x0: c.a.rect.x0, z0: c.a.rect.z0, x1: c.b.rect.x1, z1: c.a.rect.z1 };
    const L = ROOFS.garageLane;
    const lane: Rect = c.face === 'n' ? { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z0 + L } : { x0: rect.x0, z0: rect.z1 - L, x1: rect.x1, z1: rect.z1 };
    const deckRect: Rect = c.face === 'n' ? { x0: rect.x0, z0: rect.z0 + L, x1: rect.x1, z1: rect.z1 } : { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1 - L };
    // Ramp climbs along +x; the landing is at the far end of the lane.
    const landing: Rect = { ...lane, x0: rect.x1 - ROOFS.garageLanding };
    out.push({ id: `gar-${dist}`, district: dist, rect, face: c.face, deck: ROOFS.garageDeck, lane, deckRect, landing, footX: rect.x0 + ROOFS.garageApron, topX: rect.x1 - ROOFS.garageLanding, dir: 1 });
  }
  layout.buildings = layout.buildings.filter((b) => !used.has(b));
  // No parked cars blocking the way onto a ramp.
  layout.parking = layout.parking.filter((p) => !out.some((g) => p.x > g.rect.x0 - 34 && p.x < g.rect.x0 + 14 && Math.abs(p.z - (g.face === 'n' ? g.rect.z0 : g.rect.z1)) < 10));
  return out;
}

/** The side of a footprint that faces a sidewalk (outside of it is open pavement), if any. */
export function streetFace(layout: CityLayout, r: Rect, occupied: (x: number, z: number) => boolean): Face | null {
  const tests: Array<[Face, number, number]> = [
    ['n', cx(r), r.z0 - 1.5],
    ['s', cx(r), r.z1 + 1.5],
    ['w', r.x0 - 1.5, cz(r)],
    ['e', r.x1 + 1.5, cz(r)],
  ];
  for (const [f, x, z] of tests) {
    if (!layout.blocks.some((b) => inRect(b, x, z))) continue;
    if (occupied(x, z)) continue;
    return f;
  }
  return null;
}

/** Launch velocity from one point to another: up and over with `clear` m to spare, no air control. */
export function ballistic(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, clear: number, g = ROOFS.gravity): { vx: number; vy: number; vz: number; flight: number } {
  const dh = to.y - from.y;
  const apex = Math.max(dh, 0) + clear;
  const vy = Math.sqrt(2 * g * apex);
  const up = vy / g;
  const down = Math.sqrt((2 * (apex - dh)) / g);
  const T = up + down;
  return { vx: (to.x - from.x) / T, vy, vz: (to.z - from.z) / T, flight: T };
}

/** Where a launched point is after `t` seconds (for tests and the safety net). */
export function flightAt(from: { x: number; y: number; z: number }, v: { vx: number; vy: number; vz: number }, t: number, g = ROOFS.gravity): { x: number; y: number; z: number } {
  return { x: from.x + v.vx * t, y: from.y + v.vy * t - 0.5 * g * t * t, z: from.z + v.vz * t };
}

interface Edge {
  a: number;
  b: number;
  /** Shared edge: on the a side, a point at the middle of the overlap, and the axis. */
  mx: number;
  mz: number;
  /** Unit direction from a into b. */
  nx: number;
  nz: number;
  overlap: number;
}

/** Neighbouring roofs (touching footprints) with the middle of their shared edge. */
function neighbours(roofs: RoofSpot[], minOverlap = 4): Edge[] {
  const out: Edge[] = [];
  const T = ROOFS.touch;
  for (const A of roofs)
    for (const B of roofs) {
      if (A.id === B.id) continue;
      const a = A.rect;
      const b = B.rect;
      // B east of A.
      if (Math.abs(a.x1 - b.x0) < T) {
        const o0 = Math.max(a.z0, b.z0);
        const o1 = Math.min(a.z1, b.z1);
        if (o1 - o0 > minOverlap) out.push({ a: A.id, b: B.id, mx: a.x1, mz: (o0 + o1) / 2, nx: 1, nz: 0, overlap: o1 - o0 });
      }
      // B west of A.
      if (Math.abs(a.x0 - b.x1) < T) {
        const o0 = Math.max(a.z0, b.z0);
        const o1 = Math.min(a.z1, b.z1);
        if (o1 - o0 > minOverlap) out.push({ a: A.id, b: B.id, mx: a.x0, mz: (o0 + o1) / 2, nx: -1, nz: 0, overlap: o1 - o0 });
      }
      // B south of A.
      if (Math.abs(a.z1 - b.z0) < T) {
        const o0 = Math.max(a.x0, b.x0);
        const o1 = Math.min(a.x1, b.x1);
        if (o1 - o0 > minOverlap) out.push({ a: A.id, b: B.id, mx: (o0 + o1) / 2, mz: a.z1, nx: 0, nz: 1, overlap: o1 - o0 });
      }
      // B north of A.
      if (Math.abs(a.z0 - b.z1) < T) {
        const o0 = Math.max(a.x0, b.x0);
        const o1 = Math.min(a.x1, b.x1);
        if (o1 - o0 > minOverlap) out.push({ a: A.id, b: B.id, mx: (o0 + o1) / 2, mz: a.z0, nx: 0, nz: -1, overlap: o1 - o0 });
      }
    }
  return out;
}

/** Plans every rooftop feature for a city. Call after `planGarages`. */
/** Something on the pavement an entrance must keep clear of (radius r, metres). */
export interface KeepClear {
  x: number;
  z: number;
  r: number;
}

/** Along-the-facade positions tried for an entrance, middle first. */
export const ACCESS_SLOTS = [0.5, 0.36, 0.64, 0.24, 0.76] as const;
/** Two entrances' street spots stay at least this far apart (m). */
export const ACCESS_SPACING = 7;

/**
 * `avoid`: street furniture, shop and clinic doors, the Chop Shop lift and so on. A fire escape or
 * elevator door slides along its facade to the first slot that's clear of them and of the other
 * entrances (the middle one if none is).
 */
export function planRooftops(layout: CityLayout, garages: Garage[], seed = 4021, avoid: readonly KeepClear[] = []): RooftopPlan {
  const rng = new Rng(seed);
  const roofs: RoofSpot[] = [];
  for (const b of layout.buildings) {
    if (b.setback || w(b.rect) < ROOFS.minSize || d(b.rect) < ROOFS.minSize || b.height < ROOFS.minHeight) continue;
    const kind = b.height > ROOFS.maxHeight ? (b.height >= ROOFS.tallMin && w(b.rect) >= 10 && d(b.rect) >= 10 ? 'tall' : null) : 'roof';
    if (!kind) continue;
    const id = roofs.length;
    roofs.push({ id, rect: b.rect, top: b.height, district: districtAt(layout, cx(b.rect), cz(b.rect)), kind });
  }
  const garageRoof = new Map<string, number>();
  for (const g of garages) {
    const id = roofs.length;
    roofs.push({ id, rect: g.deckRect, top: g.deck, district: g.district, kind: 'garage' });
    garageRoof.set(g.id, id);
  }
  const occupied = (x: number, z: number): boolean => layout.buildings.some((o) => inRect(o.rect, x, z)) || garages.some((g) => inRect(g.rect, x, z));
  const districts = [...new Set(roofs.map((r) => r.district))].filter((x) => x !== 'park').sort();

  // ---- access points
  const access: Access[] = [];
  const makeAccess = (r: RoofSpot, kind: Access['kind'], n: number): Access | null => {
    const face = streetFace(layout, r.rect, occupied);
    if (!face) return null;
    const out = 1.3;
    const inn = 1.6;
    const ox = face === 'e' ? 1 : face === 'w' ? -1 : 0;
    const oz = face === 's' ? 1 : face === 'n' ? -1 : 0;
    const spot = (along: number): [number, number] => [
      face === 'e' ? r.rect.x1 : face === 'w' ? r.rect.x0 : r.rect.x0 + w(r.rect) * along,
      face === 's' ? r.rect.z1 : face === 'n' ? r.rect.z0 : r.rect.z0 + d(r.rect) * along,
    ];
    // Fire escapes are ~3.2 m wide on the wall, elevators ~3 m with their canopy: keep that clear.
    const half = 2.2;
    const clear = (x: number, z: number): boolean =>
      avoid.every((k) => Math.hypot(k.x - x, k.z - z) >= k.r + half) && access.every((a) => Math.hypot(a.street.x - x, a.street.z - z) >= ACCESS_SPACING);
    const pick = ACCESS_SLOTS.map(spot).find(([x, z]) => clear(x + ox * out, z + oz * out)) ?? spot(0.5);
    const [px, pz] = pick;
    return {
      id: `${kind === 'elevator' ? 'el' : 'fe'}-${r.district}-${n}`,
      kind,
      roofId: r.id,
      district: r.district,
      face,
      street: { x: px + ox * out, y: SIDEWALK, z: pz + oz * out },
      roof: { x: px - ox * inn, y: r.top, z: pz - oz * inn },
    };
  };
  for (const dist of districts) {
    const low = roofs.filter((r) => r.district === dist && r.kind === 'roof');
    const want = Math.max(ROOFS.minFireEscapes, Math.floor(low.length / ROOFS.fireEscapeEvery));
    const shuffled = shuffle(low, rng);
    let n = 0;
    for (const r of shuffled) {
      if (n >= want) break;
      const a = makeAccess(r, 'fireEscape', n);
      if (a) {
        access.push(a);
        n++;
      }
    }
    // Elevators on the tallest buildings with a street door (falls back to the tallest low roofs).
    const tall = roofs.filter((r) => r.district === dist && r.kind === 'tall').sort((x, y) => y.top - x.top);
    const pool = tall.length ? tall : [...low].sort((x, y) => y.top - x.top);
    let e = 0;
    for (const r of pool) {
      if (e >= ROOFS.elevatorsPerDistrict) break;
      if (access.some((a) => a.roofId === r.id)) continue;
      const a = makeAccess(r, 'elevator', e);
      if (a) {
        access.push(a);
        e++;
      }
    }
  }

  // ---- reachability and pads
  const edges = neighbours(roofs);
  const byId = (id: number): RoofSpot => roofs[id];
  const reachable = new Set<number>([...access.map((a) => a.roofId), ...garageRoof.values()]);
  const pads: JumpPad[] = [];
  const padCount = new Map<string, number>();
  const hiddenCount = new Map<string, number>();
  const padBetween = (e: Edge, hidden: boolean): JumpPad => {
    const A = byId(e.a);
    const B = byId(e.b);
    const from = { x: e.mx - e.nx * ROOFS.padBack, y: A.top, z: e.mz - e.nz * ROOFS.padBack };
    const land = { x: e.mx + e.nx * ROOFS.landIn, y: B.top, z: e.mz + e.nz * ROOFS.landIn };
    // Raise the arc until it's well over the higher roof's edge where it crosses it.
    const edgeFrac = ROOFS.padBack / (ROOFS.padBack + ROOFS.landIn);
    let clear: number = ROOFS.apexClear;
    let v = ballistic(from, land, clear);
    for (let i = 0; i < 40 && flightAt(from, v, v.flight * edgeFrac).y < Math.max(A.top, B.top) + 0.6; i++) v = ballistic(from, land, (clear += 0.25));
    return { id: `${hidden ? 'hid' : 'pad'}-${A.district}-${pads.length}`, fromRoof: A.id, toRoof: B.id, hidden, ...from, land, ...v };
  };
  // Grow the reachable set: walking, dropping, and placing pads up to higher neighbours.
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of edges) {
      if (!reachable.has(e.a) || reachable.has(e.b)) continue;
      const A = byId(e.a);
      const B = byId(e.b);
      const dh = B.top - A.top;
      if (Math.abs(dh) <= ROOFS.walkStep || (dh < 0 && -dh <= ROOFS.maxDrop)) {
        reachable.add(e.b);
        grew = true;
      } else if (dh > ROOFS.walkStep && dh <= ROOFS.padMax && A.kind !== 'tall' && B.kind !== 'tall') {
        const n = padCount.get(A.district) ?? 0;
        if (n >= ROOFS.padsPerDistrict) continue;
        // Pads need room on both sides.
        if (Math.min(w(A.rect), d(A.rect)) < ROOFS.padBack * 2 || Math.min(w(B.rect), d(B.rect)) < ROOFS.landIn * 2) continue;
        pads.push(padBetween(e, false));
        padCount.set(A.district, n + 1);
        reachable.add(e.b);
        grew = true;
      }
    }
  }
  // Hidden jump spots: from a reachable roof onto a much taller neighbour you couldn't otherwise reach.
  const secretRoofs: number[] = [];
  for (const e of shuffle(edges, rng)) {
    const A = byId(e.a);
    const B = byId(e.b);
    const dh = B.top - A.top;
    if (!reachable.has(e.a) || reachable.has(e.b) || dh <= ROOFS.padMax || dh > ROOFS.hiddenMax || B.kind === 'tall' || A.district === 'park') continue;
    const n = hiddenCount.get(A.district) ?? 0;
    if (n >= ROOFS.hiddenPerDistrict) continue;
    if (Math.min(w(B.rect), d(B.rect)) < ROOFS.landIn * 2) continue;
    pads.push(padBetween(e, true));
    hiddenCount.set(A.district, n + 1);
    reachable.add(e.b);
    secretRoofs.push(e.b);
  }

  // ---- no soft locks: stairs between uneven roofs, and a way down from every roof you can reach
  const legacyReachable = new Set(reachable);
  const planned = new Set(roofs.map((r) => `${r.rect.x0},${r.rect.z0},${r.rect.x1},${r.rect.z1}`));
  for (const b of layout.buildings) {
    if (planned.has(`${b.rect.x0},${b.rect.z0},${b.rect.x1},${b.rect.z1}`)) continue;
    roofs.push({ id: roofs.length, rect: b.rect, top: b.height, district: districtAt(layout, cx(b.rect), cz(b.rect)), kind: 'podium' });
  }

  // ---- stashes
  const stashes: Stash[] = [];
  const spotOn = (r: RoofSpot): { x: number; y: number; z: number } => ({
    x: r.rect.x0 + 2 + rng.next() * Math.max(0.1, w(r.rect) - 4),
    y: r.top,
    z: r.rect.z0 + 2 + rng.next() * Math.max(0.1, d(r.rect) - 4),
  });
  for (const dist of districts) {
    const cands = shuffle(
      roofs.filter((r) => r.district === dist && legacyReachable.has(r.id) && !secretRoofs.includes(r.id)),
      rng,
    );
    for (let i = 0; i < Math.min(ROOFS.stashesPerDistrict, cands.length); i++) {
      const r = cands[i];
      const loot: Array<[string, number]> = [['cash', 100 + Math.round(rng.next() * 15) * 10]];
      if (rng.next() < 0.6) loot.push([rng.next() < 0.5 ? 'cuffs' : 'net', 1 + Math.floor(rng.next() * 2)]);
      stashes.push({ id: `roof-${dist}-${String(i).padStart(2, '0')}`, roofId: r.id, secret: false, ...spotOn(r), loot });
    }
  }
  secretRoofs.forEach((id, i) => {
    const r = byId(id);
    const loot: Array<[string, number]> = [['cash', 250 + Math.round(rng.next() * 15) * 10], [rng.next() < 0.5 ? 'sparkPlug' : 'steelCase', 1], ['crate', 2]];
    stashes.push({ id: `roof-${r.district}-s${i}`, roofId: id, secret: true, ...spotOn(r), loot });
  });
  const safety = makeSafe(layout, roofs, access, pads, stashes, garageRoof, makeAccess, padBetween, occupied);
  return { roofs, access, garages, pads, stashes, reachable: legacyReachable, stairs: safety.stairs, walkable: safety.walkable };
}

const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Where the player can go on the roofs, as a directed graph: walk (small steps), stairs (both
 * ways), drop (down to `maxDrop`) and jump pads. Used to find roofs you can reach but not leave.
 */
export function roofMoves(roofs: readonly RoofSpot[], links: readonly Edge[], stairPairs: ReadonlySet<string>, pads: readonly JumpPad[], maxDrop: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const add = (a: number, b: number): void => {
    const l = out.get(a);
    if (l) l.push(b);
    else out.set(a, [b]);
  };
  for (const e of links) {
    const dh = roofs[e.b].top - roofs[e.a].top;
    if (Math.abs(dh) <= ROOFS.stepUp || stairPairs.has(pairKey(e.a, e.b)) || (dh < 0 && -dh <= maxDrop)) add(e.a, e.b);
  }
  for (const p of pads) add(p.fromRoof, p.toRoof);
  return out;
}

/** Roofs reachable from `start` along `moves`. */
export function closure(start: Iterable<number>, moves: Map<number, number[]>): Set<number> {
  const seen = new Set(start);
  const q = [...seen];
  while (q.length) {
    const a = q.pop()!;
    for (const b of moves.get(a) ?? []) if (!seen.has(b)) {
      seen.add(b);
      q.push(b);
    }
  }
  return seen;
}

/** Roofs from which some exit in `exits` can be reached along `moves`. */
export function canReach(exits: Iterable<number>, moves: Map<number, number[]>): Set<number> {
  const back = new Map<number, number[]>();
  for (const [a, bs] of moves) for (const b of bs) back.set(b, [...(back.get(b) ?? []), a]);
  return closure(exits, back);
}

/** Roofs that are themselves a way down: an access point, a garage, or a low street edge. */
export function exitRoofs(layout: CityLayout, roofs: readonly RoofSpot[], access: readonly Access[], occupied: (x: number, z: number) => boolean): Set<number> {
  const out = new Set<number>(access.map((a) => a.roofId));
  for (const r of roofs) {
    if (r.kind === 'garage') out.add(r.id);
    else if (r.top <= ROOFS.freeDrop && streetFace(layout, r.rect, occupied)) out.add(r.id);
  }
  return out;
}

function makeSafe(
  layout: CityLayout,
  roofs: RoofSpot[],
  access: Access[],
  pads: JumpPad[],
  stashes: readonly Stash[],
  garageRoof: Map<string, number>,
  makeAccess: (r: RoofSpot, kind: Access['kind'], n: number) => Access | null,
  padBetween: (e: Edge, hidden: boolean) => JumpPad,
  occupied: (x: number, z: number) => boolean,
): { stairs: Stair[]; walkable: Set<number> } {
  const links = neighbours(roofs, 0.8);
  const start = [...access.map((a) => a.roofId), ...garageRoof.values()];
  // Stairs wherever neighbours are a little apart, on roofs the player can get to.
  const stairable = links.filter((e) => {
    const dh = roofs[e.b].top - roofs[e.a].top;
    if (dh <= ROOFS.stepUp || dh > ROOFS.stairMax || e.overlap < ROOFS.stairWidth + 0.8) return false;
    // e.a is the low roof; the flight runs back into it from the shared edge.
    const steps = Math.ceil(dh / ROOFS.stairRise);
    const room = e.nx !== 0 ? w(roofs[e.a].rect) : d(roofs[e.a].rect);
    return room >= steps * ROOFS.stairTread + 0.6 && roofs[e.a].kind !== 'podium' && roofs[e.b].kind !== 'podium';
  });
  // Keep clear of what's already on the roofs: pads (and where they land), crates, elevator huts,
  // the spots where you arrive, and other flights. Edges with a pad already have their way up.
  const padPairs = new Set(pads.map((p) => pairKey(p.fromRoof, p.toRoof)));
  type Box = { x0: number; x1: number; z0: number; z1: number; y: number };
  const blockers: Box[] = [];
  const disc = (x: number, z: number, r: number, y: number): Box => ({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, y });
  const addFixed = (): void => {
    blockers.length = 0;
    for (const p of pads) blockers.push(disc(p.x, p.z, 1.6, p.y), disc(p.land.x, p.land.z, 1.6, p.land.y));
    for (const st of stashes) blockers.push(disc(st.x, st.z, 1.4, st.y));
    for (const a of access) {
      blockers.push(disc(a.roof.x, a.roof.z, 1.6, a.roof.y));
      if (a.kind === 'elevator') {
        const ox = a.face === 'e' ? 1 : a.face === 'w' ? -1 : 0;
        const oz = a.face === 's' ? 1 : a.face === 'n' ? -1 : 0;
        blockers.push(disc(a.roof.x - ox * 3.2, a.roof.z - oz * 3.2, 2.2, a.roof.y));
      }
    }
  };
  addFixed();
  const stairBox = (e: Edge, steps: number, y: number): Box => {
    const len = steps * ROOFS.stairTread;
    const half = ROOFS.stairWidth / 2 + 0.5;
    const bx = e.mx - e.nx * (len + 1.2);
    const bz = e.mz - e.nz * (len + 1.2);
    return { x0: Math.min(e.mx, bx) - (e.nz ? half : 0), x1: Math.max(e.mx, bx) + (e.nz ? half : 0), z0: Math.min(e.mz, bz) - (e.nx ? half : 0), z1: Math.max(e.mz, bz) + (e.nx ? half : 0), y };
  };
  const hits = (b: Box, list: readonly Box[]): boolean => list.some((o) => Math.abs(o.y - b.y) < 4 && o.x0 < b.x1 && o.x1 > b.x0 && o.z0 < b.z1 && o.z1 > b.z0);
  const potential = new Set(stairable.filter((e) => !padPairs.has(pairKey(e.a, e.b))).map((e) => pairKey(e.a, e.b)));
  const reach = closure(start, roofMoves(roofs, links, potential, pads, ROOFS.survivableDrop));
  const stairs: Stair[] = [];
  const stairPairs = new Set<string>();
  const stairBoxes: Box[] = [];
  for (const e of stairable) {
    if (!reach.has(e.a) && !reach.has(e.b)) continue;
    const key = pairKey(e.a, e.b);
    if (stairPairs.has(key) || padPairs.has(key)) continue;
    const lo = roofs[e.a];
    const hi = roofs[e.b];
    const steps = Math.ceil((hi.top - lo.top) / ROOFS.stairRise);
    const box = stairBox(e, steps, lo.top);
    if (hits(box, blockers) || hits(box, stairBoxes)) continue;
    stairBoxes.push(box);
    stairPairs.add(key);
    stairs.push({ id: `stair-${key}`, lowRoof: lo.id, highRoof: hi.id, x: e.mx, z: e.mz, dirX: e.nx, dirZ: e.nz, bottom: lo.top, top: hi.top, steps, tread: ROOFS.stairTread, width: ROOFS.stairWidth });
  }
  // Every roof you can land on (even with a painful drop) needs a way back to the street without one.
  let n = 0;
  for (let round = 0; round < 400; round++) {
    const landable = closure(start, roofMoves(roofs, links, stairPairs, pads, ROOFS.survivableDrop));
    const safe = canReach(exitRoofs(layout, roofs, access, occupied), roofMoves(roofs, links, stairPairs, pads, ROOFS.freeDrop));
    const stuck = [...landable].filter((id) => !safe.has(id)).sort((a, b) => roofs[a].top - roofs[b].top || a - b);
    if (!stuck.length) return { stairs, walkable: landable };
    const r = roofs[stuck[0]];
    // A pad back up onto a safe neighbour, if there's room for one.
    const clear = (e: Edge): boolean => {
      const p = padBetween(e, false);
      const pb = [disc(p.x, p.z, 1.6, p.y), disc(p.land.x, p.land.z, 1.6, p.land.y)];
      return !pb.some((b) => hits(b, blockers) || hits(b, stairBoxes));
    };
    const up = links
      .filter((e) => e.a === r.id && safe.has(e.b) && e.overlap >= 2.5)
      .filter((e) => {
        const dh = roofs[e.b].top - r.top;
        return dh > ROOFS.stepUp && dh <= ROOFS.padMax && Math.min(w(r.rect), d(r.rect)) >= ROOFS.padBack * 2 && Math.min(w(roofs[e.b].rect), d(roofs[e.b].rect)) >= ROOFS.landIn * 2 && roofs[e.b].kind !== 'podium';
      })
      .filter(clear)
      .sort((x, y) => roofs[x.b].top - roofs[y.b].top)[0];
    if (up) {
      const p = padBetween(up, false);
      pads.push({ ...p, id: `pad-${r.district}-back${n++}` });
      addFixed();
      continue;
    }
    // Otherwise a way down from this roof: a fire escape, or an elevator on a tall one.
    const a = makeAccess(r, r.top > ROOFS.maxHeight ? 'elevator' : 'fireEscape', n++);
    if (a) {
      access.push({ ...a, id: `${a.id}-x` });
      addFixed();
      continue;
    }
    throw new Error(`Rooftops: roof ${r.id} (${r.top.toFixed(1)} m) can be reached but has no way down`);
  }
  throw new Error('Rooftops: could not make every roof safe');
}

function shuffle<T>(a: readonly T[], rng: Rng): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Checks a finished plan (for tests): roofs you can land on, and any of them without a way back
 * to the street that doesn't cost more than a small drop.
 */
export function roofEscapeReport(layout: CityLayout, plan: RooftopPlan): { landable: Set<number>; stuck: number[]; stairPairs: Set<string> } {
  const links = neighbours(plan.roofs, 0.8);
  const stairPairs = new Set(plan.stairs.map((s) => pairKey(s.lowRoof, s.highRoof)));
  const occupied = (x: number, z: number): boolean => layout.buildings.some((o) => inRect(o.rect, x, z)) || plan.garages.some((g) => inRect(g.rect, x, z));
  const start = [...plan.access.map((a) => a.roofId), ...plan.roofs.filter((r) => r.kind === 'garage').map((r) => r.id)];
  const landable = closure(start, roofMoves(plan.roofs, links, stairPairs, plan.pads, ROOFS.survivableDrop));
  const safe = canReach(exitRoofs(layout, plan.roofs, plan.access, occupied), roofMoves(plan.roofs, links, stairPairs, plan.pads, ROOFS.freeDrop));
  return { landable, stuck: [...landable].filter((id) => !safe.has(id)), stairPairs };
}
