DROP INDEX "hire_payments_one_paid_key";--> statement-breakpoint
CREATE UNIQUE INDEX "hire_payments_one_paid_key" ON "hire_payments" USING btree ("hire_id") WHERE status = 'paid';