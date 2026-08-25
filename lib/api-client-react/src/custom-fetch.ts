export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

let _baseUrl = "";
let _authTokenGetter: (() => string | null | Promise<string | null>) | null = null;
export type RequestDiagnostic = {
  method: string;
  endpoint: string;
  jobId?: string;
  durationMs: number;
  status?: number;
  retryCount: number;
  failureCategory?: "network" | "timeout" | "http_4xx" | "http_5xx" | "parse";
};
let _requestDiagnosticHandler: ((diagnostic: RequestDiagnostic) => void) | null = null;

export function setRequestDiagnosticHandler(
  handler: ((diagnostic: RequestDiagnostic) => void) | null,
): void {
  _requestDiagnosticHandler = handler;
}

function safeEndpoint(url: string): { endpoint: string; jobId?: string } {
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const match = path.match(/^\/api\/(jobs|assets)\/([^/]+)/);
  if (match && /^[0-9a-f-]{8,}$/i.test(match[2])) {
    return { endpoint: path.replace(match[2], ":id"), jobId: match[2] };
  }
  if (path === "/api/schedule/week") return { endpoint: path };
  return { endpoint: path.replace(/\/[0-9a-f-]{8,}/gi, "/:id") };
}

function failureCategory(error: unknown): RequestDiagnostic["failureCategory"] {
  if (error instanceof ApiError) {
    if (error.status >= 500) return "http_5xx";
    if (error.status >= 400) return "http_4xx";
  }
  if (error instanceof ResponseParseError) return "parse";
  if (error instanceof Error && /timeout|timed out|abort/i.test(error.message)) return "timeout";
  return "network";
}

export function setBaseUrl(url: string): void {
  _baseUrl = url.replace(/\/$/, "");
}

export function setAuthTokenGetter(
  getter: () => string | null | Promise<string | null>,
): void {
  _authTokenGetter = getter;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body == null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType =
    responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            "Use responseType \"json\" or \"text\" instead.",
        );
      }
      return response.blob();
  }
}

let _refreshing: Promise<boolean> | null = null;
let _onUnauthorized: (() => void) | null = null;

/** Called when a 401 cannot be recovered by token refresh (e.g. expired session on mobile). */
export function setOnUnauthorized(cb: () => void): void {
  _onUnauthorized = cb;
}

async function tryRefreshToken(baseUrl: string): Promise<boolean> {
  try {
    const refreshUrl = baseUrl ? `${baseUrl}/api/auth/refresh` : "/api/auth/refresh";
    const res = await fetch(refreshUrl, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
  _retry = false,
): Promise<T> {
  const { responseType = "auto", headers: headersInit, ...init } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);

  if (
    typeof init.body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(init.body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  let resolvedUrl = resolveUrl(input);
  if (_baseUrl && !resolvedUrl.startsWith("http")) {
    resolvedUrl = `${_baseUrl}${resolvedUrl.startsWith("/") ? "" : "/"}${resolvedUrl}`;
    input = resolvedUrl;
  }

  let authToken: string | null = null;
  if (_authTokenGetter) {
    authToken = await Promise.resolve(_authTokenGetter());
  }
  if (authToken) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  const requestInfo = { method, url: resolvedUrl };
  const credentials = authToken ? ("omit" as const) : ("include" as const);

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(input, { ...init, method, headers, credentials });
  } catch (error) {
    const safe = safeEndpoint(resolvedUrl);
    _requestDiagnosticHandler?.({
      method, ...safe, durationMs: Math.round(performance.now() - startedAt),
      retryCount: _retry ? 1 : 0, failureCategory: failureCategory(error),
    });
    throw error;
  }

  if (!response.ok) {
    // On 401, attempt a single silent token refresh then retry
    if (response.status === 401 && !_retry && !resolvedUrl.includes("/api/auth/")) {
      if (!_refreshing) {
        _refreshing = tryRefreshToken(_baseUrl).finally(() => { _refreshing = null; });
      }
      const refreshed = await _refreshing;
      if (refreshed) {
        return customFetch<T>(input, options, true);
      }
      // Refresh failed — session is unrecoverable; notify the app to re-login
      _onUnauthorized?.();
    }
    let errorData: unknown;
    try {
      errorData = await parseErrorBody(response, method);
    } catch (error) {
      const safe = safeEndpoint(resolvedUrl);
      _requestDiagnosticHandler?.({
        method, ...safe, durationMs: Math.round(performance.now() - startedAt),
        status: response.status, retryCount: _retry ? 1 : 0,
        failureCategory: failureCategory(error),
      });
      throw error;
    }
    const error = new ApiError(response, errorData, requestInfo);
    const safe = safeEndpoint(resolvedUrl);
    _requestDiagnosticHandler?.({
      method, ...safe, durationMs: Math.round(performance.now() - startedAt),
      status: response.status, retryCount: _retry ? 1 : 0, failureCategory: failureCategory(error),
    });
    throw error;
  }

  const safe = safeEndpoint(resolvedUrl);
  try {
    const body = await parseSuccessBody(response, responseType, requestInfo);
    _requestDiagnosticHandler?.({
      method, ...safe, durationMs: Math.round(performance.now() - startedAt),
      status: response.status, retryCount: _retry ? 1 : 0,
    });
    return body as T;
  } catch (error) {
    _requestDiagnosticHandler?.({
      method, ...safe, durationMs: Math.round(performance.now() - startedAt),
      status: response.status, retryCount: _retry ? 1 : 0,
      failureCategory: failureCategory(error),
    });
    throw error;
  }
}
