import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { StatusReport } from '../models/statusReport.model';

const SET = ENTITY_SETS.statusReport;

const BASE_SELECT: string[] = [
  'msdyn_projectstatusreportid',
  'msdyn_name',
  'msdyn_accomplishedactivities',
  'msdyn_plannedactivities',
  'msdyn_additionalcomments',
  'proj_reportingdate',
  'statecode',
  'createdon',
  'modifiedon',
  '_msdyn_project_value',
  '_proj_submittedto_value',
  '_proj_submitter_value',
];

export interface StatusReportPayload {
  msdyn_name: string;
  msdyn_accomplishedactivities?: string;
  msdyn_plannedactivities?: string;
  msdyn_additionalcomments?: string;
  proj_reportingdate?: string | null;
}

export interface StatusReportCreate extends StatusReportPayload {
  'msdyn_project@odata.bind': string; // '/msdyn_projects(id)'
}

export async function listStatusReports(projectId?: string): Promise<StatusReport[]> {
  const filter = projectId
    ? `_msdyn_project_value eq '${projectId}' and statecode eq 0`
    : 'statecode eq 0';
  return dv.list<StatusReport>(SET, {
    $select: BASE_SELECT,
    $filter: filter,
    $orderby: 'createdon desc',
  });
}

/** Fetch the most recent status report for each of the given project IDs (for program-level freshness view). */
export async function listStatusReportsByProjects(projectIds: string[]): Promise<StatusReport[]> {
  if (projectIds.length === 0) return [];
  const projectFilter = projectIds.map((id) => `_msdyn_project_value eq '${id}'`).join(' or ');
  return dv.list<StatusReport>(SET, {
    $select: ['msdyn_projectstatusreportid', '_msdyn_project_value', 'proj_reportingdate', 'createdon', 'msdyn_name'],
    $filter: `(${projectFilter}) and statecode eq 0`,
    $orderby: 'createdon desc',
    $top: Math.max(projectIds.length * 3, 30),
  });
}

export async function getStatusReport(id: string): Promise<StatusReport> {
  return dv.get<StatusReport>(SET, id, BASE_SELECT);
}

export async function createStatusReport(payload: StatusReportCreate): Promise<StatusReport> {
  return dv.create<StatusReport>(SET, payload);
}

export async function updateStatusReport(id: string, payload: StatusReportPayload): Promise<void> {
  return dv.update(SET, id, payload);
}

export async function deleteStatusReport(id: string): Promise<void> {
  return dv.deactivate(SET, id);
}
