import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { ProjectBaseline, ProjectBaselineCreate } from '../models/projectBaseline.model';

const SET = ENTITY_SETS.projectBaseline;
const FIELDS: (keyof ProjectBaseline)[] = [
  'pmo_projectbaselineid', 'pmo_name', 'pmo_captureddate',
  'pmo_baselinestart', 'pmo_finish', 'pmo_budget', 'pmo_baselineeffort',
  'pmo_snapshotjson', 'pmo_notes', 'statecode', 'createdon', '_pmo_project_value',
];

export async function listProjectBaselines(projectId: string): Promise<ProjectBaseline[]> {
  return dv.list<ProjectBaseline>(SET, {
    $select: FIELDS,
    $filter: `_pmo_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'pmo_captureddate desc',
  });
}

export async function createProjectBaseline(payload: ProjectBaselineCreate): Promise<ProjectBaseline> {
  return dv.create<ProjectBaseline>(SET, payload);
}
