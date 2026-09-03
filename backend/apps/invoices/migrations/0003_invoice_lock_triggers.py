"""
Database-level enforcement (PostgreSQL only) of the two immutability rules the
app also enforces in the API layer:

  1. An invoice linked to a non-``open`` TaxPeriod cannot have its fiscal
     fields changed, and cannot be deleted.
  2. Once ``etims_status = 'accepted'`` the same fiscal fields are frozen.
  3. Line items of a locked / fiscalised invoice cannot be inserted, updated
     or deleted.

Payment/status/eTIMS bookkeeping columns stay writable so reconciliation and
fiscalisation can still complete after a period is filed.

No-op on non-PostgreSQL backends (the test suite runs on SQLite).
"""
from django.db import migrations

FORWARD_SQL = r"""
CREATE OR REPLACE FUNCTION hesabu_guard_invoice_mutation() RETURNS trigger AS $$
DECLARE
    period_status text;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        IF OLD.tax_period_id IS NOT NULL THEN
            SELECT status INTO period_status FROM tax_periods WHERE id = OLD.tax_period_id;
            IF period_status IS NOT NULL AND period_status <> 'open' THEN
                RAISE EXCEPTION 'invoice % is in a locked tax period (%) and cannot be deleted',
                    OLD.invoice_number, period_status USING ERRCODE = 'check_violation';
            END IF;
        END IF;
        IF OLD.etims_status = 'accepted' THEN
            RAISE EXCEPTION 'invoice % has been fiscalised (eTIMS accepted) and cannot be deleted',
                OLD.invoice_number USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: only block changes to the fiscal fields.
    IF ( NEW.invoice_number, NEW.invoice_date, NEW.customer_id,
         NEW.subtotal, NEW.vat_amount, NEW.total_amount, NEW.wht_amount )
       IS DISTINCT FROM
       ( OLD.invoice_number, OLD.invoice_date, OLD.customer_id,
         OLD.subtotal, OLD.vat_amount, OLD.total_amount, OLD.wht_amount )
    THEN
        IF OLD.tax_period_id IS NOT NULL THEN
            SELECT status INTO period_status FROM tax_periods WHERE id = OLD.tax_period_id;
            IF period_status IS NOT NULL AND period_status <> 'open' THEN
                RAISE EXCEPTION 'invoice % is in a locked tax period (%); fiscal fields are immutable',
                    OLD.invoice_number, period_status USING ERRCODE = 'check_violation';
            END IF;
        END IF;
        IF OLD.etims_status = 'accepted' THEN
            RAISE EXCEPTION 'invoice % has been fiscalised (eTIMS accepted); fiscal fields are immutable',
                OLD.invoice_number USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hesabu_guard_invoice_mutation ON invoices;
CREATE TRIGGER hesabu_guard_invoice_mutation
    BEFORE UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION hesabu_guard_invoice_mutation();


CREATE OR REPLACE FUNCTION hesabu_guard_line_item_mutation() RETURNS trigger AS $$
DECLARE
    inv_number text;
    inv_etims text;
    inv_period uuid;
    period_status text;
BEGIN
    SELECT invoice_number, etims_status, tax_period_id
      INTO inv_number, inv_etims, inv_period
      FROM invoices
     WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

    IF NOT FOUND THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF inv_period IS NOT NULL THEN
        SELECT status INTO period_status FROM tax_periods WHERE id = inv_period;
        IF period_status IS NOT NULL AND period_status <> 'open' THEN
            RAISE EXCEPTION 'invoice % is in a locked tax period (%); line items are immutable',
                inv_number, period_status USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF inv_etims = 'accepted' THEN
        RAISE EXCEPTION 'invoice % has been fiscalised (eTIMS accepted); line items are immutable',
            inv_number USING ERRCODE = 'check_violation';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hesabu_guard_line_item_mutation ON invoice_line_items;
CREATE TRIGGER hesabu_guard_line_item_mutation
    BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
    FOR EACH ROW EXECUTE FUNCTION hesabu_guard_line_item_mutation();
"""

REVERSE_SQL = r"""
DROP TRIGGER IF EXISTS hesabu_guard_line_item_mutation ON invoice_line_items;
DROP FUNCTION IF EXISTS hesabu_guard_line_item_mutation();
DROP TRIGGER IF EXISTS hesabu_guard_invoice_mutation ON invoices;
DROP FUNCTION IF EXISTS hesabu_guard_invoice_mutation();
"""


def apply_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(FORWARD_SQL)


def drop_triggers(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("invoices", "0002_initial"),
        ("taxes", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(apply_triggers, drop_triggers),
    ]
