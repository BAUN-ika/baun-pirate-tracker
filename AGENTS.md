
## Multi-tenant
- Tenant data carries world_id + alliance_id; a BEFORE INSERT trigger (trg_0_tenant) fills them from current_alliance_id(). Why: existing inserts keep working without passing tenant ids.
- Isolation is enforced by RESTRICTIVE "tenant scope" RLS policies (alliance_id = current_alliance_id()). Why: layers on top of existing permissive policies without rewriting them.
- Roles live in user_roles scoped by alliance_id; has_role() checks the active alliance; system_admins table grants admin in any context. Why: roles differ per alliance.
- Server code using supabaseAdmin must filter by activeAllianceId() from src/lib/tenant.ts. Why: admin client bypasses RLS.
- Cross-alliance data only via getGlobalEntries (src/lib/global.functions.ts), permission-checked and sanitized. Why: never leak operational details of other alliances.
