import { cn } from '../../lib/utils';
import { DataTable, type DataTableColumn } from '../data-table';
import type { ProjectTask } from '../../models/projectTask.model';
import { getDisplayProgressPct } from '../../models/projectTask.model';
import type { TaskAssignee } from './TaskRow';
import { TASK_PRIORITY_META, TASK_PRIORITY } from '../../lib/constants';

function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

interface Props {
  tasks: ProjectTask[];
  assignmentMap: Map<string, TaskAssignee[]>;
  onSelectTask: (taskId: string) => void;
}

export function TaskListView({ tasks, assignmentMap, onSelectTask }: Props) {
  const columns: DataTableColumn<ProjectTask>[] = [
    {
      key: 'msdyn_subject',
      header: 'Task',
      sortable: true,
      getValue: (t) => t.msdyn_subject,
      render: (t) => {
        const isClosed = t.statecode === 1;
        const pct = getDisplayProgressPct(t);
        const isDone = isClosed || pct >= 100;
        return (
          <div>
            <span className={cn('text-sm font-medium', t.msdyn_summary && 'font-semibold', isDone && 'line-through text-muted-foreground')}>
              {t.msdyn_subject}
            </span>
            {t.msdyn_summary && <span className="ml-1.5 text-[10px] text-muted-foreground">(summary)</span>}
            {t.msdyn_ismilestone && <span className="ml-1.5 text-[10px] text-amber-600">★ Milestone</span>}
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      getValue: (t) => t.msdyn_priority ?? TASK_PRIORITY.Medium,
      render: (t) => {
        // Default to Medium (5) when not set — matches Planner default behaviour
        const p = t.msdyn_priority ?? TASK_PRIORITY.Medium;
        const meta = TASK_PRIORITY_META[p] ?? TASK_PRIORITY_META[TASK_PRIORITY.Medium];
        return (
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', meta.cls)}>
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      sortable: true,
      getValue: (t) => getDisplayProgressPct(t),
      render: (t) => {
        const isClosed = t.statecode === 1;
        const pct = getDisplayProgressPct(t);
        const isDone = isClosed || pct >= 100;
        return t.msdyn_summary ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full', isDone ? 'bg-emerald-500' : 'bg-primary')}
                style={{ width: `${Math.round(pct)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{Math.round(pct)}%</span>
          </div>
        );
      },
    },
    {
      key: 'assignees',
      header: 'Assignees',
      render: (t) => {
        const a = assignmentMap.get(t.msdyn_projecttaskid) ?? [];
        return a.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {a.map((x) => (
              <span key={x.assignmentId} title={x.name} className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                {initials(x.name)}
              </span>
            ))}
          </div>
        ) : <span className="text-muted-foreground text-xs">—</span>;
      },
    },
    {
      key: 'msdyn_scheduledstart',
      header: 'Start',
      sortable: true,
      getValue: (t) => t.msdyn_scheduledstart ?? '',
      render: (t) => <span className="text-xs text-muted-foreground">{fmtDate(t.msdyn_scheduledstart)}</span>,
    },
    {
      key: 'due',
      header: 'Due',
      sortable: true,
      getValue: (t) => t.msdyn_scheduledend ?? t.msdyn_finish ?? '',
      render: (t) => {
        const due = t.msdyn_scheduledend ?? t.msdyn_finish;
        const isClosed = t.statecode === 1;
        const pct = getDisplayProgressPct(t);
        const isDone = isClosed || pct >= 100;
        const isOverdue = !isDone && due && new Date(due) < new Date();
        return (
          <span className={cn('text-xs', isOverdue ? 'text-rose-500 font-medium' : 'text-muted-foreground')}>
            {fmtDate(due)}
            {isOverdue && ' ⚠'}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      data={tasks}
      columns={columns}
      keyExtractor={(t) => t.msdyn_projecttaskid}
      onRowClick={(t) => onSelectTask(t.msdyn_projecttaskid)}
      emptyMessage="No tasks match the current filters."
      searchPlaceholder="Search tasks…"
      searchFn={(t, q) => t.msdyn_subject.toLowerCase().includes(q.toLowerCase())}
    />
  );
}
