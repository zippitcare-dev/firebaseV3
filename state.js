// state.js — Single source of truth for all app data
export const STATE = {
  user:     null,   // currently logged-in user object
  users:    [],     // all active users from Firebase

  settings: {
    packCategories:     [],  // [{id, model, size, bottlesPerPack}]
    labelSheets:        [],  // [{id, catId, labelsPerSheet, pricePerSheet}]
    expenseCategories:  [],  // [string]
    lowLabelAlertPacks: 5,   // alert threshold
  },

  batches:  [],   // inventory batches
  clients:  [],   // clients
  sales:    [],   // sales records
  expenses: [],   // expenses
  payments: [],   // payment records
};
