import { useState } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { MeetingWorkspace } from './MeetingWorkspace';
import { TEAM_ROLE } from '../../lib/constants';
import { READ_ONLY_TOOLTIP } from '../../hooks/useProjectPermissions';

function fmtDate(v?: string) { return v ? new Date(v).toLocaleDateString() : '—'; }

interface TeamEntry {
  pmo_projectteamid: string;
  pmo_name?: string;
  pmo_role?: number;
  pmo_joineddate?: string;
  '_pmo_team_value'?: string;
  '_pmo_team_value@OData.Community.Display.V1.FormattedValue'?: string;
}

interface CollaborateWorkspaceProps {
  projectId: string;
  projectName?: string;
  primaryTeamName?: string;
  primaryTeam?: TeamEntry;
  contributingTeams: TeamEntry[];
  availableTeams: Array<{ teamid: string; name: string }>;
  onAddTeam: (payload: Record<string, unknown>) => void;
  onRemoveTeam: (id: string) => void;
  addTeamPending: boolean;
  removeTeamPending: boolean;
  onEditProject: () => void;
  /** Stricter - only Primary Team members + admins can change the roster. */
  canManageRoster: boolean;
  /** Standard project edit gate. */
  canEdit: boolean;
}

export function CollaborateWorkspace({
  projectId, primaryTeamName, primaryTeam, contributingTeams,
  availableTeams, onAddTeam, onRemoveTeam,
  addTeamPending, removeTeamPending, onEditProject,
  canManageRoster, canEdit,
}: CollaborateWorkspaceProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-6">

      {/* Team */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-foreground">Team</h3>
          <Button variant="secondary" size="sm" onClick={() => { setSelectedTeamId(''); setAddOpen(true); }} disabled={!canManageRoster} title={!canManageRoster ? READ_ONLY_TOOLTIP : undefined}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Contributing Team
          </Button>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          {(primaryTeam || primaryTeamName) ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {primaryTeam?.pmo_name ?? primaryTeamName}
                </p>
                <p className="text-xs text-muted-foreground">Primary Team</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                No primary team assigned.{' '}
                <button onClick={onEditProject} className="text-primary hover:underline">Assign one</button>
              </p>
            </div>
          )}
          {contributingTeams.map((t) => {
            const teamName = t['_pmo_team_value@OData.Community.Display.V1.FormattedValue'] ?? t.pmo_name ?? 'Unknown';
            return (
              <div key={t.pmo_projectteamid} className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{teamName}</p>
                  <p className="text-xs text-muted-foreground">
                    Contributing{t.pmo_joineddate ? ` · Joined ${fmtDate(t.pmo_joineddate)}` : ''}
                  </p>
                </div>
                {canManageRoster && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setRemoveTarget({ id: t.pmo_projectteamid, name: teamName })}
                    title="Remove contributing team"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
          {contributingTeams.length === 0 && !(primaryTeam || primaryTeamName) && (
            <p className="text-xs text-muted-foreground px-1">No teams assigned to this project.</p>
          )}
          {contributingTeams.length === 0 && (primaryTeam || primaryTeamName) && (
            <p className="text-xs text-muted-foreground px-1">No contributing teams. Add teams that support this project using the button above.</p>
          )}
        </div>
      </div>

      {/* Meetings — MeetingWorkspace renders its own header and action button */}
      <div className="border-t border-border pt-6">
        <MeetingWorkspace projectId={projectId} canEdit={canEdit} />
      </div>

      {/* Add Contributing Team Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contributing Team</DialogTitle>
            <DialogDescription>Select a team to add as a contributing team on this project.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team..." />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    All teams are already assigned.
                  </div>
                ) : (
                  availableTeams.map((t) => (
                    <SelectItem key={t.teamid} value={t.teamid}>{t.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="secondary" disabled={addTeamPending} onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedTeamId || addTeamPending}
              onClick={() => {
                if (!selectedTeamId) return;
                onAddTeam({
                  'pmo_Project@odata.bind': `/msdyn_projects(${projectId})`,
                  'pmo_Team@odata.bind': `/teams(${selectedTeamId})`,
                  pmo_role: TEAM_ROLE.Contributing,
                  pmo_joineddate: new Date().toISOString().split('T')[0],
                });
                setAddOpen(false);
                setSelectedTeamId('');
              }}
            >
              {addTeamPending ? 'Adding...' : 'Add Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm Dialog */}
      {removeTarget && (
        <Dialog open={!!removeTarget} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove contributing team</DialogTitle>
              <DialogDescription>Remove &ldquo;{removeTarget.name}&rdquo; as a contributing team on this project?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={removeTeamPending}
                onClick={() => {
                  onRemoveTeam(removeTarget.id);
                  setRemoveTarget(null);
                }}
              >
                {removeTeamPending ? 'Removing...' : 'Remove'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
