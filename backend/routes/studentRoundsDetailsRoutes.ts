import { Router } from "express";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getStudentRounds } from "../services/studentRoundsDetailsService.js";

const router = Router();

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL!,
});

const prisma = new PrismaClient({ adapter });


router.get("/:userId/rounds", async (req, res) => {
  try {
    const { userId } = req.params;

    const rounds = await getStudentRounds(userId);

    res.json(rounds);
  } catch (error) {
    console.error("Error fetching student rounds:", error);
    res.status(500).json({ error: "Failed to fetch student rounds" });
  }
});

export default router;
