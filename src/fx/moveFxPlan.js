// @ts-check
/**
 * Plans how a Streetmon move looks and sounds (engine-free, unit-tested). MoveFx.ts draws the plan;
 * Audio.moveSfx plays its sounds.
 *
 * A move starts from its type's look (move_fx.json `types`), then, for a move that does no damage,
 * the look of what it does (buff, debuff, heal, veil, glass, reload, choke), then its own entry
 * (`moves`). On top of that the plan follows the move's data: a spread move hits every foe, a
 * multi-hit move fires once per hit, power sets the size, melee styles lunge.
 */

/** @typedef {import('./moveFxPlan').MoveFxConfig} MoveFxConfig */
/** @typedef {import('./moveFxPlan').MoveFxPlan} MoveFxPlan */
/** @typedef {import('./moveFxPlan').FxMove} FxMove */

export const FX_STYLES = /** @type {const} */ ([
  'shot', 'spray', 'ricochet', 'beam', 'bolt', 'orb', 'lob', 'drop', 'slam', 'dash', 'wave', 'cloud', 'splash', 'blast', 'buff', 'debuff', 'heal', 'veil', 'glass', 'reload',
]);
export const FX_IMPACTS = /** @type {const} */ (['sparks', 'dust', 'shards', 'zap', 'puff', 'splash', 'wave', 'flash']);
export const FX_SOUNDS = /** @type {const} */ ([
  'gun_pistol', 'gun_shotgun', 'gun_sniper', 'gun_burst', 'dart', 'thump_shot', 'whoosh', 'slam', 'slam_heavy', 'crunch', 'rubble', 'coin',
  'zap', 'zap_big', 'beam', 'bass', 'bass_big', 'bass_drop', 'screech', 'hiss', 'puff', 'boom', 'splash', 'squelch', 'gurgle',
  'chime_up', 'chime_down', 'heal', 'glass', 'reload', 'impact', 'impact_heavy', 'crit', 'super', 'resist', 'faint', 'flash',
  'roar', 'stomp', 'quake',
]);
/** Styles where the user runs at the target. */
export const MELEE = /** @type {const} */ (['slam', 'dash']);
/** Styles that stay on the user (no travel to the target). */
export const SELF = /** @type {const} */ (['buff', 'heal', 'reload']);

/** How long the move takes to reach its target (s), by style. */
const TRAVEL = { shot: 0.06, spray: 0.07, ricochet: 0.14, beam: 0.18, bolt: 0.05, orb: 0.3, lob: 0.45, drop: 0.42, slam: 0.2, dash: 0.28, wave: 0.32, cloud: 0.4, splash: 0.34, blast: 0.12, buff: 0.25, debuff: 0.2, heal: 0.25, veil: 0.35, glass: 0.3, reload: 0.3 };
/** Default impact per style (when neither type nor move sets one). */
const IMPACT = { shot: 'sparks', spray: 'sparks', ricochet: 'sparks', beam: 'zap', bolt: 'zap', orb: 'flash', lob: 'dust', drop: 'dust', slam: 'dust', dash: 'dust', wave: 'wave', cloud: 'puff', splash: 'splash', blast: 'flash', buff: 'flash', debuff: 'puff', heal: 'flash', veil: 'puff', glass: 'shards', reload: 'sparks' };

/**
 * Checks the config: styles, impacts and sounds are known; override ids exist (when `moveIds` is
 * given); colours are hex.
 * @param {MoveFxConfig} c @param {{ moveIds?: readonly string[]; types?: readonly string[] }} [known]
 * @returns {true}
 */
export function validateMoveFx(c, known = {}) {
  const err = (/** @type {string} */ m) => {
    throw new Error(`move_fx: ${m}`);
  };
  const check = (/** @type {string} */ where, /** @type {Record<string, unknown>} */ e) => {
    if (e.style !== undefined && !FX_STYLES.includes(/** @type {never} */ (e.style))) err(`${where}: unknown style ${e.style}`);
    if (e.impact !== undefined && !FX_IMPACTS.includes(/** @type {never} */ (e.impact))) err(`${where}: unknown impact ${e.impact}`);
    for (const k of ['sound', 'hitSound']) if (e[k] !== undefined && !FX_SOUNDS.includes(/** @type {never} */ (e[k]))) err(`${where}: unknown ${k} ${e[k]}`);
    if (e.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(e.color))) err(`${where}: colour ${e.color} is not #rrggbb`);
    for (const k of ['count', 'scale', 'shake', 'lunge']) if (e[k] !== undefined && !(typeof e[k] === 'number' && e[k] >= 0)) err(`${where}: ${k} must be a number >= 0`);
  };
  for (const [t, e] of Object.entries(c.types)) {
    if (known.types && !known.types.includes(t)) err(`unknown type ${t}`);
    if (!e.style || !e.color) err(`type ${t} needs a style and a colour`);
    check(`type ${t}`, e);
  }
  if (known.types) for (const t of known.types) if (!c.types[t]) err(`type ${t} has no look`);
  for (const [k, e] of Object.entries(c.status)) check(`status ${k}`, e);
  for (const [id, e] of Object.entries(c.moves)) {
    if (known.moveIds && !known.moveIds.includes(id)) err(`unknown move ${id}`);
    check(`move ${id}`, e);
  }
  return true;
}

/**
 * What a move that does no damage looks like, from what it does.
 * @param {FxMove} m @returns {'buff' | 'debuff' | 'heal' | 'veil' | 'glass' | 'reload' | 'choke' | null}
 */
export function statusKind(m) {
  if (m.power > 0) return null;
  const eff = m.effects ?? [];
  if (eff.some((e) => e.type === 'reload')) return 'reload';
  if (eff.some((e) => e.type === 'glass')) return 'glass';
  if (eff.some((e) => e.type === 'cloud')) return 'veil';
  if (eff.some((e) => e.type === 'heal')) return 'heal';
  if (eff.some((e) => e.type === 'choke')) return 'choke';
  if (eff.some((e) => e.type === 'stat' && e.who === 'self') || eff.some((e) => e.type === 'critUp')) return 'buff';
  if (eff.some((e) => e.type === 'stat')) return 'debuff';
  return 'buff';
}

/**
 * The plan for one move.
 * @param {FxMove} m @param {MoveFxConfig} c
 * @returns {MoveFxPlan}
 */
export function planMoveFx(m, c) {
  const base = c.types[m.type] ?? c.types.grind ?? Object.values(c.types)[0];
  const sk = statusKind(m);
  const st = sk ? c.status[sk] ?? {} : {};
  const own = c.moves[m.id] ?? {};
  /** @type {Record<string, any>} */
  const e = { ...base, ...st, ...own };
  const style = /** @type {MoveFxPlan['style']} */ (e.style);
  // Hits: multi-hit moves fire once per hit (their entry can say how many to draw).
  const multi = m.effects?.find((x) => x.type === 'multiHit');
  const count = Math.max(1, Math.round(e.count ?? (multi && multi.type === 'multiHit' ? Math.ceil((multi.min + multi.max) / 2) : 1)));
  // Size: from power (40 -> 0.85, 120 -> 1.45), unless the move fixes it.
  const scale = e.scale ?? (m.power > 0 ? Math.max(0.7, Math.min(1.6, 0.55 + m.power / 133)) : 1);
  const melee = /** @type {readonly string[]} */ (MELEE).includes(style);
  const self = /** @type {readonly string[]} */ (SELF).includes(style) || m.target === 'self';
  const lunge = melee ? e.lunge ?? (style === 'dash' ? 2.6 : 1.6) : 0;
  // Shake: big hits shake the camera (signature and high-power moves a little even without a setting).
  const shake = Math.min(1, e.shake ?? (m.power >= 100 ? 0.4 : m.power >= 80 ? 0.2 : 0));
  return {
    id: m.id,
    type: m.type,
    style,
    color: e.color ?? base.color,
    count,
    scale,
    travel: /** @type {Record<string, number>} */ (TRAVEL)[style] ?? 0.2,
    // The move's own impact, else its status look's, else (for damaging moves) its type's, else the style's.
    impact: own.impact ?? st.impact ?? (sk ? undefined : base.impact) ?? /** @type {Record<string, string>} */ (IMPACT)[style] ?? 'flash',
    melee,
    self,
    aoe: m.target === 'allFoes',
    lunge,
    trail: !!e.trail,
    fire: !!e.fire,
    spin: !!e.spin,
    flash: !!e.flash,
    wreck: !!e.wreck,
    shake,
    sound: e.sound ?? 'whoosh',
    hitSound: e.hitSound ?? 'impact',
    signature: !!m.signature,
    power: m.power,
  };
}

/**
 * The impact's look and sound for one hit: heavier for critical and super-effective hits, softer
 * for resisted ones.
 * @param {MoveFxPlan} p @param {{ crit: boolean; mult: number }} hit
 */
export function impactFor(p, hit) {
  const strong = hit.crit || hit.mult >= 2;
  const weak = hit.mult > 0 && hit.mult < 1;
  return {
    impact: p.impact,
    sound: strong ? (hit.crit ? 'crit' : 'super') : weak ? 'resist' : p.hitSound,
    size: p.scale * (strong ? 1.35 : weak ? 0.75 : 1),
    shake: Math.min(1, p.shake + (strong ? 0.2 : 0)),
    flash: p.flash || strong,
  };
}
