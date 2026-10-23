-- CreateIndex
CREATE INDEX "assessments_school_grading_scale_idx" ON "assessments"("school_id", "grading_scale_id");

-- CreateIndex
CREATE INDEX "attendance_records_school_reason_idx" ON "attendance_records"("school_id", "reason_id");

-- CreateIndex
CREATE INDEX "student_fee_charges_school_fee_structure_idx" ON "student_fee_charges"("school_id", "fee_structure_id");
