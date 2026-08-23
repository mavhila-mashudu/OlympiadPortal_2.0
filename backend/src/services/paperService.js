// @ts-nocheck
const prisma = require("../config/database").default;
const supabase = require("../config/supabase");
const { getRound } = require("./roundService");
const { assertOwnsOlympiad } = require("./olympiadService");
const { NotFoundError, BadRequestError } = require("../errors/AppError");

const BUCKET = "papers";

const uploadRoundPapers = async ({ roundId, organiserId, paperFile, memoFile }) => {
  if (!supabase) {
    throw new BadRequestError("File storage is not configured on this server");
  }

  const round = await getRound(roundId, organiserId);

  if (!paperFile && !memoFile) {
    throw new BadRequestError("At least one of paper or memo file is required");
  }

  const data = {};

  if (paperFile) {
    const path = `rounds/${roundId}/paper-${Date.now()}-${paperFile.originalname}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, paperFile.buffer, { contentType: paperFile.mimetype, upsert: true });
    if (error) throw new BadRequestError(`Paper upload failed: ${error.message}`);
    data.file_url = path;
  }

  if (memoFile) {
    const path = `rounds/${roundId}/memo-${Date.now()}-${memoFile.originalname}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, memoFile.buffer, { contentType: memoFile.mimetype, upsert: true });
    if (error) throw new BadRequestError(`Memo upload failed: ${error.message}`);
    data.memo_file_url = path;
  }

  const existing = await prisma.papers.findFirst({ where: { round_id: roundId } });

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

  if (error) throw new BadRequestError(`Could not generate download link: ${error.message}`);

  return data.signedUrl;
};

const listArchive = async (olympiadId, organiserId) => {
  await assertOwnsOlympiad(olympiadId, organiserId);

  const rounds = await prisma.rounds.findMany({
    where: { olympiad_id: olympiadId, state: "closed" },
    orderBy: { closes_at: "desc" },
    include: { papers: true },
  });

  return rounds;
};

module.exports = { uploadRoundPapers, getDownloadUrl, listArchive };