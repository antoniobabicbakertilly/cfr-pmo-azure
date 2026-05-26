import { Bell, Check, X, Circle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';
import { Button } from '../ui/button';
import { useNotifications, useUnreadCount, useMarkAsRead, useDismissNotification } from '../../hooks/useNotifications';
import { useConfig } from '../../providers/ConfigurationProvider';
import { NOTIF_CATEGORY } from '../../lib/constants';

const DEFAULT_CATEGORY_LABELS: Record<number, string> = {
  [NOTIF_CATEGORY.Gate]: 'Gate',
  [NOTIF_CATEGORY.Artifact]: 'Artifact',
  [NOTIF_CATEGORY.Closeout]: 'Closeout',
  [NOTIF_CATEGORY.Meeting]: 'Meeting',
  [NOTIF_CATEGORY.Error]: 'Error',
  [NOTIF_CATEGORY.Info]: 'Info',
};

const DEFAULT_CATEGORY_COLORS: Record<number, string> = {
  [NOTIF_CATEGORY.Error]: 'text-rose-500',
  [NOTIF_CATEGORY.Gate]: 'text-amber-500',
  [NOTIF_CATEGORY.Meeting]: 'text-blue-500',
};

export function NotificationCenter() {
  const { data: notifications = [] } = useNotifications();
  const unread = useUnreadCount();
  const markRead = useMarkAsRead();
  const dismiss = useDismissNotification();
  const { config: { notificationDisplay } } = useConfig();

  const categoryLabel = (v: number) =>
    notificationDisplay.categoryLabels[String(v)] ??
    DEFAULT_CATEGORY_LABELS[v] ??
    'Info';

  const categoryColor = (v: number) =>
    notificationDisplay.categoryColors[String(v)] ??
    DEFAULT_CATEGORY_COLORS[v] ??
    'text-muted-foreground';

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="relative p-2 rounded-md hover:bg-muted/60 transition-colors">
          <Bell className="h-4.5 w-4.5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No notifications</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.pmo_notificationid}
                className={`rounded-lg border p-3 text-sm ${n.pmo_isread ? 'bg-card' : 'bg-primary/5 border-primary/20'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!n.pmo_isread && <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />}
                    <span className="font-medium text-foreground truncate">{n.pmo_title}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {!n.pmo_isread && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => markRead.mutate(n.pmo_notificationid)}>
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => dismiss.mutate(n.pmo_notificationid)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {n.pmo_body && <p className="text-xs text-muted-foreground mt-1">{n.pmo_body}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] font-medium ${categoryColor(n.pmo_category)}`}>
                    {categoryLabel(n.pmo_category)}
                  </span>
                  {n.createdon && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.createdon).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
