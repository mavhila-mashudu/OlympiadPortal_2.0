// @ts-nocheck
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const errorHandler = require("./middlewares/errorHandler");
const { ForbiddenError } = require("./errors/AppError");
require("./config/env");
require("dotenv").config();

const app = express();

// Render (and most hosts) put one proxy in front of the app. Trusting that
// hop makes req.ip the real client address, which the rate limits key on;
// otherwise every user would share the proxy's single limit.
app.set("trust proxy", 1);

// Security
const configuredFrontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const allowedOrigins = new Set(
  process.env.NODE_ENV === "production"
    ? [configuredFrontendUrl]
    : [
      configuredFrontendUrl,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ],
);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // API clients such as Postman do not send Origin; browser clients must
      // match a known application origin.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new ForbiddenError("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    frontend_url: process.env.FRONTEND_URL || "NOT SET (fallback: localhost:5173)",
  });
});

app.get("/", (_req, res) => {
  res.json({ message: "Welcome to Olympiad Portal API 🏆" });
});

// ── Routes ──────────────────────────────────────────────
app.use("/auth", require("./routes/auth"));
app.use("/invites", require("./routes/invites"));
app.use("/notifications", require("./routes/portalNotifications"));
app.use("/educator", require("./routes/educator"));
app.use("/organiser/remarks", require("./routes/organiserRemarks"));

//registering olympiads and rounds routes
// Specific subpaths first
app.use("/olympiads", require("./routes/olympiads"));
app.use("/rounds", require("./routes/studentRounds"));
app.use("/rounds", require("./routes/studentExam"));
app.use("/rounds", require("./routes/questions"));
app.use("/rounds", require("./routes/examStatus"));
app.use("/rounds", require("./routes/submissions"));
app.use("/rounds", require("./routes/marking"));
app.use("/rounds", require("./routes/reviews"));
app.use("/rounds", require("./routes/standings"));
// Root parametrised last
app.use("/rounds", require("./routes/roundDetail"));
app.use("/papers", require("./routes/papers"));

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global error handler — must be last
app.use(errorHandler);

module.exports = app;
