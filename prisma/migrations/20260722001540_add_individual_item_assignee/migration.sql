-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SCORE',
    "maxScore" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL DEFAULT 0,
    "teamId" TEXT,
    "assigneeId" TEXT,
    "weight" REAL,
    "currentLevel" TEXT,
    "targetLevel" TEXT,
    "kpiFormula" TEXT,
    "gradeCriteria" TEXT,
    CONSTRAINT "TemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TemplateItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TemplateItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TemplateItem" ("category", "currentLevel", "description", "gradeCriteria", "id", "kpiFormula", "label", "maxScore", "order", "targetLevel", "teamId", "templateId", "type", "weight") SELECT "category", "currentLevel", "description", "gradeCriteria", "id", "kpiFormula", "label", "maxScore", "order", "targetLevel", "teamId", "templateId", "type", "weight" FROM "TemplateItem";
DROP TABLE "TemplateItem";
ALTER TABLE "new_TemplateItem" RENAME TO "TemplateItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
