import { audio, type Where } from '../audio/Audio';
import { cryParams, type CryParams } from '../audio/Cries';
import { species } from './Data';

/** A species' cry (made once, then cached), played through the audio engine. */
const cache = new Map<string, CryParams>();

export function cryOf(id: string): CryParams {
  let p = cache.get(id);
  if (!p) {
    const sp = species(id);
    p = cryParams({ id: sp.id, types: sp.types, stage: sp.stage, line: sp.line, legendary: !!sp.legendary, model: sp.model });
    cache.set(id, p);
  }
  return p;
}

/** Plays a Streetmon's cry. `faint`: lower and slower, a little quieter. */
export function playCry(id: string, distance: Where = 0, o: { faint?: boolean; gain?: number } = {}): void {
  audio.cry(cryOf(id), distance, o.faint ? { pitch: 0.72, speed: 0.65, gain: 0.8 * (o.gain ?? 1) } : { gain: o.gain });
}
