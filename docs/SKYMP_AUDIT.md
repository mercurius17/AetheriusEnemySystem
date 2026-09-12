# SkyMP audit

Audited against the locked fork and upstream snapshots in `docs/SOURCE_LOCK.md`.

## Leveled lists and templates

- The fork's `LeveledListUtils::EvaluateList` uses a local `std::random_device`/`std::mt19937` roll, filters entries with `if (!pcLevel || entry.level <= pcLevel)`, and supports `UseAll` and `Chance None` at `skymp5-server/cpp/server_guest_lib/LeveledListUtils.cpp:17-69`.
- `EvaluateListRecurse` recursively expands nested lists, but has no visited-set/cycle guard at `:71-124`; missing child records are skipped. The new analyzer therefore has explicit cycle/missing reporting and never delegates production selection to this function.
- The fork's `EvaluateTemplateChain` can follow NPC -> NPC or NPC -> LVLN at `:126-223`; its template-list selection collapses multiple results to the first map entry and logs a warning.
- `MpActor::EnsureTemplateChainEvaluated` hardcodes `kPcLevel = 0` at `MpActor.cpp:1077-1177`. `WorldState::AttachEspmRecord` also evaluates a chain with `kPcLevel = 0` and attaches a direct `MpActor` for a placed `NPC_` at `WorldState.cpp:383-548` and `:650-682`. This confirms the documented risk and is treated as a host integration boundary, not a behavior to copy.
- `formView.ts:132-143` and `:617-624` consume a server-provided template chain; no client-side LVLN roll is promoted by this system.

## Load order and ESL/light IDs

- The fork adds source-aware mapping and light-plugin handling in `libespm/src/CombineBrowser.cpp:68-323`, including `0xFE` light namespaces, regular/light source metadata, master visibility, and winning lookup through candidates. `RuntimeFormId.h` names `PluginClass::Light` and the source metadata types.
- The upstream selected commit does not contain that `RuntimeFormId.h` surface and retains the older mapping implementation. The new system stores `plugin + local form ID` as canonical identity and never persists a runtime FormID alone.

## Death, respawn, and persistence

- `MpActor::Kill` publishes the server-side `DeathEvent` before `AddDeathItem` at `MpActor.cpp:1330-1348`.
- `RespawnWithDelay` increments an internal timer index, evaluates the death item again, may restore base inventory, and then calls `Respawn` at `MpActor.cpp:1350-1434`. The new `DeathBridge` is idempotent and does not alter this lifecycle.
- The fork persists change forms through `WorldState::RequestSave` and exposes `spawnDelay`, `spawnPoint`, and change-form state; this is sufficient evidence for an adapter seam but not for claiming that a new enemy identity is persisted by the host.

## Loot and reloot

- `MpObjectReference::RemoveItems` calls `RequestReloot` when a container becomes empty at `MpObjectReference.cpp:870-909`.
- `RequestReloot` consults `WorldState::IsRelootForbidden(baseType)` at `:1119-1143`; `WorldState::SetForbiddenRelootTypes` is type-level at `WorldState.cpp:1242-1256`, not a granular reference policy.
- A global container-type disable would exceed this task's safe scope. The project emits a fail-closed policy and records the need for a future granular host capability as review-required.

## Resulting integration decision

The standalone implementation is server-authoritative when called by a host adapter, deterministic across the same spawn generation, and fail-closed when host persistence/death hooks or authoritative profiles are absent. No SkyMP checkout is modified.
