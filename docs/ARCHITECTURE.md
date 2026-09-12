# Architecture

The project is a dependency-free Node ESM boundary layer. The host supplies record snapshots and runtime callbacks; the project does not import private SkyMP symbols or guess event names.

## Stable identity

Records use `plugin filename + local form ID`. Runtime IDs and current plugin indices are resolved only at the adapter edge. No load-order index is persisted. The fork's source-aware ESL/light mapping is compatible with this model, while an unresolved namespace remains `UNRESOLVED`.

## Data flow

`houseCARL active-order LCTN/CELL winners -> global dungeon catalogue -> optional same-epoch ACHR/NPC/LVLN enrichment -> authoritative profile -> weighted SpawnResolver -> persisted SpawnResolutionV1 -> DeathBridge -> external Leveling consumer`

houseCARL supplies canonical cross-master identities and the true winning record at one verified load-order epoch. The local `PluginScanner` remains a fallback header/raw-record diagnostic and marks its namespace-derived identities provisional.

## Contracts

`src/contracts/types.mjs` owns versioned validation for EnemyDescriptorV1, ProgressionContextV1, DungeonProfileV1, and EnemyKilledEventV1 semantics. The implementation does not contain XP reward, Delta, ContentRelevance, Party, fatigue, or class-progression formulas.

For the 49 managed Hammet dungeons, `recommendedClassMin` and `recommendedClassMax` use the user-approved tier ranges 1–10, 10–20, 20–30, and 30–40. Other content remains null/UNASSIGNED until an authoritative profile supplies a valid 1..40 range. Enemy combat level is independently validated in 1..100; Dragon Priest is fixed at 100 after semantic classification.

## Runtime boundaries

- `src/spawning/resolver.mjs`: deterministic weighted server selection plus generation-aware persistence; missing family scope or source weights fail closed.
- `src/leveled-lists/analyzer.mjs`: complete synthetic graph semantics with cycle/missing safeguards; no player-level roll.
- `src/loot-integration/policy.mjs`: external/suppressed sources stay empty without Loot System; quest sources are preserved.
- `src/events/event-hub.mjs`: one versioned, idempotent death event with killer `0` preserved as no attributable killer.
- `src/adapters/skymp-adapter.mjs`: host callback injection only.
