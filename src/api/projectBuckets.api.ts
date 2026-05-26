import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import {
  createScheduledBucket,
  updateScheduledBucket,
  deleteScheduledBucket,
} from '../lib/schedulingClient';
import type { ProjectBucket } from '../models/projectBucket.model';

const SET = ENTITY_SETS.projectBucket;

const BASE_SELECT: string[] = [
  'msdyn_projectbucketid',
  'msdyn_name',
  'msdyn_displayorder',
  'statecode',
  '_msdyn_project_value',
];

export async function listProjectBuckets(projectId: string): Promise<ProjectBucket[]> {
  return dv.list<ProjectBucket>(SET, {
    $select: BASE_SELECT,
    $filter: `_msdyn_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'msdyn_displayorder asc',
  });
}

export async function createProjectBucket(
  projectId: string,
  name: string,
  displayOrder?: number,
): Promise<void> {
  return createScheduledBucket({ projectId, name, displayOrder });
}

export async function renameProjectBucket(
  projectId: string,
  bucketId: string,
  name: string,
): Promise<void> {
  return updateScheduledBucket(projectId, { bucketId, name });
}

export async function deleteProjectBucket(projectId: string, bucketId: string): Promise<void> {
  return deleteScheduledBucket(projectId, bucketId);
}
