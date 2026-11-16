-- CreateTable
CREATE TABLE "CryptoPaymentIntent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "amountBaseUnits" INTEGER NOT NULL,
    "mint" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'usdc',
    "providerRef" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoPaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPaymentIntent_memo_key" ON "CryptoPaymentIntent"("memo");

-- CreateIndex
CREATE INDEX "CryptoPaymentIntent_workspaceId_status_idx" ON "CryptoPaymentIntent"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CryptoPaymentIntent_destination_status_idx" ON "CryptoPaymentIntent"("destination", "status");
