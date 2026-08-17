import "dotenv/config";
import { Router } from "express";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const router = Router();

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL!,
});

const prisma = new PrismaClient({ adapter });

router.post("/", async (req, res) => {
  try {
    const { email, full_name, role } = req.body;

    const user = await prisma.users.create({
      data: {
        email,
        full_name,
        role,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

export default router;