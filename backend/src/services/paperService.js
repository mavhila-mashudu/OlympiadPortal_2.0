// @ts-nocheck
const prisma = require("../config/database").default;
const crypto = require("node:crypto");
const supabase = require("../config/supabase");
const { getRound } = require("./roundService");
const { assertOwnsOlympiad } = require("./olympiadService");
const { assertRoundAccess } = require("./questionService");
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} = require("../errors/AppError");

const BUCKET = "papers";
// The same PDF gets one object path, regardless of the olympiad or filename.
// Already uploaded round paths remain valid for older papers.
const sharedPaperPath = (file) => `shared/${crypto.createHash("sha256").update(file.buffer).digest("hex")}`;

const uploadRoundPapers = async ({
  roundId,
  organiserId,
  paperFile,
  memoFile,
}) => {
  if (!supabase) {
    throw new BadRequestError("File storage is not configured on this server");
  }

  const round = await getRound(roundId, organiserId);

  if (!paperFile && !memoFile) {
    throw new BadRequestError("At least one of paper or memo file is required");
  }

  const data = {};

  if (paperFile) {
    const path = sharedPaperPath(paperFile);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, paperFile.buffer, {
        contentType: paperFile.mimetype,
        upsert: true,
      });
    if (error)
      throw new BadRequestError(`Paper upload failed: ${error.message}`);
    data.file_url = path;
  }

  if (memoFile) {
    const path = sharedPaperPath(memoFile);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, memoFile.buffer, {
        contentType: memoFile.mimetype,
        upsert: true,
      });
    if (error)
      throw new BadRequestError(`Memo upload failed: ${error.message}`);
    data.memo_file_url = path;
  }

  const existing = await prisma.papers.findFirst({
    where: { round_id: roundId },
  });

  const paper = existing
    ? await prisma.papers.update({ where: { id: existing.id }, data })
    : await prisma.papers.create({
        data: { round_id: roundId, title: round.name, ...data },
      });

  return paper;
};

const getDownloadUrl = async (paperId, organiserId, type) => {
  if (!supabase) {
    throw new BadRequestError("File storage is not configured on this server");
  }

  const paper = await prisma.papers.findUnique({
    where: { id: paperId },
    include: { rounds: { include: { olympiads: true } } },
  });

  if (!paper || paper.rounds.olympiads.organiser_id !== organiserId) {
    throw new NotFoundError("Paper not found");
  }

  const path = type === "memo" ? paper.memo_file_url : paper.file_url;
  if (!path) throw new NotFoundError(`No ${type} uploaded for this round`);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60);

  if (error)
    throw new BadRequestError(
      `Could not generate download link: ${error.message}`,
    );

  return data.signedUrl;
};

// ─────────────────────────────────────────
// SIGNED VIEW URL FOR A ROUND'S PAPER / MEMO
//
// Educators get the question paper (to reference
// while digitizing it in the exam builder); the
// memo stays organiser-only — it backs the
// organiser's verification (two-person integrity).
// Used by the side-by-side PDF viewers.
// ─────────────────────────────────────────
const getRoundViewUrl = async (roundId, userId, role, type) => {
  if (!supabase) {
    throw new BadRequestError("File storage is not configured on this server");
  }

  if (type === "memo" && role !== "organiser") {
    throw new ForbiddenError("Only the organiser can view the memo");
  }

  // Organiser ownership / educator school registration
  await assertRoundAccess(roundId, userId, role);

  const paper = await prisma.papers.findFirst({
    where: { round_id: roundId },
  });
  if (!paper) throw new NotFoundError("No paper uploaded for this round");

  const path = type === "memo" ? paper.memo_file_url : paper.file_url;
  if (!path) throw new NotFoundError(`No ${type} uploaded for this round`);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    throw new BadRequestError(`Could not generate view link: ${error.message}`);
  }

  return data.signedUrl;
};

const listArchive = async (olympiadId, organiserId) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const rounds = await prisma.rounds.findMany({
    where: {
      olympiad_id: olympiadId,
      state: "results_released",
      papers: { some: { is_archived: true } },
    },
    orderBy: { closes_at: "desc" },
    include: { papers: true },
  });

  return rounds;
};

// A single catalogue across competitions owned by this organiser.
const listSharedArchive = async (organiserId) => prisma.rounds.findMany({
  where: {
    olympiads: { organiser_id: organiserId },
    state: "results_released",
    papers: { some: { is_archived: true } },
  },
  orderBy: { closes_at: "desc" },
  include: { papers: true, olympiads: { select: { id: true, name: true } } },
});

module.exports = {
  uploadRoundPapers,
  getDownloadUrl,
  getRoundViewUrl,
  listArchive,
  listSharedArchive,
};
