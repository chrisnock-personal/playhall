-- Transcripts: chat lines can also be "said" (speech written down by Whisper).
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('typed', 'said', 'system'));
