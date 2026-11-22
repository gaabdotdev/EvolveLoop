export type {
  GoalDocument,
  GoalDocumentAcceptance,
  GoalDocumentStructuralChecks,
  GoalDocumentValidation,
} from "./types.js";
export { validateGoalDocumentStructural, validateGoalContractStructural } from "./validate.js";
export { buildGoalDocument } from "./build.js";
