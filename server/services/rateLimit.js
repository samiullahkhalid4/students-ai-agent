// A process-wide write budget is sufficient for this local, single-user app.
// Reads and progress polling do not consume the budget.
export function createWriteLimiter({ limit = 60, windowMs = 60000, now = Date.now } = {}) {
  let count = 0;
  let resetAt = now() + windowMs;
  return (req, res, next) => {
    if (req.method !== "POST") return next();
    const time = now();
    if (time >= resetAt) {
      count = 0;
      resetAt = time + windowMs;
    }
    if (++count > limit) {
      res.set("Retry-After", String(Math.ceil((resetAt - time) / 1000)));
      return res.status(429).json({
        error: "Too many requests. Please wait a minute and try again.",
        code: "RATE_LIMITED",
      });
    }
    next();
  };
}
