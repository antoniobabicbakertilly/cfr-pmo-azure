import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { RequiredArtifact, RequiredArtifactCreate, ProjectArtifactStatus, ProjectArtifactStatusCreate, ProjectArtifactStatusUpdate } from '../models/requiredArtifact.model';

const ART_SET = ENTITY_SETS.requiredArtifact;
const STATUS_SET = ENTITY_SETS.projectArtifactStatus;

const ART_FIELDS: (keyof RequiredArtifact)[] = [
  'pmo_requiredartifactid', 'pmo_name', 'pmo_artifacttype',
  'pmo_cfrcategory', 'pmo_isrequired', 'pmo_description', 'statecode',
];

const STATUS_FIELDS: (keyof ProjectArtifactStatus)[] = [
  'pmo_projectartifactstatusid', 'pmo_name', 'pmo_status',
  'pmo_completeddate', 'pmo_notes', 'statecode',
  '_pmo_project_value', '_pmo_requiredartifact_value', '_pmo_documentlink_value',
];

export async function listRequiredArtifacts(): Promise<RequiredArtifact[]> {
  return dv.list<RequiredArtifact>(ART_SET, {
    $select: ART_FIELDS,
    $filter: 'statecode eq 0',
    $orderby: 'pmo_name asc',
  });
}

export async function createRequiredArtifact(payload: RequiredArtifactCreate): Promise<RequiredArtifact> {
  return dv.create<RequiredArtifact>(ART_SET, payload);
}

export async function updateRequiredArtifact(id: string, payload: Partial<RequiredArtifactCreate>): Promise<void> {
  return dv.update(ART_SET, id, payload);
}

export async function deactivateRequiredArtifact(id: string): Promise<void> {
  return dv.deactivate(ART_SET, id);
}

export async function countProjectsUsingArtifact(artifactId: string): Promise<number> {
  const statuses = await dv.list<{ pmo_projectartifactstatusid: string }>(STATUS_SET, {
    $select: ['pmo_projectartifactstatusid'],
    $filter: `_pmo_requiredartifact_value eq '${artifactId}' and statecode eq 0`,
  });
  return statuses.length;
}

export async function listProjectArtifactStatuses(projectId: string): Promise<ProjectArtifactStatus[]> {
  return dv.list<ProjectArtifactStatus>(STATUS_SET, {
    $select: STATUS_FIELDS,
    $filter: `_pmo_project_value eq '${projectId}' and statecode eq 0`,
  });
}

export async function createProjectArtifactStatus(payload: ProjectArtifactStatusCreate): Promise<ProjectArtifactStatus> {
  return dv.create<ProjectArtifactStatus>(STATUS_SET, payload);
}

export async function updateProjectArtifactStatus(id: string, payload: ProjectArtifactStatusUpdate): Promise<void> {
  return dv.update(STATUS_SET, id, payload);
}
