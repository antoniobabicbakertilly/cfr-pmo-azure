import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { ProjectTask } from '../models/projectTask.model';

const SET = ENTITY_SETS.projectTask;

const BASE_SELECT: string[] = [
  'msdyn_projecttaskid',
  'msdyn_subject',
  'msdyn_description',
  'msdyn_scheduledstart',
  'msdyn_scheduledend',
  'msdyn_finish',
  'msdyn_duration',
  'msdyn_effort',
  'msdyn_effortcompleted',
  'msdyn_effortremaining',
  'msdyn_progress',
  'msdyn_priority',
  'msdyn_iscritical',
  'msdyn_ismilestone',
  'msdyn_summary',
  'msdyn_outlinelevel',
  'msdyn_displaysequence',
  'statecode',
  'createdon',
  '_msdyn_project_value',
  '_msdyn_projectbucket_value',
  '_msdyn_parenttask_value',
  '_msdyn_projectsprint_value',
];

/** Fetch all tasks (open and closed) for a project. */
export async function listProjectTasks(projectId: string): Promise<ProjectTask[]> {
  return dv.list<ProjectTask>(SET, {
    $select: BASE_SELECT,
    $filter: `_msdyn_project_value eq '${projectId}'`,
    $orderby: 'msdyn_displaysequence asc',
  });
}
