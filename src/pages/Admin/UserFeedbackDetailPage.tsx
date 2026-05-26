import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { ErrorBanner } from '../../components/common/ErrorBanner';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { getUserFeedback, updateUserFeedback } from '../../api/userFeedback.api';
import { FEEDBACK_STATUS, FEEDBACK_PRIORITY } from '../../lib/constants';
import { toast } from '../../hooks/useToast';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { useUserSearch } from '../../hooks/useIntakeLookups';
import { listAnnotations, openAnnotationDocument, createAttachment, type AnnotationAttachment } from '../../api/intakeAttachments.api';
import { ImagePlus, Paperclip } from 'lucide-react';
import { useRef } from 'react';
import { markFeedbackSaving, clearFeedbackSaving } from '../../lib/feedbackSaveStore';

const STATUS_OPTIONS = [
  { value: FEEDBACK_STATUS.New, label: 'New' },
  { value: FEEDBACK_STATUS.InReview, label: 'In Review' },
  { value: FEEDBACK_STATUS.Accepted, label: 'Accepted' },
  { value: FEEDBACK_STATUS.Resolved, label: 'Resolved' },
];

// Sentinel value for "no priority set" so the Select can represent the
// unset state while still being a controlled component.
const PRIORITY_UNSET = '__unset__';
const PRIORITY_OPTIONS = [
  { value: PRIORITY_UNSET, label: 'Unset' },
  { value: String(FEEDBACK_PRIORITY.Critical), label: 'Critical' },
  { value: String(FEEDBACK_PRIORITY.High), label: 'High' },
  { value: String(FEEDBACK_PRIORITY.Medium), label: 'Medium' },
  { value: String(FEEDBACK_PRIORITY.Low), label: 'Low' },
];

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="rounded-md border bg-muted/30 p-4">
        {children}
      </div>
    </div>
  );
}

export function UserFeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: item, isLoading, error } = useQuery({
    queryKey: ['userFeedback', id],
    queryFn: () => getUserFeedback(id!),
    enabled: !!id,
  });

  const [status, setStatus] = useState<number>(FEEDBACK_STATUS.New);
  const [priority, setPriority] = useState<number | null>(null);
  const [response, setResponse] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  // Track an explicit "user touched the picker" flag so we always send the
  // ownerid bind on save, even when the new id happens to equal the row's
  // creator (which we display as Unassigned). Without this, picking yourself
  // on a freshly-submitted item is a no-op because the comparison says
  // nothing changed.
  const [ownerDirty, setOwnerDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { searchUsers, resolveUserLabel } = useUserSearch();

  useEffect(() => {
    if (item) {
      setStatus(item.pmo_status ?? FEEDBACK_STATUS.New);
      setPriority(item.pmo_priority ?? null);
      setResponse(item.pmo_responsecomments ?? '');
      setOwnerDirty(false);
      // Trust the persisted owner. Dataverse stamps the creator as the initial
      // owner; the list view labels that case with a '(submitter)' hint so
      // admins can still spot un-triaged rows without us second-guessing the
      // picker value here (which caused a self-assign no-op bug).
      setOwnerId(item['_ownerid_value'] ?? null);
    }
  }, [item]);

  const { data: attachments = [] } = useQuery({
    queryKey: ['feedbackAttachments', id],
    queryFn: () => listAnnotations(id!),
    enabled: !!id,
  });

  async function handleUploadAttachment(file: File) {
    if (!id || !file) return;
    setUploading(true);
    try {
      await createAttachment('pmo_userfeedback', 'pmo_userfeedbacks', id, file);
      qc.invalidateQueries({ queryKey: ['feedbackAttachments', id] });
      toast.success('Attachment uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    try {
      const payload: Parameters<typeof updateUserFeedback>[1] = {
        pmo_status: status,
        pmo_priority: priority ?? undefined,
        pmo_responsecomments: response.trim() || undefined,
      };
      // ownerid binds to systemusers (we only let users pick people). Send the
      // bind whenever the admin explicitly interacted with the picker, even if
      // the resolved user id matches what's already on the record - we don't
      // try to second-guess the user's intent here.
      if (ownerDirty && ownerId) {
        payload['ownerid@odata.bind'] = `/systemusers(${ownerId})`;
      }
      // Mark this row as in-flight BEFORE the navigate so the list paints the
      // dim-row + spinner on first render instead of flashing the stale row.
      markFeedbackSaving(id);
      try {
        await updateUserFeedback(id, payload);
        toast.success('Feedback updated');
        navigate('/admin/user-feedback');
        // Force the list to re-fetch with the new values; once that promise
        // settles, drop the dim marker. invalidate -> refetch chain happens
        // automatically inside react-query when the list page is mounted.
        await qc.invalidateQueries({ queryKey: ['userFeedback'] });
        qc.invalidateQueries({ queryKey: ['userFeedback', id] });
      } finally {
        clearFeedbackSaving(id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <PageHeader title="Feedback Detail" showBack onBack={() => navigate('/admin/user-feedback')} />
        <ErrorBanner error={error as Error | null} />
      </div>
    );
  }

  const hasChanges = status !== (item.pmo_status ?? FEEDBACK_STATUS.New) || (priority ?? null) !== (item.pmo_priority ?? null) || response.trim() !== (item.pmo_responsecomments ?? '').trim() || ownerDirty;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={item.pmo_title}
        showBack
        onBack={() => navigate('/admin/user-feedback')}
        actions={
          <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        }
      />

      {/* Description */}
      <FieldBlock label="Description">
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {item.pmo_description || 'No description provided.'}
        </p>
      </FieldBlock>

      {/* Priority - editable */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Priority</p>
        <Select
          value={priority == null ? PRIORITY_UNSET : String(priority)}
          onValueChange={(v) => setPriority(v === PRIORITY_UNSET ? null : Number(v))}
        >
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Submitted By */}
      <FieldBlock label="Submitted By">
        <p className="text-sm text-foreground">
          {item['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? '—'}
        </p>
      </FieldBlock>

      {/* Submitted On */}
      <FieldBlock label="Submitted On">
        <p className="text-sm text-foreground">
          {item.createdon ? new Date(item.createdon).toLocaleDateString() : '—'}
        </p>
      </FieldBlock>

      {/* Status — editable */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
        <Select value={String(status)} onValueChange={(v) => setStatus(Number(v))}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Assigned To */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Assigned To</p>
        <SearchableSelect
          value={ownerId ?? ''}
          onChange={(v) => { setOwnerId(v || null); setOwnerDirty(true); }}
          onSearch={searchUsers}
          resolveLabel={resolveUserLabel}
          placeholder="Search for a user to assign..."
        />
      </div>

      {/* Attachments / screenshots */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Attachments</p>
          <label className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer">
            <ImagePlus className="h-3.5 w-3.5" />
            {uploading ? 'Uploading...' : 'Add file'}
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadAttachment(f);
              }}
            />
          </label>
        </div>
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No attachments.</p>
        ) : (
          <ul className="space-y-2">
            {attachments.map((a) => (
              <AttachmentItem key={a.annotationid} attachment={a} />
            ))}
          </ul>
        )}
      </div>

      {/* Admin Response — always visible, editable */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin Response</p>
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Add notes or a response for this feedback item..."
          rows={4}
        />
      </div>
    </div>
  );
}

/**
 * Single attachment row. For images we lazily fetch the binary through the
 * Power Apps SDK and render it as a blob URL thumbnail - the Power Apps host
 * runs on powerplatformusercontent.com so a direct documentbody/\$value link
 * 404s with RouteNotFound. Clicking the row opens the same blob in a new tab.
 */
function AttachmentItem({ attachment }: { attachment: AnnotationAttachment }) {
  async function handleOpen() {
    try {
      await openAnnotationDocument(attachment.annotationid);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open attachment');
    }
  }

  return (
    <li className="rounded-md border bg-muted/20 p-2">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-2 text-sm text-primary hover:underline w-full text-left"
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span className="truncate">{attachment.filename ?? 'attachment'}</span>
        {attachment.filesize != null && <span className="text-xs text-muted-foreground ml-auto">{(attachment.filesize / 1024).toFixed(0)} KB</span>}
      </button>
    </li>
  );
}
