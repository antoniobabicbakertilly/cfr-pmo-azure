import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Upload, ExternalLink, FileText, Trash2, Loader2, Link2, FolderOpen,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import {
  listDocuments, uploadDocument, deleteDocument, downloadUrl, formatFileSize,
} from '../../lib/sharePointClient';
import type { DocumentItem, DocumentMetadata, RecordType } from '../../lib/sharePointClient';
import { ARTIFACT_STATUS } from '../../lib/constants';
import { useConfig } from '../../providers/ConfigurationProvider';
import { useCreateDocumentLink } from '../../hooks/useDocumentLinks';
import { useArtifactReadiness } from '../../hooks/useRequiredArtifacts';
import { toast } from '../../hooks/useToast';

interface DocumentLibraryProps {
  recordType: RecordType;
  recordId: string;
  recordName: string;
  projectId?: string;
  programId?: string;
  intakeId?: string;
  taskId?: string;
  compact?: boolean;
  /** When true, hides upload, link, and delete actions — documents are view-only. */
  readOnly?: boolean;
}

export function DocumentLibrary({
  recordType, recordId, recordName,
  projectId, programId, intakeId, taskId,
  compact, readOnly,
}: DocumentLibraryProps) {
  const { config: { spDocumentCategories, spLibraryBaseUrl } } = useConfig();
  const qc = useQueryClient();
  const queryKey = ['spDocs', recordType, recordId];

  const { data: documents = [], isPending, error: spError } = useQuery({
    queryKey,
    queryFn: () => listDocuments({ recordType, recordId }),
    staleTime: 30_000,
    retry: false,
    enabled: !!recordId,
  });

  const createDocLink = useCreateDocumentLink();

  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('General');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showArtifacts = recordType === 'Project' && !!projectId;
  const readiness = useArtifactReadiness(showArtifacts ? projectId : undefined);
  const definitions = readiness?.definitions ?? [];
  const statuses = readiness?.statuses ?? [];

  function buildMetadata(category?: string): DocumentMetadata {
    return {
      recordType,
      recordId,
      recordName,
      documentCategory: category,
      projectId: projectId ?? (recordType === 'Project' ? recordId : undefined),
      programId: programId ?? (recordType === 'Program' ? recordId : undefined),
      intakeId: intakeId ?? (recordType === 'Intake Request' ? recordId : undefined),
      taskId: taskId ?? (recordType === 'Task' ? recordId : undefined),
    };
  }

  function openUploadDialog(files: File[]) {
    setPendingFiles(files);
    setSelectedCategory('General');
    setUploadDialogOpen(true);
  }

  async function handleUploadConfirm() {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setUploadDialogOpen(false);
    const meta = buildMetadata(selectedCategory);
    let successCount = 0;

    for (const file of pendingFiles) {
      try {
        const result = await uploadDocument(file, meta, spLibraryBaseUrl);
        const linkPayload: Record<string, unknown> = {
          pmo_name: result.fileName,
          pmo_sharepointurl: downloadUrl(result.serverRelativeUrl),
          pmo_sharepointitemid: String(result.listItemId),
          pmo_filesize: result.fileSizeBytes,
        };
        if (recordType === 'Program' || recordType === 'Project') {
          const entitySet = recordType === 'Program' ? 'msdyn_projectprograms' : 'msdyn_projects';
          const bindKey = recordType === 'Program' ? 'pmo_Program@odata.bind' : 'pmo_Project@odata.bind';
          const bindId = recordType === 'Program' ? (programId ?? recordId) : (projectId ?? recordId);
          linkPayload[bindKey] = `/${entitySet}(${bindId})`;
        }
        await createDocLink.mutateAsync(linkPayload as Parameters<typeof createDocLink.mutateAsync>[0]);
        successCount++;
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
      qc.invalidateQueries({ queryKey });
    }
    setPendingFiles([]);
    setUploading(false);
  }

  async function handleDelete(item: DocumentItem) {
    setDeletingId(item.listItemId);
    try {
      await deleteDocument(item.listItemId);
      qc.invalidateQueries({ queryKey });
      toast.success(`${item.fileName} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleLinkExternal() {
    if (!linkName.trim() || !linkUrl.trim()) return;
    const payload: Record<string, unknown> = {
      pmo_name: linkName.trim(),
      pmo_sharepointurl: linkUrl.trim(),
    };
    if (recordType === 'Program' || recordType === 'Project') {
      const entitySet = recordType === 'Program' ? 'msdyn_projectprograms' : 'msdyn_projects';
      const bindKey = recordType === 'Program' ? 'pmo_Program@odata.bind' : 'pmo_Project@odata.bind';
      const bindId = recordType === 'Program' ? (programId ?? recordId) : (projectId ?? recordId);
      payload[bindKey] = `/${entitySet}(${bindId})`;
    }
    await createDocLink.mutateAsync(payload as Parameters<typeof createDocLink.mutateAsync>[0]);
    toast.success('External link added');
    setLinkOpen(false);
    setLinkName('');
    setLinkUrl('');
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) openUploadDialog(files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);

  function renderDocRow(doc: DocumentItem) {
    const isDeleting = deletingId === doc.listItemId;
    return (
      <div key={doc.listItemId} className={cn('flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/20 transition-colors', isDeleting && 'opacity-50')}>
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <a href={downloadUrl(doc.serverRelativeUrl)} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate block">
            {doc.fileName}
          </a>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {doc.documentCategory && <span>{doc.documentCategory}</span>}
            <span>{formatFileSize(doc.fileSizeBytes)}</span>
            <span>{new Date(doc.modified).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a href={downloadUrl(doc.serverRelativeUrl)} target="_blank" rel="noreferrer" className="p-1.5 rounded text-muted-foreground hover:text-foreground" title="Open">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {!readOnly && (
            <button onClick={() => handleDelete(doc)} disabled={isDeleting} className="p-1.5 rounded text-muted-foreground hover:text-destructive" title="Delete">
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (spError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">SharePoint library not available</p>
        <p className="text-xs text-muted-foreground mt-1">{spError instanceof Error ? spError.message : 'Connection failed'}</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading documents...</span>
      </div>
    );
  }

  const grouped = groupByCategory
    ? documents.reduce<Record<string, DocumentItem[]>>((acc, doc) => {
        const cat = doc.documentCategory || 'Uncategorized';
        (acc[cat] ??= []).push(doc);
        return acc;
      }, {})
    : null;

  return (
    <div className="space-y-3">
      {/* Artifact readiness pills */}
      {showArtifacts && definitions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {definitions.filter((d) => d.pmo_isrequired).map((def) => {
            const status = statuses.find((s) => s['_pmo_requiredartifact_value'] === def.pmo_requiredartifactid);
            const done = status && (status.pmo_status === ARTIFACT_STATUS.Complete || status.pmo_status === ARTIFACT_STATUS.Waived);
            return (
              <span key={def.pmo_requiredartifactid} className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full',
                done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              )}>
                {def.pmo_name}
              </span>
            );
          })}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          {!compact && documents.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setGroupByCategory((g) => !g)} title="Toggle category grouping">
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          )}
          {!readOnly && (
            <>
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                <Link2 className="h-3.5 w-3.5 mr-1" />Link
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                Upload
              </Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) openUploadDialog(files);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }} />
            </>
          )}
        </div>
      </div>

      {/* Drop zone (full mode only) */}
      {!compact && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'rounded-lg border-2 border-dashed text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5 p-6' : 'border-border',
            documents.length > 0 && !dragOver ? 'p-3' : 'p-6',
          )}
        >
          {documents.length === 0 && !dragOver ? (
            <div>
              <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Drag and drop files here, or use the Upload button</p>
            </div>
          ) : dragOver ? (
            <p className="text-sm text-primary font-medium">Drop files to upload</p>
          ) : null}
        </div>
      )}

      {/* Document list */}
      {grouped ? (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, docs]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 mt-3">{cat}</p>
            <div className="space-y-1">{docs.map((doc) => renderDocRow(doc))}</div>
          </div>
        ))
      ) : documents.length > 0 ? (
        <div className="space-y-1">{documents.map((doc) => renderDocRow(doc))}</div>
      ) : null}

      {/* Upload category picker dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(o) => { if (!o) { setUploadDialogOpen(false); setPendingFiles([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>Select a document category before uploading.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              {pendingFiles.map((f, i) => (
                <p key={i} className="text-sm text-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {f.name} <span className="text-xs text-muted-foreground">({formatFileSize(f.size)})</span>
                </p>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {spDocumentCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setPendingFiles([]); }}>Cancel</Button>
            <Button onClick={handleUploadConfirm}>
              <Upload className="h-3.5 w-3.5 mr-1" />Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link External dialog */}
      <Dialog open={linkOpen} onOpenChange={(o) => { if (!o) setLinkOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link External Document</DialogTitle>
            <DialogDescription>Add a link to a document hosted outside SharePoint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Document Name *</label>
              <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="e.g., Design Spec v2" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">URL *</label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={handleLinkExternal} disabled={!linkName.trim() || !linkUrl.trim() || createDocLink.isPending}>
              {createDocLink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
              Add Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
