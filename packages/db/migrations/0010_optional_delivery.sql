-- Decision #110 (delivery is optional): orders arranged between buyer and seller. Add-only
-- (expand): the code already running never writes or reads the new value, so nothing to
-- contract later. Postgres allows ADD VALUE in the migration transaction as long as nothing
-- in the same migration uses it.
ALTER TYPE "public"."fulfilment" ADD VALUE 'arranged';
