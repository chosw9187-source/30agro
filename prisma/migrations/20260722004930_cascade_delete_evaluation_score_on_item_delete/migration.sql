-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvaluationScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationId" TEXT NOT NULL,
    "templateItemId" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "selfScore" INTEGER,
    "selfComment" TEXT,
    "grade" TEXT,
    "selfGrade" TEXT,
    CONSTRAINT "EvaluationScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvaluationScore_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "TemplateItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EvaluationScore" ("comment", "evaluationId", "grade", "id", "score", "selfComment", "selfGrade", "selfScore", "templateItemId") SELECT "comment", "evaluationId", "grade", "id", "score", "selfComment", "selfGrade", "selfScore", "templateItemId" FROM "EvaluationScore";
DROP TABLE "EvaluationScore";
ALTER TABLE "new_EvaluationScore" RENAME TO "EvaluationScore";
CREATE UNIQUE INDEX "EvaluationScore_evaluationId_templateItemId_key" ON "EvaluationScore"("evaluationId", "templateItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
