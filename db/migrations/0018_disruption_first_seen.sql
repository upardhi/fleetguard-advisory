-- Track when a disruption was FIRST detected on a segment.
-- last_checked_at = when the segment was last scanned.
-- disruption_first_seen_at = when has_disruption first flipped to true.
-- The gap between them tells us: "Ongoing for 3 days" vs "Detected 2 hours ago."
ALTER TABLE adv_watched_segments
  ADD COLUMN IF NOT EXISTS disruption_first_seen_at TIMESTAMPTZ;
