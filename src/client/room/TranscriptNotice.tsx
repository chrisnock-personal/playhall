import type { RoomSnapshot } from '../../shared/protocol';
import { Icon } from '../ui';
import type { Voice } from './useVoice';
import { transcriptsOn, type Transcriber } from './useTranscriber';

/** Tells everyone, before and while they're in voice, that what's said in
 *  voice in this room is written into the chat. */
export function TranscriptNotice({ snap, voice, tx, compact }: { snap: RoomSnapshot; voice: Voice; tx: Transcriber; compact?: boolean }) {
  if (!transcriptsOn(snap)) return null;
  const inVoice = voice.state === 'on';
  const full = inVoice
    ? 'Transcribing: what you say appears in the chat'
    : 'Transcripts are on: what people say in voice appears in the chat';
  const why = 'The host turned transcripts on. Speech is written down by this server’s speech-to-text and shown in the chat as “said” lines. Only the text is kept: the audio isn’t recorded or stored. Mute (or use push to talk) and nothing you say is sent.';
  return (
    <span className={`transcript-notice${inVoice ? ' in-voice' : ''}${tx.listening ? ' live' : ''}`} role="status" title={why}>
      <Icon name="mic" size={14} />
      <span>{compact ? (inVoice ? 'Transcribing' : 'Transcripts on') : full}</span>
      {tx.listening && tx.sending > 0 && !compact && <span className="transcript-sending" aria-label="writing it down">…</span>}
      {tx.error && <span className="transcript-error" role="alert">{tx.error}</span>}
    </span>
  );
}
