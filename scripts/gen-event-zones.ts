/**
 * Writes the street-event spawn zones into src/config/street_events.json from the actual city:
 *   street  mid-block sidewalk points (ground level)
 *   roof    middles of rooftops you can reach on foot (with the roof height y)
 *   alley   the back alleys cut by planAlleys
 *   depots  avenue/street intersections the armored trucks start from and drive to
 * It runs the same planning steps as the game, in the same order, so the points match.
 *
 *   npx tsx scripts/gen-event-zones.ts
 */
import * as fs from 'node:fs';
import heists from '../src/config/heists.json';
import races from '../src/config/races.json';
import { districtAt } from '../src/creatures/SpawnRules';
import { alleyAvoidPoints, planAlleys } from '../src/world/Alleys';
import { CITY, generateLayout } from '../src/world/CityLayout';
import { planGarages, planRooftops } from '../src/world/Rooftops';

const FILE = 'src/config/street_events.json';
const r1 = (v: number): number => Math.round(v * 10) / 10;

const layout = generateLayout();
const avoid = alleyAvoidPoints(heists, races);
const alleys = planAlleys(layout, avoid);
const garages = planGarages(layout);
layout.garages = garages;
const roofs = planRooftops(layout, garages);

/** Greedy spread: keep points at least `gap` apart, up to `per` per district. */
function spread<T extends { x: number; z: number; district: string }>(list: T[], gap: number, per: number): T[] {
  const out: T[] = [];
  const count: Record<string, number> = {};
  for (const p of list) {
    if ((count[p.district] ?? 0) >= per) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < gap)) continue;
    if (avoid.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 35)) continue;
    out.push(p);
    count[p.district] = (count[p.district] ?? 0) + 1;
  }
  return out;
}
/** A fixed shuffle so the picks spread over the whole map rather than following block order. */
const shuffle = <T>(a: T[]): T[] => a.map((v, i) => ({ v, k: Math.sin(i * 12.9898) * 43758.5453 % 1 })).sort((x, y) => x.k - y.k).map((o) => o.v);

const sw = CITY.sidewalk;
const street = spread(
  shuffle(
    layout.blocks.flatMap((b, i) => {
      const cx = (b.x0 + b.x1) / 2;
      return [
        { x: cx, z: b.z0 + sw * 0.5, side: 'n', i },
        { x: cx, z: b.z1 - sw * 0.5, side: 's', i },
      ].map((p) => ({ ...p, district: districtAt(layout, p.x, p.z) as string }));
    }),
  ).filter((p) => p.district !== 'park'),
  130,
  5,
).map((p, k) => ({ id: `street-${p.district}-${k + 1}`, x: r1(p.x), z: r1(p.z), district: p.district, label: 'sidewalk' }));

const roof = spread(
  shuffle(
    roofs.roofs
      .filter((r) => roofs.reachable.has(r.id) && r.kind === 'roof' && r.rect.x1 - r.rect.x0 >= 10 && r.rect.z1 - r.rect.z0 >= 10)
      .map((r) => ({ x: (r.rect.x0 + r.rect.x1) / 2, z: (r.rect.z0 + r.rect.z1) / 2, y: r.top, district: r.district as string })),
  ),
  140,
  4,
).map((p, k) => ({ id: `roof-${p.district}-${k + 1}`, x: r1(p.x), y: r1(p.y), z: r1(p.z), district: p.district, label: 'rooftop' }));

const alley = alleys.map((a) => ({ id: a.id, x: r1(a.x), z: r1(a.z), district: a.district as string, label: 'alley', halfLength: r1((a.rect.z1 - a.rect.z0) / 2) }));

const depots: Array<{ id: string; x: number; z: number; district: string; label: string }> = [];
for (const ai of [1, 5])
  for (const si of [1, 5, 9, 13, 17]) {
    const x = layout.aveX[ai];
    const z = layout.streetZ[si];
    depots.push({ id: `depot-${ai}-${si}`, x: r1(x), z: r1(z), district: districtAt(layout, x, z), label: 'bank depot' });
  }

const cfg = JSON.parse(fs.readFileSync(FILE, 'utf8'));
cfg.zones = { street, roof, alley, depots };
fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n');
console.log(`zones: ${street.length} street, ${roof.length} roof, ${alley.length} alley, ${depots.length} depots -> ${FILE}`);
