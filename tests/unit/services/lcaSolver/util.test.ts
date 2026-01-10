import { buildProcessLabels, lciaSolverResultToCsv } from '@/services/lcaSolver/util';

describe('lcaSolver util', () => {
  it('creates csv with method_en labels', () => {
    const csv = lciaSolverResultToCsv({
      indicator_index: [0, 1],
      process_index: ['proc-1', 'proc-2'],
      values: [
        [1, 2],
        [3, 4],
      ],
    });

    expect(csv).toBe('\ufeffmethod_en,proc-1,proc-2\nAcidification,1,2\nClimate change,3,4');
  });

  it('escapes csv cells when needed', () => {
    const csv = lciaSolverResultToCsv({
      indicator_index: ['ind,1', 'ind"2'],
      process_index: ['proc-1'],
      values: [[5], [6]],
    });

    expect(csv).toBe('\ufeffmethod_en,proc-1\n"ind,1",5\n"ind""2",6');
  });

  it('uses process labels when provided', () => {
    const csv = lciaSolverResultToCsv(
      {
        indicator_index: [0],
        process_index: ['proc-1'],
        values: [[7]],
      },
      { processLabels: ['Process A (per kg, proc-1)'] },
    );

    expect(csv).toBe('\ufeffmethod_en,"Process A (per kg, proc-1)"\nAcidification,7');
  });

  it('builds process labels with unit names', () => {
    const labels = buildProcessLabels(
      {
        model: { model_id: 'model-1', export_time: '2025-01-01T00:00:00.000Z' },
        processes: [
          {
            process_uuid: 'proc-1',
            process_name: 'Process A',
            reference_product_flow_uuid: 'ex-1',
          },
        ],
        flows: [
          {
            flow_uuid: 'flow-1',
            flow_name: 'Flow A',
            default_unit_uuid: 'unit-1',
            unit_group_uuid: 'group-1',
          },
        ],
        exchanges: [
          {
            exchange_id: 'ex-1',
            process_uuid: 'proc-1',
            flow_uuid: 'flow-1',
          },
        ],
        flow_properties: [],
        unit_groups: [
          { unit_group_uuid: 'group-1', unit_group_name: 'Group', reference_unit_uuid: 'unit-1' },
        ],
        units: [
          {
            unit_uuid: 'unit-1',
            unit_name: 'kg',
            unit_group_uuid: 'group-1',
          },
        ],
        links: [],
      },
      {
        indicator_index: [0],
        process_index: ['proc-1'],
        values: [[1]],
      },
    );

    expect(labels).toEqual(['Process A (per kg, proc-1)']);
  });

  it('falls back to reference product exchange', () => {
    const labels = buildProcessLabels(
      {
        model: { model_id: 'model-1', export_time: '2025-01-01T00:00:00.000Z' },
        processes: [
          {
            process_uuid: 'proc-1',
            process_name: 'Process A',
            reference_product_flow_uuid: 'missing-exchange',
          },
        ],
        flows: [
          {
            flow_uuid: 'flow-1',
            flow_name: 'Flow A',
            default_unit_uuid: 'unit-1',
            unit_group_uuid: 'group-1',
          },
        ],
        exchanges: [
          {
            exchange_id: 'ex-1',
            process_uuid: 'proc-1',
            flow_uuid: 'flow-1',
            is_reference_product: true,
          },
        ],
        flow_properties: [],
        unit_groups: [
          { unit_group_uuid: 'group-1', unit_group_name: 'Group', reference_unit_uuid: 'unit-1' },
        ],
        units: [
          {
            unit_uuid: 'unit-1',
            unit_name: 'kg',
            unit_group_uuid: 'group-1',
          },
        ],
        links: [],
      },
      {
        indicator_index: [0],
        process_index: ['proc-1'],
        values: [[1]],
      },
    );

    expect(labels).toEqual(['Process A (per kg, proc-1)']);
  });

  it('throws when product exchanges have mismatched unit groups', () => {
    expect(() =>
      buildProcessLabels(
        {
          model: { model_id: 'model-1', export_time: '2025-01-01T00:00:00.000Z' },
          processes: [
            {
              process_uuid: 'proc-1',
              process_name: 'Process A',
              reference_product_flow_uuid: 'ex-1',
            },
          ],
          flows: [
            {
              flow_uuid: 'flow-1',
              flow_name: 'Flow A',
              default_unit_uuid: 'unit-1',
              unit_group_uuid: 'group-1',
            },
            {
              flow_uuid: 'flow-2',
              flow_name: 'Flow B',
              default_unit_uuid: 'unit-2',
              unit_group_uuid: 'group-2',
            },
          ],
          exchanges: [
            {
              exchange_id: 'ex-1',
              process_uuid: 'proc-1',
              flow_uuid: 'flow-1',
              allocation_fraction: '10%',
            },
            {
              exchange_id: 'ex-2',
              process_uuid: 'proc-1',
              flow_uuid: 'flow-2',
              allocation_fraction: '5%',
            },
          ],
          flow_properties: [],
          unit_groups: [
            { unit_group_uuid: 'group-1', unit_group_name: 'Group', reference_unit_uuid: 'unit-1' },
            { unit_group_uuid: 'group-2', unit_group_name: 'Group', reference_unit_uuid: 'unit-2' },
          ],
          units: [
            { unit_uuid: 'unit-1', unit_name: 'kg', unit_group_uuid: 'group-1' },
            { unit_uuid: 'unit-2', unit_name: 'm3', unit_group_uuid: 'group-2' },
          ],
          links: [],
        },
        {
          indicator_index: [0],
          process_index: ['proc-1'],
          values: [[1]],
        },
      ),
    ).toThrow('产品单位不一致: proc-1');
  });
});
