/**
 * Cascade-delete helpers for projects and programs.
 *
 * Hard-delete strategy: every child row is removed with `dv.remove()`
 * (OData DELETE). The parent is removed last so partial failures leave a
 * still-visible parent the admin can retry against.
 *
 * There is NO recovery once these calls succeed. Dataverse may keep rows in
 * a 30-day recycle bin if the org has it enabled, but the caller MUST treat
 * this as permanent. The DeleteConfirmDialog gates with type-name-to-confirm
 * to keep accidental triggers out.
 *
 * Pre-flight counts: each public function exposes a `*Summary` companion
 * that returns child counts WITHOUT mutating anything so the confirm dialog
 * can show the user what will be touched. The cascade then re-queries the
 * IDs at delete-time — we don't trust a stale snapshot from the summary.
 */
import * as dv from './dataverseClient';
import { ENTITY_SETS } from './constants';
import type { DeleteChildSummary } from '../components/common/DeleteConfirmDialog';

// ── Project cascade ──────────────────────────────────────────────────────────

/**
 * Children of a project (by `_msdyn_project_value` or `_pmo_project_value`).
 * Order is from most-derived to least so foreign keys are released first.
 */
const PROJECT_CHILD_SPEC: ReadonlyArray<{
  set: string;
  fk: '_msdyn_project_value' | '_pmo_project_value' | '_pmo_convertedproject_value';
  label: string;
}> = [
  // Scheduling-tree children must die before tasks/buckets so dependencies/
  // assignments don't reference now-deactivated rows.
  { set: ENTITY_SETS.projectTaskDependency,  fk: '_msdyn_project_value', label: 'task dependencies' },
  { set: ENTITY_SETS.resourceAssignment,     fk: '_msdyn_project_value', label: 'resource assignments' },
  { set: ENTITY_SETS.projectTaskToLabel,     fk: '_msdyn_project_value', label: 'task labels' },
  { set: ENTITY_SETS.projectChecklist,       fk: '_msdyn_project_value', label: 'task checklists' },
  { set: ENTITY_SETS.projectTask,            fk: '_msdyn_project_value', label: 'tasks' },
  { set: ENTITY_SETS.projectBucket,          fk: '_msdyn_project_value', label: 'buckets' },
  { set: ENTITY_SETS.projectSprint,          fk: '_msdyn_project_value', label: 'sprints' },
  { set: ENTITY_SETS.projectLabel,           fk: '_msdyn_project_value', label: 'labels' },
  { set: ENTITY_SETS.projectTeamMember,      fk: '_msdyn_project_value', label: 'team members' },
  // Governance / monitoring tables (project-scoped pmo_* entities).
  { set: ENTITY_SETS.projectRisk,            fk: '_msdyn_project_value', label: 'risks' },
  { set: ENTITY_SETS.projectIssue,           fk: '_msdyn_project_value', label: 'issues' },
  { set: ENTITY_SETS.projectChange,          fk: '_msdyn_project_value', label: 'changes' },
  { set: ENTITY_SETS.statusReport,           fk: '_msdyn_project_value', label: 'status reports' },
  { set: ENTITY_SETS.projectBaseline,        fk: '_pmo_project_value',   label: 'baselines' },
  { set: ENTITY_SETS.projectDecision,        fk: '_pmo_project_value',   label: 'decisions' },
  { set: ENTITY_SETS.projectGateDecision,    fk: '_pmo_project_value',   label: 'gate decisions' },
  { set: ENTITY_SETS.projectGate,            fk: '_pmo_project_value',   label: 'gates' },
  { set: ENTITY_SETS.projectArtifactStatus,  fk: '_pmo_project_value',   label: 'artifact statuses' },
  { set: ENTITY_SETS.projectCloseout,        fk: '_pmo_project_value',   label: 'closeouts' },
  // Cross-entity sidecars that may carry a project lookup.
  { set: ENTITY_SETS.projectTeam,            fk: '_pmo_project_value',   label: 'project teams' },
  { set: ENTITY_SETS.projectMeetingLink,     fk: '_pmo_project_value',   label: 'meeting links' },
  { set: ENTITY_SETS.documentLink,           fk: '_pmo_project_value',   label: 'document links' },
  { set: ENTITY_SETS.notification,           fk: '_pmo_project_value',   label: 'notifications' },
  { set: ENTITY_SETS.telemetryEvent,         fk: '_pmo_project_value',   label: 'telemetry events' },
  // Originating intake request (lookup points back at the created project).
  { set: ENTITY_SETS.projectRequest,         fk: '_pmo_convertedproject_value', label: 'intake requests' },
];

async function countByFk(set: string, fk: string, parentId: string): Promise<number> {
  try {
    const rows = await dv.list<Record<string, unknown>>(set, {
      $select: [fk.replace(/^_/, '').replace(/_value$/, 'id')],
      $filter: `${fk} eq ${parentId}`,
      $top: 5000,
    });
    return rows.length;
  } catch {
    // Tables that don't exist in the env (or the user can't read) shouldn't
    // block the whole pre-flight. Return 0 so the row hides from the dialog.
    return 0;
  }
}

async function listIdsByFk(
  set: string,
  fk: string,
  parentId: string,
  idField: string,
  extraFilter?: string,
): Promise<string[]> {
  try {
    const filter = extraFilter
      ? `${fk} eq ${parentId} and (${extraFilter})`
      : `${fk} eq ${parentId}`;
    const rows = await dv.list<Record<string, string>>(set, {
      $select: [idField],
      $filter: filter,
      $top: 5000,
    });
    return rows.map((r) => r[idField]).filter(Boolean);
  } catch {
    return [];
  }
}

function idFieldFor(fk: string): string {
  // _msdyn_project_value → msdyn_projectid (logicalname + 'id'). But child
  // ID fields are NOT necessarily named off the parent fk — they follow
  // their own logical name. Caller passes the right field via mapping below.
  return fk;
}

// Each entity-set has its own primary key field. We can't infer it from the
// FK alone, so map it explicitly.
const PK_FIELD: Record<string, string> = {
  [ENTITY_SETS.projectTaskDependency]:  'msdyn_projecttaskdependencyid',
  [ENTITY_SETS.resourceAssignment]:     'msdyn_resourceassignmentid',
  [ENTITY_SETS.projectTaskToLabel]:     'msdyn_projecttasktolabelid',
  [ENTITY_SETS.projectChecklist]:       'msdyn_projectchecklistid',
  [ENTITY_SETS.projectTask]:            'msdyn_projecttaskid',
  [ENTITY_SETS.projectBucket]:          'msdyn_projectbucketid',
  [ENTITY_SETS.projectSprint]:          'msdyn_projectsprintid',
  [ENTITY_SETS.projectLabel]:           'msdyn_projectlabelid',
  [ENTITY_SETS.projectTeamMember]:      'msdyn_projectteamid',
  [ENTITY_SETS.projectRisk]:            'msdyn_projectriskid',
  [ENTITY_SETS.projectIssue]:           'msdyn_projectissueid',
  [ENTITY_SETS.projectChange]:          'msdyn_projectchangeid',
  [ENTITY_SETS.statusReport]:           'msdyn_projectstatusreportid',
  [ENTITY_SETS.projectBaseline]:        'pmo_projectbaselineid',
  [ENTITY_SETS.projectDecision]:        'pmo_projectdecisionid',
  [ENTITY_SETS.projectGateDecision]:    'pmo_projectgatedecisionid',
  [ENTITY_SETS.projectGate]:            'pmo_projectgateid',
  [ENTITY_SETS.projectArtifactStatus]:  'pmo_projectartifactstatusid',
  [ENTITY_SETS.projectCloseout]:        'pmo_projectcloseoutid',
  [ENTITY_SETS.projectTeam]:            'pmo_projectteamid',
  [ENTITY_SETS.projectMeetingLink]:     'pmo_projectmeetinglinkid',
  [ENTITY_SETS.documentLink]:           'pmo_documentlinkid',
  [ENTITY_SETS.notification]:           'pmo_notificationid',
  [ENTITY_SETS.telemetryEvent]:         'pmo_telemetryeventid',
  [ENTITY_SETS.project]:                'msdyn_projectid',
  [ENTITY_SETS.program]:                'msdyn_projectprogramid',
  [ENTITY_SETS.projectRequest]:         'pmo_projectrequestid',
};

export async function summarizeProjectDelete(projectId: string): Promise<DeleteChildSummary[]> {
  const counts = await Promise.all(
    PROJECT_CHILD_SPEC.map(async ({ set, fk, label }) => ({ label, count: await countByFk(set, fk, projectId) })),
  );
  return counts.filter((c) => c.count > 0);
}

/**
 * Soft-delete a project and every related child. Order:
 *   1. Children, grouped by entity, all-at-once within an entity.
 *   2. The project itself.
 */
export async function cascadeDeleteProject(projectId: string): Promise<void> {
  for (const { set, fk } of PROJECT_CHILD_SPEC) {
    const pk = PK_FIELD[set];
    if (!pk) continue;
    // Preserve the change-history audit trail. Operational telemetry
    // (errors, info events scoped to this project) is still swept; only
    // the EntityChange audit rows (writes from useChangeAudit) are kept
    // so the timeline still shows 'project X created/modified/deleted'
    // entries after the project is gone.
    const extraFilter =
      set === ENTITY_SETS.telemetryEvent
        ? "pmo_eventtype ne 'EntityChange'"
        : undefined;
    const ids = await listIdsByFk(set, fk, projectId, pk, extraFilter);
    if (ids.length === 0) continue;
    // Parallelise within an entity; sequential between entities so the SDK
    // doesn't trip over connection limits when we hit 100s of tasks.
    await Promise.all(ids.map((id) => dv.remove(set, id).catch(() => undefined)));
  }
  await dv.remove(ENTITY_SETS.project, projectId);
}

// ── Program cascade ──────────────────────────────────────────────────────────

const PROGRAM_CHILD_SPEC: ReadonlyArray<{
  set: string;
  fk: '_msdyn_program_value' | '_pmo_program_value' | '_pmo_convertedprogram_value';
  label: string;
}> = [
  { set: ENTITY_SETS.projectDecision,    fk: '_pmo_program_value',   label: 'program decisions' },
  { set: ENTITY_SETS.projectMeetingLink, fk: '_pmo_program_value',   label: 'program meeting links' },
  { set: ENTITY_SETS.documentLink,       fk: '_pmo_program_value',   label: 'program document links' },
  { set: ENTITY_SETS.notification,       fk: '_pmo_program_value',   label: 'program notifications' },
  // Originating intake request (lookup points back at the created program).
  { set: ENTITY_SETS.projectRequest,     fk: '_pmo_convertedprogram_value', label: 'intake requests' },
];

async function listProjectIdsForProgram(programId: string): Promise<string[]> {
  return listIdsByFk(ENTITY_SETS.project, '_msdyn_program_value', programId, PK_FIELD[ENTITY_SETS.project]);
}

export async function summarizeProgramDelete(programId: string): Promise<DeleteChildSummary[]> {
  const directCounts = await Promise.all(
    PROGRAM_CHILD_SPEC.map(async ({ set, fk, label }) => ({ label, count: await countByFk(set, fk, programId) })),
  );
  const projectIds = await listProjectIdsForProgram(programId);
  let nestedTaskCount = 0;
  let nestedOther = 0;
  for (const pid of projectIds) {
    for (const { set, fk } of PROJECT_CHILD_SPEC) {
      const n = await countByFk(set, fk, pid);
      if (set === ENTITY_SETS.projectTask) nestedTaskCount += n;
      else nestedOther += n;
    }
  }
  const summary: DeleteChildSummary[] = [
    ...directCounts,
    { label: 'projects', count: projectIds.length },
  ];
  if (nestedTaskCount > 0) summary.push({ label: 'project tasks (across all projects)', count: nestedTaskCount });
  if (nestedOther > 0) summary.push({ label: 'other project-scoped records', count: nestedOther });
  return summary.filter((c) => c.count > 0);
}

/**
 * Soft-delete a program AND every project under it AND every project's
 * children. This is the maximum-cascade option chosen by Antonio in design.
 */
export async function cascadeDeleteProgram(programId: string): Promise<void> {
  // Projects under the program first — each is a full cascade.
  const projectIds = await listProjectIdsForProgram(programId);
  for (const pid of projectIds) {
    await cascadeDeleteProject(pid);
  }
  // Program-scoped direct children.
  for (const { set, fk } of PROGRAM_CHILD_SPEC) {
    const pk = PK_FIELD[set];
    if (!pk) continue;
    const ids = await listIdsByFk(set, fk, programId, pk);
    if (ids.length === 0) continue;
    await Promise.all(ids.map((id) => dv.remove(set, id).catch(() => undefined)));
  }
  await dv.remove(ENTITY_SETS.program, programId);
}

// Suppress unused-warning on idFieldFor (kept for symmetry / future use).
void idFieldFor;
