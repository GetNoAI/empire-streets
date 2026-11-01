import { SAVE_KEY, type SaveStore } from './SaveSystem';

/**
 * SaveManager: where the save lives and how it's packed (engine-free, unit-tested).
 *
 * The save itself is the JSON SaveSystem.ts builds and checks (inventory, every Streetmon with its
 * stats and moves, the garage with each car's parts, active quests, safehouses and the rest).
 * This module stores it:
 *
 *  - Compressed: LZ-based (the LZ-String scheme) into UTF-16 for browser storage, about a fifth of
 *    the JSON's size, or into base64 for an exported `.esave` file. A header carries a format tag,
 *    an FNV-1a checksum of the JSON and when it was saved, so a damaged save is caught rather
 *    than loaded half-read.
 *  - Twice over: localStorage (written synchronously, so a save when the tab closes still lands)
 *    and IndexedDB (bigger quota; written in the background). Each keeps the previous save as a
 *    backup. On boot the newest good copy wins, so a cleared or full localStorage still loads.
 *  - Backwards compatible: plain JSON saves from before compression load as they are.
 *
 * It's a drop-in `SaveStore` (read/write/clear JSON text), like `browserStore` was.
 */

const TAG = 'ESZ1';
const FILE_TAG = 'ESZ1B';
const BACKUP = '.bak';
const DB_NAME = 'empire-streets';
const DB_STORE = 'saves';

// ------------------------------------------------------------------ compression

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const B64_INDEX: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));

function lzCompress(input: string, bits: number, charOf: (n: number) => string): string {
  if (!input) return '';
  const dict = new Map<string, number>();
  const pending = new Set<string>();
  let w = '';
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const out: string[] = [];
  let val = 0;
  let pos = 0;
  const pushBit = (b: number): void => {
    val = (val << 1) | b;
    if (pos === bits - 1) {
      pos = 0;
      out.push(charOf(val));
      val = 0;
    } else pos++;
  };
  const pushValue = (v: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      pushBit(v & 1);
      v >>= 1;
    }
  };
  const emit = (word: string): void => {
    if (pending.has(word)) {
      const code = word.charCodeAt(0);
      if (code < 256) {
        pushValue(0, numBits);
        pushValue(code, 8);
      } else {
        pushValue(1, numBits);
        pushValue(code, 16);
      }
      enlargeIn--;
      if (enlargeIn === 0) {
        enlargeIn = 2 ** numBits;
        numBits++;
      }
      pending.delete(word);
    } else pushValue(dict.get(word)!, numBits);
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  };
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (!dict.has(c)) {
      dict.set(c, dictSize++);
      pending.add(c);
    }
    const wc = w + c;
    if (dict.has(wc)) w = wc;
    else {
      emit(w);
      dict.set(wc, dictSize++);
      w = c;
    }
  }
  if (w !== '') emit(w);
  pushValue(2, numBits);
  // Flush the last partial character.
  for (;;) {
    val <<= 1;
    if (pos === bits - 1) {
      out.push(charOf(val));
      break;
    }
    pos++;
  }
  return out.join('');
}

function lzDecompress(length: number, reset: number, next: (i: number) => number): string | null {
  const dict: string[] = ['', '', ''];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  const result: string[] = [];
  let val = next(0);
  let position = reset;
  let index = 1;
  const read = (n: number): number => {
    let bits = 0;
    let power = 1;
    const max = 2 ** n;
    while (power !== max) {
      const b = val & position;
      position >>= 1;
      if (position === 0) {
        position = reset;
        val = next(index++);
      }
      bits |= (b > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    return bits;
  };
  let c: string;
  switch (read(2)) {
    case 0:
      c = String.fromCharCode(read(8));
      break;
    case 1:
      c = String.fromCharCode(read(16));
      break;
    case 2:
      return '';
    default:
      return null;
  }
  dict[3] = c;
  let w = c;
  result.push(c);
  for (;;) {
    if (index > length) return null;
    let code = read(numBits);
    switch (code) {
      case 0:
        dict[dictSize++] = String.fromCharCode(read(8));
        code = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        dict[dictSize++] = String.fromCharCode(read(16));
        code = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join('');
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
    let entry: string;
    if (code < dictSize && dict[code] !== undefined && code >= 3) entry = dict[code];
    else if (code === dictSize) entry = w + w.charAt(0);
    else return null;
    result.push(entry);
    dict[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}

/** Packs text into UTF-16 characters (15 bits each), safe for localStorage and IndexedDB. */
export function compressUTF16(s: string): string {
  if (!s) return '';
  return lzCompress(s, 15, (n) => String.fromCharCode(n + 32)) + ' ';
}

export function decompressUTF16(s: string): string | null {
  if (!s) return '';
  return lzDecompress(s.length, 16384, (i) => s.charCodeAt(i) - 32);
}

/** Packs text into base64 (for a file you can email or paste). */
export function compressBase64(s: string): string {
  const r = lzCompress(s, 6, (n) => B64.charAt(n));
  return r + '='.repeat((4 - (r.length % 4)) % 4);
}

export function decompressBase64(s: string): string | null {
  if (!s) return '';
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
  return lzDecompress(clean.length, 32, (i) => B64_INDEX[clean.charAt(i)] ?? 0);
}

/** FNV-1a, 32-bit, as 8 hex digits. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ the envelope

export interface Packed {
  text: string;
  savedAt: number;
}

/** `ESZ1:<checksum>:<savedAt ms>:<UTF-16 payload>`. */
export function packSave(json: string, savedAt = Date.now()): string {
  return `${TAG}:${checksum(json)}:${Math.round(savedAt)}:${compressUTF16(json)}`;
}

/** The same with a base64 payload, for an exported file. */
export function packForFile(json: string, savedAt = Date.now()): string {
  return `${FILE_TAG}:${checksum(json)}:${Math.round(savedAt)}:${compressBase64(json)}`;
}

/**
 * Unpacks any save text: packed (either kind) or plain JSON. Throws on a damaged one (bad
 * checksum, truncated payload).
 */
export function unpackSave(text: string): Packed {
  const t = text.trimStart();
  if (t.startsWith('{')) {
    let at = 0;
    try {
      const v = (JSON.parse(t) as { savedAt?: string }).savedAt;
      at = v ? Date.parse(v) || 0 : 0;
    } catch {
      throw new Error('That save is not valid JSON');
    }
    return { text: t, savedAt: at };
  }
  const m = /^(ESZ1B?):([0-9a-f]{8}):(\d+):/.exec(t);
  if (!m) throw new Error('Not an Empire Streets save');
  const body = t.slice(m[0].length);
  const json = m[1] === FILE_TAG ? decompressBase64(body) : decompressUTF16(body);
  if (json === null || json === '') throw new Error('The save is damaged (it did not unpack)');
  if (checksum(json) !== m[2]) throw new Error('The save is damaged (checksum mismatch)');
  return { text: json, savedAt: Number(m[3]) };
}

// ------------------------------------------------------------------ storage

/** The bits of the Web Storage API this uses (so tests can hand in a fake). */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface SaveInfo {
  /** Where the last read came from. */
  source: 'local' | 'local-backup' | 'idb' | 'idb-backup' | 'none';
  /** JSON size and packed size (characters) of the last write. */
  json: number;
  packed: number;
  /** A copy was damaged and a backup used instead. */
  recovered: boolean;
  idb: boolean;
}

export class SaveManager implements SaveStore {
  private db: IDBDatabase | null = null;
  /** The newest good copy IndexedDB had at boot (and since: what we last wrote there). */
  private idbMain: Packed | null = null;
  private idbBackup: Packed | null = null;
  readonly info: SaveInfo = { source: 'none', json: 0, packed: 0, recovered: false, idb: false };
  private pendingIdb: { main: string; backup: string | null } | null = null;
  private idbBusy = false;

  constructor(
    private readonly local: KV | null = safeLocalStorage(),
    private readonly idbFactory: IDBFactory | null = typeof indexedDB === 'undefined' ? null : indexedDB,
    private readonly key = SAVE_KEY,
  ) {}

  /** Opens IndexedDB and reads its copies. Safe to skip (then it's localStorage only). */
  async init(): Promise<void> {
    if (!this.idbFactory) return;
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = this.idbFactory!.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('blocked'));
      });
      this.info.idb = true;
      const get = (k: string): Promise<string | null> =>
        new Promise((resolve) => {
          try {
            const r = this.db!.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(k);
            r.onsuccess = () => resolve(typeof r.result === 'string' ? r.result : null);
            r.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      this.idbMain = tryUnpack(await get(this.key));
      this.idbBackup = tryUnpack(await get(this.key + BACKUP));
    } catch {
      this.db = null;
      this.info.idb = false;
    }
  }

  /** The newest good save as JSON text (null: none). */
  read(): string | null {
    const cands: Array<{ p: Packed | null; source: SaveInfo['source'] }> = [
      { p: tryUnpack(this.localGet(this.key)), source: 'local' },
      { p: this.idbMain, source: 'idb' },
      { p: tryUnpack(this.localGet(this.key + BACKUP)), source: 'local-backup' },
      { p: this.idbBackup, source: 'idb-backup' },
    ];
    const rawMain = this.localGet(this.key);
    // The main copies first (newest of the two), the backups only if neither main copy is good.
    const mains = cands.slice(0, 2).filter((c) => c.p);
    const pick = mains.length ? mains.sort((a, b) => b.p!.savedAt - a.p!.savedAt)[0] : cands.slice(2).filter((c) => c.p).sort((a, b) => b.p!.savedAt - a.p!.savedAt)[0];
    this.info.recovered = !!rawMain && !cands[0].p;
    if (!pick) {
      this.info.source = 'none';
      return null;
    }
    this.info.source = pick.source;
    if (pick.source !== 'local') this.info.recovered = this.info.recovered || pick.source.endsWith('backup');
    return pick.p!.text;
  }

  /** Saves JSON text. True if at least one store took it. */
  write(json: string): boolean {
    const at = Date.now();
    const packed = packSave(json, at);
    this.info.json = json.length;
    this.info.packed = packed.length;
    const prev = this.localGet(this.key);
    let ok = false;
    if (this.local) {
      try {
        // The old save becomes the backup only if it's a good one.
        if (prev && tryUnpack(prev)) this.local.setItem(this.key + BACKUP, prev);
        this.local.setItem(this.key, packed);
        ok = true;
      } catch {
        // Full or blocked: drop the backup and try once more.
        try {
          this.local.removeItem(this.key + BACKUP);
          this.local.setItem(this.key, packed);
          ok = true;
        } catch {
          /* IndexedDB may still take it */
        }
      }
    }
    if (this.db) {
      const backup = this.idbMain ? packSave(this.idbMain.text, this.idbMain.savedAt) : null;
      this.idbBackup = this.idbMain;
      this.idbMain = { text: json, savedAt: at };
      this.queueIdb(packed, backup);
      ok = true;
    }
    return ok;
  }

  clear(): void {
    for (const k of [this.key, this.key + BACKUP]) {
      try {
        this.local?.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    this.idbMain = this.idbBackup = null;
    if (this.db) {
      try {
        const st = this.db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE);
        st.delete(this.key);
        st.delete(this.key + BACKUP);
      } catch {
        /* ignore */
      }
    }
  }

  /** A save as text for a file (compressed, base64). */
  exportText(json: string): string {
    return packForFile(json);
  }

  /** Writes to IndexedDB in the background; a write made while one is running replaces the queued one. */
  private queueIdb(main: string, backup: string | null): void {
    this.pendingIdb = { main, backup: backup ?? this.pendingIdb?.backup ?? null };
    if (this.idbBusy) return;
    const flush = (): void => {
      const job = this.pendingIdb;
      if (!job || !this.db) {
        this.idbBusy = false;
        return;
      }
      this.pendingIdb = null;
      this.idbBusy = true;
      try {
        const tx = this.db.transaction(DB_STORE, 'readwrite');
        const st = tx.objectStore(DB_STORE);
        if (job.backup) st.put(job.backup, this.key + BACKUP);
        st.put(job.main, this.key);
        tx.oncomplete = tx.onerror = tx.onabort = () => flush();
      } catch {
        this.idbBusy = false;
      }
    };
    flush();
  }

  private localGet(k: string): string | null {
    try {
      return this.local?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }
}

function tryUnpack(text: string | null): Packed | null {
  if (!text) return null;
  try {
    return unpackSave(text);
  } catch {
    return null;
  }
}

function safeLocalStorage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The game's save store. */
export const saves = new SaveManager();
