import express from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword, signToken, requireAuth } from "../lib/auth.js";

export const authRouter = express.Router();

function validateCredentials(body) {
  const { email, password } = body || {};
  if (typeof email !== "string" || !email.includes("@")) {
    return "A valid email is required.";
  }
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

// POST /api/auth/signup { email, password }
authRouter.post("/signup", async (req, res) => {
  const validationError = validateCredentials(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { email, password } = req.body;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash } });

  res.status(201).json({ token: signToken(user), user: { id: user.id, email: user.email } });
});

// POST /api/auth/login { email, password }
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same error for "no such user" and "wrong password" on purpose — a
  // different message for each would let an attacker enumerate which
  // emails have accounts.
  const invalid = { error: "Invalid email or password." };
  if (!user) return res.status(401).json(invalid);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json(invalid);

  res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
});

// GET /api/auth/me — lets a client that only has a stored token find out
// whether it's still valid, and who it belongs to, without guessing.
// This is what makes "stay logged in across a page reload" honest instead
// of just assuming a token in localStorage still works.
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
