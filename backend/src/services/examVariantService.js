// @ts-nocheck
const crypto = require("node:crypto");
const prisma = require("../config/database").default;
const { recordRoundEvent } = require("./roundAuditService");

const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const factorial = (n) => {
  let result = 1n;
  for (let i = 2; i <= n; i++) result *= BigInt(i);
  return result;
};

const countPossibleLayouts = (questions) => {
  let count = factorial(questions.length);
  for (const question of questions) {
    if (Array.isArray(question.options)) count *= factorial(question.options.length);
  }
  return count;
};

const makeLayout = (questions) => {
  const questionOrder = shuffle(questions.map((question) => question.id));
  const optionOrders = {};
  for (const question of questions) {
    const optionCount = Array.isArray(question.options) ? question.options.length : 0;
    optionOrders[question.id] = shuffle(Array.from({ length: optionCount }, (_, i) => i));
  }
  const signature = JSON.stringify({ questionOrder, optionOrders });
  const variantHash = crypto.createHash("sha256").update(signature).digest("hex");
  return { questionOrder, optionOrders, variantHash };
};

const getAssignment = async (roundId, entrantId, questions) => {
  const where = { round_id_entrant_id: { round_id: roundId, entrant_id: entrantId } };
  const existing = await prisma.exam_assignments.findUnique({ where });
  if (existing) return existing;

  const possibleLayouts = countPossibleLayouts(questions);
  const existingCount = await prisma.exam_assignments.count({ where: { round_id: roundId } });
  const variantsRemain = BigInt(existingCount) < possibleLayouts;

  // Reject duplicate layouts while a distinct layout is available. Once all
  // possible permutations are assigned, repeats are unavoidable and allowed.
  for (let attempt = 0; attempt < (variantsRemain ? 128 : 1); attempt++) {
    const layout = makeLayout(questions);
    if (variantsRemain) {
      const duplicate = await prisma.exam_assignments.findUnique({
        where: { round_id_variant_hash: { round_id: roundId, variant_hash: layout.variantHash } },
        select: { id: true },
      });
      if (duplicate) continue;
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const assignment = await tx.exam_assignments.create({
          data: {
            round_id: roundId,
            entrant_id: entrantId,
            question_order: layout.questionOrder,
            option_orders: layout.optionOrders,
            // NULL is intentionally non-unique after the finite layout space
            // is exhausted, allowing later entrants to receive a valid repeat.
            variant_hash: variantsRemain ? layout.variantHash : null,
          },
        });
        await recordRoundEvent(
          roundId,
          "exam_variant_assigned",
          "automatic",
          `exam-variant:${assignment.id}`,
          { entrant_id: entrantId, variant_hash: assignment.variant_hash },
          tx,
        );
        return assignment;
      });
    } catch (error) {
      if (error.code !== "P2002") throw error;
      const racedAssignment = await prisma.exam_assignments.findUnique({ where });
      if (racedAssignment) return racedAssignment;
      // Another entrant took this layout between the check and insert.
    }
  }

  // Extremely unlikely after 128 random attempts unless the layout space is
  // almost full. Try one final repeat rather than preventing an exam start.
  const layout = makeLayout(questions);
  try {
    return await prisma.$transaction(async (tx) => {
      const assignment = await tx.exam_assignments.create({
        data: {
          round_id: roundId,
          entrant_id: entrantId,
          question_order: layout.questionOrder,
          option_orders: layout.optionOrders,
          variant_hash: null,
        },
      });
      await recordRoundEvent(
        roundId,
        "exam_variant_assigned",
        "automatic",
        `exam-variant:${assignment.id}`,
        { entrant_id: entrantId, variant_hash: null },
        tx,
      );
      return assignment;
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const racedAssignment = await prisma.exam_assignments.findUnique({ where });
    if (racedAssignment) return racedAssignment;
    throw error;
  }
};

const optionOrderFor = (assignment, questionId) => {
  const orders = assignment?.option_orders;
  return orders && Array.isArray(orders[questionId]) ? orders[questionId] : [];
};

// The browser stores the displayed choice indexes. Translate those indexes
// back to the canonical indexes used by the shared answer key.
const canonicalizeAnswer = (answerValue, assignment, questionId) => {
  if (answerValue == null || !assignment) return answerValue;
  const order = optionOrderFor(assignment, questionId);
  if (!order.length) return answerValue;
  const mapped = String(answerValue)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((value) => {
      const displayIndex = Number(value);
      if (!Number.isInteger(displayIndex) || displayIndex < 0 || displayIndex >= order.length) {
        return null;
      }
      return String(order[displayIndex]);
    });
  if (mapped.some((value) => value === null)) return answerValue;
  return mapped.join(",");
};

module.exports = { getAssignment, optionOrderFor, canonicalizeAnswer };
