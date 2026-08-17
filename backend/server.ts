import express from "express";
import cors from "cors";
import olympiadRoutes from "./routes/olympiads";
import usersRoutes from "./routes/users";
import studentRoutes from "./routes/studentRoundsDetailsRoutes.js";

const app = express();

const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api/olympiads", olympiadRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/students", studentRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
})
