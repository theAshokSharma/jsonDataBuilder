// state.js : Manage all global variables

export const state = {
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
  selectedOptionsFile: null
};

export function updateState(updates) {
  Object.assign(state, updates);
}

export function getState(key) {
  return key ? state[key] : state;
}
