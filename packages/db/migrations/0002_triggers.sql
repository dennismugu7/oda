-- M1: triggers, guards, functions and same-shop foreign keys (decision #34).
-- Hand-written (drizzle-kit generate --custom). Statements are separated by breakpoints
-- because function bodies contain semicolons.

-- 1. updated_at ------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- 2. Same-shop composite foreign keys ---------------------------------------------------
-- A row can only point at another row of the same shop. Nullable references use
-- SET NULL (column) so deleting the target keeps shop_id intact.
ALTER TABLE products ADD CONSTRAINT products_category_same_shop
  FOREIGN KEY (category_id, shop_id) REFERENCES categories (id, shop_id) ON DELETE SET NULL (category_id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_delivery_area_same_shop
  FOREIGN KEY (delivery_area_id, shop_id) REFERENCES delivery_areas (id, shop_id) ON DELETE SET NULL (delivery_area_id);
--> statement-breakpoint
ALTER TABLE payment_claims ADD CONSTRAINT payment_claims_order_same_shop
  FOREIGN KEY (order_id, shop_id) REFERENCES orders (id, shop_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE reviews ADD CONSTRAINT reviews_order_same_shop
  FOREIGN KEY (order_id, shop_id) REFERENCES orders (id, shop_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE notifications ADD CONSTRAINT notifications_order_same_shop
  FOREIGN KEY (order_id, shop_id) REFERENCES orders (id, shop_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE notifications ADD CONSTRAINT notifications_review_same_shop
  FOREIGN KEY (review_id, shop_id) REFERENCES reviews (id, shop_id) ON DELETE CASCADE;
--> statement-breakpoint

-- 3. Payment account verification resets when the account details change ----------------
CREATE FUNCTION reset_payment_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.type, NEW.number, NEW.account_ref, NEW.account_name)
     IS DISTINCT FROM (OLD.type, OLD.number, OLD.account_ref, OLD.account_name) THEN
    NEW.verification_status := 'pending';
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    NEW.verification_note := NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_accounts_reset_verification BEFORE UPDATE ON payment_accounts
  FOR EACH ROW EXECUTE FUNCTION reset_payment_verification();
--> statement-breakpoint

-- 4. Order status guard: status/payment_status change only inside transitionOrder() --------
CREATE FUNCTION guard_order_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.payment_status IS DISTINCT FROM OLD.payment_status)
     AND coalesce(current_setting('oda.transition', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Order status changes only through transitionOrder() (order %)', OLD.id
      USING ERRCODE = 'P0001', HINT = 'oda_status_guard';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_guard_status BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_status();
--> statement-breakpoint

-- 5. Sale aggregates: products.units_sold and shops.delivered_count ----------------------
-- An order is a sale while confirmed, sent or delivered (order-lifecycle.md).
CREATE FUNCTION is_sale_status(s order_status) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT s IN ('confirmed', 'sent', 'delivered')
$$;
--> statement-breakpoint
CREATE FUNCTION add_order_units(p_order_id uuid, p_sign integer) RETURNS void LANGUAGE sql AS $$
  UPDATE products p
     SET units_sold = greatest(0, p.units_sold + p_sign * i.qty)
    FROM (SELECT product_id, sum(qty)::integer AS qty FROM order_items
          WHERE order_id = p_order_id AND product_id IS NOT NULL GROUP BY product_id) i
   WHERE p.id = i.product_id
$$;
--> statement-breakpoint
CREATE FUNCTION order_status_aggregates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF is_sale_status(NEW.status) AND NOT is_sale_status(OLD.status) THEN
    PERFORM add_order_units(NEW.id, 1);
  ELSIF is_sale_status(OLD.status) AND NOT is_sale_status(NEW.status) THEN
    PERFORM add_order_units(NEW.id, -1);
  END IF;
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    UPDATE shops SET delivered_count = delivered_count + 1 WHERE id = NEW.shop_id;
  ELSIF OLD.status = 'delivered' AND NEW.status <> 'delivered' THEN
    UPDATE shops SET delivered_count = greatest(0, delivered_count - 1) WHERE id = NEW.shop_id;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_status_aggregates AFTER UPDATE OF status ON orders
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION order_status_aggregates();
--> statement-breakpoint
-- Orders created directly as a sale (manual "already paid" / pay on delivery) get their
-- items after the order row, so items count when inserted into an order that's already a sale.
CREATE FUNCTION order_items_units() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT is_sale_status(status) INTO sale FROM orders WHERE id = NEW.order_id;
    IF sale AND NEW.product_id IS NOT NULL THEN
      UPDATE products SET units_sold = units_sold + NEW.qty WHERE id = NEW.product_id;
    END IF;
    RETURN NULL;
  END IF;
  -- DELETE (only when an order is removed): give the units back if it was a sale.
  SELECT is_sale_status(status) INTO sale FROM orders WHERE id = OLD.order_id;
  IF sale AND OLD.product_id IS NOT NULL THEN
    UPDATE products SET units_sold = greatest(0, units_sold - OLD.qty) WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER order_items_units AFTER INSERT OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION order_items_units();
--> statement-breakpoint

-- 6. Ratings: shops from reviews.rating, products from review_items.rating ---------------
CREATE FUNCTION refresh_shop_rating(p_shop_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE shops s
     SET rating_avg = r.avg, rating_count = r.n
    FROM (SELECT round(avg(rating), 2) AS avg, count(*)::integer AS n
            FROM reviews WHERE shop_id = p_shop_id) r
   WHERE s.id = p_shop_id
$$;
--> statement-breakpoint
CREATE FUNCTION refresh_product_rating(p_product_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE products p
     SET rating_avg = r.avg, rating_count = r.n
    FROM (SELECT round(avg(rating), 2) AS avg, count(rating)::integer AS n
            FROM review_items WHERE product_id = p_product_id) r
   WHERE p.id = p_product_id
$$;
--> statement-breakpoint
CREATE FUNCTION reviews_rating() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM refresh_shop_rating(OLD.shop_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.shop_id <> OLD.shop_id) THEN
    PERFORM refresh_shop_rating(NEW.shop_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER reviews_rating AFTER INSERT OR DELETE OR UPDATE OF rating, shop_id ON reviews
  FOR EACH ROW EXECUTE FUNCTION reviews_rating();
--> statement-breakpoint
CREATE FUNCTION review_items_rating() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.product_id IS NOT NULL THEN
    PERFORM refresh_product_rating(OLD.product_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.product_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.rating IS DISTINCT FROM OLD.rating) THEN
    PERFORM refresh_product_rating(NEW.product_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER review_items_rating AFTER INSERT OR DELETE OR UPDATE OF rating, product_id ON review_items
  FOR EACH ROW EXECUTE FUNCTION review_items_rating();
--> statement-breakpoint

-- 7. Slugs: old slugs go to history and can never be taken by another shop ---------------
CREATE FUNCTION guard_shop_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM shop_slug_history WHERE old_slug = NEW.slug AND shop_id <> NEW.id) THEN
    RAISE EXCEPTION 'The link "%" was used by another shop and can''t be reused', NEW.slug
      USING ERRCODE = '23505', HINT = 'oda_slug_in_history';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shops_guard_slug BEFORE INSERT OR UPDATE OF slug ON shops
  FOR EACH ROW EXECUTE FUNCTION guard_shop_slug();
--> statement-breakpoint
CREATE FUNCTION record_slug_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The owner reclaiming one of their own old slugs: it's live again, not history.
  DELETE FROM shop_slug_history WHERE old_slug = NEW.slug AND shop_id = NEW.id;
  INSERT INTO shop_slug_history (old_slug, shop_id) VALUES (OLD.slug, NEW.id)
    ON CONFLICT (old_slug) DO UPDATE SET changed_at = now();
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER shops_record_slug_change AFTER UPDATE OF slug ON shops
  FOR EACH ROW WHEN (NEW.slug IS DISTINCT FROM OLD.slug)
  EXECUTE FUNCTION record_slug_change();
--> statement-breakpoint
-- A slug that is live for one shop can't be inserted into another shop's history either.
CREATE FUNCTION guard_slug_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM shops WHERE slug = NEW.old_slug AND id <> NEW.shop_id) THEN
    RAISE EXCEPTION 'The link "%" belongs to another shop', NEW.old_slug
      USING ERRCODE = '23505', HINT = 'oda_slug_in_history';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shop_slug_history_guard BEFORE INSERT OR UPDATE ON shop_slug_history
  FOR EACH ROW EXECUTE FUNCTION guard_slug_history();
--> statement-breakpoint

-- 8. Rate limiting: fixed-window counter -------------------------------------------------
-- Returns true while the key is within max_hits for the current window.
CREATE FUNCTION rate_limit_hit(p_key text, p_window_seconds integer, p_max_hits integer)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  hits integer;
BEGIN
  INSERT INTO rate_limits (key, window_start, count) VALUES (p_key, w, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO hits;
  RETURN hits <= p_max_hits;
END $$;
