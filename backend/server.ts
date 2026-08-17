import express from "express";
import olympiadRoutes from "./routes/olympiads";
import usersRoutes from "./routes/users";

const app = express();
const PORT = 3000;

app.use(express.json());

app.use("/api/olympiads", olympiadRoutes);
app.use("/api/users", usersRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});