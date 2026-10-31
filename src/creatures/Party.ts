import { maxHp, type Creature } from './Creature';

/**
 * The player's creatures: a party of up to 6 that fight, plus a stash for the rest.
 * (The stash and party screens arrive with catching.)
 */
export const PARTY_SIZE = 6;

export class Party {
  readonly members: Creature[] = [];
  readonly stash: Creature[] = [];

  /** Adds a creature to the party, or the stash if the party is full. Returns where it went. */
  add(c: Creature): 'party' | 'stash' {
    if (this.members.length < PARTY_SIZE) {
      this.members.push(c);
      return 'party';
    }
    this.stash.push(c);
    return 'stash';
  }

  get lead(): Creature | null {
    return this.members.find((m) => m.hp > 0) ?? null;
  }

  get canFight(): boolean {
    return this.members.some((m) => m.hp > 0);
  }

  get fainted(): number {
    return this.members.filter((m) => m.hp <= 0).length;
  }

  get hurt(): boolean {
    return this.members.some((m) => m.hp < maxHp(m) || m.status !== 'none');
  }

  /** Full heal (clinic): HP, status and ammo. */
  healAll(magazine: (c: Creature) => number): void {
    for (const m of [...this.members, ...this.stash]) {
      m.hp = maxHp(m);
      m.status = 'none';
      m.ammo = magazine(m);
    }
  }

  /** Moves a member to the front (it leads into battle). */
  makeLead(i: number): void {
    if (i <= 0 || i >= this.members.length) return;
    const [c] = this.members.splice(i, 1);
    this.members.unshift(c);
  }

  /** Party member -> stash (the party always keeps at least one). */
  toStash(i: number): boolean {
    if (this.members.length <= 1 || !this.members[i]) return false;
    this.stash.push(...this.members.splice(i, 1));
    return true;
  }

  /** Stash -> party (if there's room). */
  fromStash(i: number): boolean {
    if (this.members.length >= PARTY_SIZE || !this.stash[i]) return false;
    this.members.push(...this.stash.splice(i, 1));
    return true;
  }

  /** Exchanges a party member with a stashed creature. */
  swapWithStash(partyIndex: number, stashIndex: number): boolean {
    const a = this.members[partyIndex];
    const b = this.stash[stashIndex];
    if (!a || !b) return false;
    this.members[partyIndex] = b;
    this.stash[stashIndex] = a;
    return true;
  }

  serialize(): { members: Creature[]; stash: Creature[] } {
    return { members: this.members.map((c) => ({ ...c, ivs: { ...c.ivs }, moves: [...c.moves] })), stash: this.stash.map((c) => ({ ...c, ivs: { ...c.ivs }, moves: [...c.moves] })) };
  }

  swap(i: number, j: number): void {
    const m = this.members;
    if (!m[i] || !m[j]) return;
    [m[i], m[j]] = [m[j], m[i]];
  }
}
