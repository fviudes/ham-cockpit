-- Licenciamento do Ham Cockpit (D1). Ver docs/licenciamento.md, seção 9.
-- Convenções: datas em segundos Unix, dinheiro em centavos inteiros, cotação em micro-reais por dólar.

-- Parâmetros do portal (política, dias de trial/provisório, versão da CRL etc.)
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT 0,
  updated_by  TEXT
);
INSERT INTO settings (key, value) VALUES
  ('trial_days', '30'),
  ('provisional_days', '7'),
  ('enforce', '0'),
  ('crl_version', '1');

-- Provedores de pagamento (configuração não secreta; segredos ficam em provider_secrets)
CREATE TABLE providers (
  id            TEXT PRIMARY KEY CHECK (id IN ('paypal','picpay','mercadopago','mock')),
  display_name  TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  mode          TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','live')),
  currency_mode TEXT NOT NULL DEFAULT 'AUTO' CHECK (currency_mode IN ('USD','BRL','AUTO')),
  sort_order    INTEGER NOT NULL DEFAULT 100,
  config_json   TEXT NOT NULL DEFAULT '{}',
  updated_at    INTEGER NOT NULL DEFAULT 0,
  updated_by    TEXT
);
INSERT INTO providers (id, display_name, enabled, mode, currency_mode, sort_order) VALUES
  ('paypal', 'PayPal', 0, 'sandbox', 'USD', 10),
  ('picpay', 'PicPay', 0, 'live', 'BRL', 20);

-- Segredos cifrados com AES-GCM (chave mestra em SECRETS_MASTER_KEY). O valor nunca volta ao navegador.
CREATE TABLE provider_secrets (
  provider     TEXT NOT NULL REFERENCES providers(id),
  mode         TEXT NOT NULL CHECK (mode IN ('sandbox','live')),
  name         TEXT NOT NULL,
  ciphertext   TEXT NOT NULL,
  iv           TEXT NOT NULL,
  hint         TEXT,
  key_version  INTEGER NOT NULL DEFAULT 1,
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT,
  PRIMARY KEY (provider, mode, name)
);

-- Preço (histórico; vale a linha mais recente com effective_from <= agora). Sem linha = "preço não configurado".
CREATE TABLE price_settings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  usd_cents         INTEGER NOT NULL CHECK (usd_cents > 0),
  fx_spread_bps     INTEGER NOT NULL DEFAULT 300 CHECK (fx_spread_bps BETWEEN 0 AND 2000),
  rounding          TEXT NOT NULL DEFAULT 'real' CHECK (rounding IN ('cent','ten_cents','real')),
  quote_ttl_seconds INTEGER NOT NULL DEFAULT 900 CHECK (quote_ttl_seconds BETWEEN 120 AND 3600),
  effective_from    INTEGER NOT NULL,
  created_at        INTEGER NOT NULL,
  created_by        TEXT
);

-- Cotações USD→BRL obtidas das fontes
CREATE TABLE fx_rates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL CHECK (source IN ('ptax','awesomeapi','frankfurter','manual')),
  rate_micro  INTEGER NOT NULL CHECK (rate_micro > 0),
  rate_date   TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL,
  expires_at  INTEGER,
  created_by  TEXT
);
CREATE INDEX idx_fx_rates_fetched ON fx_rates (fetched_at DESC);

-- Cotação congelada do checkout (tempo curto)
CREATE TABLE price_quotes (
  id              TEXT PRIMARY KEY,
  serial          TEXT,
  usd_cents       INTEGER NOT NULL,
  fx_rate_micro   INTEGER,
  fx_source       TEXT,
  fx_rate_date    TEXT,
  spread_bps      INTEGER NOT NULL DEFAULT 0,
  rounding        TEXT,
  brl_cents       INTEGER,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  used_payment_id TEXT
);

CREATE TABLE devices (
  serial             TEXT PRIMARY KEY
                     CHECK (length(serial) = 16 AND serial NOT GLOB '*[^0-9a-f]*' AND serial <> '0000000000000000'),
  first_seen_at      INTEGER NOT NULL,
  last_seen_at       INTEGER NOT NULL,
  last_app_version   TEXT,
  last_image_version TEXT,
  model              TEXT,
  last_country       TEXT,
  last_ip_hash       TEXT,
  is_test            INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0,1)),
  blocked            INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0,1)),
  blocked_reason     TEXT,
  notes              TEXT
);

CREATE TABLE payments (
  id                  TEXT PRIMARY KEY,
  serial              TEXT NOT NULL REFERENCES devices(serial),
  provider            TEXT NOT NULL REFERENCES providers(id),
  mode                TEXT NOT NULL CHECK (mode IN ('sandbox','live')),
  status              TEXT NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created','pending','approved','paid','failed','expired','cancelled',
                                        'partially_refunded','refunded','chargeback')),
  quote_id            TEXT REFERENCES price_quotes(id),
  currency            TEXT NOT NULL CHECK (currency IN ('USD','BRL')),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  usd_cents           INTEGER NOT NULL,
  fx_rate_micro       INTEGER,
  provider_ref        TEXT,
  provider_capture_id TEXT,
  provider_fee_cents  INTEGER,
  refunded_cents      INTEGER NOT NULL DEFAULT 0,
  payer_email         TEXT,
  payer_country       TEXT,
  lang                TEXT NOT NULL DEFAULT 'pt' CHECK (lang IN ('pt','en')),
  note                TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  paid_at             INTEGER,
  expires_at          INTEGER
);
CREATE UNIQUE INDEX uq_payments_provider_ref ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX idx_payments_serial ON payments (serial, created_at DESC);
CREATE INDEX idx_payments_status ON payments (status, created_at DESC);

CREATE TABLE licenses (
  id               TEXT PRIMARY KEY,
  serial           TEXT NOT NULL REFERENCES devices(serial),
  type             TEXT NOT NULL CHECK (type IN ('trial','definitive')),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','expired','revoked','superseded')),
  source           TEXT NOT NULL CHECK (source IN ('auto','manual','payment','admin','transfer','migration')),
  line             TEXT NOT NULL DEFAULT '0',
  issued_at        INTEGER NOT NULL,
  starts_at        INTEGER NOT NULL,
  expires_at       INTEGER,
  kid              TEXT NOT NULL,
  token            TEXT NOT NULL,
  payment_id       TEXT REFERENCES payments(id),
  transferred_from TEXT REFERENCES licenses(id),
  revoked_at       INTEGER,
  revoked_reason   TEXT,
  created_by       TEXT
);
-- um único trial por serial, e uma única definitiva ativa por serial
CREATE UNIQUE INDEX uq_license_one_trial ON licenses (serial) WHERE type = 'trial';
CREATE UNIQUE INDEX uq_license_one_definitive ON licenses (serial) WHERE type = 'definitive' AND status = 'active';
CREATE UNIQUE INDEX uq_license_payment ON licenses (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_licenses_serial ON licenses (serial, issued_at DESC);
CREATE INDEX idx_licenses_listing ON licenses (type, status, issued_at DESC);
CREATE INDEX idx_licenses_revoked ON licenses (revoked_at) WHERE status = 'revoked';

-- Trilha de auditoria da licença (somente inserção)
CREATE TABLE license_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  serial      TEXT,
  license_id  TEXT,
  kind        TEXT NOT NULL,
  actor       TEXT NOT NULL,
  data_json   TEXT,
  ip_hash     TEXT
);
CREATE INDEX idx_license_events_serial ON license_events (serial, at DESC);

-- Eventos de webhook (idempotência e depuração)
CREATE TABLE webhook_events (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER,
  status       TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','ok','ignored','error')),
  payment_id   TEXT,
  error        TEXT,
  PRIMARY KEY (provider, event_id)
);

-- Administradores do módulo (contingência: chave + TOTP; futuro: Cloudflare Access)
CREATE TABLE admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','viewer')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  access_sub    TEXT,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE admin_sessions (
  id_hash     TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL REFERENCES admin_users(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  ip_hash     TEXT
);
CREATE INDEX idx_admin_sessions_exp ON admin_sessions (expires_at);

CREATE TABLE admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  admin_id    TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  before_json TEXT,
  after_json  TEXT,
  ip_hash     TEXT
);
CREATE INDEX idx_admin_audit_at ON admin_audit (at DESC);

-- Contador de rate limit (janela fixa)
CREATE TABLE rate_limits (
  k             TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
