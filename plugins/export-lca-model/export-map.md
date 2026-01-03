# Tiangong → LCA Export Source Map (Frozen)

This document defines the authoritative data sources for exporting
a solver-ready LCA model snapshot from tiangong-lca-next.

It is a **data contract**, not an implementation guide.

---

## 1. Model Meta

- model_id  
  → lifecyclemodels table id (primary key)  
  → also available as lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation."common:UUID"  
  [Decision] Use table id as model_id; UUID may be exported as auxiliary metadata if needed.

- model_name  
  → lifeCycleModelDataSet.lifeCycleModelInformation.dataSetInformation.name  
  (stored in lifecyclemodels.json; formatting via util.ts is presentation-only)

- export_time  
  → runtime-generated at export

- tiangong_commit  
  → not available in codebase  
  [Decision] Inject at runtime from git / build environment if required

- schema_version  
  → lifeCycleModelDataSet["@version"] (e.g. "1.1")  
  [Decision] Treat as schema version; do NOT use package.json app version

---

## 2. Processes

- process_uuid  
  → processes table id  
  → processDataSet.processInformation.dataSetInformation."common:UUID"

- process_name  
  → processDataSet.processInformation.dataSetInformation.name

- reference_product_flow_uuid  
  → processDataSet.processInformation.quantitativeReference.referenceToReferenceFlow  
  → resolved via processDataSet.exchanges.exchange[].referenceToFlowDataSet["@refObjectId"]

- reference_amount  
  → quantitative reference exchange  
  → processDataSet.exchanges.exchange[].meanAmount / resultingAmount

- reference_unit_uuid  
  → resolved via flow → flowProperty → unitGroup chain  
  → see getUnitData('flow', ...) pipeline in util.ts

---

## 3. Exchanges (solver-oriented view, derived from processes)

- exchange_id  
  → processDataSet.exchanges.exchange[].@dataSetInternalID

- process_uuid  
  → parent process (processes table id / process UUID)

- flow_uuid  
  → processDataSet.exchanges.exchange[].referenceToFlowDataSet["@refObjectId"]

- direction  
  → processDataSet.exchanges.exchange[].exchangeDirection (input / output)

- amount  
  → processDataSet.exchanges.exchange[].meanAmount  
  → or resultingAmount if present and non-zero  
  [Note] util.ts falls back to meanAmount when resultingAmount is zero

- unit_uuid  
  → not stored on exchange  
  → resolved via:
    flow UUID  
    → flow property quantitative reference  
    → unit group quantitative reference  
    → reference unit UUID  
  [Decision] Use reference unit of the resolved unit group

- is_reference_product  
  → processDataSet.exchanges.exchange[].quantitativeReference  
  → and/or match against process quantitativeReference.referenceToReferenceFlow

- provider_process_uuid  
  → explicit model links if present  
  → otherwise implicitly derived from matching flows across processes  
  [Decision] Prefer explicit model links; fall back to implicit derivation

---

## 4. Units

- unit_uuid  
  → unitGroupDataSet.units.unit.@dataSetInternalID

- unit_name  
  → unitGroupDataSet.units.unit.name

- unit_group_uuid  
  → unitgroups table id  
  → unitGroupDataSet.unitGroupInformation.dataSetInformation."common:UUID"

- conversion_factor_to_reference  
  → unitGroupDataSet.units.unit.meanValue  
  [Assumption] meanValue represents factor to reference unit

---

## 5. Links (process–process relationships)

- consumer_process_uuid  
  → lifeCycleModelDataSet.lifeCycleModelInformation.technology.processes  
    .processInstance.connections.outputExchange.downstreamProcess["@id"]  
  → mapped to process UUID via processInstance.referenceToProcess["@refObjectId"]

- provider_process_uuid  
  → owning processInstance of outputExchange  
  → processInstance.referenceToProcess["@refObjectId"]

- flow_uuid  
  → outputExchange["@flowUUID"]

[Link Definition]

- Explicit: defined at model level via processInstance.connections.outputExchange  
- Implicit: derived by matching exchanges and flows when explicit links are absent

[Decision]
Prefer explicit model-level links if available; otherwise derive implicitly.

---

## Completion Criterion

With only the data defined in this document,
an external solver must be able to reconstruct:

- the full process graph
- exchange matrices (A/B)
- unit normalization context

without calling any internal tiangong calculation logic.
