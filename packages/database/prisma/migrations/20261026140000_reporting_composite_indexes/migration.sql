-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_registers_school_date_type_idx" ON "attendance_registers"("school_id", "date", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financial_payments_school_received_idx" ON "financial_payments"("school_id", "received_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "student_fee_charges_school_created_idx" ON "student_fee_charges"("school_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "library_loans_school_checkout_returned_idx" ON "library_loans"("school_id", "checked_out_at", "returned_at");
