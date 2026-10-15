PRAGMA foreign_keys = ON;

CREATE TABLE shop_domains (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL COLLATE NOCASE,
  type TEXT NOT NULL DEFAULT 'CUSTOM_DOMAIN' CHECK (type IN ('SUBDOMAIN','CUSTOM_DOMAIN')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFYING','ACTIVE','FAILED','DISABLED')),
  cloudflare_hostname_id TEXT UNIQUE,
  verification_method TEXT NOT NULL DEFAULT 'txt' CHECK (verification_method IN ('http','txt','email')),
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  ssl_status TEXT NOT NULL DEFAULT 'PENDING',
  cname_target TEXT,
  verification_records TEXT CHECK (verification_records IS NULL OR json_valid(verification_records)),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX shop_domains_shop_status_idx ON shop_domains(shop_id,status,ssl_status);
CREATE UNIQUE INDEX shop_domains_hostname_claim_idx ON shop_domains(hostname) WHERE status<>'DISABLED';
CREATE UNIQUE INDEX shop_domains_primary_idx ON shop_domains(shop_id) WHERE is_primary=1;

-- Legacy shop domains did not carry verifiable lifecycle state, so migrate as pending.
INSERT INTO shop_domains(id,shop_id,hostname,type,status,verification_method,verification_status,ssl_status,is_primary)
SELECT lower(hex(randomblob(16))),id,hostname,'CUSTOM_DOMAIN','PENDING','txt','PENDING','PENDING',0
FROM (
  SELECT id,lower(trim(domain)) hostname,
    row_number() OVER (PARTITION BY lower(trim(domain)) ORDER BY created_at,id) duplicate_rank
  FROM shops WHERE domain IS NOT NULL AND trim(domain)<>''
) WHERE duplicate_rank=1;

-- shops.domain is retained only as an empty legacy column; shop_domains is authoritative.
UPDATE shops SET domain=NULL WHERE domain IS NOT NULL;
