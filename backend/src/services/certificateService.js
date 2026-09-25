const prisma = require("../config/database").default;
const { NotFoundError, ForbiddenError } = require("../errors/AppError");

function pdfEscape(value) {
  return String(value).normalize("NFKD").replace(/[^\x20-\x7e]/g, " ").replace(/[\\()]/g, "\\$&").slice(0, 100);
}
function buildPdf(lines) {
  const stream = lines.map(({ text, size, y }) => `BT /F1 ${size} Tf 72 ${y} Td (${pdfEscape(text)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}
async function certificateForStudent(roundId, userId) {
  const entrant = await prisma.entrants.findUnique({ where: { user_id: userId }, include: { schools: true } });
  if (!entrant) throw new ForbiddenError("Student account required");
  const round = await prisma.rounds.findUnique({ where: { id: roundId }, include: { olympiads: true } });
  if (!round || round.state !== "results_released") throw new NotFoundError("Released round not found");
  const result = await prisma.results.findUnique({
    where: { round_id_entrant_id: { round_id: roundId, entrant_id: entrant.id } },
  });
  if (!result?.qualified || !result.finalised_at) throw new ForbiddenError("Certificate not earned for this round");
  return buildPdf([
    { text: "CERTIFICATE OF ACHIEVEMENT", size: 26, y: 670 },
    { text: "Awarded to", size: 16, y: 575 },
    { text: entrant.full_name, size: 23, y: 530 },
    { text: `For qualifying in ${round.name}`, size: 17, y: 470 },
    { text: round.olympiads.name, size: 17, y: 438 },
    { text: `School: ${entrant.schools.name}`, size: 12, y: 380 },
    { text: `Score: ${result.total_points} points`, size: 12, y: 355 },
    { text: `Issued: ${result.finalised_at.toISOString().slice(0, 10)}`, size: 12, y: 330 },
    { text: `Verification: ${result.id}`, size: 9, y: 95 },
  ]);
}
module.exports = { certificateForStudent, buildPdf };
