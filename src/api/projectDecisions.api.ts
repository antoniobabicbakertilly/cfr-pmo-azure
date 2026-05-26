import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { ProjectDecision, ProjectDecisionCreate, ProjectDecisionUpdate } from '../models/projectDecision.model';

const SET = ENTITY_SETS.projectDecision;
const FIELDS: (keyof ProjectDecision)[] = [
  'pmo_projectdecisionid', 'pmo_name', 'pmo_description', 'pmo_decisiondate',
  'pmo_status', 'pmo_impact', 'statecode', 'createdon',
  '_pmo_decisionowner_value', '_pmo_project_value', '_pmo_program_value', '_pmo_meetinglink_value',
];

export async function listProjectDecisions(projectId: string): Promise<ProjectDecision[]> {
  return dv.list<ProjectDecision>(SET, {
    $select: FIELDS,
    $filter: `_pmo_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'pmo_decisiondate desc',
  });
}

export async function createProjectDecision(payload: ProjectDecisionCreate): Promise<ProjectDecision> {
  return dv.create<ProjectDecision>(SET, payload);
}

export async function updateProjectDecision(id: string, payload: ProjectDecisionUpdate): Promise<void> {
  return dv.update(SET, id, payload);
}

export async function deactivateProjectDecision(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
