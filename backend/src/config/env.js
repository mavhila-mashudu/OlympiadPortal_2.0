// @ts-nocheck
require("dotenv").config();

const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "REFRESH_SECRET",
  "ORGANISER_SECRET",
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("Missing required environment variables:");
  missing.forEach((key) => console.error(`   - ${key}`));
  process.exit(1);
}

module.exports = {
  app: {
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || "development",
    isProd: process.env.NODE_ENV === "production",
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: process.env.JWT_EXPIRY || "15m",
    refreshSecret: process.env.REFRESH_SECRET,
    refreshExpiry: process.env.REFRESH_EXPIRY || "30d",
    organiserSecret: process.env.ORGANISER_SECRET,
  },
  frontend: {
    url: process.env.FRONTEND_URL || "http://localhost:5173",
  },
};
