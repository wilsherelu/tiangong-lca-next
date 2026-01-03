import { getFlowDetail } from '../../src/services/flows/api';
import { getFlowpropertyDetail } from '../../src/services/flowproperties/api';
import { getLifeCycleModelDetail } from '../../src/services/lifeCycleModels/api';
import { getProcessDetail } from '../../src/services/processes/api';
import { getUnitGroupDetail } from '../../src/services/unitgroups/api';

type ExportParams = {
  modelId: string;
  modelVersion: string;
  tiangongCommit?: string;
};

type Snapshot = {
  model: {
    model_id: string;
    model_uuid?: string | null;
    model_name?: unknown;
    export_time: string;
    tiangong_commit?: string | null;
    schema_version?: string | null;
  };
  processes: Array<{
    process_uuid: string;
    process_name?: unknown;
    reference_product_flow_uuid?: string | null;
    reference_amount?: unknown;
    reference_unit_uuid?: string | null;
  }>;
  flows: Array<{
    flow_uuid: string;
    flow_name?: unknown;
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
    unit_uuid?: string | null;
    is_reference_product?: boolean;
    provider_process_uuid?: string | null;
  }>;
  flow_properties: Array<{
    flow_property_uuid: string;
    flow_property_name?: unknown;
    unit_group_uuid?: string | null;
  }>;
  unit_groups: Array<{
    unit_group_uuid: string;
    unit_group_name?: unknown;
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

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const readValue = (value: any): any => {
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value;
  }
  return value;
};

const readAttr = (value: any): any => {
  if (value && typeof value === 'object' && '@value' in value) {
    return value['@value'];
  }
  return value;
};

const pickExchangeAmount = (exchange: any) => {
  const resulting = readValue(exchange?.resultingAmount);
  const mean = readValue(exchange?.meanAmount);
  const numericResulting = Number(resulting);
  if (resulting !== undefined && resulting !== null && !Number.isNaN(numericResulting)) {
    if (numericResulting !== 0) {
      return resulting;
    }
  }
  return mean;
};

const findReferenceExchange = (exchanges: any[], referenceFlowId?: string | null) => {
  if (referenceFlowId) {
    const match = exchanges.find(
      (exchange) => exchange?.referenceToFlowDataSet?.['@refObjectId'] === referenceFlowId,
    );
    if (match) {
      return match;
    }
  }
  return exchanges.find((exchange) => exchange?.quantitativeReference);
};

const extractFlowPropertyRef = (flowJson: any) => {
  const flowDataSet = flowJson?.flowDataSet;
  const referenceInternalId = readValue(
    flowDataSet?.flowInformation?.quantitativeReference?.referenceToReferenceFlowProperty,
  );
  const flowProperties = toArray(flowDataSet?.flowProperties?.flowProperty);
  const referenceProperty = flowProperties.find(
    (property) => readValue(property?.['@dataSetInternalID']) === referenceInternalId,
  );
  const refDataSet = referenceProperty?.referenceToFlowPropertyDataSet;
  return {
    flowPropertyId: refDataSet?.['@refObjectId'],
    flowPropertyVersion: refDataSet?.['@version'],
  };
};

const extractReferenceUnitGroupRef = (flowPropertyJson: any) => {
  const ref = flowPropertyJson?.flowPropertyDataSet?.flowPropertiesInformation
    ?.quantitativeReference?.referenceToReferenceUnitGroup;
  return {
    unitGroupId: ref?.['@refObjectId'],
    unitGroupVersion: ref?.['@version'],
  };
};

const getUnitGroupReferenceUnit = (unitGroupJson: any) => {
  const refUnit = unitGroupJson?.unitGroupDataSet?.unitGroupInformation?.quantitativeReference
    ?.referenceToReferenceUnit;
  return readValue(refUnit) ?? readAttr(refUnit) ?? null;
};

export async function exportLcaModelSnapshot(params: ExportParams): Promise<Snapshot> {
  const { modelId, modelVersion, tiangongCommit } = params;
  const modelDetail = await getLifeCycleModelDetail(modelId, modelVersion);
  if (!modelDetail.success) {
    throw new Error('Failed to load lifecycle model');
  }

  const modelJson = modelDetail.data?.json;
  const modelDataSet = modelJson?.lifeCycleModelDataSet;

  const processInstances = toArray(
    modelDataSet?.lifeCycleModelInformation?.technology?.processes?.processInstance,
  );
  const processInstanceById = new Map<string, any>();
  const processRefs: Array<{ id: string; version?: string }> = [];

  processInstances.forEach((instance) => {
    const instanceId = instance?.['@id'];
    if (instanceId) {
      processInstanceById.set(instanceId, instance);
    }
    const ref = instance?.referenceToProcess;
    const refId = ref?.['@refObjectId'];
    if (refId) {
      processRefs.push({ id: refId, version: ref?.['@version'] });
    }
  });

  const processDetails = await Promise.all(
    processRefs.map((ref) => getProcessDetail(ref.id, ref.version ?? '')),
  );

  const processById = new Map<string, any>();
  processDetails.forEach((result) => {
    if (result?.success && result?.data?.id) {
      processById.set(result.data.id, result.data);
    }
  });

  const links: Snapshot['links'] = [];
  processInstances.forEach((instance) => {
    const providerProcessId = instance?.referenceToProcess?.['@refObjectId'];
    const outputExchanges = toArray(instance?.connections?.outputExchange);
    outputExchanges.forEach((outputExchange) => {
      const consumerInstanceId = outputExchange?.downstreamProcess?.['@id'];
      if (!providerProcessId || !consumerInstanceId) {
        return;
      }
      const consumerInstance = processInstanceById.get(consumerInstanceId);
      const consumerProcessId = consumerInstance?.referenceToProcess?.['@refObjectId'];
      if (!consumerProcessId) {
        return;
      }
      links.push({
        consumer_process_uuid: consumerProcessId,
        provider_process_uuid: providerProcessId,
        flow_uuid: outputExchange?.['@flowUUID'] ?? null,
      });
    });
  });

  const linkLookup = new Map<string, string>();
  links.forEach((link) => {
    if (link.flow_uuid) {
      linkLookup.set(`${link.consumer_process_uuid}:${link.flow_uuid}`, link.provider_process_uuid);
    }
  });

  const processes: Snapshot['processes'] = [];
  const exchanges: Snapshot['exchanges'] = [];
  const flowRefs = new Map<string, { id: string; version?: string }>();

  processById.forEach((processData) => {
    const processJson = processData.json;
    const dataSetInfo =
      processJson?.processDataSet?.processInformation?.dataSetInformation ?? {};
    const processId = processData.id;
    const processName = dataSetInfo?.name;

    const processReferenceFlowId = readValue(
      processJson?.processDataSet?.processInformation?.quantitativeReference
        ?.referenceToReferenceFlow,
    );
    const processExchanges = toArray(processJson?.processDataSet?.exchanges?.exchange);
    const referenceExchange = findReferenceExchange(processExchanges, processReferenceFlowId);
    const referenceFlowId =
      processReferenceFlowId ??
      referenceExchange?.referenceToFlowDataSet?.['@refObjectId'] ??
      null;

    const referenceAmount = referenceExchange ? pickExchangeAmount(referenceExchange) : null;

    processes.push({
      process_uuid: processId,
      process_name: processName,
      reference_product_flow_uuid: referenceFlowId,
      reference_amount: referenceAmount ?? null,
      reference_unit_uuid: null,
    });

    processExchanges.forEach((exchange) => {
      const flowId = exchange?.referenceToFlowDataSet?.['@refObjectId'];
      const flowVersion = exchange?.referenceToFlowDataSet?.['@version'];
      if (flowId) {
        flowRefs.set(flowId, { id: flowId, version: flowVersion });
      }
      const isReferenceProduct =
        Boolean(exchange?.quantitativeReference) || flowId === referenceFlowId;

      exchanges.push({
        exchange_id: readValue(exchange?.['@dataSetInternalID']) ?? null,
        process_uuid: processId,
        flow_uuid: flowId ?? null,
        direction: exchange?.exchangeDirection,
        amount: pickExchangeAmount(exchange),
        unit_uuid: null,
        is_reference_product: isReferenceProduct,
        provider_process_uuid: flowId
          ? linkLookup.get(`${processId}:${flowId}`) ?? null
          : null,
      });
    });
  });

  const flowDetails = await Promise.all(
    Array.from(flowRefs.values()).map((ref) => getFlowDetail(ref.id, ref.version ?? '')),
  );

  const flowById = new Map<string, any>();
  flowDetails.forEach((result) => {
    if (result?.success && result?.data?.id) {
      flowById.set(result.data.id, result.data);
    }
  });

  const flowPropertyRefs = new Map<string, { id: string; version?: string }>();
  const flows: Snapshot['flows'] = [];

  flowById.forEach((flowData) => {
    const flowJson = flowData.json;
    const flowDataSet = flowJson?.flowDataSet;
    const flowInfo = flowDataSet?.flowInformation;
    const flowId = flowData.id;

    const flowPropertyRef = extractFlowPropertyRef(flowJson);
    if (flowPropertyRef.flowPropertyId) {
      flowPropertyRefs.set(flowPropertyRef.flowPropertyId, {
        id: flowPropertyRef.flowPropertyId,
        version: flowPropertyRef.flowPropertyVersion,
      });
    }

    flows.push({
      flow_uuid: flowId,
      flow_name: flowInfo?.dataSetInformation?.name,
      flow_type: flowDataSet?.modellingAndValidation?.LCIMethod?.typeOfDataSet ?? null,
      default_unit_uuid: null,
      unit_group_uuid: null,
    });
  });

  const flowPropertyDetails = await Promise.all(
    Array.from(flowPropertyRefs.values()).map((ref) =>
      getFlowpropertyDetail(ref.id, ref.version ?? ''),
    ),
  );

  const flowPropertyById = new Map<string, any>();
  flowPropertyDetails.forEach((result) => {
    if (result?.success && result?.data?.id) {
      flowPropertyById.set(result.data.id, result.data);
    }
  });

  const unitGroupRefs = new Map<string, { id: string; version?: string }>();
  const flowProperties: Snapshot['flow_properties'] = [];

  flowPropertyById.forEach((flowPropertyData) => {
    const flowPropertyJson = flowPropertyData.json;
    const info = flowPropertyJson?.flowPropertyDataSet?.flowPropertiesInformation;
    const flowPropertyId = flowPropertyData.id;
    const unitGroupRef = extractReferenceUnitGroupRef(flowPropertyJson);

    if (unitGroupRef.unitGroupId) {
      unitGroupRefs.set(unitGroupRef.unitGroupId, {
        id: unitGroupRef.unitGroupId,
        version: unitGroupRef.unitGroupVersion,
      });
    }

    flowProperties.push({
      flow_property_uuid: flowPropertyId,
      flow_property_name: info?.dataSetInformation?.['common:name'],
      unit_group_uuid: unitGroupRef.unitGroupId ?? null,
    });
  });

  const unitGroupDetails = await Promise.all(
    Array.from(unitGroupRefs.values()).map((ref) => getUnitGroupDetail(ref.id, ref.version ?? '')),
  );

  const unitGroupById = new Map<string, any>();
  unitGroupDetails.forEach((result) => {
    if (result?.success && result?.data?.id) {
      unitGroupById.set(result.data.id, result.data);
    }
  });

  const unitGroups: Snapshot['unit_groups'] = [];
  const units: Snapshot['units'] = [];

  unitGroupById.forEach((unitGroupData) => {
    const unitGroupJson = unitGroupData.json;
    const unitGroupId = unitGroupData.id;
    const unitGroupInfo = unitGroupJson?.unitGroupDataSet?.unitGroupInformation;
    const unitGroupName = unitGroupInfo?.dataSetInformation?.['common:name'];
    const referenceUnitId = getUnitGroupReferenceUnit(unitGroupJson);
    const unitList = toArray(unitGroupJson?.unitGroupDataSet?.units?.unit);

    unitGroups.push({
      unit_group_uuid: unitGroupId,
      unit_group_name: unitGroupName,
      reference_unit_uuid: referenceUnitId ?? null,
    });

    unitList.forEach((unit) => {
      units.push({
        unit_uuid: readValue(unit?.['@dataSetInternalID']) ?? null,
        unit_name: unit?.name,
        unit_group_uuid: unitGroupId,
        conversion_factor_to_reference: readValue(unit?.meanValue),
      });
    });
  });

  const flowPropertyByFlowId = new Map<string, string>();
  flowById.forEach((flowData) => {
    const flowPropertyRef = extractFlowPropertyRef(flowData.json);
    if (flowPropertyRef.flowPropertyId) {
      flowPropertyByFlowId.set(flowData.id, flowPropertyRef.flowPropertyId);
    }
  });

  const unitGroupByFlowPropertyId = new Map<string, string>();
  flowPropertyById.forEach((flowPropertyData) => {
    const ref = extractReferenceUnitGroupRef(flowPropertyData.json);
    if (ref.unitGroupId) {
      unitGroupByFlowPropertyId.set(flowPropertyData.id, ref.unitGroupId);
    }
  });

  const referenceUnitByUnitGroupId = new Map<string, string>();
  unitGroupById.forEach((unitGroupData) => {
    const refUnitId = getUnitGroupReferenceUnit(unitGroupData.json);
    if (refUnitId) {
      referenceUnitByUnitGroupId.set(unitGroupData.id, refUnitId);
    }
  });

  flows.forEach((flow) => {
    const flowPropertyId = flowPropertyByFlowId.get(flow.flow_uuid);
    const unitGroupId = flowPropertyId ? unitGroupByFlowPropertyId.get(flowPropertyId) : undefined;
    flow.unit_group_uuid = unitGroupId ?? null;
    flow.default_unit_uuid = unitGroupId
      ? referenceUnitByUnitGroupId.get(unitGroupId) ?? null
      : null;
  });

  const processRefUnitByFlow = new Map<string, string>();
  flows.forEach((flow) => {
    if (flow.flow_uuid && flow.default_unit_uuid) {
      processRefUnitByFlow.set(flow.flow_uuid, flow.default_unit_uuid);
    }
  });

  exchanges.forEach((exchange) => {
    if (exchange.flow_uuid) {
      exchange.unit_uuid = processRefUnitByFlow.get(exchange.flow_uuid) ?? null;
    }
  });

  processes.forEach((process) => {
    if (process.reference_product_flow_uuid) {
      process.reference_unit_uuid =
        processRefUnitByFlow.get(process.reference_product_flow_uuid) ?? null;
    }
  });

  return {
    model: {
      model_id: modelId,
      model_uuid:
        modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.['common:UUID'] ?? null,
      model_name: modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name ?? null,
      export_time: new Date().toISOString(),
      tiangong_commit: tiangongCommit ?? null,
      schema_version: modelDataSet?.['@version'] ?? null,
    },
    processes,
    flows,
    exchanges,
    flow_properties: flowProperties,
    unit_groups: unitGroups,
    units,
    links,
  };
}
