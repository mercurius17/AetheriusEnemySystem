# Test report

The automated suite uses synthetic fixtures for list graphs, stable identities, profiles, pools, spawn generations, events, and loot policy. Synthetic fixtures are marked by their `Fixture.*` identities and are not production records.

Coverage includes the required acceptance cases for:

- regular/master/light/ESP-flagged identity model and load-order index changes;
- direct and nested LVLN, UseAll, chance-none, thresholds, multiplicity, missing records, and cycles;
- generic, boss-generic, boss-unique/quest exclusions, unresolved classification, Dragon Priest 100, and level 41..100;
- independent dungeon tiers and unassigned progression ranges;
- deterministic spawn, generation-only reroll, reconnect persistence, and server-side descriptors;
- exact XP categories, no unknown fallback, versioned death event, context validity, killer zero, and idempotency;
- external loot fail-closed, quest preservation, and no Loot System dependency;
- no write outside the new repository is part of the implementation workflow.

Final execution: 76 tests passed, 0 failed. The suite contains a 44-case acceptance matrix plus contract/unit and generated-data regression tests, including exact The Restless Dead authority discovery, global load-order dungeon coverage, all original 49 Hammet dungeons, canonical host resolution without persisted load-order indices, generation/reset loot restoration, user-authorized family/tier rules, unique-boss behavior, LVLN weighting, and actor-distinct death-event IDs. The real scan results are recorded in `IMPLEMENTATION_REPORT.md`.
