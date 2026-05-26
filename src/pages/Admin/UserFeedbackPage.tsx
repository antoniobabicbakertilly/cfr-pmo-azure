import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/data-table';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { DeleteConfirmDialog } from '../../components/common/DeleteConfirmDialog';
import { useUserFeedback } from '../../hooks/useUserFeedback';
import { useEffectiveAdminRole } from '../../providers/ConfigurationProvider';
import { deleteUserFeedback } from '../../api/userFeedback.api';
import type { UserFeedback } from '../../models/userFeedback.model';
import { FEEDBACK_TYPE, FEEDBACK_STATUS } from '../../lib/constants';
import { Bug, Lightbulb, MessageSquareText, Trash2, Loader2 } from 'lucide-react';
import { toast } from '../../hooks/useToast';
import { useFeedbackSaving, useFeedbackSavingSet } from '../../lib/feedbackSaveStore';
import { cn } from '../../lib/utils';

const TYPE_LABELS: Record<number, string> = {
  [FEEDBACK_TYPE.BugReport]: 'Bug Report',
  [FEEDBACK_TYPE.Enhancement]: 'Enhancement',
};

const STATUS_LABELS: Record<number, string> = {
  [FEEDBACK_STATUS.New]: 'New',
  [FEEDBACK_STATUS.InReview]: 'In Review',
  [FEEDBACK_STATUS.Accepted]: 'Accepted',
  [FEEDBACK_STATUS.Resolved]: 'Resolved',
};

const STATUS_STYLE_MAP: Record<string, string> = {
  New: 'draft',
  'In Review': 'in progress',
  Accepted: 'approved',
  Resolved: 'completed',
};

const STATUS_FILTER_OPTIONS = [
  { value: String(FEEDBACK_STATUS.New), label: 'New' },
  { value: String(FEEDBACK_STATUS.InReview), label: 'In Review' },
  { value: String(FEEDBACK_STATUS.Accepted), label: 'Accepted' },
  { value: String(FEEDBACK_STATUS.Resolved), label: 'Resolved' },
];

const TYPE_FILTER_OPTIONS = [
  { value: String(FEEDBACK_TYPE.BugReport), label: 'Bug Report' },
  { value: String(FEEDBACK_TYPE.Enhancement), label: 'Enhancement' },
];

export function UserFeedbackPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const adminRole = useEffectiveAdminRole();
  const isAdmin = (adminRole === 'pmo_admin' || adminRole === 'system_admin');
  const [deleteTarget, setDeleteTarget] = useState<UserFeedback | null>(null);
  const { data: feedback = [], isLoading, error } = useUserFeedback();
  // Subscribe to in-flight saves so the table dims affected rows and lets
  // <TitleCell> render a spinner until react-query's refetch refreshes them.
  const savingIds = useFeedbackSavingSet();

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteUserFeedback(deleteTarget.pmo_userfeedbackid);
    toast.success('Feedback deleted');
    qc.invalidateQueries({ queryKey: ['userFeedback'] });
  }

  // Build submitter filter options dynamically from data
  const submitterFilterOptions = useMemo(() => {
    const names = new Set<string>();
    feedback.forEach((r) => {
      const name = r['_createdby_value@OData.Community.Display.V1.FormattedValue'];
      if (name) names.add(name);
    });
    return [...names].sort().map((n) => ({ value: n, label: n }));
  }, [feedback]);

  // Owner == creator means the row was just submitted and never triaged --
  // Dataverse stamps the creator as the initial owner. Render a faded
  // '(submitter)' hint so admins can still spot un-triaged rows, but show the
  // persisted owner verbatim so a self-assignment round-trips without
  // disappearing from the list.
  function isSelfOwned(r: UserFeedback): boolean {
    const owner = r['_ownerid_value'];
    const creator = r['_createdby_value'];
    if (!owner || !creator) return false;
    return owner.replace(/[{}]/g, '').toLowerCase() === creator.replace(/[{}]/g, '').toLowerCase();
  }

  const assigneeFilterOptions = useMemo(() => {
    const names = new Set<string>();
    feedback.forEach((r) => {
      const name = r['_ownerid_value@OData.Community.Display.V1.FormattedValue'];
      if (name) names.add(name);
    });
    return [...names].sort().map((n) => ({ value: n, label: n }));
  }, [feedback]);

  const columns: DataTableColumn<UserFeedback>[] = [
    {
      key: 'pmo_feedbacktype',
      header: 'Type',
      filterable: true,
      filterOptions: TYPE_FILTER_OPTIONS,
      getValue: (r) => String(r.pmo_feedbacktype ?? ''),
      render: (r) => {
        const isBug = r.pmo_feedbacktype === FEEDBACK_TYPE.BugReport;
        return (
          <div className="flex items-center gap-1.5">
            {isBug
              ? <Bug className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              : <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            }
            <span className="text-sm">{TYPE_LABELS[r.pmo_feedbacktype ?? 0] ?? '—'}</span>
          </div>
        );
      },
    },
    {
      key: 'pmo_title',
      header: 'Title',
      sortable: true,
      getValue: (r) => r.pmo_title,
      render: (r) => <TitleCell row={r} />,
    },
    {
      key: 'pmo_description',
      header: 'Description',
      getValue: (r) => r.pmo_description ?? '',
      render: (r) => (
        <span className="text-sm text-muted-foreground line-clamp-2">
          {r.pmo_description ?? '—'}
        </span>
      ),
    },
    {
      key: '_createdby_value',
      header: 'Submitted By',
      sortable: true,
      filterable: true,
      filterOptions: submitterFilterOptions,
      getValue: (r) => r['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
    },
    {
      key: '_ownerid_value',
      header: 'Assigned To',
      sortable: true,
      filterable: true,
      filterOptions: assigneeFilterOptions,
      getValue: (r) => r['_ownerid_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (r) => {
        const name = r['_ownerid_value@OData.Community.Display.V1.FormattedValue'];
        if (!name) {
          return <span className="text-sm italic text-muted-foreground/70">Unassigned</span>;
        }
        return (
          <span className="text-sm text-muted-foreground">
            {name}
            {isSelfOwned(r) && (
              <span className="ml-1 text-xs italic text-muted-foreground/60">(submitter)</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'pmo_status',
      header: 'Status',
      filterable: true,
      filterOptions: STATUS_FILTER_OPTIONS,
      getValue: (r) => String(r.pmo_status ?? ''),
      render: (r) => {
        const label = STATUS_LABELS[r.pmo_status ?? 0] ?? '—';
        return <StatusBadge status={STATUS_STYLE_MAP[label] ?? 'inactive'} label={label} />;
      },
    },
    {
      key: 'createdon',
      header: 'Submitted',
      sortable: true,
      getValue: (r) => r.createdon ?? '',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.createdon ? new Date(r.createdon).toLocaleDateString() : '—'}
        </span>
      ),
    },
    ...(isAdmin ? [{
      key: 'actions',
      header: '',
      getValue: () => '',
      render: (r: UserFeedback) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
          title="Delete feedback"
          aria-label="Delete feedback"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    } as DataTableColumn<UserFeedback>] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Feedback"
        subtitle="Bug reports and enhancement suggestions submitted by users"
      />
      <ErrorBanner error={error as Error | null} />
      <DataTable
        data={feedback}
        columns={columns}
        keyExtractor={(r) => r.pmo_userfeedbackid}
        searchPlaceholder="Search feedback..."
        searchFn={(r, q) =>
          [r.pmo_title, r.pmo_description, r['_createdby_value@OData.Community.Display.V1.FormattedValue']]
            .some((v) => v?.toLowerCase().includes(q.toLowerCase()))
        }
        onRowClick={(r) => navigate(`/admin/user-feedback/${r.pmo_userfeedbackid}`)}
        rowClassName={(r) => savingIds.has(r.pmo_userfeedbackid) ? 'opacity-60 pointer-events-none' : undefined}
        actionButton={
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquareText className="h-3.5 w-3.5" />
            {feedback.length} item{feedback.length !== 1 ? 's' : ''}
          </div>
        }
        isLoading={isLoading}
        emptyMessage="No feedback submitted yet."
      />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Delete user feedback"
        recordName={deleteTarget?.pmo_title ?? ''}
        extraWarning="Permanently removes the feedback entry from Dataverse."
        onConfirm={handleDelete}
      />
    </div>
  );
}

function TitleCell({ row }: { row: UserFeedback }) {
  const isSaving = useFeedbackSaving(row.pmo_userfeedbackid);
  return (
    <span className={cn('font-medium text-foreground inline-flex items-center gap-1.5')}>
      <span>{row.pmo_title}</span>
      {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
    </span>
  );
}
