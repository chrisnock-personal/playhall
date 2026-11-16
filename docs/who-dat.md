# Who Dat? (#33)

A guess-the-face game for two, our own take on the genre: our own name,
our own cast of 24 drawn characters and our own look. Built 2026-11-16 from a
prototype the user tried and liked.

## Rules as built

- Each player gets a secret face from the same 24, shown only to them.
  Amber starts.
- On your turn, ask one yes/no question about the other player's face,
  picked from a list of the faces' features: hat, glasses, beard, earrings,
  scarf, freckles, a big smile, bald, long hair, hair colour (black, brown,
  blonde, red, grey) and eye colour (blue, green, brown). Skin tone is never
  a question. The server answers from the other player's secret face, so the
  answer is always right.
- The faces the answer rules out flip down on your board by themselves; you
  can flip any face up or down by hand too.
- Each question can be asked once per player. Then it's the other player's
  turn.
- Instead of asking, name a face: right and you win, wrong and you lose. With
  every question asked, naming a face is all that's left, so every game ends.
- The move timer asks the question that splits your faces still up closest to
  half, or names a face still up when none are left.
- Watchers see both boards and the questions, and both faces at the end.
- Replays go question by question.

## The cast

24 faces in `CAST` (`src/shared/games/whodat.ts`), each a set of features;
every question splits the cast into groups of 3 to 12 (checked in the
tests). Drawn in `src/client/games/whodat-art.tsx`.

## Computer player

`whoDatBot`: names the face when one is left, otherwise asks the question
that splits its faces still up closest to half.

## Choices made for now

A wrong guess loses the game; 24 faces; single games with the usual rematch;
two players. Later ideas: best of three, a second cast, more than two players
(everyone guessing one shared mystery face), an AI player that asks in words.
