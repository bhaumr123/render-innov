-- CreateTable
CREATE TABLE "KnownIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedInRun" TEXT
);

-- CreateTable
CREATE TABLE "ImprovementRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "issueIds" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "proposalSummary" TEXT,
    "featureRequestId" TEXT,
    "errorMessage" TEXT
);
