// A PrismaClient opens its own connection pool, so the app should only
// ever have one instance alive, shared everywhere — not a new one per
// request or per file. Importing this module is what makes that happen:
// Node caches modules, so every `import { prisma } from "./prisma.js"`
// gets the exact same object.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
