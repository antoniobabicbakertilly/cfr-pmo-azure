import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { ProjectMeetingLink, ProjectMeetingLinkCreate, ProjectMeetingLinkUpdate } from '../models/projectMeetingLink.model';

const SET = ENTITY_SETS.projectMeetingLink;
const FIELDS: (keyof ProjectMeetingLink)[] = [
  'pmo_projectmeetinglinkid', 'pmo_name', 'pmo_meetingsubject', 'pmo_meetingdatetime',
  'pmo_meetingurl', 'pmo_notes', 'statecode', 'createdon',
  '_pmo_project_value', '_pmo_program_value',
];

export async function listProjectMeetingLinks(projectId: string): Promise<ProjectMeetingLink[]> {
  return dv.list<ProjectMeetingLink>(SET, {
    $select: FIELDS,
    $filter: `_pmo_project_value eq '${projectId}' and statecode eq 0`,
    $orderby: 'pmo_meetingdatetime desc',
  });
}

export async function createProjectMeetingLink(payload: ProjectMeetingLinkCreate): Promise<ProjectMeetingLink> {
  return dv.create<ProjectMeetingLink>(SET, payload);
}

export async function updateProjectMeetingLink(id: string, payload: ProjectMeetingLinkUpdate): Promise<void> {
  return dv.update(SET, id, payload);
}

export async function deactivateProjectMeetingLink(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
