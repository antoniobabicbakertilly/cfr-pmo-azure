/**
 * Intake "extras" holding pen.
 *
 * Until the corresponding Dataverse columns exist on pmo_projectrequest, the
 * fields needed to auto-convert an approved request into a project (PM, Sponsor,
 * Complexity, Strategic Priority, CFR Category) live inside the existing
 * pmo_extractedfieldsjson column under a namespaced sub-object.
 *
 * Layout written to pmo_extractedfieldsjson:
 *   {
 *     // top-level keys owned by the AI extractor (kept untouched):
 *     cfrCategory: 893460053,
 *     ...other AI-extracted keys...,
 *
 *     // namespaced sub-object owned by the intake form / approval gate:
 *     aip_intakeExtras: {
 *       projectManagerId:   '<systemuser guid>',
 *       executiveSponsorId: '<systemuser guid>',
 *       complexity:         893460062,
 *       strategicPriority:  893460070,
 *       cfrCategory:        893460053,   // mirrors the AI value if user confirms/overrides
 *     }
 *   }
 *
 * When real columns get added, this helper is the single read/write surface
 * to swap — every caller goes through readExtras / writeExtras.
 */

import type { ProjectRequest } from '../models/projectRequest.model';

const NAMESPACE = 'aip_intakeExtras';

export interface IntakeExtras {
  projectManagerId?: string;
  executiveSponsorId?: string;
  complexity?: number;
  strategicPriority?: number;
  cfrCategory?: number;
}

/** Field-key catalog used by the stage form + approval gate. Stable strings so
 *  IntakeStageEditor admins can opt-in fields per stage by name. */
export const EXTRAS_FIELD_KEYS = {
  projectManagerId:   'extras.projectManagerId',
  executiveSponsorId: 'extras.executiveSponsorId',
  complexity:         'extras.complexity',
  strategicPriority:  'extras.strategicPriority',
  cfrCategory:        'extras.cfrCategory',
} as const;

export type ExtrasFieldKey = typeof EXTRAS_FIELD_KEYS[keyof typeof EXTRAS_FIELD_KEYS];

/** Display labels for the holding-pen fields (used by IntakeStageEditor + StageForm). */
export const EXTRAS_FIELD_LABELS: Record<ExtrasFieldKey, string> = {
  [EXTRAS_FIELD_KEYS.projectManagerId]:   'Project Manager',
  [EXTRAS_FIELD_KEYS.executiveSponsorId]: 'Executive Sponsor',
  [EXTRAS_FIELD_KEYS.complexity]:         'Complexity',
  [EXTRAS_FIELD_KEYS.strategicPriority]:  'Strategic Priority',
  [EXTRAS_FIELD_KEYS.cfrCategory]:        'CFR Category',
};

/** Map an extras-field key to its IntakeExtras property name. */
export function extrasKeyToProp(key: ExtrasFieldKey): keyof IntakeExtras {
  switch (key) {
    case EXTRAS_FIELD_KEYS.projectManagerId:   return 'projectManagerId';
    case EXTRAS_FIELD_KEYS.executiveSponsorId: return 'executiveSponsorId';
    case EXTRAS_FIELD_KEYS.complexity:         return 'complexity';
    case EXTRAS_FIELD_KEYS.strategicPriority:  return 'strategicPriority';
    case EXTRAS_FIELD_KEYS.cfrCategory:        return 'cfrCategory';
  }
}

/** True if `key` is one of the synthetic extras.* keys handled by this module. */
export function isExtrasKey(key: string): key is ExtrasFieldKey {
  return key.startsWith('extras.');
}

function parseExtractedJson(json: string | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Read holding-pen extras from a request. Falls back to top-level cfrCategory
 * (written by the AI extractor) if the namespaced cfrCategory is absent.
 */
export function readExtras(request: Pick<ProjectRequest, 'pmo_extractedfieldsjson'>): IntakeExtras {
  const root = parseExtractedJson(request.pmo_extractedfieldsjson);
  const ns = (root[NAMESPACE] as Record<string, unknown> | undefined) ?? {};

  const out: IntakeExtras = {};
  if (typeof ns.projectManagerId === 'string')   out.projectManagerId   = ns.projectManagerId;
  if (typeof ns.executiveSponsorId === 'string') out.executiveSponsorId = ns.executiveSponsorId;
  if (typeof ns.complexity === 'number')         out.complexity         = ns.complexity;
  if (typeof ns.strategicPriority === 'number')  out.strategicPriority  = ns.strategicPriority;
  if (typeof ns.cfrCategory === 'number')        out.cfrCategory        = ns.cfrCategory;
  else if (typeof root.cfrCategory === 'number') out.cfrCategory        = root.cfrCategory;

  return out;
}

/**
 * Merge a patch into the holding pen and return a new pmo_extractedfieldsjson
 * string. The AI extractor's top-level keys are preserved untouched. Callers
 * pass the result to updateProjectRequest({ pmo_extractedfieldsjson: ... }).
 *
 * Pass `undefined` for a property to leave it unchanged. Pass `null` (cast) to
 * delete it. Empty strings on lookup IDs delete the key as well.
 */
export function writeExtras(
  request: Pick<ProjectRequest, 'pmo_extractedfieldsjson'>,
  patch: Partial<IntakeExtras>,
): string {
  const root = parseExtractedJson(request.pmo_extractedfieldsjson);
  const ns: Record<string, unknown> = { ...((root[NAMESPACE] as Record<string, unknown>) ?? {}) };

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === '' || v === null) delete ns[k];
    else ns[k] = v;
  }

  // Mirror confirmed cfrCategory back to the top level so the existing
  // ProjectOnboardingWizard prefill (which reads root.cfrCategory directly)
  // keeps working without refactoring every consumer.
  if (typeof ns.cfrCategory === 'number') {
    root.cfrCategory = ns.cfrCategory;
  }

  root[NAMESPACE] = ns;
  return JSON.stringify(root);
}
