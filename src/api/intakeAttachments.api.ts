/**
 * Attachment API — wraps the Dataverse `annotation` (notes) table for file
 * uploads. Annotation is a polymorphic table whose `objectid` lookup can point
 * at any entity; the @odata.bind binding name must encode the target entity:
 *
 *   'objectid_<entity_logical_name>@odata.bind': '/<entity_set>(<guid>)'
 *
 * e.g. for an intake request (pmo_projectrequest) the binding is
 *      'objectid_pmo_projectrequest@odata.bind': '/pmo_projectrequests(...)'
 *
 * Sending the bare 'objectid@odata.bind' fails with 0x80048d19 because that's
 * the lookup column name, not a navigation property.
 *
 * Used today by:
 *   - Intake artifact upload (Stage Approval, 5-stage governed intake)
 *   - User Feedback screenshot upload (bug reports + enhancements)
 *   - Any other place that needs to attach a file to a Dataverse record
 */
import * as dv from '../lib/dataverseClient';
import { ENTITY_SETS } from '../lib/constants';

const SET = ENTITY_SETS.annotation;

export interface AnnotationAttachment {
  annotationid: string;
  filename?: string;
  mimetype?: string;
  filesize?: number;
  documentbody?: string;  // base64 — only populated on single-record GET
  createdon?: string;
  '_objectid_value'?: string;
}

/** @deprecated Kept for old call sites; use AnnotationAttachment. */
export type IntakeAttachment = AnnotationAttachment;

/**
 * Upload a file as a Dataverse annotation attached to any record.
 *
 * @param targetEntityLogicalName  e.g. 'pmo_projectrequest', 'pmo_userfeedback'
 * @param targetEntitySetName      e.g. 'pmo_projectrequests', 'pmo_userfeedbacks'
 * @param targetId                  GUID of the parent record
 * @param file                      File to upload (read as base64)
 */
export async function createAttachment(
  targetEntityLogicalName: string,
  targetEntitySetName: string,
  targetId: string,
  file: File,
): Promise<AnnotationAttachment> {
  if (!targetId) {
    throw new Error('Cannot upload attachment: the parent record has not been saved yet.');
  }
  const documentbody = await fileToBase64(file);
  // Polymorphic objectid binding: nav property is objectid_<entity logical>
  const bindKey = `objectid_${targetEntityLogicalName}@odata.bind`;
  const payload: Record<string, unknown> = {
    filename: file.name,
    mimetype: file.type || 'application/octet-stream',
    documentbody,
    subject: file.name,
    [bindKey]: `/${targetEntitySetName}(${targetId})`,
  };
  return dv.create<AnnotationAttachment>(SET, payload);
}

export async function listAnnotations(parentId: string): Promise<AnnotationAttachment[]> {
  return dv.list<AnnotationAttachment>(SET, {
    $select: ['annotationid', 'filename', 'mimetype', 'filesize', 'createdon', '_objectid_value'],
    $filter: `_objectid_value eq ${parentId} and isdocument eq true`,
    $orderby: 'createdon asc',
  });
}

/**
 * Back-compat wrapper for the original intake-only call sites. Routes through
 * the generic createAttachment() so the polymorphic
 * `objectid_pmo_projectrequest@odata.bind` bind is used -- which is the only
 * shape Dataverse's annotation table accepts. Bare `objectid@odata.bind` is
 * the lookup column name, not a nav property, and fails with 0x80048d19.
 *
 * Requires Notes enabled on pmo_projectrequest (HasRelatedNotes=True). If you
 * see 0x80048d19 here, the annotation_pmo_projectrequest relationship is
 * missing from the target environment -- re-import the managed solution from
 * DEV (the managed-solution flow carries the relationship).
 */
export async function createAnnotation(
  requestId: string,
  file: File,
): Promise<AnnotationAttachment> {
  return createAttachment('pmo_projectrequest', 'pmo_projectrequests', requestId, file);
}

/**
 * @deprecated The Power Apps host runs the app on powerplatformusercontent.com,
 * not the Dataverse env URL, so a constructed /api/data/.../documentbody/$value
 * link 404s with RouteNotFound. Use openAnnotationDocument() instead.
 */
export function getAnnotationDownloadUrl(annotationId: string, environmentUrl: string): string {
  return `${environmentUrl}/api/data/v9.2/annotations(${annotationId})/documentbody/$value`;
}

/**
 * Fetch the file body for a single annotation through the Power Apps SDK
 * and open it as a blob URL. Avoids hard-coding any Dataverse base URL and
 * works regardless of whether the app runs inside Power Apps or a standalone
 * dev server.
 */
export async function openAnnotationDocument(annotationId: string): Promise<void> {
  const row = await dv.get<AnnotationAttachment>(SET, annotationId, [
    'annotationid', 'filename', 'mimetype', 'documentbody',
  ]);
  if (!row.documentbody) {
    throw new Error('Attachment has no document body.');
  }
  const binary = atob(row.documentbody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: row.mimetype || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Give the new tab time to load before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
