// @ts-nocheck
jest.mock("../../../src/config/database", () => ({
  __esModule: true,
  default: require("../helpers/prismaMock").prisma,
}));

const { prisma, resetPrismaMock } = require("../helpers/prismaMock");
const svc = require("../../../src/services/organiserRemarkService");

beforeEach(resetPrismaMock);

describe("organiserRemarkService", () => {
  describe("listRemarks", () => {
    it("returns mapped remarks for the organiser's olympiads", async () => {
      prisma.remark_requests.findMany.mockResolvedValue([
        {
          id: "rem-1",
          result_id: "res-1",
          reason: "Unclear mark",
          status: "pending",
          reviewer_id: "user-edu-1",
          review_note: null,
          created_at: new Date("2026-09-25T10:00:00Z"),
          reviewed_at: null,
          results: {
            total_points: 45,
            entrants: {
              full_name: "Sarah Parker",
              schools: { name: "High School A" },
            },
            rounds: {
              id: "round-1",
              name: "Round 1",
              olympiad_id: "oly-1",
              olympiads: { id: "oly-1", name: "Math Olympiad" },
            },
          },
        },
      ]);

      prisma.educators.findMany.mockResolvedValue([
        {
          user_id: "user-edu-1",
          users: { full_name: "John Teacher", email: "john@school.com" },
          schools: { name: "High School B" },
        },
      ]);

      const result = await svc.listRemarks("org-1");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "rem-1",
        studentName: "Sarah Parker",
        schoolName: "High School A",
        roundName: "Round 1",
        olympiadName: "Math Olympiad",
        score: 45,
        reviewerId: "user-edu-1",
        reviewerName: "John Teacher",
        reviewerSchool: "High School B",
      });
    });

    it("applies unassigned status filter", async () => {
      prisma.remark_requests.findMany.mockResolvedValue([]);
      await svc.listRemarks("org-1", { status: "unassigned" });

      expect(prisma.remark_requests.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reviewer_id: null,
            status: "pending",
          }),
        }),
      );
    });
  });

  describe("listEligibleEducators", () => {
    it("lists educators from schools registered for the round's olympiad", async () => {
      prisma.rounds.findUnique.mockResolvedValue({
        id: "round-1",
        olympiad_id: "oly-1",
        olympiads: { organiser_id: "org-1" },
      });

      prisma.school_registrations.findMany.mockResolvedValue([
        { school_id: "school-1" },
      ]);

      prisma.educators.findMany.mockResolvedValue([
        {
          id: "edu-1",
          user_id: "user-1",
          school_id: "school-1",
          users: { full_name: "Mr Smith", email: "smith@test.com" },
          schools: { name: "Parktown" },
        },
      ]);

      prisma.remark_requests.groupBy.mockResolvedValue([
        { reviewer_id: "user-1", _count: { id: 2 } },
      ]);

      const educators = await svc.listEligibleEducators("org-1", "round-1");

      expect(educators).toEqual([
        {
          id: "edu-1",
          userId: "user-1",
          name: "Mr Smith",
          email: "smith@test.com",
          schoolId: "school-1",
          schoolName: "Parktown",
          pendingCount: 2,
        },
      ]);
    });

    it("throws ForbiddenError if round does not belong to organiser", async () => {
      prisma.rounds.findUnique.mockResolvedValue({
        id: "round-1",
        olympiad_id: "oly-1",
        olympiads: { organiser_id: "other-org" },
      });

      await expect(svc.listEligibleEducators("org-1", "round-1")).rejects.toMatchObject({
        statusCode: 403,
        message: "You do not own this round's olympiad",
      });
    });
  });

  describe("assignRemark", () => {
    it("assigns a remark to an eligible educator", async () => {
      prisma.remark_requests.findUnique.mockResolvedValue({
        id: "rem-1",
        status: "pending",
        results: {
          rounds: {
            olympiads: { id: "oly-1", organiser_id: "org-1" },
          },
        },
      });

      prisma.educators.findFirst.mockResolvedValue({
        id: "edu-1",
        user_id: "user-edu-1",
      });

      prisma.remark_requests.update.mockResolvedValue({
        id: "rem-1",
        reviewer_id: "user-edu-1",
      });

      const updated = await svc.assignRemark("org-1", "rem-1", "user-edu-1");

      expect(updated.reviewer_id).toBe("user-edu-1");
      expect(prisma.remark_requests.update).toHaveBeenCalledWith({
        where: { id: "rem-1" },
        data: { reviewer_id: "user-edu-1" },
      });
    });

    it("rejects assignment if remark was already reviewed", async () => {
      prisma.remark_requests.findUnique.mockResolvedValue({
        id: "rem-1",
        status: "reviewed",
        results: {
          rounds: {
            olympiads: { id: "oly-1", organiser_id: "org-1" },
          },
        },
      });

      await expect(svc.assignRemark("org-1", "rem-1", "user-edu-1")).rejects.toMatchObject({
        statusCode: 400,
        message: "Cannot reassign a remark that has already been reviewed",
      });
    });

    it("rejects assignment if educator is not part of the olympiad", async () => {
      prisma.remark_requests.findUnique.mockResolvedValue({
        id: "rem-1",
        status: "pending",
        results: {
          rounds: {
            olympiads: { id: "oly-1", organiser_id: "org-1" },
          },
        },
      });

      prisma.educators.findFirst.mockResolvedValue(null);

      await expect(svc.assignRemark("org-1", "rem-1", "unregistered-user")).rejects.toMatchObject({
        statusCode: 400,
        message: "The selected educator is not participating in this olympiad",
      });
    });
  });

  describe("autoAssignRemarks", () => {
    it("distributes unassigned remarks evenly across educators", async () => {
      prisma.rounds.findUnique.mockResolvedValue({
        id: "round-1",
        olympiad_id: "oly-1",
        olympiads: { organiser_id: "org-1" },
      });

      prisma.school_registrations.findMany.mockResolvedValue([
        { school_id: "school-1" },
      ]);

      prisma.educators.findMany.mockResolvedValue([
        {
          id: "edu-1",
          user_id: "user-1",
          school_id: "school-1",
          users: { full_name: "Teacher 1" },
          schools: { name: "School 1" },
        },
        {
          id: "edu-2",
          user_id: "user-2",
          school_id: "school-1",
          users: { full_name: "Teacher 2" },
          schools: { name: "School 1" },
        },
      ]);

      prisma.remark_requests.groupBy.mockResolvedValue([]);

      prisma.remark_requests.findMany.mockResolvedValue([
        { id: "rem-1" },
        { id: "rem-2" },
        { id: "rem-3" },
      ]);

      const result = await svc.autoAssignRemarks("org-1", "round-1");

      expect(result).toEqual({
        assignedCount: 3,
        educatorCount: 2,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("handles zero unassigned remarks cleanly", async () => {
      prisma.rounds.findUnique.mockResolvedValue({
        id: "round-1",
        olympiad_id: "oly-1",
        olympiads: { organiser_id: "org-1" },
      });

      prisma.school_registrations.findMany.mockResolvedValue([{ school_id: "school-1" }]);
      prisma.educators.findMany.mockResolvedValue([
        {
          id: "edu-1",
          user_id: "user-1",
          school_id: "school-1",
          users: { full_name: "Teacher 1" },
          schools: { name: "School 1" },
        },
      ]);
      prisma.remark_requests.groupBy.mockResolvedValue([]);
      prisma.remark_requests.findMany.mockResolvedValue([]);

      const result = await svc.autoAssignRemarks("org-1", "round-1");
      expect(result.assignedCount).toBe(0);
    });
  });
});
