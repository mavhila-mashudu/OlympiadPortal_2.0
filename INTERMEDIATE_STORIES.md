# Intermediate stories implementation

The new features require the database migration in `backend/prisma/migrations/20260924220000_intermediate_stories`. Deploy the backend before the updated frontend. `npm run start:prod` already runs `prisma migrate deploy`; verify the migration succeeded in the backend logs before testing.

- I7: The organiser marking queue now includes a ten-percent moderation sample of manually marked answers. The organiser cannot review an answer they personally marked. Review notes and point changes are stored, and released ranks are recalculated.
- I8: Students can request one remark per released round from their results page. The organiser reviews requests in the marking queue, records a reasoned decision, and can revise a selected answer. The student's request status and decision are displayed on their results page.
- I10: Releasing results auto-enrols qualified entrants into the next existing round; creating a next round after release also enrols qualifiers from the preceding released round.
- I11-I14: In-app notifications run from configured rules in the lifecycle job. Every olympiad receives four default rules: one hour before opening, one hour before closing, one hour before closing if the school still has no submitted results, and on results release. Users see notifications in the portal header. Organisers can add, disable, delete and preview rules. Delivery uses a unique key to prevent duplicate messages. Scheduled messages are delivered during a five-minute window; a server outage longer than that window skips old reminders.
- I17: A qualified student can download a PDF certificate from the results page or round detail. The server verifies ownership, release and qualification.

The notification channel is **in-app**; this work does not send email. The existing email-labelled rules are converted to in-app rules by the migration. There is no separately assigned moderator role; organisers perform review and may not moderate their own marking.

Suggested smoke test after deployment: create an olympiad and two rounds, register school/educator/student, mark and release round one, confirm round-two enrolment and the released result notification, request a remark, review it as organiser, check updated standings, and download a certificate for a qualifier. For timed rules, set opening/closing times about an hour ahead and observe the notifications in the portal.
