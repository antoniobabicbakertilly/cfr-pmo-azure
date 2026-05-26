import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Safely extracts a readable message from any thrown value (Error, SDK plain object, or unknown). */
export function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.errorCode === 'string') return e.errorCode;
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  }
  return String(err);
}

/**
 * True when the raw error string represents PSS's per-user OperationSet quota lockout.
 * PSS limits each user to 10 unexecuted OperationSets at a time; orphans expire ~5 min.
 */
export function isQuotaError(raw: string): boolean {
  return (
    raw.includes('ScheduleAPI-OV-0004') ||
    raw.includes('maximum number of operation set')
  );
}

/** Friendly, single-line copy for the per-user PSS quota lockout. */
export const QUOTA_ERROR_MESSAGE =
  "You've hit Microsoft's per-user limit of 10 in-flight scheduling operations. " +
  'Wait ~5 minutes for them to expire, then try again. ' +
  '(This is a server-side limit and cannot be raised.)';

/**
 * Parse a Dataverse ScheduleAPI error into a user-friendly message.
 * Falls back to the raw string when the format is unrecognised.
 */
export function friendlyTaskError(raw: string): string {
  // ScheduleAPI-OV-0004 — per-user OperationSet quota exceeded
  if (isQuotaError(raw)) return QUOTA_ERROR_MESSAGE;

  // E_DUPASSN — duplicate resource assignment (PSS rejects assigning a person
  // who is already on the task).
  if (raw.includes('E_DUPASSN') || raw.includes('Duplicate assignment')) {
    return 'That person is already assigned to this task.';
  }
  // E_BATCHFAILED with no recognized inner code — generic batch failure
  if (raw.includes('E_BATCHFAILED')) {
    return "The save couldn't complete. Please try again, or undo your last change if it keeps failing.";
  }

  // ScheduleAPI-EV-0003 — missing required columns
  if (raw.includes('ScheduleAPI-EV-0003') || raw.includes('does not contain all the required columns')) {
    const colMatch = raw.match(/required columns are (.+?)(?:"|$)/i);
    const missing = colMatch?.[1]
      ?.split(',')
      .map((c) => c.trim())
      .map((c) => {
        if (c === 'msdyn_subject') return 'Task Name';
        if (c === 'msdyn_project') return 'Project';
        if (c === 'msdyn_projectbucket') return 'Bucket';
        return c;
      })
      .join(', ');
    return missing
      ? `The following required fields are missing: ${missing}. Please fill them in and try again.`
      : 'Some required fields are missing. Please ensure Task Name and Bucket are filled in.';
  }
  // Generic Dataverse error — strip the noise, keep the message
  const msgMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (msgMatch) return msgMatch[1];
  return raw;
}
