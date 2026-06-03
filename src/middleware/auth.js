const { verifyAccessToken } = require("../utils/jwt");
const { error } = require("../utils/response");
const User = require("../models/User");

/**
 * Protect middleware
 * Extracts and verifies the Bearer access token.
 * Attaches the full user document to req.user.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return error(res, "Access token required", 401);
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return error(res, "Access token expired", 401);
      }
      return error(res, "Invalid access token", 401);
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return error(res, "User no longer exists", 401);
    }

    if (!user.isActive) {
      return error(res, "Account has been deactivated", 403);
    }

    req.user = user;
    next();
  } catch (err) {
    return error(res, "Authentication failed", 500);
  }
};

module.exports = { protect };
