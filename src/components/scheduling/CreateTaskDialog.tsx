import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import type { ProjectTask } from '../../models/projectTask.model';
import type { ProjectBucket } from '../../models/projectBucket.model';
import type { ScheduleTaskCreate } from '../../lib/schedulingClient';
import { serializeError, friendlyTaskError } from '../../lib/utils';

interface Props {
  open: boolean;
  projectId: string;
  buckets: ProjectBucket[];
  defaultBucketId?: string;
  tasks: ProjectTask[];
  onCreateTask: (params: ScheduleTaskCreate) => Promise<void>;
  onError: (msg: string) => void;
  onClose: () => void;
}

const EMPTY_FORM = {
  subject: '',
  bucketId: '',
  parentTaskId: '',
  isMilestone: false,
};

export function CreateTaskDialog({
  open,
  projectId,
  buckets,
  defaultBucketId,
  tasks,
  onCreateTask,
  onError,
  onClose,
}: Props) {
  const [form, setForm] = useState({ ...EMPTY_FORM, bucketId: defaultBucketId ?? '' });
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Reset form each time the dialog opens, picking up the current defaultBucketId.
  // useEffect is required because Radix UI does not call onOpenChange(true) when open
  // is set programmatically from the parent — only user-initiated closes fire it.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, bucketId: defaultBucketId ?? '' });
      setDialogError(null);
    }
  }, [open, defaultBucketId]);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) return;

    // Client-side guard: bucket is required by Dataverse
    if (!form.bucketId) {
      setDialogError('Please select a Bucket before creating the task.');
      return;
    }

    // Close immediately — useCreateProjectTask.onMutate injects the optimistic
    // task with _saving:true so the spinner appears on the board right away.
    onClose();

    onCreateTask({
      projectId,
      bucketId: form.bucketId || undefined,
      parentTaskId: form.parentTaskId || undefined,
      subject: form.subject.trim(),
      isMilestone: form.isMilestone,
    }).catch((err) => {
      onError(`Failed to create task: ${friendlyTaskError(serializeError(err))}`);
    });
  }

  // Only non-summary tasks can be parents (avoid circular parent references)
  const parentCandidates = tasks.filter((t) => !t.msdyn_projecttaskid.startsWith('optimistic-'));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">New Task</DialogTitle>
        </DialogHeader>

        {dialogError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{dialogError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Task name *</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Enter task name"
              className="text-sm"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Bucket *</Label>
              <select
                value={form.bucketId}
                onChange={(e) => setForm((f) => ({ ...f, bucketId: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select a bucket…</option>
                {buckets
                  .filter((b) => !b.msdyn_projectbucketid.startsWith('optimistic-'))
                  .map((b) => (
                    <option key={b.msdyn_projectbucketid} value={b.msdyn_projectbucketid}>
                      {b.msdyn_name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Parent task</Label>
              <select
                value={form.parentTaskId}
                onChange={(e) => setForm((f) => ({ ...f, parentTaskId: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None</option>
                {parentCandidates.map((t) => (
                  <option key={t.msdyn_projecttaskid} value={t.msdyn_projecttaskid}>
                    {t.msdyn_subject}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="milestone"
              type="checkbox"
              checked={form.isMilestone}
              onChange={(e) => setForm((f) => ({ ...f, isMilestone: e.target.checked }))}
              className="h-3.5 w-3.5 rounded border-border"
            />
            <label htmlFor="milestone" className="text-xs text-muted-foreground cursor-pointer">
              Milestone
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!form.subject.trim()}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
