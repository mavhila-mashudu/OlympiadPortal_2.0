import { Router } from "express";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const router = Router();

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL!,
});

const prisma = new PrismaClient({ adapter });

router.get("/", async (req, res) => {
  try {
    const olympiads = await prisma.olympiads.findMany();

    res.json(olympiads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch olympiads" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, organiser_id } = req.body;

    const olympiad = await prisma.olympiads.create({
      data: {
        name,
        organiser_id,
      },
    });

    res.status(201).json(olympiad);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create olympiad" });
  }
});

export default router;