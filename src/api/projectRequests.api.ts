import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS, REQUEST_STATUS, CLARIFICATION_STATE } from '../lib/constants';
import type { ProjectRequest, ProjectRequestCreate, ProjectRequestUpdate } from '../models/projectRequest.model';
import type { ODataParams } from '../models/common.model';

const SET = ENTITY_SETS.projectRequest;

const BASE_SELECT: string[] = [
  'pmo_projectrequestid',
  'pmo_name',
  'pmo_autonumber',
  'pmo_requesttype',
  'pmo_priority',
  'pmo_status',
  'pmo_requestedstartdate',
  'pmo_targetcompletiondate',
  'pmo_estimatedbudget',
  'pmo_sourcesystem',
  'pmo_converteddate',
  'pmo_routingconfidence',
  'pmo_lineofbusiness',
  'pmo_currentstagenumber',
  'pmo_conversiontarget',
  'statecode',
  'createdon',
  'modifiedon',
  '_createdby_value',
  '_pmo_requestedby_value',
  '_pmo_targetteam_value',
  '_pmo_convertedproject_value',
  '_pmo_convertedprogram_value',
  '_pmo_affectedsystem_value',
  '_pmo_parentrequest_value',
  '_pmo_intakeworkflowid_value',
];

export async function listProjectRequests(params?: ODataParams): Promise<ProjectRequest[]> {
  return dv.list<ProjectRequest>(SET, {
    $select: BASE_SELECT,
    $orderby: 'createdon desc',
    ...params,
  });
}

export async function getProjectRequest(id: string): Promise<ProjectRequest> {
  return dv.get<ProjectRequest>(SET, id, [
    ...BASE_SELECT,
    'pmo_description',
    'pmo_businessjustification',
    'pmo_triagecomments',
    'pmo_rejectionreason',
    'pmo_submissiontext',
    'pmo_routingrecommendation',
    'pmo_extractedfieldsjson',
    'pmo_clarificationstate',
    'pmo_clarificationquestion',
    'pmo_clarificationresponse',
    'pmo_outcomecategory',
    '_pmo_approvedby_value',
    'pmo_stagedatajson',
    'pmo_stageartifactsjson',
    'pmo_approvalchain',
  ]);
}

export async function createProjectRequest(payload: ProjectRequestCreate): Promise<ProjectRequest> {
  return dv.create<ProjectRequest>(SET, {
    ...payload,
    pmo_status: REQUEST_STATUS.Draft,
  });
}

export async function updateProjectRequest(id: string, payload: ProjectRequestUpdate): Promise<void> {
  return dv.update(SET, id, payload);
}

/**
 * Hard-delete a draft project request. Caller must enforce business rules
 * (only the creator may delete, only while status is Draft) — this helper
 * does not re-check them.
 */
export async function deleteProjectRequest(id: string): Promise<void> {
  return dv.remove(SET, id);
}

export async function submitRequest(id: string): Promise<void> {
  return dv.update(SET, id, { pmo_status: REQUEST_STATUS.Submitted });
}

export async function approveRequest(id: string): Promise<void> {
  // pmo_approvedby is set by the pmo_CFR_IntakeToProject flow using the modifiedby context.
  return dv.update(SET, id, { pmo_status: REQUEST_STATUS.Approved });
}

export async function rejectRequest(id: string, rejectionReason: string): Promise<void> {
  return dv.update(SET, id, {
    pmo_status: REQUEST_STATUS.Rejected,
    pmo_rejectionreason: rejectionReason,
  });
}

export async function moveToTriage(id: string): Promise<void> {
  return dv.update(SET, id, { pmo_status: REQUEST_STATUS.InTriage });
}

export async function routeOperational(id: string, teamId?: string): Promise<void> {
  const payload: ProjectRequestUpdate = { pmo_status: REQUEST_STATUS.RoutedOperational };
  if (teamId) payload['pmo_TargetTeam@odata.bind'] = `/teams(${teamId})`;
  return dv.update(SET, id, payload);
}

export async function redirectRequest(id: string, triageComments: string): Promise<void> {
  return dv.update(SET, id, {
    pmo_status: REQUEST_STATUS.Redirected,
    pmo_triagecomments: triageComments,
  });
}

export async function requestClarification(id: string, question: string): Promise<void> {
  return dv.update(SET, id, {
    pmo_status: REQUEST_STATUS.AwaitingClarification,
    pmo_clarificationstate: CLARIFICATION_STATE.PendingRequester,
    pmo_clarificationquestion: question,
  });
}

export async function resolveClarification(id: string, response: string): Promise<void> {
  return dv.update(SET, id, {
    pmo_clarificationresponse: response,
    pmo_clarificationstate: CLARIFICATION_STATE.Resolved,
    pmo_status: REQUEST_STATUS.InTriage,
  });
}

export async function markAsDuplicate(id: string, originalRequestId: string, autoNumber: string): Promise<void> {
  return dv.update(SET, id, {
    pmo_status: REQUEST_STATUS.Rejected,
    pmo_rejectionreason: `Duplicate of ${autoNumber}`,
    'pmo_ParentRequest@odata.bind': `/pmo_projectrequests(${originalRequestId})`,
  });
}

export async function linkParentRequest(id: string, parentRequestId: string): Promise<void> {
  return dv.update(SET, id, {
    'pmo_ParentRequest@odata.bind': `/pmo_projectrequests(${parentRequestId})`,
  });
}
