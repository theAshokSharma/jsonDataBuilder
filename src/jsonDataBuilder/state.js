// state.js : Manage all global variables

const initialState = {
  currentSchema: null,
  formData: {},
  definitions: {},
  customOptions: {},
  conditionalRules: {},
  triggersToAffected: {},
  exclusiveOptionsMap: {},
  currentTab: null,
  tabContents: {},
  dataFilename: null,
  dataFilePath: '',
  selectedSchemaFile: null,
  selectedOptionsFile: null,
  dataTooltip: null,
  configTooltip: null,
  pendingDependentInits: {},
  polymorphicOptions: null,
  selectedPolymorphicType: null,
  schemaFileStatus: 'not-loaded',      // 'not-loaded', 'loaded', 'loaded-warning'
  optionsFileStatus: 'not-loaded',     // 'not-loaded', 'loaded', 'loaded-warning'
  dataFileStatus: 'not-loaded'         // 'not-loaded', 'loaded', 'loaded-warning'
};

export const state = { ...initialState };

export const resetState = () => {
  Object.assign(state, JSON.parse(JSON.stringify(initialState)));
};

export function updateState(updates) {
  Object.assign(state, updates);
}

export function getState(key) {
  return key ? state[key] : state;
}
