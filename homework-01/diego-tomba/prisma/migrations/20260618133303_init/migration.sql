-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "watched_repos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'github',
    "scheduleCron" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "prompts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "reports" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "eventsProcessed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskType" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "repo_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "watched_repos_owner_name_platform_key" ON "watched_repos"("owner", "name", "platform");

-- CreateIndex
CREATE INDEX "reports_repoOwner_repoName_idx" ON "reports"("repoOwner", "repoName");

-- CreateIndex
CREATE INDEX "reports_generatedAt_idx" ON "reports"("generatedAt");

-- CreateIndex
CREATE INDEX "runs_taskType_idx" ON "runs"("taskType");

-- CreateIndex
CREATE INDEX "runs_createdAt_idx" ON "runs"("createdAt");

-- CreateIndex
CREATE INDEX "repo_events_fetchedAt_idx" ON "repo_events"("fetchedAt");

-- CreateIndex
CREATE INDEX "repo_events_repoOwner_repoName_idx" ON "repo_events"("repoOwner", "repoName");

-- CreateIndex
CREATE UNIQUE INDEX "repo_events_repoOwner_repoName_platform_eventType_externalId_key" ON "repo_events"("repoOwner", "repoName", "platform", "eventType", "externalId");
