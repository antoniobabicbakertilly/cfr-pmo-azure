import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Upload, Loader2, ChevronRight, ChevronLeft, Shield, FileText, Layers, FolderKanban, ArrowUpRight, Bug, Lightbulb, MessageSquareText } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { PageHeader } from '../../components/layout/PageHeader';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { useIntakeWorkflows, useGateSetItems, useIntakeStageCounts } from '../../hooks/useGateSetTemplates';
import { listSystems } from '../../api/systems.api';
import { resolveCurrentUserId } from '../../lib/dataverseClient';
import { getProjectRequest } from '../../api/projectRequests.api';
import { readExtras } from '../../lib/intakeExtras';
import { useQuery } from '@tanstack/react-query';
import { useCreateProjectRequest } from '../../hooks/useProjectRequests';
import { useChangeAudit } from '../../hooks/useChangeAudit';
import { createAnnotation } from '../../api/intakeAttachments.api';
import { updateProjectRequest } from '../../api/projectRequests.api';
import { useIntakeRoutingConfig, useFeatureToggles } from '../../providers/ConfigurationProvider';
import { scoreAgainstDomains } from '../../lib/intakeRoutingConfig';
import {
  INTAKE_CONFIGURABLE_FIELDS, ARTIFACT_TYPE_LABELS, REQUEST_STATUS,
  TARGET_ENTITY_TYPE, CONVERSION_TARGET, LINE_OF_BUSINESS, REQUEST_TYPE, REQUEST_PRIORITY,
  COMPLEXITY, STRATEGIC_PRIORITY, CFR_CATEGORY,
} from '../../lib/constants';
import { SearchableSelect, type SelectOption } from '../../components/common/SearchableSelect';
import { usePmoTeamsForIntake, useUserSearch } from '../../hooks/useIntakeLookups';
import {
  EXTRAS_FIELD_KEYS, isExtrasKey, extrasKeyToProp, writeExtras,
  type IntakeExtras,
} from '../../lib/intakeExtras';
import type { GateSetItem } from '../../models/gateSetTemplate.model';
import type { StageArtifact } from '../../lib/intakeValidation';
import { toast } from '../../hooks/useToast';
import { cn } from '../../lib/utils';

/**
 * Rewrite a workflow's pmo_name so any trailing '(N-Stage)' / '(N Stage)'
 * suffix reflects the actual number of configured stages. If pmo_name has no
 * such suffix, append '(N-Stage)' so the selector always shows a stage count.
 * Falls back to the original name when the count is unknown (still loading).
 */
function formatWorkflowName(name: string | undefined, count: number | undefined): string {
  if (!name) return '';
  if (count === undefined) return name;
  const stripped = name.replace(/\s*\(\d+[-\s]?stage\)\s*$/i, '').trim();
  return `${stripped} (${count}-Stage)`;
}

function parseJsonArray<T>(json: string | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

const CHOICE_FIELDS: Record<string, Record<number, string>> = {
  pmo_lineofbusiness: { [LINE_OF_BUSINESS.Enteral]: 'Enteral', [LINE_OF_BUSINESS.InfusionEpic]: 'Infusion Epic', [LINE_OF_BUSINESS.InfusionMediAR]: 'Infusion MediAR', [LINE_OF_BUSINESS.All]: 'All' },
  pmo_requesttype: { [REQUEST_TYPE.NewProject]: 'New Project', [REQUEST_TYPE.ChangeRequest]: 'Change Request', [REQUEST_TYPE.Enhancement]: 'Enhancement', [REQUEST_TYPE.Support]: 'Support', [REQUEST_TYPE.NewProgram]: 'New Program' },
  pmo_priority: { [REQUEST_PRIORITY.Critical]: 'Critical', [REQUEST_PRIORITY.High]: 'High', [REQUEST_PRIORITY.Medium]: 'Medium', [REQUEST_PRIORITY.Low]: 'Low' },
  // Holding-pen choice fields (mirror msdyn_project option-set values)
  [EXTRAS_FIELD_KEYS.complexity]: { [COMPLEXITY.Low]: 'Low', [COMPLEXITY.Medium]: 'Medium', [COMPLEXITY.High]: 'High', [COMPLEXITY.Critical]: 'Critical' },
  [EXTRAS_FIELD_KEYS.strategicPriority]: { [STRATEGIC_PRIORITY.MustHave]: 'Must Have', [STRATEGIC_PRIORITY.ShouldHave]: 'Should Have', [STRATEGIC_PRIORITY.NiceToHave]: 'Nice To Have' },
  [EXTRAS_FIELD_KEYS.cfrCategory]: { [CFR_CATEGORY.ItInfrastructure]: 'IT Infrastructure', [CFR_CATEGORY.FinanceSystems]: 'Finance Systems', [CFR_CATEGORY.Compliance]: 'Compliance', [CFR_CATEGORY.DataAndAnalytics]: 'Data & Analytics', [CFR_CATEGORY.Operations]: 'Operations', [CFR_CATEGORY.Other]: 'Other' },
};

const DATE_FIELDS = new Set(['pmo_requestedstartdate', 'pmo_targetcompletiondate']);
const NUMBER_FIELDS = new Set(['pmo_estimatedbudget']);
const TEXTAREA_FIELDS = new Set(['pmo_description', 'pmo_businessjustification', 'pmo_submissiontext']);

// Lookup field keys rendered as SearchableSelect.
//   _pmo_targetteam_value is a real Dataverse lookup column on pmo_projectrequest.
//   extras.projectManagerId / extras.executiveSponsorId live in the holding pen.
const TEAM_LOOKUP_FIELDS = new Set(['_pmo_targetteam_value']);
const SYSTEM_LOOKUP_FIELDS = new Set(['_pmo_affectedsystem_value']);
const USER_LOOKUP_FIELDS = new Set<string>([EXTRAS_FIELD_KEYS.projectManagerId, EXTRAS_FIELD_KEYS.executiveSponsorId]);

// Synthetic "Project Setup" stage appended to every workflow as the final
// step. Collects the holding-pen extras (PM, Sponsor, Complexity, Strategic
// Priority, CFR Category) up front so the approval panel doesn't have to
// chase the requester for them later. Marked with a sentinel id so we can
// detect it during persist (it has no real Dataverse row backing it).
const PROJECT_SETUP_STAGE_ID = '__project_setup__';
const PROJECT_SETUP_FIELDS = [
  EXTRAS_FIELD_KEYS.projectManagerId,
  EXTRAS_FIELD_KEYS.executiveSponsorId,
  EXTRAS_FIELD_KEYS.complexity,
  EXTRAS_FIELD_KEYS.strategicPriority,
  EXTRAS_FIELD_KEYS.cfrCategory,
];
function buildProjectSetupStage(maxExistingOrder: number): GateSetItem {
  return {
    pmo_gatesetitemid: PROJECT_SETUP_STAGE_ID,
    pmo_name: 'Project Setup',
    pmo_stagelabel: 'Project Setup',
    pmo_gatetype: 0,
    pmo_gateorder: maxExistingOrder + 1,
    pmo_requiredfieldsjson: JSON.stringify(PROJECT_SETUP_FIELDS),
    pmo_requiredartifacttypesjson: JSON.stringify([]),
    pmo_requiresapproval: false,
    statecode: 0,
  };
}

interface StageFormProps {
  stage: GateSetItem;
  values: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  artifacts: StageArtifact[];
  onArtifactUpload: (artifactType: number, file: File) => Promise<void>;
  uploading: boolean;
  isProgram: boolean;
  pmoTeams: SelectOption[];
  systems: SelectOption[];
  searchUsers: (q: string) => Promise<SelectOption[]>;
  resolveUserLabel: (id: string) => Promise<string>;
}

function StageForm({ stage, values, onChange, artifacts, onArtifactUpload, uploading, isProgram, pmoTeams, systems, searchUsers, resolveUserLabel }: StageFormProps) {
  const requiredFields = parseJsonArray<string>(stage.pmo_requiredfieldsjson, []);
  const requiredArtifacts = parseJsonArray<number>(stage.pmo_requiredartifacttypesjson, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingType, setUploadingType] = useState<number | null>(null);

  if (requiredFields.length === 0 && requiredArtifacts.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">No additional information needed for this stage.</p>
        <p className="text-xs text-muted-foreground mt-1">Review your submission and continue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requiredFields.map((field) => {
        const label = INTAKE_CONFIGURABLE_FIELDS[field] ?? field;
        const isRequired = true;

        // Team lookup (Primary Team) — static option list.
        if (TEAM_LOOKUP_FIELDS.has(field)) {
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <SearchableSelect
                value={(values[field] as string) ?? ''}
                onChange={(v) => onChange(field, v || undefined)}
                options={pmoTeams}
                placeholder={`Select ${label.toLowerCase()}`}
              />
            </div>
          );
        }

        // System lookup (Affected System) — static option list from cr87a_systems.
        if (SYSTEM_LOOKUP_FIELDS.has(field)) {
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <SearchableSelect
                value={(values[field] as string) ?? ''}
                onChange={(v) => onChange(field, v || undefined)}
                options={systems}
                placeholder={`Select ${label.toLowerCase()}`}
              />
            </div>
          );
        }

        // User lookup (Project Manager, Executive Sponsor) — server-side search.
        if (USER_LOOKUP_FIELDS.has(field)) {
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <SearchableSelect
                value={(values[field] as string) ?? ''}
                onChange={(v) => onChange(field, v || undefined)}
                onSearch={searchUsers}
                resolveLabel={resolveUserLabel}
                placeholder={`Search for ${label.toLowerCase()}`}
              />
            </div>
          );
        }

        if (CHOICE_FIELDS[field]) {
          const isLockedProgram = isProgram && field === 'pmo_requesttype';
          if (isLockedProgram && values[field] !== REQUEST_TYPE.NewProgram) {
            setTimeout(() => onChange(field, REQUEST_TYPE.NewProgram), 0);
          }
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <Select value={values[field] != null ? String(values[field]) : ''} onValueChange={(v) => onChange(field, Number(v))} disabled={isLockedProgram}>
                <SelectTrigger className={`w-full ${isLockedProgram ? 'bg-muted/60 text-muted-foreground cursor-not-allowed opacity-70' : ''}`}><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHOICE_FIELDS[field])
                    // Hide 'New Program' from Project workflows — a project-flavored
                    // request should never be able to choose a program request type.
                    .filter(([val]) => !(field === 'pmo_requesttype' && !isProgram && Number(val) === REQUEST_TYPE.NewProgram))
                    .map(([val, lbl]) => (
                      <SelectItem key={val} value={val}>{lbl}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (DATE_FIELDS.has(field)) {
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <Input type="date" value={(values[field] as string) ?? ''} onChange={(e) => onChange(field, e.target.value)} />
            </div>
          );
        }

        if (NUMBER_FIELDS.has(field)) {
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <Input type="number" value={values[field] != null ? String(values[field]) : ''} onChange={(e) => onChange(field, e.target.value ? Number(e.target.value) : undefined)} />
            </div>
          );
        }

        if (TEXTAREA_FIELDS.has(field)) {
          return (
            <div key={field} className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <Textarea rows={3} value={(values[field] as string) ?? ''} onChange={(e) => onChange(field, e.target.value)} placeholder={`Enter ${label.toLowerCase()}`} />
            </div>
          );
        }

        return (
          <div key={field} className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {label}{isRequired && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <Input value={(values[field] as string) ?? ''} onChange={(e) => onChange(field, e.target.value)} placeholder={`Enter ${label.toLowerCase()}`} />
          </div>
        );
      })}

      {requiredArtifacts.length > 0 && (
        <div className="pt-2 border-t space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Artifacts <span className="font-normal normal-case tracking-normal">(optional)</span></p>
          {requiredArtifacts.map((artType) => {
            const uploaded = artifacts.find((a) => a.artifactType === artType);
            return (
              <div key={artType} className="flex items-center gap-3 p-2 rounded-md border bg-muted/30">
                {uploaded ? (
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm flex-1">{ARTIFACT_TYPE_LABELS[artType] ?? `Type ${artType}`}</span>
                {uploaded ? (
                  <span className="text-xs text-muted-foreground">{uploaded.fileName}</span>
                ) : (
                  <>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingType(artType);
                      await onArtifactUpload(artType, file);
                      setUploadingType(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }} />
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploadingType === artType ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      Upload
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GovernedIntakeWizard() {
  const navigate = useNavigate();
  const { data: workflows = [], isPending: loadingWorkflows } = useIntakeWorkflows();
  const { data: stageCounts = {} } = useIntakeStageCounts();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState(0);
  const requestIdRef = useRef<string | null>(null);
  // Holding-pen JSON for pmo_extractedfieldsjson - accumulated across stages
  // and merged via writeExtras() before each save. Starts as the AI extractor's
  // payload (or {}) and is updated whenever the user edits an extras.* field.
  const extractedJsonRef = useRef<string | undefined>(undefined);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [artifacts, setArtifacts] = useState<StageArtifact[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createRequest = useCreateProjectRequest();
  const routingConfig = useIntakeRoutingConfig();
  const auditChange = useChangeAudit();

  // Resume-draft support.
  // Enter the wizard at /intake/new?resume=<requestId> to pick up where the
  // submitter left off. We hydrate the workflow id, stage number, form values,
  // artifacts, and the extracted-fields JSON, then skip the workflow-picker.
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get('resume');
  const [resumeLoading, setResumeLoading] = useState<boolean>(Boolean(resumeId));
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    (async () => {
      try {
        const req = await getProjectRequest(resumeId);
        if (cancelled) return;
        // Wire workflow id so the workflow-selection screen is skipped.
        const wfId = req['_pmo_intakeworkflowid_value'];
        if (wfId) setSelectedWorkflowId(wfId);
        // Mark the existing record so subsequent advances PATCH instead of POST.
        requestIdRef.current = resumeId;
        // Preserve the AI-extracted JSON so writeExtras() merges cleanly.
        if (req.pmo_extractedfieldsjson) extractedJsonRef.current = req.pmo_extractedfieldsjson;
        // Hydrate the form values from columns + saved stage data + extras.
        const hydrated: Record<string, unknown> = {
          pmo_name: req.pmo_name,
          pmo_submissiontext: req.pmo_submissiontext,
          pmo_description: req.pmo_description,
          pmo_businessjustification: req.pmo_businessjustification,
          pmo_requesttype: req.pmo_requesttype,
          pmo_priority: req.pmo_priority,
          pmo_lineofbusiness: req.pmo_lineofbusiness,
          pmo_requestedstartdate: req.pmo_requestedstartdate,
          pmo_targetcompletiondate: req.pmo_targetcompletiondate,
          pmo_estimatedbudget: req.pmo_estimatedbudget,
        };
        if (req['_pmo_targetteam_value']) hydrated._pmo_targetteam_value = req['_pmo_targetteam_value'];
        if (req['_pmo_affectedsystem_value']) hydrated._pmo_affectedsystem_value = req['_pmo_affectedsystem_value'];
        // Replay saved stage field values back into the form.
        if (req.pmo_stagedatajson) {
          try {
            const sd = JSON.parse(req.pmo_stagedatajson) as Record<string, { fields?: Record<string, unknown> }>;
            for (const v of Object.values(sd)) {
              if (v && typeof v === 'object' && v.fields) Object.assign(hydrated, v.fields);
            }
            hydrated._stagedatajson = req.pmo_stagedatajson;
          } catch { /* corrupt JSON - ignore */ }
        }
        // Holding-pen extras flow back as extras.* keys so the existing pickers populate.
        const extras = readExtras(req);
        if (extras.projectManagerId)   hydrated['extras.projectManagerId']   = extras.projectManagerId;
        if (extras.executiveSponsorId) hydrated['extras.executiveSponsorId'] = extras.executiveSponsorId;
        if (extras.complexity != null) hydrated['extras.complexity']         = extras.complexity;
        if (extras.strategicPriority != null) hydrated['extras.strategicPriority'] = extras.strategicPriority;
        if (extras.cfrCategory != null) hydrated['extras.cfrCategory']       = extras.cfrCategory;
        for (const k of Object.keys(hydrated)) if (hydrated[k] === undefined) delete hydrated[k];
        setValues(hydrated);
        if (req.pmo_stageartifactsjson) {
          try {
            const arts = JSON.parse(req.pmo_stageartifactsjson) as StageArtifact[];
            if (Array.isArray(arts)) setArtifacts(arts);
          } catch { /* corrupt JSON - ignore */ }
        }
        // Seed currentStage from the persisted value. The 'first-incomplete'
        // effect below may override this once stages + values are hydrated.
        if (typeof req.pmo_currentstagenumber === 'number') setCurrentStage(req.pmo_currentstagenumber);
      } catch (e) {
        if (!cancelled) setResumeError(e instanceof Error ? e.message : 'Failed to load draft.');
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // Lookup data for Primary Team / Project Manager / Executive Sponsor pickers.
  const { data: pmoTeams = [] } = usePmoTeamsForIntake();
  const { searchUsers, resolveUserLabel } = useUserSearch();
  // Affected-system option list. Static catalog under cr87a_systems
  // -- safe to fetch once and cache forever (admin-managed reference data).
  const { data: systems = [] } = useQuery<SelectOption[]>({
    queryKey: ['intakeSystems'],
    queryFn: async () => {
      const all = await listSystems();
      return all.map((s) => ({ value: s.cr87a_systemid, label: s.cr87a_name }));
    },
    staleTime: Infinity,
  });

  const activeWorkflow = workflows.length === 1 ? workflows[0] : workflows.find((w) => w.pmo_gatesettemplateid === selectedWorkflowId);
  const workflowId = activeWorkflow?.pmo_gatesettemplateid;
  const { data: stages = [] } = useGateSetItems(workflowId);
  // Inject the synthetic Project Setup step BEFORE the first stage that
  // requires approval (so PM/Sponsor/Complexity/Strategic Priority/CFR
  // Category are captured before the approver sees the request). If no
  // stage requires approval, append it to the end.
  const sortedStages = (() => {
    const real = [...stages].sort((a, b) => a.pmo_gateorder - b.pmo_gateorder);
    if (real.length === 0) return real;
    const approvalIdx = real.findIndex((s) => s.pmo_requiresapproval);
    const insertAt = approvalIdx === -1 ? real.length : approvalIdx;
    const prevOrder = insertAt > 0 ? real[insertAt - 1].pmo_gateorder : 0;
    const setup = buildProjectSetupStage(prevOrder);
    return [...real.slice(0, insertAt), setup, ...real.slice(insertAt)];
  })();
  const stage = sortedStages[currentStage];

  // On resume: once stages + hydrated values are loaded, jump to the first
  // wizard stage (including the synthetic Project Setup) that still has
  // missing required fields. Users may navigate back and forth, so the
  // persisted pmo_currentstagenumber doesn't always reflect where they
  // need to fix things. Runs only once per resume so we don't hijack the
  // user's manual navigation later in the session.
  const resumeJumpDoneRef = useRef(false);
  useEffect(() => {
    if (!resumeId) return;
    if (resumeJumpDoneRef.current) return;
    if (resumeLoading) return;
    if (sortedStages.length === 0) return;
    if (Object.keys(values).length === 0) return;
    const firstIncomplete = sortedStages.findIndex((st) => {
      const required = parseJsonArray<string>(st.pmo_requiredfieldsjson, []);
      return required.some((f) => {
        const v = values[f];
        return v === undefined || v === null || v === '';
      });
    });
    if (firstIncomplete >= 0) setCurrentStage(firstIncomplete);
    resumeJumpDoneRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, resumeLoading, sortedStages, values]);

  const needsSelection = workflows.length > 1 && !selectedWorkflowId;

  function handleFieldChange(field: string, value: unknown) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Split the form's `values` map into:
   *   - columnPayload  -> direct Dataverse columns + lookup binds
   *   - extrasPatch    -> partial IntakeExtras for writeExtras()
   *
   * Special-cases:
   *   - `_pmo_targetteam_value` becomes `pmo_TargetTeam@odata.bind`
   *   - `extras.*` keys are routed to the holding-pen patch instead of columns
   *   - keys starting with `_` (other than `_pmo_targetteam_value`) are skipped
   *     because they are synthetic UI-only state
   */
  function splitValuesForPersist(): { columnPayload: Record<string, unknown>; extrasPatch: Partial<IntakeExtras> } {
    const columnPayload: Record<string, unknown> = {};
    const extrasPatch: Partial<IntakeExtras> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null || v === '') continue;
      if (isExtrasKey(k)) {
        const prop = extrasKeyToProp(k);
        (extrasPatch as Record<string, unknown>)[prop] = v;
        continue;
      }
      if (k === '_pmo_targetteam_value') {
        columnPayload['pmo_TargetTeam@odata.bind'] = `/teams(${v})`;
        continue;
      }
      if (k === '_pmo_affectedsystem_value') {
        columnPayload['pmo_AffectedSystem@odata.bind'] = `/cr87a_systems(${v})`;
        continue;
      }
      if (k.startsWith('_')) continue;
      columnPayload[k] = v;
    }
    return { columnPayload, extrasPatch };
  }

  /** Merge the in-memory extras patch into extractedJsonRef and return the
   *  serialized JSON to send on the next save. */
  function buildExtractedFieldsJson(extrasPatch: Partial<IntakeExtras>): string | undefined {
    const hasPatch = Object.keys(extrasPatch).length > 0;
    if (!hasPatch && !extractedJsonRef.current) return undefined;
    const next = writeExtras({ pmo_extractedfieldsjson: extractedJsonRef.current }, extrasPatch);
    extractedJsonRef.current = next;
    return next;
  }

  /**
   * Creates a draft project request in Dataverse and returns the new record ID.
   * Called automatically when an artifact upload is attempted before the record
   * exists, or as part of handleAdvance on the first stage.
   */
  async function ensureDraftRecord(): Promise<string> {
    // Return existing ID if the record was already created
    if (requestIdRef.current) return requestIdRef.current;

    if (!activeWorkflow || !workflowId) {
      throw new Error('No active workflow selected. Please select a workflow before uploading.');
    }

    const convTarget = activeWorkflow.pmo_targetentitytype === TARGET_ENTITY_TYPE.Program
      ? CONVERSION_TARGET.Program : CONVERSION_TARGET.Project;
    const { columnPayload, extrasPatch } = splitValuesForPersist();
    const extractedJson = buildExtractedFieldsJson(extrasPatch);
    const payload: Record<string, unknown> = {
      pmo_name: (values.pmo_name as string) || 'Untitled Request',
      pmo_status: REQUEST_STATUS.Draft,
      pmo_currentstagenumber: 0,
      pmo_conversiontarget: convTarget,
      pmo_stagedatajson: JSON.stringify({}),
      pmo_stageartifactsjson: JSON.stringify([]),
      'pmo_IntakeWorkflowId@odata.bind': `/pmo_gatesettemplates(${workflowId})`,
      ...columnPayload,
    };
    if (extractedJson !== undefined) payload.pmo_extractedfieldsjson = extractedJson;
    const submissionText = [
      values.pmo_name, values.pmo_submissiontext,
      values.pmo_description, values.pmo_businessjustification,
    ].filter(Boolean).join(' ');
    const routingResult = scoreAgainstDomains(submissionText, routingConfig);
    if (routingResult) {
      payload.pmo_routingconfidence = routingResult.confidence;
      payload.pmo_routingrecommendation = routingResult.domainName;
    }
    // Stamp the current user as the requester so the approved record
    // shows "Requested By" instead of just falling back to createdby.
    const currentUserId = await resolveCurrentUserId();
    if (currentUserId) payload['pmo_RequestedBy@odata.bind'] = `/systemusers(${currentUserId})`;
    const created = await createRequest.mutateAsync(payload as Parameters<typeof createRequest.mutateAsync>[0]);
    const newId = created.pmo_projectrequestid;
    requestIdRef.current = newId;
    auditChange({
      entityType: 'intake',
      entityId: newId,
      entityName: (payload.pmo_name as string) || 'Untitled Request',
      action: 'create',
    });
    return newId;
  }

  async function handleArtifactUpload(artifactType: number, file: File) {
    setUploading(true);
    try {
      // Auto-create the draft record if it doesn't exist yet
      let id = requestIdRef.current;
      if (!id) {
        toast.info('Saving draft request before uploading…');
        id = await ensureDraftRecord();
      }
      const ann = await createAnnotation(id, file);
      setArtifacts((prev) => [...prev, {
        stageOrder: currentStage,
        artifactType,
        annotationId: ann.annotationid,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      }]);
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function isStageComplete(): boolean {
    if (!stage) return false;
    const required = parseJsonArray<string>(stage.pmo_requiredfieldsjson, []);
    for (const field of required) {
      const val = values[field];
      if (val === undefined || val === null || val === '') return false;
    }
    return true;
  }

  async function handleAdvance() {
    if (!stage || !activeWorkflow) return;
    setSubmitting(true);

    try {
      const stageDataEntry = {
        completedAt: new Date().toISOString(),
        completedBy: 'current-user',
        fields: Object.fromEntries(
          parseJsonArray<string>(stage.pmo_requiredfieldsjson, []).map((f) => [f, values[f]]),
        ),
      };

      if (!requestIdRef.current) {
        // Record hasn't been created yet — create it now with full stage data
        const id = await ensureDraftRecord();
        // Update with stage data that wasn't included in the initial draft
        await updateProjectRequest(id, {
          pmo_stagedatajson: JSON.stringify({ stage_0: stageDataEntry }),
          pmo_stageartifactsjson: JSON.stringify(artifacts),
        });
      } else {
        const existingStageData = values._stagedatajson
          ? JSON.parse(values._stagedatajson as string) : {};
        existingStageData[`stage_${currentStage}`] = stageDataEntry;

        const { columnPayload, extrasPatch } = splitValuesForPersist();
        const extractedJson = buildExtractedFieldsJson(extrasPatch);
        const updatePayload: Record<string, unknown> = {
          pmo_stagedatajson: JSON.stringify(existingStageData),
          pmo_stageartifactsjson: JSON.stringify(artifacts),
          ...columnPayload,
        };
        if (extractedJson !== undefined) updatePayload.pmo_extractedfieldsjson = extractedJson;
        // pmo_currentstagenumber is a 0-based ARRAY INDEX into the REAL
        // stage list as IntakeDetailPage sees it (which has no synthetic
        // Project Setup stage). The wizard's own sortedStages array inserts
        // the synthetic stage before the first approval gate, so currentStage
        // (the wizard index) is one higher than the real index for every
        // stage AFTER the synthetic. Translate before writing or the detail
        // page lands on sortedStages[N+1] -> undefined -> no approval panel.
        // Skip the synthetic itself (it has no real-stage equivalent).
        if (stage.pmo_gatesetitemid !== PROJECT_SETUP_STAGE_ID) {
          const syntheticIdx = sortedStages.findIndex((s) => s.pmo_gatesetitemid === PROJECT_SETUP_STAGE_ID);
          const realIdx = syntheticIdx >= 0 && currentStage > syntheticIdx
            ? currentStage - 1
            : currentStage;
          updatePayload.pmo_currentstagenumber = realIdx;
        }
        await updateProjectRequest(requestIdRef.current, updatePayload as Record<string, unknown>);
      }

      if (stage.pmo_requiresapproval) {
        await updateProjectRequest(requestIdRef.current!, { pmo_status: REQUEST_STATUS.Submitted });
        auditChange({
          entityType: 'intake',
          entityId: requestIdRef.current!,
          entityName: (values.pmo_name as string) || 'Untitled Request',
          action: 'submit',
          changes: [{
            kind: 'field',
            field: 'pmo_status',
            label: 'Status',
            old: 'Draft',
            new: 'Submitted',
          }],
        });
        toast.success('Submitted for review — you will be notified when approved.');
        navigate('/intake');
        return;
      }

      if (currentStage < sortedStages.length - 1) {
        setCurrentStage((s) => s + 1);
      } else {
        await updateProjectRequest(requestIdRef.current!, { pmo_status: REQUEST_STATUS.Approved });
        auditChange({
          entityType: 'intake',
          entityId: requestIdRef.current!,
          entityName: (values.pmo_name as string) || 'Untitled Request',
          action: 'approve',
          changes: [{
            kind: 'field',
            field: 'pmo_status',
            label: 'Status',
            old: 'Draft',
            new: 'Approved',
          }],
        });
        toast.success('All stages complete — request approved.');
        navigate(`/intake/${requestIdRef.current}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to advance');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingWorkflows || resumeLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        {resumeLoading ? 'Loading saved draft...' : 'Loading intake workflows...'}
      </div>
    );
  }

  if (resumeError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Continue Draft" subtitle="Could not load this draft" />
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {resumeError}
        </div>
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Submit Request" subtitle="Start a governed intake request" />
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No intake workflows are configured. Contact your PMO administrator.</p>
        </div>
      </div>
    );
  }

  // Workflow-name → feature-toggle key. Workflows whose name is in this map are
  // hidden when their toggle is off; workflows not in the map are always shown.
  const WORKFLOW_TOGGLE_BY_NAME: Record<string, string> = {
    'Standard Program Intake (5-Stage)': 'intakeCard.programIntake5Stage',
    'Standard Program Request':           'intakeCard.programRequest',
    'Standard Project Intake (5-Stage)': 'intakeCard.projectIntake5Stage',
    'Standard Project Request':           'intakeCard.projectRequest',
  };
  const allFt = useFeatureToggles();
  const showFeedbackBug         = allFt['intakeCard.feedbackBug']         !== false;
  const showFeedbackEnhancement = allFt['intakeCard.feedbackEnhancement'] !== false;
  const isWorkflowVisible = (wfName: string | undefined): boolean => {
    if (!wfName) return true;
    const key = WORKFLOW_TOGGLE_BY_NAME[wfName];
    return key ? allFt[key] !== false : true;
  };

  if (needsSelection) {
    const programWorkflows = workflows
      .filter((wf) => wf.pmo_targetentitytype === TARGET_ENTITY_TYPE.Program)
      .filter((wf) => isWorkflowVisible(wf.pmo_name));
    const projectWorkflows = workflows
      .filter((wf) => wf.pmo_targetentitytype !== TARGET_ENTITY_TYPE.Program)
      .filter((wf) => isWorkflowVisible(wf.pmo_name));

    return (
      <div className="space-y-6 max-w-4xl">
        <PageHeader title="Submit Request" subtitle="Select the type of request to submit" />

        {/* Hierarchy explainer */}
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <ArrowUpRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-semibold text-foreground">Programs</span> are strategic initiatives that contain one or more related projects.
              <span className="font-semibold text-foreground"> Projects</span> are individual workstreams that deliver specific outcomes.
            </p>
            <p>Projects roll up to programs — start a <span className="font-medium">Program</span> when the work spans multiple coordinated efforts, or a <span className="font-medium">Project</span> for a single deliverable.</p>
          </div>
        </div>

        {/* Three-column layout: Programs | Projects | Feedback */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Programs column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Programs</h3>
              <span className="text-xs text-muted-foreground">— multi-project initiatives</span>
            </div>
            {programWorkflows.length > 0 ? programWorkflows.map((wf) => (
              <button
                key={wf.pmo_gatesettemplateid}
                type="button"
                onClick={() => setSelectedWorkflowId(wf.pmo_gatesettemplateid)}
                className="w-full rounded-lg border bg-card p-4 text-left hover:border-primary/50 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{formatWorkflowName(wf.pmo_name, stageCounts[wf.pmo_gatesettemplateid])}</p>
                {wf.pmo_description && <p className="text-xs text-muted-foreground mt-1">{wf.pmo_description}</p>}
              </button>
            )) : (
              <p className="text-xs text-muted-foreground py-4 text-center">No program workflows configured.</p>
            )}
          </div>

          {/* Projects column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <FolderKanban className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Projects</h3>
              <span className="text-xs text-muted-foreground">— individual workstreams</span>
            </div>
            {projectWorkflows.length > 0 ? projectWorkflows.map((wf) => (
              <button
                key={wf.pmo_gatesettemplateid}
                type="button"
                onClick={() => setSelectedWorkflowId(wf.pmo_gatesettemplateid)}
                className="w-full rounded-lg border bg-card p-4 text-left hover:border-primary/50 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{formatWorkflowName(wf.pmo_name, stageCounts[wf.pmo_gatesettemplateid])}</p>
                {wf.pmo_description && <p className="text-xs text-muted-foreground mt-1">{wf.pmo_description}</p>}
              </button>
            )) : (
              <p className="text-xs text-muted-foreground py-4 text-center">No project workflows configured.</p>
            )}
          </div>

          {/* Feedback column — hidden entirely if both feedback toggles are off */}
          {(showFeedbackBug || showFeedbackEnhancement) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <MessageSquareText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Feedback</h3>
                <span className="text-xs text-muted-foreground">— bugs & suggestions</span>
              </div>
              {showFeedbackBug && (
                <button
                  type="button"
                  onClick={() => navigate('/intake/feedback/bug')}
                  className="w-full rounded-lg border bg-card p-4 text-left hover:border-rose-400/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-rose-500 shrink-0" />
                    <p className="text-sm font-medium text-foreground">Report a Bug</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Something isn't working as expected</p>
                </button>
              )}
              {showFeedbackEnhancement && (
                <button
                  type="button"
                  onClick={() => navigate('/intake/feedback/enhancement')}
                  className="w-full rounded-lg border bg-card p-4 text-left hover:border-amber-400/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-sm font-medium text-foreground">Suggest an Enhancement</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Share an idea to improve the application</p>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!stage) {
    return <div className="py-8 text-center text-muted-foreground text-sm">No stages configured for this workflow.</div>;
  }

  const stageLabel = stage.pmo_stagelabel || stage.pmo_name || `Stage ${currentStage + 1}`;
  const canAdvance = isStageComplete() && !submitting && !uploading;

  return (
    <div className="space-y-6">
      <PageHeader title="Submit Request" subtitle={activeWorkflow?.pmo_name ?? 'Governed Intake'} />

      {/* Stage progress — completed stages are clickable */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {sortedStages.map((s, i) => {
          const isCompleted = i < currentStage;
          const isCurrent = i === currentStage;
          const canNavigate = isCompleted;
          return (
            <div key={s.pmo_gatesetitemid} className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!canNavigate}
                onClick={() => { if (canNavigate) setCurrentStage(i); }}
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors',
                  isCompleted ? 'bg-emerald-500 border-emerald-500 text-white cursor-pointer hover:bg-emerald-600' :
                  isCurrent ? 'bg-primary border-primary text-primary-foreground' :
                  'bg-muted border-border text-muted-foreground cursor-default',
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
              </button>
              <span className={cn('text-xs', isCurrent ? 'font-medium text-foreground' : isCompleted ? 'text-foreground cursor-pointer hover:underline' : 'text-muted-foreground')}
                onClick={() => { if (canNavigate) setCurrentStage(i); }}
                role={canNavigate ? 'button' : undefined}
              >
                {s.pmo_stagelabel || s.pmo_name || `Stage ${i + 1}`}
              </span>
              {i < sortedStages.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Completed stages summary */}
      {currentStage > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Completed</p>
          {sortedStages.slice(0, currentStage).map((s) => {
            const stgFields = parseJsonArray<string>(s.pmo_requiredfieldsjson, []);
            return (
              <div key={s.pmo_gatesetitemid} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="font-medium text-foreground">{s.pmo_stagelabel || s.pmo_name}</span>
                {stgFields.length > 0 && (
                  <span className="text-muted-foreground">
                    — {stgFields.map((f) => {
                      const v = values[f];
                      if (v === undefined || v === null || v === '') return null;
                      const label = INTAKE_CONFIGURABLE_FIELDS[f] ?? f;
                      if (CHOICE_FIELDS[f] && typeof v === 'number') return `${label}: ${CHOICE_FIELDS[f][v] ?? v}`;
                      return `${label}: ${String(v).substring(0, 30)}${String(v).length > 30 ? '...' : ''}`;
                    }).filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Current stage form */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg font-semibold text-foreground">{stageLabel}</span>
          <span className="text-xs text-muted-foreground">Step {currentStage + 1} of {sortedStages.length}</span>
          {stage.pmo_requiresapproval && (
            <span className="flex items-center gap-1 text-xs text-amber-600"><Shield className="h-3 w-3" />Requires approval</span>
          )}
        </div>

        <StageForm
          stage={stage}
          values={values}
          onChange={handleFieldChange}
          artifacts={artifacts.filter((a) => a.stageOrder === currentStage)}
          onArtifactUpload={handleArtifactUpload}
          uploading={uploading}
          isProgram={activeWorkflow?.pmo_targetentitytype === TARGET_ENTITY_TYPE.Program}
          pmoTeams={pmoTeams}
          systems={systems}
          searchUsers={searchUsers}
          resolveUserLabel={resolveUserLabel}
        />

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-3">
            {currentStage > 0 && (
              <Button variant="outline" onClick={() => setCurrentStage((s) => s - 1)} disabled={submitting}>
                <ChevronLeft className="h-4 w-4 mr-1" />Back
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate('/intake')}>Cancel</Button>
          </div>
          <Button onClick={handleAdvance} disabled={!canAdvance}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {stage.pmo_requiresapproval ? 'Submit for Review' : currentStage < sortedStages.length - 1 ? 'Continue' : 'Complete'}
            {!submitting && currentStage < sortedStages.length - 1 && !stage.pmo_requiresapproval && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
