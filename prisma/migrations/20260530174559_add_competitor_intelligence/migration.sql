-- CreateTable
CREATE TABLE "CompetitorIntelligence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "competitors" JSONB,
    "salaryBenchmarks" JSONB,
    "benefitsComparison" JSONB,
    "jobPostings" JSONB,
    "glassdoorData" JSONB,
    "linkedinInsights" JSONB,
    "positioningAdvice" JSONB,
    "sources" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorIntelligence_candidateId_key" ON "CompetitorIntelligence"("candidateId");

-- AddForeignKey
ALTER TABLE "CompetitorIntelligence" ADD CONSTRAINT "CompetitorIntelligence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
