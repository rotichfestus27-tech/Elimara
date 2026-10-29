import { Info, WalletCards } from "lucide-react";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function RecordPaymentSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <WalletCards aria-hidden="true" />
          Record Payment
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="record-payment-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Record payment</SheetTitle>
          <SheetDescription id="record-payment-description">
            Payment entry preview only. No payment information is saved or
            processed.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <p className="text-xs text-muted-foreground">
            Fields marked with <span className="text-destructive">*</span> are
            required in a future connected workflow.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="payment-student" label="Student *">
              <input
                autoComplete="off"
                className={controlClassName}
                id="payment-student"
                name="student"
                placeholder="Student name"
                required
              />
            </FormField>
            <FormField
              id="payment-admission-number"
              label="Admission number *"
            >
              <input
                autoComplete="off"
                className={controlClassName}
                id="payment-admission-number"
                name="admissionNumber"
                placeholder="Enter admission number"
                required
              />
            </FormField>
            <FormField
              id="payment-invoice-reference"
              label="Invoice or fee reference *"
            >
              <input
                autoComplete="off"
                className={controlClassName}
                id="payment-invoice-reference"
                name="invoiceReference"
                placeholder="Enter invoice or fee reference"
                required
              />
            </FormField>
            <FormField id="payment-date" label="Payment date *">
              <input
                className={controlClassName}
                id="payment-date"
                name="paymentDate"
                required
                type="date"
              />
            </FormField>
            <FormField id="payment-amount" label="Amount *">
              <input
                className={controlClassName}
                id="payment-amount"
                min="0.01"
                name="amount"
                placeholder="Amount unavailable"
                required
                step="0.01"
                type="number"
              />
            </FormField>
            <FormField
              id="payment-method"
              label="Payment method *"
            >
              <select
                className={controlClassName}
                defaultValue=""
                id="payment-method"
                name="paymentMethod"
                required
              >
                <option disabled value="">
                  Select payment method
                </option>
                <option value="cash">Cash</option>
                <option value="bank-transfer">Bank transfer</option>
                <option value="mobile-money">Mobile money</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                id="payment-transaction-reference"
                label="Transaction / reference number"
              >
                <input
                  autoComplete="off"
                  className={controlClassName}
                  id="payment-transaction-reference"
                  name="transactionReference"
                  placeholder="Enter reference number (optional)"
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField id="payment-notes" label="Notes (optional)">
                <textarea
                  className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  id="payment-notes"
                  name="notes"
                  placeholder="Add optional notes"
                />
              </FormField>
            </div>
          </div>

          <div
            className="flex gap-3 rounded-lg border bg-muted/30 p-3.5"
            role="note"
          >
            <Info
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Payment processing, receipt generation, and persistence are not
              connected. This preview does not record or transmit payment data.
            </p>
          </div>
          <Button className="w-full" disabled type="submit" variant="secondary">
            Record payment unavailable in preview
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
