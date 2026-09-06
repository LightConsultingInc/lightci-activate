
## Caveat: the reset wipes every org

`tests/00-reset.spec.ts` calls `POST /api/admin/seed/reset`, which truncates all tables and reseeds the Meridian demo. Any extra client you provisioned locally (for example the fresh "Northgate Advisory" org from `scripts/fresh-client.mjs`) disappears; re-run that script afterwards. People who sign in before their org exists are linked automatically on their next request once the org row is back.
