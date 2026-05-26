import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { ProjectCloseout, ProjectCloseoutCreate, ProjectCloseoutUpdate } from '../models/projectCloseout.model';

const SET = ENTITY_SETS.projectCloseout;

const FIELDS: (keyof ProjectCloseout)[] = [
  'pmo_projectcloseoutid', 'pmo_name', 'pmo_checklistitem',
  'pmo_iscomplete', 'pmo_completeddate', 'pmo_notes',
  'pmo_lessonslearned', 'pmo_outcomesummary',
  'statecode', 'createdon', '_pmo_project_value', '_pmo_completedby_value',
];

export async function listProjectCloseouts(projectId: string): Promise<ProjectCloseout[]> {
  return dv.list<ProjectCloseout>(SET, {
    $select: FIELDS,
    $filter: `_pmo_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'createdon asc',
  });
}

export async function createProjectCloseout(payload: ProjectCloseoutCreate): Promise<ProjectCloseout> {
  return dv.create<ProjectCloseout>(SET, payload);
}

export async function updateProjectCloseout(id: string, payload: ProjectCloseoutUpdate): Promise<void> {
  return dv.update(SET, id, payload);
}

export async function deactivateProjectCloseout(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
