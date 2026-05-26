import { getClient } from '@microsoft/power-apps/data';
import type { IOperationOptions } from '@microsoft/power-apps/data';
import type { ODataParams } from '../models/common.model';
import { serializeError } from './utils';
import { isDemoModeActive } from './demoMode';
import {
  listRecords, getRecord, addRecord, updateRecord, removeRecord,
  generateId, getPrimaryKey,
  handlePssCreate, handlePssUpdate, handlePssDelete,
  maybeCreateDemoProject,
} from './demoStore';

function toError(sdkErr: unknown, fallback: string): Error {
  const msg = serializeError(sdkErr);
  return new Error(msg !== String(sdkErr) || msg ? msg : fallback);
}

// DataSourcesInfo tells the SDK's operation orchestrator which entity sets are Dataverse
// tables (vs. connector tables). The orchestrator reads `dataSourceType` to route each
// operation to the correct executor. Org URL and auth are resolved by the Dataverse executor
// from the Power Apps host (via power.config.json databaseReferences) at call time.
// Every entity set queried by this app must appear here AND in power.config.json.
// OWNERSHIP [HIGH-RISK]: Platform Domain Owner. New table registrations require a GitHub Issue.
// Do not modify DATAVERSE_SOURCES without coordinating. See CONTRIBUTING.md §Shared Files.
const DATAVERSE_SOURCES = {
  // CFR custom
  pmo_projectrequests:        { tableId: 'pmo_projectrequest',        dataSourceType: 'Dataverse', apis: {} },
  pmo_projectteams:           { tableId: 'pmo_projectteam',           dataSourceType: 'Dataverse', apis: {} },
  // P4W + Accelerator
  msdyn_projects: {
    tableId: 'msdyn_project',
    dataSourceType: 'Dataverse',
    apis: {
      msdyn_CreateOperationSetV1: {
        path: '/api/data/v9.2/msdyn_CreateOperationSetV1',
        method: 'POST',
        parameters: [
          { name: 'ProjectId',    in: 'body', required: true,  type: 'string' },
          { name: 'Description', in: 'body', required: false, type: 'string' },
        ],
      },
      msdyn_PssCreateV1: {
        path: '/api/data/v9.2/msdyn_PssCreateV1',
        method: 'POST',
        parameters: [
          { name: 'Entity',          in: 'body', required: true,  type: 'object' },
          { name: 'OperationSetId',  in: 'body', required: true,  type: 'string' },
        ],
      },
      msdyn_PssUpdateV1: {
        path: '/api/data/v9.2/msdyn_PssUpdateV1',
        method: 'POST',
        parameters: [
          { name: 'Entity',          in: 'body', required: true,  type: 'object' },
          { name: 'OperationSetId',  in: 'body', required: true,  type: 'string' },
        ],
      },
      msdyn_PssDeleteV1: {
        path: '/api/data/v9.2/msdyn_PssDeleteV1',
        method: 'POST',
        parameters: [
          { name: 'RecordId',              in: 'body', required: true,  type: 'string' },
          { name: 'EntityLogicalName',     in: 'body', required: true,  type: 'string' },
          { name: 'OperationSetId',        in: 'body', required: true,  type: 'string' },
        ],
      },
      msdyn_ExecuteOperationSetV1: {
        path: '/api/data/v9.2/msdyn_ExecuteOperationSetV1',
        method: 'POST',
        parameters: [
          { name: 'OperationSetId',  in: 'body', required: true,  type: 'string' },
        ],
      },
      msdyn_CreateTeamMemberV1: {
        path: '/api/data/v9.2/msdyn_CreateTeamMemberV1',
        method: 'POST',
        parameters: [
          { name: 'TeamMember', in: 'body', required: true, type: 'object' },
        ],
      },
      pmo_UploadDocumentToSharePoint: {
        path: '/api/data/v9.2/pmo_UploadDocumentToSharePoint',
        method: 'POST',
        parameters: [
          { name: 'FileName',         in: 'body', required: true,  type: 'string' },
          { name: 'FileContent',      in: 'body', required: true,  type: 'string' },
          { name: 'RecordType',       in: 'body', required: false, type: 'string' },
          { name: 'RecordId',         in: 'body', required: false, type: 'string' },
          { name: 'RecordName',       in: 'body', required: false, type: 'string' },
          { name: 'DocumentCategory', in: 'body', required: false, type: 'string' },
          { name: 'ProjectId',        in: 'body', required: false, type: 'string' },
          { name: 'ProgramId',        in: 'body', required: false, type: 'string' },
          { name: 'IntakeId',         in: 'body', required: false, type: 'string' },
          { name: 'TaskId',           in: 'body', required: false, type: 'string' },
          { name: 'UserEmail',        in: 'body', required: false, type: 'string' },
        ],
      },
    },
  },
  msdyn_projectprograms:      { tableId: 'msdyn_projectprogram',      dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectstatusreports: { tableId: 'msdyn_projectstatusreport', dataSourceType: 'Dataverse', apis: {} },
  msdyn_projecttasks:             { tableId: 'msdyn_projecttask',            dataSourceType: 'Dataverse', apis: {} },
  msdyn_projecttaskdependencies:  { tableId: 'msdyn_projecttaskdependency', dataSourceType: 'Dataverse', apis: {} },
  msdyn_resourceassignments:      { tableId: 'msdyn_resourceassignment',     dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectbuckets:           { tableId: 'msdyn_projectbucket',          dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectteams:             { tableId: 'msdyn_projectteam',            dataSourceType: 'Dataverse', apis: {} },
  bookableresources:              { tableId: 'bookableresource',             dataSourceType: 'Dataverse', apis: {} },
  // P4W scheduling entities (spike discovery targets)
  msdyn_projectlabels:            { tableId: 'msdyn_projectlabel',           dataSourceType: 'Dataverse', apis: {} },
  msdyn_projecttasktolabels:      { tableId: 'msdyn_projecttasktolabel',     dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectchecklists:        { tableId: 'msdyn_projectchecklist',       dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectsprints:           { tableId: 'msdyn_projectsprint',          dataSourceType: 'Dataverse', apis: {} },
  // Dataverse OData metadata entity sets — used only in spike panel to discover schema
  RelationshipDefinitions:        { tableId: 'RelationshipDefinition',       dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectrisks:         { tableId: 'msdyn_projectrisk',         dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectissues:        { tableId: 'msdyn_projectissue',        dataSourceType: 'Dataverse', apis: {} },
  msdyn_projectchanges:       { tableId: 'msdyn_projectchange',       dataSourceType: 'Dataverse', apis: {} },
  // System
  organizations:              { tableId: 'organization',              dataSourceType: 'Dataverse', apis: {} },
  systemusers:                { tableId: 'systemuser',                dataSourceType: 'Dataverse', apis: {} },
  teams:                      { tableId: 'team',                     dataSourceType: 'Dataverse', apis: {} },
  msdyn_documentheaders:      { tableId: 'msdyn_documentheader',     dataSourceType: 'Dataverse', apis: {} },
  // Reference / master data
  cr87a_systems:              { tableId: 'cr87a_system',             dataSourceType: 'Dataverse', apis: {} },
  annotations:                { tableId: 'annotation',               dataSourceType: 'Dataverse', apis: {} },
  pmo_userfeedbacks:           { tableId: 'pmo_userfeedback',          dataSourceType: 'Dataverse', apis: {} },
  pmo_appsettings:            { tableId: 'pmo_appsetting',           dataSourceType: 'Dataverse', apis: {} },
  pmo_projecttemplates:       { tableId: 'pmo_projecttemplate',      dataSourceType: 'Dataverse', apis: {} },
  pmo_documentlinks:          { tableId: 'pmo_documentlink',         dataSourceType: 'Dataverse', apis: {} },
  pmo_projectgates:           { tableId: 'pmo_projectgate',          dataSourceType: 'Dataverse', apis: {} },
  pmo_projectgatedecisions:   { tableId: 'pmo_projectgatedecision',  dataSourceType: 'Dataverse', apis: {} },
  pmo_requiredartifacts:      { tableId: 'pmo_requiredartifact',     dataSourceType: 'Dataverse', apis: {} },
  pmo_projectartifactstatuses: { tableId: 'pmo_projectartifactstatus', dataSourceType: 'Dataverse', apis: {} },
  pmo_projectcloseouts:       { tableId: 'pmo_projectcloseout',      dataSourceType: 'Dataverse', apis: {} },
  pmo_notifications:          { tableId: 'pmo_notification',         dataSourceType: 'Dataverse', apis: {} },
  pmo_telemetryevents:        { tableId: 'pmo_telemetryevent',       dataSourceType: 'Dataverse', apis: {} },
  pmo_projectdecisions:       { tableId: 'pmo_projectdecision',      dataSourceType: 'Dataverse', apis: {} },
  pmo_projectmeetinglinks:    { tableId: 'pmo_projectmeetinglink',   dataSourceType: 'Dataverse', apis: {} },
  pmo_projectbaselines:       { tableId: 'pmo_projectbaseline',      dataSourceType: 'Dataverse', apis: {} },
  pmo_gatesettemplates:       { tableId: 'pmo_gatesettemplate',      dataSourceType: 'Dataverse', apis: {} },
  pmo_gatesetitems:           { tableId: 'pmo_gatesetitem',          dataSourceType: 'Dataverse', apis: {} },
  roles:                      { tableId: 'role',                     dataSourceType: 'Dataverse', apis: {} },
};

// Returns a DataClient backed by the Power Apps runtime bridge.
// The SDK resolves auth, org URL, and CORS through the host MessageChannel —
// no window.__powerAppsContext injection required.
function client() {
  return getClient(DATAVERSE_SOURCES);
}

function toSdkOptions(params: ODataParams): IOperationOptions {
  const opts: IOperationOptions = {};
  if (params.$select?.length) opts.select = params.$select;
  if (params.$filter) opts.filter = params.$filter;
  if (params.$orderby) opts.orderBy = params.$orderby.split(',').map((s) => s.trim());
  if (params.$top !== undefined) opts.top = params.$top;
  return opts;
}

/** List records with optional OData query params. */
export async function list<T>(entitySetName: string, params: ODataParams = {}): Promise<T[]> {
  if (isDemoModeActive()) return listRecords<T>(entitySetName);
  const result = await client().retrieveMultipleRecordsAsync<T>(entitySetName, toSdkOptions(params));
  if (!result.success) throw toError(result.error, 'Dataverse list failed.');
  return result.data;
}

/** Get a single record by ID. */
export async function get<T>(entitySetName: string, id: string, select?: string[]): Promise<T> {
  if (isDemoModeActive()) {
    const found = getRecord<T>(entitySetName, id);
    if (found) return found;
  }
  const result = await client().retrieveRecordAsync<T>(
    entitySetName,
    id,
    select?.length ? { select } : undefined,
  );
  if (!result.success) throw toError(result.error, 'Dataverse get failed.');
  return result.data;
}

/** Create a new record. Returns the created record with server-generated fields. */
export async function create<T>(entitySetName: string, payload: object): Promise<T> {
  if (isDemoModeActive()) {
    const pk = getPrimaryKey(entitySetName);
    const record = { [pk]: generateId(), createdon: new Date().toISOString(), statecode: 0, ...(payload as object) };
    addRecord(entitySetName, record as Record<string, unknown>);
    return record as T;
  }
  const result = await client().createRecordAsync<object, T>(entitySetName, payload);
  if (!result.success) throw toError(result.error, 'Dataverse create failed.');
  return result.data;
}

/** Update an existing record (PATCH — partial update). */
export async function update(entitySetName: string, id: string, payload: object): Promise<void> {
  if (isDemoModeActive()) {
    maybeCreateDemoProject(entitySetName, id, payload as Record<string, unknown>);
    updateRecord(entitySetName, id, payload as Record<string, unknown>);
    return;
  }
  const result = await client().updateRecordAsync(entitySetName, id, payload);
  if (!result.success) throw toError(result.error, 'Dataverse update failed.');
}

/** Deactivate a record by setting statecode=1, statuscode=2. */
export async function deactivate(entitySetName: string, id: string): Promise<void> {
  return update(entitySetName, id, { statecode: 1, statuscode: 2 });
}

/** Hard-delete a record by ID. */
export async function remove(entitySetName: string, id: string): Promise<void> {
  if (isDemoModeActive()) {
    removeRecord(entitySetName, id);
    return;
  }
  const result = await client().deleteRecordAsync(entitySetName, id);
  if (!result.success) throw toError(result.error, 'Dataverse delete failed.');
}

/**
 * Invoke an unbound Dataverse custom action via the SDK bridge.
 *
 * The `tableName` param identifies the data source used to resolve the
 * Dataverse environment connection — use any entity set name registered in
 * DATAVERSE_SOURCES (e.g. 'msdyn_projects'). The SDK resolves auth and org
 * URL from the Power Apps host the same way as standard CRUD calls.
 *
 * Used by schedulingClient.ts for Project Operations scheduling actions
 * (msdyn_CreateOperationSetV1, msdyn_PssCreateV1, etc.) that are not
 * accessible via standard OData CRUD.
 */
export async function executeAction<TRequest, TResult>(
  tableName: string,
  operationName: string,
  body?: TRequest,
): Promise<TResult> {
  if (isDemoModeActive()) {
    const b = (body ?? {}) as Record<string, unknown>;
    let fakeResult: Record<string, unknown> = {};
    switch (operationName) {
      case 'msdyn_CreateOperationSetV1':
        fakeResult = { OperationSetId: generateId() };
        break;
      case 'msdyn_PssCreateV1':
        fakeResult = handlePssCreate(b);
        break;
      case 'msdyn_PssUpdateV1':
        fakeResult = handlePssUpdate(b);
        break;
      case 'msdyn_PssDeleteV1':
        fakeResult = handlePssDelete(b);
        break;
      case 'msdyn_ExecuteOperationSetV1':
        fakeResult = { OperationSetId: b.OperationSetId, name: 'Succeeded', percentComplete: 100 };
        break;
      case 'msdyn_CreateTeamMemberV1':
        fakeResult = { TeamMemberId: generateId() };
        break;
    }
    return fakeResult as TResult;
  }
  const result = await client().executeAsync<TRequest, TResult>({
    dataverseRequest: {
      action: 'customapi',
      parameters: { operationName, tableName, body },
    },
  });
  if (!result.success) throw toError(result.error, `Action ${operationName} failed`);
  return result.data;
}

/** Get the Dataverse organization ID (used for Planner deep link construction). */
export async function getOrganizationId(): Promise<string> {
  if (isDemoModeActive()) return 'demo-org-id';
  const result = await client().retrieveMultipleRecordsAsync<{ organizationid: string }>(
    'organizations',
    { select: ['organizationid'] },
  );
  if (!result.success) throw toError(result.error, 'Organizations query failed.');
  const org = result.data[0];
  if (!org) throw new Error('No organization record found.');
  return org.organizationid;
}

/** Returns the current Power Apps user's system user GUID.
 *  Reads from the Xrm host context when available (model-driven app host).
 *  Falls back to 'anonymous' if the host context is not accessible. */
export function getCurrentUserId(): string {
  try {
    type XrmGlobal = { Xrm?: { Utility?: { getGlobalContext?: () => { getUserId?: () => string } } } };
    const xrm = (window as unknown as XrmGlobal).Xrm;
    const raw = xrm?.Utility?.getGlobalContext?.()?.getUserId?.();
    if (raw) return raw.replace(/[{}]/g, '').toLowerCase();
  } catch {
    // Not running inside an Xrm host (dev mode, testing)
  }
  return 'anonymous';
}

// ─── Async user-id resolution (Power Apps Code App hosting) ──────────────────
//
// `getCurrentUserId()` above only works in model-driven hosts (window.Xrm).
// Power Apps Code Apps don't inject Xrm, so it always returns 'anonymous'
// here. This async resolver uses @microsoft/power-apps/app context to read
// the AAD object id, then looks up the matching systemuser row in Dataverse.
// Same pattern as ConfigurationProvider.resolveAdminRole and
// sharePointClient.getCurrentUserEmail.
//
// Result is cached in a module-scope promise so concurrent callers share
// one network round-trip and subsequent calls are synchronous reads.

let cachedUserIdPromise: Promise<string | null> | null = null;

/**
 * Returns the current user's Dataverse systemuserid (lowercased, no braces),
 * or null if it can't be resolved (dev mode, host without context, etc.).
 *
 * Resolution order:
 *   1. window.Xrm if present (model-driven host)
 *   2. Power Apps SDK context → AAD objectId → systemusers query
 *   3. null
 */
export function resolveCurrentUserId(): Promise<string | null> {
  if (isDemoModeActive()) return Promise.resolve('demo-user');
  if (cachedUserIdPromise) return cachedUserIdPromise;
  cachedUserIdPromise = (async (): Promise<string | null> => {
    // Try the synchronous Xrm path first.
    const xrmId = getCurrentUserId();
    if (xrmId !== 'anonymous') return xrmId;

    // Fall back to the Power Apps SDK context.
    try {
      const { getContext } = await import('@microsoft/power-apps/app');
      const ctx = await getContext();
      const aadObjectId = (ctx.user as Record<string, unknown> | undefined)?.objectId as
        | string
        | undefined;
      if (!aadObjectId) return null;
      const users = await list<{ systemuserid: string }>('systemusers', {
        $select: ['systemuserid'],
        $filter: `azureactivedirectoryobjectid eq '${aadObjectId}'`,
      });
      const id = users[0]?.systemuserid ?? null;
      return id ? id.toLowerCase() : null;
    } catch {
      return null;
    }
  })();
  return cachedUserIdPromise;
}
