import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import { discoverNavProp } from '../lib/navPropDiscovery';
import type { ProjectChange } from '../models/projectChange.model';

const SET = ENTITY_SETS.projectChange;

const BASE_SELECT: string[] = [
  'msdyn_projectchangeid',
  'msdyn_name',
  'msdyn_description',
  'msdyn_additionalcomments',
  'proj_changetype',
  'proj_changeimpact',
  'proj_changerisk',
  'proj_priority',
  'proj_approval',
  'proj_state',
  'proj_costimpact',
  'proj_plannedstartdate',
  'proj_plannedduedate',
  'proj_requesteddate',
  'proj_changebenefits',
  'proj_changeplan',
  'statecode',
  'createdon',
  '_msdyn_project_value',
  '_proj_assignedto_value',
  '_proj_requestedby_value',
];

export interface ProjectChangePayload {
  msdyn_name: string;
  msdyn_description?: string;
  msdyn_additionalcomments?: string;
  proj_changetype?: number | null;
  proj_changeimpact?: number | null;
  proj_changerisk?: number | null;
  proj_priority?: number | null;
  proj_approval?: number | null;
  proj_state?: number | null;
  proj_costimpact?: number | null;
  proj_plannedstartdate?: string | null;
  proj_plannedduedate?: string | null;
  proj_requesteddate?: string | null;
  proj_changebenefits?: string;
  proj_changeplan?: string;
}

export interface ProjectChangeCreate extends ProjectChangePayload {
  'msdyn_project@odata.bind': string; // '/msdyn_projects(id)'
}

export async function listProjectChanges(projectId: string): Promise<ProjectChange[]> {
  return dv.list<ProjectChange>(SET, {
    $select: BASE_SELECT,
    $filter: `_msdyn_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'createdon desc',
  });
}

export async function createProjectChange(payload: ProjectChangeCreate): Promise<ProjectChange> {
  const navProp = await discoverNavProp('msdyn_projectchange', 'msdyn_project', 'msdyn_project');
  const { 'msdyn_project@odata.bind': projectBind, ...rest } = payload;
  const resolved: Record<string, unknown> = { ...rest };
  if (projectBind) resolved[`${navProp}@odata.bind`] = projectBind;
  return dv.create<ProjectChange>(SET, resolved);
}

export async function updateProjectChange(id: string, payload: ProjectChangePayload): Promise<void> {
  return dv.update(SET, id, payload);
}

export async function deleteProjectChange(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
