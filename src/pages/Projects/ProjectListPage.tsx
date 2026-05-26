import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/data-table';
import { StatusBadge } from '../../components/common/StatusBadge';
import { HealthBadge } from '../../components/common/HealthBadge';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Button } from '../../components/ui/button';
import { useProjects } from '../../hooks/useProjects';
import { usePrograms } from '../../hooks/usePrograms';
import type { Project } from '../../models/project.model';
import { OVERALL_HEALTH } from '../../lib/constants';

/** Normalize msdyn_progress (stored 0-1 in Dataverse) to a 0-100 integer. */
function normPct(raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  return raw > 0 && raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}

function ProgressBar({ value }: { value?: number }) {
  const pct = value ?? 0;
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-primary' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

const HEALTH_FILTER_OPTIONS = [
  { value: String(OVERALL_HEALTH.OnTrack), label: 'On Track' },
  { value: String(OVERALL_HEALTH.AtRisk), label: 'At Risk' },
  { value: String(OVERALL_HEALTH.OffTrack), label: 'Off Track' },
];

const STATUS_FILTER_OPTIONS = [
  { value: '0', label: 'Active' },
  { value: '1', label: 'Inactive' },
];

export function ProjectListPage() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading, error } = useProjects();
  const { data: programs = [] } = usePrograms();
  const programFilterOptions = programs.map((p) => ({
    value: p.msdyn_projectprogramid,
    label: p.msdyn_name,
  }));

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'msdyn_subject',
      header: 'Project',
      sortable: true,
      getValue: (p) => p.msdyn_subject,
      render: (p) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground">{p.msdyn_subject}</span>
          {p['proj_stage@OData.Community.Display.V1.FormattedValue'] && (
            <span className="ml-2 text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              {p['proj_stage@OData.Community.Display.V1.FormattedValue']}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'statecode',
      header: 'Status',
      filterable: true,
      filterOptions: STATUS_FILTER_OPTIONS,
      getValue: (p) => String(p.statecode ?? 0),
      render: (p) => <StatusBadge statecode={p.statecode} />,
    },
    {
      key: '_msdyn_projectmanager_value',
      header: 'Project Manager',
      sortable: true,
      getValue: (p) => p['_msdyn_projectmanager_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {p['_msdyn_projectmanager_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
    },
    {
      key: '_pmo_primaryteam_value',
      header: 'Team',
      sortable: true,
      getValue: (p) => p['_pmo_primaryteam_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {p['_pmo_primaryteam_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
    },
    {
      key: '_msdyn_program_value',
      header: 'Program',
      sortable: true,
      filterable: true,
      filterOptions: programFilterOptions,
      getValue: (p) => p._msdyn_program_value ?? '',
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {p['_msdyn_program_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
    },
    {
      key: 'proj_overallhealth',
      header: 'Health',
      filterable: true,
      filterOptions: HEALTH_FILTER_OPTIONS,
      getValue: (p) => String(p.proj_overallhealth ?? ''),
      render: (p) => <HealthBadge value={p.proj_overallhealth} />,
    },
    {
      key: 'msdyn_progress',
      header: 'Progress',
      sortable: true,
      getValue: (p) => normPct(p.msdyn_progress),
      render: (p) => <ProgressBar value={normPct(p.msdyn_progress)} />,
    },
    {
      key: 'msdyn_finish',
      header: 'Finish Date',
      sortable: true,
      getValue: (p) => p.msdyn_finish ?? '',
      render: (p) => {
        if (!p.msdyn_finish) return <span className="text-sm text-muted-foreground">—</span>;
        const isOverdue = new Date(p.msdyn_finish) < new Date() && normPct(p.msdyn_progress) < 100;
        return (
          <span className={cn('text-sm', isOverdue ? 'text-rose-500 font-medium' : 'text-muted-foreground')}>
            {new Date(p.msdyn_finish).toLocaleDateString()}
          </span>
        );
      },
    },
  ];

  const activeCount = projects.filter(p => p.statecode === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle={`${activeCount} active project${activeCount !== 1 ? 's' : ''} across all programs`}
      />
      <ErrorBanner error={error as Error | null} />
      <DataTable
        data={projects}
        columns={columns}
        keyExtractor={(p) => p.msdyn_projectid}
        searchPlaceholder="Search projects..."
        searchFn={(p, q) =>
          [
            p.msdyn_subject,
            p['_msdyn_projectmanager_value@OData.Community.Display.V1.FormattedValue'],
            p['_pmo_primaryteam_value@OData.Community.Display.V1.FormattedValue'],
            p['_msdyn_program_value@OData.Community.Display.V1.FormattedValue'],
          ].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
        }
        onRowClick={(p) => navigate(`/projects/${p.msdyn_projectid}`)}
        actionButton={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FolderKanban className="h-3.5 w-3.5" />
              {projects.length} total
            </div>
            <Button size="sm" onClick={() => navigate('/intake/new')}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Submit Request
            </Button>
          </div>
        }
        isLoading={isLoading}
        emptyMessage="No projects found. Click Submit Request to start a governed intake."
      />
    </div>
  );
}
