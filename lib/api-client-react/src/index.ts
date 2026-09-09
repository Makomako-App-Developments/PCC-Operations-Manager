export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setAuthTokenUpdater,
  customFetch,
  setOnUnauthorized,
  setRequestDiagnosticHandler,
} from "./custom-fetch";
export type {
  CustomFetchOptions,
  ErrorType,
  BodyType,
  RequestDiagnostic,
} from "./custom-fetch";
