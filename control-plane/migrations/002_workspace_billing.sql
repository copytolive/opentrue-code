BEGIN;

CREATE TABLE IF NOT EXISTS workspace_states(
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_key text NOT NULL CHECK(length(project_key) BETWEEN 1 AND 200),
  state jsonb NOT NULL DEFAULT '{}',
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,user_id,project_key)
);

CREATE TABLE IF NOT EXISTS billing_entitlements(
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'manual',
  plan text NOT NULL CHECK(plan IN('free','daily','personal','pro','team','dedicated')),
  status text NOT NULL CHECK(status IN('active','trial','past_due','cancelled','expired')),
  period_end timestamptz,
  provider_customer_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events(
  provider text NOT NULL,
  event_id text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,event_id)
);

ALTER TABLE workspace_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_states FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_entitlements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_states_tenant ON workspace_states;
CREATE POLICY workspace_states_tenant ON workspace_states
  USING(tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);

DROP POLICY IF EXISTS billing_entitlements_tenant ON billing_entitlements;
CREATE POLICY billing_entitlements_tenant ON billing_entitlements
  USING(tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);

COMMIT;
