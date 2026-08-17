import cors from "cors";
import express from "express";
import studentRoutes from "./routes/studentRoundsDetailsRoutes.js";

const app = express();
const PORT = process.env["PORT"] || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/students", studentRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
