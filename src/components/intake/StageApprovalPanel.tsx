import { useState, useMemo, useEffect } from 'react';
import {
  Check, ArrowLeft, X, Download, Shield, Loader2, MessageSquare, AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { SearchableSelect } from '../common/SearchableSelect';
import {
  INTAKE_CONFIGURABLE_FIELDS, ARTIFACT_TYPE_LABELS, REQUEST_STATUS,
  CONVERSION_TARGET, COMPLEXITY, STRATEGIC_PRIORITY, CFR_CATEGORY, TEAM_ROLE,
} from '../../lib/constants';
import { updateProjectRequest } from '../../api/projectRequests.api';
import { createProjectTeam } from '../../api/projectTeams.api';
import { applyProjectTemplate } from '../../lib/schedulingClient';
import { useCreateProject } from '../../hooks/useProjects';
import { useCreateProgram } from '../../hooks/usePrograms';
import { useChangeAudit } from '../../hooks/useChangeAudit';
import { useProjectTemplates } from '../../hooks/useProjectTemplates';
import { useAppSettings } from '../../hooks/useAppSettings';
import { usePmoTeamsForIntake, useUserSearch } from '../../hooks/useIntakeLookups';
import {
  validateConversionReadiness, buildProjectPayload, buildProgramPayload,
  carryOverArtifacts,
} from '../../lib/intakeConversion';
import { resolveTemplate } from '../../lib/templateResolution';
import {
  readExtras, writeExtras, type IntakeExtras,
} from '../../lib/intakeExtras';
import type { ProjectRequest } from '../../models/projectRequest.model';
import type { GateSetItem } from '../../models/gateSetTemplate.model';
import type { ApprovalAction, StageArtifact } from '../../lib/intakeValidation';
import { toast } from '../../hooks/useToast';
import * as dv from '../../lib/dataverseClient';

function parseJsonArray<T>(json: string | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}

function parseJsonObject(json: string | undefined): Record<string, unknown> {
  if (!json) return {};
  try { const v = JSON.parse(json); return typeof v === 'object' && v !== null ? v : {}; } catch { return {}; }
}

const COMPLEXITY_OPTIONS = [
  { value: COMPLEXITY.Low,      label: 'Low' },
  { value: COMPLEXITY.Medium,   label: 'Medium' },
  { value: COMPLEXITY.High,     label: 'High' },
  { value: COMPLEXITY.Critical, label: 'Critical' },
];

const STRATEGIC_PRIORITY_OPTIONS = [
  { value: STRATEGIC_PRIORITY.MustHave,   label: 'Must Have' },
  { value: STRATEGIC_PRIORITY.ShouldHave, label: 'Should Have' },
  { value: STRATEGIC_PRIORITY.NiceToHave, label: 'Nice To Have' },
];

const CFR_CATEGORY_OPTIONS = [
  { value: CFR_CATEGORY.ItInfrastructure, label: 'IT Infrastructure' },
  { value: CFR_CATEGORY.FinanceSystems,   label: 'Finance Systems' },
  { value: CFR_CATEGORY.Compliance,       label: 'Compliance' },
  { value: CFR_CATEGORY.DataAndAnalytics, label: 'Data & Analytics' },
  { value: CFR_CATEGORY.Operations,       label: 'Operations' },
  { value: CFR_CATEGORY.Other,            label: 'Other' },
];

interface StageApprovalPanelProps {
  request: ProjectRequest;
  stage: GateSetItem;
  stageIndex: number;
  totalStages: number;
  approvalChain: ApprovalAction[];
  onActionComplete: () => void;
}

export function StageApprovalPanel({
  request, stage, stageIndex, totalStages, approvalChain, onActionComplete,
}: StageApprovalPanelProps) {
  const [approveRationale, setApproveRationale] = useState('');
  const [sendBackQuestion, setSendBackQuestion] = useState('');
  const [rejectRationale, setRejectRationale] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<'approve' | 'sendback' | 'reject' | null>(null);

  const isLastStage = stageIndex >= totalStages - 1;
  const isProgram = request.pmo_conversiontarget === CONVERSION_TARGET.Program;

  // Inline-editor local state — pre-seeded from the persisted request.
  // These are only consumed when isLastStage && missingFields.length > 0.
  const persistedExtras = useMemo(() => readExtras(request), [request]);
  const [primaryTeamId, setPrimaryTeamId]       = useState<string>(request['_pmo_targetteam_value'] ?? '');
  const [pmId, setPmId]                         = useState<string>(persistedExtras.projectManagerId ?? '');
  const [sponsorId, setSponsorId]               = useState<string>(persistedExtras.executiveSponsorId ?? '');
  const [complexity, setComplexity]             = useState<string>(persistedExtras.complexity != null ? String(persistedExtras.complexity) : '');
  const [strategicPriority, setStrategicPriority] = useState<string>(persistedExtras.strategicPriority != null ? String(persistedExtras.strategicPriority) : '');
  const [cfrCategory, setCfrCategory]           = useState<string>(persistedExtras.cfrCategory != null ? String(persistedExtras.cfrCategory) : '');

  // Re-seed local state if the underlying request changes (e.g. after Send Back / refetch).
  useEffect(() => {
    setPrimaryTeamId(request['_pmo_targetteam_value'] ?? '');
    setPmId(persistedExtras.projectManagerId ?? '');
    setSponsorId(persistedExtras.executiveSponsorId ?? '');
    setComplexity(persistedExtras.complexity != null ? String(persistedExtras.complexity) : '');
    setStrategicPriority(persistedExtras.strategicPriority != null ? String(persistedExtras.strategicPriority) : '');
    setCfrCategory(persistedExtras.cfrCategory != null ? String(persistedExtras.cfrCategory) : '');
  }, [request, persistedExtras]);

  const { data: pmoTeams = [] } = usePmoTeamsForIntake();
  const { searchUsers, resolveUserLabel } = useUserSearch();
  const { data: templates } = useProjectTemplates();
  const { data: settings } = useAppSettings();
  const createProject = useCreateProject();
  const createProgram = useCreateProgram();
  const auditChange = useChangeAudit();

  const requiredFields = parseJsonArray<string>(stage.pmo_requiredfieldsjson, []);
  const stageArtifacts = parseJsonArray<StageArtifact>(request.pmo_stageartifactsjson, [])
    .filter((a) => a.stageOrder === stageIndex);
  const stageData = parseJsonObject(request.pmo_stagedatajson);
  const stageEntry = stageData[`stage_${stageIndex}`] as Record<string, unknown> | undefined;
  const capturedFields = (stageEntry?.fields as Record<string, unknown>) ?? {};

  const stageSendBacks = approvalChain.filter(
    (a) => a.stageOrder === stageIndex && (a.action === 'sent_back' || a.action === 'resubmitted'),
  );

  const currentUserId = useMemo(() => {
    try { return dv.getCurrentUserId(); } catch { return ''; }
  }, []);

  // Build the patch the inline editors would write, then synthesize an
  // "effective" request that overlays it on the persisted record. Used by
  // validateConversionReadiness so the missing-fields banner reacts to local
  // edits in real time.
  const inlineExtrasPatch = useMemo<Partial<IntakeExtras>>(() => {
    const patch: Partial<IntakeExtras> = {};
    if (pmId)               patch.projectManagerId = pmId;
    if (sponsorId)          patch.executiveSponsorId = sponsorId;
    if (complexity)         patch.complexity = Number(complexity);
    if (strategicPriority)  patch.strategicPriority = Number(strategicPriority);
    if (cfrCategory)        patch.cfrCategory = Number(cfrCategory);
    return patch;
  }, [pmId, sponsorId, complexity, strategicPriority, cfrCategory]);

  const effectiveRequest = useMemo<ProjectRequest>(() => ({
    ...request,
    pmo_extractedfieldsjson: writeExtras(request, inlineExtrasPatch),
    ...(primaryTeamId ? { '_pmo_targetteam_value': primaryTeamId } : {}),
  }), [request, inlineExtrasPatch, primaryTeamId]);

  const missingFields = useMemo(
    () => (isLastStage ? validateConversionReadiness(effectiveRequest) : []),
    [isLastStage, effectiveRequest],
  );

  const needs = (label: string) => missingFields.includes(label);

  // Detect whether the local state actually differs from the persisted record.
  // Avoids a redundant PATCH if the approver is just clicking through.
  const hasInlineEdits =
    primaryTeamId !== (request['_pmo_targetteam_value'] ?? '') ||
    pmId !== (persistedExtras.projectManagerId ?? '') ||
    sponsorId !== (persistedExtras.executiveSponsorId ?? '') ||
    complexity !== (persistedExtras.complexity != null ? String(persistedExtras.complexity) : '') ||
    strategicPriority !== (persistedExtras.strategicPriority != null ? String(persistedExtras.strategicPriority) : '') ||
    cfrCategory !== (persistedExtras.cfrCategory != null ? String(persistedExtras.cfrCategory) : '');

  const approveDisabled =
    saving ||
    approveRationale.trim().length < 1 ||
    (isLastStage && missingFields.length > 0);

  async function handleApprove() {
    if (approveRationale.trim().length < 1) return;
    setSavingAction('approve');
    setSaving(true);
    try {
      // 1) For non-final stages: same behavior as before — write the chain entry,
      //    advance the stage number, leave status at Draft for the next stage.
      if (!isLastStage) {
        const newEntry: ApprovalAction = {
          stageOrder: stageIndex,
          action: 'approved',
          actorId: currentUserId,
          actorName: 'Current User',
          timestamp: new Date().toISOString(),
          rationale: approveRationale.trim(),
        };
        const chain = [...approvalChain, newEntry];
        await updateProjectRequest(request.pmo_projectrequestid, {
          pmo_approvalchain: JSON.stringify(chain),
          pmo_currentstagenumber: stageIndex + 1,
          pmo_status: REQUEST_STATUS.Draft,
        });
        auditChange({
          entityType: 'intake',
          entityId: request.pmo_projectrequestid,
          entityName: request.pmo_name ?? 'Untitled Request',
          action: 'approve',
          changes: [
            { kind: 'field', field: 'stage',     label: 'Stage',     old: stageIndex + 1, new: stageIndex + 2 },
            { kind: 'field', field: 'rationale', label: 'Rationale', old: null,           new: approveRationale.trim() },
          ],
        });
        toast.success(`Stage ${stageIndex + 1} approved`);
        onActionComplete();
        return;
      }

      // 2) Final stage — auto-convert path. Persist inline edits FIRST so the
      //    Dataverse record matches what we're about to convert from.
      if (hasInlineEdits) {
        const persistPayload: Record<string, unknown> = {
          pmo_extractedfieldsjson: writeExtras(request, inlineExtrasPatch),
        };
        if (primaryTeamId) {
          persistPayload['pmo_TargetTeam@odata.bind'] = `/teams(${primaryTeamId})`;
        }
        await updateProjectRequest(request.pmo_projectrequestid, persistPayload);
      }

      // 3) Re-validate against the in-memory effective view (defensive — the
      //    Approve button is already disabled when missingFields > 0, but a
      //    race against the parent refetch could conceivably get us here).
      const stillMissing = validateConversionReadiness(effectiveRequest);
      if (stillMissing.length > 0) {
        toast.error(`Still missing: ${stillMissing.join(', ')}`);
        return;
      }

      // 4) Build the approval-chain entry (shape preserved so audit history
      //    keeps rendering the same way in /admin/change-history).
      const newEntry: ApprovalAction = {
        stageOrder: stageIndex,
        action: 'approved',
        actorId: currentUserId,
        actorName: 'Current User',
        timestamp: new Date().toISOString(),
        rationale: approveRationale.trim(),
      };
      const chain = [...approvalChain, newEntry];

      // Audit the intake approval itself (separate from the project-create
      // audit that fires once the conversion succeeds). This keeps the
      // approval visible in change history even if the conversion is
      // later undone or the project is deleted (audit row is not tied
      // to the project via pmo_Project@odata.bind).
      auditChange({
        entityType: 'intake',
        entityId: request.pmo_projectrequestid,
        entityName: effectiveRequest.pmo_name ?? 'Untitled Request',
        action: 'approve',
        changes: [
          { kind: 'field', field: 'pmo_status', label: 'Status',    old: 'Submitted', new: 'Approved' },
          { kind: 'field', field: 'rationale',  label: 'Rationale', old: null,        new: approveRationale.trim() },
        ],
      });

      // 5) Create the project (or program). Branch on conversion target.
      let createdId: string;
      const entityName = effectiveRequest.pmo_name;

      if (isProgram) {
        const program = await createProgram.mutateAsync(buildProgramPayload(effectiveRequest));
        createdId = program.msdyn_projectprogramid;
        auditChange({
          entityType: 'program',
          entityId: createdId,
          entityName,
          action: 'create',
        });
      } else {
        const project = await createProject.mutateAsync(buildProjectPayload(effectiveRequest));
        createdId = project.msdyn_projectid;
        auditChange({
          entityType: 'project',
          entityId: createdId,
          entityName,
          action: 'create',
          parentProjectId: createdId,
          parentProjectName: entityName,
        });

        // Primary-team membership row (best effort — row already created).
        const teamId = effectiveRequest['_pmo_targetteam_value'];
        if (teamId) {
          try {
            await createProjectTeam({
              'pmo_Project@odata.bind': `/msdyn_projects(${createdId})`,
              'pmo_Team@odata.bind': `/teams(${teamId})`,
              pmo_role: TEAM_ROLE.Primary,
              pmo_joineddate: new Date().toISOString().split('T')[0],
            });
          } catch (err) {
            console.warn('Primary-team row creation failed (non-fatal):', err);
          }
        }

        // Template application (best effort).
        try {
          const settingMap = Object.fromEntries((settings ?? []).map((s) => [s.pmo_key, s]));
          const { tasks } = resolveTemplate({
            settingMap,
            templates: templates ?? [],
            primaryTeamId: teamId ?? undefined,
            cfrCategory: readExtras(effectiveRequest).cfrCategory,
          });
          if (tasks.length > 0) await applyProjectTemplate(createdId, tasks);
        } catch (err) {
          console.warn('Template application failed (non-fatal):', err);
        }

        // Artifact carry-over (best effort).
        if (effectiveRequest.pmo_stageartifactsjson) {
          try {
            await carryOverArtifacts(
              effectiveRequest.pmo_stageartifactsjson,
              createdId,
              readExtras(effectiveRequest).cfrCategory,
            );
          } catch (err) {
            console.warn('Artifact carry-over failed (non-fatal):', err);
          }
        }
      }

      // 6) PATCH the request: bind ConvertedProject/Program, flip status to
      //    Converted, set converted-date, append approval-chain entry. If this
      //    fails we have a half-converted state — toast LOUDLY so the human
      //    can clean up.
      try {
        const bindKey = isProgram
          ? 'pmo_ConvertedProgram@odata.bind' : 'pmo_ConvertedProject@odata.bind';
        const bindEntity = isProgram ? 'msdyn_projectprograms' : 'msdyn_projects';
        const patchPayload: Record<string, unknown> = {
          pmo_approvalchain: JSON.stringify(chain),
          pmo_currentstagenumber: stageIndex,
          pmo_status: REQUEST_STATUS.Converted,
          pmo_converteddate: new Date().toISOString().split('T')[0],
          [bindKey]: `/${bindEntity}(${createdId})`,
        };
        await updateProjectRequest(request.pmo_projectrequestid, patchPayload);
      } catch (patchErr) {
        toast.error(
          `${isProgram ? 'Program' : 'Project'} created (${createdId}) but request not updated. ` +
          `Refresh and re-run conversion or contact admin.`,
        );
        console.error('Half-converted request:', request.pmo_projectrequestid, patchErr);
        return;
      }

      toast.success(`Approved and converted to ${isProgram ? 'program' : 'project'}.`);
      onActionComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }

  async function handleSendBack() {
    if (!sendBackQuestion.trim()) return;
    setSavingAction('sendback');
    setSaving(true);
    try {
      const newEntry: ApprovalAction = {
        stageOrder: stageIndex,
        action: 'sent_back',
        actorId: currentUserId,
        actorName: 'Current User',
        timestamp: new Date().toISOString(),
        rationale: '',
        clarificationQuestion: sendBackQuestion.trim(),
      };
      const chain = [...approvalChain, newEntry];

      await updateProjectRequest(request.pmo_projectrequestid, {
        pmo_approvalchain: JSON.stringify(chain),
        pmo_status: REQUEST_STATUS.AwaitingClarification,
        pmo_clarificationquestion: sendBackQuestion.trim(),
      });
      auditChange({
        entityType: 'intake',
        entityId: request.pmo_projectrequestid,
        entityName: request.pmo_name ?? 'Untitled Request',
        action: 'sendback',
        changes: [
          { kind: 'field', field: 'pmo_status',              label: 'Status',                  old: 'Submitted', new: 'Awaiting Clarification' },
          { kind: 'field', field: 'pmo_clarificationquestion', label: 'Clarification question', old: null,        new: sendBackQuestion.trim() },
        ],
      });

      toast.success('Sent back for clarification');
      onActionComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send back failed');
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }

  async function handleReject() {
    if (!rejectRationale.trim()) return;
    setSavingAction('reject');
    setSaving(true);
    try {
      const newEntry: ApprovalAction = {
        stageOrder: stageIndex,
        action: 'rejected',
        actorId: currentUserId,
        actorName: 'Current User',
        timestamp: new Date().toISOString(),
        rationale: rejectRationale.trim(),
      };
      const chain = [...approvalChain, newEntry];

      await updateProjectRequest(request.pmo_projectrequestid, {
        pmo_approvalchain: JSON.stringify(chain),
        pmo_status: REQUEST_STATUS.Rejected,
        pmo_rejectionreason: rejectRationale.trim(),
      });
      auditChange({
        entityType: 'intake',
        entityId: request.pmo_projectrequestid,
        entityName: request.pmo_name ?? 'Untitled Request',
        action: 'reject',
        changes: [
          { kind: 'field', field: 'pmo_status',         label: 'Status',           old: 'Submitted', new: 'Rejected' },
          { kind: 'field', field: 'pmo_rejectionreason', label: 'Rejection reason', old: null,        new: rejectRationale.trim() },
        ],
      });

      toast.success('Request rejected');
      setConfirmReject(false);
      onActionComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }

  const stageLabel = stage.pmo_stagelabel || stage.pmo_name || `Stage ${stageIndex + 1}`;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Stage {stageIndex + 1}: {stageLabel} — Approval Review
        </h3>
      </div>

      {/* Required fields review */}
      {requiredFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted Fields</p>
          <div className="grid grid-cols-2 gap-2">
            {requiredFields.map((field) => (
              <div key={field} className="p-2 rounded-md bg-muted/30 border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{INTAKE_CONFIGURABLE_FIELDS[field] ?? field}</p>
                <p className="text-sm text-foreground mt-0.5">
                  {capturedFields[field] != null ? String(capturedFields[field]) : (request as unknown as Record<string, unknown>)[field] != null ? String((request as unknown as Record<string, unknown>)[field]) : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {stageArtifacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attached Artifacts</p>
          {stageArtifacts.map((art, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border">
              <Download className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm flex-1">{art.fileName}</span>
              <span className="text-xs text-muted-foreground">{ARTIFACT_TYPE_LABELS[art.artifactType] ?? 'Artifact'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Clarification exchange */}
      {stageSendBacks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clarification History</p>
          {stageSendBacks.map((sb, i) => (
            <div key={i} className="p-2 rounded-md border bg-muted/20">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                <span className="font-medium">{sb.action === 'sent_back' ? 'PMO asked:' : 'Requester replied:'}</span>
                <span>{new Date(sb.timestamp).toLocaleDateString()}</span>
              </div>
              <p className="text-sm mt-1">
                {sb.action === 'sent_back' ? sb.clarificationQuestion : sb.clarificationResponse}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Auto-conversion inline editors — only when this is the final stage AND
          conversion-required fields are missing. The approver fills them in
          here, the Approve button auto-converts on click. */}
      {isLastStage && missingFields.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                Fill these in — approving will create the {isProgram ? 'program' : 'project'} automatically.
              </p>
              <p className="text-xs text-amber-800 mt-0.5">Missing: {missingFields.join(', ')}</p>
            </div>
          </div>

          {needs('Primary Team') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-amber-900">Primary Team *</label>
              <SearchableSelect
                value={primaryTeamId}
                onChange={(v) => setPrimaryTeamId(v)}
                options={pmoTeams}
                placeholder="Select primary team"
              />
            </div>
          )}

          {needs('Project Manager') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-amber-900">Project Manager *</label>
              <SearchableSelect
                value={pmId}
                onChange={(v) => setPmId(v)}
                onSearch={searchUsers}
                resolveLabel={resolveUserLabel}
                placeholder="Search for project manager"
              />
            </div>
          )}

          {needs('Executive Sponsor') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-amber-900">Executive Sponsor *</label>
              <SearchableSelect
                value={sponsorId}
                onChange={(v) => setSponsorId(v)}
                onSearch={searchUsers}
                resolveLabel={resolveUserLabel}
                placeholder="Search for executive sponsor"
              />
            </div>
          )}

          {needs('Complexity') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-amber-900">Complexity *</label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Select complexity" /></SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needs('Strategic Priority') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-amber-900">Strategic Priority *</label>
              <Select value={strategicPriority} onValueChange={setStrategicPriority}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Select strategic priority" /></SelectTrigger>
                <SelectContent>
                  {STRATEGIC_PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needs('CFR Category') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-amber-900">CFR Category *</label>
              <Select value={cfrCategory} onValueChange={setCfrCategory}>
                <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Select CFR category" /></SelectTrigger>
                <SelectContent>
                  {CFR_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Approval actions */}
      <div className="space-y-3 pt-3 border-t">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            {isLastStage ? `Approve & convert to ${isProgram ? 'program' : 'project'}` : 'Approve this stage'}
          </p>
          <Textarea
            rows={2}
            value={approveRationale}
            onChange={(e) => setApproveRationale(e.target.value)}
            placeholder="Rationale for approval..."
          />
          <Button
            className="mt-2"
            onClick={handleApprove}
            disabled={approveDisabled}
          >
            {savingAction === 'approve' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            {isLastStage ? `Approve & Create ${isProgram ? 'Program' : 'Project'}` : 'Approve Stage'}
          </Button>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Send back for clarification</p>
          <Textarea
            rows={2}
            value={sendBackQuestion}
            onChange={(e) => setSendBackQuestion(e.target.value)}
            placeholder="Question for the requester..."
          />
          <Button
            variant="outline"
            className="mt-2"
            onClick={handleSendBack}
            disabled={saving || !sendBackQuestion.trim()}
          >
            {savingAction === 'sendback' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowLeft className="h-4 w-4 mr-1" />}
            Send Back
          </Button>
        </div>

        <Button
          variant="destructive"
          onClick={() => setConfirmReject(true)}
          disabled={saving}
        >
          <X className="h-4 w-4 mr-1" />
          Reject Request
        </Button>
      </div>

      <Dialog open={confirmReject} onOpenChange={setConfirmReject}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Rejecting this request is permanent. The requester must submit a new request.
          </p>
          <Textarea
            rows={3}
            value={rejectRationale}
            onChange={(e) => setRejectRationale(e.target.value)}
            placeholder="Rejection reason (required)..."
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmReject(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={saving || !rejectRationale.trim()}
            >
              {savingAction === 'reject' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
