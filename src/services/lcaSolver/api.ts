import { exportLcaModelSnapshot } from '@/../plugins/export-lca-model';
import type { ExportParams, LciaSolverRequest, LciaSolverResponse, Snapshot } from './data';

const DEFAULT_SOLVER_URL = 'http://127.0.0.1:8000/v1/lcia';

const buildSolverRequest = (snapshot: Snapshot): LciaSolverRequest => ({
  snapshot,
});

const normalizeEndpoint = (endpoint?: string) => {
  if (endpoint && endpoint.trim().length > 0) {
    return endpoint;
  }
  return DEFAULT_SOLVER_URL;
};

export const runLciaSolver = async (
  snapshot: Snapshot,
  endpoint?: string,
): Promise<LciaSolverResponse> => {
  const url = normalizeEndpoint(endpoint);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSolverRequest(snapshot)),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (error) {
      console.error('Failed to read solver error response', error);
    }
    const message = detail
      ? `LCIA solver request failed (${response.status}): ${detail}`
      : `LCIA solver request failed (${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as LciaSolverResponse;
};

export const runLciaSolverForModel = async (
  params: ExportParams & { endpoint?: string },
): Promise<LciaSolverResponse> => {
  const { endpoint, ...snapshotParams } = params;
  const snapshot = await exportLcaModelSnapshot(snapshotParams);
  return runLciaSolver(snapshot, endpoint);
};

export const runLciaSolverForModelWithSnapshot = async (
  params: ExportParams & { endpoint?: string },
): Promise<{ snapshot: Snapshot; result: LciaSolverResponse }> => {
  const { endpoint, ...snapshotParams } = params;
  const snapshot = await exportLcaModelSnapshot(snapshotParams);
  const result = await runLciaSolver(snapshot, endpoint);
  return { snapshot, result };
};
