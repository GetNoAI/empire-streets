// The campaign: a runnable integration example (no renderer).
//   npm run campaign:example        (tsx scripts/campaign-example.ts)
//
// In the game: src/core/Game.ts (setupCampaign, updateCampaign, campaignTalk, startBossBattle) and
// src/systems/CampaignWorld.ts (givers, bosses, the objective beacon). This script plays Act I
// against a fake game and prints what the quest manager does.
//
// Hooking the campaign into a game loop:
//
//   import { QuestManager } from './systems/questManager.js';
//   import campaign from './config/campaign_quests.json';
//   import league from './config/racing_league.json';
//
//   const quests = new QuestManager({ campaign, league, adapter: {
//     earn, money, spend,                 // cash rewards and buy-ins
//     addStreetCred, addItem,             // Street Cred, capture pods...
//     unlockBlueprint,                    // tuning blueprints -> stat multipliers on your cars
//     giveStreetmon,                      // legendary Streetmon -> your party
//     setWanted,                          // ESCAPE_WANTED objectives raise the stars
//     notify,                             // HUD toasts
//   } });
//
//   // Objective triggers, from the systems that already exist:
//   races.on('resolved', (r) => quests.notify({ type: 'race', track: r.track.id, place: r.place, night }));
//   heists.on('resolved', (r) => quests.notify({ type: 'heist', target: r.target.id, ok: r.ok }));
//   function onCaught(c, district) { quests.notify({ type: 'catch', species: c.speciesId, types, level: c.level, district }); }
//   function onBattleEnd(r) { if (bossFight) quests.notify({ type: 'boss', boss: bossFight, won: r.outcome === 'win' }); }
//   function onBusted() { quests.notify({ type: 'busted' }); }   // fails an active crackdown
//
//   // The league on races: entry fee, open tracks, police for story races, prize multiplier.
//   races.on('accepted', (e) => { const rules = quests.raceRules(e.track.id); if (!rules.open) races.decline(); else pay(rules.fee); });
//   races.on('go', () => { const rules = quests.raceRules(trackId); if (rules.police) raiseWanted(rules.police); });
//
//   // Every frame:
//   quests.update(dt, { x, z, layer, inVehicle, streetCred, stars, night, tunedSlots });
//   const markers = quests.markers(where);        // M givers, objective pins, boss skulls, boundaries
//   minimap.add(markers); cityMap.add(markers); campaignWorld.update(dt, markers);
//   hud.tracker(quests.hud());                     // Act, job, objective, timer
//
//   // E next to someone:
//   let d = quests.talk(npcId);                    // the dialogue tree (offer / reminder / turn-in)
//   d = quests.choose(d, choiceIndex).next;        // 'accept' / 'complete' choices act on the quest

import campaignJson from '../src/config/campaign_quests.json';
import leagueJson from '../src/config/racing_league.json';
import { QuestManager, type CampaignConfig, type Dialogue, type LeagueConfig, type QuestContext } from '../src/systems/questManager.js';

const game = { money: 400, cred: 0, stars: 0, items: [] as string[] };
const ctx: QuestContext = { x: 0, z: 0, layer: 'street', inVehicle: false, streetCred: 0, stars: 0, night: false, tunedSlots: 0 };
const say = (s: string): void => console.log(s);

const quests = new QuestManager({
  campaign: campaignJson as unknown as CampaignConfig,
  league: leagueJson as unknown as LeagueConfig,
  adapter: {
    earn: (n) => (game.money += n),
    money: () => game.money,
    spend: (n) => (game.money >= n ? ((game.money -= n), true) : false),
    addStreetCred: (n) => (ctx.streetCred += n),
    addItem: (id, n) => game.items.push(`${n}x ${id}`),
    unlockBlueprint: (b) => say(`   🔧 blueprint: ${b.name} (${b.description})`),
    giveStreetmon: (l) => say(`   ⭐ legendary: ${l.nickname}`),
    setWanted: (s) => (ctx.stars = s),
    notify: (t) => say(`   [toast] ${t}`),
  },
});
quests.on('actStarted', (e) => say(`\n=== ACT ${e.act.number}: ${e.act.title.toUpperCase()} ===`));
quests.on('objective', (e) => say(` > ${e.objective.text}`));
quests.on('completed', (e) => say(` ✓ ${e.quest.title}: ${e.rewards.join(', ')}`));
quests.on('failed', (e) => say(` ✗ ${e.quest.title} failed`));
quests.on('actCompleted', (e) => say(`=== ACT ${e.act.number} COMPLETE ===`));
quests.on('rank', (e) => say(`   USRL: promoted to the ${e.division.name}`));

/** Talks to someone and picks the first choice that moves things on. */
function talkTo(npc: string): void {
  let d: Dialogue | null = quests.talk(npc, ctx);
  while (d) {
    say(`   ${d.speaker}: "${d.text}"`);
    const i = Math.max(0, d.choices.findIndex(([, to]) => to === 'accept' || to === 'complete' || (to !== 'end' && to !== '')));
    say(`   You: "${d.choices[i][0]}"`);
    d = quests.choose(d, i, ctx).next;
  }
}

quests.update(0.1, ctx);
say(`Jobs on offer: ${quests.givers(ctx).map((g) => `${quests.npc(g.npc)?.name} (${quests.quest(g.quest)?.title})`).join(', ')}`);
talkTo('rust');
ctx.tunedSlots = 1; // slotted a Streetmon at the Chop Shop
quests.update(0.1, ctx);
talkTo('rust');
talkTo('rust'); // the courier run
talkTo('pike');
Object.assign(ctx, { x: -452, z: -240, inVehicle: true });
quests.update(0.1, ctx);
say(`   (clock: ${quests.hud()?.timeLeft}s)`);
Object.assign(ctx, { x: 452, z: 80 });
quests.update(95, ctx);
talkTo('rust'); // small time
quests.notify({ type: 'heist', target: 'quik-cash', ok: true }, ctx);
talkTo('rust'); // the docks boss
say(`   markers: ${quests.markers((ref) => (ref.startsWith('boss:') ? { x: -468, z: 200 } : null), ctx).map((m) => `${m.kind} @ ${m.x},${m.z}`).join('; ')}`);
quests.notify({ type: 'boss', boss: 'dockside-dutch', won: true }, ctx);
quests.update(0.1, ctx);
say(`\nNext up: ${quests.givers(ctx).map((g) => `${quests.npc(g.npc)?.name}: ${quests.quest(g.quest)?.title}`).join(', ')}`);
say(`League: ${quests.divisionFor(ctx).name}; Harbor Run entry fee $${quests.raceRules('harbor-run', ctx).fee}`);
say(`Money $${game.money}, Street Cred ${ctx.streetCred}, items ${game.items.join(', ')}`);
