import { SubmitProgressBar } from '../common/SubmitProgressBar';
import { useState, createContext, useContext, useSyncExternalStore } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Keyboard, Sparkles, FlaskConical } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { ThemeToggle } from '../../lib/theme';
import { MiraPanel } from '../mira/MiraPanel';
import { NotificationCenter } from './NotificationCenter';
import { useFeatureToggles } from '../../providers/ConfigurationProvider';
import { isDemoModeActive, subscribeToDemoMode } from '../../lib/demoMode';

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
});

export function useSidebarState() {
  return useContext(SidebarContext);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [miraOpen, setMiraOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const featureToggles = useFeatureToggles();
  const demoMode = useSyncExternalStore(subscribeToDemoMode, isDemoModeActive);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <motion.div
          className="flex-1 flex flex-col overflow-hidden"
          animate={{ marginLeft: collapsed ? 72 : 260 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Top header bar */}
          <header className="sticky top-0 z-40 h-14 bg-sidebar/80 backdrop-blur-xl border-b border-sidebar-border flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground leading-none">
                  {getGreeting()}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">CFR Project Management</p>
              </div>
              {/* Stage 6: live submit-progress indicator. Renders only while a
                  task-submit batch is in flight, so the user knows what's saving
                  wherever they navigate. */}
              <SubmitProgressBar />
            </div>
            <div className="flex items-center gap-1.5">
              {featureToggles['header.themeToggle'] && (
                <>
                  <ThemeToggle />
                  <div className="w-px h-5 bg-border mx-0.5" />
                </>
              )}
              {featureToggles['header.shortcuts'] && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-foreground hover:bg-accent text-xs"
                    onClick={() => setShortcutsOpen(true)}
                  >
                    <Keyboard className="h-3.5 w-3.5 mr-1.5" />
                    <span className="hidden sm:inline">Shortcuts</span>
                  </Button>
                  <div className="w-px h-5 bg-border mx-0.5" />
                </>
              )}
              <NotificationCenter />
              {featureToggles['header.askMira'] && (
                <>
                  <div className="w-px h-5 bg-border mx-0.5" />
                  <Button
                    variant="brand"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setMiraOpen(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Ask Mira
                  </Button>
                </>
              )}
            </div>
          </header>

          {/* Demo mode banner */}
          {demoMode && (
            <div className="shrink-0 flex items-center gap-2 px-6 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <FlaskConical className="h-3.5 w-3.5 shrink-0" />
              Demo Mode — showing sample data only. Writes are suppressed.
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </motion.div>

        {/* Mira side panel */}
        <Sheet open={miraOpen} onOpenChange={setMiraOpen}>
          <SheetContent className="bg-card border-border w-[400px] sm:max-w-[400px]">
            <SheetHeader>
              <SheetTitle className="text-foreground flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                Ask Mira
              </SheetTitle>
              <SheetDescription className="text-muted-foreground">
                Your AI-powered PMO assistant
              </SheetDescription>
            </SheetHeader>
            <MiraPanel />
          </SheetContent>
        </Sheet>

        {/* Keyboard Shortcuts */}
        <Sheet open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <SheetContent className="bg-card border-border">
            <SheetHeader>
              <SheetTitle className="text-foreground flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Keyboard className="h-3.5 w-3.5" />
                </div>
                Keyboard Shortcuts
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-1">
              {[
                { keys: ['Ctrl', 'K'], desc: 'Quick search' },
                { keys: ['Ctrl', 'B'], desc: 'Toggle sidebar' },
                { keys: ['Ctrl', 'N'], desc: 'New record' },
                { keys: ['Ctrl', 'S'], desc: 'Save' },
                { keys: ['Esc'],       desc: 'Close panel' },
                { keys: ['Ctrl', '/'], desc: 'Show shortcuts' },
              ].map(({ keys, desc }) => (
                <div key={desc} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors">
                  <span className="text-sm text-foreground/70">{desc}</span>
                  <div className="flex gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-2 py-0.5 text-xs font-mono bg-muted border border-border rounded-md text-muted-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </SidebarContext.Provider>
  );
}
