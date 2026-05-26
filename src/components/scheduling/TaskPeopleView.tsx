import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ProjectTask } from '../../models/projectTask.model';
import type { ProjectBucket } from '../../models/projectBucket.model';
import type { TaskAssignee, TaskTeamMember } from './TaskRow';

interface Props {
  tasks: ProjectTask[];
  assignments: TaskAssignee[];
  teamMembers: TaskTeamMember[];
  buckets: ProjectBucket[];
  onAddTask?: (bucketId?: string) => void;
}

function taskProgress(t: ProjectTask) {
  const p = t.msdyn_progress ?? 0;
  return p > 0 && p <= 1 ? p * 100 : p;
}

function isDone(t: ProjectTask) {
  return t.statecode === 1 || taskProgress(t) >= 100;
}

function isLate(t: ProjectTask) {
  const due = t.msdyn_scheduledend ?? t.msdyn_finish;
  return !isDone(t) && !!due && new Date(due) < new Date();
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

interface BucketGroup {
  bucketId: string;
  bucketName: string;
  tasks: ProjectTask[];
}

function groupByBucket(memberTasks: ProjectTask[], buckets: ProjectBucket[]): BucketGroup[] {
  const groups = new Map<string, BucketGroup>();
  for (const t of memberTasks) {
    const id = t['_msdyn_projectbucket_value'] ?? '__none__';
    if (!groups.has(id)) {
      const bucket = buckets.find((b) => b.msdyn_projectbucketid === id);
      const name =
        (t['_msdyn_projectbucket_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ??
        bucket?.msdyn_name ??
        'Unassigned';
      groups.set(id, { bucketId: id, bucketName: name, tasks: [] });
    }
    groups.get(id)!.tasks.push(t);
  }
  return [...groups.values()];
}

function TaskBucketGroup({ group }: { group: BucketGroup }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1 w-full text-left px-1 py-1 text-xs font-semibold text-foreground hover:text-primary transition-colors"
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        <span className="flex-1 truncate">{group.bucketName}</span>
        <span className="text-[10px] text-muted-foreground font-normal">{group.tasks.length}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-px">
          {group.tasks.map((t) => {
            const done = isDone(t);
            const late = isLate(t);
            return (
              <div
                key={t.msdyn_projecttaskid}
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2 shrink-0 mt-px transition-colors',
                    done ? 'border-emerald-500 bg-emerald-500' : late ? 'border-rose-500' : 'border-border',
                  )}
                />
                <span className={cn('text-xs flex-1 min-w-0 break-words leading-snug', done && 'line-through text-muted-foreground', late && !done && 'text-rose-600')}>
                  {t.msdyn_subject}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ColumnProps {
  label: string;
  tasks: ProjectTask[];
  buckets: ProjectBucket[];
  isUnassigned?: boolean;
  onAddTask?: () => void;
}

function PersonColumn({ label, tasks, buckets, isUnassigned = false, onAddTask }: ColumnProps) {
  const incomplete = tasks.filter((t) => !isDone(t)).length;
  const lateCount = tasks.filter(isLate).length;
  const hasLate = lateCount > 0;
  const bucketGroups = useMemo(() => groupByBucket(tasks, buckets), [tasks, buckets]);

  return (
    <div className="flex-shrink-0 w-64 flex flex-col gap-2">
      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {hasLate && <div className="h-1.5 bg-rose-500" />}
        <div className="p-4 space-y-3">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div
              className={cn(
                'h-11 w-11 rounded-full text-sm font-semibold flex items-center justify-center shrink-0',
                isUnassigned
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {isUnassigned ? '—' : initials(label)}
            </div>
            <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
          </div>
          <div className="flex justify-around text-center pt-1">
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Incomplete</p>
              <p className="text-xl font-bold text-foreground">{incomplete}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Late</p>
              <p className={cn('text-xl font-bold', hasLate ? 'text-rose-600' : 'text-foreground')}>{lateCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add task */}
      <button
        onClick={onAddTask}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors px-1 py-1"
      >
        <Plus className="h-3.5 w-3.5" /> Add task
      </button>

      {/* Task groups by bucket */}
      {bucketGroups.map((group) => (
        <TaskBucketGroup key={group.bucketId} group={group} />
      ))}
    </div>
  );
}

export function TaskPeopleView({ tasks, assignments, teamMembers, buckets, onAddTask }: Props) {
  const leafTasks = tasks.filter((t) => !t.msdyn_summary && !t.msdyn_projecttaskid.startsWith('optimistic-'));
  const taskById = useMemo(() => new Map(leafTasks.map((t) => [t.msdyn_projecttaskid, t])), [leafTasks]);

  const memberRows = useMemo(() => {
    const map = new Map<string, { member: TaskTeamMember; taskIds: Set<string> }>();
    for (const a of assignments) {
      if (!a.teamMemberId || !a.taskId) continue;
      if (!taskById.has(a.taskId)) continue;
      let entry = map.get(a.teamMemberId);
      if (!entry) {
        const member = teamMembers.find((m) => m.id === a.teamMemberId);
        if (!member) continue;
        entry = { member, taskIds: new Set() };
        map.set(a.teamMemberId, entry);
      }
      entry.taskIds.add(a.taskId);
    }
    return [...map.values()].map(({ member, taskIds }) => ({
      member,
      memberTasks: [...taskIds].map((id) => taskById.get(id)!).filter(Boolean),
    })).sort((a, b) => a.member.name.localeCompare(b.member.name));
  }, [assignments, teamMembers, taskById]);

  const unassignedTasks = useMemo(() => {
    const assignedTaskIds = new Set(assignments.map((a) => a.taskId));
    return leafTasks.filter((t) => !assignedTaskIds.has(t.msdyn_projecttaskid));
  }, [leafTasks, assignments]);

  const hasAnyData = memberRows.length > 0 || unassignedTasks.length > 0;

  if (!hasAnyData) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No tasks or team members on this project
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-4 pb-8 items-start">
      {/* Unassigned column — always first if there are unassigned tasks */}
      {unassignedTasks.length > 0 && (
        <PersonColumn
          label="Unassigned"
          tasks={unassignedTasks}
          buckets={buckets}
          isUnassigned
          onAddTask={onAddTask ? () => onAddTask(undefined) : undefined}
        />
      )}

      {/* One column per team member that has assigned tasks */}
      {memberRows.map(({ member, memberTasks }) => (
        <PersonColumn
          key={member.id}
          label={member.name}
          tasks={memberTasks}
          buckets={buckets}
          onAddTask={onAddTask ? () => onAddTask(undefined) : undefined}
        />
      ))}
    </div>
  );
}
