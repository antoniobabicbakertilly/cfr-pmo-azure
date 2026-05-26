// Ambient type declarations for @microsoft/power-apps SDK subpackages.
// Allows static imports to type-check after the npm package is removed.
// Runtime resolution is handled by the Vite alias in vite.config.ts.

declare module '@microsoft/power-apps/data' {
  export interface IOperationOptions {
    select?: string[];
    filter?: string;
    orderBy?: string[];
    top?: number;
  }
  export function getClient(dataSources: Record<string, unknown>): {
    retrieveMultipleRecordsAsync<T>(entitySet: string, options?: IOperationOptions): Promise<{ success: boolean; data: T[]; error?: unknown }>;
    retrieveRecordAsync<T>(entitySet: string, id: string, options?: IOperationOptions): Promise<{ success: boolean; data: T; error?: unknown }>;
    createRecordAsync<TIn, TOut>(entitySet: string, payload: TIn): Promise<{ success: boolean; data: TOut; error?: unknown }>;
    updateRecordAsync(entitySet: string, id: string, payload: unknown): Promise<{ success: boolean; error?: unknown }>;
    deleteRecordAsync(entitySet: string, id: string): Promise<{ success: boolean; error?: unknown }>;
    executeAsync<TIn, TOut>(params: unknown): Promise<{ success: boolean; data: TOut; error?: unknown }>;
  };
}

declare module '@microsoft/power-apps/app' {
  export function getContext(): Promise<{
    app: { environmentId: string; appId: string; queryParams: Record<string, string> };
    user: { tenantId?: string; objectId?: string };
  }>;
}
