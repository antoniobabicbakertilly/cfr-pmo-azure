import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ExternalLink, Layers, AlertTriangle,
  Users, Plus, Trash2, Calendar, User, CircleAlert, Clock, Target,
  FileText, Pencil, Link2, Lock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { ReadOnlyField } from '../../components/common/ReadOnlyField';
import { HealthBadge } from '../../components/common/HealthBadge';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ActivityFeed } from '../../components/common/ActivityFeed';
import { NotesSection } from '../../components/projects/NotesSection';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useProject, useUpdateProject } from '../../hooks/useProjects';
import { useCanEditProject, useCanEditProjectRoster, READ_ONLY_TOOLTIP } from '../../hooks/useProjectPermissions';
import { useChangeAudit, type ChangeAuditFieldDiff } from '../../hooks/useChangeAudit';
import { diffEntityUpdate, PROJECT_FIELD_LABELS, TASK_FIELD_LABELS, RISK_FIELD_LABELS, ISSUE_FIELD_LABELS, CHANGE_FIELD_LABELS, STATUS_REPORT_FIELD_LABELS } from '../../lib/changeAuditFields';
import { useUrlState, PROJECT_TABS, MONITOR_SUB_TABS, TASK_VIEWS, type TaskView, type MonitorSubTab } from '../../hooks/useUrlState';
import { isDeepLinkAvailable, buildDeepLink } from '../../lib/deepLink';
import type { Project, ProjectUpdate } from '../../models/project.model';
import { useProjectTeams, useAddProjectTeam, useRemoveProjectTeam } from '../../hooks/useProjectTeams';
import * as dv from '../../lib/dataverseClient';
import { fetchPmoTeams } from '../../lib/pmoTeams';
import { useProjectTeamMembers } from '../../hooks/useProjectTeamMembers';
import { useAddProjectTeamMember, useRemoveProjectTeamMember } from '../../hooks/useProjectTeamMemberMutations';
import { useResourceAssignments } from '../../hooks/useResourceAssignments';
import { useAssignResource, useUnassignResource } from '../../hooks/useResourceAssignmentMutations';
import { useBookableResources } from '../../hooks/useBookableResources';
import { useProjectBuckets } from '../../hooks/useProjectBuckets';
import { useProjectTasks } from '../../hooks/useProjectTasks';
import {
  useStatusReports, useCreateStatusReport, useUpdateStatusReport, useDeleteStatusReport,
} from '../../hooks/useStatusReports';
import {
  useProjectRisks, useCreateProjectRisk, useUpdateProjectRisk, useDeleteProjectRisk,
} from '../../hooks/useProjectRisks';
import {
  useProjectIssues, useCreateProjectIssue, useUpdateProjectIssue, useDeleteProjectIssue,
} from '../../hooks/useProjectIssues';
import {
  useProjectChanges, useCreateProjectChange, useUpdateProjectChange, useDeleteProjectChange,
} from '../../hooks/useProjectChanges';
import { usePlannerUrl } from '../../hooks/useOrganization';
import {
  OVERALL_HEALTH, TEAM_ROLE, ENTITY_SETS,
  RISK_CATEGORY, ACCEL_STATE, ISSUE_CATEGORY, ACCEL_PRIORITY,
  CHANGE_TYPE, CHANGE_IMPACT, CHANGE_RISK, CHANGE_APPROVAL,
  CFR_CATEGORY, COMPLEXITY, STRATEGIC_PRIORITY, SETTING_USER_SCOPE_GROUP,
} from '../../lib/constants';
import { usePmoTeamField, useFeatureToggles, useEffectiveAdminRole } from '../../providers/ConfigurationProvider';
import { DeleteConfirmDialog, type DeleteChildSummary } from '../../components/common/DeleteConfirmDialog';
import { cascadeDeleteProject, summarizeProjectDelete } from '../../lib/cascadeDelete';
import { useAppSetting } from '../../hooks/useAppSettings';
import type { ProjectRisk } from '../../models/projectRisk.model';
import type { ProjectIssue } from '../../models/projectIssue.model';
import type { ProjectChange } from '../../models/projectChange.model';
import type { StatusReport } from '../../models/statusReport.model';
import { TaskWorkspace } from '../../components/scheduling/TaskWorkspace';
import {
  useCreateProjectTask,
  useUpdateProjectTask,
  useDeleteProjectTask,
} from '../../hooks/useProjectTaskMutations';
import { useProjectTaskDependencies } from '../../hooks/useProjectTaskDependencies';
import {
  useCreateProjectTaskDependency,
  useDeleteProjectTaskDependency,
} from '../../hooks/useProjectTaskDependencyMutations';
import { useQueryClient } from '@tanstack/react-query';
import { updateProjectSchedule } from '../../lib/schedulingClient';
import type { ScheduleTaskCreate } from '../../lib/schedulingClient';
import { MonitorWorkspace } from '../../components/projects/MonitorWorkspace';
import { GovernWorkspace } from '../../components/projects/GovernWorkspace';
import { PlanWorkspace } from '../../components/projects/PlanWorkspace';
import { CollaborateWorkspace } from '../../components/projects/CollaborateWorkspace';
import { useProjectDecisions } from '../../hooks/useProjectDecisions';

import { toast } from '../../hooks/useToast';

// ─── Formatters ───────────────────────────────────────────────────────────────

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});

function fmtCurrency(v?: number) { return v != null ? currencyFmt.format(v) : '—'; }
function fmtDate(v?: string) { return v ? new Date(v).toLocaleDateString() : '—'; }
function fmtNumber(v?: number, decimals = 0) { return v != null ? v.toFixed(decimals) : '—'; }

// extractDvMessage moved to workspace components

// ─── Style helpers ────────────────────────────────────────────────────────────


// Card components (RiskCard, IssueCard, ChangeCard) moved to MonitorWorkspace

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-xs font-semibold uppercase tracking-widest text-muted-foreground', className)}>
      {children}
    </h3>
  );
}

function ProgressBar({ value, className }: { value?: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-primary' : 'bg-amber-500';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-foreground tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function StatCell({ label, value, accent, onClick }: { label: string; value: string | number; accent?: 'rose' | 'amber' | 'blue'; onClick?: () => void }) {
  const textColor =
    accent === 'rose' ? 'text-rose-500' :
    accent === 'amber' ? 'text-amber-500' :
    accent === 'blue' ? 'text-blue-500' :
    'text-foreground';
  return (
    <div
      className={cn('px-5 py-3 text-center', onClick && 'cursor-pointer hover:bg-muted/40 transition-colors')}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <p className={cn('text-lg font-bold tabular-nums leading-none', textColor)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function MetaPill({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </span>
  );
}

function AlertRow({ icon: Icon, message, level = 'warning', action }: {
  icon: React.ElementType; message: string; level?: 'warning' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}) {
  const styles = {
    warning: 'bg-amber-500/8 border-amber-500/25 text-amber-700 dark:text-amber-300',
    error: 'bg-rose-500/8 border-rose-500/25 text-rose-700 dark:text-rose-300',
    info: 'bg-blue-500/8 border-blue-500/25 text-blue-700 dark:text-blue-300',
  };
  const iconColors = { warning: 'text-amber-500', error: 'text-rose-500', info: 'text-blue-500' };
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5', styles[level])}>
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', iconColors[level])} />
      <div className="flex-1 flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed">{message}</p>
        {action && (
          <button onClick={action.onClick} className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap">
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function BudgetBar({ budget, actual }: { budget?: number; actual?: number }) {
  if (!budget) return null;
  const pct = Math.min(100, ((actual ?? 0) / budget) * 100);
  const color = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
        <span>Budget utilization</span>
        <span className="font-semibold text-foreground">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function FormInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

function FormSelect({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder={placeholder ?? 'Select...'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— None —</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const RISK_CAT_OPTIONS   = Object.entries(RISK_CATEGORY).map(([k, v]) => ({ value: String(v), label: k }));
const ACCEL_STATE_OPTIONS = [
  { value: String(ACCEL_STATE.Proposed), label: '(1) Proposed' },
  { value: String(ACCEL_STATE.Active),   label: '(2) Active' },
  { value: String(ACCEL_STATE.Closed),   label: '(3) Closed' },
  { value: String(ACCEL_STATE.OnHold),   label: '(4) On Hold' },
];
const ACCEL_PRI_OPTIONS = [
  { value: String(ACCEL_PRIORITY.Critical), label: '(1) Critical' },
  { value: String(ACCEL_PRIORITY.High),     label: '(2) High' },
  { value: String(ACCEL_PRIORITY.Moderate), label: '(3) Moderate' },
  { value: String(ACCEL_PRIORITY.Low),      label: '(4) Low' },
];
const ISSUE_CAT_OPTIONS = Object.entries(ISSUE_CATEGORY).map(([k, v]) => ({ value: String(v), label: k }));
const CHANGE_TYPE_OPTIONS = [
  { value: String(CHANGE_TYPE.Scope),    label: 'Scope' },
  { value: String(CHANGE_TYPE.Schedule), label: 'Schedule' },
  { value: String(CHANGE_TYPE.Cost),     label: 'Cost' },
  { value: String(CHANGE_TYPE.None),     label: 'None' },
];
const CHANGE_IMPACT_OPTIONS = [
  { value: String(CHANGE_IMPACT.High),   label: '(1) High' },
  { value: String(CHANGE_IMPACT.Medium), label: '(2) Medium' },
  { value: String(CHANGE_IMPACT.Low),    label: '(3) Low' },
];
const CHANGE_RISK_OPTIONS = [
  { value: String(CHANGE_RISK.High),     label: '(1) High' },
  { value: String(CHANGE_RISK.Moderate), label: '(2) Moderate' },
  { value: String(CHANGE_RISK.Low),      label: '(3) Low' },
  { value: String(CHANGE_RISK.None),     label: '(4) None' },
];
const CHANGE_APPROVAL_OPTIONS = [
  { value: String(CHANGE_APPROVAL.NotYetRequested), label: '(1) Not Yet Requested' },
  { value: String(CHANGE_APPROVAL.Requested),       label: '(2) Requested' },
  { value: String(CHANGE_APPROVAL.Approved),        label: '(3) Approved' },
  { value: String(CHANGE_APPROVAL.Rejected),        label: '(4) Rejected' },
];

function numOrNull(s: string): number | null {
  if (!s || s === '__none__') return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}
function strOrNull(s: string): string | null { return s.trim() || null; }

// ─── Risk Form Dialog ─────────────────────────────────────────────────────────

function RiskFormDialog({ open, editing, existingRisks, isPending, onClose, onSave }: {
  open: boolean; editing: ProjectRisk | null; existingRisks: ProjectRisk[];
  isPending: boolean; onClose: () => void;
  onSave: (payload: { msdyn_subject: string; msdyn_description?: string; msdyn_mitigationplan?: string; msdyn_contingencyplan?: string; proj_impact?: number | null; proj_probability?: number | null; proj_category?: number | null; proj_state?: number | null; proj_due?: string | null }) => void;
}) {
  // msdyn_subject is the user-visible name; msdyn_name is the unique system key (auto-generated on create)
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [state, setState] = useState('');
  const [impact, setImpact] = useState('');
  const [probability, setProbability] = useState('');
  const [due, setDue] = useState('');
  const [mitigation, setMitigation] = useState('');
  const [contingency, setContingency] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSubject(editing.msdyn_subject ?? editing.msdyn_name ?? '');
      setDesc(editing.msdyn_description ?? '');
      setCategory(editing.proj_category != null ? String(editing.proj_category) : '');
      setState(editing.proj_state != null ? String(editing.proj_state) : '');
      setImpact(editing.proj_impact != null ? String(editing.proj_impact) : '');
      setProbability(editing.proj_probability != null ? String(editing.proj_probability) : '');
      setDue(editing.proj_due ? editing.proj_due.split('T')[0] : '');
      setMitigation(editing.msdyn_mitigationplan ?? '');
      setContingency(editing.msdyn_contingencyplan ?? '');
    } else {
      setSubject(''); setDesc(''); setCategory(''); setState('');
      setImpact(''); setProbability(''); setDue(''); setMitigation(''); setContingency('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.msdyn_projectriskid]);

  const duplicateInProject = !editing && existingRisks.some((r) =>
    (r.msdyn_subject ?? r.msdyn_name ?? '').trim().toLowerCase() === subject.trim().toLowerCase()
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Risk' : 'New Risk'}</DialogTitle>
          <DialogDescription>{editing ? 'Update this risk record.' : 'Add a new risk to this project.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FormRow label="Risk Name *">
            <FormInput value={subject} onChange={setSubject} placeholder="Brief risk title" />
            {duplicateInProject && (
              <p className="text-xs text-destructive mt-1">A risk with this name already exists in this project.</p>
            )}
          </FormRow>
          <FormRow label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Describe the risk..." /></FormRow>
          <div className="grid grid-cols-2 gap-4">
            <FormRow label="Category"><FormSelect value={category} onChange={setCategory} options={RISK_CAT_OPTIONS} /></FormRow>
            <FormRow label="State"><FormSelect value={state} onChange={setState} options={ACCEL_STATE_OPTIONS} /></FormRow>
            <FormRow label="Impact (1–5)"><FormInput type="number" value={impact} onChange={setImpact} placeholder="1–5" /></FormRow>
            <FormRow label="Probability (1–5)"><FormInput type="number" value={probability} onChange={setProbability} placeholder="1–5" /></FormRow>
            <FormRow label="Due Date"><FormInput type="date" value={due} onChange={setDue} /></FormRow>
          </div>
          <FormRow label="Mitigation Plan"><Textarea value={mitigation} onChange={(e) => setMitigation(e.target.value)} rows={3} placeholder="How will we mitigate this risk?" /></FormRow>
          <FormRow label="Contingency Plan"><Textarea value={contingency} onChange={(e) => setContingency(e.target.value)} rows={3} placeholder="What's the fallback if the risk materializes?" /></FormRow>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button disabled={!subject.trim() || duplicateInProject || isPending} onClick={() => onSave({
            msdyn_subject: subject.trim(),
            msdyn_description: desc.trim() || undefined,
            proj_category: numOrNull(category),
            proj_state: numOrNull(state),
            proj_impact: numOrNull(impact),
            proj_probability: numOrNull(probability),
            proj_due: strOrNull(due),
            msdyn_mitigationplan: mitigation.trim() || undefined,
            msdyn_contingencyplan: contingency.trim() || undefined,
          })}>
            {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Risk'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Issue Form Dialog ────────────────────────────────────────────────────────

function IssueFormDialog({ open, editing, existingIssues, isPending, onClose, onSave }: {
  open: boolean; editing: ProjectIssue | null; existingIssues: ProjectIssue[];
  isPending: boolean; onClose: () => void;
  onSave: (payload: { msdyn_name: string; msdyn_description?: string; msdyn_resolution?: string; proj_issuecategory?: number | null; proj_priority?: number | null; proj_state?: number | null; proj_duedate?: string | null }) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [resolution, setResolution] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [state, setState] = useState('');
  const [due, setDue] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.msdyn_name ?? '');
      setDesc(editing.msdyn_description ?? '');
      setResolution(editing.msdyn_resolution ?? '');
      setCategory(editing.proj_issuecategory != null ? String(editing.proj_issuecategory) : '');
      setPriority(editing.proj_priority != null ? String(editing.proj_priority) : '');
      setState(editing.proj_state != null ? String(editing.proj_state) : '');
      setDue(editing.proj_duedate ? editing.proj_duedate.split('T')[0] : '');
    } else {
      setName(''); setDesc(''); setResolution(''); setCategory(''); setPriority(''); setState(''); setDue('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.msdyn_projectissueid]);

  const duplicateInProject = !editing && existingIssues.some((i) =>
    (i.msdyn_name ?? '').trim().toLowerCase() === name.trim().toLowerCase()
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Issue' : 'New Issue'}</DialogTitle>
          <DialogDescription>{editing ? 'Update this issue.' : 'Log a new issue for this project.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FormRow label="Title *">
            <FormInput value={name} onChange={setName} placeholder="Issue title" />
            {duplicateInProject && (
              <p className="text-xs text-destructive mt-1">An issue with this name already exists in this project.</p>
            )}
          </FormRow>
          <FormRow label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Describe the issue..." /></FormRow>
          <div className="grid grid-cols-2 gap-4">
            <FormRow label="Category"><FormSelect value={category} onChange={setCategory} options={ISSUE_CAT_OPTIONS} /></FormRow>
            <FormRow label="Priority"><FormSelect value={priority} onChange={setPriority} options={ACCEL_PRI_OPTIONS} /></FormRow>
            <FormRow label="State"><FormSelect value={state} onChange={setState} options={ACCEL_STATE_OPTIONS} /></FormRow>
            <FormRow label="Due Date"><FormInput type="date" value={due} onChange={setDue} /></FormRow>
          </div>
          <FormRow label="Resolution"><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="How was this resolved?" /></FormRow>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button disabled={!name.trim() || duplicateInProject || isPending} onClick={() => onSave({
            msdyn_name: name.trim(),
            msdyn_description: desc.trim() || undefined,
            msdyn_resolution: resolution.trim() || undefined,
            proj_issuecategory: numOrNull(category),
            proj_priority: numOrNull(priority),
            proj_state: numOrNull(state),
            proj_duedate: strOrNull(due),
          })}>
            {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Issue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Change Form Dialog ───────────────────────────────────────────────────────

function ChangeFormDialog({ open, editing, existingChanges, isPending, onClose, onSave }: {
  open: boolean; editing: ProjectChange | null; existingChanges: ProjectChange[];
  isPending: boolean; onClose: () => void;
  onSave: (payload: { msdyn_name: string; msdyn_description?: string; msdyn_additionalcomments?: string; proj_changetype?: number | null; proj_changeimpact?: number | null; proj_changerisk?: number | null; proj_priority?: number | null; proj_approval?: number | null; proj_state?: number | null; proj_costimpact?: number | null; proj_requesteddate?: string | null; proj_plannedstartdate?: string | null; proj_plannedduedate?: string | null; proj_changebenefits?: string; proj_changeplan?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [comments, setComments] = useState('');
  const [type, setType] = useState('');
  const [impact, setImpact] = useState('');
  const [risk, setRisk] = useState('');
  const [priority, setPriority] = useState('');
  const [approval, setApproval] = useState('');
  const [state, setState] = useState('');
  const [costImpact, setCostImpact] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [benefits, setBenefits] = useState('');
  const [plan, setPlan] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.msdyn_name ?? '');
      setDesc(editing.msdyn_description ?? '');
      setComments(editing.msdyn_additionalcomments ?? '');
      setType(editing.proj_changetype != null ? String(editing.proj_changetype) : '');
      setImpact(editing.proj_changeimpact != null ? String(editing.proj_changeimpact) : '');
      setRisk(editing.proj_changerisk != null ? String(editing.proj_changerisk) : '');
      setPriority(editing.proj_priority != null ? String(editing.proj_priority) : '');
      setApproval(editing.proj_approval != null ? String(editing.proj_approval) : '');
      setState(editing.proj_state != null ? String(editing.proj_state) : '');
      setCostImpact(editing.proj_costimpact != null ? String(editing.proj_costimpact) : '');
      setRequestedDate(editing.proj_requesteddate ? editing.proj_requesteddate.split('T')[0] : '');
      setStartDate(editing.proj_plannedstartdate ? editing.proj_plannedstartdate.split('T')[0] : '');
      setDueDate(editing.proj_plannedduedate ? editing.proj_plannedduedate.split('T')[0] : '');
      setBenefits(editing.proj_changebenefits ?? '');
      setPlan(editing.proj_changeplan ?? '');
    } else {
      setName(''); setDesc(''); setComments(''); setType(''); setImpact(''); setRisk('');
      setPriority(''); setApproval(''); setState(''); setCostImpact(''); setRequestedDate('');
      setStartDate(''); setDueDate(''); setBenefits(''); setPlan('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.msdyn_projectchangeid]);

  const duplicateInProject = !editing && existingChanges.some((c) =>
    (c.msdyn_name ?? '').trim().toLowerCase() === name.trim().toLowerCase()
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Change Request' : 'New Change Request'}</DialogTitle>
          <DialogDescription>{editing ? 'Update this change request.' : 'Submit a new change request for this project.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FormRow label="Title *">
            <FormInput value={name} onChange={setName} placeholder="Change request title" />
            {duplicateInProject && (
              <p className="text-xs text-destructive mt-1">A change request with this name already exists in this project.</p>
            )}
          </FormRow>
          <FormRow label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Describe the change..." /></FormRow>
          <div className="grid grid-cols-2 gap-4">
            <FormRow label="Type"><FormSelect value={type} onChange={setType} options={CHANGE_TYPE_OPTIONS} /></FormRow>
            <FormRow label="Priority"><FormSelect value={priority} onChange={setPriority} options={ACCEL_PRI_OPTIONS} /></FormRow>
            <FormRow label="Impact"><FormSelect value={impact} onChange={setImpact} options={CHANGE_IMPACT_OPTIONS} /></FormRow>
            <FormRow label="Risk"><FormSelect value={risk} onChange={setRisk} options={CHANGE_RISK_OPTIONS} /></FormRow>
            <FormRow label="Approval"><FormSelect value={approval} onChange={setApproval} options={CHANGE_APPROVAL_OPTIONS} /></FormRow>
            <FormRow label="State"><FormSelect value={state} onChange={setState} options={ACCEL_STATE_OPTIONS} /></FormRow>
            <FormRow label="Cost Impact ($)"><FormInput type="number" value={costImpact} onChange={setCostImpact} placeholder="0" /></FormRow>
            <FormRow label="Requested Date"><FormInput type="date" value={requestedDate} onChange={setRequestedDate} /></FormRow>
            <FormRow label="Planned Start"><FormInput type="date" value={startDate} onChange={setStartDate} /></FormRow>
            <FormRow label="Planned Due"><FormInput type="date" value={dueDate} onChange={setDueDate} /></FormRow>
          </div>
          <FormRow label="Benefits"><Textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={3} placeholder="Expected benefits of this change..." /></FormRow>
          <FormRow label="Change Plan"><Textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} placeholder="How will the change be implemented?" /></FormRow>
          <FormRow label="Additional Comments"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} placeholder="Any additional notes..." /></FormRow>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button disabled={!name.trim() || duplicateInProject || isPending} onClick={() => onSave({
            msdyn_name: name.trim(),
            msdyn_description: desc.trim() || undefined,
            msdyn_additionalcomments: comments.trim() || undefined,
            proj_changetype: numOrNull(type),
            proj_changeimpact: numOrNull(impact),
            proj_changerisk: numOrNull(risk),
            proj_priority: numOrNull(priority),
            proj_approval: numOrNull(approval),
            proj_state: numOrNull(state),
            proj_costimpact: costImpact ? parseFloat(costImpact) : null,
            proj_requesteddate: strOrNull(requestedDate),
            proj_plannedstartdate: strOrNull(startDate),
            proj_plannedduedate: strOrNull(dueDate),
            proj_changebenefits: benefits.trim() || undefined,
            proj_changeplan: plan.trim() || undefined,
          })}>
            {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Change Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Report Form Dialog ────────────────────────────────────────────────

function StatusReportFormDialog({ open, editing, projectId: _projectId, isPending, onClose, onSave }: {
  open: boolean; editing: StatusReport | null; projectId: string;
  isPending: boolean; onClose: () => void;
  onSave: (payload: { msdyn_name: string; msdyn_accomplishedactivities?: string; msdyn_plannedactivities?: string; msdyn_additionalcomments?: string; proj_reportingdate?: string | null }) => void;
}) {
  const [name, setName] = useState('');
  const [accomplished, setAccomplished] = useState('');
  const [planned, setPlanned] = useState('');
  const [comments, setComments] = useState('');
  const [reportingDate, setReportingDate] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.msdyn_name ?? '');
      setAccomplished(editing.msdyn_accomplishedactivities ?? '');
      setPlanned(editing.msdyn_plannedactivities ?? '');
      setComments(editing.msdyn_additionalcomments ?? '');
      setReportingDate(editing.proj_reportingdate ? editing.proj_reportingdate.split('T')[0] : '');
    } else {
      const today = new Date().toISOString().split('T')[0];
      setName(''); setAccomplished(''); setPlanned(''); setComments('');
      setReportingDate(today);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.msdyn_projectstatusreportid]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Status Report' : 'New Status Report'}</DialogTitle>
          <DialogDescription>{editing ? 'Update this status report.' : 'Submit a status update for this project.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FormRow label="Report Title *"><FormInput value={name} onChange={setName} placeholder="e.g. Week 16 Status Update" /></FormRow>
            </div>
            <div className="col-span-2">
              <FormRow label="Reporting Date"><FormInput type="date" value={reportingDate} onChange={setReportingDate} /></FormRow>
            </div>
          </div>
          <FormRow label="Accomplished Activities"><Textarea value={accomplished} onChange={(e) => setAccomplished(e.target.value)} rows={4} placeholder="What was accomplished this period?" /></FormRow>
          <FormRow label="Planned Activities"><Textarea value={planned} onChange={(e) => setPlanned(e.target.value)} rows={4} placeholder="What is planned for the next period?" /></FormRow>
          <FormRow label="Additional Comments"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} placeholder="Any additional comments or blockers..." /></FormRow>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button disabled={!name.trim() || isPending} onClick={() => onSave({
            msdyn_name: name.trim(),
            msdyn_accomplishedactivities: accomplished.trim() || undefined,
            msdyn_plannedactivities: planned.trim() || undefined,
            msdyn_additionalcomments: comments.trim() || undefined,
            proj_reportingdate: strOrNull(reportingDate),
          })}>
            {isPending ? 'Saving...' : editing ? 'Save Changes' : 'Submit Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project edit dialog (tabbed) ────────────────────────────────────────────

const CFR_CAT_OPTIONS = [
  { value: String(CFR_CATEGORY.ItInfrastructure), label: 'IT Infrastructure' },
  { value: String(CFR_CATEGORY.FinanceSystems),   label: 'Finance Systems' },
  { value: String(CFR_CATEGORY.Compliance),       label: 'Compliance' },
  { value: String(CFR_CATEGORY.DataAndAnalytics), label: 'Data & Analytics' },
  { value: String(CFR_CATEGORY.Operations),       label: 'Operations' },
  { value: String(CFR_CATEGORY.Other),            label: 'Other' },
];
const COMPLEXITY_OPTIONS = [
  { value: String(COMPLEXITY.Low),      label: 'Low' },
  { value: String(COMPLEXITY.Medium),   label: 'Medium' },
  { value: String(COMPLEXITY.High),     label: 'High' },
  { value: String(COMPLEXITY.Critical), label: 'Critical' },
];
const STRATEGIC_PRI_OPTIONS = [
  { value: String(STRATEGIC_PRIORITY.MustHave),    label: 'Must Have' },
  { value: String(STRATEGIC_PRIORITY.ShouldHave),  label: 'Should Have' },
  { value: String(STRATEGIC_PRIORITY.NiceToHave),  label: 'Nice to Have' },
];
const HEALTH_OPTIONS = [
  { value: String(OVERALL_HEALTH.OnTrack),  label: 'On Track' },
  { value: String(OVERALL_HEALTH.AtRisk),   label: 'At Risk' },
  { value: String(OVERALL_HEALTH.OffTrack), label: 'Off Track' },
];

/** Label + description shown at the top of each edit tab */
function TabSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="pb-4 border-b border-border/60">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}

function ProjectEditDialog({
  open, onClose, project, onSave, isPending, error,
}: {
  open: boolean; onClose: () => void; project: Project;
  onSave: (payload: ProjectUpdate, scheduleUpdate?: { scheduledStart?: string }) => Promise<void>;
  isPending: boolean;
  error?: Error | null;
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const userScopeGroupId = useAppSetting(SETTING_USER_SCOPE_GROUP);
  const pmoTeamField = usePmoTeamField();

  // ── Details ───────────────────────────────────────────────────────────────
  const [name, setName]           = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [finishDate, setFinishDate] = useState('');
  const [initStartDate, setInitStartDate] = useState('');

  // ── Governance ────────────────────────────────────────────────────────────
  // Track initial GUID so we only include a bind in the PATCH when the value changes.
  const [pmId, setPmId]           = useState('');
  const [sponsorId, setSponsorId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [programId, setProgramId] = useState('');
  const [primaryTeamId, setPrimaryTeamId] = useState('');
  const [initPmId, setInitPmId]   = useState('');
  const [initSponsorId, setInitSponsorId] = useState('');
  const [initManagerId, setInitManagerId] = useState('');
  const [initProgramId, setInitProgramId] = useState('');
  const [initPrimaryTeamId, setInitPrimaryTeamId] = useState('');

  // ── Health ────────────────────────────────────────────────────────────────
  const [overallHealth, setOverallHealth]     = useState('');
  const [scheduleHealth, setScheduleHealth]   = useState('');
  const [effortHealth, setEffortHealth]       = useState('');
  const [financialHealth, setFinancialHealth] = useState('');
  const [issueHealth, setIssueHealth]         = useState('');

  // ── Financials ────────────────────────────────────────────────────────────
  const [budget, setBudget]               = useState('');
  const [forecast, setForecast]           = useState('');
  const [benefits, setBenefits]           = useState('');
  const [fundingAvailable, setFundingAvailable] = useState(false);

  // ── CFR Classification ────────────────────────────────────────────────────
  const [cfrCategory, setCfrCategory]         = useState('');
  const [complexity, setComplexity]           = useState('');
  const [strategicPriority, setStrategicPriority] = useState('');

  // ── Narrative ─────────────────────────────────────────────────────────────
  const [businessCase, setBusinessCase]       = useState('');
  const [valueStatement, setValueStatement]   = useState('');
  const [comments, setComments]               = useState('');

  // ── Remote data (loaded once the dialog is open) ──────────────────────────
  const { data: programs = [] } = useQuery({
    queryKey: ['programs', 'forProjectEdit'],
    queryFn: () => dv.list<{ msdyn_projectprogramid: string; msdyn_name: string }>(
      ENTITY_SETS.program,
      { $select: ['msdyn_projectprogramid', 'msdyn_name'], $orderby: 'msdyn_name asc' },
    ),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Resolve AAD group object ID → Dataverse team GUID (stable across environments)
  const { data: scopeTeamId } = useQuery({
    queryKey: ['aadGroupTeam', userScopeGroupId],
    queryFn: async () => {
      const teams = await dv.list<{ teamid: string }>(ENTITY_SETS.team, {
        $select: ['teamid'],
        $filter: `azureactivedirectoryobjectid eq '${userScopeGroupId}'`,
        $top: 1,
      });
      return teams[0]?.teamid ?? null;
    },
    enabled: !!userScopeGroupId,
    staleTime: 30 * 60 * 1000,
  });

  const { data: pmoTeams = [] } = useQuery({
    queryKey: ['systemTeams', 'forProjectEdit', pmoTeamField],
    queryFn: async () => {
      const all = await fetchPmoTeams<Record<string, unknown>>(pmoTeamField, ['teamid', 'name']);
      return all.map((t) => ({ teamid: t['teamid'] as string, name: t['name'] as string }));
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers', primaryTeamId],
    queryFn: () => dv.list<{ systemuserid: string; fullname: string; lastname: string; firstname: string }>(
      ENTITY_SETS.systemUser,
      {
        $select: ['systemuserid', 'fullname', 'lastname', 'firstname'],
        $filter: `teammembership_association/any(t: t/teamid eq '${primaryTeamId}') and isdisabled eq false`,
        $orderby: 'lastname asc,firstname asc',
      },
    ),
    enabled: open && !!primaryTeamId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: selectedTeamAdmin } = useQuery({
    queryKey: ['teamAdmin', primaryTeamId],
    queryFn: async () => {
      const team = await dv.get<{ _administratorid_value?: string }>(
        ENTITY_SETS.team, primaryTeamId!, ['_administratorid_value'],
      );
      if (!team._administratorid_value) return null;
      return dv.get<{ systemuserid: string; fullname: string; lastname: string; firstname: string }>(
        ENTITY_SETS.systemUser, team._administratorid_value, ['systemuserid', 'fullname', 'lastname', 'firstname'],
      );
    },
    enabled: open && !!primaryTeamId,
    staleTime: 5 * 60 * 1000,
  });

  type UserRow = { systemuserid: string; fullname: string; lastname: string; firstname: string };
  const fmtUserName = (u: UserRow) =>
    u.lastname && u.firstname ? `${u.lastname}, ${u.firstname}` : u.fullname;
  const toOptions = (users: UserRow[]) => users.map((u) => ({ value: u.systemuserid, label: fmtUserName(u) }));

  // Default filter: exclude service accounts, support users, delegated admins, app IDs
  // accessmode: 4=Support, 5=DelegatedAdmin; also exclude records with applicationid set
  const USER_BASE_FILTER = "isdisabled eq false and accessmode ne 4 and accessmode ne 5 and applicationid eq null";

  const searchUsers = useCallback(async (query: string): Promise<{ value: string; label: string }[]> => {
    const nameFilter = `(contains(lastname,'${query}') or contains(firstname,'${query}') or contains(fullname,'${query}'))`;
    const scopeFilter = scopeTeamId
      ? `teammembership_association/any(t: t/teamid eq '${scopeTeamId}') and `
      : '';
    const users = await dv.list<UserRow>(ENTITY_SETS.systemUser, {
      $select: ['systemuserid', 'fullname', 'lastname', 'firstname'],
      $filter: `${scopeFilter}${USER_BASE_FILTER} and ${nameFilter}`,
      $orderby: 'lastname asc,firstname asc',
      $top: 50,
    });
    return toOptions(users);
  }, [scopeTeamId]);

  const resolveUserLabel = useCallback(async (id: string): Promise<string> => {
    const u = await dv.get<UserRow>(ENTITY_SETS.systemUser, id, ['systemuserid', 'fullname', 'lastname', 'firstname']);
    return fmtUserName(u);
  }, []);

  // Manager: restricted to primary team membership (small list — loaded upfront)
  const managerOptions = useMemo(() => {
    const members = [...teamMembers];
    if (selectedTeamAdmin && !members.some((m) => m.systemuserid === selectedTeamAdmin.systemuserid)) {
      members.push(selectedTeamAdmin);
      members.sort((a, b) => (a.lastname ?? '').localeCompare(b.lastname ?? ''));
    }
    return toOptions(members);
  }, [teamMembers, selectedTeamAdmin]);
  const programOptions = programs.map((p) => ({ value: p.msdyn_projectprogramid, label: p.msdyn_name }));
  const teamOptions = pmoTeams.map((t) => ({ value: t.teamid, label: t.name }));

  // ── Populate on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setActiveTab('details');
    // Details
    setName(project.msdyn_subject ?? '');
    setDescription(project.msdyn_description ?? '');
    const initStart = project.msdyn_scheduledstart ? project.msdyn_scheduledstart.split('T')[0] : '';
    const initFinish = project.msdyn_finish ? project.msdyn_finish.split('T')[0] : '';
    setStartDate(initStart); setInitStartDate(initStart);
    setFinishDate(initFinish);
    // Governance lookups
    const initPm      = project['_msdyn_projectmanager_value'] ?? '';
    const initSponsor = project['_proj_executivesponsor_value'] ?? '';
    const initMgr     = project['_proj_manager_value'] ?? '';
    const initProg    = project['_msdyn_program_value'] ?? '';
    const initTeam    = project['_pmo_primaryteam_value'] ?? '';
    setPmId(initPm);      setInitPmId(initPm);
    setSponsorId(initSponsor); setInitSponsorId(initSponsor);
    setManagerId(initMgr);  setInitManagerId(initMgr);
    setProgramId(initProg); setInitProgramId(initProg);
    setPrimaryTeamId(initTeam); setInitPrimaryTeamId(initTeam);
    // Health
    setOverallHealth(project.proj_overallhealth   != null ? String(project.proj_overallhealth)   : '');
    setScheduleHealth(project.proj_schedulehealth != null ? String(project.proj_schedulehealth) : '');
    setEffortHealth(project.proj_efforthealth     != null ? String(project.proj_efforthealth)   : '');
    setFinancialHealth(project.proj_financialhealth != null ? String(project.proj_financialhealth) : '');
    setIssueHealth(project.proj_issuehealth       != null ? String(project.proj_issuehealth)    : '');
    // Financials
    setBudget(project.proj_budget?.toString() ?? '');
    setForecast(project.proj_forecast?.toString() ?? '');
    setBenefits(project.proj_benefits?.toString() ?? '');
    setFundingAvailable(project.proj_fundingavailable ?? false);
    // CFR
    setCfrCategory(project.pmo_cfrcategory       != null ? String(project.pmo_cfrcategory)       : '');
    setComplexity(project.pmo_complexity          != null ? String(project.pmo_complexity)         : '');
    setStrategicPriority(project.pmo_strategicpriority != null ? String(project.pmo_strategicpriority) : '');
    // Narrative
    setBusinessCase(project.msdyn_businesscase ?? '');
    setValueStatement(project.msdyn_valuestatement ?? '');
    setComments(project.msdyn_comments ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project.msdyn_projectid]);

  // Clear manager if they're not a member of the newly selected primary team
  useEffect(() => {
    if (!primaryTeamId || !teamMembers.length || !managerId) return;
    if (!teamMembers.some((m) => m.systemuserid === managerId)) setManagerId('');
  }, [primaryTeamId, teamMembers, managerId]);

  // ── Build payload on save ─────────────────────────────────────────────────
  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    const numOrUndef = (s: string) => s.trim() ? Number(s) : undefined;

    // msdyn_scheduledstart and msdyn_finish are excluded — the Project Operations
    // plugin blocks direct PATCH on scheduling-managed fields. Dates are controlled
    // by the scheduling engine via PSS when tasks are modified.
    const payload: ProjectUpdate = {
      msdyn_subject:        name.trim(),
      msdyn_description:    description || undefined,
      msdyn_businesscase:   businessCase || undefined,
      msdyn_valuestatement: valueStatement || undefined,
      msdyn_comments:       comments || undefined,
      proj_budget:          numOrUndef(budget),
      proj_forecast:        numOrUndef(forecast),
      proj_benefits:        numOrUndef(benefits),
      proj_fundingavailable: fundingAvailable,
      pmo_cfrcategory:       numOrNull(cfrCategory),
      pmo_complexity:        numOrNull(complexity),
      pmo_strategicpriority: numOrNull(strategicPriority),
      proj_overallhealth:    numOrNull(overallHealth),
      proj_schedulehealth:   numOrNull(scheduleHealth),
      proj_efforthealth:     numOrNull(effortHealth),
      proj_financialhealth:  numOrNull(financialHealth),
      proj_issuehealth:      numOrNull(issueHealth),
    };

    // Lookup binds — only include if value changed from initial state.
    // Empty string = clear (send null bind); non-empty = set new value.
    if (pmId !== initPmId) {
      payload['msdyn_projectmanager@odata.bind'] = pmId ? `/systemusers(${pmId})` : null;
    }
    if (sponsorId !== initSponsorId) {
      payload['proj_ExecutiveSponsor@odata.bind'] = sponsorId ? `/systemusers(${sponsorId})` : null;
    }
    if (managerId !== initManagerId) {
      payload['proj_Manager@odata.bind'] = managerId ? `/systemusers(${managerId})` : null;
    }
    if (programId !== initProgramId) {
      payload['msdyn_Program@odata.bind'] = programId ? `/msdyn_projectprograms(${programId})` : null;
    }
    if (primaryTeamId !== initPrimaryTeamId) {
      payload['pmo_PrimaryTeam@odata.bind'] = primaryTeamId ? `/teams(${primaryTeamId})` : null;
    }

    // Strip undefined values — the Power Apps SDK may reject or mishandle them
    const clean = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    ) as ProjectUpdate;

    // Start date goes through PSS (finish is computed by the engine and cannot be set)
    const scheduleUpdate: { scheduledStart?: string } = {};
    if (startDate !== initStartDate) scheduleUpdate.scheduledStart = startDate || undefined;

    try {
      await onSave(clean, Object.keys(scheduleUpdate).length ? scheduleUpdate : undefined);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl flex flex-col overflow-hidden" style={{ maxHeight: '88vh' }}>
        <DialogHeader className="shrink-0 pb-0">
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update project details, governance, financials, health indicators, and CFR classification.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden mt-2">
          <TabsList className="shrink-0 bg-muted/30 w-full justify-start rounded-none border-b border-border/60 h-auto p-0 gap-0">
            {(['details', 'governance', 'financials', 'classification'] as const).map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent capitalize px-4 py-2.5 text-sm"
              >
                {t === 'details' ? 'Details' : t === 'governance' ? 'Governance' : t === 'financials' ? 'Financials' : 'Classification'}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── DETAILS TAB ── */}
          <TabsContent value="details" className="flex-1 overflow-y-auto px-1 py-4 space-y-4 mt-0">
            <TabSectionHeader title="Project Details" description="Core identification, description, and schedule dates." />
            <FormRow label="Project Title *">
              <FormInput value={name} onChange={setName} placeholder="Project title" />
            </FormRow>
            <FormRow label="Description">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                placeholder="Brief project description..." />
            </FormRow>
            <div className="grid grid-cols-2 gap-4">
              <FormRow label="Scheduled Start *">
                <FormInput type="date" value={startDate} onChange={setStartDate} />
                {!startDate && <p className="text-[11px] text-destructive">Required — task scheduling needs a project start date.</p>}
              </FormRow>
              <FormRow label="Finish Date">
                <p className="text-sm text-foreground pt-1.5">{finishDate || '—'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Calculated from task dates</p>
              </FormRow>
            </div>
          </TabsContent>

          {/* ── GOVERNANCE TAB ── */}
          <TabsContent value="governance" className="flex-1 overflow-y-auto px-1 py-4 space-y-5 mt-0">
            <TabSectionHeader title="Governance & Health" description="Ownership assignments, program association, and project health indicators." />

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ownership</p>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Project Manager">
                  <SearchableSelect value={pmId} onChange={setPmId} onSearch={searchUsers} resolveLabel={resolveUserLabel} placeholder="— None —" />
                </FormRow>
                <FormRow label="Executive Sponsor">
                  <SearchableSelect value={sponsorId} onChange={setSponsorId} onSearch={searchUsers} resolveLabel={resolveUserLabel} placeholder="— None —" />
                </FormRow>
                <FormRow label="Manager">
                  <SearchableSelect value={managerId} onChange={setManagerId} options={primaryTeamId ? managerOptions : undefined} onSearch={primaryTeamId ? undefined : searchUsers} resolveLabel={resolveUserLabel} placeholder="— None —" />
                </FormRow>
                <FormRow label="Primary Team">
                  <SearchableSelect value={primaryTeamId} onChange={setPrimaryTeamId} options={teamOptions} placeholder="— None —" />
                </FormRow>
                <FormRow label="Program">
                  <SearchableSelect value={programId} onChange={setProgramId} options={programOptions} placeholder="— None —" />
                </FormRow>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 leading-relaxed">
                Selecting "None" for a currently-assigned field will clear that assignment on save.
              </p>
            </div>

            <div className="space-y-4 border-t border-border/60 pt-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Health Indicators</p>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Overall Health">
                  <FormSelect value={overallHealth} onChange={setOverallHealth} options={HEALTH_OPTIONS} placeholder="Not set" />
                </FormRow>
                <FormRow label="Schedule Health">
                  <FormSelect value={scheduleHealth} onChange={setScheduleHealth} options={HEALTH_OPTIONS} placeholder="Not set" />
                </FormRow>
                <FormRow label="Effort Health">
                  <FormSelect value={effortHealth} onChange={setEffortHealth} options={HEALTH_OPTIONS} placeholder="Not set" />
                </FormRow>
                <FormRow label="Financial Health">
                  <FormSelect value={financialHealth} onChange={setFinancialHealth} options={HEALTH_OPTIONS} placeholder="Not set" />
                </FormRow>
                <FormRow label="Issue Health">
                  <FormSelect value={issueHealth} onChange={setIssueHealth} options={HEALTH_OPTIONS} placeholder="Not set" />
                </FormRow>
              </div>
            </div>
          </TabsContent>

          {/* ── FINANCIALS TAB ── */}
          <TabsContent value="financials" className="flex-1 overflow-y-auto px-1 py-4 space-y-4 mt-0">
            <TabSectionHeader title="Financials" description="Budget, forecast, benefit value, and funding status." />
            <div className="grid grid-cols-3 gap-4">
              <FormRow label="Budget ($)">
                <FormInput type="number" value={budget} onChange={setBudget} placeholder="0" />
              </FormRow>
              <FormRow label="Forecast ($)">
                <FormInput type="number" value={forecast} onChange={setForecast} placeholder="0" />
              </FormRow>
              <FormRow label="Benefits ($)">
                <FormInput type="number" value={benefits} onChange={setBenefits} placeholder="0" />
              </FormRow>
            </div>
            <FormRow label="Funding Available">
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="proj-funding-avail"
                  checked={fundingAvailable}
                  onChange={(e) => setFundingAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <label htmlFor="proj-funding-avail" className="text-sm text-foreground">
                  Funding is available for this project
                </label>
              </div>
            </FormRow>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 leading-relaxed">
              Actual Cost, Remaining Budget, Budget Variance, and ROI are computed by the PMO Accelerator and cannot be edited directly.
            </p>
          </TabsContent>

          {/* ── CLASSIFICATION TAB ── */}
          <TabsContent value="classification" className="flex-1 overflow-y-auto px-1 py-4 space-y-5 mt-0">
            <TabSectionHeader title="CFR Classification & Narrative" description="Category, complexity, strategic priority, and supporting narrative." />

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CFR Classification</p>
              <div className="grid grid-cols-3 gap-4">
                <FormRow label="Category">
                  <FormSelect value={cfrCategory} onChange={setCfrCategory} options={CFR_CAT_OPTIONS} />
                </FormRow>
                <FormRow label="Complexity">
                  <FormSelect value={complexity} onChange={setComplexity} options={COMPLEXITY_OPTIONS} />
                </FormRow>
                <FormRow label="Strategic Priority">
                  <FormSelect value={strategicPriority} onChange={setStrategicPriority} options={STRATEGIC_PRI_OPTIONS} />
                </FormRow>
              </div>
            </div>

            <div className="space-y-4 border-t border-border/60 pt-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Narrative</p>
              <FormRow label="Business Case">
                <Textarea value={businessCase} onChange={(e) => setBusinessCase(e.target.value)} rows={5}
                  placeholder="What is the business justification for this project?" />
              </FormRow>
              <FormRow label="Value Statement">
                <Textarea value={valueStatement} onChange={(e) => setValueStatement(e.target.value)} rows={3}
                  placeholder="What value will this project deliver?" />
              </FormRow>
              <FormRow label="Comments">
                <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
                  placeholder="Additional notes or manager comments..." />
              </FormRow>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 border-t border-border/60 pt-4">
          {(error || saveError) && (
            <p className="text-sm text-destructive mr-auto max-w-md truncate" title={error?.message ?? saveError ?? ''}>
              Save failed: {error?.message ?? saveError}
            </p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving || isPending}>Cancel</Button>
          <Button disabled={!name.trim() || !startDate || saving || isPending} onClick={handleSave}>
            {saving || isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline forms for Gate, Decision, Closeout ──────────────────────────────




// ─── Main page ────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pmoTeamField = usePmoTeamField();
  const adminRole = useEffectiveAdminRole();
  const permission = useCanEditProject(id);
  const canEdit = permission.canEdit;
  const rosterPermission = useCanEditProjectRoster(id);
  const canManageRoster = rosterPermission.canEdit;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState<DeleteChildSummary[] | undefined>(undefined);
  const [deleteSummaryLoading, setDeleteSummaryLoading] = useState(false);

  const { data: project, isLoading, error } = useProject(id);
  const { data: orgTeams = [] }             = useProjectTeams(id);
  const { data: members = [] }              = useProjectTeamMembers(id);
  const { data: buckets = [] }              = useProjectBuckets(id);
  const { data: tasks = [] }                = useProjectTasks(id);
  const { data: statusReports = [] }        = useStatusReports(id);
  const { data: risks = [] }                = useProjectRisks(id);
  const { data: issues = [] }               = useProjectIssues(id);
  const { data: changes = [] }              = useProjectChanges(id);
  const plannerUrl = usePlannerUrl(project?.msdyn_projectid);

  // Team management — dialogs moved to CollaborateWorkspace

  const addMutation    = useAddProjectTeam(id!);
  const removeMutation = useRemoveProjectTeam(id!);

  // Resource management — dialogs moved to PlanWorkspace
  const { data: bookableResources = [] } = useBookableResources();
  const addMemberMutation    = useAddProjectTeamMember(id!);
  const removeMemberMutation = useRemoveProjectTeamMember(id!);

  // Resource assignment (task-level)
  const { data: assignments = [] } = useResourceAssignments(id);
  const assignMutation   = useAssignResource(id!);
  const unassignMutation = useUnassignResource(id!);

  // Risk CRUD state
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null);
  const [deleteRiskTarget, setDeleteRiskTarget] = useState<ProjectRisk | null>(null);
  const createRiskMutation = useCreateProjectRisk(id!);
  const updateRiskMutation = useUpdateProjectRisk(id!);
  const deleteRiskMutation = useDeleteProjectRisk(id!);

  // Issue CRUD state
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<ProjectIssue | null>(null);
  const [deleteIssueTarget, setDeleteIssueTarget] = useState<ProjectIssue | null>(null);
  const createIssueMutation = useCreateProjectIssue(id!);
  const updateIssueMutation = useUpdateProjectIssue(id!);
  const deleteIssueMutation = useDeleteProjectIssue(id!);

  // Change CRUD state
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [editingChange, setEditingChange] = useState<ProjectChange | null>(null);
  const [deleteChangeTarget, setDeleteChangeTarget] = useState<ProjectChange | null>(null);
  const createChangeMutation = useCreateProjectChange(id!);
  const updateChangeMutation = useUpdateProjectChange(id!);
  const deleteChangeMutation = useDeleteProjectChange(id!);

  // Status report CRUD state
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusReport | null>(null);
  const [deleteStatusTarget, setDeleteStatusTarget] = useState<StatusReport | null>(null);
  const createStatusMutation = useCreateStatusReport(id!);
  const updateStatusMutation = useUpdateStatusReport(id!);
  const deleteStatusMutation = useDeleteStatusReport(id!);

  // Resolve lookup display names — the Power Apps SDK does not return @OData.Community.Display.V1.FormattedValue
  const primaryTeamGuid = project?.['_pmo_primaryteam_value'] as string | undefined;
  const pmGuid          = project?.['_msdyn_projectmanager_value'] as string | undefined;
  const sponsorGuid     = project?.['_proj_executivesponsor_value'] as string | undefined;
  const managerGuid     = project?.['_proj_manager_value'] as string | undefined;
  const programGuid     = project?.['_msdyn_program_value'] as string | undefined;

  const { data: primaryTeamName } = useQuery({
    queryKey: ['team', 'name', primaryTeamGuid],
    queryFn: () => dv.get<{ name: string }>(ENTITY_SETS.team, primaryTeamGuid!, ['name']),
    enabled: !!primaryTeamGuid,
    staleTime: 10 * 60 * 1000,
    select: (d) => d.name,
  });
  const { data: pmName } = useQuery({
    queryKey: ['systemUser', 'name', pmGuid],
    queryFn: () => dv.get<{ fullname: string }>('systemusers', pmGuid!, ['fullname']),
    enabled: !!pmGuid,
    staleTime: 10 * 60 * 1000,
    select: (d) => d.fullname,
  });
  const { data: sponsorName } = useQuery({
    queryKey: ['systemUser', 'name', sponsorGuid],
    queryFn: () => dv.get<{ fullname: string }>('systemusers', sponsorGuid!, ['fullname']),
    enabled: !!sponsorGuid,
    staleTime: 10 * 60 * 1000,
    select: (d) => d.fullname,
  });
  const { data: managerName } = useQuery({
    queryKey: ['systemUser', 'name', managerGuid],
    queryFn: () => dv.get<{ fullname: string }>('systemusers', managerGuid!, ['fullname']),
    enabled: !!managerGuid,
    staleTime: 10 * 60 * 1000,
    select: (d) => d.fullname,
  });
  const { data: programName } = useQuery({
    queryKey: ['program', 'name', programGuid],
    queryFn: () => dv.get<{ msdyn_name: string }>(ENTITY_SETS.program, programGuid!, ['msdyn_name']),
    enabled: !!programGuid,
    staleTime: 10 * 60 * 1000,
    select: (d) => d.msdyn_name,
  });

  // Project edit state
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const updateProjectMutation = useUpdateProject(id!);
  const auditChange = useChangeAudit();

  // Task scheduling mutations (Phase 1)
  const createTaskMutation = useCreateProjectTask(id!);
  const updateTaskMutation = useUpdateProjectTask(id!);
  const deleteTaskMutation = useDeleteProjectTask(id!);
  const { data: dependencies = [] } = useProjectTaskDependencies(id);
  const createDependencyMutation = useCreateProjectTaskDependency(id!);
  const deleteDependencyMutation = useDeleteProjectTaskDependency(id!);
  const queryClient = useQueryClient();

  async function handleOpenDeleteDialog() {
    if (!id) return;
    setDeleteSummary(undefined);
    setDeleteSummaryLoading(true);
    setDeleteDialogOpen(true);
    try {
      const s = await summarizeProjectDelete(id);
      setDeleteSummary(s);
    } finally {
      setDeleteSummaryLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!id) return;
    const projectName = project?.msdyn_subject ?? 'Project';
    await cascadeDeleteProject(id);
    // No parentProjectId/Name here on purpose. The project we'd bind to
    // was just deleted; including pmo_Project@odata.bind would cause
    // Dataverse to reject the audit-row write for a dangling lookup,
    // and useChangeAudit would silently swallow the error. The deleted
    // GUID is still preserved as entityId for traceability.
    auditChange({
      entityType: 'project',
      entityId: id,
      entityName: projectName,
      action: 'delete',
    });
    toast.success('Project deleted');
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    // Cascade also removes the originating intake request; refresh the intake queue.
    await queryClient.invalidateQueries({ queryKey: ['projectRequests'] });
    await queryClient.invalidateQueries({ queryKey: ['pendingApprovals'] });
    navigate('/projects');
  }

  async function handleCreateTask(params: ScheduleTaskCreate) {
    const created = await createTaskMutation.mutateAsync(params);
    // Wave 1 audit — task create. PSS returns the new task object; fall back
    // to the user-typed subject if the response shape lacks an id (defensive).
    const newId = (created as unknown as { msdyn_projecttaskid?: string } | undefined)?.msdyn_projecttaskid;
    auditChange({
      entityType: 'task',
      entityId: newId ?? 'pending-' + Date.now(),
      entityName: params.subject,
      action: 'create',
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  async function handleUpdateTask(
    taskId: string,
    subject?: string,
    progress?: number,
    scheduledStart?: string,
    scheduledEnd?: string,
    isMilestone?: boolean,
    effortCompleted?: number,
  ) {
    await updateTaskMutation.mutateAsync({ taskId, subject, progress, scheduledStart, scheduledEnd, isMilestone, effortCompleted });
  }

  // Translate a ScheduleTaskUpdate (domain keys) into a Dataverse-key after
  // record so diffEntityUpdate can compare it to the server task. Shared
  // between the auto-audit path (drag-drop, programmatic updates) and the
  // panel's batched audit emitter.
  function buildTaskFieldChanges(
    taskId: string,
    params: Parameters<typeof updateTaskMutation.mutateAsync>[0],
  ): ChangeAuditFieldDiff[] {
    const before = tasks.find((t) => t.msdyn_projecttaskid === taskId);
    if (!before) return [];
    const after: Record<string, unknown> = {};
    if (params.subject !== undefined)         after.msdyn_subject = params.subject;
    if (params.description !== undefined)     after.msdyn_description = params.description;
    if (params.scheduledStart !== undefined)  after.msdyn_scheduledstart = params.scheduledStart;
    if (params.scheduledEnd !== undefined)    after.msdyn_scheduledend = params.scheduledEnd;
    if (params.duration !== undefined)        after.msdyn_duration = params.duration;
    if (params.effort !== undefined)          after.msdyn_effort = params.effort;
    if (params.effortCompleted !== undefined) after.msdyn_effortcompleted = params.effortCompleted;
    if (params.priority !== undefined)        after.msdyn_priority = params.priority;
    if (params.isMilestone !== undefined)     after.msdyn_ismilestone = params.isMilestone;
    if (params.bucketId !== undefined)        after.msdyn_projectbucket = params.bucketId;
    return diffEntityUpdate(before as unknown as Record<string, unknown>, after, TASK_FIELD_LABELS);
  }

  // Auto-audit path — used by drag-drop bucket move and any other
  // programmatic mutator that doesn't call auditChange itself. The panel
  // uses handleUpdateTaskFullNoAudit + emits its own batched row instead.
  async function handleUpdateTaskFull(params: Parameters<typeof updateTaskMutation.mutateAsync>[0]) {
    const before = tasks.find((t) => t.msdyn_projecttaskid === params.taskId);
    const changes = buildTaskFieldChanges(params.taskId, params);
    await updateTaskMutation.mutateAsync(params);
    if (!before || changes.length === 0) return;
    auditChange({
      entityType: 'task',
      entityId: params.taskId,
      entityName: before.msdyn_subject,
      action: 'update',
      changes,
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  // Panel's mutator — same shape as handleUpdateTaskFull but skips the
  // auto-audit. The panel emits ONE batched audit row at the end of its
  // Submit covering field changes + label/assignee/checklist drafts.
  async function handleUpdateTaskFullNoAudit(params: Parameters<typeof updateTaskMutation.mutateAsync>[0]) {
    await updateTaskMutation.mutateAsync(params);
  }

  async function handleDeleteTask(taskId: string, _hasChildren: boolean) {
    const before = tasks.find((t) => t.msdyn_projecttaskid === taskId);
    await deleteTaskMutation.mutateAsync(taskId);
    auditChange({
      entityType: 'task',
      entityId: taskId,
      entityName: before?.msdyn_subject ?? '(deleted task)',
      action: 'delete',
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  async function handleCreateDependency(successorTaskId: string, predecessorTaskId: string, linkType?: number) {
    await createDependencyMutation.mutateAsync({ successorTaskId, predecessorTaskId, linkType });
    const succName = tasks.find((t) => t.msdyn_projecttaskid === successorTaskId)?.msdyn_subject ?? 'Task';
    const predName = tasks.find((t) => t.msdyn_projecttaskid === predecessorTaskId)?.msdyn_subject ?? 'Task';
    auditChange({
      entityType: 'task',
      entityId: successorTaskId,
      entityName: succName,
      action: 'update',
      changes: [{ kind: 'relationship', relation: 'dependency', action: 'add', label: `depends on ${predName}` }],
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  async function handleDeleteDependency(dependencyId: string) {
    const dep = dependencies.find((d) => d.msdyn_projecttaskdependencyid === dependencyId);
    const succId = dep?.['_msdyn_successortask_value'];
    const predId = dep?.['_msdyn_predecessortask_value'];
    const succName = succId ? tasks.find((t) => t.msdyn_projecttaskid === succId)?.msdyn_subject ?? 'Task' : 'Task';
    const predName = predId ? tasks.find((t) => t.msdyn_projecttaskid === predId)?.msdyn_subject ?? 'Task' : 'Task';
    await deleteDependencyMutation.mutateAsync(dependencyId);
    if (!succId) return;
    auditChange({
      entityType: 'task',
      entityId: succId,
      entityName: succName,
      action: 'update',
      changes: [{ kind: 'relationship', relation: 'dependency', action: 'remove', label: `no longer depends on ${predName}` }],
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  function handleTasksInvalidate() {
    queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
  }

  async function handleAssign(taskId: string, teamMemberId: string) {
    const memberName = taskTeamMembers.find((m) => m.id === teamMemberId)?.name ?? 'Resource';
    const taskSubject = tasks.find((t) => t.msdyn_projecttaskid === taskId)?.msdyn_subject ?? 'Task';
    await assignMutation.mutateAsync({ taskId, teamMemberId, name: `${memberName} : ${taskSubject}` });
    auditChange({
      entityType: 'task',
      entityId: taskId,
      entityName: taskSubject,
      action: 'update',
      changes: [{ kind: 'relationship', relation: 'assignee', action: 'add', label: memberName }],
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  async function handleUnassign(_taskId: string, assignmentId: string) {
    // Look up name + task name BEFORE the mutation invalidates the cache.
    const assignment = assignments.find((a) => a.msdyn_resourceassignmentid === assignmentId);
    const taskId = assignment?.['_msdyn_taskid_value'] ?? undefined;
    const taskName = taskId ? tasks.find((t) => t.msdyn_projecttaskid === taskId)?.msdyn_subject ?? 'Task' : 'Task';
    // msdyn_name on the junction is "<resource> : <task>" — strip the suffix.
    const fullName = assignment?.msdyn_name ?? '';
    const memberName = (fullName.split(' : ')[0] || fullName) || 'team member';
    await unassignMutation.mutateAsync(assignmentId);
    if (!taskId) return;
    auditChange({
      entityType: 'task',
      entityId: taskId,
      entityName: taskName,
      action: 'update',
      changes: [{ kind: 'relationship', relation: 'assignee', action: 'remove', label: memberName }],
      parentProjectId: id!,
      parentProjectName: project?.msdyn_subject,
    });
  }

  // Add/remove member handlers moved to PlanWorkspace

  // Active tab — synced to URL search params for in-session state persistence
  const [activeTab, setActiveTab] = useUrlState('tab', 'overview', PROJECT_TABS);

  // Feature toggles for the project detail tabs. Hidden tabs neither render their
  // trigger nor their content; cross-tab links from Overview are also gated below.
  const ftAll = useFeatureToggles();
  const tabEnabled = {
    overview:    ftAll['projectTab.overview']    !== false,
    plan:        ftAll['projectTab.plan']        !== false,
    tasks:       ftAll['projectTab.tasks']       !== false,
    monitor:     ftAll['projectTab.monitor']     !== false,
    govern:      ftAll['projectTab.govern']      !== false,
    collaborate: ftAll['projectTab.collaborate'] !== false,
    status:      ftAll['projectTab.status']      !== false,
    notes:       ftAll['projectTab.notes']       !== false,
    activity:    ftAll['projectTab.activity']    !== false,
  } as const;
  // Fall back active tab to the first enabled one if the URL/state points at a hidden tab.
  const visibleActiveTab = tabEnabled[activeTab as keyof typeof tabEnabled]
    ? activeTab
    : (Object.entries(tabEnabled).find(([, on]) => on)?.[0] ?? activeTab);
  const [monitorSubTab] = useUrlState('subtab', 'risks', MONITOR_SUB_TABS);
  const [, setSearchParams] = useSearchParams();
  function navigateToMonitor(subTab: MonitorSubTab) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'monitor');
      next.set('subtab', subTab);
      return next;
    }, { replace: true });
  }
  // Task workspace state — lifted to URL for deep linking
  const [activeView, setActiveView] = useUrlState<TaskView>('view', 'board', TASK_VIEWS);
  const [urlTaskId, setUrlTaskId] = useUrlState<string>('task', '');
  const selectedTaskId = urlTaskId || null;
  const handleSelectTask = useCallback((taskId: string | null) => {
    setUrlTaskId(taskId ?? '', { replace: false });
  }, [setUrlTaskId]);

  const [alertsExpanded, setAlertsExpanded] = useState(false);

  // Lifecycle workspace hooks (data for tab badges; full CRUD inside workspace components)
  const { data: decisions = [] } = useProjectDecisions(id);

  const { data: allTeams = [] } = useQuery({
    queryKey: ['systemTeams', 'forAdd', pmoTeamField],
    queryFn: async () => {
      const all = await fetchPmoTeams<Record<string, unknown>>(pmoTeamField, ['teamid', 'name']);
      return all.map((t) => ({ teamid: t['teamid'] as string, name: t['name'] as string }));
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });

  const primaryTeam       = orgTeams.find((t) => t.pmo_role === TEAM_ROLE.Primary);
  const contributingTeams = orgTeams.filter((t) => t.pmo_role === TEAM_ROLE.Contributing);
  const assignedTeamIds   = new Set(orgTeams.map((t) => t['_pmo_team_value']));
  const availableTeams    = allTeams.filter((t) => !assignedTeamIds.has(t.teamid));

  const assignedResourceIds = new Set<string>(members.map((m) => m['_msdyn_bookableresourceid_value']).filter((v): v is string => !!v));
  // filteredResources moved to PlanWorkspace

  // ── Task-level team member list for assignment picker ─────────────────────────
  const taskTeamMembers = useMemo(() =>
    members.map((m) => ({
      id: m.msdyn_projectteamid,
      name: m['_msdyn_bookableresourceid_value@OData.Community.Display.V1.FormattedValue'] ?? m.msdyn_name ?? '?',
    })),
  [members]);

  // ── Schedule quality metrics (derived from tasks already in state) ──────────
  const schedQuality = useMemo(() => {
    const now = new Date();
    const leaf = tasks.filter(
      (t) => !t.msdyn_summary && !t.msdyn_projecttaskid.startsWith('optimistic-') && (t.msdyn_outlinelevel ?? 1) > 0,
    );
    const withDates = leaf.filter(
      (t) => t.msdyn_scheduledstart && (t.msdyn_scheduledend ?? t.msdyn_finish),
    );
    const overdueList = leaf.filter((t) => {
      const p = t.msdyn_progress ?? 0;
      const pct = p > 0 && p <= 1 ? p * 100 : p;
      const done = t.statecode === 1 || pct >= 100;
      const due = t.msdyn_scheduledend ?? t.msdyn_finish;
      return !done && !!due && new Date(due) < now;
    });
    const milestoneCount = tasks.filter((t) => t.msdyn_ismilestone).length;
    const hasWBS = tasks.some((t) => t.msdyn_summary && (t.msdyn_outlinelevel ?? 0) > 0);
    const datePct = leaf.length > 0 ? (withDates.length / leaf.length) * 100 : null;

    let status: 'none' | 'healthy' | 'fair' | 'attention' = 'none';
    if (leaf.length > 0) {
      if ((datePct ?? 0) >= 80 && overdueList.length === 0) status = 'healthy';
      else if ((datePct ?? 0) >= 50) status = 'fair';
      else status = 'attention';
    }
    return { leafCount: leaf.length, withDatesCount: withDates.length, overdueCount: overdueList.length, milestoneCount, hasWBS, datePct, status };
  }, [tasks]);

  // msdyn_progress is stored as decimal 0–1 in Dataverse; normalize to 0–100 for display.
  const normPct = (raw: number | null | undefined): number => {
    if (raw === null || raw === undefined) return 0;
    return raw > 0 && raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
  };
  const projectPct = normPct(project?.msdyn_progress);

  // Derived values
  // completedTasks / taskPct removed — identity card stats bar moved to Overview Quick Stats
  const overdue = !!(project?.msdyn_finish && new Date(project.msdyn_finish) < new Date() && projectPct < 100);
  const latestStatus = statusReports[0];
  const hasRecentStatus = latestStatus
    ? (Date.now() - new Date(latestStatus.proj_reportingdate ?? latestStatus.createdon ?? '').getTime()) < 30 * 24 * 60 * 60 * 1000
    : false;

  // Attention alerts
  const alerts: Array<{ icon: React.ElementType; message: string; level: 'warning' | 'error' | 'info'; action?: { label: string; onClick: () => void } }> = [];
  if (project && !project['_msdyn_projectmanager_value'])
    alerts.push({ icon: CircleAlert, message: 'No Project Manager assigned.', level: 'warning', action: canEdit ? { label: 'Edit Project', onClick: () => setEditProjectOpen(true) } : undefined });
  if (project && !project['_pmo_primaryteam_value'])
    alerts.push({ icon: Users, message: 'No Primary Team assigned. Every project needs an accountable team.', level: 'warning', action: canEdit ? { label: 'Assign Team', onClick: () => setEditProjectOpen(true) } : undefined });
  if (project && !project['_msdyn_program_value'])
    alerts.push({ icon: Layers, message: 'Not assigned to a Program. Active projects should belong to a program for portfolio visibility.', level: 'info', action: canEdit ? { label: 'Edit Project', onClick: () => setEditProjectOpen(true) } : undefined });
  if (overdue)
    alerts.push({ icon: AlertTriangle, message: `Finish date was ${fmtDate(project?.msdyn_finish)} and progress is ${projectPct}% — project may be overdue.`, level: 'error' });
  if (project?.statecode === 0 && statusReports.length === 0)
    alerts.push({ icon: FileText, message: 'No status reports submitted. Weekly updates keep stakeholders informed.', level: 'info', action: canEdit ? { label: 'Submit Report', onClick: () => { setEditingStatus(null); setStatusDialogOpen(true); } } : undefined });
  else if (project?.statecode === 0 && statusReports.length > 0 && !hasRecentStatus)
    alerts.push({ icon: Clock, message: 'Last status report was more than 30 days ago.', level: 'warning', action: canEdit ? { label: 'Submit Report', onClick: () => { setEditingStatus(null); setStatusDialogOpen(true); } } : undefined });

  if (isLoading) return <LoadingOverlay isLoading label="Loading project..." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={project?.msdyn_subject ?? 'Project Detail'}
        showBack
        onBack={() => navigate('/projects')}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={() => setEditProjectOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit Project
              </Button>
            )}
            {(adminRole === 'pmo_admin' || adminRole === 'system_admin') && (
              <Button size="sm" variant="destructive" onClick={handleOpenDeleteDialog}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled
              title="Coming soon"
              className="opacity-50 cursor-not-allowed"
            >
              <Target className="h-3.5 w-3.5 mr-1.5" />
              Capture Baseline
            </Button>
            {plannerUrl && (
              <Button size="sm" asChild>
                <a href={plannerUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open Board
                </a>
              </Button>
            )}
            {isDeepLinkAvailable() && (
              <Button size="sm" variant="outline" onClick={() => {
                const link = buildDeepLink({
                  page: 'projects',
                  id: id!,
                  tab: activeTab !== 'overview' ? activeTab : undefined,
                  subtab: activeTab === 'monitor' && monitorSubTab !== 'risks' ? monitorSubTab : undefined,
                  task: selectedTaskId ?? undefined,
                  view: activeView !== 'board' ? activeView : undefined,
                });
                if (link) {
                  navigator.clipboard.writeText(link);
                  toast.success('Link copied');
                }
              }}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" />Copy Link
              </Button>
            )}
          </div>
        }
      />

      <ErrorBanner error={error as Error | null} />

      {!permission.loading && !permission.canEdit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 dark:bg-amber-900/20 dark:border-amber-800">
          <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Read-only access</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              {permission.reason === 'no_primary_team'
                ? 'This project has no Primary Team assigned. An admin must assign one before edits are possible.'
                : "You aren't assigned to this project. Ask the Primary Team to add your team in the Collaborate tab."}
            </p>
          </div>
        </div>
      )}

      {project && (
        <>
          {/* ── Project identity card ── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <HealthBadge value={project.proj_overallhealth} />
                    {project['proj_stage@OData.Community.Display.V1.FormattedValue'] && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary ring-1 ring-primary/20">
                        {project['proj_stage@OData.Community.Display.V1.FormattedValue']}
                      </span>
                    )}
                    {project['proj_priority@OData.Community.Display.V1.FormattedValue'] && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-border">
                        {project['proj_priority@OData.Community.Display.V1.FormattedValue']} Priority
                      </span>
                    )}
                    {project['pmo_complexity@OData.Community.Display.V1.FormattedValue'] && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-border">
                        {project['pmo_complexity@OData.Community.Display.V1.FormattedValue']} Complexity
                      </span>
                    )}
                  </div>
                  {/* Meta pills */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                    {pmName && (
                      <MetaPill icon={User}>{pmName}</MetaPill>
                    )}
                    {primaryTeamName && (
                      <MetaPill icon={Users}>{primaryTeamName}</MetaPill>
                    )}
                    {programName && (
                      <button
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                        onClick={() => project._msdyn_program_value && navigate(`/programs/${project._msdyn_program_value}`)}
                      >
                        <Layers className="h-3.5 w-3.5 shrink-0" />
                        {programName}
                      </button>
                    )}
                    {(project.msdyn_scheduledstart || project.msdyn_finish) && (
                      <MetaPill icon={Calendar}>
                        {fmtDate(project.msdyn_scheduledstart)} – {fmtDate(project.msdyn_finish)}
                      </MetaPill>
                    )}
                  </div>
                </div>

                {/* Completion */}
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <p className="text-3xl font-bold text-foreground tabular-nums leading-none">
                    {projectPct}%
                  </p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                    <div
                      className={cn('h-full rounded-full', projectPct >= 80 ? 'bg-emerald-500' : projectPct >= 40 ? 'bg-primary' : 'bg-amber-500')}
                      style={{ width: `${projectPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CFR Classification pills */}
            {(project['pmo_cfrcategory@OData.Community.Display.V1.FormattedValue'] || project['pmo_strategicpriority@OData.Community.Display.V1.FormattedValue']) && (
              <div className="border-t border-border bg-muted/20 px-6 py-2.5 flex flex-wrap gap-2">
                {project['pmo_cfrcategory@OData.Community.Display.V1.FormattedValue'] && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-border">
                    {project['pmo_cfrcategory@OData.Community.Display.V1.FormattedValue']}
                  </span>
                )}
                {project['pmo_strategicpriority@OData.Community.Display.V1.FormattedValue'] && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-border">
                    {project['pmo_strategicpriority@OData.Community.Display.V1.FormattedValue']}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── 7-Tab Navigation ── */}
          <Tabs value={visibleActiveTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <div className="overflow-x-auto">
              <TabsList className="bg-muted/30 flex w-max min-w-full">
                {tabEnabled.overview && <TabsTrigger value="overview">Overview</TabsTrigger>}
                {tabEnabled.plan && <TabsTrigger value="plan">Plan</TabsTrigger>}
                {tabEnabled.tasks && (
                  <TabsTrigger value="tasks">
                    Tasks {tasks.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({tasks.length})</span>}
                  </TabsTrigger>
                )}
                {tabEnabled.monitor && (
                  <TabsTrigger value="monitor">
                    Monitor <span className="ml-1 text-[10px] text-muted-foreground">({risks.length + issues.length + changes.length + decisions.length})</span>
                  </TabsTrigger>
                )}
                {tabEnabled.govern && <TabsTrigger value="govern">Govern</TabsTrigger>}
                {tabEnabled.collaborate && <TabsTrigger value="collaborate">Collaborate</TabsTrigger>}
                {tabEnabled.status && (
                  <TabsTrigger value="status">
                    Status {statusReports.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({statusReports.length})</span>}
                  </TabsTrigger>
                )}
                {tabEnabled.notes && <TabsTrigger value="notes">Notes</TabsTrigger>}
                {tabEnabled.activity && <TabsTrigger value="activity">Activity</TabsTrigger>}
              </TabsList>
            </div>

            {/* ── OVERVIEW (Command Center) ── */}
            <TabsContent value="overview" className="mt-6 space-y-5">
              {/* Alert Bar */}
              {alerts.length > 0 && (
                <div className="space-y-2">
                  {alerts.slice(0, alertsExpanded ? alerts.length : 1).map((a, i) => (
                    <AlertRow key={i} icon={a.icon} message={a.message} level={a.level} action={a.action} />
                  ))}
                  {alerts.length > 1 && !alertsExpanded && (
                    <button onClick={() => setAlertsExpanded(true)} className="text-xs text-primary hover:underline ml-1">
                      +{alerts.length - 1} more alert{alerts.length > 2 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}


              <div className="grid grid-cols-12 gap-5">
                {/* LEFT COLUMN (7/12) */}
                <div className="col-span-12 lg:col-span-7 space-y-5">
                  {/* About */}
                  <div>
                    <SectionLabel className="mb-2">Description</SectionLabel>
                    {project.msdyn_description ? (
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed line-clamp-4">{project.msdyn_description}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No description &mdash; use Edit Project to add one.</p>
                    )}
                  </div>

                  {/* Latest Update */}
                  {latestStatus ? (
                    <div className="rounded-xl border-l-2 border-l-primary border border-border bg-card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <SectionLabel>Latest Update</SectionLabel>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtDate(latestStatus.proj_reportingdate ?? latestStatus.createdon)}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-foreground mb-2">{latestStatus.msdyn_name}</p>
                      {latestStatus.msdyn_accomplishedactivities && (
                        <p className="text-sm text-foreground/90 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                          {latestStatus.msdyn_accomplishedactivities}
                        </p>
                      )}
                      {tabEnabled.status && (
                        <button
                          onClick={() => setActiveTab('status')}
                          className="text-xs text-primary hover:underline underline-offset-2 mt-3"
                        >
                          View all reports &rarr;
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card p-5">
                      <SectionLabel className="mb-2">Latest Update</SectionLabel>
                      <p className="text-sm text-muted-foreground mb-2">No status reports submitted.</p>
                      {canEdit && (
                        <Button size="sm" variant="secondary" onClick={() => { setEditingStatus(null); setStatusDialogOpen(true); }}>
                          Submit Report
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Schedule */}
                  <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <SectionLabel className="mb-0">Schedule</SectionLabel>
                      {schedQuality.leafCount > 0 && (
                        <span className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                          schedQuality.status === 'healthy' && 'bg-emerald-100 text-emerald-700',
                          schedQuality.status === 'fair' && 'bg-amber-100 text-amber-700',
                          schedQuality.status === 'attention' && 'bg-rose-100 text-rose-700',
                        )}>
                          {schedQuality.status === 'healthy' ? 'Healthy' : schedQuality.status === 'fair' ? 'Fair' : 'Needs Attention'}
                        </span>
                      )}
                    </div>
                    <ProgressBar value={projectPct} />
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <ReadOnlyField label="Start Date" value={fmtDate(project.msdyn_scheduledstart)} />
                      <ReadOnlyField label="Finish Date" value={fmtDate(project.msdyn_finish)} />
                      <ReadOnlyField label="Duration (Days)" value={fmtNumber(project.msdyn_duration)} />
                      <ReadOnlyField label="Schedule Mode" value={project['msdyn_schedulemode@OData.Community.Display.V1.FormattedValue']} />
                    </div>
                    {(project.msdyn_effort != null || project.msdyn_effortcompleted != null) && (
                      <>
                        <div className="h-px bg-border/60 my-4" />
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Total Effort</p>
                            <p className="text-sm font-semibold text-foreground">{fmtNumber(project.msdyn_effort, 0)}h</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Completed</p>
                            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtNumber(project.msdyn_effortcompleted, 0)}h</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Remaining</p>
                            <p className="text-sm font-semibold text-foreground">{fmtNumber(project.msdyn_effortremaining, 0)}h</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Business Case excerpt (conditional) */}
                  {project.msdyn_businesscase && (
                    <div>
                      <SectionLabel className="mb-2">Business Case</SectionLabel>
                      <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2 whitespace-pre-wrap">{project.msdyn_businesscase}</p>
                      {tabEnabled.plan && (
                        <button
                          onClick={() => setActiveTab('plan')}
                          className="text-xs text-primary hover:underline underline-offset-2 mt-1"
                        >
                          View full business case &rarr;
                        </button>
                      )}
                    </div>
                  )}

                  {/* Financials (conditional) */}
                  {project.proj_budget != null && (
                    <div className="rounded-xl border border-border bg-card p-5">
                      <SectionLabel className="mb-3">Financials</SectionLabel>
                      <div>
                        {([
                          { label: 'Budget', value: project.proj_budget, variance: false },
                          { label: 'Actual', value: project.proj_actualcost, variance: false },
                          { label: 'Variance', value: project.proj_budgetvariance, variance: true },
                        ] as { label: string; value?: number; variance: boolean }[]).map(({ label, value, variance }) => (
                          <div key={label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                            <span className="text-xs text-muted-foreground">{label}</span>
                            <span className={cn(
                              'text-sm font-semibold tabular-nums',
                              variance && value != null ? (value < 0 ? 'text-rose-500' : 'text-emerald-500') : 'text-foreground'
                            )}>
                              {fmtCurrency(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <BudgetBar budget={project.proj_budget} actual={project.proj_actualcost} />
                      {project.proj_roi != null && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">ROI</span>
                          <span className={cn('text-xs font-semibold', project.proj_roi >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                            {project.proj_roi.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setEditProjectOpen(true)}
                          className="text-xs text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" />Edit financials
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN (5/12) */}
                <div className="col-span-12 lg:col-span-5 space-y-5">
                  {/* Health */}
                  <div className="rounded-xl border border-border bg-card p-5">
                    <SectionLabel className="mb-3">Health</SectionLabel>
                    <div className="space-y-0.5">
                      {[
                        { label: 'Overall',   value: project.proj_overallhealth },
                        { label: 'Schedule',  value: project.proj_schedulehealth },
                        { label: 'Effort',    value: project.proj_efforthealth },
                        { label: 'Financial', value: project.proj_financialhealth },
                        { label: 'Issues',    value: project.proj_issuehealth },
                      ].map((h) => (
                        <div key={h.label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                          <span className="text-xs text-muted-foreground">{h.label}</span>
                          {h.value != null ? (
                            <HealthBadge value={h.value} size="sm" />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not set</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key People */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel className="mb-0">Key People</SectionLabel>
                      {canEdit && (<button onClick={() => setEditProjectOpen(true)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <Pencil className="h-3 w-3" />Edit
                      </button>)}
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: 'Project Manager', name: pmName },
                        { label: 'Executive Sponsor', name: sponsorName },
                        { label: 'Manager', name: managerName },
                      ].map((p) => (
                        <div key={p.label} className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground w-28 shrink-0">{p.label}</span>
                          <span className={cn('text-sm', p.name ? 'text-foreground' : 'text-muted-foreground')}>
                            {p.name ?? 'Not assigned'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Stats — cards deep-link into Monitor; hide entire block if Monitor is off */}
                  {tabEnabled.monitor && (
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <StatCell
                          label="Active Risks"
                          value={risks.length}
                          accent={risks.length > 0 ? 'rose' : undefined}
                          onClick={() => navigateToMonitor('risks')}
                        />
                        <StatCell
                          label="Open Issues"
                          value={issues.length}
                          accent={issues.length > 0 ? 'amber' : undefined}
                          onClick={() => navigateToMonitor('issues')}
                        />
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
                        <StatCell
                          label="Pending Changes"
                          value={changes.length}
                          accent={changes.length > 0 ? 'blue' : undefined}
                          onClick={() => navigateToMonitor('changes')}
                        />
                        <StatCell
                          label="Open Decisions"
                          value={decisions.length}
                          onClick={() => navigateToMonitor('decisions')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* OLD TABS REMOVED — content moved to workspace components */}
            {/* Business Case → Plan workspace, Financials → Overview, Resources → Plan workspace */}
            {/* Risks/Issues/Changes/Decisions → Monitor workspace */}
            {/* Initiation/Gates/Closeout → Govern workspace */}
            {/* Documents → Plan workspace, Meetings → Collaborate workspace */}

            {/* ── PLAN ── */}
            <TabsContent value="plan" className="mt-6">
              <PlanWorkspace
                projectId={id!}
                projectName={project.msdyn_subject}
                project={project}
                members={members}
                bookableResources={bookableResources}
                assignedResourceIds={assignedResourceIds}
                onAddMember={async (resourceId) => { await addMemberMutation.mutateAsync(resourceId); }}
                onRemoveMember={async (teamMemberId) => { await removeMemberMutation.mutateAsync(teamMemberId); }}
                addMemberPending={addMemberMutation.isPending}
                canEdit={canEdit}
              />
            </TabsContent>

            {/* ── TASKS ── */}
            <TabsContent value="tasks" className="mt-6">
              <TaskWorkspace
                projectId={id!}
                tasks={tasks}
                buckets={buckets}
                dependencies={dependencies}
                assignments={assignments.map((a) => {
                  const tmId = a['_msdyn_projectteamid_value'] ?? '';
                  const member = members.find((m) => m.msdyn_projectteamid === tmId);
                  const personName = member
                    ? (member['_msdyn_bookableresourceid_value@OData.Community.Display.V1.FormattedValue'] ?? member.msdyn_name ?? '?')
                    : (a.msdyn_name ?? '?');
                  return {
                    assignmentId: a.msdyn_resourceassignmentid,
                    taskId: a['_msdyn_taskid_value'] ?? '',
                    teamMemberId: tmId,
                    name: personName,
                  };
                })}
                teamMembers={taskTeamMembers}
                onCreateTask={handleCreateTask}
                onUpdateTask={handleUpdateTask}
                onUpdateTaskFull={handleUpdateTaskFull}
                onUpdateTaskFullNoAudit={handleUpdateTaskFullNoAudit}
                onAuditTaskBatch={(taskId, taskName, entries) => {
                  // Wave 1 batched audit — the panel hands us a single
                  // entries[] covering BOTH field changes and label /
                  // assignee / checklist relationship changes. The panel
                  // routes its field mutation through the no-audit mutator
                  // above, so this is the only audit row written for the
                  // entire Submit. Result: one row per Submit, even when
                  // the user changed 5 fields + added 2 labels.
                  auditChange({
                    entityType: 'task',
                    entityId: taskId,
                    entityName: taskName,
                    action: 'update',
                    changes: entries,
                    parentProjectId: id!,
                    parentProjectName: project?.msdyn_subject,
                  });
                }}
                onDeleteTask={handleDeleteTask}
                onCreateDependency={handleCreateDependency}
                onDeleteDependency={handleDeleteDependency}
                onAssign={handleAssign}
                onUnassign={handleUnassign}
                onTasksInvalidate={handleTasksInvalidate}
                selectedTaskId={selectedTaskId}
                onSelectTask={handleSelectTask}
                activeView={activeView}
                onActiveViewChange={setActiveView}
                canEdit={canEdit}
              />
            </TabsContent>

            {/* ── MONITOR ── */}
            <TabsContent value="monitor" className="mt-6">
              <MonitorWorkspace
                projectId={id!}
                risks={risks}
                issues={issues}
                changes={changes}
                decisions={{ length: decisions.length }}
                defaultSubTab={monitorSubTab}
                onOpenRiskDialog={(r) => { setEditingRisk(r); setRiskDialogOpen(true); }}
                onDeleteRisk={setDeleteRiskTarget}
                onOpenIssueDialog={(i) => { setEditingIssue(i); setIssueDialogOpen(true); }}
                onDeleteIssue={setDeleteIssueTarget}
                onOpenChangeDialog={(c) => { setEditingChange(c); setChangeDialogOpen(true); }}
                onDeleteChange={setDeleteChangeTarget}
                canEdit={canEdit}
              />
            </TabsContent>

            {/* ── GOVERN ── */}
            <TabsContent value="govern" className="mt-6">
              <GovernWorkspace
                projectId={id!}
                projectStage={project['proj_stage@OData.Community.Display.V1.FormattedValue']}
                onEditProject={() => setEditProjectOpen(true)}
                canEdit={canEdit}
              />
            </TabsContent>

            {/* ── COLLABORATE ── */}
            <TabsContent value="collaborate" className="mt-6">
              <CollaborateWorkspace
                projectId={id!}
                projectName={project.msdyn_subject}
                primaryTeamName={primaryTeamName}
                primaryTeam={primaryTeam}
                contributingTeams={contributingTeams}
                availableTeams={availableTeams}
                onAddTeam={(payload) => addMutation.mutate(payload as Parameters<typeof addMutation.mutate>[0], { onSuccess: () => {} })}
                onRemoveTeam={(teamId) => removeMutation.mutate(teamId)}
                addTeamPending={addMutation.isPending}
                removeTeamPending={removeMutation.isPending}
                onEditProject={() => setEditProjectOpen(true)}
                canManageRoster={canManageRoster}
                canEdit={canEdit}
              />
            </TabsContent>

            {/* ── STATUS ── */}
            <TabsContent value="status" className="mt-6 max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{statusReports.length} report{statusReports.length !== 1 ? 's' : ''}</p>
                <Button size="sm" onClick={() => { setEditingStatus(null); setStatusDialogOpen(true); }} disabled={!canEdit} title={!canEdit ? READ_ONLY_TOOLTIP : undefined}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />New Report
                </Button>
              </div>
              {statusReports.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No status reports yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
                    Status reports capture progress, accomplishments, and planned activities. Submit them on a regular cadence.
                  </p>
                </div>
              ) : (
                statusReports.map((sr, idx) => (
                  <div
                    key={sr.msdyn_projectstatusreportid}
                    className={cn(
                      'rounded-xl border bg-card overflow-hidden',
                      idx === 0 ? 'border-primary/25 shadow-sm' : 'border-border'
                    )}
                  >
                    <div className={cn(
                      'flex items-center justify-between px-4 py-3 border-b',
                      idx === 0 ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/20'
                    )}>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{sr.msdyn_name}</p>
                          {idx === 0 && (
                            <span className="text-[10px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">Latest</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sr.proj_reportingdate ? fmtDate(sr.proj_reportingdate) : fmtDate(sr.createdon)}
                          {sr['_proj_submitter_value@OData.Community.Display.V1.FormattedValue']
                            ? ` · ${sr['_proj_submitter_value@OData.Community.Display.V1.FormattedValue']}`
                            : ''}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingStatus(sr); setStatusDialogOpen(true); }}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            title="Edit report"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteStatusTarget(sr)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete report"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="divide-y divide-border/60">
                      {sr.msdyn_accomplishedactivities && (
                        <div className="px-4 py-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Accomplished</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{sr.msdyn_accomplishedactivities}</p>
                        </div>
                      )}
                      {sr.msdyn_plannedactivities && (
                        <div className="px-4 py-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Planned Activities</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{sr.msdyn_plannedactivities}</p>
                        </div>
                      )}
                      {sr.msdyn_additionalcomments && (
                        <div className="px-4 py-3.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Additional Comments</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{sr.msdyn_additionalcomments}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {tabEnabled.notes && (
              <TabsContent value="notes" className="mt-6 max-w-3xl space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Notes</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Notes for this project and rolled-up notes from all of its tasks.
                  </p>
                </div>
                <NotesSection
                  scope={{
                    kind: 'project',
                    projectId: id!,
                    rollupTasks: tasks.map((tt) => ({ id: tt.msdyn_projecttaskid, name: tt.msdyn_subject })),
                  }}
                />
              </TabsContent>
            )}

            {tabEnabled.activity && (
              <TabsContent value="activity" className="mt-6 max-w-3xl space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Activity</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Every change made to this project and its tasks. Most recent first.
                  </p>
                </div>
                <ActivityFeed scope={{ kind: 'project', projectId: id! }} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}

      {/* ── Dialogs ── */}

      {/* ── Risk Dialog ── */}
      <RiskFormDialog
        open={riskDialogOpen}
        editing={editingRisk}
        existingRisks={risks}
        isPending={updateRiskMutation.isPending}
        onClose={() => setRiskDialogOpen(false)}
        onSave={(payload) => {
          setRiskDialogOpen(false);
          const name = payload.msdyn_subject ?? '(unnamed risk)';
          if (editingRisk) {
            const before = editingRisk as unknown as Record<string, unknown>;
            const after = payload as unknown as Record<string, unknown>;
            const changes = diffEntityUpdate(before, after, RISK_FIELD_LABELS);
            updateRiskMutation.mutate(
              { id: editingRisk.msdyn_projectriskid, payload },
              {
                onSuccess: () => auditChange({
                  entityType: 'risk',
                  entityId: editingRisk.msdyn_projectriskid,
                  entityName: name,
                  action: 'update',
                  changes,
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          } else {
            createRiskMutation.mutate(
              { ...payload, 'msdyn_project@odata.bind': `/msdyn_projects(${id})` },
              {
                onSuccess: (created) => auditChange({
                  entityType: 'risk',
                  entityId: (created as { msdyn_projectriskid?: string })?.msdyn_projectriskid ?? '',
                  entityName: name,
                  action: 'create',
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteRiskTarget}
        title="Delete risk"
        message={`Delete "${deleteRiskTarget?.msdyn_subject ?? deleteRiskTarget?.msdyn_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteRiskMutation.isPending}
        onConfirm={() => {
          if (!deleteRiskTarget) return;
          const target = deleteRiskTarget;
          deleteRiskMutation.mutate(target.msdyn_projectriskid, {
            onSuccess: () => {
              auditChange({
                entityType: 'risk',
                entityId: target.msdyn_projectriskid,
                entityName: target.msdyn_subject ?? target.msdyn_name ?? '(unnamed risk)',
                action: 'delete',
                parentProjectId: id!,
                parentProjectName: project?.msdyn_subject,
              });
              setDeleteRiskTarget(null);
            },
          });
        }}
        onCancel={() => setDeleteRiskTarget(null)}
      />

      {/* ── Issue Dialog ── */}
      <IssueFormDialog
        open={issueDialogOpen}
        editing={editingIssue}
        existingIssues={issues}
        isPending={updateIssueMutation.isPending}
        onClose={() => setIssueDialogOpen(false)}
        onSave={(payload) => {
          setIssueDialogOpen(false);
          const name = payload.msdyn_name ?? '(unnamed issue)';
          if (editingIssue) {
            const before = editingIssue as unknown as Record<string, unknown>;
            const after = payload as unknown as Record<string, unknown>;
            const changes = diffEntityUpdate(before, after, ISSUE_FIELD_LABELS);
            updateIssueMutation.mutate(
              { id: editingIssue.msdyn_projectissueid, payload },
              {
                onSuccess: () => auditChange({
                  entityType: 'issue',
                  entityId: editingIssue.msdyn_projectissueid,
                  entityName: name,
                  action: 'update',
                  changes,
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          } else {
            createIssueMutation.mutate(
              { ...payload, 'msdyn_project@odata.bind': `/msdyn_projects(${id})` },
              {
                onSuccess: (created) => auditChange({
                  entityType: 'issue',
                  entityId: (created as { msdyn_projectissueid?: string })?.msdyn_projectissueid ?? '',
                  entityName: name,
                  action: 'create',
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteIssueTarget}
        title="Delete issue"
        message={`Delete "${deleteIssueTarget?.msdyn_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteIssueMutation.isPending}
        onConfirm={() => {
          if (!deleteIssueTarget) return;
          const target = deleteIssueTarget;
          deleteIssueMutation.mutate(target.msdyn_projectissueid, {
            onSuccess: () => {
              auditChange({
                entityType: 'issue',
                entityId: target.msdyn_projectissueid,
                entityName: target.msdyn_name ?? '(unnamed issue)',
                action: 'delete',
                parentProjectId: id!,
                parentProjectName: project?.msdyn_subject,
              });
              setDeleteIssueTarget(null);
            },
          });
        }}
        onCancel={() => setDeleteIssueTarget(null)}
      />

      {/* ── Change Dialog ── */}
      <ChangeFormDialog
        open={changeDialogOpen}
        editing={editingChange}
        existingChanges={changes}
        isPending={updateChangeMutation.isPending}
        onClose={() => setChangeDialogOpen(false)}
        onSave={(payload) => {
          setChangeDialogOpen(false);
          const name = payload.msdyn_name ?? '(unnamed change)';
          if (editingChange) {
            const before = editingChange as unknown as Record<string, unknown>;
            const after = payload as unknown as Record<string, unknown>;
            const changes = diffEntityUpdate(before, after, CHANGE_FIELD_LABELS);
            updateChangeMutation.mutate(
              { id: editingChange.msdyn_projectchangeid, payload },
              {
                onSuccess: () => auditChange({
                  entityType: 'change',
                  entityId: editingChange.msdyn_projectchangeid,
                  entityName: name,
                  action: 'update',
                  changes,
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          } else {
            createChangeMutation.mutate(
              { ...payload, 'msdyn_project@odata.bind': `/msdyn_projects(${id})` },
              {
                onSuccess: (created) => auditChange({
                  entityType: 'change',
                  entityId: (created as { msdyn_projectchangeid?: string })?.msdyn_projectchangeid ?? '',
                  entityName: name,
                  action: 'create',
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteChangeTarget}
        title="Delete change request"
        message={`Delete "${deleteChangeTarget?.msdyn_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteChangeMutation.isPending}
        onConfirm={() => {
          if (!deleteChangeTarget) return;
          const target = deleteChangeTarget;
          deleteChangeMutation.mutate(target.msdyn_projectchangeid, {
            onSuccess: () => {
              auditChange({
                entityType: 'change',
                entityId: target.msdyn_projectchangeid,
                entityName: target.msdyn_name ?? '(unnamed change)',
                action: 'delete',
                parentProjectId: id!,
                parentProjectName: project?.msdyn_subject,
              });
              setDeleteChangeTarget(null);
            },
          });
        }}
        onCancel={() => setDeleteChangeTarget(null)}
      />

      {/* ── Status Report Dialog ── */}
      <StatusReportFormDialog
        open={statusDialogOpen}
        editing={editingStatus}
        projectId={id!}
        isPending={createStatusMutation.isPending || updateStatusMutation.isPending}
        onClose={() => setStatusDialogOpen(false)}
        onSave={(payload) => {
          setStatusDialogOpen(false);
          const name = (payload as { msdyn_name?: string }).msdyn_name ?? 'Status report';
          if (editingStatus) {
            const before = editingStatus as unknown as Record<string, unknown>;
            const after = payload as unknown as Record<string, unknown>;
            const changes = diffEntityUpdate(before, after, STATUS_REPORT_FIELD_LABELS);
            updateStatusMutation.mutate(
              { id: editingStatus.msdyn_projectstatusreportid, payload },
              {
                onSuccess: () => auditChange({
                  entityType: 'statusreport',
                  entityId: editingStatus.msdyn_projectstatusreportid,
                  entityName: name,
                  action: 'update',
                  changes,
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          } else {
            createStatusMutation.mutate(
              { ...payload, 'msdyn_project@odata.bind': `/msdyn_projects(${id})` },
              {
                onSuccess: (created) => auditChange({
                  entityType: 'statusreport',
                  entityId: (created as { msdyn_projectstatusreportid?: string })?.msdyn_projectstatusreportid ?? '',
                  entityName: name,
                  action: 'create',
                  parentProjectId: id!,
                  parentProjectName: project?.msdyn_subject,
                }),
              },
            );
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteStatusTarget}
        title="Delete status report"
        message={`Delete "${deleteStatusTarget?.msdyn_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteStatusMutation.isPending}
        onConfirm={() => {
          if (!deleteStatusTarget) return;
          const target = deleteStatusTarget;
          deleteStatusMutation.mutate(target.msdyn_projectstatusreportid, {
            onSuccess: () => {
              auditChange({
                entityType: 'statusreport',
                entityId: target.msdyn_projectstatusreportid,
                entityName: target.msdyn_name ?? 'Status report',
                action: 'delete',
                parentProjectId: id!,
                parentProjectName: project?.msdyn_subject,
              });
              setDeleteStatusTarget(null);
            },
          });
        }}
        onCancel={() => setDeleteStatusTarget(null)}
      />

      {/* ── Project edit dialog ── */}
      {project && (
        <ProjectEditDialog
          open={editProjectOpen}
          onClose={() => { setEditProjectOpen(false); updateProjectMutation.reset(); }}
          project={project}
          isPending={updateProjectMutation.isPending}
          error={updateProjectMutation.error}
          onSave={async (payload, scheduleUpdate) => {
            try {
              // Schedule-managed fields go through PSS
              if (scheduleUpdate) {
                await updateProjectSchedule({ projectId: id!, ...scheduleUpdate });
              }
              // Non-scheduling fields go through direct PATCH
              if (Object.keys(payload).length > 0) {
                await updateProjectMutation.mutateAsync(payload);
              }
              // Wave 1 audit — emit one EntityChange row covering all field
              // diffs from this save (PSS-managed start date + direct-PATCH fields).
              const before: Record<string, unknown> = project as unknown as Record<string, unknown>;
              const after: Record<string, unknown> = { ...payload };
              if (scheduleUpdate?.scheduledStart !== undefined) {
                after.msdyn_scheduledstart = scheduleUpdate.scheduledStart;
              }
              const changes: ChangeAuditFieldDiff[] = diffEntityUpdate(before, after, PROJECT_FIELD_LABELS);
              if (changes.length > 0) {
                auditChange({
                  entityType: 'project',
                  entityId: id!,
                  entityName: project.msdyn_subject,
                  action: 'update',
                  changes,
                  parentProjectId: id!,
                  parentProjectName: project.msdyn_subject,
                });
              }
              setEditProjectOpen(false);
            } catch (err) {
              throw err instanceof Error ? err : new Error(String(err));
            }
          }}
        />
      )}

      {/* Team dialogs moved to CollaborateWorkspace */}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete project"
        recordName={project?.msdyn_subject ?? ''}
        childSummary={deleteSummary}
        childSummaryLoading={deleteSummaryLoading}
        extraWarning="This PERMANENTLY DELETES the project, the originating intake request, and every related task, risk, issue, change, status report, baseline, decision, gate, artifact, closeout, document link, meeting link, notification, and telemetry event. There is no undo."
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
