import { useNavigate } from 'react-router-dom';
import { Network, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { DataTable, type DataTableColumn } from '../../components/data-table';
import { HealthBadge } from '../../components/common/HealthBadge';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Button } from '../../components/ui/button';
import { usePrograms } from '../../hooks/usePrograms';
import { useActiveProjects } from '../../hooks/useProjects';
import type { Program } from '../../models/program.model';
import { OVERALL_HEALTH, ACCEL_STATE } from '../../lib/constants';

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});

const HEALTH_FILTER_OPTIONS = [
  { value: String(OVERALL_HEALTH.OnTrack), label: 'On Track' },
  { value: String(OVERALL_HEALTH.AtRisk), label: 'At Risk' },
  { value: String(OVERALL_HEALTH.OffTrack), label: 'Off Track' },
];

const STATE_FILTER_OPTIONS = [
  { value: String(ACCEL_STATE.Proposed), label: 'Proposed' },
  { value: String(ACCEL_STATE.Active),   label: 'Active' },
  { value: String(ACCEL_STATE.Closed),   label: 'Closed' },
  { value: String(ACCEL_STATE.OnHold),   label: 'On Hold' },
];

function StateBadge({ state, formatted }: { state?: number; formatted?: string }) {
  if (state == null && !formatted) return <span className="text-sm text-muted-foreground">—</span>;
  const label = formatted ?? 'Unknown';
  const style =
    state === ACCEL_STATE.Active   ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20' :
    state === ACCEL_STATE.OnHold   ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/20' :
    state === ACCEL_STATE.Closed   ? 'bg-muted/60 text-muted-foreground ring-border' :
    'bg-primary/10 text-primary ring-primary/20';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', style)}>
      {label}
    </span>
  );
}

interface EnrichedProgram extends Program {
  _projectCount: number;
  _atRiskCount: number;
}

export function ProgramListPage() {
  const navigate = useNavigate();
  const { data: programs = [], isLoading: loadingPrograms, error: progError } = usePrograms();
  const { data: projects = [], isLoading: loadingProjects, error: projError } = useActiveProjects();
  const isLoading = loadingPrograms || loadingProjects;
  const error = progError || projError;

  // Enrich programs with project counts computed client-side
  const enriched: EnrichedProgram[] = programs.map((prog) => {
    const linked = projects.filter((p) => p._msdyn_program_value === prog.msdyn_projectprogramid);
    const atRisk = linked.filter(
      (p) => p.proj_overallhealth === OVERALL_HEALTH.AtRisk || p.proj_overallhealth === OVERALL_HEALTH.OffTrack
    ).length;
    return { ...prog, _projectCount: linked.length, _atRiskCount: atRisk };
  });

  const columns: DataTableColumn<EnrichedProgram>[] = [
    {
      key: 'msdyn_name',
      header: 'Program',
      sortable: true,
      getValue: (p) => p.msdyn_name,
      render: (p) => (
        <div className="min-w-0">
          <span className="font-medium text-foreground">{p.msdyn_name}</span>
          {p.msdyn_description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">{p.msdyn_description}</p>
          )}
        </div>
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
      key: 'proj_state',
      header: 'State',
      filterable: true,
      filterOptions: STATE_FILTER_OPTIONS,
      getValue: (p) => String(p.proj_state ?? ''),
      render: (p) => (
        <StateBadge
          state={p.proj_state}
          formatted={p['proj_state@OData.Community.Display.V1.FormattedValue']}
        />
      ),
    },
    {
      key: '_proj_manager_value',
      header: 'Program Manager',
      sortable: true,
      getValue: (p) => p['_proj_manager_value@OData.Community.Display.V1.FormattedValue'] ?? '',
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {p['_proj_manager_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </span>
      ),
    },
    {
      key: '_projectCount',
      header: 'Projects',
      sortable: true,
      getValue: (p) => p._projectCount,
      render: (p) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground tabular-nums">{p._projectCount}</span>
          {p._atRiskCount > 0 && (
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {p._atRiskCount} at risk
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'msdyn_budget',
      header: 'Budget',
      sortable: true,
      getValue: (p) => p.msdyn_budget ?? 0,
      render: (p) => {
        if (p.msdyn_budget == null) return <span className="text-sm text-muted-foreground">—</span>;
        return <span className="text-sm text-muted-foreground tabular-nums">{currencyFmt.format(p.msdyn_budget)}</span>;
      },
    },
    {
      key: 'proj_programdue',
      header: 'Due',
      sortable: true,
      getValue: (p) => p.proj_programdue ?? '',
      render: (p) => {
        if (!p.proj_programdue) return <span className="text-sm text-muted-foreground">—</span>;
        const isOverdue = new Date(p.proj_programdue) < new Date();
        return (
          <span className={cn('text-sm', isOverdue ? 'text-rose-500 font-medium' : 'text-muted-foreground')}>
            {new Date(p.proj_programdue).toLocaleDateString()}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Programs" subtitle="Program entities grouping related projects" />
      <ErrorBanner error={error as Error | null} />
      <DataTable
        data={enriched}
        columns={columns}
        keyExtractor={(p) => p.msdyn_projectprogramid}
        searchPlaceholder="Search programs..."
        searchFn={(p, q) =>
          [p.msdyn_name, p.msdyn_description, p['_proj_manager_value@OData.Community.Display.V1.FormattedValue']]
            .some((v) => v?.toLowerCase().includes(q.toLowerCase()))
        }
        onRowClick={(p) => navigate(`/programs/${p.msdyn_projectprogramid}`)}
        actionButton={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Network className="h-3.5 w-3.5" />
              {programs.length} program{programs.length !== 1 ? 's' : ''}
            </div>
            <Button size="sm" onClick={() => navigate('/intake/new')}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Submit Request
            </Button>
          </div>
        }
        isLoading={isLoading}
        emptyMessage="No programs found. Click Submit Request to start a governed intake."
      />
    </div>
  );
}
