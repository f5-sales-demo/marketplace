import { expect, test } from 'bun:test';
import { projectReviewedDataSources } from '../src/reviewed-data-sources';

const fixture = () => {
  const data = {
    address: 'data.google_compute_image.observer',
    mode: 'data',
    type: 'google_compute_image',
    name: 'observer',
    provider_name: 'registry.terraform.io/hashicorp/google',
    schema_version: 0,
    values: {
      project: 'ubuntu-os-cloud',
      name: 'ubuntu-2404-noble-amd64-v20261021',
      image_id: '4996011480491275419',
      id: 'projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021',
    },
    sensitive_values: {},
  };
  const managed = {
    address: 'terraform_data.one',
    mode: 'managed',
    type: 'terraform_data',
    values: { id: 'original-managed' },
    sensitive_values: {},
  };
  return {
    configuration: {
      data: { google_compute_image: { observer: { project: data.values.project, name: data.values.name } } },
    },
    plan: {
      format_version: '1.2',
      terraform_version: '1.17.2',
      planned_values: { root_module: { resources: [structuredClone(data), managed] as [typeof data, typeof managed] } },
    },
    identity: {
      resources: [
        {
          mode: 'data',
          type: 'google_compute_image',
          name: 'observer',
          provider: 'provider["registry.terraform.io/hashicorp/google"]',
          instances: [{ schema_version: 0, attributes: structuredClone(data.values) }],
        },
      ],
    },
    state: {
      format_version: '1.0',
      terraform_version: '1.17.2',
      values: { root_module: { resources: [data, managed] as [typeof data, typeof managed] } },
    },
  };
};
const run = (f: ReturnType<typeof fixture>, operation?: 'destroy') =>
  projectReviewedDataSources(f.configuration, f.plan, f.identity, f.state, '1.17.2', operation);
test('compiled read-only data projection joins configuration, original saved plan and raw state without claiming ownership', () => {
  const f = fixture(),
    original = structuredClone(f);
  expect(run(f)).toEqual({
    ...f.state,
    values: { root_module: { resources: [f.state.values.root_module.resources[1]] } },
  });
  expect(f).toEqual(original);
});
test('reviewed data projection uses original prior state for a destroy plan', () => {
  const f = fixture();
  const prior = structuredClone(f.plan.planned_values);
  Object.assign(f.plan, { prior_state: { values: prior }, planned_values: { root_module: { resources: [] } } });
  expect(run(f, 'destroy')).toEqual({
    ...f.state,
    values: { root_module: { resources: [f.state.values.root_module.resources[1]] } },
  });
});
const cases: [string, (f: ReturnType<typeof fixture>) => void][] = [
  [
    'undeclared data',
    (f) => {
      Object.assign(f.configuration.data, { google_compute_image: {} });
    },
  ],
  [
    'changed declared name',
    (f) => {
      f.configuration.data.google_compute_image.observer.name = 'foreign';
    },
  ],
  [
    'changed pinned image identity',
    (f) => {
      f.state.values.root_module.resources[0].values.image_id = 'foreign';
    },
  ],
  [
    'changed provider',
    (f) => {
      f.state.values.root_module.resources[0].provider_name = 'registry.terraform.io/foreign/google';
    },
  ],
  [
    'missing original plan data',
    (f) => {
      f.plan.planned_values.root_module.resources.shift();
    },
  ],
  [
    'duplicate original plan data',
    (f) => {
      f.plan.planned_values.root_module.resources.push(structuredClone(f.plan.planned_values.root_module.resources[0]));
    },
  ],
  [
    'wrong raw mode',
    (f) => {
      f.identity.resources[0].mode = 'managed';
    },
  ],
  [
    'foreign raw source',
    (f) => {
      f.identity.resources[0].name = 'foreign';
    },
  ],
  [
    'ambiguous raw instances',
    (f) => {
      f.identity.resources[0].instances.push(structuredClone(f.identity.resources[0].instances[0]));
    },
  ],
  [
    'changed raw identity',
    (f) => {
      f.identity.resources[0].instances[0].attributes.image_id = 'foreign';
    },
  ],
  [
    'sensitive planned data',
    (f) => {
      Object.assign(f.plan.planned_values.root_module.resources[0].sensitive_values, { image_id: true });
    },
  ],
  [
    'sensitive observed data',
    (f) => {
      Object.assign(f.state.values.root_module.resources[0].sensitive_values, { name: true });
    },
  ],
  [
    'different Terraform version',
    (f) => {
      f.plan.terraform_version = '0.0.0';
    },
  ],
  [
    'unresolved configuration expression',
    (f) => {
      f.configuration.data.google_compute_image.observer.name = `${String.fromCharCode(36)}{var.image_name}`;
    },
  ],
  [
    'foreign nested module',
    (f) => {
      Object.assign(f.state.values.root_module, { child_modules: [{ resources: [] }] });
    },
  ],
];
for (const [name, change] of cases)
  test(`reviewed data source refuses ${name}`, () => {
    const f = fixture();
    change(f);
    expect(() => run(f)).toThrow();
  });

test('image omission retains explicitly selected receipt data for the existing sensitivity projector', () => {
  const f = fixture();
  const selected = {
    address: 'data.google_client_config.before',
    mode: 'data',
    type: 'google_client_config',
    name: 'before',
    values: { id: 'scope', access_token: 'PRIVATE_TOKEN' },
    sensitive_values: { access_token: true },
  };
  const configuration = { ...f.configuration, data: { ...f.configuration.data, google_client_config: { before: {} } } };
  const plan = {
    ...f.plan,
    planned_values: { root_module: { resources: [...f.plan.planned_values.root_module.resources, selected] } },
  };
  const state = {
    ...f.state,
    values: { root_module: { resources: [...f.state.values.root_module.resources, selected] } },
  };
  const identity = {
    resources: [
      ...f.identity.resources,
      { mode: 'data', type: selected.type, name: selected.name, instances: [{ attributes: selected.values }] },
    ],
  };
  expect(
    projectReviewedDataSources(configuration, plan, identity, state, '1.17.2', undefined, [selected.address]),
  ).toEqual({ ...state, values: { root_module: { resources: [f.state.values.root_module.resources[1], selected] } } });
});

const moreRefusals: [string, (f: ReturnType<typeof fixture>) => void][] = [
  [
    'raw provider alias',
    (f) => {
      f.identity.resources[0].provider = 'provider["registry.terraform.io/hashicorp/google"].foreign';
    },
  ],
  [
    'raw nested module',
    (f) => {
      Object.assign(f.identity.resources[0], { module: 'module.foreign' });
    },
  ],
  [
    'raw indexed instance',
    (f) => {
      Object.assign(f.identity.resources[0].instances[0], { index_key: 0 });
    },
  ],
  [
    'raw deposed instance',
    (f) => {
      Object.assign(f.identity.resources[0].instances[0], { deposed: 'old' });
    },
  ],
  [
    'raw sensitive attribute',
    (f) => {
      Object.assign(f.identity.resources[0].instances[0], { sensitive_attributes: [['image_id']] });
    },
  ],
  [
    'raw schema drift',
    (f) => {
      f.identity.resources[0].instances[0].schema_version = 1;
    },
  ],
  [
    'rendered schema drift',
    (f) => {
      f.state.values.root_module.resources[0].schema_version = 1;
    },
  ],
  [
    'plan schema drift',
    (f) => {
      f.plan.planned_values.root_module.resources[0].schema_version = 1;
    },
  ],
  [
    'raw version drift',
    (f) => {
      Object.assign(f.identity, { terraform_version: '0.0.0' });
    },
  ],
  [
    'plan nested module',
    (f) => {
      Object.assign(f.plan.planned_values.root_module, { child_modules: [{ resources: [] }] });
    },
  ],
  [
    'plan sensitivity missing',
    (f) => {
      Reflect.deleteProperty(f.plan.planned_values.root_module.resources[0], 'sensitive_values');
    },
  ],
  [
    'observed sensitivity missing',
    (f) => {
      Reflect.deleteProperty(f.state.values.root_module.resources[0], 'sensitive_values');
    },
  ],
  [
    'numeric image id',
    (f) => {
      Object.assign(f.state.values.root_module.resources[0].values, { image_id: 123 });
    },
  ],
  [
    'image family lookup',
    (f) => {
      Object.assign(f.configuration.data.google_compute_image.observer, { family: 'ubuntu-2404-lts-amd64' });
    },
  ],
  [
    'most recent lookup',
    (f) => {
      Object.assign(f.configuration.data.google_compute_image.observer, { most_recent: true });
    },
  ],
  [
    'state sensitivity malformed',
    (f) => {
      Object.assign(f.state.values.root_module.resources[0], { sensitive_values: 'false' });
    },
  ],
  [
    'changed plan image',
    (f) => {
      f.plan.planned_values.root_module.resources[0].values.image_id = '123';
    },
  ],
  [
    'changed plan provider',
    (f) => {
      f.plan.planned_values.root_module.resources[0].provider_name = 'registry.terraform.io/foreign/google';
    },
  ],
];
for (const [name, change] of moreRefusals)
  test(`reviewed image refuses ${name}`, () => {
    const f = fixture();
    change(f);
    expect(() => run(f)).toThrow();
  });
