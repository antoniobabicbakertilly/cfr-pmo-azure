import { useState } from 'react';
import { FileText, Plus, ExternalLink, Trash2, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { useProjectDocuments, useCreateDocumentLink, useDeactivateDocumentLink } from '../../hooks/useDocumentLinks';
import { toast } from '../../hooks/useToast';

interface DocumentHubProps {
  projectId: string;
}

export function DocumentHub({ projectId }: DocumentHubProps) {
  const { data: docs = [], isLoading } = useProjectDocuments(projectId);
  const createDoc = useCreateDocumentLink();
  const deactivateDoc = useDeactivateDocumentLink();
  const [addOpen, setAddOpen] = useState(false);
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');

  async function handleAdd() {
    if (!docName.trim() || !docUrl.trim()) return;
    await createDoc.mutateAsync({
      pmo_name: docName.trim(),
      pmo_sharepointurl: docUrl.trim(),
      'pmo_Project@odata.bind': `/msdyn_projects(${projectId})`,
    });
    toast.success('Document linked');
    setAddOpen(false);
    setDocName('');
    setDocUrl('');
  }

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Loading documents...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Documents ({docs.length})
        </h4>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Link Document
        </Button>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents linked to this project.</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.pmo_documentlinkid} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-card text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate text-foreground">{d.pmo_name}</span>
              <a href={d.pmo_sharepointurl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => deactivateDoc.mutate(d.pmo_documentlinkid)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Link Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name" />
            </div>
            <div>
              <label className="text-sm font-medium">SharePoint URL</label>
              <Input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://..." />
            </div>
            <Button size="sm" onClick={handleAdd} disabled={createDoc.isPending || !docName.trim() || !docUrl.trim()}>
              {createDoc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
