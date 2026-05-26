import { useState, useMemo } from 'react';
import {
  Plus, Trash2, Search, CheckCircle2, Loader2, FileText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { DocumentLibrary } from './DocumentLibrary';
import type { Project } from '../../models/project.model';
import { READ_ONLY_TOOLTIP } from '../../hooks/useProjectPermissions';

function fmtDate(v?: string) { return v ? new Date(v).toLocaleDateString() : '—'; }
function fmtNumber(v?: number, decimals = 0) { return v != null ? v.toFixed(decimals) : '—'; }

function ScoreRow({ label, rating, score }: { label: string; rating?: string; score?: number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        {rating && <span className="text-sm text-foreground font-medium">{rating}</span>}
        {score != null && (
          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{score}</span>
        )}
      </div>
    </div>
  );
}

interface PlanWorkspaceProps {
  projectId: string;
  projectName?: string;
  project: Project;
  members: Array<{
    msdyn_projectteamid: string;
    msdyn_name?: string;
    msdyn_effort?: number;
    msdyn_percentage?: number;
    msdyn_start?: string;
    msdyn_finish?: string;
    '_msdyn_bookableresourceid_value@OData.Community.Display.V1.FormattedValue'?: string;
    '_msdyn_resourcecategory_value@OData.Community.Display.V1.FormattedValue'?: string;
  }>;
  bookableResources: Array<{ bookableresourceid: string; name: string }>;
  assignedResourceIds: Set<string>;
  onAddMember: (resourceId: string) => Promise<void>;
  onRemoveMember: (teamMemberId: string) => Promise<void>;
  addMemberPending: boolean;
  canEdit: boolean;
}

export function PlanWorkspace({
  projectId, projectName, project, members,
  bookableResources, assignedResourceIds,
  onAddMember, onRemoveMember, addMemberPending,
  canEdit,
}: PlanWorkspaceProps) {
  const [subTab, setSubTab] = useState('resources');
  const [addResourceOpen, setAddResourceOpen] = useState(false);
  const [resourceSearch, setResourceSearch] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null);

  const filteredResources = useMemo(() => {
    const q = resourceSearch.toLowerCase().trim();
    return bookableResources.filter(
      (r) => !assignedResourceIds.has(r.bookableresourceid) && (!q || r.name.toLowerCase().includes(q)),
    );
  }, [bookableResources, assignedResourceIds, resourceSearch]);

  async function handleAddMember() {
    if (!selectedResourceId) return;
    setResourceError(null);
    try {
      await onAddMember(selectedResourceId);
      setAddResourceOpen(false);
      setSelectedResourceId('');
      setResourceSearch('');
    } catch (err) {
      setResourceError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemoveMember(teamMemberId: string) {
    setRemoveMemberError(null);
    setRemovingMemberId(teamMemberId);
    try {
      await onRemoveMember(teamMemberId);
    } catch (err) {
      setRemoveMemberError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingMemberId(null);
    }
  }

  return (
    <Tabs value={subTab} onValueChange={setSubTab}>
      <TabsList className="bg-muted/30 h-8 gap-0">
        <TabsTrigger value="resources" className="text-xs h-7 px-3">Resources</TabsTrigger>
        <TabsTrigger value="documents" className="text-xs h-7 px-3">Documents</TabsTrigger>
        <TabsTrigger value="business-case" className="text-xs h-7 px-3">Business Case</TabsTrigger>
      </TabsList>

      {/* Resources */}
      <TabsContent value="resources" className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted-foreground">
            {members.length} resource{members.length !== 1 ? 's' : ''} assigned
          </p>
          <Button
            size="sm"
            onClick={() => { setResourceSearch(''); setSelectedResourceId(''); setResourceError(null); setAddResourceOpen(true); }}
            disabled={addMemberPending || !canEdit}
            title={!canEdit ? READ_ONLY_TOOLTIP : undefined}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Resource
          </Button>
        </div>

        {removeMemberError && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between gap-2">
            <span>{removeMemberError}</span>
            <button onClick={() => setRemoveMemberError(null)} className="shrink-0 hover:opacity-70">&times;</button>
          </div>
        )}

        {members.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No resources assigned.{canEdit && <> <button onClick={() => { setResourceSearch(''); setSelectedResourceId(''); setResourceError(null); setAddResourceOpen(true); }} className="text-primary hover:underline">+ Add Resource</button></>}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden max-w-5xl">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_80px_72px_180px_32px] gap-x-4 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <span>Name</span>
              <span>Role</span>
              <span className="text-right">Effort (h)</span>
              <span className="text-right">Alloc %</span>
              <span className="text-right">Dates</span>
              <span />
            </div>
            <div className="divide-y divide-border/60">
              {members.map((m) => {
                const isRemoving = removingMemberId === m.msdyn_projectteamid;
                return (
                  <div key={m.msdyn_projectteamid} className={cn('grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_80px_72px_180px_32px] gap-x-4 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors', isRemoving && 'opacity-50')}>
                    <span className="text-sm font-medium text-foreground truncate">
                      {m['_msdyn_bookableresourceid_value@OData.Community.Display.V1.FormattedValue'] ?? m.msdyn_name ?? '—'}
                    </span>
                    <span className="text-sm text-muted-foreground truncate">
                      {m['_msdyn_resourcecategory_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
                    </span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">
                      {fmtNumber(m.msdyn_effort, 1)}
                    </span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">
                      {m.msdyn_percentage != null ? `${m.msdyn_percentage.toFixed(0)}%` : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground text-right whitespace-nowrap">
                      {m.msdyn_start ? fmtDate(m.msdyn_start) : '—'}
                      {m.msdyn_finish ? ` – ${fmtDate(m.msdyn_finish)}` : ''}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveMember(m.msdyn_projectteamid)}
                        disabled={isRemoving}
                        className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        title="Remove resource"
                      >
                        {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Resource dialog */}
        <Dialog open={addResourceOpen} onOpenChange={(o) => { if (!o) setAddResourceOpen(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Resource</DialogTitle>
              <DialogDescription>Search for and add a bookable resource to this project.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={resourceSearch}
                  onChange={(e) => { setResourceSearch(e.target.value); setSelectedResourceId(''); }}
                  placeholder="Search by name..."
                  className="w-full h-9 rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                {filteredResources.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                    {bookableResources.length === 0 ? 'Loading resources...' : 'No matching resources found.'}
                  </p>
                ) : filteredResources.map((r) => (
                  <button
                    key={r.bookableresourceid}
                    onClick={() => setSelectedResourceId(r.bookableresourceid)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors',
                      selectedResourceId === r.bookableresourceid
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted/40 text-foreground',
                    )}
                  >
                    {selectedResourceId === r.bookableresourceid && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span className={cn('truncate', selectedResourceId !== r.bookableresourceid && 'pl-[1.375rem]')}>{r.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {resourceError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive max-h-20 overflow-y-auto break-words">
                {resourceError}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddResourceOpen(false)}>Cancel</Button>
              <Button disabled={!selectedResourceId || addMemberPending} onClick={handleAddMember}>
                {addMemberPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {addMemberPending ? 'Adding...' : 'Add Resource'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* Documents */}
      <TabsContent value="documents" className="mt-4">
        <DocumentLibrary recordType="Project" recordId={projectId} recordName={projectName ?? ''} projectId={projectId} readOnly={!canEdit} />
      </TabsContent>

      {/* Business Case */}
      <TabsContent value="business-case" className="mt-4">
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-7 space-y-5">
            {project.msdyn_businesscase ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Business Case</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{project.msdyn_businesscase}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No business case entered</p>
                <p className="text-xs text-muted-foreground mt-1">Use the Edit Project button to add a business case.</p>
              </div>
            )}
            {project.msdyn_valuestatement && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Value Statement</h3>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{project.msdyn_valuestatement}</p>
              </div>
            )}
          </div>
          <div className="col-span-12 lg:col-span-5 space-y-5">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Strategic Scoring</h3>
              <div className="divide-y divide-border/60">
                <ScoreRow label="Strategic Alignment" rating={project['proj_strategicalignment@OData.Community.Display.V1.FormattedValue']} score={project.proj_strategicalignmentscore} />
                <ScoreRow label="Improve Employee Retention" rating={project['proj_improveemployeeretention@OData.Community.Display.V1.FormattedValue']} score={project.proj_improveemployeeretentionscore} />
                <ScoreRow label="Lower Cost" rating={project['proj_lowercost@OData.Community.Display.V1.FormattedValue']} score={project.proj_lowercostscore} />
                <ScoreRow label="Risk" rating={project['proj_risk@OData.Community.Display.V1.FormattedValue']} score={project.proj_riskscore} />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Scoring Summary</h3>
              <div className="space-y-3">
                {project.proj_prioritizationscore != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Prioritization Score</span>
                    <span className="text-sm font-bold text-foreground">{fmtNumber(project.proj_prioritizationscore, 2)}</span>
                  </div>
                )}
                {project.proj_roi != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Return on Investment</span>
                    <span className={cn('text-sm font-bold', project.proj_roi >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                      {project.proj_roi.toFixed(1)}%
                    </span>
                  </div>
                )}
                {project.proj_prioritizationscore == null && project.proj_roi == null && (
                  <p className="text-sm text-muted-foreground">No scoring data available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
