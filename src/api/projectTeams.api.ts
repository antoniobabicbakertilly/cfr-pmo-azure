import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { ProjectTeam, ProjectTeamCreate } from '../models/projectTeam.model';

const SET = ENTITY_SETS.projectTeam;

const BASE_SELECT: string[] = [
  'pmo_projectteamid',
  'pmo_name',
  'pmo_role',
  'pmo_joineddate',
  'pmo_notes',
  'statecode',
  'createdon',
  '_pmo_project_value',
  '_pmo_team_value',
];

export async function listProjectTeams(projectId: string): Promise<ProjectTeam[]> {
  return dv.list<ProjectTeam>(SET, {
    $select: BASE_SELECT,
    $filter: `_pmo_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'pmo_role asc, createdon asc',
  });
}

export async function createProjectTeam(payload: ProjectTeamCreate): Promise<ProjectTeam> {
  return dv.create<ProjectTeam>(SET, payload);
}

export async function removeProjectTeam(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
