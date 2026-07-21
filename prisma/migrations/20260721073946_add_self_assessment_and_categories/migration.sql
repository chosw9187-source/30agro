-- AlterTable
ALTER TABLE "EvaluationScore" ADD COLUMN "selfComment" TEXT;
ALTER TABLE "EvaluationScore" ADD COLUMN "selfScore" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Evaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" DATETIME,
    "selfStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "selfSubmittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evaluation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "EvaluationCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Evaluation_evaluateeId_fkey" FOREIGN KEY ("evaluateeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Evaluation" ("createdAt", "cycleId", "evaluateeId", "evaluatorId", "id", "status", "submittedAt") SELECT "createdAt", "cycleId", "evaluateeId", "evaluatorId", "id", "status", "submittedAt" FROM "Evaluation";
DROP TABLE "Evaluation";
ALTER TABLE "new_Evaluation" RENAME TO "Evaluation";
CREATE UNIQUE INDEX "Evaluation_cycleId_evaluatorId_evaluateeId_key" ON "Evaluation"("cycleId", "evaluatorId", "evaluateeId");
CREATE TABLE "new_TemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SCORE',
    "maxScore" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TemplateItem" ("id", "label", "maxScore", "order", "templateId", "type") SELECT "id", "label", "maxScore", "order", "templateId", "type" FROM "TemplateItem";
DROP TABLE "TemplateItem";
ALTER TABLE "new_TemplateItem" RENAME TO "TemplateItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
