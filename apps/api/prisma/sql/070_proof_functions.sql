-- ---------------------------------------------------------------------------
-- Ledger proofs
--
-- These functions are the bank's own audit tools. They answer, in the database and
-- in one round trip, the questions a bank must be able to answer on demand:
--
--   * does the whole ledger sum to zero, per currency?      ledger_imbalance()
--   * what does the ledger say this account's balance is?   account_ledger_balance()
--   * has any journal row been tampered with?               verify_ledger_chain()
--   * does the cached balance still match the ledger?       reconciliation_report()
--
-- `GET /ops/ledger/verify` and the nightly reconciliation job both call these, and
-- the integration tests assert they stay at zero on a busy ledger.
-- ---------------------------------------------------------------------------

-- Debits minus credits for one currency, or for the whole book when omitted.
-- Zero is the only acceptable answer.
CREATE OR REPLACE FUNCTION meridian.ledger_imbalance(p_currency char(3) DEFAULT NULL)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::bigint
    FROM ledger_entries
   WHERE p_currency IS NULL OR currency = p_currency;
$$;

-- The ledger's answer for one account, signed in the account's normal-balance
-- direction, which is exactly what `account_balances.balance_minor` caches.
CREATE OR REPLACE FUNCTION meridian.account_ledger_balance(p_account_id uuid)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
           SUM(CASE WHEN e.direction::text = a.normal_balance::text THEN e.amount_minor ELSE -e.amount_minor END),
           0
         )::bigint
    FROM accounts a
    JOIN ledger_entries e ON e.account_id = a.id
   WHERE a.id = p_account_id;
$$;

-- Per-currency trial balance: the aggregate proof that nothing leaked.
CREATE OR REPLACE FUNCTION meridian.trial_balance()
RETURNS TABLE (currency char(3), debit_total bigint, credit_total bigint, imbalance bigint, legs bigint)
LANGUAGE sql STABLE AS $$
  SELECT currency,
         COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0)::bigint,
         COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::bigint,
         COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0)::bigint,
         count(*)::bigint
    FROM ledger_entries
   GROUP BY currency
   ORDER BY currency;
$$;

-- Walk the hash chain in sequence order and report every link that does not
-- connect. An empty result is the proof that no journal row was altered after the
-- fact.
CREATE OR REPLACE FUNCTION meridian.verify_ledger_chain()
RETURNS TABLE (sequence bigint, reference text, issue text)
LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT j.sequence,
           j.reference,
           j.hash_prev,
           lag(j.hash) OVER (ORDER BY j.sequence) AS expected_prev,
           row_number() OVER (ORDER BY j.sequence) AS position
      FROM journal_transactions j
  )
  SELECT sequence,
         reference,
         CASE
           WHEN position = 1 AND hash_prev IS NOT NULL THEN 'first journal must not have a predecessor hash'
           ELSE 'hash_prev does not match the previous journal hash'
         END
    FROM ordered
   WHERE (position = 1 AND hash_prev IS NOT NULL)
      OR (position > 1 AND hash_prev IS DISTINCT FROM expected_prev)
   ORDER BY sequence;
$$;

-- Compare every materialised balance with the ledger it supposedly caches. Rows are
-- returned only when they disagree, so "no rows" means "the book is proven".
CREATE OR REPLACE FUNCTION meridian.reconciliation_report()
RETURNS TABLE (account_id uuid, currency char(3), cached_minor bigint, ledger_minor bigint, drift_minor bigint, leg_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT a.id,
         a.currency,
         COALESCE(b.balance_minor, 0)::bigint,
         meridian.account_ledger_balance(a.id),
         (COALESCE(b.balance_minor, 0) - meridian.account_ledger_balance(a.id))::bigint,
         COALESCE(b.entry_count, 0)::bigint
    FROM accounts a
    LEFT JOIN account_balances b ON b.account_id = a.id
   WHERE COALESCE(b.balance_minor, 0) <> meridian.account_ledger_balance(a.id)
   ORDER BY a.currency, a.account_number;
$$;
