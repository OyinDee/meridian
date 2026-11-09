-- ---------------------------------------------------------------------------
-- Money-shaped constraints
--
-- Amounts are integers of minor units (kobo). These checks make a negative
-- magnitude, a mismatched currency string or a cache that contradicts its own
-- arithmetic unrepresentable.
-- ---------------------------------------------------------------------------

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_magnitude_positive,
  ADD CONSTRAINT ledger_entries_magnitude_positive CHECK (amount_minor > 0),
  DROP CONSTRAINT IF EXISTS ledger_entries_currency_format,
  ADD CONSTRAINT ledger_entries_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE journal_transactions
  DROP CONSTRAINT IF EXISTS journal_amount_positive,
  ADD CONSTRAINT journal_amount_positive CHECK (amount_minor > 0),
  DROP CONSTRAINT IF EXISTS journal_entry_count_min,
  ADD CONSTRAINT journal_entry_count_min CHECK (entry_count >= 2),
  DROP CONSTRAINT IF EXISTS journal_currency_format,
  ADD CONSTRAINT journal_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_currency_format,
  ADD CONSTRAINT accounts_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  DROP CONSTRAINT IF EXISTS accounts_overdraft_non_negative,
  ADD CONSTRAINT accounts_overdraft_non_negative CHECK (overdraft_limit_minor >= 0 AND minimum_balance_minor >= 0);

-- available = balance - holds is an identity of the cache, not an opinion.
ALTER TABLE account_balances
  DROP CONSTRAINT IF EXISTS account_balances_available_identity,
  ADD CONSTRAINT account_balances_available_identity CHECK (available_minor = balance_minor - holds_minor),
  DROP CONSTRAINT IF EXISTS account_balances_holds_non_negative,
  ADD CONSTRAINT account_balances_holds_non_negative CHECK (holds_minor >= 0);

ALTER TABLE transfers
  DROP CONSTRAINT IF EXISTS transfers_amount_positive,
  ADD CONSTRAINT transfers_amount_positive CHECK (amount_minor > 0 AND fee_minor >= 0),
  DROP CONSTRAINT IF EXISTS transfers_reversed_within_amount,
  ADD CONSTRAINT transfers_reversed_within_amount CHECK (reversed_minor >= 0 AND reversed_minor <= amount_minor),
  DROP CONSTRAINT IF EXISTS transfers_currency_format,
  ADD CONSTRAINT transfers_currency_format CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE holds
  DROP CONSTRAINT IF EXISTS holds_amounts,
  ADD CONSTRAINT holds_amounts CHECK (amount_minor > 0 AND captured_minor >= 0 AND captured_minor <= amount_minor);

ALTER TABLE limit_usages
  DROP CONSTRAINT IF EXISTS limit_usages_non_negative,
  ADD CONSTRAINT limit_usages_non_negative CHECK (used_minor >= 0 AND transfer_count >= 0);

ALTER TABLE interest_accruals
  DROP CONSTRAINT IF EXISTS interest_accruals_non_negative,
  ADD CONSTRAINT interest_accruals_non_negative CHECK (accrued_minor >= 0 AND average_balance_minor >= 0);

ALTER TABLE loan_schedules
  DROP CONSTRAINT IF EXISTS loan_schedules_components,
  ADD CONSTRAINT loan_schedules_components
    CHECK (payment_minor = interest_minor + principal_minor AND paid_minor >= 0);

-- Nigeria: a NUBAN is exactly ten digits, a BVN exactly eleven.
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_nuban_format,
  ADD CONSTRAINT accounts_nuban_format CHECK (account_number ~ '^\d{10}$');

-- Identity data is normalised on write, so lookups and de-duplication are exact.
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_email_lowercase,
  ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  DROP CONSTRAINT IF EXISTS users_phone_format,
  ADD CONSTRAINT users_phone_format CHECK (phone ~ '^(\+234|0)[789][01]\d{8}$'),
  DROP CONSTRAINT IF EXISTS users_bvn_last4_format,
  ADD CONSTRAINT users_bvn_last4_format CHECK (bvn_last4 ~ '^\d{4}$'),
  -- KYC floor: a Nigerian bank account holder is at least 18.
  DROP CONSTRAINT IF EXISTS users_minimum_age,
  ADD CONSTRAINT users_minimum_age CHECK (date_of_birth <= (CURRENT_DATE - INTERVAL '18 years')),
  DROP CONSTRAINT IF EXISTS users_failed_login_non_negative,
  ADD CONSTRAINT users_failed_login_non_negative CHECK (failed_login_count >= 0);

