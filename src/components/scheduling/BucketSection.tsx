import { READ_ONLY_TOOLTIP } from '../../hooks/useProjectPermissions';
import { useState, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { TaskRow } from './TaskRow';
import { useRenameProjectBucket, useDeleteProjectBucket, BUCKET_KEYS } from '../../hooks/useProjectBucketMutations';
import { cancelBucketCreate } from '../../lib/bucketCreationQueue';
import { buildTaskTree, type TaskNode } from './taskTree';
import { serializeError } from '../../lib/utils';
import type { ProjectTask } from '../../models/projectTask.model';
import type { ProjectBucket } from '../../models/projectBucket.model';
import type { ScheduleTaskCreate } from '../../lib/schedulingClient';
import type { TaskAssignee, TaskTeamMember } from './TaskRow';
import type { TaskLabelChip } from '../../lib/labelPalette';

interface Props {
  projectId: string;
  bucket: ProjectBucket | null;
  tasks: ProjectTask[];
  dependencyMap: Map<string, Array<{ depId: string; taskId: string; taskName: string }>>;
  assignmentMap: Map<string, TaskAssignee[]>;
  teamMembers: TaskTeamMember[];
  onCreateTask: (params: ScheduleTaskCreate) => Promise<void>;
  onUpdateTask: (taskId: string, subject?: string, progress?: number, scheduledStart?: string, scheduledEnd?: string, isMilestone?: boolean, effortCompleted?: number) => Promise<void>;
  onDeleteTask: (taskId: string, hasChildren: boolean) => Promise<void>;
  onOpenCreateDialog: () => void;
  onManageDependencies: (taskId: string) => void;
  onAssign: (taskId: string, teamMemberId: string) => Promise<void>;
  onUnassign: (taskId: string, assignmentId: string) => Promise<void>;
  onError: (msg: string) => void;
  onSelectTask?: (taskId: string) => void;
  groupDisplayName?: string;
  forceExpandCompleted?: boolean;
  taskLabelMap?: Map<string, TaskLabelChip[]>;
  onMoveTaskToBucket?: (taskId: string, targetBucketId: string) => void;
  enableDrag?: boolean;
  canEdit?: boolean;
}

export function BucketSection({
  projectId,
  bucket,
  tasks,
  dependencyMap,
  assignmentMap,
  teamMembers,
  onCreateTask: _onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onOpenCreateDialog,
  onManageDependencies,
  onAssign,
  onUnassign,
  onError,
  onSelectTask,
  groupDisplayName,
  forceExpandCompleted,
  taskLabelMap,
  onMoveTaskToBucket,
  enableDrag,
  canEdit = true,
}: Props) {
  const [renamingBucket, setRenamingBucket] = useState(false);
  const [renameValue, setRenameValue] = useState(bucket?.msdyn_name ?? '');
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [dragOverCount, setDragOverCount] = useState(0);

  // Auto-expand the completed section when the Complete filter is active
  useEffect(() => {
    setCompletedCollapsed(!forceExpandCompleted);
  }, [forceExpandCompleted]);
  const renameRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const renameBucket = useRenameProjectBucket(projectId);
  const deleteBucket = useDeleteProjectBucket(projectId);

  const tree = buildTaskTree(tasks);

  function isNodeDone(task: typeof tasks[0]) {
    const p = task.msdyn_progress ?? 0;
    const pct = p > 0 && p <= 1 ? p * 100 : p;
    return task.statecode === 1 || pct >= 100;
  }

  // Split at the root level only — keeps WBS hierarchy intact within each section.
  const activeRoots = tree.filter((n) => !isNodeDone(n.task));
  const completedRoots = tree.filter((n) => isNodeDone(n.task));

  // Active non-summary leaf tasks for badge count and delete confirmation.
  const activeTasks = tasks.filter((t) =>
    !t.msdyn_summary &&
    !t.msdyn_projecttaskid.startsWith('optimistic-') &&
    !isNodeDone(t),
  );

  async function commitRename() {
    if (!bucket || !renameValue.trim() || renameValue === bucket.msdyn_name) {
      setRenamingBucket(false);
      return;
    }
    try {
      await renameBucket.mutateAsync({ bucketId: bucket.msdyn_projectbucketid, name: renameValue.trim() });
    } catch (err) {
      onError(`Failed to rename bucket: ${serializeError(err)}`);
    } finally {
      setRenamingBucket(false);
    }
  }

  async function handleDeleteBucket() {
    if (!bucket) return;

    // Optimistic bucket still spinning — cancel the queued PSS create and remove from cache.
    if (bucket.msdyn_projectbucketid.startsWith('optimistic-')) {
      cancelBucketCreate(bucket.msdyn_projectbucketid);
      qc.setQueryData<ProjectBucket[]>(BUCKET_KEYS.forProject(projectId), (old) =>
        (old ?? []).filter((b) => b.msdyn_projectbucketid !== bucket.msdyn_projectbucketid),
      );
      return;
    }

    if (activeTasks.length > 0 && !confirm(`Delete "${bucket.msdyn_name}" and its ${activeTasks.length} task(s)?`)) return;
    try {
      await deleteBucket.mutateAsync(bucket.msdyn_projectbucketid);
    } catch (err) {
      onError(`Failed to delete bucket: ${serializeError(err)}`);
    }
  }


  return (
    <div
      className={`flex-shrink-0 w-60 flex flex-col rounded-xl border bg-muted/20 overflow-hidden transition-colors ${dragOverCount > 0 && bucket ? 'border-primary bg-primary/5' : 'border-border'}`}
      onDragOver={bucket && onMoveTaskToBucket ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
      onDragEnter={bucket && onMoveTaskToBucket ? () => setDragOverCount((c) => c + 1) : undefined}
      onDragLeave={bucket && onMoveTaskToBucket ? () => setDragOverCount((c) => c - 1) : undefined}
      onDrop={bucket && onMoveTaskToBucket ? (e) => {
        e.preventDefault();
        setDragOverCount(0);
        const taskId = e.dataTransfer.getData('application/x-task-id');
        if (taskId) onMoveTaskToBucket(taskId, bucket.msdyn_projectbucketid);
      } : undefined}
    >
      {/* Bucket header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-card/50">
        {renamingBucket ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setRenamingBucket(false); setRenameValue(bucket?.msdyn_name ?? ''); }
              }}
              className="flex-1 min-w-0 text-xs font-semibold bg-transparent border-b border-primary outline-none"
              autoFocus
            />
            <button onClick={commitRename} className="shrink-0 text-primary hover:opacity-70">
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <h4
            className={`text-xs font-semibold text-foreground truncate flex-1 ${bucket && canEdit ? 'cursor-pointer hover:text-primary' : ''}`}
            onClick={() => {
              if (!bucket || !canEdit) return;
              setRenameValue(bucket.msdyn_name);
              setRenamingBucket(true);
              setTimeout(() => renameRef.current?.focus(), 50);
            }}
            title={bucket && canEdit ? 'Click to rename' : undefined}
          >
            {groupDisplayName ?? (bucket ? bucket.msdyn_name : 'Unassigned')}
          </h4>
        )}

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <span className="text-[11px] text-muted-foreground">{activeTasks.length}</span>

          {bucket && !groupDisplayName && canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => {
                  setRenameValue(bucket.msdyn_name);
                  setRenamingBucket(true);
                }}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDeleteBucket}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete bucket
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Task tree */}
      <div className="p-1.5 space-y-0.5 flex-1 min-h-[60px]">
        {/* Active tasks */}
        {activeRoots.map((node) => (
          <TaskRowTree
            key={node.task.msdyn_projecttaskid}
            node={node}
            projectId={projectId}
            dependencyMap={dependencyMap}
            assignmentMap={assignmentMap}
            teamMembers={teamMembers}
            taskLabelMap={taskLabelMap}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            onOpenCreateDialog={onOpenCreateDialog}
            onManageDependencies={onManageDependencies}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onError={onError}
            onSelectTask={onSelectTask}
            enableDrag={enableDrag}
          />
        ))}

        {/* Completed section — collapsed by default, matching Planner */}
        {completedRoots.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setCompletedCollapsed((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground w-full px-1 py-0.5 rounded transition-colors"
            >
              {completedCollapsed
                ? <ChevronRight className="h-3 w-3 shrink-0" />
                : <ChevronDown className="h-3 w-3 shrink-0" />}
              Complete ({completedRoots.length})
            </button>
            {!completedCollapsed && (
              <div className="space-y-0.5 mt-0.5">
                {completedRoots.map((node) => (
                  <TaskRowTree
                    key={node.task.msdyn_projecttaskid}
                    node={node}
                    projectId={projectId}
                    dependencyMap={dependencyMap}
                    assignmentMap={assignmentMap}
                    teamMembers={teamMembers}
                    taskLabelMap={taskLabelMap}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                    onOpenCreateDialog={onOpenCreateDialog}
                    onManageDependencies={onManageDependencies}
                    onAssign={onAssign}
                    onUnassign={onUnassign}
                    onError={onError}
                    onSelectTask={onSelectTask}
                    enableDrag={enableDrag}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add task button. Disabled while the bucket is still an optimistic placeholder —
            its ID is "optimistic-<ts>" which is not a valid GUID for the OData bucket bind. */}
        {bucket && bucket.msdyn_projectbucketid.startsWith('optimistic-') ? (
          <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground italic">
            Saving bucket…
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenCreateDialog}
              disabled={!canEdit}
              title={!canEdit ? READ_ONLY_TOOLTIP : undefined}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 w-full rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
            >
              <Plus className="h-3 w-3" /> Add task
            </button>
            <button
              onClick={onOpenCreateDialog}
              disabled={!canEdit}
              title={!canEdit ? READ_ONLY_TOOLTIP : "Add task with details"}
              className="text-muted-foreground hover:text-foreground px-1 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Internal recursive renderer for a task tree node
function TaskRowTree({
  node,
  projectId,
  depth = 0,
  dependencyMap,
  assignmentMap,
  teamMembers,
  taskLabelMap,
  onUpdateTask,
  onDeleteTask,
  onOpenCreateDialog,
  onManageDependencies,
  onAssign,
  onUnassign,
  onError,
  onSelectTask,
  enableDrag,
}: {
  node: TaskNode;
  projectId: string;
  depth?: number;
  dependencyMap: Props['dependencyMap'];
  assignmentMap: Props['assignmentMap'];
  teamMembers: Props['teamMembers'];
  taskLabelMap?: Props['taskLabelMap'];
  onUpdateTask: Props['onUpdateTask'];
  onDeleteTask: Props['onDeleteTask'];
  onOpenCreateDialog: Props['onOpenCreateDialog'];
  onManageDependencies: Props['onManageDependencies'];
  onAssign: Props['onAssign'];
  onUnassign: Props['onUnassign'];
  onError: Props['onError'];
  onSelectTask?: Props['onSelectTask'];
  enableDrag?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const predecessors = dependencyMap.get(node.task.msdyn_projecttaskid) ?? [];
  const assignees = assignmentMap.get(node.task.msdyn_projecttaskid) ?? [];

  return (
    <div>
      <TaskRow
        task={node.task}
        depth={depth}
        hasChildren={hasChildren}
        collapsed={collapsed}
        predecessors={predecessors}
        assignees={assignees}
        teamMembers={teamMembers}
        taskLabelMap={taskLabelMap}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onUpdate={onUpdateTask}
        onDelete={onDeleteTask}
        onManageDependencies={() => onManageDependencies(node.task.msdyn_projecttaskid)}
        onAssign={onAssign}
        onUnassign={onUnassign}
        onError={onError}
        onSelectTask={onSelectTask}
        isDraggable={enableDrag && !hasChildren && !node.task.msdyn_summary}
      />
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <TaskRowTree
              key={child.task.msdyn_projecttaskid}
              node={child}
              projectId={projectId}
              depth={depth + 1}
              dependencyMap={dependencyMap}
              assignmentMap={assignmentMap}
              teamMembers={teamMembers}
              taskLabelMap={taskLabelMap}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
              onOpenCreateDialog={onOpenCreateDialog}
              onManageDependencies={onManageDependencies}
              onAssign={onAssign}
              onUnassign={onUnassign}
              onError={onError}
              onSelectTask={onSelectTask}
              enableDrag={enableDrag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
