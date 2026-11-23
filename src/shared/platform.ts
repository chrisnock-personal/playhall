import { GAMES } from './games';
import { DEFAULT_LADDER, checkLadder, type Ladder } from './progression';
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

/** AI players (#32): a language model on a server the admin runs. */
export interface AiPlayersSettings {
  enabled: boolean;
  /** The model server: an Ollama address, e.g. http://host.containers.internal:11434. */
  url: string;
  model: string;
  /** How long a move may take before the rule bot plays it instead. */
  seconds: number;
}
export const AI_SECONDS_CHOICES = [5, 10, 15, 30, 60] as const;

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
  aiPlayers: AiPlayersSettings;
  /** Progression (#50): the ladder of games for players an admin puts on it. */
  progression: Ladder;
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
    aiPlayers: { enabled: false, url: '', model: 'llama3.1:8b', seconds: 15 },
    progression: structuredClone(DEFAULT_LADDER),
  };
}

const BOOLEANS = ['signupsAllowed', 'guestsAllowed', 'voiceVideoAllowed', 'transcriptsAllowed'] as const;

export type PlatformPatch = Partial<Omit<PlatformSettings, 'roomDefaults' | 'aiPlayers'>> & { roomDefaults?: Partial<RoomDefaults>; aiPlayers?: Partial<AiPlayersSettings> };

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
    } else if (key === 'aiPlayers') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'aiPlayers must be an object' };
      const ai: Partial<AiPlayersSettings> = {};
      for (const [k, x] of Object.entries(value)) {
        if (k === 'enabled') {
          if (typeof x !== 'boolean') return { error: 'AI players must be on or off' };
          ai.enabled = x;
        } else if (k === 'url') {
          if (typeof x !== 'string' || x.length > 200 || (x !== '' && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(x.trim()))) return { error: 'The model server must be an http:// or https:// address' };
          ai.url = x.trim().replace(/\/+$/, '');
        } else if (k === 'model') {
          if (typeof x !== 'string' || !/^[\w.:/-]{1,100}$/.test(x.trim())) return { error: 'Give the model\u2019s name, like llama3.1:8b' };
          ai.model = x.trim();
        } else if (k === 'seconds') {
          if (!(AI_SECONDS_CHOICES as readonly unknown[]).includes(x)) return { error: 'Pick a time limit from the list' };
          ai.seconds = x as number;
        } else return { error: `Unknown AI setting: ${k}` };
      }
      patch.aiPlayers = ai;
    } else if (key === 'progression') {
      const r = checkLadder(value, Object.keys(GAMES));
      if ('error' in r) return r;
      patch.progression = r.ladder;
    } else return { error: `Unknown setting: ${key}` };
  }
  return { patch };
}

/** Settings from stored rows (key -> value) over the defaults. Bad or unknown
 *  stored values are skipped, so an old row can't break startup. */
export function mergePlatformSettings(base: PlatformSettings, stored: Record<string, unknown>): PlatformSettings {
  const out: PlatformSettings = { ...base, roomDefaults: { ...base.roomDefaults }, aiPlayers: { ...base.aiPlayers } };
  for (const [key, value] of Object.entries(stored)) {
    const one = checkPlatformPatch({ [key]: value });
    if ('error' in one) {
      // A roomDefaults or aiPlayers row with one bad field: keep the good ones.
      if ((key === 'roomDefaults' || key === 'aiPlayers') && value && typeof value === 'object') {
        for (const [k, x] of Object.entries(value)) {
          const f = checkPlatformPatch({ [key]: { [k]: x } });
          if ('patch' in f) Object.assign(key === 'roomDefaults' ? out.roomDefaults : out.aiPlayers, f.patch[key]);
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
  const { roomDefaults, aiPlayers, ...rest } = patch;
  Object.assign(s, rest);
  if (roomDefaults) s.roomDefaults = { ...s.roomDefaults, ...roomDefaults };
  if (aiPlayers) s.aiPlayers = { ...s.aiPlayers, ...aiPlayers };
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
  /** On the progression ladder (#50). */
  progression: boolean;
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

/** Reports (#21): why a player reports a room or a person. */
export const REPORT_REASONS = {
  rude: 'Rude or unkind',
  cheating: 'Cheating or spoiling games',
  spam: 'Spam or flooding the chat',
  other: 'Something else',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const REPORT_DETAILS_MAX = 500;

export interface AdminReport {
  id: string;
  reporter: string;
  roomCode: string;
  roomName: string;
  /** Who was reported, or null for the room itself. */
  target: string | null;
  reason: ReportReason;
  details: string;
  chat: { name: string; channel: string; text: string; at: string }[];
  createdAt: string;
  resolved: { at: string; by: string; note: string } | null;
}
