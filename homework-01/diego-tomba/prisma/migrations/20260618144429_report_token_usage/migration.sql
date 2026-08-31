-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_reports" ("costUsd", "eventsProcessed", "generatedAt", "id", "markdown", "repoName", "repoOwner") SELECT "costUsd", "eventsProcessed", "generatedAt", "id", "markdown", "repoName", "repoOwner" FROM "reports";
DROP TABLE "reports";
ALTER TABLE "new_reports" RENAME TO "reports";
CREATE INDEX "reports_repoOwner_repoName_idx" ON "reports"("repoOwner", "repoName");
CREATE INDEX "reports_generatedAt_idx" ON "reports"("generatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
