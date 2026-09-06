#!/usr/bin/env bash
# Puts a person back to "never onboarded": clears consent/placement/interviews/exercises and their workflow maps.
# Usage: ./scripts/reset-person.sh zain@northgateadvisory.demo
set -euo pipefail
EMAIL="$1"
docker exec lightci-activate psql -U postgres -d lightci_activate -v ON_ERROR_STOP=1 -Atc "
DO \$\$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM people WHERE email = lower('$EMAIL');
  IF pid IS NULL THEN RAISE EXCEPTION 'no person with email %', '$EMAIL'; END IF;
  DELETE FROM grades WHERE \"personId\" = pid;
  DELETE FROM submissions WHERE \"personId\" = pid;
  DELETE FROM revisits WHERE \"personId\" = pid;
  DELETE FROM coach_notes WHERE \"personId\" = pid;
  DELETE FROM mastery_snapshots WHERE \"personId\" = pid;
  DELETE FROM skill_adoptions WHERE \"personId\" = pid;
  DELETE FROM exercises WHERE \"personId\" = pid;
  DELETE FROM placements WHERE \"personId\" = pid;
  DELETE FROM measurements WHERE \"personId\" = pid;
  DELETE FROM baselines WHERE \"personId\" = pid;
  DELETE FROM interview_sessions WHERE \"personId\" = pid;
  DELETE FROM workflow_maps WHERE \"ownerPersonId\" = pid;
  DELETE FROM context_sources WHERE layer = 'person' AND \"ownerId\" = pid;
  DELETE FROM context_layers WHERE layer = 'person' AND \"ownerId\" = pid;
  DELETE FROM escalations WHERE \"subjectType\" = 'person' AND \"subjectId\" = pid;
  UPDATE people SET \"consentAt\" = NULL, \"onboardedAt\" = NULL, profile = '{}'::jsonb WHERE id = pid;
END \$\$;
SELECT email, \"consentAt\", \"onboardedAt\" FROM people WHERE email = lower('$EMAIL');"
