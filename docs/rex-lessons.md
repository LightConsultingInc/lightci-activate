# Lessons from Rex (Pendo's internal skill marketplace) for Activate

Condensed from a read-only study of `../rex`. Activate must look distinct and lean toward education and governance, but these mechanics are proven.

## Governance mechanics to adopt
- **Judgements badge, mechanical guards block.** Risk level, verification and grade are badges plus ranking terms. Only mechanical futility (e.g. proposing against a syncing fork) hard-blocks, and then as a redirect to the working path, never a dead-end error. Activate adds one exception: the highest exposure tier (restricted data classes) stays hard-gated behind compliance approval, because Activate promises real governance.
- **Risk classification** on every content change: refuse outright bundled scripts, injection patterns, hidden files; classify Standard / Elevated / Restricted; declared tools set a floor the classifier cannot go below; the level attaches to the exact content hash so edits are rescanned. "Unscanned" is a fourth honest state, badged not hidden.
- **Verification is separate from risk**: a named person signs a specific version; an edit resets it. Security reviewer role must not outrank viewer so it cannot self-escalate.
- **Ownership resolved server-side** from the authenticated identity, never from a client field. Promoting a plugin auto-publishes member skills you own and hard-stops on ones you do not.
- **Propose = pull request**: a diff against someone else's record, mergeable by the owner; read-visibility (not authorship) gates installing a proposal tip.

## Content contract
- Three frontmatter layers: author-written (`name`, `description`), server-mirrored (version, author, homepage), and governance-owned metadata (`activate-id`, `activate-version`, `activate-owner`) that is the only thing code reads back. Humans never write layers 2 and 3.
- **Deny-list vs warn-list are disjoint sets** (test that they never intersect). Deny: claims only the platform can make, capability-granting keys like `hooks`, secret-shaped keys. Warn: per-destination compatibility (e.g. Anthropic's six-field upload spec). Compatibility is per destination, never a global banlist.
- Category and tags live in the database, written through exactly one door.

## Delivery
- Database is canonical; the GitHub marketplace repo is a regenerated projection. Git is never load-bearing for delivery. Only plugins are projected (the plugin is the vehicle, the skill is cargo).
- Version handles are content-addressed and retained forever; `v6` and `pr1` both resolve through one function so label and bytes never diverge.
- Distinguish curation-freeze (which members) from content-freeze (which bytes); Activate should ship the lockfile Rex left as a gap (`SkillVersion` pins).

## MCP surface
- Small stable roster; no `create` verb (authoring happens in the conversation, publish/submit mints the record).
- **Behavioural rules go in tool descriptions and per-parameter descriptions**, never in server `instructions` (2 KB cap, tail-truncated, not read by claude.ai). A rule about one argument belongs on that argument's schema description: measured 26/26 vs 0/28 compliance.
- Every `_app` tool mounts the same single-file SPA resource; the SPA fetches through an app-only broker tool. Hand-rolled widgets are dead weight.
- **Three renderers, one payload**: web, MCP App, plain text. If a card shows a number the payload carries it; never derive in a renderer.
- Write tools perform the write on call, so they carry a "call only after the user confirmed" gate; seeded-form tools must not copy that gate. One `_app` call per user turn.
- Inject identity/onboarding context into the first tool result rather than mandating a profile call.

## UI patterns worth adopting (Activate should look different, but these hold)
1. One canonical card component reused across every shelf via props.
2. Cover crossfades over a category-colour gradient so mixed shelves read as one family.
3. Version numbers and low-priority metadata hidden at rest, revealed on hover/detail: the resting card has a field budget.
4. Teleported hover popover so shelf overflow never clips.
5. App-wide quick-look drawer, swapped in place, with the full page one click away.
6. Per-affordance motion policy, documented (most motion honours reduced-motion).
7. Illustrated, cause-specific empty states; a failed fetch never renders as "empty".
8. Zero-result search falls back to a discovery slate, never a blank.
9. Admin tabs carry their own role floor enforced at the API and the UI.
10. A small-caps eyebrow typography token for section labels.
11. Trust/risk badges ride on the card itself.
12. Collapsed panels show a count so "closed" differs from "empty".

## Metrics
- "Active" = acquired a capability or contributed one; navigation and machine events excluded by construction (an `actor_type` column, not an event denylist). WAU is the headline, not DAU. Activate's own "active on real work" comes from the Claude Analytics definition, and library activity should follow the Rex rule.
- Ranking: log signal spread per slate, not just weights; no ranking change without an eval.
