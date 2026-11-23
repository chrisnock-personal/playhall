-- An admin can suspend an account (#51): it can't sign in or join rooms until lifted.
ALTER TABLE users ADD COLUMN suspended_reason TEXT;
