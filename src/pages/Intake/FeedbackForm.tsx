import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, Lightbulb, Loader2, ChevronLeft, ImagePlus, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { PageHeader } from '../../components/layout/PageHeader';
import { useCreateUserFeedback } from '../../hooks/useUserFeedback';
import { FEEDBACK_TYPE, FEEDBACK_STATUS } from '../../lib/constants';
import { toast } from '../../hooks/useToast';
import { createAttachment } from '../../api/intakeAttachments.api';

interface Props {
  type: 'bug' | 'enhancement';
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB

export function FeedbackForm({ type }: Props) {
  const navigate = useNavigate();
  const createFeedback = useCreateUserFeedback();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBug = type === 'bug';
  const feedbackType = isBug ? FEEDBACK_TYPE.BugReport : FEEDBACK_TYPE.Enhancement;

  function handleSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are supported as screenshots.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error('Screenshot must be smaller than 5 MB.');
      e.target.value = '';
      return;
    }
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  }

  function clearScreenshot() {
    setScreenshot(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const created = await createFeedback.mutateAsync({
        pmo_title: title.trim(),
        pmo_description: description.trim() || undefined,
        pmo_feedbacktype: feedbackType,
        pmo_status: FEEDBACK_STATUS.New,
        pmo_sourcecontext: window.location.pathname.slice(0, 900),
      });
      // Upload screenshot as a Dataverse annotation on the new feedback record.
      // Best-effort: if it fails, the feedback row still exists — surface a
      // warning toast but don't block the success path.
      if (screenshot && created.pmo_userfeedbackid) {
        try {
          await createAttachment(
            'pmo_userfeedback',
            'pmo_userfeedbacks',
            created.pmo_userfeedbackid,
            screenshot,
          );
        } catch (err) {
          console.warn('[FeedbackForm] screenshot upload failed', err);
          toast.error('Feedback saved, but the screenshot upload failed. You can add it from the detail page.');
        }
      }
      toast.success(isBug ? 'Bug report submitted — thank you!' : 'Enhancement suggestion submitted — thank you!');
      navigate('/intake');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title={isBug ? 'Report a Bug' : 'Suggest an Enhancement'}
        subtitle={isBug
          ? 'Describe the issue you encountered so the team can investigate'
          : 'Share your idea for improving the application'
        }
        showBack
        onBack={() => navigate('/intake/new')}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
          {isBug
            ? <Bug className="h-5 w-5 text-rose-500 shrink-0" />
            : <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
          }
          <p className="text-sm text-muted-foreground">
            {isBug
              ? 'Bug reports help the team identify and fix issues. Include steps to reproduce and a screenshot if possible.'
              : 'Enhancement suggestions help shape the product roadmap. Be as specific as you can about the desired behavior.'
            }
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isBug ? 'Brief summary of the bug' : 'Brief summary of your suggestion'}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Description
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isBug
              ? 'What happened? What did you expect? Steps to reproduce...'
              : 'Describe the enhancement and how it would help your workflow...'
            }
            rows={6}
          />
        </div>

        {/* Screenshot upload */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Screenshot {isBug ? '(recommended)' : '(optional)'}
          </Label>
          {!screenshot ? (
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/20 px-4 py-6 cursor-pointer hover:bg-muted/40 transition-colors text-sm text-muted-foreground">
              <ImagePlus className="h-4 w-4" />
              <span>Click to attach a screenshot (PNG / JPG, up to 5 MB)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleSelectFile}
              />
            </label>
          ) : (
            <div className="rounded-md border border-input bg-muted/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground truncate">
                  {screenshot.name} · {(screenshot.size / 1024).toFixed(0)} KB
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clearScreenshot} className="h-7 w-7 p-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {screenshotPreview && (
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="max-h-64 w-auto rounded border border-border"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/intake/new')}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {submitting ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
}
