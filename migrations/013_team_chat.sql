-- Realm Battle's private team chats (#68): text only, one per side.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_channel_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_channel_check
  CHECK (channel IN ('table', 'gallery') OR channel ~ '^team-[0-9]+$');
