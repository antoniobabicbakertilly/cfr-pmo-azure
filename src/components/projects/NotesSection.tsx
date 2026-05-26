/**
 * NotesSection — composer + recent feed, used in two places:
 *   1) Project detail page → new "Notes" tab. Composer creates project
 *      notes. The feed shows project notes PLUS rolled-up task notes
 *      (each task note carries a small "Task" badge with the task name).
 *   2) Task detail panel → "Notes" section at the bottom. Composer
 *      creates task notes. The feed shows only this task's notes.
 *
 * Per the manager's requirement, every note round-trips through the
 * Dataverse `annotation` table so existing model-driven Timeline and
 * org automations keep firing.
 *
 * v1 scope locked with the user:
 *   - plain-text body (newlines preserved), no rich-text toolbar
 *   - edit + delete OWN notes only
 *   - search box for the feed
 *   - no attachments here (intakeAttachments handles that surface)
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Trash2, Search, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { cn } from '../../lib/utils';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import {
  useProjectNotes,
  useTaskNotes,
  useTaskNotesRollup,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from '../../hooks/useProjectNotes';
import type { ProjectNote } from '../../api/projectNotes.api';

type NotesScope =
  | { kind: 'project'; projectId: string; rollupTasks?: { id: string; name: string }[] }
  | { kind: 'task'; projectId: string; taskId: string };

interface Props {
  scope: NotesScope;
  /** Optional: render compact (used inside the slim TaskDetailPanel). */
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  if (!name) return '··';
  // "O.Keen, Teresa" → "OT"; "Antonio Lima" → "AL"
  const cleaned = name.replace(/[.,]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // Try last name first if formatted "Last, First", otherwise first + last.
  const first = parts[0][0];
  const second = parts[parts.length - 1][0];
  return (first + second).toUpperCase();
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Decide whether the current user is the author of a note. We rely on the
 * Dataverse client's getCurrentUserId helper for "who am I". If we can't
 * resolve it for any reason, fall back to hiding the edit/delete affordances
 * — safer than showing them and 403-ing on click.
 */
function isOwnNote(note: ProjectNote, currentUserId: string | null | undefined): boolean {
  if (!currentUserId) return false;
  return (note['_createdby_value'] ?? '').toLowerCase() === currentUserId.toLowerCase();
}

// ── Composer ─────────────────────────────────────────────────────────────────

function Composer({
  onSave,
  onCancel,
  initialTitle = '',
  initialBody = '',
  saveLabel = 'Add note and close',
  isPending,
  compact,
  resetSignal,
}: {
  onSave: (title: string, body: string) => void;
  onCancel?: () => void;
  initialTitle?: string;
  initialBody?: string;
  saveLabel?: string;
  isPending: boolean;
  compact?: boolean;
  /** Bumped by the parent after a successful save to clear the composer. */
  resetSignal?: number;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);

  // Clear the composer when the parent bumps resetSignal (post-save).
  useEffect(() => {
    if (resetSignal === undefined) return;
    setTitle(initialTitle);
    setBody(initialBody);
    // initialTitle/initialBody intentionally omitted from deps — we only want
    // to react to the parent's reset signal, not to render-time changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);
  const dirty = title.trim() !== initialTitle.trim() || body.trim() !== initialBody.trim();

  function handleSave() {
    if (!body.trim()) return;
    onSave(title.trim(), body);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <Input
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={isPending}
        className="text-sm"
      />
      <textarea
        placeholder="Write a note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={isPending}
        rows={compact ? 3 : 5}
        className="w-full text-sm bg-muted/20 border border-border rounded-md px-3 py-2 outline-none focus:border-primary resize-y disabled:opacity-50"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isPending || !body.trim() || !dirty}
        >
          {isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

// ── Note row ─────────────────────────────────────────────────────────────────

function NoteRow({
  note,
  taskName,        // optional — when set, render a "Task: <name>" badge
  currentUserId,
  onEdit,
  onDelete,
  isEditing,
  onCancelEdit,
  onSaveEdit,
  isSaving,
}: {
  note: ProjectNote;
  taskName?: string;
  currentUserId: string | null | undefined;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  onSaveEdit: (title: string, body: string) => void;
  isSaving: boolean;
}) {
  const author =
    (note['_createdby_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ?? '—';
  const own = isOwnNote(note, currentUserId);
  const wasEdited = note.modifiedon && note.createdon && note.modifiedon !== note.createdon;

  return (
    <div className="flex items-start gap-3 px-3 py-3 border-t border-border first:border-t-0">
      <div className="h-8 w-8 rounded-full bg-blue-500 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
        {initials(author)}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row: type label + task badge + actions */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            Note
          </span>
          {taskName && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
              Task: {taskName}
            </span>
          )}
          {own && !isEditing && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={onEdit}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
                title="Edit note"
                aria-label="Edit note"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive p-1 rounded"
                title="Delete note"
                aria-label="Delete note"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Author byline */}
        <p className="text-[11px] text-muted-foreground mb-1">By: {author}</p>

        {/* Body — either an inline editor or rendered text */}
        {isEditing ? (
          <Composer
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            initialTitle={note.subject ?? ''}
            initialBody={note.notetext ?? ''}
            saveLabel="Save changes"
            isPending={isSaving}
            compact
          />
        ) : (
          <>
            {note.subject && (
              <p className="text-sm font-medium text-foreground mb-0.5">{note.subject}</p>
            )}
            {note.notetext && (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note.notetext}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {formatTimestamp(note.createdon)}
              {wasEdited && <span className="ml-1.5 italic">(edited)</span>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function NotesSection({ scope, compact }: Props) {
  // Reads — pick the right hook(s) based on scope.
  const projectId = scope.projectId;
  const projectNotesQuery = useProjectNotes(scope.kind === 'project' ? projectId : undefined);
  const taskNotesQuery = useTaskNotes(scope.kind === 'task' ? scope.taskId : undefined);
  const taskRollupTaskIds =
    scope.kind === 'project' ? (scope.rollupTasks ?? []).map((t) => t.id) : [];
  const taskRollupQuery = useTaskNotesRollup(
    scope.kind === 'project' ? projectId : undefined,
    taskRollupTaskIds,
  );

  // Mutations.
  const createMutation = useCreateNote(projectId);
  const updateMutation = useUpdateNote(
    projectId,
    scope.kind === 'project'
      ? { kind: 'project', parentId: projectId }
      : { kind: 'task', parentId: scope.taskId },
  );
  const deleteMutation = useDeleteNote(
    projectId,
    scope.kind === 'project'
      ? { kind: 'project', parentId: projectId }
      : { kind: 'task', parentId: scope.taskId },
  );

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectNote | null>(null);
  // Bumped after a successful create — the composer watches this to clear
  // its title/body fields once the new note has been persisted.
  const [composerResetSignal, setComposerResetSignal] = useState(0);
  // Resolved current systemuserid (Power Apps SDK → AAD lookup). Used by
  // NoteRow to decide whether to show the edit/delete buttons on a note.
  const currentUserId = useCurrentUserId();

  // ── Build the merged feed ─────────────────────────────────────────────────
  // Project scope: project notes + task-rollup notes, keyed by createdon desc.
  // Each rolled-up task note carries the task name so we can badge it.
  const feed = useMemo(() => {
    type FeedItem = { note: ProjectNote; taskName?: string };
    const items: FeedItem[] = [];
    if (scope.kind === 'project') {
      for (const n of projectNotesQuery.data ?? []) items.push({ note: n });
      const taskNameById = new Map((scope.rollupTasks ?? []).map((t) => [t.id, t.name]));
      for (const n of taskRollupQuery.data ?? []) {
        items.push({ note: n, taskName: taskNameById.get(n['_objectid_value'] ?? '') ?? 'Task' });
      }
    } else {
      for (const n of taskNotesQuery.data ?? []) items.push({ note: n });
    }
    items.sort((a, b) => {
      const at = a.note.createdon ? new Date(a.note.createdon).getTime() : 0;
      const bt = b.note.createdon ? new Date(b.note.createdon).getTime() : 0;
      return bt - at;
    });
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      ({ note, taskName }) =>
        (note.subject ?? '').toLowerCase().includes(q) ||
        (note.notetext ?? '').toLowerCase().includes(q) ||
        (taskName ?? '').toLowerCase().includes(q) ||
        ((note['_createdby_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ?? '')
          .toLowerCase()
          .includes(q),
    );
  }, [scope, projectNotesQuery.data, taskNotesQuery.data, taskRollupQuery.data, search]);

  const isLoading =
    (scope.kind === 'project' && (projectNotesQuery.isLoading || taskRollupQuery.isLoading)) ||
    (scope.kind === 'task' && taskNotesQuery.isLoading);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleCreate(title: string, body: string) {
    if (!body.trim()) return;
    createMutation.mutate(
      scope.kind === 'project'
        ? { parentId: projectId, parentEntitySet: 'msdyn_projects', title, body }
        : { parentId: scope.taskId, parentEntitySet: 'msdyn_projecttasks', title, body },
      { onSuccess: () => setComposerResetSignal((n) => n + 1) },
    );
  }

  function handleSaveEdit(noteId: string, title: string, body: string) {
    updateMutation.mutate(
      { noteId, title, body },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function handleConfirmedDelete() {
    if (!confirmDelete) return;
    const noteId = confirmDelete.annotationid;
    deleteMutation.mutate(noteId, { onSuccess: () => setConfirmDelete(null) });
  }

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {/* Composer */}
      <Composer
        onSave={handleCreate}
        isPending={createMutation.isPending}
        compact={compact}
        resetSignal={composerResetSignal}
      />

      {/* Search + count */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {feed.length} note{feed.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading notes…</span>
        </div>
      ) : feed.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center">
          <FileText className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No notes yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? 'Try a different search.' : 'Add the first note above.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y overflow-hidden">
          {feed.map(({ note, taskName }) => (
            <NoteRow
              key={note.annotationid}
              note={note}
              taskName={taskName}
              currentUserId={currentUserId}
              onEdit={() => setEditingId(note.annotationid)}
              onDelete={() => setConfirmDelete(note)}
              isEditing={editingId === note.annotationid}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(t, b) => handleSaveEdit(note.annotationid, t, b)}
              isSaving={updateMutation.isPending && editingId === note.annotationid}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete this note?"
        message="This action can't be undone."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmedDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
