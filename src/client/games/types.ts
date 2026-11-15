import type { FC, ReactNode } from 'react';
import type { ClientMessage, RoomSnapshot } from '../../shared/protocol';

export interface StageProps {
  snap: RoomSnapshot;
  receivedAt: number;
  send(msg: ClientMessage): void;
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
}
