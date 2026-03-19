BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS photo_limit INTEGER,
  ADD COLUMN IF NOT EXISTS video_limit INTEGER;

ALTER TABLE tatuagens
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'foto';

UPDATE plans
SET
  photo_limit = CASE id
    WHEN 1 THEN 7
    WHEN 2 THEN 20
    WHEN 3 THEN NULL
    ELSE photo_limit
  END,
  video_limit = CASE id
    WHEN 1 THEN 1
    WHEN 2 THEN 7
    WHEN 3 THEN NULL
    ELSE video_limit
  END
WHERE id IN (1, 2, 3);

UPDATE tatuagens
SET tipo = 'foto'
WHERE tipo IS NULL OR tipo = '';

COMMIT;
