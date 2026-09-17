// An integration test: real HTTP requests (via supertest) against the real
// Express app and a real (but throwaway) SQLite database — not mocks. The
// one thing to get right is making sure this never touches prisma/dev.db,
// the database you actually use while developing.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const TEST_DB_PATH = path.join(BACKEND_DIR, "prisma", "test.db");

// These have to be set BEFORE anything imports lib/prisma.js (which reads
// DATABASE_URL when the PrismaClient is constructed) or lib/auth.js (which
// reads JWT_SECRET). That's why the app import below is a dynamic import,
// done inside beforeAll, after these are set — a static top-of-file
// `import { app }` would run before this code does and pick up whatever
// was already in process.env.
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = "test-only-secret-do-not-use-in-real-life";

let app;
let request;

beforeAll(async () => {
  fs.rmSync(TEST_DB_PATH, { force: true });
  execSync("npx prisma migrate deploy", {
    cwd: BACKEND_DIR,
    env: process.env,
    stdio: "pipe",
  });

  ({ app } = await import("../src/app.js"));
  ({ default: request } = await import("supertest"));
});

afterAll(() => {
  fs.rmSync(TEST_DB_PATH, { force: true });
  fs.rmSync(`${TEST_DB_PATH}-journal`, { force: true });
});

function uniqueEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe("auth", () => {
  it("signs up, then can log in with the same credentials", async () => {
    const email = uniqueEmail();
    const password = "a-real-password";

    const signup = await request(app).post("/api/auth/signup").send({ email, password });
    expect(signup.status).toBe(201);
    expect(signup.body.token).toBeTypeOf("string");
    expect(signup.body.user.email).toBe(email);

    const login = await request(app).post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTypeOf("string");
  });

  it("rejects a duplicate signup", async () => {
    const email = uniqueEmail();
    const password = "a-real-password";
    await request(app).post("/api/auth/signup").send({ email, password });

    const again = await request(app).post("/api/auth/signup").send({ email, password });
    expect(again.status).toBe(409);
  });

  it("rejects a wrong password with the same message as a nonexistent user", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/signup").send({ email, password: "correct-password" });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrong-password" });
    const noSuchUser = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail(), password: "irrelevant" });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe(noSuchUser.body.error);
  });

  it("rejects a short password on signup", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: uniqueEmail(), password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("requireAuth (via a protected route)", () => {
  it("401s with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("401s with a garbage token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("200s and returns the right user for a real token", async () => {
    const email = uniqueEmail();
    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "a-real-password" });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${signup.body.token}`);

    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });
});
