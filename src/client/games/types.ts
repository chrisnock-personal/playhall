import type { FC, ReactNode } from 'react';
import type { ClientMessage, RoomSnapshot } from '../../shared/protocol';
import type { Voice } from '../room/useVoice';

export interface StageProps {
  snap: RoomSnapshot;
  receivedAt: number;
  send(msg: ClientMessage): void;
  /** The room's voice and video (not in replays): the camera table's stage shows the table camera. */
  voice?: Voice;
  /** Your session token, for the few things done over HTTP (the table camera link). */
  token?: string;
}

// The browser half of a game plug-in. The room shell gives it the stage (the
// middle of the room), one side-panel tab, and a slot on each seat card.
export interface GameClient {
  id: string;
  Stage: FC<StageProps>;
  tab?: { label: string; Component: FC<StageProps> };
  /** Something small for a seat card, e.g. that seat's clock. */
  seatExtra?(props: StageProps, seatId: string): ReactNode;
  ConfigPicker: FC<{ value: unknown; onChange(v: unknown): void; disabled?: boolean }>;
  /** Pictures for the How to play rules (#57), drawn with the game's own pieces, by section title. */
  rulesPictures?: Record<string, FC>;
}
