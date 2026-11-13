-- Tangent: more brand kits per plan, since every product or service can have its own.
-- Mirrors DEFAULT_PLANS in src/lib/billing/plans.ts (which the app enforces).

update public.plan_entitlements set limit_value = 5 where plan_id = 'starter' and key = 'brand_profiles';
update public.plan_entitlements set limit_value = 15 where plan_id = 'growth' and key = 'brand_profiles';
update public.plan_entitlements set limit_value = 50 where plan_id = 'professional' and key = 'brand_profiles';
