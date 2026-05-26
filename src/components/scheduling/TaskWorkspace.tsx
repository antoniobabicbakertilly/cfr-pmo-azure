/**
 * Phase 1 Task Workspace — replaces the read-only Planner-redirect Kanban.
 *
 * Renders tasks per bucket as a collapsible WBS hierarchy (not a flat list).
 * All task and bucket writes are in-app via the Project Operations scheduling API.
 * "Open in Planner" is retained as a secondary action for timeline view only.
 *
 * Phase 2 additions:
 * - Template apply prompt when a project has no tasks and a known CFR category
 * - Dependency manager dialog (add/remove Finish-to-Start predecessors per task)
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle, X, LayoutTemplate, Loader2, Link2, Trash2, Flag, ChevronRight, Search, SlidersHorizontal, LayoutGrid, List, BarChart3, Users, GanttChart } from 'lucide-react';
import { Button } from '../ui/button';
import { BucketSection } from './BucketSection';
import { CreateTaskDialog } from './CreateTaskDialog';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TaskFilterBar, EMPTY_FILTERS, hasActiveFilters, type TaskFilters } from './TaskFilterBar';
import { TaskListView } from './TaskListView';
import { TaskChartsView } from './TaskChartsView';
import { TaskPeopleView } from './TaskPeopleView';
import { TaskTimelineView } from './TaskTimelineView';
import { useProjectLabels, useProjectTaskLabels } from '../../hooks/useProjectLabels';
import type { TaskLabelChip } from '../../lib/labelPalette';
import { BUCKET_KEYS } from '../../hooks/useProjectBucketMutations';
import { createProjectBucket } from '../../api/projectBuckets.api';
import { enqueueBucketCreate } from '../../lib/bucketCreationQueue';
import { serializeError } from '../../lib/utils';
import { PROJECT_TEMPLATES, CFR_CATEGORY_LABELS } from '../../lib/projectTemplates';
import { applyProjectTemplate } from '../../lib/schedulingClient';
import { PSS_DELAY } from '../../hooks/useProjectTaskMutations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { ProjectTask } from '../../models/projectTask.model';
import type { ProjectBucket } from '../../models/projectBucket.model';
import type { ProjectTaskDependency } from '../../models/projectTaskDependency.model';
import type { ScheduleTaskCreate, ScheduleTaskUpdate } from '../../lib/schedulingClient';
import type { TaskAssignee, TaskTeamMember } from './TaskRow';
import { TASK_PRIORITY } from '../../lib/constants';
import type { TaskView } from '../../hooks/useUrlState';
import { READ_ONLY_TOOLTIP } from '../../hooks/useProjectPermissions';

interface Props {
  projectId: string;
  tasks: ProjectTask[];
  buckets: ProjectBucket[];
  dependencies: ProjectTaskDependency[];
  assignments: TaskAssignee[];
  teamMembers: TaskTeamMember[];
  onCreateTask: (params: ScheduleTaskCreate) => Promise<void>;
  onUpdateTask: (taskId: string, subject?: string, progress?: number, scheduledStart?: string, scheduledEnd?: string, isMilestone?: boolean, effortCompleted?: number) => Promise<void>;
  onUpdateTaskFull: (params: ScheduleTaskUpdate) => Promise<void>;
  /** Same shape as onUpdateTaskFull but skips auto-audit — used by the
   *  TaskDetailPanel which emits one batched audit row covering field +
   *  relationship changes. Falls back to onUpdateTaskFull when not provided. */
  onUpdateTaskFullNoAudit?: (params: ScheduleTaskUpdate) => Promise<void>;
  /** Called once per panel Submit with the full batched audit entry list. */
  onAuditTaskBatch?: (taskId: string, taskName: string, entries: import('../../hooks/useChangeAudit').ChangeAuditEntry[]) => void;
  onDeleteTask: (taskId: string, hasChildren: boolean) => Promise<void>;
  onCreateDependency: (successorTaskId: string, predecessorTaskId: string, linkType?: number) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<void>;
  onAssign: (taskId: string, teamMemberId: string) => Promise<void>;
  onUnassign: (taskId: string, assignmentId: string) => Promise<void>;
  onTasksInvalidate: () => void;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  activeView: TaskView;
  onActiveViewChange: (view: TaskView) => void;
  canEdit: boolean;
}

export function TaskWorkspace({
  projectId,
  tasks,
  buckets,
  dependencies,
  assignments,
  teamMembers,
  onCreateTask,
  onUpdateTask,
  onUpdateTaskFull,
  onUpdateTaskFullNoAudit,
  onAuditTaskBatch,
  onDeleteTask,
  onCreateDependency,
  onDeleteDependency,
  onAssign,
  onUnassign,
  onTasksInvalidate,
  selectedTaskId,
  onSelectTask,
  activeView,
  onActiveViewChange,
  canEdit,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogBucketId, setCreateDialogBucketId] = useState<string | undefined>();
  const [templateChooserOpen, setTemplateChooserOpen] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('');
  const [templateApplying, setTemplateApplying] = useState(false);
  const [depManagerTaskId, setDepManagerTaskId] = useState<string | null>(null);
  const [addingPredecessor, setAddingPredecessor] = useState(false);
  const [selectedPredecessorId, setSelectedPredecessorId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState<'bucket' | 'assignee' | 'priority' | 'progress'>('bucket');
  const [selectedLinkType, setSelectedLinkType] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const qc = useQueryClient();
  const handleError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 6000);
  }, []);

  useEffect(() => {
    if (selectedTaskId && tasks.length > 0 && !tasks.some((t) => t.msdyn_projecttaskid === selectedTaskId)) {
      onSelectTask(null);
    }
  }, [selectedTaskId, tasks, onSelectTask]);

  // Exclude the auto-generated project root summary task (outlinelevel=0). Closed tasks have null outlinelevel and are kept.
  const visibleTasks = tasks.filter((t) => (t.msdyn_outlinelevel ?? 1) > 0);

  // Count only leaf (non-summary) tasks — use all visibleTasks so header count is unaffected by search.
  const leafTasks = visibleTasks.filter((t) => !t.msdyn_summary && !t.msdyn_projecttaskid.startsWith('optimistic-'));
  const totalTasks = leafTasks.length;
  const completedTasks = leafTasks.filter((t) => {
    const p = t.msdyn_progress ?? 0;
    const pct = p > 0 && p <= 1 ? p * 100 : p;
    return t.statecode === 1 || pct >= 100;
  }).length;

  // ── Dependency map: successorTaskId → [{depId, predecessorTaskId, predecessorName, linkType}] ──
  const dependencyMap = useMemo(() => {
    const map = new Map<string, Array<{ depId: string; taskId: string; taskName: string; linkType: number }>>();
    for (const dep of dependencies) {
      const succId = dep['_msdyn_successortask_value'];
      const predId = dep['_msdyn_predecessortask_value'];
      if (!succId || !predId) continue;
      const predTask = tasks.find((t) => t.msdyn_projecttaskid === predId);
      const entry = { depId: dep.msdyn_projecttaskdependencyid, taskId: predId, taskName: predTask?.msdyn_subject ?? predId, linkType: dep.msdyn_linktype ?? 0 };
      const existing = map.get(succId) ?? [];
      existing.push(entry);
      map.set(succId, existing);
    }
    return map;
  }, [dependencies, tasks]);

  // ── Label data (lifted for Kanban chips) ─────────────────────────────────────
  const { data: projectLabels = [] } = useProjectLabels(projectId);
  const { data: allTaskLabels = [] } = useProjectTaskLabels(projectId);
  const taskLabelMap = useMemo((): Map<string, TaskLabelChip[]> => {
    const map = new Map<string, TaskLabelChip[]>();
    for (const tl of allTaskLabels) {
      const taskId = tl['_msdyn_projecttaskid_value'];
      const labelId = tl['_msdyn_projectlabelid_value'];
      if (!taskId || !labelId) continue;
      const label = projectLabels.find((l) => l.msdyn_projectlabelid === labelId);
      if (!label) continue;
      const chips = map.get(taskId) ?? [];
      chips.push({ labelId, colorIndex: label.msdyn_colorindex, labelText: label.msdyn_projectlabeltext ?? '' });
      map.set(taskId, chips);
    }
    return map;
  }, [allTaskLabels, projectLabels]);

  // ── Assignment map: taskId → [{assignmentId, teamMemberId, name}] ──
  const assignmentMap = useMemo(() => {
    const map = new Map<string, TaskAssignee[]>();
    for (const a of assignments) {
      if (!a.taskId) continue;
      const existing = map.get(a.taskId) ?? [];
      existing.push(a);
      map.set(a.taskId, existing);
    }
    return map;
  }, [assignments]);

  // ── Search filtering ──────────────────────────────────────────────────────────
  const normalSearch = searchTerm.trim().toLowerCase();
  const matchingIds = useMemo(() => {
    if (!normalSearch) return null;
    const matched = new Set<string>();
    for (const t of visibleTasks) {
      if (t.msdyn_subject.toLowerCase().includes(normalSearch)) matched.add(t.msdyn_projecttaskid);
    }
    // Include parent tasks of matches so WBS hierarchy stays intact
    for (const t of visibleTasks) {
      if (t['_msdyn_parenttask_value'] && matched.has(t.msdyn_projecttaskid)) {
        matched.add(t['_msdyn_parenttask_value']!);
      }
    }
    return matched;
  }, [visibleTasks, normalSearch]);

  const searchFiltered = matchingIds ? visibleTasks.filter((t) => matchingIds.has(t.msdyn_projecttaskid)) : visibleTasks;

  // Apply filter-bar filters on top of search.
  // Strategy: filter leaf (non-summary) tasks first, then include their WBS ancestors.
  // This prevents empty summary parents from appearing when all their children are filtered out.
  const displayTasks = useMemo(() => {
    const noFiltersActive =
      filters.assigneeIds.length === 0 &&
      filters.priorities.length === 0 &&
      filters.progressStates.length === 0 &&
      filters.dueDateRange === 'all' &&
      filters.labelIds.length === 0;
    if (noFiltersActive) return searchFiltered;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    // Step 1: filter leaf tasks only
    const matchedLeaves = searchFiltered.filter((t) => {
      if (t.msdyn_summary || t.msdyn_projecttaskid.startsWith('optimistic-')) return false;

      if (filters.assigneeIds.length > 0) {
        const taskAssignees = assignmentMap.get(t.msdyn_projecttaskid) ?? [];
        if (!taskAssignees.some((a) => filters.assigneeIds.includes(a.teamMemberId))) return false;
      }

      if (filters.priorities.length > 0) {
        if (!filters.priorities.includes(t.msdyn_priority ?? 5)) return false;
      }

      if (filters.progressStates.length > 0) {
        const raw = t.msdyn_progress ?? 0;
        const pct = raw > 0 && raw <= 1 ? raw * 100 : raw;
        const isDone = t.statecode === 1 || pct >= 100;
        const isStarted = pct > 0;
        const matches =
          (filters.progressStates.includes('complete') && isDone) ||
          (filters.progressStates.includes('in_progress') && isStarted && !isDone) ||
          (filters.progressStates.includes('not_started') && !isStarted && !isDone);
        if (!matches) return false;
      }

      if (filters.dueDateRange !== 'all') {
        const due = t.msdyn_scheduledend ?? t.msdyn_finish;
        if (!due) return false; // no due date → excluded from date filters
        const dueDate = new Date(due); dueDate.setHours(0, 0, 0, 0);
        if (filters.dueDateRange === 'overdue' && !(dueDate < today)) return false;
        if (filters.dueDateRange === 'this_week' && !(dueDate >= today && dueDate <= weekEnd)) return false;
        if (filters.dueDateRange === 'this_month' && !(dueDate >= today && dueDate <= monthEnd)) return false;
      }

      if (filters.labelIds.length > 0) {
        const chips = taskLabelMap.get(t.msdyn_projecttaskid) ?? [];
        if (!chips.some((c) => filters.labelIds.includes(c.labelId))) return false;
      }

      return true;
    });

    // Step 2: collect WBS ancestor IDs for matched leaves so the hierarchy is preserved
    const matchedIds = new Set(matchedLeaves.map((t) => t.msdyn_projecttaskid));
    const ancestorIds = new Set<string>();
    for (const t of matchedLeaves) {
      let parentId = t['_msdyn_parenttask_value'] ?? null;
      while (parentId && !ancestorIds.has(parentId)) {
        ancestorIds.add(parentId);
        const parent = searchFiltered.find((p) => p.msdyn_projecttaskid === parentId);
        parentId = parent?.['_msdyn_parenttask_value'] ?? null;
      }
    }

    // Step 3: return matched leaves + their ancestors only
    return searchFiltered.filter((t) =>
      matchedIds.has(t.msdyn_projecttaskid) || ancestorIds.has(t.msdyn_projecttaskid),
    );
  }, [searchFiltered, filters, assignmentMap]);

  const unassignedTasks = displayTasks.filter((t) => !t['_msdyn_projectbucket_value']);

  // ── Selected task panel ───────────────────────────────────────────────────────
  const selectedTask = selectedTaskId ? (tasks.find((t) => t.msdyn_projecttaskid === selectedTaskId) ?? null) : null;
  const selectedTaskAssignees = selectedTaskId ? (assignmentMap.get(selectedTaskId) ?? []) : [];
  const selectedTaskPredecessors = selectedTaskId ? (dependencyMap.get(selectedTaskId) ?? []) : [];
  const selectedTaskHasChildren = selectedTaskId ? tasks.some((t) => t['_msdyn_parenttask_value'] === selectedTaskId) : false;

  // ── Virtual group-by for board view ──────────────────────────────────────────
  // When groupBy !== 'bucket', compute synthetic column groups from displayTasks.
  // Each group renders as a BucketSection with bucket=null + groupDisplayName override.
  const boardGroups = useMemo((): Array<{ key: string; name: string; tasks: ProjectTask[] }> | null => {
    if (groupBy === 'bucket') return null;

    if (groupBy === 'priority') {
      const groups = [
        { key: 'urgent',    name: 'Urgent',    value: TASK_PRIORITY.Urgent },
        { key: 'important', name: 'Important', value: TASK_PRIORITY.Important },
        { key: 'medium',    name: 'Medium',    value: TASK_PRIORITY.Medium },
        { key: 'low',       name: 'Low',        value: TASK_PRIORITY.Low },
      ];
      return groups.map(({ key, name, value }) => ({
        key,
        name,
        tasks: displayTasks.filter((t) => (t.msdyn_priority ?? TASK_PRIORITY.Medium) === value),
      })).filter((g) => g.tasks.length > 0);
    }

    if (groupBy === 'assignee') {
      const groupMap = new Map<string, { name: string; tasks: ProjectTask[] }>();
      groupMap.set('__none', { name: 'Unassigned', tasks: [] });
      for (const tm of teamMembers) groupMap.set(tm.id, { name: tm.name, tasks: [] });
      for (const t of displayTasks) {
        const taskAssignees = assignmentMap.get(t.msdyn_projecttaskid) ?? [];
        if (taskAssignees.length === 0) {
          groupMap.get('__none')!.tasks.push(t);
        } else {
          for (const a of taskAssignees) {
            groupMap.get(a.teamMemberId)?.tasks.push(t);
          }
        }
      }
      return Array.from(groupMap.entries())
        .map(([key, { name, tasks }]) => ({ key, name, tasks }))
        .filter((g) => g.tasks.length > 0);
    }

    if (groupBy === 'progress') {
      const isPct = (t: ProjectTask) => { const r = t.msdyn_progress ?? 0; return r > 0 && r <= 1 ? r * 100 : r; };
      return [
        { key: 'not_started', name: 'Not started', tasks: displayTasks.filter((t) => !t.msdyn_summary && isPct(t) === 0 && t.statecode !== 1) },
        { key: 'in_progress', name: 'In progress',  tasks: displayTasks.filter((t) => !t.msdyn_summary && isPct(t) > 0 && isPct(t) < 100 && t.statecode !== 1) },
        { key: 'complete',    name: 'Complete',      tasks: displayTasks.filter((t) => !t.msdyn_summary && (t.statecode === 1 || isPct(t) >= 100)) },
      ].filter((g) => g.tasks.length > 0);
    }

    return null;
  }, [groupBy, displayTasks, assignmentMap, teamMembers]);

  // ── Drag-and-drop bucket move ─────────────────────────────────────────────────
  const handleMoveTaskToBucket = useCallback(
    (taskId: string, targetBucketId: string) => {
      const task = tasks.find((t) => t.msdyn_projecttaskid === taskId);
      if (!task || task['_msdyn_projectbucket_value'] === targetBucketId) return;
      onUpdateTaskFull({ taskId, bucketId: targetBucketId });
    },
    [tasks, onUpdateTaskFull],
  );

  const dragEnabled = activeView === 'board' && groupBy === 'bucket' && canEdit;

  // ── Template apply ────────────────────────────────────────────────────────────
  const TEMPLATE_OPTIONS = Object.entries(PROJECT_TEMPLATES).map(([key, tTasks]) => ({
    key,
    label: CFR_CATEGORY_LABELS[Number(key)] ?? key,
    count: tTasks!.length,
    milestones: tTasks!.filter((t) => t.isMilestone).length,
  }));

  async function handleApplyTemplate() {
    const tTasks = PROJECT_TEMPLATES[Number(selectedTemplateKey)];
    if (!tTasks) return;
    setTemplateApplying(true);
    setTemplateChooserOpen(false);
    try {
      await applyProjectTemplate(projectId, tTasks);
      await new Promise((r) => setTimeout(r, PSS_DELAY.TEMPLATE));
      onTasksInvalidate();
    } catch (err) {
      handleError(`Failed to apply template: ${serializeError(err)}`);
    } finally {
      setTemplateApplying(false);
      setSelectedTemplateKey('');
    }
  }

  function openCreateDialog(bucketId?: string) {
    setCreateDialogBucketId(bucketId);
    setCreateDialogOpen(true);
  }

  function handleAddBucket() {
    // buckets already includes any previously-injected optimistic entries, so
    // length+1 gives the correct sequential name without double-counting.
    const name = `Bucket ${buckets.length + 1}`;
    const lastOrder = buckets[buckets.length - 1]?.msdyn_displayorder ?? 0;
    const displayOrder = lastOrder + 1000;
    const optimisticId = `optimistic-${Date.now()}`;

    qc.setQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId), (old) => [
      ...(old ?? []),
      { msdyn_projectbucketid: optimisticId, msdyn_name: name, msdyn_displayorder: displayOrder, statecode: 0, '_msdyn_project_value': projectId },
    ]);

    enqueueBucketCreate(
      optimisticId,
      () =>
        createProjectBucket(projectId, name, displayOrder).then(
          () => new Promise<void>((r) => setTimeout(r, PSS_DELAY.BUCKET)),
        ).catch((err) => {
          handleError(`Failed to create bucket: ${serializeError(err)}`);
        }),
      () => qc.invalidateQueries({ queryKey: BUCKET_KEYS.forProject(projectId) }),
    );
  }

  // ── Dependency manager ────────────────────────────────────────────────────────
  const depManagerTask = depManagerTaskId
    ? tasks.find((t) => t.msdyn_projecttaskid === depManagerTaskId)
    : null;
  const depManagerPredecessors = depManagerTaskId ? (dependencyMap.get(depManagerTaskId) ?? []) : [];

  const availablePredecessors = tasks.filter(
    (t) =>
      !t.msdyn_summary &&
      t.msdyn_projecttaskid !== depManagerTaskId &&
      !t.msdyn_projecttaskid.startsWith('optimistic-') &&
      !depManagerPredecessors.some((p) => p.taskId === t.msdyn_projecttaskid),
  );

  async function handleAddPredecessor() {
    if (!depManagerTaskId || !selectedPredecessorId) return;
    setAddingPredecessor(true);
    try {
      await onCreateDependency(depManagerTaskId, selectedPredecessorId, selectedLinkType);
      setSelectedPredecessorId('');
    } catch (err) {
      handleError(`Failed to add dependency: ${serializeError(err)}`);
    } finally {
      setAddingPredecessor(false);
    }
  }

  async function handleRemovePredecessor(depId: string) {
    try {
      await onDeleteDependency(depId);
    } catch (err) {
      handleError(`Failed to remove dependency: ${serializeError(err)}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground shrink-0">
          {totalTasks} task{totalTasks !== 1 ? 's' : ''} · {completedTasks} completed
        </p>
        {/* Search */}
        <div className="relative flex-1 max-w-xs min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 h-8 text-xs bg-muted/30 border border-border rounded-md outline-none focus:border-primary transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => onActiveViewChange('board')}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${activeView === 'board' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button
              onClick={() => onActiveViewChange('list')}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${activeView === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => onActiveViewChange('timeline')}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${activeView === 'timeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <GanttChart className="h-3.5 w-3.5" /> Timeline
            </button>
            <button
              onClick={() => onActiveViewChange('charts')}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${activeView === 'charts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Charts
            </button>
            <button
              onClick={() => onActiveViewChange('people')}
              className={`px-2 py-1.5 text-xs flex items-center gap-1 transition-colors ${activeView === 'people' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Users className="h-3.5 w-3.5" /> People
            </button>
          </div>
          {/* Group-by (board view only) */}
          {activeView === 'board' && (
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              className="text-xs border border-border rounded px-2 py-1 bg-muted/20 outline-none focus:border-primary h-8"
              title="Group by"
            >
              <option value="bucket">Group: Bucket</option>
              <option value="assignee">Group: Assignee</option>
              <option value="priority">Group: Priority</option>
              <option value="progress">Group: Progress</option>
            </select>
          )}
          {/* Filter toggle */}
          <Button
            size="sm"
            variant={showFilters || hasActiveFilters(filters) ? 'default' : 'outline'}
            onClick={() => setShowFilters((v) => !v)}
            className={hasActiveFilters(filters) ? 'ring-2 ring-primary/40' : ''}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Filters{hasActiveFilters(filters) ? ' •' : ''}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setSelectedTemplateKey(''); setTemplateChooserOpen(true); }}
            disabled={templateApplying || !canEdit}
            title={!canEdit ? READ_ONLY_TOOLTIP : undefined}
          >
            <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
            Apply Template
          </Button>
          <Button size="sm" onClick={() => openCreateDialog()} disabled={!canEdit} title={!canEdit ? READ_ONLY_TOOLTIP : undefined}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Task
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:opacity-70">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Template applying indicator */}
      {templateApplying && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          Applying template… PSS takes ~25s to persist changes
        </div>
      )}

      {/* Filter bar */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <TaskFilterBar
            filters={filters}
            teamMembers={teamMembers}
            assignments={assignments}
            projectLabels={projectLabels}
            onChange={setFilters}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
        </div>
      )}

      {/* List view */}
      {activeView === 'list' && (
        <TaskListView
          tasks={displayTasks.filter((t) => !t.msdyn_summary || displayTasks.some((c) => c['_msdyn_parenttask_value'] === t.msdyn_projecttaskid))}
          assignmentMap={assignmentMap}
          onSelectTask={onSelectTask}
        />
      )}

      {/* Timeline view */}
      {activeView === 'timeline' && (
        <TaskTimelineView tasks={displayTasks} dependencies={dependencies} onSelectTask={onSelectTask} />
      )}

      {/* Charts view */}
      {activeView === 'charts' && (
        <TaskChartsView tasks={visibleTasks} buckets={buckets} />
      )}

      {/* People view */}
      {activeView === 'people' && (
        <TaskPeopleView tasks={visibleTasks} assignments={assignments} teamMembers={teamMembers} buckets={buckets} onAddTask={() => setCreateDialogOpen(true)} />
      )}

      {/* Kanban board */}
      {activeView === 'board' && (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {boardGroups ? (
          // Virtual group-by columns
          boardGroups.map((group) => (
            <BucketSection
              key={group.key}
              projectId={projectId}
              bucket={null}
              groupDisplayName={group.name}
              tasks={group.tasks}
              dependencyMap={dependencyMap}
              assignmentMap={assignmentMap}
              taskLabelMap={taskLabelMap}
              teamMembers={teamMembers}
              onCreateTask={onCreateTask}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
              onOpenCreateDialog={() => openCreateDialog(undefined)}
              onManageDependencies={setDepManagerTaskId}
              onAssign={onAssign}
              onUnassign={onUnassign}
              onError={handleError}
              onSelectTask={onSelectTask}
              forceExpandCompleted={filters.progressStates.includes('complete')}
              canEdit={canEdit}
            />
          ))
        ) : (
          <>
            {/* Unassigned column — only shown if tasks exist without a bucket */}
            {unassignedTasks.length > 0 && (
              <BucketSection
                projectId={projectId}
                bucket={null}
                tasks={unassignedTasks}
                dependencyMap={dependencyMap}
                assignmentMap={assignmentMap}
                taskLabelMap={taskLabelMap}
                teamMembers={teamMembers}
                onCreateTask={onCreateTask}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onOpenCreateDialog={() => openCreateDialog(undefined)}
                onManageDependencies={setDepManagerTaskId}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onError={handleError}
                onSelectTask={onSelectTask}
                forceExpandCompleted={filters.progressStates.includes('complete')}
                enableDrag={dragEnabled}
                canEdit={canEdit}
              />
            )}

            {buckets.map((bucket) => (
              <BucketSection
                key={bucket.msdyn_projectbucketid}
                projectId={projectId}
                bucket={bucket}
                tasks={displayTasks.filter(
                  (t) => t['_msdyn_projectbucket_value'] === bucket.msdyn_projectbucketid,
                )}
                dependencyMap={dependencyMap}
                assignmentMap={assignmentMap}
                taskLabelMap={taskLabelMap}
                teamMembers={teamMembers}
                onCreateTask={onCreateTask}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
                onOpenCreateDialog={() => openCreateDialog(bucket.msdyn_projectbucketid)}
                onManageDependencies={setDepManagerTaskId}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onError={handleError}
                onSelectTask={onSelectTask}
                forceExpandCompleted={filters.progressStates.includes('complete')}
                onMoveTaskToBucket={handleMoveTaskToBucket}
                enableDrag={dragEnabled}
                canEdit={canEdit}
              />
            ))}

            {/* Add bucket button */}
            <div className="flex-shrink-0 w-12 flex items-start pt-2">
              <button
                onClick={handleAddBucket}
                disabled={!canEdit}
                className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
                title={!canEdit ? READ_ONLY_TOOLTIP : "Add bucket"}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {/* Create task dialog */}
      <CreateTaskDialog
        open={createDialogOpen}
        projectId={projectId}
        buckets={buckets}
        defaultBucketId={createDialogBucketId}
        tasks={visibleTasks}
        onCreateTask={onCreateTask}
        onError={handleError}
        onClose={() => setCreateDialogOpen(false)}
      />

      {/* Phase 2B: Template chooser dialog */}
      <Dialog open={templateChooserOpen} onOpenChange={(o) => { if (!o) setTemplateChooserOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply WBS Template</DialogTitle>
            <DialogDescription>
              Choose a template to create a standard task structure. Tasks land in the Unassigned column and can be moved to buckets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {TEMPLATE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSelectedTemplateKey(opt.key)}
                className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  selectedTemplateKey === opt.key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/30'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {opt.count} tasks · {opt.milestones} milestones
                  </p>
                </div>
                {selectedTemplateKey === opt.key && (
                  <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground pt-1">
            Template task lists are maintained in <code className="font-mono">lib/projectTemplates.ts</code> in the app source.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateChooserOpen(false)}>Cancel</Button>
            <Button disabled={!selectedTemplateKey} onClick={handleApplyTemplate}>
              <Flag className="h-3.5 w-3.5 mr-1.5" />
              Apply {selectedTemplateKey ? (CFR_CATEGORY_LABELS[Number(selectedTemplateKey)] ?? '') : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          projectId={projectId}
          hasChildren={selectedTaskHasChildren}
          predecessors={selectedTaskPredecessors}
          assignees={selectedTaskAssignees}
          teamMembers={teamMembers}
          onClose={() => onSelectTask(null)}
          onUpdate={onUpdateTaskFullNoAudit ?? onUpdateTaskFull}
          onAuditBatch={onAuditTaskBatch}
          onDelete={onDeleteTask}
          onAssign={onAssign}
          onUnassign={onUnassign}
          onManageDependencies={() => setDepManagerTaskId(selectedTask.msdyn_projecttaskid)}
          onError={handleError}
          onTasksInvalidate={onTasksInvalidate}
        />
      )}

      {/* Phase 2C: Dependency manager dialog */}
      <Dialog open={!!depManagerTaskId} onOpenChange={(o) => { if (!o) setDepManagerTaskId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dependencies</DialogTitle>
            <DialogDescription>
              {depManagerTask
                ? depManagerTask.msdyn_subject.length > 55
                  ? `${depManagerTask.msdyn_subject.slice(0, 55)}…`
                  : depManagerTask.msdyn_subject
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1 max-h-80 overflow-y-auto">
            {/* Current predecessors */}
            {depManagerPredecessors.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Predecessors</p>
                {depManagerPredecessors.map((pred) => {
                  const lt = ['FS','FF','SS','SF'][pred.linkType] ?? 'FS';
                  return (
                    <div key={pred.depId} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate text-xs">{pred.taskName}</span>
                        <span className="text-[10px] font-medium px-1 rounded bg-muted text-muted-foreground shrink-0">{lt}</span>
                      </div>
                      <button
                        onClick={() => handleRemovePredecessor(pred.depId)}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No predecessors defined.</p>
            )}

            {/* Add predecessor */}
            {availablePredecessors.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Add Predecessor</p>
                <div className="flex gap-2">
                  <Select value={selectedPredecessorId} onValueChange={setSelectedPredecessorId}>
                    <SelectTrigger className="flex-1 h-9 text-sm">
                      <SelectValue placeholder="— Select task —" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePredecessors.map((t) => (
                        <SelectItem key={t.msdyn_projecttaskid} value={t.msdyn_projecttaskid}>
                          {t.msdyn_subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <select
                    value={selectedLinkType}
                    onChange={(e) => setSelectedLinkType(Number(e.target.value))}
                    className="text-xs border border-border rounded px-2 h-9 bg-muted/20 outline-none focus:border-primary"
                    title="Link type"
                  >
                    <option value={0}>FS</option>
                    <option value={1}>FF</option>
                    <option value={2}>SS</option>
                    <option value={3}>SF</option>
                  </select>
                  <Button
                    size="sm"
                    disabled={!selectedPredecessorId || addingPredecessor}
                    onClick={handleAddPredecessor}
                  >
                    {addingPredecessor ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDepManagerTaskId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
