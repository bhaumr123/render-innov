// Module 5: auth. Three ideas, same as any real backend:
//
// 1. Never store a password — store a hash of it (bcrypt), so a database
//    leak doesn't hand out anyone's actual password.
// 2. A JWT ("JSON Web Token") is a signed, tamper-proof blob the server
//    hands the client after login. The client sends it back on every
//    request (as an Authorization header); the server verifies the
//    signature instead of looking the session up in a database — that's
//    the whole appeal, at the cost of not being able to revoke one early
//    without extra machinery we don't need yet.
// 3. The signing secret (JWT_SECRET) is exactly as sensitive as the
//    Anthropic API key — anyone who has it can forge a valid login for any
//    user — so it follows the identical pattern: read from process.env,
//    fail loudly and early if it's missing, never logged.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;
const TOKEN_TTL = "7d";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Add any long random string to backend/.env " +
        "as JWT_SECRET=... (see .env.example)."
    );
  }
  return secret;
}

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign({ email: user.email }, getSecret(), {
    subject: user.id,
    expiresIn: TOKEN_TTL,
  });
}

// Express middleware: reads "Authorization: Bearer <token>", verifies it,
// and attaches { id, email } to req.user. Any route that needs a logged-in
// user puts this in front of it.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}
