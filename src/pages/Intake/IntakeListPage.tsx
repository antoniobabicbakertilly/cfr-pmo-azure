import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Inbox, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/data-table';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Button } from '../../components/ui/button';
import { DeleteConfirmDialog } from '../../components/common/DeleteConfirmDialog';
import { useProjectRequests } from '../../hooks/useProjectRequests';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { deleteProjectRequest } from '../../api/projectRequests.api';
import { useChangeAudit } from '../../hooks/useChangeAudit';
import type { ProjectRequest } from '../../models/projectRequest.model';
import { REQUEST_STATUS } from '../../lib/constants';
import { toast } from '../../hooks/useToast';

const REQUEST_TYPE_LABELS: Record<number, string> = {
  893460000: 'New Project',
  893460001: 'Change Request',
  893460002: 'Enhancement',
  893460003: 'Support',
  893460004: 'New Program',
};

const PRIORITY_LABELS: Record<number, string> = {
  893460010: 'Critical',
  893460011: 'High',
  893460012: 'Medium',
  893460013: 'Low',
};

const STATUS_FILTER_OPTIONS = [
  { value: '893460020', label: 'Draft' },
  { value: '893460021', label: 'Submitted' },
  { value: '893460022', label: 'In Triage' },
  { value: '893460023', label: 'Approved' },
  { value: '893460024', label: 'Rejected' },
  { value: '893460025', label: 'Converted' },
  { value: '893460026', label: 'Awaiting Clarification' },
  { value: '893460027', label: 'Routed – Operational' },
  { value: '893460028', label: 'Redirected' },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: '893460010', label: 'Critical' },
  { value: '893460011', label: 'High' },
  { value: '893460012', label: 'Medium' },
  { value: '893460013', label: 'Low' },
];

const STATUS_STYLE_MAP: Record<string, string> = {
  Draft: 'draft',
  Submitted: 'pending',
  'In Triage': 'in progress',
  Approved: 'approved',
  Rejected: 'rejected',
  Converted: 'completed',
  'Awaiting Clarification': 'pending',
  'Routed – Operational': 'in progress',
  Redirected: 'inactive',
};

const ACTION_NEEDED_STATUSES: Set<number> = new Set([
  REQUEST_STATUS.Submitted,
  REQUEST_STATUS.InTriage,
  REQUEST_STATUS.AwaitingClarification,
]);

export function IntakeListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const auditChange = useChangeAudit();
  const { data: requests = [], isLoading, error } = useProjectRequests();
  const [_selected, setSelected] = useState<ProjectRequest | null>(null);
  const [approvalOnly, setApprovalOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRequest | null>(null);
  const currentUserId = useCurrentUserId();

  function canDelete(r: ProjectRequest): boolean {
    if (!currentUserId) return false;
    if (r.pmo_status !== REQUEST_STATUS.Draft && r.pmo_status !== REQUEST_STATUS.Submitted) return false;
    const createdBy = r['_createdby_value'];
    if (!createdBy) return false;
    return createdBy.replace(/[{}]/g, '').toLowerCase() === currentUserId.toLowerCase();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    // Snapshot the name BEFORE the row vanishes so the audit reads naturally.
    const deletedName = deleteTarget.pmo_name ?? 'Untitled Request';
    const deletedId = deleteTarget.pmo_projectrequestid;
    await deleteProjectRequest(deletedId);
    auditChange({
      entityType: 'intake',
      entityId: deletedId,
      entityName: deletedName,
      action: 'delete',
    });
    toast.success('Request deleted');
    qc.invalidateQueries({ queryKey: ['projectRequests'] });
  }

  const displayData = useMemo(
    () => approvalOnly ? requests.filter((r) => ACTION_NEEDED_STATUSES.has(r.pmo_status ?? 0)) : requests,
    [requests, approvalOnly],
  );

  const pendingCount = useMemo(
    () => requests.filter((r) => ACTION_NEEDED_STATUSES.has(r.pmo_status ?? 0)).length,
    [requests],
  );

  const columns: DataTableColumn<ProjectRequest>[] = [
    {
      key: 'pmo_autonumber',
      header: '#',
      sortable: true,
      getValue: (r) => r.pmo_autonumber ?? '',
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">{r.pmo_autonumber ?? '—'}</span>
      ),
    },
    {
      key: 'pmo_name',
      header: 'Title',
      sortable: true,
      getValue: (r) => r.pmo_name,
      render: (r) => (
        <span className="font-medium text-foreground">{r.pmo_name}</span>
      ),
    },
    {
      key: '_createdby_value',
      header: 'Submitted By',
      sortable: true,
      getValue: (r) => r['_pmo_requestedby_value@OData.Community.Display.V1.FormattedValue'] ?? r['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r['_pmo_requestedby_value@OData.Community.Display.V1.FormattedValue'] ?? r['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
    },
    {
      key: 'pmo_requesttype',
      header: 'Type',
      filterable: true,
      filterOptions: [
        { value: '893460000', label: 'New Project' },
        { value: '893460001', label: 'Change Request' },
        { value: '893460002', label: 'Enhancement' },
        { value: '893460003', label: 'Support' },
        { value: '893460004', label: 'New Program' },
      ],
      getValue: (r) => String(r.pmo_requesttype ?? ''),
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.pmo_requesttype != null ? REQUEST_TYPE_LABELS[r.pmo_requesttype] ?? '—' : '—'}
        </span>
      ),
    },
    {
      key: 'pmo_priority',
      header: 'Priority',
      sortable: true,
      filterable: true,
      filterOptions: PRIORITY_FILTER_OPTIONS,
      getValue: (r) => String(r.pmo_priority ?? ''),
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.pmo_priority != null ? PRIORITY_LABELS[r.pmo_priority] ?? '—' : '—'}
        </span>
      ),
    },
    {
      key: 'pmo_status',
      header: 'Status',
      filterable: true,
      filterOptions: STATUS_FILTER_OPTIONS,
      getValue: (r) => String(r.pmo_status ?? ''),
      render: (r) => {
        const label = r['pmo_status@OData.Community.Display.V1.FormattedValue'] ?? '—';
        return <StatusBadge status={STATUS_STYLE_MAP[label] ?? 'inactive'} label={label} />;
      },
    },
    {
      key: '_pmo_targetteam_value',
      header: 'Team',
      sortable: true,
      getValue: (r) => r['_pmo_targetteam_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r['_pmo_targetteam_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
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
    {
      key: 'pmo_routingconfidence',
      header: 'Confidence',
      sortable: true,
      getValue: (r) => String(r.pmo_routingconfidence ?? ''),
      render: (r) => {
        const c = r.pmo_routingconfidence;
        if (c == null) return <span className="text-sm text-muted-foreground">—</span>;
        const cls =
          c >= 70 ? 'bg-green-100 text-green-700' :
          c >= 50 ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700';
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
            {c}%
          </span>
        );
      },
    },
    {
      key: 'daysInQueue',
      header: 'Days in Queue',
      sortable: true,
      getValue: (r) => {
        if (!r.createdon) return '0';
        return String(Math.floor((Date.now() - new Date(r.createdon).getTime()) / (1000 * 60 * 60 * 24)));
      },
      render: (r) => {
        if (!r.createdon) return <span className="text-sm text-muted-foreground">—</span>;
        const days = Math.floor((Date.now() - new Date(r.createdon).getTime()) / (1000 * 60 * 60 * 24));
        const cls = days >= 14 ? 'text-red-600 font-medium' : days >= 7 ? 'text-amber-600' : 'text-muted-foreground';
        return <span className={`text-sm ${cls}`}>{days}d</span>;
      },
    },
    {
      key: 'actions',
      header: '',
      getValue: () => '',
      render: (r) => {
        if (!canDelete(r)) return null;
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete request"
            aria-label="Delete request"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intake Queue"
        subtitle="CFR PMO project requests and change requests"
        actions={
          <Button size="sm" onClick={() => navigate('/intake/new')}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Request
          </Button>
        }
      />
      <ErrorBanner error={error as Error | null} />
      <DataTable
        data={displayData}
        columns={columns}
        keyExtractor={(r) => r.pmo_projectrequestid}
        searchPlaceholder="Search requests..."
        searchFn={(r, q) =>
          [r.pmo_name, r.pmo_autonumber, r['_pmo_targetteam_value@OData.Community.Display.V1.FormattedValue'], r['_pmo_requestedby_value@OData.Community.Display.V1.FormattedValue'], r['_createdby_value@OData.Community.Display.V1.FormattedValue']]
            .some((v) => v?.toLowerCase().includes(q.toLowerCase()))
        }
        rowClassName={(r) => {
          if (ACTION_NEEDED_STATUSES.has(r.pmo_status ?? 0))
            return 'bg-rose-100/50 dark:bg-rose-950/25';
          return undefined;
        }}
        onRowClick={(r) => {
          setSelected(r);
          navigate(`/intake/${r.pmo_projectrequestid}`);
        }}
        actionButton={
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={approvalOnly}
                onChange={(e) => setApprovalOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-rose-500"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Requires action
                {pendingCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none">
                    {pendingCount}
                  </span>
                )}
              </span>
            </label>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" />
              {displayData.length} request{displayData.length !== 1 ? 's' : ''}
            </div>
          </div>
        }
        isLoading={isLoading}
        emptyMessage={approvalOnly ? 'No requests require action right now.' : 'No intake requests found. Create your first request to get started.'}
      />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="Delete request"
        recordName={deleteTarget?.pmo_name ?? ''}
        extraWarning="Only draft or submitted requests can be deleted, and only by the user who created them. This action is permanent."
        onConfirm={handleDelete}
      />
    </div>
  );
}
