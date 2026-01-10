import { exportLcaModelSnapshot } from '@/../plugins/export-lca-model';
import {
  runLciaSolver,
  runLciaSolverForModel,
  runLciaSolverForModelWithSnapshot,
} from '@/services/lcaSolver/api';

jest.mock('@/../plugins/export-lca-model', () => ({
  __esModule: true,
  exportLcaModelSnapshot: jest.fn(),
}));

const mockSnapshot = {
  model: {
    model_id: 'model-1',
    export_time: '2025-01-01T00:00:00.000Z',
  },
  processes: [],
  flows: [],
  exchanges: [],
  flow_properties: [],
  unit_groups: [],
  units: [],
  links: [],
};

describe('lcaSolver api', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts snapshot to the default solver endpoint', async () => {
    const mockResponse = { indicator_index: [], process_index: [], values: [] };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await runLciaSolver(mockSnapshot);

    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/v1/lcia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: mockSnapshot }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('posts snapshot to a custom solver endpoint', async () => {
    const mockResponse = { indicator_index: [], process_index: [], values: [] };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await runLciaSolver(mockSnapshot, 'http://example.com/v1/lcia');

    expect(global.fetch).toHaveBeenCalledWith('http://example.com/v1/lcia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: mockSnapshot }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('throws when the solver responds with a failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('boom'),
    });

    await expect(runLciaSolver(mockSnapshot)).rejects.toThrow(
      'LCIA solver request failed (500): boom',
    );
  });

  it('builds snapshot before calling solver for a model', async () => {
    const mockResponse = { indicator_index: [], process_index: [], values: [] };
    (exportLcaModelSnapshot as jest.Mock).mockResolvedValue(mockSnapshot);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await runLciaSolverForModel({
      modelId: 'model-1',
      modelVersion: '01.00.000',
      endpoint: 'http://example.com/v1/lcia',
    });

    expect(exportLcaModelSnapshot).toHaveBeenCalledWith({
      modelId: 'model-1',
      modelVersion: '01.00.000',
    });
    expect(global.fetch).toHaveBeenCalledWith('http://example.com/v1/lcia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: mockSnapshot }),
    });
    expect(result).toEqual(mockResponse);
  });

  it('returns snapshot alongside solver response', async () => {
    const mockResponse = { indicator_index: [], process_index: [], values: [] };
    (exportLcaModelSnapshot as jest.Mock).mockResolvedValue(mockSnapshot);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await runLciaSolverForModelWithSnapshot({
      modelId: 'model-1',
      modelVersion: '01.00.000',
    });

    expect(result).toEqual({ snapshot: mockSnapshot, result: mockResponse });
  });
});
