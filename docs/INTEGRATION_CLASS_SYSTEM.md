# Class/Leveling integration

The locked ClassSystemAetherius snapshot is an external authority and is not modified.

## Verified contract differences

- `shared/bestiaryData.ts` supplies the exact XP category keys recorded in `src/contracts/types.mjs`.
- `server/levelingSystem.ts` currently consumes a kill shape containing `victimName`/`victimBaseXp` and calls `findBestiaryEntry`; it then calculates and awards XP. That is incompatible with the V2 event boundary unless a bridge maps the new exact `xpCategory` and keeps all reward calculations in ClassSystem.
- `shared/levelingMath.ts` contains the existing XP, Delta, Party, fatigue, and progression formulas. None are copied into this repository.
- `shared/types.ts` contains the current `CombatKillEvent` shape; it is not treated as the V2 event schema.

## Runtime category negotiation

`AetheriusLevelingSystem.createAetheriusEnemySystemXpContract` derives categories and family
mappings from enabled JSON profiles. The host injects that object into `EnemyScanner`, so mod-added
families do not require a source-code enum or a fixed plugin position. The scanner's defaults match
the current approved 52-category catalog, including the MEDIUM Ice Wraith and Thalmor categories.

## Bridge contract

The Enemy System publishes `aetherius.enemy.killed.v1` with an exact configured category or `xpEligible = false`, `combatLevel` 1..100, and a versioned `ProgressionContext`. It never publishes `xpReward`, `finalXp`, Delta, ContentRelevance, Party modifier, or fatigue modifier.

An integration consumer must reject an event whose `progressionContext.valid` is false when progression integration requires an authoritative range. It must not fall back to victim-name fuzzy matching or the existing unknown-enemy reward fallback.
