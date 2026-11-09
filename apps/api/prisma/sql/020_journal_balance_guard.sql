-- ---------------------------------------------------------------------------
-- Double-entry enforcement
--
-- A journal transaction is balanced if and only if the sum of its debits equals
-- the sum of its credits. Application code checks this too, but the check that
-- matters is this one: a deferrable constraint trigger evaluated at COMMIT, so a
-- half-written journal can never become visible to any other transaction, no
-- matter which code path wrote it or who connects to the database later.
--
-- The same trigger asserts the header agrees with its legs: amount_minor equals
-- the debit total, entry_count equals the number of legs, every leg is in the
-- journal's currency, and there are at least two legs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION meridian.assert_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  header      journal_transactions%ROWTYPE;
  leg_count   int;
  debit_total bigint;
  credit_total bigint;
  off_currency int;
BEGIN
  SELECT * INTO header FROM journal_transactions WHERE id = NEW.journal_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_UNBALANCED: ledger entry references missing journal %',
      NEW.journal_transaction_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*),
         COALESCE(sum(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0),
         COALESCE(sum(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0),
         count(*) FILTER (WHERE currency <> header.currency)
    INTO leg_count, debit_total, credit_total, off_currency
    FROM ledger_entries
   WHERE journal_transaction_id = NEW.journal_transaction_id;

  IF off_currency > 0 THEN
    RAISE EXCEPTION
      'JOURNAL_UNBALANCED: journal % mixes currencies; its legs must all be %',
      header.reference, header.currency USING ERRCODE = 'check_violation';
  END IF;

  IF leg_count < 2 THEN
    RAISE EXCEPTION 'JOURNAL_UNBALANCED: journal % has % leg(s); double entry needs at least 2',
      header.reference, leg_count USING ERRCODE = 'check_violation';
  END IF;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION
      'JOURNAL_UNBALANCED: journal % is out by % minor units (debits %, credits %)',
      header.reference, debit_total - credit_total, debit_total, credit_total
      USING ERRCODE = 'check_violation';
  END IF;

  IF debit_total <> header.amount_minor THEN
    RAISE EXCEPTION
      'JOURNAL_UNBALANCED: journal % header says % but its legs total %',
      header.reference, header.amount_minor, debit_total USING ERRCODE = 'check_violation';
  END IF;

  IF leg_count <> header.entry_count THEN
    RAISE EXCEPTION
      'JOURNAL_UNBALANCED: journal % header says % legs but % were written',
      header.reference, header.entry_count, leg_count USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_balanced ON ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION meridian.assert_journal_balanced();

-- Posting is a per-account affair: this index keeps the balance trigger's lookup
-- of a journal's legs cheap even for a journal with many legs.
DROP INDEX IF EXISTS ledger_entries_journal_idx;
CREATE INDEX ledger_entries_journal_idx ON ledger_entries (journal_transaction_id, direction);
