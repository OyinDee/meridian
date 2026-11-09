-- ---------------------------------------------------------------------------
-- Every account always has a balance row
--
-- Posting code locks and updates `account_balances` before writing a leg, so the
-- row must exist from the moment the account does. Creating it in the application
-- would leave a window where an account exists with no cache; creating it here
-- makes that state unrepresentable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION meridian.create_account_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO account_balances (account_id, balance_minor, available_minor, holds_minor, entry_count, version, updated_at)
  VALUES (NEW.id, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS accounts_create_balance ON accounts;
CREATE TRIGGER accounts_create_balance
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION meridian.create_account_balance();
