// @ts-nocheck
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const errorHandler = require("./middlewares/errorHandler");
require("./config/env");
require("dotenv").config();

const app = express();

// Security
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true, // allows cookies to be sent cross-origin
  }),
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // reads refresh token cookie on every request

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/", (_req, res) => {
  res.json({ message: "Welcome to Olympiad Portal API 🏆" });
});

// ── Routes ──────────────────────────────────────────────
app.use("/auth", require("./routes/auth"));

//registering olympiads and rounds routes
app.use("/olympiads", require("./routes/olympiads"));
app.use("/rounds", require("./routes/roundDetail"));
app.use("/rounds", require("./routes/questions"));
app.use("/rounds", require("./routes/submissions"));
app.use("/rounds", require("./routes/marking"));
app.use("/papers", require("./routes/papers"));
// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
