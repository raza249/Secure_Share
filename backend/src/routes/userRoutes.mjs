import { Router } from "express";
import { User } from "../mongoose/schemas/user.mjs";
import { authMiddleware } from "../middlewares/authMiddleware.mjs";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const users = await User.find(
      { _id: { $ne: req.user.id } },
      "username email"
    );

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;