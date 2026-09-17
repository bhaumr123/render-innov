// Same pattern as auth.test.js — a real integration test against a real
// (throwaway) database, via supertest. Uses its own test-streams.db file
// rather than sharing auth.test.js's test.db: Vitest runs test files in
// parallel by default, and two test files racing to reset/migrate/delete
// the same SQLite file would be exactly the kind of flaky test this
// project has tried hard to avoid elsewhere.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const TEST_DB_PATH = path.join(BACKEND_DIR, "prisma", "test-streams.db");
const CUSTOM_ROOT = path.resolve(BACKEND_DIR, "..", "custom");

process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = "test-only-secret-do-not-use-in-real-life";

let app;
let request;
let token;

function uniqueSlug() {
  return `test-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeAll(async () => {
  fs.rmSync(TEST_DB_PATH, { force: true });
  execSync("npx prisma migrate deploy", {
    cwd: BACKEND_DIR,
    env: process.env,
    stdio: "pipe",
  });

  ({ app } = await import("../src/app.js"));
  ({ default: request } = await import("supertest"));

  const signup = await request(app)
    .post("/api/auth/signup")
    .send({ email: `streams-${Date.now()}@example.com`, password: "a-real-password" });
  token = signup.body.token;
});

afterAll(() => {
  fs.rmSync(TEST_DB_PATH, { force: true });
  fs.rmSync(`${TEST_DB_PATH}-journal`, { force: true });
  // Registering a stream creates a real directory outside the database —
  // clean up whatever this run created so repeated test runs don't leave
  // debris behind in featureforge/custom/.
  for (const entry of fs.readdirSync(CUSTOM_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("test-stream-")) {
      fs.rmSync(path.join(CUSTOM_ROOT, entry.name), { recursive: true, force: true });
    }
  }
});

describe("POST /api/features/streams", () => {
  it("requires auth", async () => {
    const res = await request(app)
      .post("/api/features/streams")
      .send({ slug: uniqueSlug(), label: "x", description: "x", systemPrompt: "x" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid slug", async () => {
    const res = await request(app)
      .post("/api/features/streams")
      .set("Authorization", `Bearer ${token}`)
      .send({ slug: "Not Valid!", label: "x", description: "x", systemPrompt: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects a slug that collides with a built-in stream", async () => {
    const res = await request(app)
      .post("/api/features/streams")
      .set("Authorization", `Bearer ${token}`)
      .send({ slug: "k8s", label: "x", description: "x", systemPrompt: "x" });
    expect(res.status).toBe(400);
  });

  it("registers a stream, makes its directory, and it shows up in the list", async () => {
    const slug = uniqueSlug();
    const create = await request(app)
      .post("/api/features/streams")
      .set("Authorization", `Bearer ${token}`)
      .send({ slug, label: "Test Stream", description: "A test.", systemPrompt: "Write test files." });

    expect(create.status).toBe(201);
    expect(create.body.stream).toMatchObject({ id: slug, custom: true });
    expect(fs.existsSync(path.join(CUSTOM_ROOT, slug, "README.md"))).toBe(true);

    const list = await request(app).get("/api/features/streams").set("Authorization", `Bearer ${token}`);
    expect(list.body.streams.some((s) => s.id === slug)).toBe(true);
  });

  it("rejects registering the same slug twice", async () => {
    const slug = uniqueSlug();
    await request(app)
      .post("/api/features/streams")
      .set("Authorization", `Bearer ${token}`)
      .send({ slug, label: "x", description: "x", systemPrompt: "x" });

    const again = await request(app)
      .post("/api/features/streams")
      .set("Authorization", `Bearer ${token}`)
      .send({ slug, label: "x", description: "x", systemPrompt: "x" });

    expect(again.status).toBe(400);
  });
});
