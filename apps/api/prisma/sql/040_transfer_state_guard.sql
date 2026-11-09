-- ---------------------------------------------------------------------------
-- Transfer state machine, enforced by the database
--
-- The API has a state machine in TypeScript that produces good error messages and
-- emits events. This trigger is the backstop: even a migration script, a psql
-- session or a future refactor cannot move a transfer through an illegal
-- transition. The transition table below is the single source of truth for what
-- "legal" means.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION meridian.guard_transfer_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  permitted boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM (VALUES
        -- New payment intents either go straight through or stop for review.
        ('PENDING', 'RISK_REVIEW'),
        ('PENDING', 'PROCESSING'),
        ('PENDING', 'BLOCKED'),
        ('PENDING', 'FAILED'),
        -- An officer clears a review (or blocks it).
        ('RISK_REVIEW', 'PROCESSING'),
        ('RISK_REVIEW', 'BLOCKED'),
        ('RISK_REVIEW', 'FAILED'),
        -- A blocked transfer can be released by an authorised officer.
        ('BLOCKED', 'PROCESSING'),
        -- In flight: settles or fails. Never jumps straight to REVERSED.
        ('PROCESSING', 'SETTLED'),
        ('PROCESSING', 'FAILED'),
        -- Money that moved can be undone, wholly or in part.
        ('SETTLED', 'REVERSED'),
        ('SETTLED', 'REFUNDED'),
        ('REVERSED', 'REFUNDED')
      ) AS allowed (from_status, to_status)
     WHERE allowed.from_status = OLD.status::text
       AND allowed.to_status = NEW.status::text
  ) INTO permitted;

  IF NOT permitted THEN
    RAISE EXCEPTION 'TRANSFER_INVALID_STATE: % -> % is not an allowed transition',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation',
            HINT = 'Route the change through TransferStateMachineService.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transfers_status_machine ON transfers;
CREATE TRIGGER transfers_status_machine
  BEFORE UPDATE OF status ON transfers
  FOR EACH ROW EXECUTE FUNCTION meridian.guard_transfer_status();
