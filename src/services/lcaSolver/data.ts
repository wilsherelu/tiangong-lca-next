export type ExportParams = {
  modelId: string;
  modelVersion: string;
  tiangongCommit?: string;
};

export type Snapshot = {
  model: {
    model_id: string;
    model_uuid?: string | null;
    model_name?: string | null;
    export_time: string;
    tiangong_commit?: string | null;
    schema_version?: string | null;
  };
  processes: Array<{
    process_uuid: string;
    process_name?: string | null;
    reference_product_flow_uuid?: string | null;
  }>;
  flows: Array<{
    flow_uuid: string;
    flow_name?: string | null;
    flow_type?: unknown;
    default_unit_uuid?: string | null;
    unit_group_uuid?: string | null;
  }>;
  exchanges: Array<{
    exchange_id?: string | null;
    process_uuid: string;
    flow_uuid?: string | null;
    direction?: unknown;
    amount?: unknown;
    is_reference_product?: boolean;
    allocation_fraction?: unknown;
  }>;
  flow_properties: Array<{
    flow_property_uuid: string;
    flow_property_name?: string | null;
    unit_group_uuid?: string | null;
  }>;
  unit_groups: Array<{
    unit_group_uuid: string;
    unit_group_name?: string | null;
    reference_unit_uuid?: string | null;
  }>;
  units: Array<{
    unit_uuid?: string | null;
    unit_name?: unknown;
    unit_group_uuid: string;
    conversion_factor_to_reference?: unknown;
  }>;
  links: Array<{
    consumer_process_uuid: string;
    provider_process_uuid: string;
    flow_uuid?: string | null;
  }>;
};

export type LciaSolverRequest = {
  snapshot: Snapshot;
};

export type LciaSolverResponse = {
  indicator_index: string[];
  process_index: string[];
  values: number[][];
  mmr_path?: string | null;
  issues?: string[] | null;
};
