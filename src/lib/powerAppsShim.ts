// Stub for @microsoft/power-apps SDK (data + app subpackages).
// Aliased from @microsoft/power-apps/* by vite.config.ts so static imports resolve at build time.
// Demo mode gates every caller before SDK code executes, so these stubs are never reached at runtime.

export interface IOperationOptions {
  select?: string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
}

type SdkResponse<T> = Promise<{ success: boolean; data: T; error?: unknown }>;

type DataClient = {
  retrieveMultipleRecordsAsync<T>(entitySet: string, options?: IOperationOptions): SdkResponse<T[]>;
  retrieveRecordAsync<T>(entitySet: string, id: string, options?: IOperationOptions): SdkResponse<T>;
  createRecordAsync<TIn, TOut>(entitySet: string, payload: TIn): SdkResponse<TOut>;
  updateRecordAsync(entitySet: string, id: string, payload: unknown): SdkResponse<void>;
  deleteRecordAsync(entitySet: string, id: string): SdkResponse<void>;
  executeAsync<_TIn, TOut>(params: unknown): SdkResponse<TOut>;
};

export function getClient(_dataSources: unknown): DataClient {
  const fail = (): SdkResponse<never> =>
    Promise.resolve({ success: false, data: null as never, error: new Error('Power Apps SDK not available') });
  return {
    retrieveMultipleRecordsAsync: fail,
    retrieveRecordAsync: fail,
    createRecordAsync: fail,
    updateRecordAsync: fail,
    deleteRecordAsync: fail,
    executeAsync: fail,
  } as unknown as DataClient;
}

export async function getContext(): Promise<never> {
  throw new Error('Power Apps SDK not available in Azure SWA build');
}
