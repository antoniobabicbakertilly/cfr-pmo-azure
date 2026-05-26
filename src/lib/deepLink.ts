import { getContext } from '@microsoft/power-apps/app';

const PLAYER_BASE = 'https://apps.powerapps.com/play/e';

export interface DeepLinkState {
  page: string;
  id?: string;
  tab?: string;
  subtab?: string;
  task?: string;
  view?: string;
}

interface HostContext {
  environmentId: string;
  appId: string;
  tenantId: string;
}

let cachedHostContext: HostContext | null = null;
let initPromise: Promise<void> | null = null;

export async function initDeepLinkContext(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const ctx = await getContext();
      cachedHostContext = {
        environmentId: ctx.app.environmentId,
        appId: ctx.app.appId,
        tenantId: ctx.user.tenantId ?? '',
      };
    } catch {
      cachedHostContext = null;
    }
  })();
  return initPromise;
}

export function isDeepLinkAvailable(): boolean {
  return cachedHostContext !== null;
}

export function getCachedEnvironmentId(): string | null {
  return cachedHostContext?.environmentId ?? null;
}

export function buildDeepLink(state: DeepLinkState): string | null {
  if (!cachedHostContext) return null;
  const { environmentId, appId, tenantId } = cachedHostContext;
  const base = `${PLAYER_BASE}/${environmentId}/app/${appId}`;
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  if (state.page) params.set('page', state.page);
  if (state.id) params.set('id', state.id);
  if (state.tab && state.tab !== 'overview') params.set('tab', state.tab);
  if (state.subtab && state.subtab !== 'risks') params.set('subtab', state.subtab);
  if (state.task) params.set('task', state.task);
  if (state.view && state.view !== 'board') params.set('view', state.view);
  return `${base}?${params.toString()}`;
}

export async function readDeepLinkParams(): Promise<DeepLinkState | null> {
  try {
    const ctx = await getContext();
    const qp = ctx.app.queryParams;
    if (!qp.page) return null;
    return {
      page: qp.page,
      id: qp.id,
      tab: qp.tab,
      subtab: qp.subtab,
      task: qp.task,
      view: qp.view,
    };
  } catch {
    return null;
  }
}
