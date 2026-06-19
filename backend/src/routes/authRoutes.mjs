import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../mongoose/schemas/user.mjs";
import { hashPassword, comparePassword } from "../utils/password.mjs";
import { authLimiter } from "../middlewares/rateLimitMiddleware.mjs";

const router = Router();

// ── Signup ───────────────────────────────────────────────────
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ message: "All fields required." });

    if (typeof username !== "string" || username.trim().length < 2)
      return res.status(400).json({ message: "Username must be at least 2 characters." });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: "Invalid email address." });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "Email already in use." });

    const hashed = hashPassword(password);
    const user = new User({ username: username.trim(), email: email.toLowerCase(), password: hashed });
    await user.save();

    return res.status(201).json({ message: "Account created successfully." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Login ────────────────────────────────────────────────────
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid credentials." }); // don't reveal user existence

    const valid = comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials." });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    return res.status(500).json({ message: "Login failed." });
  }
});

// ── Me (get current user) ────────────────────────────────────
import { authMiddleware } from "../middlewares/authMiddleware.mjs";

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;