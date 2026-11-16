-- Registro do aparelho/licença no instante em que o pagamento é criado (checkout).
ALTER TABLE payments ADD COLUMN registered_at INTEGER;
ALTER TABLE payments ADD COLUMN license_id TEXT;
ALTER TABLE payments ADD COLUMN license_token TEXT;
ALTER TABLE payments ADD COLUMN device_callsign TEXT;
ALTER TABLE payments ADD COLUMN device_email TEXT;