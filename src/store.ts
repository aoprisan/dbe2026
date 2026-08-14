const KEY = 'dbe12.selection.v1';
const STAR_KEY = 'dbe12.stars.v1';
const DAY_KEY = 'dbe12.activeDay.v1';
const SEEN_VERSION_KEY = 'dbe12.dataVersion.v1';

type Listener = () => void;

class SelectionStore {
  private selected: Set<string>;
  /** "Must-see" tier: a subset of `selected` the user has starred. */
  private starred: Set<string>;
  private listeners = new Set<Listener>();

  constructor() {
    this.selected = new Set(load(KEY));
    // Stars only make sense on picked sets; prune any strays from old data.
    this.starred = new Set(load(STAR_KEY).filter((id) => this.selected.has(id)));
  }

  has(id: string): boolean {
    return this.selected.has(id);
  }

  ids(): string[] {
    return [...this.selected];
  }

  size(): number {
    return this.selected.size;
  }

  isStarred(id: string): boolean {
    return this.starred.has(id);
  }

  starredIds(): string[] {
    return [...this.starred];
  }

  toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
      this.starred.delete(id); // un-picking clears the star too
    } else {
      this.selected.add(id);
    }
    this.persist();
  }

  /** Add a set to the selection, leaving an existing pick untouched. */
  add(id: string): void {
    if (this.selected.has(id)) return;
    this.selected.add(id);
    this.persist();
  }

  /** Flip the "must-see" star on a picked set (no-op on unpicked ids). */
  toggleStar(id: string): void {
    if (!this.selected.has(id)) return;
    if (this.starred.has(id)) this.starred.delete(id);
    else this.starred.add(id);
    this.persist();
  }

  clear(): void {
    this.selected.clear();
    this.starred.clear();
    this.persist();
  }

  /** Replace the entire selection at once (used when importing a shared link). */
  replaceAll(ids: string[]): void {
    this.selected = new Set(ids);
    this.starred = new Set([...this.starred].filter((id) => this.selected.has(id)));
    this.persist();
  }

  /**
   * Drop picks that no longer name a set on the bill.
   *
   * A pick id is night plus band name, so a line-up correction — a band renamed
   * or dropped — strands whatever was picked under the old name. The set itself
   * is gone from every list that resolves ids to sets, but `size()` counts the
   * ids themselves, so a stranded pick would sit in the header's counter with
   * nothing on any night to point at. The caller owns the line-up, so it passes
   * the ids that still exist rather than this file reaching for the data.
   */
  retain(valid: ReadonlySet<string>): void {
    const kept = [...this.selected].filter((id) => valid.has(id));
    if (kept.length === this.selected.size) return;
    this.selected = new Set(kept);
    this.starred = new Set([...this.starred].filter((id) => this.selected.has(id)));
    this.persist();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.selected]));
      localStorage.setItem(STAR_KEY, JSON.stringify([...this.starred]));
    } catch {
      /* ignore quota / private mode */
    }
    this.listeners.forEach((fn) => fn());
  }
}

function load(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const selection = new SelectionStore();

/**
 * The night tab last opened, and the night that was on when it was opened.
 *
 * Storing the pair is what lets a tapped tab stay put without outliving the
 * evening it was tapped on: the caller asks for the choice made *for* the night
 * now running, so a tab left on Night II is quietly forgotten once the clock
 * has moved on to Night III, and the app opens on what is actually playing.
 *
 * A value written by an older build is a bare id with nothing to date it by.
 * That is exactly the stale tab this is here to drop, so it fails to parse and
 * is treated as no choice at all.
 */
export function loadActiveDay(tonight: string): string {
  try {
    const raw = localStorage.getItem(DAY_KEY);
    if (!raw) return tonight;
    const saved = JSON.parse(raw) as { id?: unknown; on?: unknown };
    if (typeof saved?.id === 'string' && saved.on === tonight) return saved.id;
    return tonight;
  } catch {
    return tonight;
  }
}

export function saveActiveDay(id: string, tonight: string): void {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify({ id, on: tonight }));
  } catch {
    /* ignore */
  }
}

/** The data version this device last acknowledged, or null on first visit. */
export function loadSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

export function saveSeenVersion(v: string): void {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, v);
  } catch {
    /* ignore */
  }
}
