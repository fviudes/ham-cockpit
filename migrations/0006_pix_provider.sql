-- Provedor PIX (pagamento manual por chave telefone; confirmação no admin).
PRAGMA foreign_keys = OFF;

CREATE TABLE providers_new (
  id            TEXT PRIMARY KEY CHECK (id IN ('paypal','picpay','mercadopago','mock','pix')),
  display_name  TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  mode          TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','live')),
  currency_mode TEXT NOT NULL DEFAULT 'AUTO' CHECK (currency_mode IN ('USD','BRL','AUTO')),
  sort_order    INTEGER NOT NULL DEFAULT 100,
  config_json   TEXT NOT NULL DEFAULT '{}',
  updated_at    INTEGER NOT NULL DEFAULT 0,
  updated_by    TEXT
);

INSERT INTO providers_new SELECT * FROM providers;
INSERT OR IGNORE INTO providers_new (id, display_name, enabled, mode, currency_mode, sort_order, config_json, updated_at, updated_by)
  VALUES ('pix', 'PIX', 1, 'live', 'BRL', 5, '{}', 0, NULL);

DROP TABLE providers;
ALTER TABLE providers_new RENAME TO providers;

PRAGMA foreign_keys = ON;