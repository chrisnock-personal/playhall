// Who Dat?: a guess-the-face game for two (#33), our own take on the genre
// with our own cast. Each player has a secret face from the same board of 24.
// Taking turns, you ask a yes/no question about the other player's face,
// picked from the faces' features; the server answers it from their secret
// face and flips down the faces it rules out on your board. Or you name a
// face: right and you win, wrong and you lose. Faces, not skin: no question is
// ever about skin tone. Design: docs/who-dat.md.

import type { GameModule, GameResult, SeatId } from '../game';

export type HairColour = 'black' | 'brown' | 'blonde' | 'red' | 'grey' | 'none';
export type Cut = 'short' | 'long' | 'bald';
export type EyeColour = 'brown' | 'blue' | 'green';
export type Extra = 'hat' | 'glasses' | 'beard' | 'earrings' | 'scarf' | 'freckles' | 'smile';

export interface Face {
  name: string;
  hair: HairColour;
  cut: Cut;
  eyes: EyeColour;
  extras: Extra[];
  /** Drawing only (never asked about): skin tone and top colour, 0-5. */
  skin: number;
  top: number;
}

const f = (name: string, hair: HairColour, cut: Cut, eyes: EyeColour, extras: Extra[], skin: number, top: number): Face => ({ name, hair, cut, eyes, extras, skin, top });

/** The cast, ours: every question splits it into groups of 3 to 9. */
export const CAST: Face[] = [
  f('Abe', 'grey', 'short', 'brown', ['beard', 'glasses'], 0, 0), f('Bea', 'red', 'long', 'green', ['freckles', 'smile'], 5, 1),
  f('Cal', 'black', 'short', 'brown', ['hat'], 3, 2), f('Dot', 'blonde', 'long', 'blue', ['earrings', 'smile'], 1, 3),
  f('Eli', 'brown', 'short', 'green', ['glasses', 'scarf'], 2, 4), f('Fay', 'black', 'long', 'brown', ['earrings', 'hat'], 0, 5),
  f('Gus', 'none', 'bald', 'blue', ['beard', 'smile'], 5, 0), f('Hal', 'red', 'short', 'blue', ['beard', 'freckles'], 1, 1),
  f('Ivy', 'brown', 'long', 'brown', ['glasses'], 4, 2), f('Jon', 'blonde', 'short', 'brown', ['scarf', 'smile'], 3, 3),
  f('Kit', 'black', 'short', 'green', ['earrings', 'glasses', 'smile'], 2, 4), f('Lou', 'grey', 'long', 'blue', ['scarf'], 1, 5),
  f('Max', 'brown', 'short', 'green', ['hat', 'beard'], 0, 0), f('Nia', 'black', 'long', 'brown', ['smile', 'scarf'], 5, 1),
  f('Oz', 'none', 'bald', 'brown', ['glasses', 'hat'], 4, 2), f('Pip', 'blonde', 'short', 'green', ['freckles'], 3, 3),
  f('Quin', 'red', 'long', 'brown', ['hat', 'glasses'], 2, 4), f('Rex', 'brown', 'short', 'blue', ['smile'], 1, 5),
  f('Sol', 'black', 'short', 'brown', ['beard', 'scarf'], 0, 0), f('Tess', 'grey', 'long', 'green', ['earrings', 'glasses'], 5, 1),
  f('Uma', 'brown', 'long', 'blue', ['freckles', 'hat'], 4, 2), f('Vic', 'blonde', 'short', 'brown', ['beard', 'glasses'], 3, 3),
  f('Wren', 'red', 'short', 'blue', ['earrings', 'scarf'], 2, 4), f('Zed', 'none', 'bald', 'green', ['smile', 'earrings'], 1, 5),
];

export type QuestionId = 'hat' | 'glasses' | 'beard' | 'earrings' | 'scarf' | 'freckles' | 'smile' | 'bald' | 'long'
  | 'black' | 'brown' | 'blonde' | 'red' | 'grey' | 'blueeyes' | 'greeneyes' | 'browneyes';

/** The questions: features only. */
export const QUESTIONS: { id: QuestionId; text: string; test(f: Face): boolean }[] = [
  { id: 'hat', text: 'Wearing a hat?', test: (x) => x.extras.includes('hat') },
  { id: 'glasses', text: 'Glasses?', test: (x) => x.extras.includes('glasses') },
  { id: 'beard', text: 'A beard?', test: (x) => x.extras.includes('beard') },
  { id: 'earrings', text: 'Earrings?', test: (x) => x.extras.includes('earrings') },
  { id: 'scarf', text: 'A scarf?', test: (x) => x.extras.includes('scarf') },
  { id: 'freckles', text: 'Freckles?', test: (x) => x.extras.includes('freckles') },
  { id: 'smile', text: 'A big smile?', test: (x) => x.extras.includes('smile') },
  { id: 'bald', text: 'Bald?', test: (x) => x.cut === 'bald' },
  { id: 'long', text: 'Long hair?', test: (x) => x.cut === 'long' },
  { id: 'black', text: 'Black hair?', test: (x) => x.hair === 'black' },
  { id: 'brown', text: 'Brown hair?', test: (x) => x.hair === 'brown' },
  { id: 'blonde', text: 'Blonde hair?', test: (x) => x.hair === 'blonde' },
  { id: 'red', text: 'Red hair?', test: (x) => x.hair === 'red' },
  { id: 'grey', text: 'Grey hair?', test: (x) => x.hair === 'grey' },
  { id: 'blueeyes', text: 'Blue eyes?', test: (x) => x.eyes === 'blue' },
  { id: 'greeneyes', text: 'Green eyes?', test: (x) => x.eyes === 'green' },
  { id: 'browneyes', text: 'Brown eyes?', test: (x) => x.eyes === 'brown' },
];
export const question = (id: QuestionId) => QUESTIONS.find((q) => q.id === id)!;

const SEATS = ['amber', 'teal'];
const other = (s: SeatId) => (s === 'amber' ? 'teal' : 'amber');

export interface Asked { seat: SeatId; q: QuestionId; yes: boolean }

export interface WhoState {
  /** Each player's secret face (an index into CAST). */
  secret: Record<SeatId, number>;
  /** Each player's own board: which faces are still up. */
  up: Record<SeatId, boolean[]>;
  asked: Asked[];
  /** Guesses, in order (only the last can be wrong: it ends the game). */
  guesses: { seat: SeatId; face: number; right: boolean }[];
  turn: SeatId;
  result: GameResult | null;
}

export interface WhoView {
  you: SeatId | null;
  turn: SeatId | null;
  /** Your secret face; everyone's once the game is over. */
  secret: Partial<Record<SeatId, number>>;
  /** Your own board; watchers see both. */
  up: Partial<Record<SeatId, boolean[]>>;
  /** How many faces each player still has up. */
  left: Record<SeatId, number>;
  asked: Asked[];
  guesses: WhoState['guesses'];
  result: GameResult | null;
}

/** Questions this seat hasn't asked yet. */
export const openQuestions = (asked: Asked[], seat: SeatId) => QUESTIONS.filter((q) => !asked.some((a) => a.seat === seat && a.q === q.id));

function ask(s: WhoState, seat: SeatId, id: QuestionId): WhoState {
  const q = question(id);
  const yes = q.test(CAST[s.secret[other(seat)]]);
  const up = s.up[seat].map((u, i) => u && q.test(CAST[i]) === yes);
  return { ...s, asked: [...s.asked, { seat, q: id, yes }], up: { ...s.up, [seat]: up }, turn: other(seat) };
}

function guess(s: WhoState, seat: SeatId, face: number): WhoState {
  const right = s.secret[other(seat)] === face;
  const result: GameResult = right
    ? { winner: seat, reason: `naming ${CAST[face].name}` }
    : { winner: other(seat), reason: `a wrong guess (${CAST[face].name})` };
  return { ...s, guesses: [...s.guesses, { seat, face, right }], result };
}

/** The question that splits these faces closest to half (bots and the move timer). */
export function bestQuestion(up: boolean[], open: typeof QUESTIONS, random: () => number) {
  const left = CAST.map((_, i) => i).filter((i) => up[i]);
  let best: (typeof QUESTIONS)[number] | null = null, gap = Infinity;
  for (const q of open) {
    const n = left.filter((i) => q.test(CAST[i])).length;
    if (n === 0 || n === left.length) continue;
    const g = Math.abs(n - left.length / 2) + random() * 0.4;
    if (g < gap) { best = q; gap = g; }
  }
  return best;
}

export const whoDat: GameModule<WhoState, Record<string, never>> = {
  id: 'whodat',
  name: 'Who Dat?',
  description: 'Two players, 24 faces. Ask yes/no questions about the other player’s secret face and name it first.',
  howToPlay: {
    goal: 'Work out which of the 24 faces is the other player’s secret face, and name it before they name yours.',
    sections: [
      { title: 'A turn', points: [
        'You each have a secret face, shown to you alone. Amber starts.',
        'On your turn, ask one yes/no question about the other player’s face, picked from the list (a hat? glasses? red hair?). The answer comes from their face, so it’s always right.',
        'The faces the answer rules out flip down on your board by themselves. The answers never flip down the right face. To flip faces yourself, press Flip faces by hand.',
        'Each question can be asked once. Then it’s the other player’s turn.',
      ] },
      { title: 'Naming the face', points: [
        'Instead of asking, you can name a face: press Guess, then click it.',
        'Right, and you win. Wrong, and you lose, so be sure.',
        'If you’ve asked every question, all that’s left is to name a face.',
      ] },
      { title: 'Tips', points: [
        'The best questions split the faces still up about in half.',
        'If the room has a move timer and you run out of time, a good question is asked for you (or, with none left, a face still up is named).',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => '24 faces',

  create: (_c, _now, ctx) => {
    const pick = () => Math.floor(ctx.random() * CAST.length);
    return {
      secret: { amber: pick(), teal: pick() },
      up: { amber: CAST.map(() => true), teal: CAST.map(() => true) },
      asked: [], guesses: [], turn: 'amber', result: null,
    };
  },

  act(s, seat, raw) {
    if (s.result) return { error: 'The game is over' };
    if (!SEATS.includes(seat)) return { error: 'Not a Who Dat? seat' };
    const a = raw as { type?: string; q?: string; face?: number; up?: boolean };
    const face = a.face as number;
    const isFace = Number.isInteger(face) && face >= 0 && face < CAST.length;
    switch (a?.type) {
      case 'flip':
        if (!isFace || typeof a.up !== 'boolean') return { error: 'Pick a face to flip' };
        return { state: { ...s, up: { ...s.up, [seat]: s.up[seat].map((u, i) => (i === face ? a.up! : u)) } } };
      case 'ask': {
        if (s.turn !== seat) return { error: 'It isn’t your turn' };
        if (!openQuestions(s.asked, seat).some((q) => q.id === a.q)) return { error: 'Pick a question you haven’t asked yet' };
        return { state: ask(s, seat, a.q as QuestionId) };
      }
      case 'guess':
        if (s.turn !== seat) return { error: 'It isn’t your turn' };
        if (!isFace) return { error: 'Pick a face' };
        return { state: guess(s, seat, face) };
      case 'resign':
        return { state: { ...s, result: { winner: other(seat), reason: 'resignation' } } };
      default:
        return { error: 'Unknown move' };
    }
  },

  turn: (s) => (s.result ? [] : [s.turn]),
  timeout(s, seat, _now, ctx) {
    const q = bestQuestion(s.up[seat], openQuestions(s.asked, seat), ctx.random);
    if (q) return ask(s, seat, q.id);
    const left = CAST.map((_, i) => i).filter((i) => s.up[seat][i]);
    return guess(s, seat, left.length ? left[Math.floor(ctx.random() * left.length)] : 0);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  /** Replays: question by question, both boards and both faces shown. */
  replay(s) {
    const frames: WhoView[] = [];
    let up: Record<SeatId, boolean[]> = { amber: CAST.map(() => true), teal: CAST.map(() => true) };
    const frame = (asked: Asked[], turn: SeatId): WhoView => ({ ...(this.view({ ...s, up, asked, guesses: [], turn, result: null }, 0, null) as WhoView), secret: s.secret });
    frames.push(frame([], 'amber'));
    s.asked.forEach((a, k) => {
      const q = question(a.q);
      up = { ...up, [a.seat]: up[a.seat].map((u, i) => u && q.test(CAST[i]) === a.yes) };
      frames.push(frame(s.asked.slice(0, k + 1), other(a.seat)));
    });
    frames.push(this.view(s, 0, null) as WhoView);
    return frames;
  },

  view(s, _now, viewer): WhoView {
    const seated = viewer !== null && SEATS.includes(viewer);
    const secret: WhoView['secret'] = s.result ? { ...s.secret } : seated ? { [viewer!]: s.secret[viewer!] } : {};
    const up: WhoView['up'] = seated && !s.result ? { [viewer!]: s.up[viewer!] } : { ...s.up };
    return {
      you: seated ? viewer : null, turn: s.result ? null : s.turn, secret, up,
      left: { amber: s.up.amber.filter(Boolean).length, teal: s.up.teal.filter(Boolean).length },
      asked: s.asked, guesses: s.guesses, result: s.result,
    };
  },
};
