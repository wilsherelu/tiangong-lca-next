import {
  getFlowpropertyDetail,
  getReferenceUnitGroups,
} from '../../src/services/flowproperties/api';
import { getFlowDetail } from '../../src/services/flows/api';
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

const pickLangText = (entries: any[]): string | null => {
  if (!entries.length) {
    return null;
  }
  const normalized = entries
    .map((entry) => ({
      text: entry?.['#text'],
      lang: entry?.['@xml:lang'],
    }))
    .filter((entry) => typeof entry.text === 'string' && entry.text.length > 0);
  if (!normalized.length) {
    return null;
  }
  const preferred = normalized.find(
    (entry) => entry.lang === 'zh' || entry.lang === 'zh-CN' || entry.lang === 'zh-cn',
  );
  if (preferred) {
    return preferred.text;
  }
  const english = normalized.find((entry) => entry.lang === 'en');
  return english?.text ?? normalized[0].text ?? null;
};

const normalizeName = (value: any): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return pickLangText(value);
  }
  if (value['#text']) {
    return value['#text'];
  }
  if (value.value) {
    return normalizeName(value.value);
  }
  if (value.baseName) {
    return normalizeName(value.baseName?.value ?? value.baseName);
  }
  if (value['common:name']) {
    return normalizeName(value['common:name']?.value ?? value['common:name']);
  }
  return null;
};

const getProcessInternalId = (instance: any): string | null =>
  instance?.['@dataSetInternalID'] ?? instance?.['@id'] ?? null;

const getDownstreamInternalId = (outputExchange: any): string | null =>
  outputExchange?.downstreamProcess?.['@id'] ??
  outputExchange?.downstreamProcess?.['@dataSetInternalID'] ??
  null;

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

const extractFlowPropertyRefs = (flowJson: any) => {
  const flowDataSet = flowJson?.flowDataSet;
  const referenceInternalId = readValue(
    flowDataSet?.flowInformation?.quantitativeReference?.referenceToReferenceFlowProperty,
  );
  const flowProperties = toArray(flowDataSet?.flowProperties?.flowProperty);
  const refs: Array<{ id: string; version?: string }> = [];
  flowProperties.forEach((property) => {
    const refId = property?.referenceToFlowPropertyDataSet?.['@refObjectId'];
    if (refId) {
      refs.push({
        id: refId,
        version: property?.referenceToFlowPropertyDataSet?.['@version'],
      });
    }
  });
  let referenceProperty = flowProperties.find((property) => {
    const internalId = readValue(property?.['@dataSetInternalID']);
    if (internalId === undefined || internalId === null || referenceInternalId === undefined) {
      return false;
    }
    return String(internalId) === String(referenceInternalId);
  });
  if (!referenceProperty) {
    referenceProperty = flowProperties.find((property) => property?.quantitativeReference === true);
  }
  if (!referenceProperty && flowProperties.length === 1) {
    referenceProperty = flowProperties[0];
  }
  const refDataSet = referenceProperty?.referenceToFlowPropertyDataSet;
  return {
    flowPropertyId: refDataSet?.['@refObjectId'],
    flowPropertyVersion: refDataSet?.['@version'],
    refs,
  };
};

const extractReferenceUnitGroupRef = (flowPropertyJson: any) => {
  const ref =
    flowPropertyJson?.flowPropertyDataSet?.flowPropertiesInformation?.quantitativeReference
      ?.referenceToReferenceUnitGroup;
  return {
    unitGroupId: ref?.['@refObjectId'],
    unitGroupVersion: ref?.['@version'],
  };
};

const getUnitGroupReferenceUnit = (unitGroupJson: any) => {
  const refUnit =
    unitGroupJson?.unitGroupDataSet?.unitGroupInformation?.quantitativeReference
      ?.referenceToReferenceUnit;
  return readValue(refUnit) ?? readAttr(refUnit) ?? null;
};

const ensure = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizeAmount = (value: any) => {
  const raw = readValue(value);
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
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
  const processInternalToUuid = new Map<string, string>();
  const processRefs: Array<{ id: string; version?: string }> = [];

  processInstances.forEach((instance) => {
    const instanceId = getProcessInternalId(instance);
    const ref = instance?.referenceToProcess;
    const refId = ref?.['@refObjectId'];
    if (refId) {
      processRefs.push({ id: refId, version: ref?.['@version'] });
      if (instanceId) {
        processInternalToUuid.set(instanceId, refId);
      }
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
      const consumerInstanceId = getDownstreamInternalId(outputExchange);
      if (!providerProcessId || !consumerInstanceId) {
        return;
      }
      const consumerProcessId = processInternalToUuid.get(consumerInstanceId);
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

  const processes: Snapshot['processes'] = [];
  const exchanges: Snapshot['exchanges'] = [];
  const flowRefs = new Map<string, { id: string; version?: string }>();

  processById.forEach((processData) => {
    const processJson = processData.json;
    const dataSetInfo = processJson?.processDataSet?.processInformation?.dataSetInformation ?? {};
    const processId = processData.id;
    const processName = normalizeName(dataSetInfo?.name);

    const processReferenceFlowId = readValue(
      processJson?.processDataSet?.processInformation?.quantitativeReference
        ?.referenceToReferenceFlow,
    );
    const processExchanges = toArray(processJson?.processDataSet?.exchanges?.exchange);
    const referenceExchange = findReferenceExchange(processExchanges, processReferenceFlowId);
    const referenceFlowId =
      processReferenceFlowId ?? referenceExchange?.referenceToFlowDataSet?.['@refObjectId'] ?? null;

    processes.push({
      process_uuid: processId,
      process_name: processName,
      reference_product_flow_uuid: referenceFlowId,
    });

    processExchanges.forEach((exchange) => {
      const flowId = exchange?.referenceToFlowDataSet?.['@refObjectId'];
      const flowVersion = exchange?.referenceToFlowDataSet?.['@version'];
      if (flowId) {
        flowRefs.set(flowId, { id: flowId, version: flowVersion });
      }
      const isReferenceProduct =
        Boolean(exchange?.quantitativeReference) || flowId === referenceFlowId;
      const amount = normalizeAmount(pickExchangeAmount(exchange));
      ensure(
        amount !== null,
        `Exchange amount invalid for process ${processId} flow ${flowId ?? 'unknown'}`,
      );
      const allocationFraction = exchange?.allocations?.allocation?.['@allocatedFraction'] ?? null;

      exchanges.push({
        exchange_id:
          exchange?.['@dataSetInternalID'] !== undefined &&
          exchange?.['@dataSetInternalID'] !== null
            ? String(readValue(exchange?.['@dataSetInternalID']))
            : null,
        process_uuid: processId,
        flow_uuid: flowId ?? null,
        direction: exchange?.exchangeDirection,
        amount,
        is_reference_product: isReferenceProduct,
        allocation_fraction: allocationFraction,
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
  const flowPropertyCandidatesByFlow = new Map<string, Array<{ id: string; version?: string }>>();
  const referenceFlowPropertyByFlow = new Map<string, string>();
  const flows: Snapshot['flows'] = [];

  flowById.forEach((flowData) => {
    const flowJson = flowData.json;
    const flowDataSet = flowJson?.flowDataSet;
    const flowInfo = flowDataSet?.flowInformation;
    const flowId = flowData.id;

    const flowPropertyRef = extractFlowPropertyRefs(flowJson);
    const candidates = flowPropertyRef.refs;
    if (candidates.length > 0) {
      flowPropertyCandidatesByFlow.set(flowId, candidates);
      candidates.forEach((candidate) => {
        flowPropertyRefs.set(candidate.id, candidate);
      });
    }
    if (flowPropertyRef.flowPropertyId) {
      flowPropertyRefs.set(flowPropertyRef.flowPropertyId, {
        id: flowPropertyRef.flowPropertyId,
        version: flowPropertyRef.flowPropertyVersion,
      });
      referenceFlowPropertyByFlow.set(flowId, flowPropertyRef.flowPropertyId);
      flowPropertyCandidatesByFlow.set(flowId, [
        { id: flowPropertyRef.flowPropertyId, version: flowPropertyRef.flowPropertyVersion },
      ]);
    }

    flows.push({
      flow_uuid: flowId,
      flow_name: normalizeName(flowInfo?.dataSetInformation?.name),
      flow_type: flowDataSet?.modellingAndValidation?.LCIMethod?.typeOfDataSet ?? null,
      default_unit_uuid: null,
      unit_group_uuid: null,
    });
  });

  Array.from(flowRefs.values()).forEach((ref) => {
    if (!flowById.has(ref.id)) {
      flows.push({
        flow_uuid: ref.id,
        flow_name: null,
        flow_type: null,
        default_unit_uuid: null,
        unit_group_uuid: null,
      });
    }
  });

  const flowPropertyRefsList = Array.from(flowPropertyRefs.values());
  const flowPropertyDetails = await Promise.all(
    flowPropertyRefsList.map((ref) => getFlowpropertyDetail(ref.id, ref.version ?? '')),
  );

  const flowPropertyById = new Map<string, any>();
  flowPropertyDetails.forEach((result) => {
    if (result?.success && result?.data?.id) {
      flowPropertyById.set(result.data.id, result.data);
    }
  });

  const referenceUnitGroupsRes = await getReferenceUnitGroups(
    flowPropertyRefsList.map((ref) => ({ id: ref.id, version: ref.version ?? '' })),
  );
  const referenceUnitGroups = Array.isArray(referenceUnitGroupsRes?.data)
    ? referenceUnitGroupsRes.data
    : [];
  const flowPropertyInfoById = new Map<
    string,
    { name?: any; refUnitGroupId?: string | null; version?: string }
  >();
  referenceUnitGroups.forEach((item: any) => {
    if (item?.id) {
      flowPropertyInfoById.set(item.id, {
        name: item?.name,
        refUnitGroupId: item?.refUnitGroupId ?? null,
        version: item?.version,
      });
    }
  });

  const unitGroupRefs = new Map<string, { id: string; version?: string }>();
  const flowProperties: Snapshot['flow_properties'] = [];

  flowPropertyRefsList.forEach((ref) => {
    const info = flowPropertyInfoById.get(ref.id);
    const fallback = flowPropertyById.get(ref.id);
    const flowPropertyJson = fallback?.json;
    const fallbackInfo = flowPropertyJson?.flowPropertyDataSet?.flowPropertiesInformation;
    const unitGroupRef = flowPropertyJson
      ? extractReferenceUnitGroupRef(flowPropertyJson)
      : { unitGroupId: null, unitGroupVersion: undefined };
    const unitGroupId = info?.refUnitGroupId ?? unitGroupRef.unitGroupId ?? null;
    const unitGroupVersion = unitGroupRef.unitGroupVersion ?? info?.version;

    if (unitGroupId) {
      unitGroupRefs.set(unitGroupId, { id: unitGroupId, version: unitGroupVersion });
    }

    flowProperties.push({
      flow_property_uuid: ref.id,
      flow_property_name: normalizeName(
        info?.name ?? fallbackInfo?.dataSetInformation?.['common:name'],
      ),
      unit_group_uuid: unitGroupId,
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
  const unitListByGroup = new Map<string, any[]>();

  unitGroupById.forEach((unitGroupData) => {
    const unitGroupJson = unitGroupData.json;
    const unitGroupId = unitGroupData.id;
    const unitGroupInfo = unitGroupJson?.unitGroupDataSet?.unitGroupInformation;
    const unitGroupName = normalizeName(unitGroupInfo?.dataSetInformation?.['common:name']);
    const referenceUnitId = getUnitGroupReferenceUnit(unitGroupJson);
    const unitList = toArray(unitGroupJson?.unitGroupDataSet?.units?.unit);

    unitGroups.push({
      unit_group_uuid: unitGroupId,
      unit_group_name: unitGroupName,
      reference_unit_uuid: referenceUnitId ?? null,
    });

    unitListByGroup.set(unitGroupId, unitList);
  });

  const unitGroupByFlowPropertyId = new Map<string, string>();
  flowPropertyInfoById.forEach((info, id) => {
    if (info?.refUnitGroupId) {
      unitGroupByFlowPropertyId.set(id, info.refUnitGroupId);
    }
  });
  flowPropertyById.forEach((flowPropertyData) => {
    if (unitGroupByFlowPropertyId.has(flowPropertyData.id)) {
      return;
    }
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

  const unitGroupByFlowId = new Map<string, string>();
  flows.forEach((flow) => {
    const referencePropertyId = referenceFlowPropertyByFlow.get(flow.flow_uuid);
    const referenceUnitGroupId = referencePropertyId
      ? unitGroupByFlowPropertyId.get(referencePropertyId)
      : undefined;
    if (referenceUnitGroupId) {
      unitGroupByFlowId.set(flow.flow_uuid, referenceUnitGroupId);
      flow.unit_group_uuid = referenceUnitGroupId;
      flow.default_unit_uuid = referenceUnitByUnitGroupId.get(referenceUnitGroupId) ?? null;
      return;
    }

    const candidates = flowPropertyCandidatesByFlow.get(flow.flow_uuid) ?? [];
    const candidateUnitGroups = Array.from(
      new Set(
        candidates
          .map((candidate) => unitGroupByFlowPropertyId.get(candidate.id))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const unitGroupId = candidateUnitGroups.length === 1 ? candidateUnitGroups[0] : undefined;
    if (unitGroupId) {
      unitGroupByFlowId.set(flow.flow_uuid, unitGroupId);
    }
    flow.unit_group_uuid = unitGroupId ?? null;
    flow.default_unit_uuid = unitGroupId
      ? (referenceUnitByUnitGroupId.get(unitGroupId) ?? null)
      : null;
  });

  const flowByUuid = new Map<string, Snapshot['flows'][number]>(
    flows.map((flow) => [flow.flow_uuid, flow]),
  );

  const referencedUnitGroups = new Set<string>();
  flows.forEach((flow) => {
    const unitGroupId = unitGroupByFlowId.get(flow.flow_uuid) ?? flow.unit_group_uuid;
    if (unitGroupId) {
      referencedUnitGroups.add(unitGroupId);
    }
  });

  exchanges.forEach((exchange) => {
    ensure(
      exchange.flow_uuid !== null,
      `Exchange flow_uuid missing for process ${exchange.process_uuid}`,
    );
    ensure(
      flowByUuid.has(exchange.flow_uuid as string),
      `Exchange flow_uuid not found in flows: ${exchange.flow_uuid}`,
    );
  });

  const units: Snapshot['units'] = [];
  unitListByGroup.forEach((unitList, unitGroupId) => {
    if (!referencedUnitGroups.has(unitGroupId)) {
      return;
    }
    unitList.forEach((unit) => {
      const unitId = readValue(unit?.['@dataSetInternalID']);
      if (!unitId) {
        return;
      }
      units.push({
        unit_uuid: String(unitId),
        unit_name: unit?.name,
        unit_group_uuid: unitGroupId,
        conversion_factor_to_reference: readValue(unit?.meanValue),
      });
    });
  });

  links.forEach((link) => {
    if (!link.flow_uuid) {
      return;
    }
    ensure(flowByUuid.has(link.flow_uuid), `Link flow_uuid not found in flows: ${link.flow_uuid}`);
  });

  return {
    model: {
      model_id: modelId,
      model_uuid:
        modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.['common:UUID'] ?? null,
      model_name: normalizeName(
        modelDataSet?.lifeCycleModelInformation?.dataSetInformation?.name ?? null,
      ),
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
