-- ---------------------------------------------------------------------------
-- Partial indexes for the queries the hot paths actually run
--
-- Prisma generates indexes for every `@@index`, but it cannot express partial
-- indexes. These cover the shapes that dominate at runtime: "this account's
-- recent statement", "which holds are still active", "what has the outbox not yet
-- published", and "which transfers are still in flight".
-- ---------------------------------------------------------------------------

-- Statement page: newest legs for one account.
CREATE INDEX IF NOT EXISTS ledger_entries_account_recent_idx
  ON ledger_entries (account_id, sequence DESC);

-- Releasing and expiring holds only ever looks at ACTIVE rows.
CREATE INDEX IF NOT EXISTS holds_active_idx
  ON holds (account_id, expires_at)
  WHERE status = 'ACTIVE';

-- The outbox relay polls exactly this, thousands of times an hour.
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox_events (available_at)
  WHERE processed_at IS NULL AND status = 'PENDING';

-- The settlement worker sweeps in-flight transfers.
CREATE INDEX IF NOT EXISTS transfers_in_flight_idx
  ON transfers (created_at)
  WHERE status IN ('PENDING', 'PROCESSING', 'RISK_REVIEW');

-- Risk engine: rolling window over a user's recent activity.
CREATE INDEX IF NOT EXISTS transfers_user_recent_idx
  ON transfers (initiated_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS risk_events_transfer_idx
  ON risk_events (transfer_id)
  WHERE transfer_id IS NOT NULL;

-- Reconciliation compares a journal's legs to its header, per currency.
CREATE INDEX IF NOT EXISTS ledger_entries_currency_idx
  ON ledger_entries (currency, journal_transaction_id);

-- FX rate lookup: latest effective rate for a pair.
CREATE INDEX IF NOT EXISTS fx_rates_pair_effective_idx
  ON fx_rates (base, quote, effective_at DESC);

-- Uncapitalised interest still owed to customers.
CREATE INDEX IF NOT EXISTS interest_accruals_open_idx
  ON interest_accruals (accrual_date)
  WHERE capitalised = false;

-- Loan collections: installments that are due and unpaid.
CREATE INDEX IF NOT EXISTS loan_schedules_due_idx
  ON loan_schedules (due_date, loan_id)
  WHERE status <> 'PAID';

-- Scheduled transfers that are due to run.
CREATE INDEX IF NOT EXISTS scheduled_transfers_due_idx
  ON scheduled_transfers (next_run_at)
  WHERE status = 'ACTIVE';
