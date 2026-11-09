-- ---------------------------------------------------------------------------
-- Ledger immutability
--
-- The ledger is the bank. Corrections happen by posting a reversing journal,
-- never by editing or deleting a row, so the database refuses both outright.
-- Application code that tries it gets a Postgres error, not a silent success.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS meridian;

CREATE OR REPLACE FUNCTION meridian.reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: % is not permitted on %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation',
          HINT = 'Post a reversing journal transaction instead of rewriting history.';
END;
$$;

-- One leg of a journal is a fact. INSERT only, forever.
DROP TRIGGER IF EXISTS ledger_entries_append_only ON ledger_entries;
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION meridian.reject_ledger_mutation();

-- A journal header may only gain a reversal pointer. Everything else is frozen.
CREATE OR REPLACE FUNCTION meridian.guard_journal_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY['status', 'reversed_by_id', 'reversed_at'];
BEGIN
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION
      'LEDGER_IMMUTABLE: journal_transactions are append-only; only % may change',
      array_to_string(mutable, ', ')
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_transactions_immutable ON journal_transactions;
CREATE TRIGGER journal_transactions_immutable
  BEFORE UPDATE ON journal_transactions
  FOR EACH ROW EXECUTE FUNCTION meridian.guard_journal_update();

DROP TRIGGER IF EXISTS journal_transactions_append_only ON journal_transactions;
CREATE TRIGGER journal_transactions_append_only
  BEFORE DELETE ON journal_transactions
  FOR EACH ROW EXECUTE FUNCTION meridian.reject_ledger_mutation();

-- The audit log is hash-chained too: rewriting an entry breaks the chain proof.
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION meridian.reject_ledger_mutation();
