# SkyMP patches

No patch was applied to either SkyMP checkout.

## Future granular reloot capability

- Patch ID: `AES-RELOOT-GRANULAR-001`
- Status: `DEFERRED_TO_FUTURE_INTEGRATION_PROJECT`
- Reason: current audited APIs suppress reloot by base record type, while managed external loot requires reference/source-level suppression.
- Commit base: `a5ceec7ab58ec3bbe5d92da3974fdda894186253`
- Files observed: `skymp5-server/cpp/server_guest_lib/MpObjectReference.cpp`, `MpObjectReference.h`, `WorldState.cpp`, related change-form persistence.
- Before/after: currently an emptied managed container can schedule type-based reloot; desired behavior is a persisted, reference-scoped managed policy.
- Diff: intentionally not authored. The Enemy System now exposes host-neutral generation/reset and loot ports. The exact public hook, serialization field, and lifecycle point belong to the future definitive integration project and dedicated Aetherius Loot System.
- Compile/test: not applicable; no patch artifact claims to compile.
- Risk: global/type-level suppression can affect unrelated containers; persistence and client sync need host tests.
- ESL interaction: none expected, but source identity must remain load-order independent.
- Status remains PROPOSED until the host owner approves the API and supplies an integration test.
