-- Migration: RC Plus fields (present address + pincode) for the richer
-- /srv1/rc-details lookup. Stored so cached/free repeat lookups also carry
-- address & pincode, and history retains them.
-- Apply against an existing database (schema.sql is only for a fresh DB).
--   Local:  npx wrangler d1 execute rc-lookup-db --local  --file=./migrations/0003_rc_plus_fields.sql
--   Remote: npx wrangler d1 execute rc-lookup-db --remote --file=./migrations/0003_rc_plus_fields.sql

ALTER TABLE rc_mobile_cache ADD COLUMN present_address TEXT;
ALTER TABLE rc_mobile_cache ADD COLUMN pincode TEXT;

ALTER TABLE lookup_history ADD COLUMN present_address TEXT;
ALTER TABLE lookup_history ADD COLUMN pincode TEXT;
