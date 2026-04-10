-- ============================================
-- 010_race_entry_form_snapshot.sql
--
-- Snapshot the horse's form value onto race_entries at race-creation time.
-- Form is the only horse stat that mutates between races, so this is the one
-- value we need to preserve in order for provably-fair verification to work
-- when someone re-runs the simulation later (after the horse's form has
-- already been updated by subsequent races).
-- ============================================

ALTER TABLE race_entries
  ADD COLUMN IF NOT EXISTS snapshot_form INT;

-- Backfill: for existing rows where we don't have a snapshot, use the horse's
-- current form as a best-effort value. New races will always have the correct
-- snapshot written at race-creation time.
UPDATE race_entries re
SET snapshot_form = h.form
FROM horses h
WHERE re.horse_id = h.id
  AND re.snapshot_form IS NULL;
