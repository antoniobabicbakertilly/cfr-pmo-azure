import type { ProjectRequest } from '../models/projectRequest.model';
import type { ConversionRule, StageArtifact } from './intakeValidation';
import * as dv from './dataverseClient';
import { ENTITY_SETS, CONVERSION_TARGET, P4W_GUIDS_BY_ENV, type P4WEnvIds } from './constants';
import { getCachedEnvironmentId } from './deepLink';
import { readExtras, EXTRAS_FIELD_LABELS, EXTRAS_FIELD_KEYS } from './intakeExtras';

/**
 * Resolve the P4W env-pinned GUIDs (calendar, work-hours template,
 * organizational unit) for the current Power Apps environment.
 *
 * Returns undefined for environments we have not yet baked values for; the
 * caller should then omit those binds and let the legacy CFRIntakeToProject
 * flow populate them. See P4W_GUIDS_BY_ENV in constants.ts.
 */
export function getP4WEnvIds(): P4WEnvIds | undefined {
  const envId = getCachedEnvironmentId();
  if (!envId) return undefined;
  return P4W_GUIDS_BY_ENV[envId];
}

export interface ConversionResult {
  prefill: Record<string, unknown>;
  lockedFields: string[];
}

export function applyConversionRules(
  request: ProjectRequest,
  rulesJson: string | undefined,
): ConversionResult {
  const prefill: Record<string, unknown> = {};
  const lockedFields: string[] = [];

  if (!rulesJson) return { prefill, lockedFields };

  let rules: ConversionRule[];
  try {
    rules = JSON.parse(rulesJson);
    if (!Array.isArray(rules)) return { prefill, lockedFields };
  } catch {
    return { prefill, lockedFields };
  }

  for (const rule of rules) {
    const intakeValue = (request as unknown as Record<string, unknown>)[rule.intakeField];
    if (intakeValue === undefined || intakeValue === null || intakeValue === '') continue;

    if (rule.transform === 'odata_bind' && typeof intakeValue === 'string') {
      const entitySet = resolveEntitySetForField(rule.intakeField);
      if (entitySet) {
        prefill[rule.projectField] = `/${entitySet}(${intakeValue})`;
      }
    } else {
      prefill[rule.projectField] = intakeValue;
    }
    lockedFields.push(rule.projectField);
  }

  return { prefill, lockedFields };
}

function resolveEntitySetForField(intakeField: string): string | undefined {
  const fieldToEntity: Record<string, string> = {
    '_pmo_targetteam_value': 'teams',
    '_pmo_affectedsystem_value': 'cr87a_systems',
    '_pmo_requestedby_value': 'systemusers',
  };
  return fieldToEntity[intakeField];
}

export async function carryOverArtifacts(
  stageArtifactsJson: string | undefined,
  projectId: string,
  projectCategory: number | undefined,
): Promise<number> {
  if (!stageArtifactsJson) return 0;

  let stageArtifacts: StageArtifact[];
  try {
    stageArtifacts = JSON.parse(stageArtifactsJson);
    if (!Array.isArray(stageArtifacts)) return 0;
  } catch {
    return 0;
  }

  const artifactDefs = await dv.list<Record<string, unknown>>(ENTITY_SETS.requiredArtifact, {
    $select: ['pmo_requiredartifactid', 'pmo_artifacttype', 'pmo_cfrcategory', 'pmo_isrequired'],
    $filter: 'statecode eq 0 and pmo_isrequired eq true',
  });

  let carried = 0;
  for (const artifact of stageArtifacts) {
    const matchingDef = artifactDefs.find((d) => {
      const defType = d.pmo_artifacttype as number;
      const defCategory = d.pmo_cfrcategory as number | null;
      return defType === artifact.artifactType &&
        (defCategory == null || defCategory === projectCategory);
    });

    if (matchingDef) {
      await dv.create(ENTITY_SETS.projectArtifactStatus, {
        pmo_status: 893460122, // ARTIFACT_STATUS.Complete
        pmo_completeddate: new Date().toISOString().split('T')[0],
        pmo_notes: `Carried over from intake (${artifact.fileName})`,
        'pmo_Project@odata.bind': `/msdyn_projects(${projectId})`,
        'pmo_RequiredArtifact@odata.bind': `/pmo_requiredartifacts(${(matchingDef as Record<string, unknown>).pmo_requiredartifactid})`,
      });
      carried++;
    }
  }

  return carried;
}

// ─── Auto-conversion helpers (called by StageApprovalPanel on final approval) ──

/**
 * Fields that must be populated on a request before it can auto-convert into
 * a project. Mirrors the createProject payload built by buildProjectPayload
 * below — keep the two in sync.
 *
 * Project requests need: name, primary team, start date, PM, sponsor,
 *                        complexity, strategic priority, CFR category.
 * Program requests need: name, start date, PM. (Program rows have a smaller
 *                        column surface — no sponsor / complexity / priority.)
 */
interface RequiredFieldSpec {
  /** Human-readable label shown in the missing-fields error. */
  label: string;
  /** Returns true when the value is present on the request. */
  isPresent: (req: ProjectRequest) => boolean;
}

function projectRequiredFields(): RequiredFieldSpec[] {
  return [
    { label: 'Request Name',          isPresent: (r) => !!r.pmo_name },
    { label: 'Primary Team',          isPresent: (r) => !!r['_pmo_targetteam_value'] },
    { label: 'Requested Start Date',  isPresent: (r) => !!r.pmo_requestedstartdate },
    { label: EXTRAS_FIELD_LABELS[EXTRAS_FIELD_KEYS.projectManagerId],   isPresent: (r) => !!readExtras(r).projectManagerId },
    { label: EXTRAS_FIELD_LABELS[EXTRAS_FIELD_KEYS.executiveSponsorId], isPresent: (r) => !!readExtras(r).executiveSponsorId },
    { label: EXTRAS_FIELD_LABELS[EXTRAS_FIELD_KEYS.complexity],         isPresent: (r) => readExtras(r).complexity != null },
    { label: EXTRAS_FIELD_LABELS[EXTRAS_FIELD_KEYS.strategicPriority],  isPresent: (r) => readExtras(r).strategicPriority != null },
    { label: EXTRAS_FIELD_LABELS[EXTRAS_FIELD_KEYS.cfrCategory],        isPresent: (r) => readExtras(r).cfrCategory != null },
  ];
}

function programRequiredFields(): RequiredFieldSpec[] {
  return [
    { label: 'Request Name',          isPresent: (r) => !!r.pmo_name },
    { label: 'Requested Start Date',  isPresent: (r) => !!r.pmo_requestedstartdate },
    { label: EXTRAS_FIELD_LABELS[EXTRAS_FIELD_KEYS.projectManagerId],   isPresent: (r) => !!readExtras(r).projectManagerId },
  ];
}

/**
 * Validate a request is ready to auto-convert. Returns a list of
 * missing-field labels — empty list means the request can be converted now.
 */
export function validateConversionReadiness(request: ProjectRequest): string[] {
  const isProgram = request.pmo_conversiontarget === CONVERSION_TARGET.Program;
  const specs = isProgram ? programRequiredFields() : projectRequiredFields();
  return specs.filter((s) => !s.isPresent(request)).map((s) => s.label);
}

/**
 * Build the createProject payload from an approved request. Reads both
 * standard columns and the holding-pen extras, returns a ready-to-POST object
 * for `createProject`. Caller is responsible for the post-create side-effects
 * (primary-team membership row, template application, artifact carry-over).
 */
export function buildProjectPayload(request: ProjectRequest): Record<string, unknown> {
  const extras = readExtras(request);
  const payload: Record<string, unknown> = {
    msdyn_subject: request.pmo_name,
  };

  // P4W env-pinned lookups (calendar, work-hours template, contracting org
  // unit). Same code runs in DEV and PROD - schema names are stock Microsoft
  // Project for the Web and identical across environments. Only the GUIDs
  // differ per env (selected by getP4WEnvIds()).
  //
  // Each lookup needs THREE matching pieces:
  //   1. Nav property name (left of @odata.bind) - case-sensitive
  //   2. Entity set name (inside the URL parentheses)
  //   3. The GUID itself
  // Get any of them wrong and Dataverse rejects with 0x80048d19 (undeclared
  // property) or 0x80060888 (resource not found for the segment).
  //
  // Names verified against:
  //   solution/src/Other/Relationships/msdyn_workhourtemplate.xml
  //   solution/src/Other/Relationships/msdyn_organizationalunit.xml
  // If you change these, re-verify both files first.
  //
  // For envs we have not baked GUIDs for (e.g. UAT today) we omit these
  // fields entirely so the legacy CFRIntakeToProject flow can still set them.
  const envIds = getP4WEnvIds();
  if (envIds) {
    // msdyn_calendarid is a *string* column on msdyn_project, not a lookup,
    // so it goes in directly (no @odata.bind).
    payload.msdyn_calendarid = envIds.calendarId;

    // Work-hours template: nav property = 'msdyn_workhourtemplate' (no Id
    // suffix), entity set = 'msdyn_workhourtemplates' (singular 'hour', not
    // 'hours'). Earlier typo 'msdyn_workhourstemplates' failed in PROD.
    payload['msdyn_workhourtemplate@odata.bind'] =
      `/msdyn_workhourtemplates(${envIds.workHoursTemplateId})`;

    // Contracting org unit: nav property = PascalCase
    // 'msdyn_ContractOrganizationalUnitId' (WITH Id suffix - different
    // convention from work-hours template). Entity set =
    // 'msdyn_organizationalunits'.
    payload['msdyn_ContractOrganizationalUnitId@odata.bind'] =
      `/msdyn_organizationalunits(${envIds.orgUnitId})`;
  }

  // Description prefers the verbatim submission text, falls back to pmo_description.
  const desc = request.pmo_submissiontext ?? request.pmo_description;
  if (desc) payload.msdyn_description = desc;

  if (request.pmo_requestedstartdate) payload.msdyn_scheduledstart = request.pmo_requestedstartdate;
  if (request.pmo_targetcompletiondate) payload.msdyn_finish = request.pmo_targetcompletiondate;
  if (typeof request.pmo_estimatedbudget === 'number') payload.proj_budget = request.pmo_estimatedbudget;

  if (extras.cfrCategory != null)       payload.pmo_cfrcategory = extras.cfrCategory;
  if (extras.complexity != null)        payload.pmo_complexity = extras.complexity;
  if (extras.strategicPriority != null) payload.pmo_strategicpriority = extras.strategicPriority;

  // Lookup binds — use NavigationPropertyName (PascalCase schema name).
  const teamId = request['_pmo_targetteam_value'];
  if (teamId) payload['pmo_PrimaryTeam@odata.bind'] = `/teams(${teamId})`;
  if (extras.projectManagerId)   payload['msdyn_projectmanager@odata.bind']  = `/systemusers(${extras.projectManagerId})`;
  if (extras.executiveSponsorId) payload['proj_ExecutiveSponsor@odata.bind'] = `/systemusers(${extras.executiveSponsorId})`;

  return payload;
}

/**
 * Build the createProgram payload from an approved request. Programs use a
 * different schema (msdyn_name, proj_programstart/due, fewer classification
 * columns) so this is intentionally separate from buildProjectPayload.
 */
export function buildProgramPayload(request: ProjectRequest): Record<string, unknown> {
  const extras = readExtras(request);
  const payload: Record<string, unknown> = {
    msdyn_name: request.pmo_name,
  };

  const desc = request.pmo_submissiontext ?? request.pmo_description;
  if (desc) payload.msdyn_description = desc;

  if (request.pmo_requestedstartdate) payload.proj_programstart = request.pmo_requestedstartdate;
  if (request.pmo_targetcompletiondate) payload.proj_programdue = request.pmo_targetcompletiondate;
  if (typeof request.pmo_estimatedbudget === 'number') payload.msdyn_budget = request.pmo_estimatedbudget;

  // Programs reuse Project Manager as the program manager (proj_Manager).
  if (extras.projectManagerId) payload['proj_Manager@odata.bind'] = `/systemusers(${extras.projectManagerId})`;

  return payload;
}
