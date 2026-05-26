import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { isDemoModeActive, setDemoMode, subscribeToDemoMode } from '../../lib/demoMode';
import { cn } from '../../lib/utils';

function useDemoMode() {
  return useSyncExternalStore(subscribeToDemoMode, isDemoModeActive);
}

export function DemoModeSection() {
  const active = useDemoMode();
  const qc = useQueryClient();

  function toggle() {
    setDemoMode(!active);
    // Flush the React Query cache so all hooks immediately re-fetch
    // using fixtures (when enabling) or live Dataverse (when disabling)
    qc.clear();
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Demo Mode</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Replace all live Dataverse data with static demo fixtures. Writes are silently suppressed.
          Use when presenting the application to stakeholders without exposing real records.
        </p>
      </div>

      <div
        className={cn(
          'flex items-center justify-between rounded-lg border p-4 transition-colors',
          active ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-card',
        )}
      >
        <div className="flex items-center gap-3">
          <FlaskConical
            className={cn('h-5 w-5 shrink-0', active ? 'text-amber-500' : 'text-muted-foreground')}
          />
          <div>
            <p className={cn('text-sm font-medium', active ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
              {active ? 'Demo Mode is ON' : 'Demo Mode is OFF'}
            </p>
            <p className="text-xs text-muted-foreground">
              {active
                ? 'The application is showing sample data only. All writes are suppressed.'
                : 'The application is connected to the live Dataverse environment.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={toggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
            'transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2',
            active ? 'bg-amber-500' : 'bg-input',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg',
              'transform transition duration-200 ease-in-out',
              active ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      {active && (
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
          Demo mode is stored per browser. Other users are not affected.
          Toggle off to restore live data immediately.
        </p>
      )}
    </div>
  );
}
