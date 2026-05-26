import { DEMO_FIXTURES } from '../fixtures/demoData';

// ─── Primary key field per entity set ────────────────────────────────────────
const PRIMARY_KEYS: Record<string, string> = {
  pmo_projectrequests:          'pmo_projectrequestid',
  msdyn_projects:               'msdyn_projectid',
  msdyn_projectbuckets:         'msdyn_projectbucketid',
  msdyn_projecttasks:           'msdyn_projecttaskid',
  msdyn_projectrisks:           'msdyn_projectriskid',
  msdyn_projectstatusreports:   'msdyn_projectstatusreportid',
  pmo_projectteams:             'pmo_projectteamid',
  teams:                        'teamid',
  pmo_userfeedbacks:            'pmo_userfeedbackid',
  pmo_appsettings:              'pmo_appsettingid',
};

// ─── @odata.type → entity set name ───────────────────────────────────────────
const ODATA_TYPE_TO_SET: Record<string, string> = {
  'Microsoft.Dynamics.CRM.msdyn_projecttask':   'msdyn_projecttasks',
  'Microsoft.Dynamics.CRM.msdyn_projectbucket': 'msdyn_projectbuckets',
  'Microsoft.Dynamics.CRM.msdyn_projectrisk':   'msdyn_projectrisks',
};

// ─── @odata.type → entity ID field ───────────────────────────────────────────
const ODATA_TYPE_TO_ID: Record<string, string> = {
  'Microsoft.Dynamics.CRM.msdyn_projecttask':   'msdyn_projecttaskid',
  'Microsoft.Dynamics.CRM.msdyn_projectbucket': 'msdyn_projectbucketid',
  'Microsoft.Dynamics.CRM.msdyn_projectrisk':   'msdyn_projectriskid',
};

// ─── In-memory store ──────────────────────────────────────────────────────────
// Deep-cloned from DEMO_FIXTURES so mutations don't corrupt the static import.
const store: Record<string, Record<string, unknown>[]> = {};

function ensureSet(entitySet: string): Record<string, unknown>[] {
  if (!store[entitySet]) {
    store[entitySet] = (DEMO_FIXTURES[entitySet] ?? []).map((r) => ({ ...(r as object) }));
  }
  return store[entitySet];
}

export function getPrimaryKey(entitySet: string): string {
  return PRIMARY_KEYS[entitySet] ?? `${entitySet.slice(0, -1)}id`;
}

export function listRecords<T>(entitySet: string): T[] {
  return ensureSet(entitySet) as T[];
}

export function getRecord<T>(entitySet: string, id: string): T | undefined {
  const pk = getPrimaryKey(entitySet);
  return ensureSet(entitySet).find((r) => r[pk] === id) as T | undefined;
}

export function addRecord(entitySet: string, record: Record<string, unknown>): void {
  ensureSet(entitySet).push(record);
}

export function updateRecord(entitySet: string, id: string, patch: Record<string, unknown>): void {
  const pk = getPrimaryKey(entitySet);
  const records = ensureSet(entitySet);
  const idx = records.findIndex((r) => r[pk] === id);
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...patch };
  }
}

export function removeRecord(entitySet: string, id: string): void {
  const pk = getPrimaryKey(entitySet);
  const records = ensureSet(entitySet);
  const idx = records.findIndex((r) => r[pk] === id);
  if (idx >= 0) records.splice(idx, 1);
}

// ─── Fake ID generation ───────────────────────────────────────────────────────
let seq = 0;
export function generateId(): string {
  const n = String(++seq).padStart(4, '0');
  return `demo-live-${Date.now()}-${n}-0000-000000000000`.slice(0, 36);
}

// ─── PSS (Project Scheduling Service) interceptors ───────────────────────────

export function handlePssCreate(body: Record<string, unknown>): Record<string, unknown> {
  const entity = (body.Entity ?? {}) as Record<string, unknown>;
  const odataType = entity['@odata.type'] as string | undefined;
  if (!odataType) return {};

  const entitySet = ODATA_TYPE_TO_SET[odataType];
  const idField   = ODATA_TYPE_TO_ID[odataType];
  if (!entitySet || !idField) return {};

  const newId = generateId();

  // Resolve nav-property binds like 'msdyn_project@odata.bind' → '_msdyn_project_value'
  const resolved: Record<string, unknown> = { [idField]: newId, createdon: new Date().toISOString(), statecode: 0 };
  for (const [k, v] of Object.entries(entity)) {
    if (k === '@odata.type') continue;
    if (k.endsWith('@odata.bind')) {
      // e.g. 'msdyn_project@odata.bind' → '_msdyn_project_value'
      const base = k.replace('@odata.bind', '');
      const match = String(v).match(/\(([^)]+)\)$/);
      resolved[`_${base}_value`] = match ? match[1] : v;
    } else {
      resolved[k] = v;
    }
  }

  addRecord(entitySet, resolved);
  return { OperationSetId: body.OperationSetId, OperationId: generateId(), Result: 'Success' };
}

export function handlePssUpdate(body: Record<string, unknown>): Record<string, unknown> {
  const entity = (body.Entity ?? {}) as Record<string, unknown>;
  const odataType = entity['@odata.type'] as string | undefined;
  if (!odataType) return {};

  const entitySet = ODATA_TYPE_TO_SET[odataType];
  const idField   = ODATA_TYPE_TO_ID[odataType];
  if (!entitySet || !idField) return {};

  const id = entity[idField] as string | undefined;
  if (!id) return {};

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (k === '@odata.type' || k === idField) continue;
    if (k.endsWith('@odata.bind')) {
      const base = k.replace('@odata.bind', '');
      const match = String(v).match(/\(([^)]+)\)$/);
      patch[`_${base}_value`] = match ? match[1] : v;
    } else {
      patch[k] = v;
    }
  }

  updateRecord(entitySet, id, patch);
  return { OperationSetId: body.OperationSetId, OperationId: generateId(), Result: 'Success' };
}

export function handlePssDelete(body: Record<string, unknown>): Record<string, unknown> {
  const logicalName = body.EntityLogicalName as string | undefined;
  const recordId    = body.RecordId as string | undefined;
  if (!logicalName || !recordId) return {};

  // Convert logical name to entity set name (append 's')
  const entitySet = `${logicalName}s`;
  removeRecord(entitySet, recordId);
  return { OperationSetId: body.OperationSetId, OperationId: generateId(), Result: 'Success' };
}

// ─── Approval → auto-create project ──────────────────────────────────────────
const APPROVED_STATUS = 893460023;

export function maybeCreateDemoProject(
  entitySet: string,
  id: string,
  patch: Record<string, unknown>,
): void {
  if (entitySet !== 'pmo_projectrequests') return;
  if (patch.pmo_status !== APPROVED_STATUS) return;

  const request = getRecord<Record<string, unknown>>('pmo_projectrequests', id);
  if (!request) return;

  const projectId = generateId();
  const now = new Date().toISOString();

  addRecord('msdyn_projects', {
    msdyn_projectid: projectId,
    msdyn_subject: String(request.pmo_name ?? 'Demo Project'),
    msdyn_description: request.pmo_description ?? '',
    msdyn_scheduledstart: request.pmo_requestedstartdate ?? now.slice(0, 10),
    msdyn_finish: request.pmo_targetcompletiondate ?? '',
    msdyn_progress: 0,
    proj_stage: 192350001,     // Planning
    'proj_stage@OData.Community.Display.V1.FormattedValue': 'Planning',
    proj_state: 0,
    'proj_state@OData.Community.Display.V1.FormattedValue': 'Active',
    proj_priority: request.pmo_priority ?? 893460012,
    'proj_priority@OData.Community.Display.V1.FormattedValue':
      (request['pmo_priority@OData.Community.Display.V1.FormattedValue'] as string) ?? 'Medium',
    proj_overallhealth: 189330000,
    'proj_overallhealth@OData.Community.Display.V1.FormattedValue': 'On Track',
    'ownerid@OData.Community.Display.V1.FormattedValue':
      (request['_pmo_requestedby_value@OData.Community.Display.V1.FormattedValue'] as string) ?? '',
    statecode: 0,
    createdon: now,
    modifiedon: now,
  });

  // Link the request → project and set converted date
  updateRecord('pmo_projectrequests', id, {
    '_pmo_convertedproject_value': projectId,
    '_pmo_convertedproject_value@OData.Community.Display.V1.FormattedValue': String(request.pmo_name ?? 'Demo Project'),
    pmo_converteddate: now,
    pmo_status: APPROVED_STATUS,
    'pmo_status@OData.Community.Display.V1.FormattedValue': 'Approved',
  });
}
