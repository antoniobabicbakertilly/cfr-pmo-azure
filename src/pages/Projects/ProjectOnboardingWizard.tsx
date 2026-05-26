import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { SearchableSelect, type SelectOption } from '../../components/common/SearchableSelect';
import { useCreateProject } from '../../hooks/useProjects';
import { useChangeAudit } from '../../hooks/useChangeAudit';
import { toast } from '../../hooks/useToast';
import { useProjectTemplates } from '../../hooks/useProjectTemplates';
import { useAppSettings } from '../../hooks/useAppSettings';
import { createProjectTeam } from '../../api/projectTeams.api';
import { listSystems } from '../../api/systems.api';
import { applyProjectTemplate } from '../../lib/schedulingClient';
import { CFR_CATEGORY_LABELS } from '../../lib/projectTemplates';
import { resolveTemplate } from '../../lib/templateResolution';
import * as dv from '../../lib/dataverseClient';
import {
  ENTITY_SETS, TEAM_ROLE,
  COMPLEXITY, STRATEGIC_PRIORITY, OVERALL_HEALTH,
  SETTING_USER_SCOPE_GROUP,
} from '../../lib/constants';
import { fetchPmoTeams } from '../../lib/pmoTeams';
import { usePmoTeamField } from '../../providers/ConfigurationProvider';
import { useQuery } from '@tanstack/react-query';

interface ProjectOnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: {
    name?: string;
    description?: string;
    primaryTeamId?: string;
    lineOfBusiness?: number;
    cfrCategory?: number;
    affectedSystemId?: string;
  };
  lockedFields?: string[];
  onCreated?: (projectId: string) => void;
}

const STEPS = ['Basics', 'Ownership', 'Template', 'Team', 'Classification', 'Review'] as const;

interface PmoTeam { teamid: string; name: string; [key: string]: unknown; }

function usePmoTeams() {
  const pmoTeamField = usePmoTeamField();
  return useQuery<SelectOption[]>({
    queryKey: ['pmoTeamsForWizard', pmoTeamField],
    queryFn: async () => {
      const teams = await fetchPmoTeams<PmoTeam>(pmoTeamField, ['teamid', 'name']);
      return teams.map((t) => ({ value: t.teamid, label: t.name }));
    },
    staleTime: Infinity,
  });
}

const USER_BASE_FILTER = "isdisabled eq false and accessmode ne 4 and accessmode ne 5 and applicationid eq null";

interface UserRow { systemuserid: string; fullname: string; lastname: string; firstname: string; }
function fmtUserName(u: UserRow): string {
  if (u.lastname && u.firstname) return `${u.lastname}, ${u.firstname}`;
  return u.fullname;
}

export function ProjectOnboardingWizard({ open, onOpenChange, prefill, lockedFields = [], onCreated }: ProjectOnboardingWizardProps) {
  const isLocked = (field: string) => lockedFields.includes(field);
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const auditChange = useChangeAudit();
  const { data: templates = [] } = useProjectTemplates();
  const { data: settings = [] } = useAppSettings();
  const { data: pmoTeams = [] } = usePmoTeams();
  const { data: systems = [] } = useQuery({
    queryKey: ['systems'],
    queryFn: listSystems,
    staleTime: Infinity,
  });

  const settingMap = useMemo(() => Object.fromEntries(settings.map((s) => [s.pmo_key, s])), [settings]);

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basics
  const [name, setName] = useState(prefill?.name ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [scheduledStart, setScheduledStart] = useState('');
  const [cfrCategory, setCfrCategory] = useState<string>(
    prefill?.cfrCategory != null ? String(prefill.cfrCategory) : '',
  );
  const [affectedSystemId, setAffectedSystemId] = useState(prefill?.affectedSystemId ?? '');

  // Step 2: Ownership
  const [pmId, setPmId] = useState('');
  const [sponsorId, setSponsorId] = useState('');
  const [primaryTeamId, setPrimaryTeamId] = useState(prefill?.primaryTeamId ?? '');

  // Step 3: Template
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Step 4: Team
  const [managerId, setManagerId] = useState('');
  const [contributingTeamIds, setContributingTeamIds] = useState<string[]>([]);
  const [addingTeamId, setAddingTeamId] = useState('');

  // Step 5: Classification
  const [complexity, setComplexity] = useState<string>('');
  const [strategicPriority, setStrategicPriority] = useState<string>('');
  const [overallHealth, setOverallHealth] = useState<string>(String(OVERALL_HEALTH.OnTrack));
  const [budget, setBudget] = useState('');

  // Resolve scope team for user search
  const scopeGroupId = settingMap[SETTING_USER_SCOPE_GROUP]?.pmo_value;
  const { data: scopeTeamId } = useQuery({
    queryKey: ['scopeTeamResolve', scopeGroupId],
    queryFn: async () => {
      if (!scopeGroupId) return null;
      const teams = await dv.list<{ teamid: string }>(ENTITY_SETS.team, {
        $select: ['teamid'],
        $filter: `azureactivedirectoryobjectid eq '${scopeGroupId}'`,
        $top: 1,
      });
      return teams[0]?.teamid ?? null;
    },
    enabled: !!scopeGroupId,
    staleTime: Infinity,
  });

  const searchUsers = useCallback(async (query: string): Promise<SelectOption[]> => {
    const nameFilter = `(contains(lastname,'${query}') or contains(firstname,'${query}') or contains(fullname,'${query}'))`;
    const scopeFilter = scopeTeamId
      ? `teammembership_association/any(t: t/teamid eq '${scopeTeamId}') and ` : '';
    const users = await dv.list<UserRow>(ENTITY_SETS.systemUser, {
      $select: ['systemuserid', 'fullname', 'lastname', 'firstname'],
      $filter: `${scopeFilter}${USER_BASE_FILTER} and ${nameFilter}`,
      $orderby: 'lastname asc,firstname asc',
      $top: 50,
    });
    return users.map((u) => ({ value: u.systemuserid, label: fmtUserName(u) }));
  }, [scopeTeamId]);

  const resolveUserLabel = useCallback(async (id: string): Promise<string> => {
    const u = await dv.get<UserRow>(ENTITY_SETS.systemUser, id, ['systemuserid', 'fullname', 'lastname', 'firstname']);
    return fmtUserName(u);
  }, []);

  // Resolve template using precedence hierarchy (shared with auto-conversion in lib/templateResolution.ts)
  const { template: resolvedTemplate, tasks: resolvedTasks, source: templateSource } = useMemo(
    () => resolveTemplate({
      settingMap,
      templates,
      selectedTemplateId,
      primaryTeamId,
      cfrCategory: cfrCategory ? Number(cfrCategory) : undefined,
    }),
    [settingMap, templates, selectedTemplateId, primaryTeamId, cfrCategory],
  );

  // Available teams for contributing (exclude primary and already-added)
  const availableContributingTeams = pmoTeams.filter(
    (t) => t.value !== primaryTeamId && !contributingTeamIds.includes(t.value),
  );

  function addContributingTeam() {
    if (addingTeamId && !contributingTeamIds.includes(addingTeamId)) {
      setContributingTeamIds([...contributingTeamIds, addingTeamId]);
      setAddingTeamId('');
    }
  }

  function removeContributingTeam(id: string) {
    setContributingTeamIds(contributingTeamIds.filter((t) => t !== id));
  }

  const canProceed = () => {
    // Start Date is required by Project Operations scheduling — without it, PSS rejects
    // task creation with "scheduledStart readonly" because it has no anchor to compute from.
    // Primary Team is required so the project is editable under the team-based permission
    // model (May 2026 overhaul) — without it, only admins could edit the project after create.
    if (step === 0) return !!name.trim() && !!scheduledStart && !!primaryTeamId;
    return true;
  };

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const createPayload: Record<string, unknown> = {
        msdyn_subject: name.trim(),
      };
      if (description.trim()) createPayload.msdyn_description = description.trim();
      if (scheduledStart) createPayload.msdyn_scheduledstart = scheduledStart;
      if (cfrCategory) createPayload.pmo_cfrcategory = Number(cfrCategory);
      if (complexity) createPayload.pmo_complexity = Number(complexity);
      if (strategicPriority) createPayload.pmo_strategicpriority = Number(strategicPriority);
      if (overallHealth) createPayload.proj_overallhealth = Number(overallHealth);
      if (budget) createPayload.proj_budget = Number(budget);
      if (pmId) createPayload['msdyn_projectmanager@odata.bind'] = `/systemusers(${pmId})`;
      if (sponsorId) createPayload['proj_ExecutiveSponsor@odata.bind'] = `/systemusers(${sponsorId})`;
      if (managerId) createPayload['proj_Manager@odata.bind'] = `/systemusers(${managerId})`;
      if (primaryTeamId) createPayload['pmo_PrimaryTeam@odata.bind'] = `/teams(${primaryTeamId})`;
      if (affectedSystemId) createPayload['pmo_AffectedSystem@odata.bind'] = `/cr87a_systems(${affectedSystemId})`;

      const project = await createProject.mutateAsync(createPayload);
      const projectId = project.msdyn_projectid;
      auditChange({
        entityType: 'project',
        entityId: projectId,
        entityName: name.trim(),
        action: 'create',
        parentProjectId: projectId,
        parentProjectName: name.trim(),
      });

      if (primaryTeamId) {
        await createProjectTeam({
          'pmo_Project@odata.bind': `/msdyn_projects(${projectId})`,
          'pmo_Team@odata.bind': `/teams(${primaryTeamId})`,
          pmo_role: TEAM_ROLE.Primary,
          pmo_joineddate: new Date().toISOString().split('T')[0],
        });
      }

      for (const ctId of contributingTeamIds) {
        await createProjectTeam({
          'pmo_Project@odata.bind': `/msdyn_projects(${projectId})`,
          'pmo_Team@odata.bind': `/teams(${ctId})`,
          pmo_role: TEAM_ROLE.Contributing,
          pmo_joineddate: new Date().toISOString().split('T')[0],
        });
      }

      if (resolvedTasks.length > 0) {
        await applyProjectTemplate(projectId, resolvedTasks);
      }

      toast.success(`Project "${name.trim()}" created successfully`);
      onOpenChange(false);
      if (onCreated) onCreated(projectId);
      else navigate(`/projects/${projectId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create project';
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => { if (i < step) setStep(i); }}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                i === step ? 'bg-primary text-primary-foreground font-medium' :
                i < step ? 'bg-primary/10 text-primary cursor-pointer' :
                'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <Check className="h-3 w-3 inline mr-0.5" /> : null}
              {s}
            </button>
          ))}
        </div>

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Project Name *{isLocked('msdyn_subject') && <span className="text-xs text-muted-foreground ml-1">🔒 from intake</span>}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter project name" disabled={isLocked('msdyn_subject')} />
            </div>
            <div>
              <label className="text-sm font-medium">Description{isLocked('msdyn_description') && <span className="text-xs text-muted-foreground ml-1">🔒 from intake</span>}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Brief project description"
                disabled={isLocked('msdyn_description')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Scheduled Start <span className="text-destructive">*</span></label>
                <Input type="date" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} required />
                <p className="text-[11px] text-muted-foreground mt-1">Required for task scheduling.</p>
              </div>
              <div>
                <label className="text-sm font-medium">CFR Category</label>
                <select value={cfrCategory} onChange={(e) => setCfrCategory(e.target.value)} className={selectCls}>
                  <option value="">Select category</option>
                  {Object.entries(CFR_CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Ownership */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Project Manager</label>
              <SearchableSelect value={pmId} onChange={setPmId} onSearch={searchUsers} resolveLabel={resolveUserLabel} placeholder="Search for PM..." minSearchLength={2} />
            </div>
            <div>
              <label className="text-sm font-medium">Executive Sponsor</label>
              <SearchableSelect value={sponsorId} onChange={setSponsorId} onSearch={searchUsers} resolveLabel={resolveUserLabel} placeholder="Search for sponsor..." minSearchLength={2} />
            </div>
            <div>
              <label className="text-sm font-medium">Primary Team <span className="text-rose-500">*</span></label>
              <SearchableSelect value={primaryTeamId} onChange={setPrimaryTeamId} options={pmoTeams} placeholder="Select primary team..." />
              <p className="text-xs text-muted-foreground mt-1">Required. Determines who can edit this project after creation.</p>
            </div>
          </div>
        )}

        {/* Step 2: Template */}
        {step === 2 && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Project Template</label>
              <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className={selectCls}>
                <option value="">Use default</option>
                {templates.map((t) => (
                  <option key={t.pmo_projecttemplateid} value={t.pmo_projecttemplateid}>{t.pmo_name}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Resolved template: <span className="text-foreground">{resolvedTemplate?.pmo_name ?? 'Category fallback'}</span></p>
              <p className="text-xs text-muted-foreground">Source: {templateSource}</p>
              {resolvedTasks.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">{resolvedTasks.length} tasks will be created:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
                    {resolvedTasks.map((t, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        {t.isMilestone ? <span className="text-amber-500">◆</span> : <span className="text-muted-foreground/40">○</span>}
                        {t.subject}
                        {t.duration ? <span className="text-muted-foreground/60 ml-auto">{t.duration}h</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Team & Collaboration */}
        {step === 3 && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Manager</label>
              <p className="text-xs text-muted-foreground mb-1">
                {primaryTeamId ? 'Restricted to members of the primary team' : 'Select a primary team first to restrict, or search all users'}
              </p>
              <SearchableSelect value={managerId} onChange={setManagerId} onSearch={searchUsers} resolveLabel={resolveUserLabel} placeholder="Search for manager..." minSearchLength={2} />
            </div>
            <div>
              <label className="text-sm font-medium">Contributing Teams</label>
              {contributingTeamIds.length > 0 && (
                <div className="space-y-1 mb-2">
                  {contributingTeamIds.map((ctId) => {
                    const t = pmoTeams.find((pt) => pt.value === ctId);
                    return (
                      <div key={ctId} className="flex items-center justify-between px-3 py-1.5 rounded-md bg-muted/50 text-sm">
                        <span>{t?.label ?? ctId}</span>
                        <button type="button" onClick={() => removeContributingTeam(ctId)} className="text-xs text-destructive hover:underline">Remove</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {availableContributingTeams.length > 0 && (
                <div className="flex items-center gap-2">
                  <select value={addingTeamId} onChange={(e) => setAddingTeamId(e.target.value)} className={selectCls}>
                    <option value="">Select team to add...</option>
                    {availableContributingTeams.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={addContributingTeam} disabled={!addingTeamId}>Add</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Classification & Governance */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Complexity</label>
                <select value={complexity} onChange={(e) => setComplexity(e.target.value)} className={selectCls}>
                  <option value="">Select...</option>
                  <option value={String(COMPLEXITY.Low)}>Low</option>
                  <option value={String(COMPLEXITY.Medium)}>Medium</option>
                  <option value={String(COMPLEXITY.High)}>High</option>
                  <option value={String(COMPLEXITY.Critical)}>Critical</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Strategic Priority</label>
                <select value={strategicPriority} onChange={(e) => setStrategicPriority(e.target.value)} className={selectCls}>
                  <option value="">Select...</option>
                  <option value={String(STRATEGIC_PRIORITY.MustHave)}>Must Have</option>
                  <option value={String(STRATEGIC_PRIORITY.ShouldHave)}>Should Have</option>
                  <option value={String(STRATEGIC_PRIORITY.NiceToHave)}>Nice to Have</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Overall Health</label>
                <select value={overallHealth} onChange={(e) => setOverallHealth(e.target.value)} className={selectCls}>
                  <option value={String(OVERALL_HEALTH.OnTrack)}>On Track</option>
                  <option value={String(OVERALL_HEALTH.AtRisk)}>At Risk</option>
                  <option value={String(OVERALL_HEALTH.OffTrack)}>Off Track</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Budget</label>
                <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Affected System</label>
              <select value={affectedSystemId} onChange={(e) => setAffectedSystemId(e.target.value)} className={selectCls}>
                <option value="">None / Not applicable</option>
                {systems.map((s) => (
                  <option key={s.cr87a_systemid} value={s.cr87a_systemid}>{s.cr87a_name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{name}</span></div>
                {cfrCategory && <div><span className="text-muted-foreground">Category:</span> {CFR_CATEGORY_LABELS[Number(cfrCategory)]}</div>}
                {scheduledStart && <div><span className="text-muted-foreground">Start:</span> {scheduledStart}</div>}
                {primaryTeamId && <div><span className="text-muted-foreground">Primary Team:</span> {pmoTeams.find(t => t.value === primaryTeamId)?.label}</div>}
                {affectedSystemId && <div><span className="text-muted-foreground">Affected System:</span> {systems.find(s => s.cr87a_systemid === affectedSystemId)?.cr87a_name}</div>}
                {contributingTeamIds.length > 0 && <div><span className="text-muted-foreground">Contributing:</span> {contributingTeamIds.length} team(s)</div>}
                <div><span className="text-muted-foreground">Template:</span> {resolvedTemplate?.pmo_name ?? 'Category fallback'} ({templateSource})</div>
                <div><span className="text-muted-foreground">Tasks:</span> {resolvedTasks.length} will be created</div>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : onOpenChange(false)}>
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            {step > 0 ? 'Back' : 'Cancel'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Create Project
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
