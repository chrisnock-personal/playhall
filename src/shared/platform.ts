// Platform settings: the admin's choices for the whole Playhall (not one
// person's, not one room's). Kept in the database (platform_settings), read
// by the server from a cache, changed on the admin page (#/admin).

export const MOVE_SECONDS_CHOICES = [0, 15, 30, 60, 120, 300] as const;
export const WATCHER_DELAY_CHOICES = [0, 15, 30, 60, 120] as const;
/** 'family' (no rude or obscure words) is planned, not built yet. */
export const WORD_LISTS = ['full'] as const;
export type WordList = (typeof WORD_LISTS)[number];

export interface RoomDefaults {
  /** Seconds per move, 0 = no limit. */
  moveSeconds: number;
  /** Seconds watchers see the game late, 0 = live. */
  watcherDelay: number;
  /** New rooms count for the leaderboards. */
  ranked: boolean;
}

export interface PlatformSettings {
  /** People can create accounts (the first value comes from ALLOW_SIGNUP). */
  signupsAllowed: boolean;
  /** People can come in as guests, with just a name. */
  guestsAllowed: boolean;
  /** Voice and video in rooms (also needs LiveKit set up). */
  voiceVideoAllowed: boolean;
  /** Rooms can keep transcripts of what's said. */
  transcriptsAllowed: boolean;
  roomDefaults: RoomDefaults;
  letterworksWordList: WordList;
}

/** Today's behaviour: what applies until an admin changes something. */
export function defaultPlatformSettings(env: { signupsAllowed?: boolean } = {}): PlatformSettings {
  return {
    signupsAllowed: env.signupsAllowed ?? true,
    guestsAllowed: true,
    voiceVideoAllowed: true,
    transcriptsAllowed: true,
    roomDefaults: { moveSeconds: 0, watcherDelay: 0, ranked: true },
    letterworksWordList: 'full',
  };
}

const BOOLEANS = ['signupsAllowed', 'guestsAllowed', 'voiceVideoAllowed', 'transcriptsAllowed'] as const;

export type PlatformPatch = Partial<Omit<PlatformSettings, 'roomDefaults'>> & { roomDefaults?: Partial<RoomDefaults> };

/** Check a change from the admin page. Unknown keys are refused, so a typo
 *  doesn't silently do nothing. Returns the clean patch or a reason in words. */
export function checkPlatformPatch(v: unknown): { patch: PlatformPatch } | { error: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Send the settings to change' };
  const patch: PlatformPatch = {};
  for (const [key, value] of Object.entries(v)) {
    if ((BOOLEANS as readonly string[]).includes(key)) {
      if (typeof value !== 'boolean') return { error: `${key} must be on or off` };
      patch[key as (typeof BOOLEANS)[number]] = value;
    } else if (key === 'letterworksWordList') {
      if (!(WORD_LISTS as readonly unknown[]).includes(value)) return { error: 'Pick a word list from the list' };
      patch.letterworksWordList = value as WordList;
    } else if (key === 'roomDefaults') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'roomDefaults must be an object' };
      const rd: Partial<RoomDefaults> = {};
      for (const [k, x] of Object.entries(value)) {
        if (k === 'moveSeconds') {
          if (!(MOVE_SECONDS_CHOICES as readonly unknown[]).includes(x)) return { error: 'Pick a move timer from the list' };
          rd.moveSeconds = x as number;
        } else if (k === 'watcherDelay') {
          if (!(WATCHER_DELAY_CHOICES as readonly unknown[]).includes(x)) return { error: 'Pick a watcher delay from the list' };
          rd.watcherDelay = x as number;
        } else if (k === 'ranked') {
          if (typeof x !== 'boolean') return { error: 'ranked must be on or off' };
          rd.ranked = x;
        } else return { error: `Unknown room default: ${k}` };
      }
      patch.roomDefaults = rd;
    } else return { error: `Unknown setting: ${key}` };
  }
  return { patch };
}

/** Settings from stored rows (key -> value) over the defaults. Bad or unknown
 *  stored values are skipped, so an old row can't break startup. */
export function mergePlatformSettings(base: PlatformSettings, stored: Record<string, unknown>): PlatformSettings {
  const out: PlatformSettings = { ...base, roomDefaults: { ...base.roomDefaults } };
  for (const [key, value] of Object.entries(stored)) {
    const one = checkPlatformPatch({ [key]: value });
    if ('error' in one) {
      // A roomDefaults row with one bad field: keep the good ones.
      if (key === 'roomDefaults' && value && typeof value === 'object') {
        for (const [k, x] of Object.entries(value)) {
          const f = checkPlatformPatch({ roomDefaults: { [k]: x } });
          if ('patch' in f) Object.assign(out.roomDefaults, f.patch.roomDefaults);
        }
      }
      continue;
    }
    applyPatch(out, one.patch);
  }
  return out;
}

/** Apply a checked patch (in place) and return the settings. */
export function applyPatch(s: PlatformSettings, patch: PlatformPatch): PlatformSettings {
  const { roomDefaults, ...rest } = patch;
  Object.assign(s, rest);
  if (roomDefaults) s.roomDefaults = { ...s.roomDefaults, ...roomDefaults };
  return s;
}

/** What anyone may know (the sign-in page, the lobby, rooms). */
export interface PublicPlatform {
  signupsAllowed: boolean;
  guestsAllowed: boolean;
  /** Allowed by the admin and set up on the server. */
  voiceVideo: boolean;
  transcriptsAllowed: boolean;
  roomDefaults: RoomDefaults;
}

// ---- the admin page's data ----------------------------------------------

export interface AdminCert {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint256: string;
  selfSigned: boolean;
  expired: boolean;
}

export interface AdminOverview {
  settings: PlatformSettings;
  /** null: the server runs plain HTTP (TLS=off). */
  tls: AdminCert | null;
  /** LiveKit: set up (LIVEKIT_* in the environment) and where. */
  media: { configured: boolean; url: string | null };
  /** Usernames made admin through ADMIN_USERNAMES. */
  envAdmins: string[];
}

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  admin: boolean;
  /** Admin through ADMIN_USERNAMES: can't be removed from the page. */
  envAdmin: boolean;
  played: number;
}

export interface AdminRoom {
  code: string;
  name: string;
  gameName: string;
  hostName: string;
  status: 'idle' | 'playing' | 'over';
  /** People with the room open now. */
  present: number;
  seated: number;
  seats: number;
  listed: boolean;
  locked: boolean;
  updatedAt: string;
}
