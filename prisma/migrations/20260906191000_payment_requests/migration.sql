CREATE TABLE "PaymentRequest" (
  "key" TEXT NOT NULL,
  "paymentId" INTEGER NOT NULL,
  "fingerprint" TEXT NOT NULL,
  CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "PaymentRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentRequest_paymentId_key" ON "PaymentRequest"("paymentId");
