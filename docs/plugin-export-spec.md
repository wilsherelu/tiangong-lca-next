# Tiangong LCA Model Export – MVP Spec

## 1. Model Meta

- model_id
- model_name
- export_time
- tiangong_commit
- schema_version

## 2. Processes

- process_uuid
- process_name
- reference_product_flow_uuid
- reference_amount
- reference_unit_uuid

## 3. Flows

- flow_uuid
- flow_name
- flow_type (product / elementary)
- default_unit_uuid
- unit_group_uuid

## 4. Exchanges

- exchange_id
- process_uuid
- flow_uuid
- direction (input / output)
- amount
- unit_uuid
- is_reference_product
- provider_process_uuid (if any)

## 5. Units

- unit_uuid
- unit_name
- unit_group_uuid
- conversion_factor_to_reference

## 6. Links (optional but recommended)

- consumer_process_uuid
- provider_process_uuid
- flow_uuid

Completion Criterion:
With only the exported data defined in this document,
a solver must be able to fully reconstruct and compute the LCA model
without any dependency on the Tiangong platform.
