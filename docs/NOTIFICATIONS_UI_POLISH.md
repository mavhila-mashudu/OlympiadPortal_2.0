# School onboarding notifications

## In-app notifications

The existing `/me/notifications` inbox now records school onboarding events:

- A signup **without a code** alerts the **active school coordinator**. For the first educator at a school without a coordinator, active organisers are alerted instead. An organiser is **not** assigned a student approval request they cannot decide.
- A successful signup **with a code** alerts **the person who sent that invitation**.
- An **approval or rejection** alerts the **applicant**. The approval gate also displays the latest registration decision for people who do not yet have full platform access.

School coordinators retain the only permissions for approving their school's students and staff. Ordinary educators can send school invitations but cannot approve membership applications.

Notifications are in-app, not additional emails. The dashboard inbox refreshes approximately once per minute. Notifications are user-scoped, with a unique key to avoid duplicate alerts. This feature reuses `portal_notifications`; **no new database migration is required**.

## Manual verification before deployment

1. Create a new educator account without a code at a school without a coordinator; an organiser should see a pending request alert and can open the approval page.
2. Create an educator/student account without a code at a school with an active coordinator; only that coordinator should receive the request alert.
3. Accept a school invitation using its code; the **original inviter** should see the joined notification.
4. Approve or reject a request; check that the applicant sees the updated state and their own registration notification, without exposure to anyone else's notifications.
5. Verify the original organiser, educator and student UI is unchanged, and run frontend build/lint/tests and backend unit/integration/API suites.

This PR does not change the Olympiad participation-invitation flow or email templates.
