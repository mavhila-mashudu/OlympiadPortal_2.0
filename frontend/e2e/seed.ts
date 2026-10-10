// The starting state every E2E test begins from: one olympiad, one registered
// school with a coordinator, one student, a live round to sit and a draft
// round to build.
import type { PGlite } from '@electric-sql/pglite';
import {
    DRAFT_ROUND,
    EDUCATOR_PROFILE_ID,
    ENTRANT_ID,
    JOINING_ENTRANT_ID,
    LIVE_ROUND,
    OLYMPIAD,
    SCHOOL,
    UNREGISTERED_SCHOOL,
    USERS,
} from './test-data';

const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

export async function seedDatabase(db: PGlite) {
    const user = (
        u: { id: string; email: string; fullName: string },
        role: string
    ) => `('${u.id}', '${u.email}', '${u.fullName}', '${u.id}', '${role}')`;

    await db.exec(`
    INSERT INTO users (id, email, full_name, auth_provider_id, role) VALUES
      ${user(USERS.organiser, 'organiser')},
      ${user(USERS.educator, 'educator')},
      ${user(USERS.student, 'student')},
      ${user(USERS.disposable, 'organiser')},
      ${user(USERS.resetting, 'organiser')},
      ${user(USERS.otherEducator, 'educator')},
      ${user(USERS.joiningStudent, 'student')};

    INSERT INTO schools (id, name, address) VALUES
      ('${SCHOOL.id}', '${SCHOOL.name}', '1 Park Road'),
      ('${UNREGISTERED_SCHOOL.id}', '${UNREGISTERED_SCHOOL.name}', '9 North Street');

    INSERT INTO olympiads (id, name, organiser_id)
      VALUES ('${OLYMPIAD.id}', '${OLYMPIAD.name}', '${USERS.organiser.id}');

    INSERT INTO school_registrations (school_id, olympiad_id, status)
      VALUES ('${SCHOOL.id}', '${OLYMPIAD.id}', 'approved');

    INSERT INTO educators (id, user_id, school_id)
      VALUES ('${EDUCATOR_PROFILE_ID}', '${USERS.educator.id}', '${SCHOOL.id}');

    INSERT INTO school_memberships (user_id, school_id, role, status) VALUES
      ('${USERS.educator.id}', '${SCHOOL.id}', 'coordinator', 'active'),
      ('${USERS.otherEducator.id}', '${UNREGISTERED_SCHOOL.id}', 'coordinator', 'active');

    -- A coordinator at a school that has not joined the olympiad yet, so the
    -- organiser has someone to invite
    INSERT INTO educators (id, user_id, school_id)
      VALUES ('${UNREGISTERED_SCHOOL.educatorProfileId}', '${USERS.otherEducator.id}', '${UNREGISTERED_SCHOOL.id}');

    INSERT INTO entrants (id, user_id, school_id, full_name, grade, external_ref) VALUES
      ('${ENTRANT_ID}', '${USERS.student.id}', '${SCHOOL.id}', '${USERS.student.fullName}', '11', 'STU-001'),
      ('${JOINING_ENTRANT_ID}', '${USERS.joiningStudent.id}', '${SCHOOL.id}', '${USERS.joiningStudent.fullName}', '10', 'STU-002');

    -- A live, open round: the student can sit it online
    INSERT INTO rounds (id, olympiad_id, name, opens_at, closes_at, state, exam_status, qualifying_threshold)
      VALUES ('${LIVE_ROUND.id}', '${OLYMPIAD.id}', '${LIVE_ROUND.name}',
              '${hoursFromNow(-1)}', '${hoursFromNow(3)}', 'open', 'live', 50);

    INSERT INTO papers (id, round_id, title, file_url, memo_file_url)
      VALUES ('${LIVE_ROUND.paperId}', '${LIVE_ROUND.id}', '${LIVE_ROUND.name} paper',
              'rounds/${LIVE_ROUND.id}/paper.pdf', 'rounds/${LIVE_ROUND.id}/memo.pdf');

    INSERT INTO questions (id, paper_id, type, prompt, options, correct_option, negative_pct, max_points, created_at)
      VALUES ('${LIVE_ROUND.mcqId}', '${LIVE_ROUND.paperId}', 'mcq', 'Which of these numbers are prime?',
              '["2", "4", "5", "9"]'::jsonb, '0,2', 0, 4, now() - interval '2 minutes');

    INSERT INTO questions (id, paper_id, type, prompt, correct_answer, negative_pct, max_points, created_at)
      VALUES ('${LIVE_ROUND.shortId}', '${LIVE_ROUND.paperId}', 'short_answer', 'What is the capital city of South Africa?',
              'Pretoria', 0, 2, now() - interval '1 minute');

    INSERT INTO entrant_registrations (entrant_id, round_id, registered_by, status)
      VALUES ('${ENTRANT_ID}', '${LIVE_ROUND.id}', '${EDUCATOR_PROFILE_ID}', 'registered');

    -- A scheduled round whose exam is still a draft: the educator builds it
    INSERT INTO rounds (id, olympiad_id, name, opens_at, closes_at, state, exam_status)
      VALUES ('${DRAFT_ROUND.id}', '${OLYMPIAD.id}', '${DRAFT_ROUND.name}',
              '${hoursFromNow(48)}', '${hoursFromNow(50)}', 'scheduled', 'draft');
  `);
}

/** Every account the mock Supabase server must accept a login for. */
export const seededLogins = Object.values(USERS).map((u) => ({
    id: u.id,
    email: u.email,
    password: u.password,
}));
