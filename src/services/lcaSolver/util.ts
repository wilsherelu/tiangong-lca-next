import type { LciaSolverResponse, Snapshot } from './data';
import { methodEnByIndex } from './indicatorIndex';

const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

type LciaCsvOptions = {
  processLabels?: string[];
};

const readTextValue = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = readTextValue(entry);
      if (text) {
        return text;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate['#text'] === 'string') {
      return candidate['#text'];
    }
    if (typeof candidate.value === 'string') {
      return candidate.value;
    }
    if (typeof candidate['@value'] === 'string') {
      return candidate['@value'];
    }
  }
  return null;
};

const parseAllocationFraction = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.endsWith('%')) {
      const numeric = Number(trimmed.slice(0, -1));
      return Number.isFinite(numeric) ? numeric / 100 : null;
    }
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

export const buildProcessLabels = (snapshot: Snapshot, result: LciaSolverResponse): string[] => {
  const normalizeId = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  };
  const processById = new Map(
    snapshot.processes.map((process) => [
      normalizeId(process.process_uuid),
      process.process_name ?? null,
    ]),
  );
  const flowById = new Map(snapshot.flows.map((flow) => [normalizeId(flow.flow_uuid), flow]));
  const unitGroupById = new Map(
    snapshot.unit_groups.map((group) => [
      normalizeId(group.unit_group_uuid),
      group.reference_unit_uuid !== null && group.reference_unit_uuid !== undefined
        ? normalizeId(group.reference_unit_uuid)
        : null,
    ]),
  );
  const unitByGroupAndId = new Map(
    snapshot.units.map((unit) => {
      const groupId = normalizeId(unit.unit_group_uuid);
      const unitId = normalizeId(unit.unit_uuid);
      return [`${groupId}:${unitId}`, unit];
    }),
  );
  const exchangesByProcess = new Map<string, Snapshot['exchanges']>();
  snapshot.exchanges.forEach((exchange) => {
    const list = exchangesByProcess.get(normalizeId(exchange.process_uuid)) ?? [];
    list.push(exchange);
    exchangesByProcess.set(normalizeId(exchange.process_uuid), list);
  });

  const unitNameByProcessId = new Map<string, string | null>();
  snapshot.processes.forEach((process) => {
    const processId = normalizeId(process.process_uuid);
    const rawRefId =
      process.reference_product_flow_uuid !== null &&
      process.reference_product_flow_uuid !== undefined
        ? normalizeId(process.reference_product_flow_uuid)
        : null;
    const processExchanges = exchangesByProcess.get(processId) ?? [];
    const productExchanges = processExchanges.filter((exchange) => {
      const allocation = parseAllocationFraction(exchange.allocation_fraction);
      return allocation !== null && allocation !== 0;
    });
    if (productExchanges.length > 1) {
      const unitGroupIds = new Set(
        productExchanges
          .map((exchange) => {
            const flowId = exchange.flow_uuid ? normalizeId(exchange.flow_uuid) : null;
            const flow = flowId ? flowById.get(flowId) : undefined;
            return flow?.unit_group_uuid ? normalizeId(flow.unit_group_uuid) : null;
          })
          .filter((value): value is string => Boolean(value)),
      );
      if (unitGroupIds.size > 1) {
        throw new Error(`产品单位不一致: ${processId}`);
      }
    }
    let flowId: string | null = null;
    if (rawRefId) {
      const matchByExchangeId = processExchanges.find(
        (exchange) => normalizeId(exchange.exchange_id) === rawRefId,
      );
      flowId = matchByExchangeId?.flow_uuid ? normalizeId(matchByExchangeId.flow_uuid) : null;
    }
    if (!flowId) {
      const referenceExchange = processExchanges.find((exchange) => exchange.is_reference_product);
      flowId = referenceExchange?.flow_uuid ? normalizeId(referenceExchange.flow_uuid) : null;
    }
    if (!flowId) {
      unitNameByProcessId.set(processId, null);
      return;
    }
    const flow = flowById.get(flowId);
    const unitGroupId = flow?.unit_group_uuid ? normalizeId(flow.unit_group_uuid) : null;
    const unitId =
      unitGroupId && unitGroupById.get(unitGroupId)
        ? unitGroupById.get(unitGroupId)
        : flow?.default_unit_uuid !== null && flow?.default_unit_uuid !== undefined
          ? normalizeId(flow.default_unit_uuid)
          : null;
    if (!unitId) {
      unitNameByProcessId.set(processId, null);
      return;
    }
    const unit = unitGroupId ? unitByGroupAndId.get(`${unitGroupId}:${normalizeId(unitId)}`) : null;
    const unitName = readTextValue(unit?.unit_name) ?? null;
    unitNameByProcessId.set(processId, unitName);
  });

  return (result.process_index ?? []).map((processIdRaw) => {
    const processId = normalizeId(processIdRaw);
    const name = processById.get(processId) ?? null;
    const unitName = unitNameByProcessId.get(processId) ?? null;
    const unitLabel = `per ${unitName ?? '-'}`;
    if (name) {
      return `${name} (${unitLabel}, ${processId})`;
    }
    return `${processId} (${unitLabel})`;
  });
};

const resolveMethodLabel = (indicator: string | number, rowIndex: number): string => {
  if (typeof indicator === 'number' && methodEnByIndex[indicator]) {
    return methodEnByIndex[indicator];
  }
  if (typeof indicator === 'string') {
    const parsed = Number(indicator);
    if (!Number.isNaN(parsed) && methodEnByIndex[parsed]) {
      return methodEnByIndex[parsed];
    }
    return indicator;
  }
  return methodEnByIndex[rowIndex] ?? String(indicator);
};

export const lciaSolverResultToCsv = (
  result: LciaSolverResponse,
  options: LciaCsvOptions = {},
): string => {
  const indicatorIndex = result.indicator_index ?? [];
  const processIndex = result.process_index ?? [];
  const values = result.values ?? [];
  const processLabels =
    options.processLabels && options.processLabels.length === processIndex.length
      ? options.processLabels
      : processIndex;

  const header = ['method_en', ...processLabels].map(escapeCsvCell).join(',');
  const rows = indicatorIndex.map((indicatorId, rowIndex) => {
    const rowValues = values[rowIndex] ?? [];
    const cells = [
      escapeCsvCell(resolveMethodLabel(indicatorId as any, rowIndex)),
      ...processLabels.map((_, colIndex) => escapeCsvCell(rowValues[colIndex])),
    ];
    return cells.join(',');
  });

  return `\ufeff${[header, ...rows].join('\n')}`;
};
