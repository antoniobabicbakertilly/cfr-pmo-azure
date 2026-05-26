import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';
import type { Project, ProjectUpdate } from '../models/project.model';
import type { ODataParams } from '../models/common.model';

const SET = ENTITY_SETS.project;

const BASE_SELECT: string[] = [
  // ── Core ─────────────────────────────────────────────────────────────────
  'msdyn_projectid',
  'msdyn_subject',
  'msdyn_description',
  'msdyn_businesscase',
  'msdyn_valuestatement',
  'msdyn_comments',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
  'ownerid',
  // ── Schedule ─────────────────────────────────────────────────────────────
  'msdyn_scheduledstart',
  'msdyn_finish',
  'msdyn_progress',
  'msdyn_duration',
  'msdyn_effort',
  'msdyn_effortcompleted',
  'msdyn_effortremaining',
  'msdyn_hoursperday',
  'msdyn_hoursperweek',
  'msdyn_dayspermonth',
  'msdyn_schedulemode',
  // ── Lookups ──────────────────────────────────────────────────────────────
  '_msdyn_msprojectdocument_value',
  '_msdyn_projectmanager_value',
  '_msdyn_program_value',
  '_proj_executivesponsor_value',
  '_proj_manager_value',
  '_pmo_primaryteam_value',
  '_pmo_requestsource_value',
  // ── Accelerator classification ────────────────────────────────────────────
  'proj_stage',
  'proj_state',
  'proj_priority',
  'proj_projecttype',
  'proj_businessunit',
  'proj_fundingavailable',
  'proj_fundingsource',
  'proj_needsstaffing',
  // ── Accelerator health ────────────────────────────────────────────────────
  'proj_overallhealth',
  'proj_efforthealth',
  'proj_financialhealth',
  'proj_schedulehealth',
  'proj_issuehealth',
  'proj_activerisks',
  'proj_activeissues',
  'proj_activechanges',
  // ── Accelerator financials ────────────────────────────────────────────────
  'proj_budget',
  'proj_actualcost',
  'proj_forecast',
  'proj_remainingbudget',
  'proj_budgetvariance',
  'proj_benefits',
  'proj_roi',
  'proj_prioritizationscore',
  // ── Accelerator strategic scoring ─────────────────────────────────────────
  'proj_strategicalignment',
  'proj_strategicalignmentscore',
  'proj_improveemployeeretention',
  'proj_improveemployeeretentionscore',
  'proj_lowercost',
  'proj_lowercostscore',
  'proj_risk',
  'proj_riskscore',
  // ── CFR custom ───────────────────────────────────────────────────────────
  'pmo_cfrcategory',
  'pmo_complexity',
  'pmo_strategicpriority',
];

export async function listProjects(params?: ODataParams): Promise<Project[]> {
  return dv.list<Project>(SET, {
    $select: BASE_SELECT,
    $orderby: 'createdon desc',
    ...params,
  });
}

export async function listActiveProjects(): Promise<Project[]> {
  return dv.list<Project>(SET, {
    $select: BASE_SELECT,
    $filter: 'statecode eq 0',
    $orderby: 'msdyn_subject asc',
  });
}

export async function getProject(id: string): Promise<Project> {
  return dv.get<Project>(SET, id, BASE_SELECT);
}

export async function createProject(payload: object): Promise<Project> {
  return dv.create<Project>(SET, payload);
}

export async function updateProject(id: string, payload: ProjectUpdate): Promise<void> {
  return dv.update(SET, id, payload);
}
