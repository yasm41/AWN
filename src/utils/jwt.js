const jwt = require("jsonwebtoken");

/**
 * Sign a short-lived access token (default 15m)
 */
const signAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
};

/**
 * Sign a long-lived refresh token (default 7d)
 */
const signRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
};

/**
 * Verify an access token — returns decoded payload or throws
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

/**
 * Verify a refresh token — returns decoded payload or throws
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

/**
 * Returns the expiry Date object for a refresh token
 * so we can store it in MongoDB for cleanup.
 */
const refreshTokenExpiresAt = () => {
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_IN || "7", 10);
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  refreshTokenExpiresAt,
};
