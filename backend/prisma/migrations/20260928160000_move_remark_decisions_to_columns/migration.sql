-- Organiser decisions used to be stored as status 'reviewed' with the outcome
-- folded into review_note ("approved: <explanation>"). They now use the
-- status and the decision / decided_at columns. Only remarks decided by the
-- olympiad's own organiser are moved, so an educator's review note that
-- happens to start the same way is left as it is.
UPDATE "remark_requests" AS rr
SET "status" = split_part(rr."review_note", ': ', 1)::"remark_status",
    "decision" = substr(rr."review_note", strpos(rr."review_note", ': ') + 2),
    "decided_at" = rr."reviewed_at",
    "review_note" = NULL
FROM "results" r
JOIN "rounds" ro ON ro."id" = r."round_id"
JOIN "olympiads" o ON o."id" = ro."olympiad_id"
WHERE r."id" = rr."result_id"
  AND rr."status" = 'reviewed'
  AND rr."decision" IS NULL
  AND rr."reviewer_id" = o."organiser_id"
  AND rr."review_note" ~ '^(approved|rejected): ';
