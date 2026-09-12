# Loot integration

This project does not generate loot. It only describes managed sources and supplies policy metadata to a future Aetherius Loot System.

Until that system is bound, a managed dungeon requests restoration of its source-defined loot composition only when a new dungeon generation begins or an explicit dungeon reset occurs. Loot is never restored again within the same generation. The future Loot System can replace this action through the adapter without changing dungeon discovery.

- `VANILLA`: preserve the source.
- `SUPPRESSED`: keep empty.
- `EXTERNAL`: neutralize original loot and keep empty until an external Loot System is present.
- `QUEST`: preserve content and script/alias semantics.

The fork audit found only type-level reloot prohibition in the current host. The project therefore does not disable all container reloot globally and does not claim granular runtime suppression until a host adapter or reviewed core patch exists.
