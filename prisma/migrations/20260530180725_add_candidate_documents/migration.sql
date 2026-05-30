-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('OFFER_LETTER', 'EQUITY_GRANT', 'COMPENSATION_BREAKDOWN', 'TEAM_OVERVIEW', 'ROLE_DETAILS', 'RELOCATION', 'OTHER');

-- CreateTable
CREATE TABLE "CandidateDocument" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "boxFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "docType" "DocType" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateDocument_boxFileId_key" ON "CandidateDocument"("boxFileId");

-- AddForeignKey
ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
