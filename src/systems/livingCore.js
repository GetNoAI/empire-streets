// @ts-check
/**
 * Living world: shared engine-free pieces (no three.js), unit-tested.
 *
 *   SpatialGrid    a uniform hash grid for "who's near whom" queries (the AI radius partition)
 *   ambientHit     one attack in an ambient fight (NPC hunts, territory fights): the battle
 *                  formula (level, power, attack / defense, type chart, same-type bonus, crits)
 *   isRival        are two creatures natural enemies (config rivalries by type)
 *   fillLine       chatter / bubble text with {placeholders}
 *   pickWeighted, range, rangeInt, clamp
 */

/**
 * @template T
 * Buckets items by position. Rebuilt every tick: clear(), then insert() everything active.
 */
export class SpatialGrid {
  /** @param {number} cell cell size in metres */
  constructor(cell = 16) {
    this.cell = cell;
    /** @type {Map<string, Array<{ x: number, z: number, item: T }>>} */
    this.cells = new Map();
    this.size = 0;
  }

  clear() {
    this.cells.clear();
    this.size = 0;
  }

  /** @param {number} x @param {number} z */
  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  /** @param {T} item @param {number} x @param {number} z */
  insert(item, x, z) {
    const k = this.key(x, z);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push({ x, z, item });
    this.size++;
  }

  /**
   * Items within `r` of (x, z), nearest first.
   * @param {number} x @param {number} z @param {number} r
   * @param {(item: T) => boolean} [filter]
   * @returns {Array<{ item: T, d: number }>}
   */
  near(x, z, r, filter) {
    /** @type {Array<{ item: T, d: number }>} */
    const out = [];
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const list = this.cells.get(`${i},${j}`);
        if (!list) continue;
        for (const e of list) {
          const d = Math.hypot(e.x - x, e.z - z);
          if (d <= r && (!filter || filter(e.item))) out.push({ item: e.item, d });
        }
      }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  /**
   * Every pair of items within `r` of each other (each pair once).
   * @param {number} r
   * @returns {Array<[T, T, number]>}
   */
  pairs(r) {
    /** @type {Array<[T, T, number]>} */
    const out = [];
    const c = this.cell;
    const span = Math.ceil(r / c);
    for (const [k, list] of this.cells) {
      const [ci, cj] = k.split(',').map(Number);
      for (let di = -span; di <= span; di++)
        for (let dj = -span; dj <= span; dj++) {
          const other = this.cells.get(`${ci + di},${cj + dj}`);
          if (!other) continue;
          for (let a = 0; a < list.length; a++)
            for (let b = 0; b < other.length; b++) {
              const A = list[a];
              const B = other[b];
              // Each unordered pair once: within a cell a < b; across cells only "forward" neighbours.
              if (other === list ? b <= a : di < 0 || (di === 0 && dj < 0)) continue;
              const d = Math.hypot(A.x - B.x, A.z - B.z);
              if (d <= r) out.push([A.item, B.item, d]);
            }
        }
    }
    return out;
  }
}

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** @param {[number, number]} r @param {() => number} rand */
export const range = (r, rand = Math.random) => r[0] + (r[1] - r[0]) * rand();

/** @param {[number, number]} r @param {() => number} rand */
export const rangeInt = (r, rand = Math.random) => Math.floor(r[0] + (r[1] - r[0] + 1) * rand());

/**
 * @template {{ weight: number }} T
 * @param {T[]} list @param {() => number} rand
 * @returns {T | null}
 */
export function pickWeighted(list, rand = Math.random) {
  const total = list.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const e of list) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

/**
 * @template T
 * @param {readonly T[]} list @param {() => number} rand
 * @returns {T}
 */
export const pick = (list, rand = Math.random) => list[Math.floor(rand() * list.length) % list.length];

/**
 * Damage multiplier of an attack type against a defender's types (dual types multiply).
 * @param {Record<string, Record<string, number>>} chart
 * @param {string} attack @param {readonly string[]} defender
 */
export function typeMult(chart, attack, defender) {
  let m = 1;
  for (const t of defender) m *= chart[attack]?.[t] ?? 1;
  return m;
}

/**
 * @typedef {{ level: number, attack: number, defense: number, types: readonly string[],
 *   moves: ReadonlyArray<{ name: string, type: string, power: number }> }} Fighter
 */

/**
 * One attack in an ambient fight. The attacker picks its best damaging move against this foe
 * (power x type), then the battle formula: ((2L/5 + 2) x P x A/D) / 50 + 2, x type, x 1.5 for
 * a same-type move, x 1.5 on a crit (1 in 16), x 0.85-1.0. `scale` slows fights down so they
 * last a few exchanges.
 * @param {Fighter} a @param {Fighter} b
 * @param {Record<string, Record<string, number>>} chart
 * @param {() => number} rand
 * @param {number} [scale]
 * @returns {{ damage: number, move: string, type: string, mult: number, crit: boolean }}
 */
export function ambientHit(a, b, chart, rand = Math.random, scale = 1) {
  const usable = a.moves.filter((m) => m.power > 0);
  const moves = usable.length ? usable : [{ name: 'Tackle', type: a.types[0] ?? 'grind', power: 40 }];
  let best = moves[0];
  let bestScore = -1;
  for (const m of moves) {
    const s = m.power * typeMult(chart, m.type, b.types) * (a.types.includes(m.type) ? 1.5 : 1);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  const mult = typeMult(chart, best.type, b.types);
  if (mult === 0) return { damage: 0, move: best.name, type: best.type, mult, crit: false };
  const crit = rand() < 1 / 16;
  const base = (((2 * a.level) / 5 + 2) * best.power * (a.attack / Math.max(1, b.defense))) / 50 + 2;
  const dmg = base * mult * (a.types.includes(best.type) ? 1.5 : 1) * (crit ? 1.5 : 1) * (0.85 + rand() * 0.15) * scale;
  return { damage: Math.max(1, Math.floor(dmg)), move: best.name, type: best.type, mult, crit };
}

/**
 * Natural enemies: any listed rivalry between one creature's types and the other's.
 * @param {readonly string[]} a @param {readonly string[]} b
 * @param {ReadonlyArray<readonly [string, string]>} rivalries
 */
export function isRival(a, b, rivalries) {
  for (const [x, y] of rivalries) if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) return true;
  return false;
}

/**
 * Fills {placeholders}; unknown ones are left as-is so a missing value is easy to spot.
 * @param {string} line @param {Record<string, string | number | undefined>} vars
 */
export function fillLine(line, vars) {
  return line.replace(/\{([a-zA-Z]+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === '' ? m : String(vars[k])));
}

/** True if a filled line still has a {placeholder} in it. @param {string} line */
export const hasHoles = (line) => /\{[a-zA-Z]+\}/.test(line);

