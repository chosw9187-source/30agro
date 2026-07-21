-- AlterTable
ALTER TABLE "EvaluationScore" ADD COLUMN "grade" TEXT;
ALTER TABLE "EvaluationScore" ADD COLUMN "selfGrade" TEXT;

-- AlterTable
ALTER TABLE "TemplateItem" ADD COLUMN "currentLevel" TEXT;
ALTER TABLE "TemplateItem" ADD COLUMN "gradeCriteria" TEXT;
ALTER TABLE "TemplateItem" ADD COLUMN "kpiFormula" TEXT;
ALTER TABLE "TemplateItem" ADD COLUMN "targetLevel" TEXT;
ALTER TABLE "TemplateItem" ADD COLUMN "weight" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvaluationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'COMPETENCY',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EvaluationTemplate" ("createdAt", "createdById", "description", "id", "title") SELECT "createdAt", "createdById", "description", "id", "title" FROM "EvaluationTemplate";
DROP TABLE "EvaluationTemplate";
ALTER TABLE "new_EvaluationTemplate" RENAME TO "EvaluationTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
