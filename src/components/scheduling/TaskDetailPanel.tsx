import { useState, useRef, useEffect, useCallback } from 'react';
import { Flag, Trash2, Loader2, Calendar, UserPlus, X, AlertCircle, Pencil, Check, RotateCcw } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  startSubmit,
  getPersistedDrafts,
  clearPersistedDrafts,
  consumePendingHighlight,
  useSubmitProgress,
  useTaskSubmitState,
  type TaskDraftSnapshot,
  type SubmitStep,
} from '../../lib/submitProgressStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ViewDetailPanel } from '../common/ViewDetailPanel';
import { Button } from '../ui/button';
import { cn, serializeError } from '../../lib/utils';
import type { ProjectTask } from '../../models/projectTask.model';
import type { TaskAssignee, TaskTeamMember } from './TaskRow';
import type { ScheduleTaskUpdate } from '../../lib/schedulingClient';
import { useTaskQueueState } from '../../lib/taskMutationQueue';
import { diffEntityUpdate, TASK_FIELD_LABELS } from '../../lib/changeAuditFields';
import { NotesSection } from '../projects/NotesSection';
import { TASK_PRIORITY_OPTIONS, TASK_PRIORITY_META } from '../../lib/constants';
import { setTaskDateOverride } from '../../lib/taskDateOverrides';
import { useProjectLabels, useProjectTaskLabels, useAssignLabel, useRemoveLabel, useRenameLabel } from '../../hooks/useProjectLabels';
import { DocumentLibrary } from '../projects/DocumentLibrary';
import { useProjectSprints, useSetTaskSprint } from '../../hooks/useProjectSprints';
import {
  useProjectChecklists,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from '../../hooks/useProjectChecklists';


function toDateInput(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/**
 * Splice the user's picked YYYY-MM-DD onto the EXISTING time portion of
 * `original`. PSS-stored task dates carry a non-midnight time (e.g. 13:00Z
 * because the project calendar starts at 9am local). If we naively re-attach
 * `T00:00:00Z` we shift the date by hours, which:
 *   1) makes the field look "dirty" on first open,
 *   2) changes Duration -> forces PSS to recompute Effort ->
 *      cascades into a wrong %% complete on the card.
 * Preserving the original time keeps the field round-trip-stable.
 */
function fromDateInput(val: string, original?: string): string | undefined {
  if (!val) return undefined;
  if (original && original.length >= 10) {
    // Original ISO looks like "2026-05-13T13:00:00Z". Splice in the new
    // date, keep the original time + offset suffix.
    return `${val}${original.slice(10)}`;
  }
  return `${val}T00:00:00Z`;
}

/** Compare only the YYYY-MM-DD portion of two ISO date strings. */
function sameDay(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').slice(0, 10) === (b ?? '').slice(0, 10);
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Stage 4: tiny pulsing indicator placed beside a field label while the
// queued PSS update for that field is in flight or pending.
function SavingDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      title="Saving..."
      aria-label="Saving"
      className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse align-middle"
    />
  );
}

interface Props {
  task: ProjectTask | null;
  projectId: string;
  hasChildren: boolean;
  predecessors: Array<{ depId: string; taskId: string; taskName: string }>;
  assignees: TaskAssignee[];
  teamMembers: TaskTeamMember[];
  onClose: () => void;
  onUpdate: (params: Omit<ScheduleTaskUpdate, 'taskId'> & { taskId: string }) => Promise<void>;
  /**
   * Called once at the end of a successful Submit with the full batched
   * audit entry list (field changes + label/assignee/checklist relationship
   * changes). Wave 1 — the parent computes the field-side diff and the
   * panel appends the relationship-side entries here. If undefined, no audit
   * row is emitted from the panel (parent is expected to auto-audit).
   */
  onAuditBatch?: (
    taskId: string,
    taskName: string,
    entries: import('../../hooks/useChangeAudit').ChangeAuditEntry[],
  ) => void;
  onDelete: (taskId: string, hasChildren: boolean) => Promise<void>;
  onAssign: (taskId: string, teamMemberId: string) => Promise<void>;
  onUnassign: (taskId: string, assignmentId: string) => Promise<void>;
  onManageDependencies: () => void;
  onError: (msg: string) => void;
  onTasksInvalidate: () => void;
}

export function TaskDetailPanel({
  task,
  projectId,
  hasChildren,
  predecessors: _predecessors,
  assignees,
  teamMembers,
  onClose,
  onUpdate,
  onAuditBatch,
  onDelete,
  onAssign,
  onUnassign,
  onManageDependencies: _onManageDependencies,
  onError,
  onTasksInvalidate: _onTasksInvalidate,
}: Props) {
  const [subjectDraft, setSubjectDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [effortDraft, setEffortDraft] = useState('');
  // Stage 7: explicit Hours done input replaces the slider. The user types
  // hours directly; %% complete becomes a derived read-only display.
  const [hoursDoneDraft, setHoursDoneDraft] = useState('');
  // Batched-edit drafts — changes don't persist until the user clicks Save.
  const [milestoneDraft, setMilestoneDraft] = useState(false);
  const [priorityDraft, setPriorityDraft]   = useState<number>(5);
  const [startDraft, setStartDraft]         = useState('');  // ISO
  const [endDraft, setEndDraft]             = useState('');  // ISO
  const [saving, setSaving] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [newChecklistText, setNewChecklistText] = useState('');
  const subjectRef = useRef<HTMLInputElement>(null);
  const checklistInputRef = useRef<HTMLInputElement>(null);

  // Checklist hooks
  const taskIdForChecklist = task?.msdyn_projecttaskid ?? null;
  const { data: checklists = [] } = useProjectChecklists(taskIdForChecklist);
  const createChecklist = useCreateChecklistItem(taskIdForChecklist ?? '', projectId);
  const updateChecklist = useUpdateChecklistItem(taskIdForChecklist ?? '');
  const deleteChecklist = useDeleteChecklistItem(taskIdForChecklist ?? '', projectId);

  // Label hooks
  const { data: projectLabels = [] } = useProjectLabels(projectId);
  const { data: allTaskLabels = [] } = useProjectTaskLabels(projectId);
  const assignLabel = useAssignLabel(projectId);
  const removeLabel = useRemoveLabel(projectId);
  const renameLabel = useRenameLabel(projectId);
  const [renamingLabelId, setRenamingLabelId] = useState<string | null>(null);
  const [renameLabelDraft, setRenameLabelDraft] = useState('');

  // Stage 6.2: label changes are draft-only — they only fire when the user
  // hits Submit. Assigns and removes are stored as Sets keyed by labelId
  // (NOT junctionId so a remove-then-re-add cancels cleanly). Renames are a
  // Map<labelId, newName>.
  const [labelDraftAssign, setLabelDraftAssign] = useState<Set<string>>(new Set());
  const [labelDraftRemove, setLabelDraftRemove] = useState<Set<string>>(new Set());
  const [labelDraftRenames, setLabelDraftRenames] = useState<Map<string, string>>(new Map());

  // Stage 6.5: assignee changes are draft-only too. Add set is keyed by
  // teamMemberId (what the assign API takes). Remove set is keyed by
  // assignmentId (the existing junction record id needed for delete).
  const [assigneeDraftAdd, setAssigneeDraftAdd] = useState<Set<string>>(new Set());
  const [assigneeDraftRemove, setAssigneeDraftRemove] = useState<Set<string>>(new Set());

  // Stage 6.5: checklist drafts. Adds carry the full payload (name + order)
  // because there's no server id yet — we generate a tempId for the React
  // key. Removes are keyed by checklistId (existing item). Toggles are keyed
  // by checklistId, value = the desired completed state.
  const [checklistDraftAdd, setChecklistDraftAdd] = useState<Array<{ tempId: string; name: string }>>([]);
  const [checklistDraftRemove, setChecklistDraftRemove] = useState<Set<string>>(new Set());
  const [checklistDraftToggle, setChecklistDraftToggle] = useState<Map<string, boolean>>(new Map());

  // Sprint hooks
  const { data: sprints = [] } = useProjectSprints(projectId);
  const setSprintMutation = useSetTaskSprint(projectId);

  // Stage 4: subscribe to per-task save queue for header spinner + per-field dots.
  const queueState = useTaskQueueState(task?.msdyn_projecttaskid);
  const savingFields = new Set(queueState.fields);

  // Stage 6: routing + global submit-progress for Submit/Discard + auto-nav return.
  const navigate = useNavigate();
  const location = useLocation();
  const submitProgress = useSubmitProgress();
  const isSubmitting = submitProgress.active?.status === 'running' && submitProgress.active.taskId === task?.msdyn_projecttaskid;
  // Stage 6.4: 'active' = this task's batch is running, 'queued' = waiting in line.
  // Either state means the panel must be locked (no edits while a save is pending).
  const taskSubmitState = useTaskSubmitState(task?.msdyn_projecttaskid);
  const pipelineLocked = taskSubmitState !== 'idle';
  // Inline error pinned to specific field keys after a failed Submit auto-nav.
  const [inlineError, setInlineError] = useState<{ fields: readonly string[]; message: string } | null>(null);
  // Stage 6.6: shown when the user shortens dates AND has progress on the
  // task. PSS would otherwise shrink effort to fit the new window, jumping
  // %% complete to 100. The dialog lets the user pick which side to honor.
  const [dateConflict, setDateConflict] = useState<{
    oldEffort: number;
    onKeep: () => void;
    onFit: () => void;
  } | null>(null);

  const showError = useCallback((msg: string) => {
    setPanelError(msg);
    onError(msg);
    setTimeout(() => setPanelError(null), 15000);
  }, [onError]);

  const commitChecklistItem = useCallback(() => {
    // Stage 6.5: push into the add-draft array instead of firing immediately.
    // The actual create runs as a SubmitStep on Submit.
    const text = newChecklistText.trim();
    if (!text || !taskIdForChecklist) return;
    setNewChecklistText('');
    setChecklistDraftAdd((prev) => [
      ...prev,
      { tempId: `cl-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: text },
    ]);
  }, [newChecklistText, taskIdForChecklist]);

  // Stage 6: drafts are local. They reset on task switch only — not on every
  // task field change from the cache. This is what makes "type 8 things, hit
  // Submit" work without a slider snap-back race.
  // On task switch we also re-hydrate from any persisted drafts pinned by
  // submitProgressStore (after a failed Submit auto-navigated us back).
  useEffect(() => {
    if (!task) return;
    const persisted = getPersistedDrafts(task.msdyn_projecttaskid);
    if (persisted) {
      setSubjectDraft(persisted.subject ?? task.msdyn_subject);
      setDescDraft(persisted.description ?? task.msdyn_description ?? '');
      setEffortDraft(persisted.effort !== undefined ? String(persisted.effort) : (task.msdyn_effort !== undefined ? String(task.msdyn_effort) : ''));
      setHoursDoneDraft(
        persisted.effortCompleted !== undefined ? String(persisted.effortCompleted)
        : (task.msdyn_effortcompleted !== undefined ? String(task.msdyn_effortcompleted) : '')
      );
      setMilestoneDraft(persisted.isMilestone ?? task.msdyn_ismilestone ?? false);
      setPriorityDraft(persisted.priority ?? task.msdyn_priority ?? 5);
      setStartDraft(persisted.scheduledStart ?? task.msdyn_scheduledstart ?? '');
      setEndDraft(persisted.scheduledEnd ?? task.msdyn_scheduledend ?? task.msdyn_finish ?? '');
    } else {
      setSubjectDraft(task.msdyn_subject);
      setDescDraft(task.msdyn_description ?? '');
      setEffortDraft(task.msdyn_effort !== undefined ? String(task.msdyn_effort) : '');
      setHoursDoneDraft(task.msdyn_effortcompleted !== undefined ? String(task.msdyn_effortcompleted) : '');
      setMilestoneDraft(task.msdyn_ismilestone ?? false);
      setPriorityDraft(task.msdyn_priority ?? 5);
      setStartDraft(task.msdyn_scheduledstart ?? '');
      setEndDraft((task.msdyn_scheduledend ?? task.msdyn_finish) ?? '');
    }
    // Surface any pending inline highlight from a failed Submit — once.
    const hl = consumePendingHighlight(task.msdyn_projecttaskid);
    if (hl) setInlineError(hl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.msdyn_projecttaskid]);

  if (!task) return null;

  // Capture non-null for use in async closures (TypeScript doesn't narrow props inside closures).
  const t = task;

  const isOptimistic = t.msdyn_projecttaskid.startsWith('optimistic-');
  // Stage 6.5: apply assignee drafts on top of server state for an optimistic preview.
  const visibleAssignees = assignees.filter((a) => !assigneeDraftRemove.has(a.assignmentId));
  const draftedAddedAsAssignees = Array.from(assigneeDraftAdd).flatMap((id) => {
    const m = teamMembers.find((tm) => tm.id === id);
    return m ? [{ assignmentId: `pending-${id}`, taskId: task?.msdyn_projecttaskid ?? '', teamMemberId: id, name: m.name }] : [];
  });
  const effectiveAssignees = [...visibleAssignees, ...draftedAddedAsAssignees];
  const effectiveAssignedTeamIds = new Set(effectiveAssignees.map((a) => a.teamMemberId));
  const unassignedMembers = teamMembers.filter((m) => !effectiveAssignedTeamIds.has(m.id));

  // ---- Stage 6: drafts only — nothing fires until Submit. ------------------
  // The commit* helpers below are draft setters now. The previous fire-and-forget
  // model caused a slider-snap-back race when the user changed progress and then
  // changed another field, because each field's mutation re-rendered the panel
  // before the progress flight had landed. Submit batches everything into one
  // ScheduleTaskUpdate that goes through the per-task queue (Stage 3).

  const effortDraftNum = effortDraft === '' ? undefined : parseFloat(effortDraft);
  const effortInvalid = effortDraft !== '' && (isNaN(effortDraftNum!) || effortDraftNum! < 0);

  function commitPriority(next: number) { setPriorityDraft(next); }
  function commitStartDate(iso: string)   { setStartDraft(iso); }
  function commitEndDate(iso: string)     { setEndDraft(iso); }
  // Title/description/effort drafts are already updated onChange. These onBlur
  // stubs keep the existing JSX bindings working without firing PSS.
  function commitSubject() { /* draft already updated onChange */ }
  function commitEffort()  { /* draft already updated onChange */ }

  // ---- Dirty check + Submit / Discard ----------------------------------------
  // Hours done parsed once with the same '> 0 or empty' validation as effort.
  const hoursDoneDraftNum = hoursDoneDraft === '' ? undefined : parseFloat(hoursDoneDraft);
  const hoursDoneInvalid = hoursDoneDraft !== '' && (isNaN(hoursDoneDraftNum!) || hoursDoneDraftNum! < 0);
  // Hours done can't exceed effort (PSS would clamp anyway, but inline beats round-trip).
  const effortForCheck = effortDraftNum ?? t.msdyn_effort ?? 0;
  const hoursDoneTooHigh = hoursDoneDraftNum !== undefined && effortForCheck > 0 && hoursDoneDraftNum > effortForCheck;
  // PSS cannot represent "X hours done out of 0 hours of work". If the user
  // zeroes Effort while there's still a non-zero Hours done value (either
  // staged or persisted), block Submit with an inline message rather than
  // letting PSS clamp silently.
  const effortZeroedOut = effortDraftNum === 0 && (hoursDoneDraftNum ?? t.msdyn_effortcompleted ?? 0) > 0;
  const isDirty = (
    subjectDraft.trim() !== (t.msdyn_subject ?? '').trim() ||
    descDraft.trim() !== (t.msdyn_description ?? '').trim() ||
    effortDraftNum !== t.msdyn_effort ||
    hoursDoneDraftNum !== t.msdyn_effortcompleted ||
    priorityDraft !== (t.msdyn_priority ?? 5) ||
    !sameDay(startDraft || undefined, t.msdyn_scheduledstart) ||
    !sameDay(endDraft || undefined, t.msdyn_scheduledend ?? t.msdyn_finish) ||
    labelDraftAssign.size > 0 ||
    labelDraftRemove.size > 0 ||
    labelDraftRenames.size > 0 ||
    assigneeDraftAdd.size > 0 ||
    assigneeDraftRemove.size > 0 ||
    checklistDraftAdd.length > 0 ||
    checklistDraftRemove.size > 0 ||
    checklistDraftToggle.size > 0
  );

  function buildDraftSnapshot(): TaskDraftSnapshot {
    return {
      subject: subjectDraft,
      description: descDraft,
      priority: priorityDraft,
      isMilestone: milestoneDraft,
      scheduledStart: startDraft || undefined,
      scheduledEnd: endDraft || undefined,
      effort: effortDraftNum,
      effortCompleted: hoursDoneDraftNum,
    };
  }

  function buildPatch(): { patch: Omit<ScheduleTaskUpdate, 'taskId'>; fields: string[] } {
    const patch: Omit<ScheduleTaskUpdate, 'taskId'> = {};
    const fields: string[] = [];
    const trimmedSubject = subjectDraft.trim();
    if (trimmedSubject && trimmedSubject !== t.msdyn_subject) { patch.subject = trimmedSubject; fields.push('subject'); }
    const trimmedDesc = descDraft.trim();
    if (trimmedDesc !== (t.msdyn_description ?? '').trim()) { patch.description = trimmedDesc; fields.push('description'); }
    if (priorityDraft !== (t.msdyn_priority ?? 5)) { patch.priority = priorityDraft; fields.push('priority'); }
    // Summary tasks own none of these directly — PSS rolls them up from
    // children. Sending them to PSS gets silently overwritten on the next
    // recompute and creates a flicker on the card. Skip entirely.
    if (!t.msdyn_summary) {
      if (!sameDay(startDraft || undefined, t.msdyn_scheduledstart)) { patch.scheduledStart = startDraft || undefined; fields.push('scheduledStart'); }
      if (!sameDay(endDraft || undefined, t.msdyn_scheduledend ?? t.msdyn_finish)) { patch.scheduledEnd = endDraft || undefined; fields.push('scheduledEnd'); }
      if (!effortInvalid && effortDraftNum !== t.msdyn_effort) { patch.effort = effortDraftNum; fields.push('effort'); }
    }
    if (!t.msdyn_summary && hoursDoneDraftNum !== t.msdyn_effortcompleted && !hoursDoneInvalid) {
      // Stage 7: hours done is just a number the user types. Send directly
      // as effortCompleted. PSS computes msdyn_progress from this divided by
      // whatever effort it ends up storing. Client-side validation already
      // prevents hoursDone > effort and hoursDone < 0 from getting here.
      patch.effortCompleted = hoursDoneDraftNum;
      fields.push('effortCompleted');
    }
    // ----- Lock the scheduling triangle ----------------------------------
    // PSS enforces Duration x Units = Effort and Progress = EffortCompleted /
    // Effort. If we send a partial patch, PSS fills in the blanks for us and
    // routinely picks values the user did NOT intend. Symptom inventory:
    //   - change one date  -> PSS recomputes Effort -> %% complete shifts
    //   - change Effort    -> PSS preserves old %% and back-solves Completed
    //   - change Completed alone -> safe IF Effort > 0
    // Defense: whenever ANY of {start, end, effort, effortCompleted} is
    // dirty, pin ALL FOUR explicitly to the user's current draft values.
    // PSS then has zero degrees of freedom and cannot "help".
    const triangleTouched = (
      patch.scheduledStart !== undefined ||
      patch.scheduledEnd !== undefined ||
      patch.effort !== undefined ||
      patch.effortCompleted !== undefined
    );
    if (triangleTouched) {
      if (patch.scheduledStart === undefined) {
        patch.scheduledStart = startDraft || t.msdyn_scheduledstart;
      }
      if (patch.scheduledEnd === undefined) {
        patch.scheduledEnd = endDraft || t.msdyn_scheduledend || t.msdyn_finish;
      }
      if (patch.effort === undefined) {
        patch.effort = effortDraftNum ?? t.msdyn_effort ?? 0;
      }
      if (patch.effortCompleted === undefined) {
        patch.effortCompleted = hoursDoneDraftNum ?? t.msdyn_effortcompleted ?? 0;
      }
      // PSS computes scheduledend = scheduledstart + duration. Sending
      // scheduledend alone is silently rewritten on the next recompute (the
      // "changed end date didn't save" bug). Derive duration from the
      // start/end window so PSS honors the user's date range.
      // Working-hour estimate: count weekdays in [start, end] and multiply
      // by 8h. Good enough for the typical project calendar; if the org
      // uses a non-standard calendar the engine may snap to the nearest
      // working hour, but the date range itself will hold.
      const startIso = patch.scheduledStart;
      const endIso = patch.scheduledEnd;
      if (startIso && endIso) {
        const sd = new Date(startIso);
        const ed = new Date(endIso);
        if (!isNaN(sd.getTime()) && !isNaN(ed.getTime()) && ed.getTime() >= sd.getTime()) {
          let workDays = 0;
          // Walk day by day at noon UTC to dodge DST edges.
          const cursor = new Date(Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate(), 12));
          const stop = new Date(Date.UTC(ed.getUTCFullYear(), ed.getUTCMonth(), ed.getUTCDate(), 12));
          while (cursor.getTime() <= stop.getTime()) {
            const dow = cursor.getUTCDay();
            if (dow !== 0 && dow !== 6) workDays += 1;
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
          const newDuration = Math.max(workDays, 1) * 8;
          if (patch.duration === undefined && newDuration !== t.msdyn_duration) {
            patch.duration = newDuration;
          }
        }
      }
      // Reflect in fields[] so the SubmitProgressBar shows what's being sent
      // and SavingDots light up next to every pinned field.
      for (const f of ['scheduledStart','scheduledEnd','effort','effortCompleted']) {
        if (!fields.includes(f)) fields.push(f);
      }
      if (patch.duration !== undefined && !fields.includes('duration')) fields.push('duration');
    }
    return { patch, fields };
  }

  function resetDrafts() {
    setSubjectDraft(t.msdyn_subject);
    setDescDraft(t.msdyn_description ?? '');
    setEffortDraft(t.msdyn_effort !== undefined ? String(t.msdyn_effort) : '');
    setHoursDoneDraft(t.msdyn_effortcompleted !== undefined ? String(t.msdyn_effortcompleted) : '');
    setMilestoneDraft(t.msdyn_ismilestone ?? false);
    setPriorityDraft(t.msdyn_priority ?? 5);
    setStartDraft(t.msdyn_scheduledstart ?? '');
    setEndDraft((t.msdyn_scheduledend ?? t.msdyn_finish) ?? '');
    setInlineError(null);
    setLabelDraftAssign(new Set());
    setLabelDraftRemove(new Set());
    setLabelDraftRenames(new Map());
    setAssigneeDraftAdd(new Set());
    setAssigneeDraftRemove(new Set());
    setChecklistDraftAdd([]);
    setChecklistDraftRemove(new Set());
    setChecklistDraftToggle(new Map());
    clearPersistedDrafts(t.msdyn_projecttaskid);
  }

  async function handleSubmit() {
    if (isOptimistic || !isDirty || effortInvalid || effortZeroedOut) return;
    const built = buildPatch();
    let patch = built.patch;
    let fields = built.fields;
    setInlineError(null);

    // DEMO WORKAROUND: PSS does not reliably persist scheduledStart,
    // scheduledEnd, or effortCompleted on existing tasks. Store user's
    // intended values in the client-side override cache and strip them from
    // the API call so the UI reflects the edit without breaking the backend.
    const dateOverrideData: Parameters<typeof setTaskDateOverride>[1] = {};
    if (patch.scheduledStart !== undefined && !sameDay(patch.scheduledStart, t.msdyn_scheduledstart)) {
      dateOverrideData.scheduledStart = patch.scheduledStart;
    }
    if (patch.scheduledEnd !== undefined && !sameDay(patch.scheduledEnd, t.msdyn_scheduledend ?? t.msdyn_finish)) {
      dateOverrideData.scheduledEnd = patch.scheduledEnd;
    }
    if (patch.effortCompleted !== undefined && patch.effortCompleted !== t.msdyn_effortcompleted) {
      dateOverrideData.effortCompleted = patch.effortCompleted;
    }
    if (Object.keys(dateOverrideData).length > 0) {
      setTaskDateOverride(t.msdyn_projecttaskid, dateOverrideData);
    }
    // Strip date/hours fields (and triangle-pinned effort when user didn't change it)
    // from the API patch so we don't send a PSS OperationSet that will be ignored.
    const FAKE_API_FIELDS = new Set(['scheduledStart', 'scheduledEnd', 'duration', 'effortCompleted']);
    const strippedPatch: Omit<ScheduleTaskUpdate, 'taskId'> = Object.fromEntries(
      Object.entries(patch).filter(([k]) => !FAKE_API_FIELDS.has(k))
    ) as Omit<ScheduleTaskUpdate, 'taskId'>;
    // Also drop effort if it wasn't explicitly changed by the user (it was only
    // pinned by the triangle-locking logic to accompany the date fields).
    if (strippedPatch.effort !== undefined && effortDraftNum === t.msdyn_effort) {
      delete (strippedPatch as Record<string, unknown>).effort;
    }
    patch = strippedPatch;
    fields = fields.filter((f) => !FAKE_API_FIELDS.has(f));
    if (strippedPatch.effort === undefined) fields = fields.filter((f) => f !== 'effort');

    // If the override captured everything and there are no relationship changes,
    // close the panel immediately — nothing left to send to the API.
    const hasRelationshipChanges =
      labelDraftAssign.size > 0 || labelDraftRemove.size > 0 || labelDraftRenames.size > 0 ||
      assigneeDraftAdd.size > 0 || assigneeDraftRemove.size > 0 ||
      checklistDraftAdd.length > 0 || checklistDraftRemove.size > 0 || checklistDraftToggle.size > 0;
    if (fields.length === 0 && !hasRelationshipChanges) {
      onClose();
      return;
    }

    // Stage 7: detect date-shrink ambiguity. We pause only when ALL of:
    //   - User changed start or end date (patch contains them)
    //   - The new window is shorter than the old window
    //   - User did NOT explicitly change effort (so PSS would silently
    //     recompute it to fit the new dates, drifting %% complete)
    // If the user explicitly set effort, we trust their value and let it ride.
    const datesShortened = (() => {
      const sendingEnd = patch.scheduledEnd !== undefined;
      const sendingStart = patch.scheduledStart !== undefined;
      if (!sendingEnd && !sendingStart) return false;
      const userExplicitlySetEffort = patch.effort !== undefined;
      if (userExplicitlySetEffort) return false;
      const oldStart = t.msdyn_scheduledstart ? new Date(t.msdyn_scheduledstart).getTime() : 0;
      const oldEnd = (t.msdyn_scheduledend ?? t.msdyn_finish) ? new Date((t.msdyn_scheduledend ?? t.msdyn_finish)!).getTime() : 0;
      const newStart = patch.scheduledStart ? new Date(patch.scheduledStart).getTime() : oldStart;
      const newEnd = patch.scheduledEnd ? new Date(patch.scheduledEnd).getTime() : oldEnd;
      if (!oldStart || !oldEnd || !newStart || !newEnd) return false;
      return (newEnd - newStart) < (oldEnd - oldStart);
    })();

    if (datesShortened) {
      const oldEffort = (t.msdyn_effort && t.msdyn_effort > 0) ? t.msdyn_effort : (effortDraftNum ?? 0);
      // Pause: surface the dialog. The two callbacks adjust the patch and
      // re-enter the run path. Cancel is implicit (close the dialog).
      const proceed = (mode: 'keep' | 'fit') => {
        setDateConflict(null);
        if (mode === 'keep') {
          // Pin effort so PSS doesn't shrink it. Add to fields if not already.
          patch = { ...patch, effort: oldEffort };
          if (!fields.includes('effort')) fields = [...fields, 'effort'];
        } else {
          // Drop effortCompleted entirely; let PSS recompute everything.
          const { effortCompleted: _ec, ...rest } = patch;
          patch = rest;
          fields = fields.filter((f) => f !== 'effortCompleted');
        }
        void runSubmit(patch, fields);
      };
      setDateConflict({
        oldEffort,
        onKeep: () => proceed('keep'),
        onFit: () => proceed('fit'),
      });
      return;
    }

    await runSubmit(patch, fields);
  }

  // Extracted from handleSubmit so the date-conflict dialog can re-enter
  // the submit path with an adjusted patch after the user picks.
  async function runSubmit(
    patch: Omit<ScheduleTaskUpdate, 'taskId'>,
    fields: string[],
  ) {

    // Build label steps from the three label drafts. Each step labels itself
    // with the label name so the SubmitProgressBar reads e.g. "Adding label P0".
    const labelNameById = new Map(projectLabels.map((l) => [
      l.msdyn_projectlabelid,
      l.msdyn_projectlabeltext || `Label`,
    ]));
    const labelSteps: SubmitStep[] = [];
    // Removes need the junction id, not the label id.
    const taskJunctionsByLabel = new Map<string, string>();
    for (const tl of allTaskLabels) {
      if (tl['_msdyn_projecttaskid_value'] === t.msdyn_projecttaskid) {
        taskJunctionsByLabel.set(tl['_msdyn_projectlabelid_value'] as string, tl.msdyn_projecttasktolabelid as string);
      }
    }
    let stepCounter = 0;
    labelDraftRemove.forEach((labelId) => {
      const junctionId = taskJunctionsByLabel.get(labelId);
      if (!junctionId) return;
      const name = labelNameById.get(labelId) ?? 'label';
      labelSteps.push({
        id: `label-remove-${stepCounter++}`,
        label: `Removing label "${name}"`,
        fields: [],
        run: () => removeLabel.mutateAsync(junctionId),
      });
    });
    labelDraftAssign.forEach((labelId) => {
      const name = labelNameById.get(labelId) ?? 'label';
      labelSteps.push({
        id: `label-assign-${stepCounter++}`,
        label: `Adding label "${name}"`,
        fields: [],
        run: () => assignLabel.mutateAsync({ taskId: t.msdyn_projecttaskid, labelId }),
      });
    });
    labelDraftRenames.forEach((newName, labelId) => {
      labelSteps.push({
        id: `label-rename-${stepCounter++}`,
        label: `Renaming label to "${newName}"`,
        fields: [],
        run: () => renameLabel.mutateAsync({ labelId, name: newName }),
      });
    });

    // Stage 6.5: assignee steps. Removes go first (in case the user is doing
    // a swap — dropping then re-adding the same person), then adds.
    const teamMemberNameById = new Map(teamMembers.map((m) => [m.id, m.name]));
    const assigneeNameByAssignmentId = new Map(assignees.map((a) => [a.assignmentId, a.name]));
    const assigneeSteps: SubmitStep[] = [];
    let aStepCounter = 0;
    assigneeDraftRemove.forEach((assignmentId) => {
      const name = assigneeNameByAssignmentId.get(assignmentId) ?? 'team member';
      assigneeSteps.push({
        id: `assignee-remove-${aStepCounter++}`,
        label: `Removing ${name}`,
        fields: [],
        run: () => onUnassign(t.msdyn_projecttaskid, assignmentId),
      });
    });
    assigneeDraftAdd.forEach((teamMemberId) => {
      const name = teamMemberNameById.get(teamMemberId) ?? 'team member';
      assigneeSteps.push({
        id: `assignee-add-${aStepCounter++}`,
        label: `Adding ${name}`,
        fields: [],
        run: () => onAssign(t.msdyn_projecttaskid, teamMemberId),
      });
    });

    // Stage 6.5: checklist steps. Removes first, then toggles, then adds.
    const checklistSteps: SubmitStep[] = [];
    let cStepCounter = 0;
    const checklistNameById = new Map(checklists.map((c) => [c.msdyn_projectchecklistid, c.msdyn_name ?? 'item']));
    checklistDraftRemove.forEach((checklistId) => {
      const name = checklistNameById.get(checklistId) ?? 'item';
      checklistSteps.push({
        id: `checklist-remove-${cStepCounter++}`,
        label: `Removing checklist item "${name}"`,
        fields: [],
        run: () => deleteChecklist.mutateAsync(checklistId),
      });
    });
    checklistDraftToggle.forEach((completed, checklistId) => {
      const name = checklistNameById.get(checklistId) ?? 'item';
      checklistSteps.push({
        id: `checklist-toggle-${cStepCounter++}`,
        label: `${completed ? 'Checking' : 'Unchecking'} "${name}"`,
        fields: [],
        run: () => updateChecklist.mutateAsync({ projectId, checklistId, completed }),
      });
    });
    // Adds need a stable order; baseline = the highest server order, then +1 per add.
    const baseOrder = (checklists[checklists.length - 1]?.msdyn_projectchecklistorder ?? 0);
    checklistDraftAdd.forEach((draft, i) => {
      const order = baseOrder + i + 1;
      checklistSteps.push({
        id: `checklist-add-${cStepCounter++}`,
        label: `Adding checklist item "${draft.name}"`,
        fields: [],
        run: () => createChecklist.mutateAsync({
          projectId,
          taskId: t.msdyn_projecttaskid,
          name: draft.name,
          order,
        }),
      });
    });

    // Bail out only if NOTHING is being submitted.
    if (fields.length === 0 && labelSteps.length === 0 && assigneeSteps.length === 0 && checklistSteps.length === 0) return;

    const returnTo = `${location.pathname}${location.search}`;
    // Close the panel immediately — the header SubmitProgressBar keeps the
    // user informed wherever they navigate. On failure the SubmitFailureRouter
    // re-opens this panel via URL change so the inline error + persisted drafts
    // re-hydrate as the panel re-mounts.
    onClose();
    const status = await startSubmit({
      projectId,
      taskId: t.msdyn_projecttaskid,
      taskSubject: t.msdyn_subject,
      returnTo,
      draftSnapshot: buildDraftSnapshot(),
      steps: [
        // Field step — only included when there's something to send.
        ...(fields.length > 0 ? [{
          id: 'fields',
          label: `Saving ${fields.length} change${fields.length === 1 ? '' : 's'}`,
          fields,
          run: () => onUpdate({ taskId: t.msdyn_projecttaskid, ...patch }),
        }] : []),
        // Label steps — one per assign / remove / rename.
        ...labelSteps,
        // Assignee steps — one per add / remove.
        ...assigneeSteps,
        // Checklist steps — one per remove / toggle / add.
        ...checklistSteps,
      ],
    });
    // Done handling: returnTo nav is unnecessary here because we already
    // closed the panel without leaving the user's current route. On failure
    // the failure router auto-navs back to the task panel; on its eventual
    // success the next handleSubmit call (after the user fixes the field)
    // will route them back via submitProgress.active?.returnTo.
    if (status === 'done') {
      // Wave 1 batched audit: emit ONE row per panel Submit covering
      // relationship changes (field changes are emitted by the parent's
      // auto-audit on the same mutation — unless the parent provided a
      // no-audit mutator and onAuditBatch, in which case the parent is
      // delegating the entire row build to us).
      if (onAuditBatch) {
        const entries: import('../../hooks/useChangeAudit').ChangeAuditEntry[] = [];
        // Field changes — derive from the patch we just sent. Translate
        // domain keys (subject, scheduledStart, effort, etc.) back to the
        // Dataverse column names that TASK_FIELD_LABELS expects.
        if (fields.length > 0) {
          const after: Record<string, unknown> = {};
          if (patch.subject !== undefined)         after.msdyn_subject = patch.subject;
          if (patch.description !== undefined)     after.msdyn_description = patch.description;
          if (patch.scheduledStart !== undefined)  after.msdyn_scheduledstart = patch.scheduledStart;
          if (patch.scheduledEnd !== undefined)    after.msdyn_scheduledend = patch.scheduledEnd;
          if (patch.duration !== undefined)        after.msdyn_duration = patch.duration;
          if (patch.effort !== undefined)          after.msdyn_effort = patch.effort;
          if (patch.effortCompleted !== undefined) after.msdyn_effortcompleted = patch.effortCompleted;
          if (patch.priority !== undefined)        after.msdyn_priority = patch.priority;
          if (patch.isMilestone !== undefined)     after.msdyn_ismilestone = patch.isMilestone;
          if (patch.bucketId !== undefined)        after.msdyn_projectbucket = patch.bucketId;
          const fieldDiffs = diffEntityUpdate(t as unknown as Record<string, unknown>, after, TASK_FIELD_LABELS);
          entries.push(...fieldDiffs);
        }
        // Labels.
        labelDraftRemove.forEach((labelId) => {
          const name = labelNameById.get(labelId) ?? 'label';
          entries.push({ kind: 'relationship', relation: 'label', action: 'remove', label: name });
        });
        labelDraftAssign.forEach((labelId) => {
          const name = labelNameById.get(labelId) ?? 'label';
          entries.push({ kind: 'relationship', relation: 'label', action: 'add', label: name });
        });
        labelDraftRenames.forEach((newName, labelId) => {
          const oldName = labelNameById.get(labelId) ?? 'label';
          entries.push({ kind: 'relationship', relation: 'label', action: 'update', label: newName, old: oldName, new: newName });
        });
        // Assignees.
        assigneeDraftRemove.forEach((assignmentId) => {
          const name = assigneeNameByAssignmentId.get(assignmentId) ?? 'team member';
          entries.push({ kind: 'relationship', relation: 'assignee', action: 'remove', label: name });
        });
        assigneeDraftAdd.forEach((teamMemberId) => {
          const name = teamMemberNameById.get(teamMemberId) ?? 'team member';
          entries.push({ kind: 'relationship', relation: 'assignee', action: 'add', label: name });
        });
        // Checklist.
        checklistDraftRemove.forEach((checklistId) => {
          const name = checklistNameById.get(checklistId) ?? 'item';
          entries.push({ kind: 'relationship', relation: 'checklist', action: 'remove', label: name });
        });
        checklistDraftToggle.forEach((completed, checklistId) => {
          const name = checklistNameById.get(checklistId) ?? 'item';
          entries.push({ kind: 'relationship', relation: 'checklist', action: 'update', label: name, old: !completed, new: completed });
        });
        checklistDraftAdd.forEach((draft) => {
          entries.push({ kind: 'relationship', relation: 'checklist', action: 'add', label: draft.name });
        });
        if (entries.length > 0) {
          onAuditBatch(t.msdyn_projecttaskid, t.msdyn_subject, entries);
        }
      }
      const target = submitProgress.active?.returnTo;
      if (target && target !== returnTo) navigate(target);
    }
  }

  function handleDiscard() {
    resetDrafts();
  }

  async function handleDelete() {
    if (hasChildren && !confirm(`Delete "${t.msdyn_subject}" and all child tasks?`)) return;
    setSaving(true);
    try {
      await onDelete(t.msdyn_projecttaskid, hasChildren);
      onClose();
    } catch (err) {
      showError(`Failed to delete task: ${serializeError(err)}`);
      setSaving(false);
    }
  }


  return (
    <ViewDetailPanel
      open={true}
      onClose={onClose}
      title="Task Details"
      subtitle={t.msdyn_summary ? 'Summary task' : undefined}
      icon={t.msdyn_ismilestone ? <Flag className="h-5 w-5 text-amber-500" /> : undefined}
      actions={(
        <>
          {(saving || queueState.inFlight || isSubmitting || pipelineLocked) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSubmit}
            disabled={!isDirty || effortInvalid || hoursDoneInvalid || hoursDoneTooHigh || effortZeroedOut || isOptimistic || isSubmitting || pipelineLocked}
            title={isDirty ? 'Submit changes' : 'No changes to submit'}
            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 disabled:opacity-30"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDiscard}
            disabled={!isDirty || isSubmitting || pipelineLocked}
            title={isDirty ? 'Discard all changes' : 'No changes to discard'}
            className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </>
      )}
    >
      <div className="space-y-5 text-sm">

        {/* Error banner — sticky to top of scroll area so it's always visible */}
        {panelError && (
          <div className="sticky top-0 z-10 -mx-6 -mt-5 mb-2 flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1 break-words">{panelError}</span>
            <button onClick={() => setPanelError(null)} className="shrink-0 hover:opacity-70"><X className="h-3 w-3" /></button>
          </div>
        )}

        {/* Stage 6: inline error pinned after a failed Submit auto-nav. Surfaces
            exactly which fields PSS rejected so the user knows what to fix. */}
        {inlineError && (
          <div className="flex items-start gap-2 border border-rose-300 bg-rose-50 rounded-lg px-3 py-2 text-xs text-rose-900">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1 space-y-0.5">
              <div className="font-semibold">Couldn't save your changes</div>
              <div className="opacity-80 break-words">{inlineError.message}</div>
            </div>
            <button onClick={() => setInlineError(null)} className="shrink-0 hover:opacity-70"><X className="h-3 w-3" /></button>
          </div>
        )}

        {/* Stage 6.6: date-shrink + progress conflict dialog. Inline modal
            (no portal) since it sits inside the slide-in panel and only
            blocks panel interaction. */}
        {dateConflict && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40" onClick={() => setDateConflict(null)}>
            <div
              className="bg-card border border-border rounded-lg shadow-xl max-w-md w-[28rem] p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-foreground">Shorten the schedule, or keep the work?</h3>
                  <p className="text-xs text-muted-foreground">
                    You shortened this task's dates and changed its progress. With the new dates,
                    the {dateConflict.oldEffort}h of work currently planned won't fit — PSS will
                    shrink the budget to match the dates and your %% complete will jump.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={dateConflict.onKeep}
                  className="text-left rounded-md border border-border px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="text-xs font-semibold text-foreground">Keep {dateConflict.oldEffort} hours of work</div>
                  <div className="text-[11px] text-muted-foreground">Total effort stays the same. The task may end up over-scheduled for the new dates, but %% complete is honored.</div>
                </button>
                <button
                  onClick={dateConflict.onFit}
                  className="text-left rounded-md border border-border px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="text-xs font-semibold text-foreground">Fit the work to the new dates</div>
                  <div className="text-[11px] text-muted-foreground">Effort shrinks to fit. PSS recomputes %% complete from the new ratio (it will probably jump).</div>
                </button>
                <button
                  onClick={() => setDateConflict(null)}
                  className="text-xs text-muted-foreground hover:text-foreground self-end mt-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage 6.4: lock banner. The panel is editable but everything is
            disabled while this task is in the submit pipeline (active or
            queued). Without this banner the user has no idea why their
            inputs aren't responding. */}
        {pipelineLocked && (
          <div className="flex items-center gap-2 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-900">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
            <span className="font-semibold">
              {taskSubmitState === 'active' ? 'Saving changes…' : 'Waiting in queue…'}
            </span>
            <span className="opacity-80">
              Editing is locked until your last submit finishes.
            </span>
          </div>
        )}

        {/* Title */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Title<SavingDot active={savingFields.has('subject')} /></label>
          <input
            ref={subjectRef}
            value={subjectDraft}
            onChange={(e) => setSubjectDraft(e.target.value)}
            onBlur={commitSubject}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { setSubjectDraft(t.msdyn_subject); e.currentTarget.blur(); }
            }}
            disabled={isOptimistic || saving || pipelineLocked}
            className="w-full bg-transparent border-b border-border focus:border-primary outline-none text-sm font-medium pb-1 transition-colors disabled:opacity-50"
            placeholder="Task name"
          />
        </div>

        {/* Priority + badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority — editable (S2 PASS: 1=Urgent,3=Important,5=Medium,9=Low) */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest shrink-0">Priority<SavingDot active={savingFields.has('priority')} /></label>
            <select
              value={priorityDraft}
              onChange={(e) => commitPriority(Number(e.target.value))}
              disabled={saving || isOptimistic || pipelineLocked}
              className={cn(
                'text-[11px] border rounded px-1.5 py-0.5 outline-none focus:border-primary disabled:opacity-50',
                TASK_PRIORITY_META[priorityDraft]?.cls ?? 'bg-muted/20 border-border',
              )}
            >
              {TASK_PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {t.msdyn_ismilestone && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-0.5">
              <Flag className="h-2.5 w-2.5" /> Milestone
            </span>
          )}
          {t.msdyn_iscritical && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Critical Path</span>
          )}
        </div>

        {/* Labels — assigned chips + dropdown to add/rename, matching Planner UX */}
        {projectLabels.length > 0 && (() => {
          // Planner default names and colors — order matches Planner UI (confirmed from screenshot)
          const PLANNER_NAMES = [
            'Pink','Red','Yellow','Green','Blue','Purple','Bronze','Lime',
            'Aqua','Gray','Silver','Brown','Cranberry','Orange','Peach',
            'Marigold','Light green','Dark green','Teal','Light blue',
            'Dark blue','Lavender','Plum','Light gray','Dark gray',
          ];
          const PALETTE = [
            'bg-pink-400 text-white','bg-red-600 text-white','bg-yellow-300 text-yellow-900',
            'bg-green-600 text-white','bg-blue-600 text-white','bg-violet-600 text-white',
            'bg-amber-700 text-white','bg-lime-500 text-lime-900','bg-cyan-500 text-white',
            'bg-gray-400 text-white','bg-gray-300 text-gray-700','bg-amber-900 text-white',
            'bg-rose-800 text-white','bg-orange-500 text-white','bg-orange-300 text-orange-900',
            'bg-amber-400 text-amber-900','bg-emerald-400 text-emerald-900','bg-emerald-800 text-white',
            'bg-teal-600 text-white','bg-sky-400 text-sky-900','bg-blue-800 text-white',
            'bg-violet-300 text-violet-900','bg-purple-800 text-white','bg-slate-300 text-slate-700',
            'bg-slate-600 text-white',
          ];
          const idx = (ci: number) => (ci >= 192350000 ? ci - 192350000 : ci) % 25;
          const nameFor = (l: typeof projectLabels[0]) =>
            labelDraftRenames.get(l.msdyn_projectlabelid)
            ?? l.msdyn_projectlabeltext
            ?? PLANNER_NAMES[idx(l.msdyn_colorindex)]
            ?? 'Label';
          const colorFor = (ci: number) => PALETTE[idx(ci)] ?? 'bg-muted text-foreground';
          const taskJunctions = allTaskLabels.filter((tl) => tl['_msdyn_projecttaskid_value'] === t.msdyn_projecttaskid);
          const serverAssignedIds = new Set(taskJunctions.map((tl) => tl['_msdyn_projectlabelid_value'] as string));
          // Stage 6.2: apply local label drafts on top of server state for an
          // optimistic preview while the user composes their submit.
          const effectiveAssignedIds = new Set(serverAssignedIds);
          labelDraftRemove.forEach((id) => effectiveAssignedIds.delete(id));
          labelDraftAssign.forEach((id) => effectiveAssignedIds.add(id));
          const assigned = projectLabels.filter((l) => effectiveAssignedIds.has(l.msdyn_projectlabelid));
          const available = projectLabels.filter((l) => !effectiveAssignedIds.has(l.msdyn_projectlabelid));
          return (
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Labels</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {assigned.map((label) => {
                  if (renamingLabelId === label.msdyn_projectlabelid) {
                    return (
                      <span key={label.msdyn_projectlabelid} className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', colorFor(label.msdyn_colorindex))}>
                        <input
                          autoFocus
                          value={renameLabelDraft}
                          onChange={(e) => setRenameLabelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setRenamingLabelId(null); return; }
                            if (e.key === 'Enter') {
                              const name = renameLabelDraft.trim();
                              if (name && name !== nameFor(label)) {
                                // Stage 6.2: stage the rename in the draft map.
                                setLabelDraftRenames((prev) => {
                                  const next = new Map(prev);
                                  next.set(label.msdyn_projectlabelid, name);
                                  return next;
                                });
                              }
                              setRenamingLabelId(null);
                            }
                          }}
                          onBlur={() => {
                            const name = renameLabelDraft.trim();
                            if (name && name !== nameFor(label)) {
                              setLabelDraftRenames((prev) => {
                                const next = new Map(prev);
                                next.set(label.msdyn_projectlabelid, name);
                                return next;
                              });
                            }
                            setRenamingLabelId(null);
                          }}
                          className="bg-transparent outline-none border-b border-current w-20 text-[10px]"
                        />
                        <button onClick={() => setRenamingLabelId(null)} className="hover:opacity-70" title="Cancel">
                          <Check className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  }
                  return (
                    <span key={label.msdyn_projectlabelid} className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', colorFor(label.msdyn_colorindex))}>
                      {nameFor(label)}
                      <button
                        onClick={() => { setRenameLabelDraft(nameFor(label)); setRenamingLabelId(label.msdyn_projectlabelid); }}
                        className="hover:opacity-70 ml-0.5" title="Rename label"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          // Stage 6.2: draft only. If this label was a pending add,
                          // cancel that. Otherwise mark for removal on Submit.
                          const id = label.msdyn_projectlabelid;
                          setLabelDraftAssign((prev) => {
                            if (!prev.has(id)) return prev;
                            const next = new Set(prev); next.delete(id); return next;
                          });
                          setLabelDraftRemove((prev) => {
                            if (prev.has(id)) return prev;
                            const next = new Set(prev); next.add(id); return next;
                          });
                          // Also drop any pending rename for this label.
                          setLabelDraftRenames((prev) => {
                            if (!prev.has(id)) return prev;
                            const next = new Map(prev); next.delete(id); return next;
                          });
                        }}
                        className="hover:opacity-70" title="Remove label"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                {available.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
                        + Add label
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="text-xs max-h-60 overflow-y-auto">
                      {available.map((label) => (
                        <DropdownMenuItem
                          key={label.msdyn_projectlabelid}
                          onClick={() => {
                            // Stage 6.2: draft only. If this label was a pending
                            // remove, cancel that. Otherwise mark for assign on Submit.
                            const id = label.msdyn_projectlabelid;
                            setLabelDraftRemove((prev) => {
                              if (!prev.has(id)) return prev;
                              const next = new Set(prev); next.delete(id); return next;
                            });
                            setLabelDraftAssign((prev) => {
                              if (prev.has(id)) return prev;
                              const next = new Set(prev); next.add(id); return next;
                            });
                          }}
                        >
                          <span className={cn('inline-block w-3 h-3 rounded-full mr-2 shrink-0', colorFor(label.msdyn_colorindex))} />
                          {nameFor(label)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          );
        })()}

        {/* Sprint */}
        {sprints.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Sprint</label>
            <select
              value={t['_msdyn_projectsprint_value'] ?? ''}
              onChange={async (e) => {
                const val = e.target.value || null;
                const oldSprintId = t['_msdyn_projectsprint_value'] ?? null;
                const oldName = sprints.find((s) => s.msdyn_projectsprintid === oldSprintId)?.msdyn_name ?? 'no sprint';
                const newName = val ? (sprints.find((s) => s.msdyn_projectsprintid === val)?.msdyn_name ?? 'sprint') : 'no sprint';
                setSaving(true);
                try {
                  await setSprintMutation.mutateAsync({ taskId: t.msdyn_projecttaskid, sprintId: val });
                  // Sprint changes are immediate (not part of the panel's
                  // batched Submit), so emit a single-entry audit row of
                  // their own. relation='sprint' lets Wave 2 group them.
                  if (onAuditBatch) {
                    onAuditBatch(t.msdyn_projecttaskid, t.msdyn_subject, [
                      { kind: 'relationship', relation: 'sprint', action: 'update', label: newName, old: oldName, new: newName },
                    ]);
                  }
                } catch (err) {
                  showError(`Failed to set sprint: ${serializeError(err)}`);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || isOptimistic || setSprintMutation.isPending || pipelineLocked}
              className="text-xs border border-border rounded px-2 py-1.5 bg-muted/20 outline-none focus:border-primary disabled:opacity-50 w-full"
            >
              <option value="">No sprint</option>
              {sprints.map((s) => (
                <option key={s.msdyn_projectsprintid} value={s.msdyn_projectsprintid}>
                  {s.msdyn_name ?? s.msdyn_projectsprintid.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Stage 7: Effort + Hours done are the only editable progress inputs.
            % Complete is a read-only derived display below them — always shows
            (hoursDone / effort) on the user's draft, mirroring what PSS will
            compute. The card's progress bar is the canonical % display; this
            line in the panel is just feedback while the user types. */}
        {!t.msdyn_summary && (() => {
          const hoursDoneDisabled = saving || isOptimistic || pipelineLocked || effortForCheck === 0;
          const previewPct = effortForCheck > 0 && hoursDoneDraftNum !== undefined
            ? Math.min(100, Math.round((hoursDoneDraftNum / effortForCheck) * 100))
            : 0;
          return (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Hours done<SavingDot active={savingFields.has('effortCompleted')} /></label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={hoursDoneDraft}
                    onChange={(e) => setHoursDoneDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    disabled={hoursDoneDisabled}
                    placeholder="hours"
                    title={effortForCheck === 0 ? 'Set effort first' : undefined}
                    className="w-full text-xs bg-muted/30 border border-border rounded px-2 py-1.5 outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Effort (hours)<SavingDot active={savingFields.has('effort')} /></label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={effortDraft}
                    onChange={(e) => setEffortDraft(e.target.value)}
                    onBlur={commitEffort}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    disabled={saving || isOptimistic || pipelineLocked}
                    placeholder="hours"
                    className="w-full text-xs bg-muted/30 border border-border rounded px-2 py-1.5 outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
              </div>
              {hoursDoneTooHigh && (
                <div className="text-[11px] text-rose-700">Hours done can't exceed Effort ({effortForCheck}h).</div>
              )}
              {effortZeroedOut && (
                <div className="text-[11px] text-rose-700">Effort must be greater than 0 while Hours done is set. Either raise Effort or clear Hours done.</div>
              )}
              {effortForCheck === 0 && hoursDoneDraft === '' && (
                <div className="text-[10px] text-muted-foreground">Set Effort to enable Hours done.</div>
              )}
              {effortForCheck > 0 && (
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', previewPct >= 100 ? 'bg-emerald-500' : 'bg-primary')}
                      style={{ width: `${previewPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums w-10 text-right">{previewPct}%</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Milestone — read-only display; PSS does not allow updating msdyn_ismilestone (AV-0002) */}
        {!t.msdyn_summary && t.msdyn_ismilestone && (
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Milestone</label>
            <span className="text-[10px] font-medium px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 flex items-center gap-1">
              <Flag className="h-2.5 w-2.5" /> Milestone
            </span>
          </div>
        )}

        {/* Dates. Summary tasks are read-only — their dates are rolled up
            from child tasks by PSS, and editing them directly drifts the
            rollup until PSS re-syncs. */}
        {t.msdyn_summary ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Start
              </label>
              <div className="w-full text-xs bg-muted/20 border border-border rounded px-2 py-1.5 text-muted-foreground">
                {toDateInput(t.msdyn_scheduledstart) || '—'}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Due
              </label>
              <div className="w-full text-xs bg-muted/20 border border-border rounded px-2 py-1.5 text-muted-foreground">
                {toDateInput(t.msdyn_scheduledend ?? t.msdyn_finish) || '—'}
              </div>
            </div>
            <div className="col-span-2 text-[10px] text-muted-foreground">
              Rolled up from child tasks. Edit dates on the children to change them.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Start<SavingDot active={savingFields.has('scheduledStart')} />
              </label>
              <input
                type="date"
                value={toDateInput(startDraft)}
                onChange={(e) => commitStartDate(fromDateInput(e.target.value, startDraft || t.msdyn_scheduledstart) ?? '')}
                disabled={saving || isOptimistic || pipelineLocked}
                className="w-full text-xs bg-muted/30 border border-border rounded px-2 py-1.5 outline-none focus:border-primary transition-colors disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Due<SavingDot active={savingFields.has('scheduledEnd')} />
              </label>
              <input
                type="date"
                value={toDateInput(endDraft)}
                onChange={(e) => commitEndDate(fromDateInput(e.target.value, endDraft || t.msdyn_scheduledend || t.msdyn_finish) ?? '')}
                disabled={saving || isOptimistic || pipelineLocked}
                className="w-full text-xs bg-muted/30 border border-border rounded px-2 py-1.5 outline-none focus:border-primary transition-colors disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {/* Assignees */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Assignees</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {effectiveAssignees.map((a) => {
              const isPendingAdd = a.assignmentId.startsWith('pending-');
              return (
              <span
                key={a.assignmentId}
                className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary rounded-full px-2.5 py-1"
              >
                <span className="text-[10px] font-semibold">{initials(a.name)}</span>
                <span className="text-[10px] font-normal">{a.name.split(' ')[0]}</span>
                <button
                  onClick={() => {
                    // Stage 6.5: draft only.
                    if (isPendingAdd) {
                      // It was a pending add — cancel.
                      const teamMemberId = a.teamMemberId;
                      setAssigneeDraftAdd((prev) => {
                        if (!prev.has(teamMemberId)) return prev;
                        const next = new Set(prev); next.delete(teamMemberId); return next;
                      });
                    } else {
                      // Existing server assignment — mark for removal.
                      setAssigneeDraftRemove((prev) => {
                        if (prev.has(a.assignmentId)) return prev;
                        const next = new Set(prev); next.add(a.assignmentId); return next;
                      });
                    }
                  }}
                  className="hover:text-destructive transition-colors ml-0.5"
                  title={`Remove ${a.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              );
            })}
            {unassignedMembers.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-full px-2.5 py-1 transition-colors">
                    <UserPlus className="h-3 w-3" />
                    Assign
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="text-xs">
                  {unassignedMembers.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() => {
                        // Stage 6.5: draft only. If this person had a pending
                        // remove (existing server assignment), cancel that
                        // instead of staging a duplicate add.
                        const existingAssignment = assignees.find((a) => a.teamMemberId === m.id);
                        if (existingAssignment && assigneeDraftRemove.has(existingAssignment.assignmentId)) {
                          setAssigneeDraftRemove((prev) => {
                            if (!prev.has(existingAssignment.assignmentId)) return prev;
                            const next = new Set(prev); next.delete(existingAssignment.assignmentId); return next;
                          });
                          return;
                        }
                        setAssigneeDraftAdd((prev) => {
                          if (prev.has(m.id)) return prev;
                          const next = new Set(prev); next.add(m.id); return next;
                        });
                      }}
                    >
                      {m.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {effectiveAssignees.length === 0 && unassignedMembers.length === 0 && (
              <p className="text-xs text-muted-foreground">No team members</p>
            )}
          </div>
        </div>

        {/* Checklist — S6 PASS: msdyn_projectchecklist, FK _msdyn_projecttaskid_value */}
        {!t.msdyn_summary && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Checklist {checklists.length > 0 && `(${checklists.filter((c) => c.msdyn_projectchecklistcompleted).length}/${checklists.length})`}
            </label>
            {(() => {
              // Stage 6.5: apply checklist drafts on top of server state for the
              // optimistic preview while the user composes their submit.
              const visibleServerItems = checklists
                .filter((c) => !checklistDraftRemove.has(c.msdyn_projectchecklistid))
                .map((c) => ({
                  id: c.msdyn_projectchecklistid,
                  name: c.msdyn_name ?? '',
                  completed: checklistDraftToggle.get(c.msdyn_projectchecklistid) ?? c.msdyn_projectchecklistcompleted ?? false,
                  isDraftAdd: false,
                  isOptimistic: c.msdyn_projectchecklistid.startsWith('optimistic-'),
                }));
              const draftAddedItems = checklistDraftAdd.map((draft) => ({
                id: draft.tempId,
                name: draft.name,
                completed: false,
                isDraftAdd: true,
                isOptimistic: false,
              }));
              const effectiveItems = [...visibleServerItems, ...draftAddedItems];
              return (
                <div className="space-y-1">
                  {effectiveItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group/cl">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => {
                          // Stage 6.5: stage the toggle in the draft map. If a
                          // draft toggle would put the item back to its server
                          // state, drop the entry instead.
                          if (item.isDraftAdd) return; // pending add can't be toggled
                          const serverItem = checklists.find((c) => c.msdyn_projectchecklistid === item.id);
                          const serverCompleted = serverItem?.msdyn_projectchecklistcompleted ?? false;
                          const next = !item.completed;
                          setChecklistDraftToggle((prev) => {
                            const m = new Map(prev);
                            if (next === serverCompleted) m.delete(item.id);
                            else m.set(item.id, next);
                            return m;
                          });
                        }}
                        disabled={item.isOptimistic}
                        className="h-3.5 w-3.5 rounded accent-primary shrink-0"
                      />
                      <span className={cn('flex-1 text-xs', item.completed && 'line-through text-muted-foreground')}>
                        {item.name}
                      </span>
                      <button
                        onClick={() => {
                          // Stage 6.5: draft only. Pending adds: drop from add list.
                          // Server items: stage for removal.
                          if (item.isDraftAdd) {
                            setChecklistDraftAdd((prev) => prev.filter((dr) => dr.tempId !== item.id));
                            return;
                          }
                          setChecklistDraftRemove((prev) => {
                            if (prev.has(item.id)) return prev;
                            const next = new Set(prev); next.add(item.id); return next;
                          });
                          // Also drop any pending toggle on this item — about to be removed.
                          setChecklistDraftToggle((prev) => {
                            if (!prev.has(item.id)) return prev;
                            const m = new Map(prev); m.delete(item.id); return m;
                          });
                        }}
                        disabled={item.isOptimistic}
                        className="opacity-0 group-hover/cl:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="flex items-center gap-1.5">
              <input
                ref={checklistInputRef}
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitChecklistItem(); }
                  if (e.key === 'Escape') setNewChecklistText('');
                }}
                placeholder="Add item…"
                className="flex-1 text-xs bg-muted/30 border border-border rounded px-2 py-1.5 outline-none focus:border-primary transition-colors"
              />
              {newChecklistText.trim() && (
                <button
                  type="button"
                  onClick={commitChecklistItem}
                  title="Add item"
                  className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Delete */}
        {!t.msdyn_summary && (
          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
              onClick={handleDelete}
              disabled={saving || isOptimistic || pipelineLocked}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete task
            </Button>
          </div>
        )}

        {/* Notes — Dataverse annotation rows scoped to this task. Roll up
            into the project Notes tab via _objectid_value lookup. */}
        {!t.msdyn_summary && !isOptimistic && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Notes</label>
            <NotesSection
              compact
              scope={{ kind: 'task', projectId, taskId: t.msdyn_projecttaskid }}
            />
          </div>
        )}

        {/* Documents */}
        {!t.msdyn_summary && (
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Attachments</label>
            <DocumentLibrary
              compact
              recordType="Task"
              recordId={t.msdyn_projecttaskid}
              recordName={t.msdyn_subject ?? ''}
              projectId={projectId}
              taskId={t.msdyn_projecttaskid}
            />
          </div>
        )}

      </div>
    </ViewDetailPanel>
  );
}
