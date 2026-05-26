// Mira AI panel — neutralized for Azure SWA preview build.
// ApprovalGateDialog and MutationResultComponent are kept for test compatibility.

import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { BugReportMutation, EnhancementSuggestionMutation } from '../../ai';

// ── Approval gate dialog (kept for test compatibility) ───────────────────────

interface ApprovalGateDialogProps {
  isOpen: boolean;
  mutation: BugReportMutation | EnhancementSuggestionMutation | null;
  hasReviewed: boolean;
  onReviewedChange: (value: boolean) => void;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ApprovalGateDialog({
  isOpen,
  mutation,
  hasReviewed,
  onReviewedChange,
  onConfirm,
  onCancel,
  isSubmitting,
}: ApprovalGateDialogProps) {
  if (!isOpen || !mutation) return null;
  const isBug = mutation.topicId === 'report-bug';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full mx-4 p-4">
        <h2 className="text-sm font-semibold text-foreground mb-2">
          Confirm {isBug ? 'Bug Report' : 'Enhancement Suggestion'} Submission
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Review the details below before confirming.
        </p>
        <div className="bg-muted/40 rounded-md p-3 mb-3 space-y-2 max-h-[300px] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-foreground">Title</p>
            <p className="text-xs text-muted-foreground">{mutation.title}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Description</p>
            <p className="text-xs text-muted-foreground">{mutation.description}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Source Route</p>
            <p className="text-xs text-muted-foreground font-mono">{mutation.sourceRoute}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{isBug ? 'Severity' : 'Priority'}</p>
            <p className="text-xs text-muted-foreground">
              {isBug
                ? (mutation as BugReportMutation).severity
                : (mutation as EnhancementSuggestionMutation).priority}
            </p>
          </div>
        </div>
        <label className="flex items-start gap-2 mb-4 rounded-md border border-border p-2.5">
          <input
            type="checkbox"
            checked={hasReviewed}
            onChange={(e) => onReviewedChange(e.target.checked)}
            disabled={isSubmitting}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span className="text-xs text-muted-foreground">
            I reviewed this payload and approve creating a new record.
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="flex-1 text-xs px-3 py-2 rounded-md border border-border bg-background hover:bg-accent transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !hasReviewed}
            onClick={onConfirm}
            className="flex-1 text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
          >
            {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {isSubmitting ? 'Creating...' : 'Confirm & Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mutation result (kept for test compatibility) ─────────────────────────────

export function MutationResultComponent({
  result,
  onRetry,
}: {
  result: BugReportMutation | EnhancementSuggestionMutation;
  onRetry?: () => void;
}) {
  const isBug = result.topicId === 'report-bug';
  const isSuccess = result.creationResult === 'success';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {isBug ? 'Bug Report' : 'Enhancement Suggestion'}
        </span>
        <Badge
          variant={isSuccess ? 'default' : result.creationResult === 'failed' ? 'destructive' : 'secondary'}
          className="text-xs h-5"
        >
          {isSuccess ? 'Recorded' : result.creationResult === 'failed' ? 'Failed' : 'Pending'}
        </Badge>
      </div>
      {isSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-md p-3">
          <p className="text-xs text-green-700 font-semibold mb-1">Record Created Successfully</p>
          <p className="text-xs text-green-600">Record ID: {result.recordId}</p>
        </div>
      )}
      {result.creationResult === 'failed' && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
          <p className="text-xs text-destructive font-semibold">Creation Failed</p>
          {result.failureReason && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium text-foreground">Reason: </span>
              {result.failureReason}
            </p>
          )}
          {onRetry && (
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onRetry}>
              Retry Submission
            </Button>
          )}
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-foreground">Title</p>
        <p className="text-xs text-muted-foreground">{result.title}</p>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function MiraPanel() {
  return (
    <div className="flex flex-col h-[calc(100vh-120px)] mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Mira</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Preview</Badge>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
        <Sparkles className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm font-medium text-foreground">AI assistant unavailable</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Mira is not available in this Azure preview build. The full AI-assisted
          analysis experience is available when deployed to the Baker Tilly
          Power Platform environment.
        </p>
      </div>
    </div>
  );
}
