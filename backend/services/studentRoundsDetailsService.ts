import { Router } from "express";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const router = Router();

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL!,
});

const prisma = new PrismaClient({ adapter });

export interface StudentRound {
  roundName: string;
  opensAt: string;
  closesAt: string;
  totalPoints: number | null;
  roundStatus: string;
}


export async function getStudentRounds(userId: string): Promise<StudentRound[]> {
  const entrant = await prisma.entrants.findFirst({
    where: { user_id: userId },
    select: { id: true },
  });

  if (!entrant) {
    return [];
  }

  const registrations = await prisma.entrant_registrations.findMany({
    where: { entrant_id: entrant.id },
    select: {
      rounds: {
        select: {
          id: true,
          name: true,
          opens_at: true,
          closes_at: true,
          state: true,
        },
      },
    },
  });

  const results = await prisma.results.findMany({
    where: { entrant_id: entrant.id },
    select: {
      round_id: true,
      total_points: true,
    },
  });

  const resultsByRound = new Map(
    results.map((r) => [r.round_id, r.total_points])
  );

  return registrations.map((reg) => {
    const round = reg.rounds;
    const points = resultsByRound.get(round.id);

    return {
      roundName: round.name,
      opensAt: round.opens_at.toISOString(),
      closesAt: round.closes_at.toISOString(),
      totalPoints: points !== undefined ? Number(points) : null,
      roundStatus: round.state.toString(),
    };
  });
}
