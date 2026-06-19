// src/middlewares/rateLimitMiddleware.mjs
// Simple in-memory rate limiter (use redis-based in production)

const requests = new Map();

/**
 * createRateLimit({ windowMs, max })
 * @param {number} windowMs - time window in ms
 * @param {number} max - max requests per window
 */
export function createRateLimit({ windowMs = 60_000, max = 20, message = "Too many requests, slow down." } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();

    if (!requests.has(key)) {
      requests.set(key, { count: 1, startTime: now });
      return next();
    }

    const data = requests.get(key);

    // reset window
    if (now - data.startTime > windowMs) {
      data.count = 1;
      data.startTime = now;
      return next();
    }

    data.count++;

    if (data.count > max) {
      return res.status(429).json({ message });
    }

    next();
  };
}

// Pre-built limiters
export const authLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: "Too many login attempts. Try again in 15 minutes.",
});

export const uploadLimiter = createRateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: "Upload rate limit exceeded. Max 10 uploads per minute.",
});

export const apiLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: "API rate limit exceeded.",
});
