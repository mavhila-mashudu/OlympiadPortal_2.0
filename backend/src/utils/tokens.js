// @ts-nocheck
const jwt = require("jsonwebtoken");
const config = require("../config/env");

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.educators?.school_id || user.entrants?.school_id || null,
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiry },
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign({ userId: user.id }, config.auth.refreshSecret, {
    expiresIn: config.auth.refreshExpiry,
  });
};

const getRefreshTokenExpiry = () => {
  const days = 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  setRefreshTokenCookie,
};
