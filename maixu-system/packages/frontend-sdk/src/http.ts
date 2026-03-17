import { ApiErrorPayload } from './types';

export type ApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ApiTransportRequest {
  url: string;
  method: ApiRequestMethod;
  headers?: Record<string, string>;
  data?: unknown;
}

export interface ApiTransportResponse<T = unknown> {
  status: number;
  data: T;
}

export type ApiTransport = <T = unknown>(request: ApiTransportRequest) => Promise<ApiTransportResponse<T>>;

export interface MaixuSdkOptions {
  baseUrl: string;
  getToken?: () => string | undefined | null;
  transport?: ApiTransport;
  onUnauthorized?: () => void;
}

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function createFetchTransport(fetchImpl?: typeof fetch): ApiTransport {
  const realFetch = fetchImpl ?? globalThis.fetch;
  if (!realFetch) {
    throw new Error('fetch is not available, please provide a custom transport');
  }

  return async <T>(request: ApiTransportRequest): Promise<ApiTransportResponse<T>> => {
    const response = await realFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.data === undefined ? undefined : JSON.stringify(request.data),
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? ((await response.json()) as T)
      : ((await response.text()) as T);

    return {
      status: response.status,
      data,
    };
  };
}

type TaroLikeRequestFn = (options: {
  url: string;
  method: ApiRequestMethod;
  header?: Record<string, string>;
  data?: unknown;
}) => Promise<{ statusCode: number; data: unknown }>;

export function createTaroTransport(requestFn: TaroLikeRequestFn): ApiTransport {
  return async <T>(request: ApiTransportRequest): Promise<ApiTransportResponse<T>> => {
    const response = await requestFn({
      url: request.url,
      method: request.method,
      header: request.headers,
      data: request.data,
    });

    return {
      status: response.statusCode,
      data: response.data as T,
    };
  };
}

type ApiRequestConfig = {
  path: string;
  method: ApiRequestMethod;
  data?: unknown;
  auth?: boolean;
};

export class ApiHttpClient {
  private readonly baseUrl: string;
  private readonly getToken?: () => string | undefined | null;
  private readonly transport: ApiTransport;
  private readonly onUnauthorized?: () => void;

  constructor(options: MaixuSdkOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken = options.getToken;
    this.transport = options.transport ?? createFetchTransport();
    this.onUnauthorized = options.onUnauthorized;
  }

  async get<T>(path: string, auth = false) {
    return this.request<T>({ path, method: 'GET', auth });
  }

  async post<T>(path: string, data?: unknown, auth = false) {
    return this.request<T>({ path, method: 'POST', data, auth });
  }

  async put<T>(path: string, data?: unknown, auth = false) {
    return this.request<T>({ path, method: 'PUT', data, auth });
  }

  async delete<T>(path: string, auth = false) {
    return this.request<T>({ path, method: 'DELETE', auth });
  }

  async request<T>(config: ApiRequestConfig): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.auth && this.getToken) {
      const token = this.getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const response = await this.transport<T | ApiErrorPayload>({
      url: `${this.baseUrl}${config.path}`,
      method: config.method,
      headers,
      data: config.data,
    });

    if (response.status >= 200 && response.status < 300) {
      return response.data as T;
    }

    if (response.status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
    }

    const payload = response.data as ApiErrorPayload;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : payload?.message || payload?.error || 'request failed';

    throw new ApiError(message, response.status, payload);
  }
}
