# Export LCA Model Snapshot Plugin

This plugin exports a read-only, solver-ready snapshot for a single Life Cycle Model.

## Scope

- Read-only export (no mutation, no computation).
- Uses existing Tiangong service APIs and logged-in session context.
- Export pipeline:
  - LifeCycleModel
  - process instances + links (model scope)
  - ProcessDataSet (inventories)
  - Flow
  - FlowProperty (reference flow property)
  - UnitGroup -> Unit
  - Snapshot JSON

## Files modified or added

### Plugin logic

- `plugins/export-lca-model/index.ts`
  - Snapshot export implementation.
  - Normalizes name fields (zh preferred, fallback en).
  - Adds `allocation_fraction` from exchange allocations.
  - Builds links strictly from LifeCycleModel connections, including multi-downstream links.
  - Resolves flow -> flow property -> unit group using `getReferenceUnitGroups`.
  - Exports unit groups referenced by flows and their units.

### UI trigger (LifeCycleModel page only)

- `src/pages/LifeCycleModels/Components/toolbar/viewIndex.tsx`
  - Icon-only export action with tooltip.
  - Calls `exportLcaModelSnapshot({ modelId, modelVersion })`.

- `src/pages/LifeCycleModels/Components/toolbar/editIndex.tsx`
  - Same export action in edit toolbar.

### i18n strings

- `src/locales/en-US/pages_model.ts`
- `src/locales/zh-CN/pages_model.ts`

### Tests (mocks)

- `tests/unit/pages/LifeCycleModels/Components/toolbar/editIndex.test.tsx`
  - Mocks `exportLcaModelSnapshot` and `ExportOutlined`.

## Notes

- No new backend controllers or APIs.
- No new auth logic.
- Links are derived only from LifeCycleModel connections (not from inventories).
