// OWNERSHIP [HIGH-RISK]: Split — Platform Domain Owner controls ENTITY_SETS and SETTING_* keys; Application Domain Contributor controls option-set blocks.
// See CONTRIBUTING.md §Shared Files for coordination rules.

/** Entity set names for Dataverse OData API calls */
export const ENTITY_SETS = {
  // CFR custom tables
  projectRequest:    'pmo_projectrequests',         // pmo_projectrequest
  projectTeam:       'pmo_projectteams',            // pmo_projectteam (CFR junction: project ↔ team)
  // P4W + Accelerator tables
  project:           'msdyn_projects',              // msdyn_project
  program:           'msdyn_projectprograms',       // msdyn_projectprogram
  statusReport:      'msdyn_projectstatusreports',  // msdyn_projectstatusreport
  projectTask:           'msdyn_projecttasks',              // msdyn_projecttask
  projectTaskDependency: 'msdyn_projecttaskdependencies',   // msdyn_projecttaskdependency
  resourceAssignment:    'msdyn_resourceassignments',       // msdyn_resourceassignment
  bookableResource:      'bookableresources',               // bookableresource
  projectBucket:         'msdyn_projectbuckets',            // msdyn_projectbucket
  projectTeamMember: 'msdyn_projectteams',          // msdyn_projectteam (P4W native resource records)
  projectRisk:       'msdyn_projectrisks',          // msdyn_projectrisk
  projectIssue:      'msdyn_projectissues',         // msdyn_projectissue
  projectChange:     'msdyn_projectchanges',        // msdyn_projectchange
  // P4W scheduling entities (spike-validated 2026-04-18)
  projectChecklist:      'msdyn_projectchecklists',     // msdyn_projectchecklist (S6 PASS)
  projectLabel:          'msdyn_projectlabels',         // msdyn_projectlabel (S5 PASS)
  projectTaskToLabel:    'msdyn_projecttasktolabels',   // msdyn_projecttasktolabel (S5b PASS)
  projectSprint:         'msdyn_projectsprints',        // msdyn_projectsprint (S8 accessible)
  // System tables
  organization:      'organizations',
  systemUser:        'systemusers',
  team:              'teams',
  documentHeader:    'msdyn_documentheaders',
  // Reference / master-data tables
  crSystem:          'cr87a_systems',           // central system catalog (cr87a_System)
  annotation:        'annotations',             // Dataverse notes / file attachments
  appSetting:        'pmo_appsettings',         // pmo_AppSetting — administrator key-value config
  projectTemplate:   'pmo_projecttemplates',    // pmo_ProjectTemplate — project template definitions
  documentLink:      'pmo_documentlinks',       // pmo_DocumentLink — project/program document metadata
  projectGate:       'pmo_projectgates',        // pmo_ProjectGate — lifecycle governance gates
  projectGateDecision: 'pmo_projectgatedecisions', // pmo_ProjectGateDecision — gate approval decisions
  requiredArtifact:  'pmo_requiredartifacts',   // pmo_RequiredArtifact — artifact definitions
  projectArtifactStatus: 'pmo_projectartifactstatuses', // pmo_ProjectArtifactStatus — per-project artifact tracking
  projectCloseout:   'pmo_projectcloseouts',    // pmo_ProjectCloseout — closeout checklist
  notification:      'pmo_notifications',       // pmo_Notification — durable in-app notifications
  telemetryEvent:    'pmo_telemetryevents',     // pmo_TelemetryEvent — telemetry persistence
  projectDecision:   'pmo_projectdecisions',    // pmo_ProjectDecision — decision log
  projectMeetingLink: 'pmo_projectmeetinglinks', // pmo_ProjectMeetingLink — meeting ↔ project linkage
  projectBaseline:   'pmo_projectbaselines',    // pmo_ProjectBaseline — schedule/financial baseline snapshots
  gateSetTemplate:   'pmo_gatesettemplates',    // pmo_GateSetTemplate — admin gate set definitions
  gateSetItem:       'pmo_gatesetitems',        // pmo_GateSetItem — items within a gate set
  role:              'roles',                   // Dataverse security role — queried via systemuserroles_association
} as const;

/** Default stale time for TanStack Query (5 minutes) */
export const QUERY_STALE_TIME = 5 * 60 * 1000;

/**
 * msdyn_projecttask.msdyn_priority — Planner Premium / P4W priority values.
 * These are the actual integer option-set values stored in Dataverse.
 * Confirmed from spike S2 (2026-04-18): value 3 → "Important" in Planner.
 * Confirmed from live data: most tasks default to 5 → "Medium" in Planner.
 * Source: Microsoft Planner priority scale (same values used by Graph plannerTask.priority
 * snap-points: 1=Urgent, 3=Important, 5=Medium, 9=Low).
 */
export const TASK_PRIORITY = {
  Urgent:    1,
  Important: 3,
  Medium:    5,  // default when a task is created in Planner without explicit priority
  Low:       9,
} as const;

export type TaskPriorityValue = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];

export interface TaskPriorityMeta { label: string; cls: string }

export const TASK_PRIORITY_META: Record<number, TaskPriorityMeta> = {
  [TASK_PRIORITY.Urgent]:    { label: 'Urgent',    cls: 'bg-rose-100 text-rose-700' },
  [TASK_PRIORITY.Important]: { label: 'Important', cls: 'bg-amber-100 text-amber-700' },
  [TASK_PRIORITY.Medium]:    { label: 'Medium',    cls: 'bg-blue-100 text-blue-600' },
  [TASK_PRIORITY.Low]:       { label: 'Low',       cls: 'bg-slate-100 text-slate-500' },
};

/** Ordered list for selects and filter chips, highest to lowest. */
export const TASK_PRIORITY_OPTIONS = [
  { value: TASK_PRIORITY.Urgent,    ...TASK_PRIORITY_META[TASK_PRIORITY.Urgent] },
  { value: TASK_PRIORITY.Important, ...TASK_PRIORITY_META[TASK_PRIORITY.Important] },
  { value: TASK_PRIORITY.Medium,    ...TASK_PRIORITY_META[TASK_PRIORITY.Medium] },
  { value: TASK_PRIORITY.Low,       ...TASK_PRIORITY_META[TASK_PRIORITY.Low] },
] as const;

// ─── pmo_projectrequest choices ───────────────────────────────────────────────

export const REQUEST_TYPE = {
  NewProject: 893460000,
  ChangeRequest: 893460001,
  Enhancement: 893460002,
  Support: 893460003,
  NewProgram: 893460004,
} as const;

export const REQUEST_PRIORITY = {
  Critical: 893460010,
  High: 893460011,
  Medium: 893460012,
  Low: 893460013,
} as const;

export const REQUEST_STATUS = {
  Draft: 893460020,
  Submitted: 893460021,
  InTriage: 893460022,
  Approved: 893460023,
  Rejected: 893460024,
  Converted: 893460025,
  AwaitingClarification: 893460026,
  RoutedOperational: 893460027,
  Redirected: 893460028,
} as const;

export const FEEDBACK_TYPE = {
  BugReport: 153480000,
  Enhancement: 153480001,
} as const;

export const FEEDBACK_STATUS = {
  New: 153480000,
  InReview: 153480001,
  Accepted: 153480002,
  Resolved: 153480003,
} as const;

export const FEEDBACK_PRIORITY = {
  Critical: 153480000,
  High: 153480001,
  Medium: 153480002,
  Low: 153480003,
} as const;

export const CLARIFICATION_STATE = {
  None: 0,
  PendingRequester: 1,
  PendingPMO: 2,
  Resolved: 3,
} as const;

export const OUTCOME_CATEGORY = {
  Project: 0,
  Operational: 1,
  Redirect: 2,
  Declined: 3,
} as const;

export const LINE_OF_BUSINESS = {
  Enteral: 893460100,
  InfusionEpic: 893460101,
  InfusionMediAR: 893460102,
  All: 893460103,
} as const;

/** Key used in pmo_AppSetting to store the fallback triage team GUID */
export const SETTING_FALLBACK_TRIAGE_TEAM = 'pmo.fallback_triage_team_id';

/** Key used in pmo_AppSetting to scope user dropdowns by AAD security group object ID.
 *  Stored as the AAD group object ID (not the Dataverse team GUID) so it works across environments. */
export const SETTING_USER_SCOPE_GROUP = 'pmo.user_scope_aad_group_id';

export const SETTING_DEFAULT_PROJECT_TEMPLATE = 'pmo.default_project_template_id';

export const SETTING_TEAM_DEFAULT_TEMPLATE_PREFIX = 'pmo.team_default_template.';

// ─── Phase 2 setting keys (admin-managed operational config) ─────────────────
export const SETTING_DASHBOARD_DISPLAY_CONFIG        = 'pmo.dashboard_display_config_json';
export const SETTING_INTAKE_TRIAGE_SIMILARITY_CONFIG = 'pmo.intake_triage_similarity_config_json';
export const SETTING_NOTIFICATION_DISPLAY_CONFIG     = 'pmo.notification_display_config_json';
export const SETTING_SP_DOCUMENT_CATEGORIES          = 'pmo.sp_document_categories_json';
export const SETTING_SP_LIBRARY_BASE_URL             = 'pmo.sp_library_base_url';
export const SETTING_PMO_TEAM_FIELD                  = 'pmo.pmo_team_field';
export const SETTING_TENANT_ID                       = 'pmo.tenant_id';
export const SETTING_INTAKE_ROUTING_CONFIG           = 'pmo.intake_routing_config_json';
export const SETTING_PRIORITIZATION_WEIGHTS          = 'pmo.prioritization_weights_json';
export const SETTING_PRIORITIZATION_BUDGET_TIERS     = 'pmo.prioritization_budget_tiers_json';
export const SETTING_MIRA_SIGNAL_THRESHOLDS          = 'pmo.mira_signal_thresholds_json';
export const SETTING_FEATURE_TOGGLES                  = 'pmo.feature_toggles_json';

// ─── Environment IDs (Power Platform environmentId) ──────────────────────────
// Used to switch env-pinned values (P4W GUIDs, etc.) at runtime so the same
// bundle ships unchanged to DEV / UAT / PROD. Source of truth is the Env Map
// in docs/deployment-runbook.md. Also referenced by the Sidebar env badge.
export const ENV_IDS = {
  dev:  '731e4975-10cd-4535-b82f-1ff016e59b6c',  // Nexus RCM - DEV
  uat:  '69a4a130-ad3b-491e-8dac-7ce7a41a7934',  // Nexus RCM - UAT
  prod: '7a0a0d77-0433-4d7e-9480-604d1d24cc6f',  // Nexus - AntonioTemplate Finance RevCycle
} as const;

// ─── P4W environment-pinned GUIDs ────────────────────────────────────────────
// Calendar, work-hours template, and contracting organizational unit records
// all exist in every P4W environment but with different GUIDs per env.
// Previously hardcoded into the CFRIntakeToProject flow JSON and patched via
// PowerShell at deploy. Now baked here and selected by environmentId at
// runtime so the client-side conversion path (StageApprovalPanel) builds a
// P4W-valid project payload without any deploy-time patching.
//
// Values verified against docs/deployment-runbook.md (PROD/UAT) and
// solution/src/Workflows/pmo_CFRIntakeToProject-*.json (DEV).
export interface P4WEnvIds {
  calendarId: string;
  workHoursTemplateId: string;
  orgUnitId: string;
}

// Only DEV and PROD are baked. UAT and any other env intentionally fall through
// (resolver returns undefined) so the legacy CFRIntakeToProject flow handles
// them. Runbook+flow JSON+patch script currently disagree on UAT's GUIDs; we
// will fill UAT in once verified directly against msdyn_organizationalunits.
export const P4W_GUIDS_BY_ENV: Record<string, P4WEnvIds> = {
  [ENV_IDS.dev]: {
    // Sourced from solution/src/Workflows/pmo_CFRIntakeToProject-*.json
    calendarId:          '592d1cba-2e32-f111-88b4-000d3a1ece46',
    workHoursTemplateId: '501397da-cf31-f111-88b4-000d3a1d26fa',
    orgUnitId:           '381c82d4-cf31-f111-88b4-000d3a1d26fa',
  },
  [ENV_IDS.prod]: {
    // Sourced from docs/deployment-runbook.md "Prod P4W GUIDs" table.
    calendarId:          '6138f6d6-f570-ef11-a670-0022482c38a9',
    workHoursTemplateId: '6038f6d6-f570-ef11-a670-0022482c38a9',
    orgUnitId:           '5638f6d6-f570-ef11-a670-0022482c38a9',
  },
};

export const SOURCE_SYSTEM = {
  CfrPmo: 893460030,
  BiPmoTool: 893460031,
  External: 893460032,
} as const;

// ─── pmo_projectteam choices ───────────────────────────────────────────────────

export const TEAM_ROLE = {
  Primary: 893460040,
  Contributing: 893460041,
} as const;

// ─── msdyn_project extension choices ──────────────────────────────────────────

export const CFR_CATEGORY = {
  ItInfrastructure: 893460050,
  FinanceSystems: 893460051,
  Compliance: 893460052,
  DataAndAnalytics: 893460053,
  Operations: 893460054,
  Other: 893460055,
} as const;

export const COMPLEXITY = {
  Low: 893460060,
  Medium: 893460061,
  High: 893460062,
  Critical: 893460063,
} as const;

export const STRATEGIC_PRIORITY = {
  MustHave: 893460070,
  ShouldHave: 893460071,
  NiceToHave: 893460072,
} as const;

// ─── msdyn_projectprogram Accelerator choices ─────────────────────────────────
// Queried from DEV on 2026-04-17 via PicklistAttributeMetadata

export const PROG_TYPE = {
  Customer:    189330000,
  Development: 189330001,
  Support:     189330002,
  Enhancement: 189330003,
  Program:     189330004,
  Other:       189330005,
} as const;

export const PROG_GOALS = {
  CustomerSatisfaction: 189330000,
  GrowBusiness:         189330001,
  RunBusiness:          189330002,
  Transformation:       189330003,
  Other:                189330004,
} as const;

// CFR-specific business unit deployment (Coram/RCM)
export const PROG_BUSINESS_UNIT = {
  Enteral:        189330000,
  Epic:           189330001,
  InfusionLegacy: 189330002,
  Medicare:       153480001,
} as const;

// ─── proj_overallhealth (PMO Accelerator) ─────────────────────────────────────

export const OVERALL_HEALTH = {
  OnTrack: 189330000,
  AtRisk: 189330001,
  OffTrack: 189330002,
} as const;

// ─── msdyn_projectrisk Accelerator choices ─────────────────────────────────────

export const RISK_CATEGORY = {
  Stakeholder: 189330000,
  Scope: 189330001,
  Change: 189330002,
  Resources: 189330003,
  Design: 189330004,
  Technical: 189330005,
  Other: 189330006,
} as const;

export const RISK_STATE = {
  Proposed: 189330000,
  Active: 189330001,
  Closed: 189330002,
  OnHold: 189330003,
} as const;

// ─── msdyn_projectissue Accelerator choices ────────────────────────────────────

export const ISSUE_CATEGORY = {
  Issue: 189330000,
  Task: 189330001,
  Bug: 189330002,
  Other: 189330003,
} as const;

// proj_priority is shared by issue and change
export const ACCEL_PRIORITY = {
  Critical: 189330000,
  High: 189330001,
  Moderate: 189330002,
  Low: 189330003,
} as const;

// proj_state is shared by risk, issue, and change
export const ACCEL_STATE = {
  Proposed: 189330000,
  Active: 189330001,
  Closed: 189330002,
  OnHold: 189330003,
} as const;

// ─── msdyn_projectchange Accelerator choices ───────────────────────────────────

export const CHANGE_TYPE = {
  Scope: 189330000,
  Schedule: 189330001,
  Cost: 189330002,
  None: 189330003,
} as const;

export const CHANGE_IMPACT = {
  High: 189330000,
  Medium: 189330001,
  Low: 189330002,
} as const;

export const CHANGE_RISK = {
  High: 189330000,
  Moderate: 189330001,
  Low: 189330002,
  None: 189330003,
} as const;

export const CHANGE_APPROVAL = {
  NotYetRequested: 189330000,
  Requested: 189330001,
  Approved: 189330002,
  Rejected: 189330003,
} as const;

// ─── Team flag field name ──────────────────────────────────────────────────────
// pmo_pmoteam is a Boolean column owned by CFRProjectManagement solution (pmo_ publisher).
// DEV previously used cr741_pmoteam from another publisher; this column is the solution-owned replacement.
// Populate this flag on all PMO teams in UAT/PROD after solution import.
export const PMO_TEAM_FLAG = 'pmo_pmoteam' as const;

// ─── Planner deep link ─────────────────────────────────────────────────────────
// Template: PLANNER_BASE + planId + '/org/' + organizationId + PLANNER_BOARD_SUFFIX + '?tid=' + TENANT_ID
// organizationId is queried at runtime from GET /api/data/v9.2/organizations

export const PLANNER_BASE = 'https://planner.cloud.microsoft/webui/premiumplan/';
export const PLANNER_BOARD_SUFFIX = '/view/board';
export const TENANT_ID = 'fabb61b8-3afe-4e75-b934-a47f782b8cd7';

// ─── pmo_projectgate choices ─────────────────────────────────────────────────

export const GATE_TYPE = {
  Initiation: 893460090,
  Planning:   893460091,
  Execution:  893460092,
  Closeout:   893460093,
} as const;

export const GATE_STATUS = {
  NotStarted: 893460094,
  InProgress: 893460095,
  Passed:     893460096,
  Failed:     893460097,
  Waived:     893460098,
} as const;

export const GATE_DECISION = {
  Approved: 893460100,
  Rejected: 893460101,
  Deferred: 893460102,
} as const;

// ─── pmo_requiredartifact choices ────────────────────────────────────────────

export const ARTIFACT_TYPE = {
  BusinessCase:       893460110,
  ProjectCharter:     893460111,
  RaciMatrix:         893460112,
  CommunicationPlan:  893460113,
  RiskRegister:       893460114,
  SOW:                893460115,
  Budget:             893460116,
  CloseoutReport:     893460117,
  LessonsLearned:     893460118,
  Other:              893460119,
} as const;

export const ARTIFACT_STATUS = {
  NotStarted: 893460120,
  InProgress: 893460121,
  Complete:   893460122,
  Waived:     893460123,
} as const;

// ─── pmo_notification choices ────────────────────────────────────────────────

export const NOTIF_CATEGORY = {
  Gate:     893460130,
  Artifact: 893460131,
  Closeout: 893460132,
  Meeting:  893460133,
  Error:    893460134,
  Info:     893460135,
} as const;

// ─── pmo_telemetryevent choices ──────────────────────────────────────────────

export const TELEMETRY_SEVERITY = {
  Info:     893460140,
  Warning:  893460141,
  Error:    893460142,
  Critical: 893460143,
} as const;

// ─── pmo_projectdecision choices ─────────────────────────────────────────────

export const DECISION_STATUS = {
  Proposed: 893460150,
  Approved: 893460151,
  Rejected: 893460152,
  Deferred: 893460153,
} as const;

export const DECISION_IMPACT = {
  High:   893460154,
  Medium: 893460155,
  Low:    893460156,
} as const;

// ─── Intake workflow / governed initiation choices ──────────────────────────

export const WORKFLOW_SCOPE = {
  IntakeWorkflow: 893460200,
  ProjectGateset: 893460201,
} as const;

export const TARGET_ENTITY_TYPE = {
  Project: 893460210,
  Program: 893460211,
} as const;

export const CONVERSION_TARGET = {
  Project: 893460220,
  Program: 893460221,
} as const;

// ─── Intake workflow app settings keys ──────────────────────────────────────

export const SETTING_DEFAULT_INTAKE_WORKFLOW = 'pmo.default_intake_workflow_id';
export const SETTING_PROJECT_INTAKE_WORKFLOW = 'pmo.project_intake_workflow_id';
export const SETTING_PROGRAM_INTAKE_WORKFLOW = 'pmo.program_intake_workflow_id';
export const SETTING_INTAKE_ANALYTICS_RETENTION_DAYS = 'pmo.intake_analytics_retention_days';

// ─── Intake field labels (for admin stage configuration UI) ─────────────────

export const INTAKE_CONFIGURABLE_FIELDS: Record<string, string> = {
  pmo_name: 'Request Name',
  pmo_description: 'Description',
  pmo_businessjustification: 'Business Justification',
  pmo_submissiontext: 'Submission Text',
  pmo_lineofbusiness: 'Line of Business',
  pmo_requestedstartdate: 'Requested Start Date',
  pmo_targetcompletiondate: 'Target Completion Date',
  pmo_estimatedbudget: 'Estimated Budget',
  pmo_priority: 'Priority',
  pmo_requesttype: 'Request Type',
  // Real lookup column (set via pmo_TargetTeam@odata.bind on write)
  _pmo_targetteam_value: 'Primary Team',
  // Real lookup column (set via pmo_AffectedSystem@odata.bind on write)
  _pmo_affectedsystem_value: 'Affected System',
  // Holding-pen fields (stored in pmo_extractedfieldsjson under aip_intakeExtras
  // until real columns exist on pmo_projectrequest). See lib/intakeExtras.ts.
  'extras.projectManagerId': 'Project Manager',
  'extras.executiveSponsorId': 'Executive Sponsor',
  'extras.complexity': 'Complexity',
  'extras.strategicPriority': 'Strategic Priority',
  'extras.cfrCategory': 'CFR Category',
} as const;

export const CONVERSION_INTAKE_FIELDS: Array<{ field: string; label: string; transform: 'direct' | 'odata_bind' }> = [
  { field: 'pmo_name', label: 'Request Name', transform: 'direct' },
  { field: 'pmo_description', label: 'Description', transform: 'direct' },
  { field: 'pmo_businessjustification', label: 'Business Justification', transform: 'direct' },
  { field: 'pmo_submissiontext', label: 'Submission Text', transform: 'direct' },
  { field: 'pmo_lineofbusiness', label: 'Line of Business', transform: 'direct' },
  { field: 'pmo_requestedstartdate', label: 'Requested Start Date', transform: 'direct' },
  { field: 'pmo_targetcompletiondate', label: 'Target Completion Date', transform: 'direct' },
  { field: 'pmo_estimatedbudget', label: 'Estimated Budget', transform: 'direct' },
  { field: 'pmo_priority', label: 'Priority', transform: 'direct' },
  { field: '_pmo_targetteam_value', label: 'Target Team', transform: 'odata_bind' },
  { field: '_pmo_affectedsystem_value', label: 'Affected System', transform: 'odata_bind' },
];

export const CONVERSION_PROJECT_FIELDS: Array<{ field: string; label: string; transform: 'direct' | 'odata_bind' }> = [
  { field: 'msdyn_subject', label: 'Project Name', transform: 'direct' },
  { field: 'msdyn_description', label: 'Description', transform: 'direct' },
  { field: 'msdyn_scheduledstart', label: 'Start Date', transform: 'direct' },
  { field: 'pmo_cfrcategory', label: 'CFR Category', transform: 'direct' },
  { field: 'pmo_complexity', label: 'Complexity', transform: 'direct' },
  { field: 'pmo_strategicpriority', label: 'Strategic Priority', transform: 'direct' },
  { field: 'proj_budget', label: 'Budget', transform: 'direct' },
  { field: 'pmo_PrimaryTeam@odata.bind', label: 'Primary Team', transform: 'odata_bind' },
  { field: 'msdyn_projectmanager@odata.bind', label: 'Project Manager', transform: 'odata_bind' },
  { field: 'proj_ExecutiveSponsor@odata.bind', label: 'Executive Sponsor', transform: 'odata_bind' },
];

export const ARTIFACT_TYPE_LABELS: Record<number, string> = {
  893460110: 'Business Case',
  893460111: 'Project Charter',
  893460112: 'RACI Matrix',
  893460113: 'Communication Plan',
  893460114: 'Risk Register',
  893460115: 'SOW',
  893460116: 'Budget',
  893460117: 'Closeout Report',
  893460118: 'Lessons Learned',
  893460119: 'Other',
} as const;

export const SP_LIBRARY_BASE_URL = 'https://aetnao365.sharepoint.com/sites/Nexus-PMO/AppDocuments';

export const SP_DOCUMENT_CATEGORIES = [
  'Business Case', 'Project Charter', 'RACI Matrix', 'Communication Plan',
  'Risk Register', 'SOW', 'Budget', 'Closeout Report', 'Lessons Learned',
  'Status Report', 'Meeting Notes', 'General', 'Other',
] as const;
