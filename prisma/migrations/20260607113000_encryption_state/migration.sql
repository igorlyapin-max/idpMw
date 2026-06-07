CREATE TABLE "EncryptionState" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "activeKeyId" TEXT NOT NULL,
  "previousKeyIds" TEXT NOT NULL DEFAULT '[]',
  "rotationStatus" TEXT NOT NULL DEFAULT 'completed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EncryptionState_pkey" PRIMARY KEY ("id")
);
