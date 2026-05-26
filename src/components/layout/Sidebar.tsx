import { useState, useEffect, useSyncExternalStore } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebarState } from './AppShell';
import {
  LayoutDashboard,
  Inbox,
  FolderKanban,
  Network,
  FileBarChart2,
  Users,
  Activity,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Settings,
  ShieldCheck,
  Gauge,
  Trophy,
  DollarSign,
  Map,
  GitCompare,
  TrendingUp,
  History,
  Calendar,
  Bot,
  MessageSquareText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAdminRole, useEffectiveAdminRole, useFeatureToggles } from '../../providers/ConfigurationProvider';
import { isImpersonatingUser, setImpersonatingUser, subscribeToImpersonation } from '../../lib/adminImpersonation';
import { UserCog, Users as UsersIcon } from 'lucide-react';
import { useCurrentUserTeamsWithNames } from '../../hooks/useCurrentUserTeams';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { usePendingApprovalCount } from '../../hooks/usePendingApprovals';
import { getCachedEnvironmentId, initDeepLinkContext } from '../../lib/deepLink';
import { ENV_IDS } from '../../lib/constants';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  toggleKey?: string;
}

interface NavSection {
  id: string;
  header: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

// COORDINATION [HIGH-RISK]: Every entry here must have a Route in App.tsx. Add both in the same commit.
// Open and assign a GitHub Issue before editing this file. See CONTRIBUTING.md §Shared Files.
const NAV_SECTIONS: NavSection[] = [
  {
    id: 'intake',
    header: 'Intake & Requests',
    defaultOpen: true,
    items: [
      { path: '/intake', label: 'Intake Queue', icon: Inbox, toggleKey: 'nav.intakeQueue' },
    ],
  },
  {
    id: 'portfolio',
    header: 'Portfolio',
    defaultOpen: true,
    items: [
      { path: '/projects', label: 'Projects', icon: FolderKanban, toggleKey: 'nav.projects' },
      { path: '/programs', label: 'Programs', icon: Network, toggleKey: 'nav.programs' },
      { path: '/status-reports', label: 'Status Reports', icon: FileBarChart2, toggleKey: 'nav.statusReports' },
    ],
  },
  {
    id: 'analytics',
    header: 'Analytics & Reporting',
    defaultOpen: false,
    items: [
      { path: '/analytics', label: 'Overview', icon: BarChart3, toggleKey: 'nav.analyticsOverview' },
      { path: '/analytics/by-team', label: 'By Team', icon: Users, toggleKey: 'nav.analyticsByTeam' },
      { path: '/analytics/pipeline', label: 'Pipeline', icon: GitBranch, toggleKey: 'nav.analyticsPipeline' },
      { path: '/analytics/health', label: 'Health Matrix', icon: Activity, toggleKey: 'nav.analyticsHealth' },
      { path: '/analytics/schedule', label: 'Schedule', icon: Calendar, toggleKey: 'nav.analyticsSchedule' },
      { path: '/analytics/governance', label: 'Governance', icon: ShieldCheck, toggleKey: 'nav.analyticsGovernance' },
      { path: '/analytics/capacity', label: 'Capacity', icon: Gauge, toggleKey: 'nav.analyticsCapacity' },
      { path: '/analytics/prioritization', label: 'Prioritization', icon: Trophy, toggleKey: 'nav.analyticsPrioritization' },
      { path: '/analytics/financials', label: 'Financials', icon: DollarSign, toggleKey: 'nav.analyticsFinancials' },
      { path: '/analytics/scenarios', label: 'Scenarios', icon: GitCompare, toggleKey: 'nav.analyticsScenarios' },
      { path: '/analytics/variance', label: 'Variance', icon: TrendingUp, toggleKey: 'nav.analyticsVariance' },
      { path: '/analytics/roadmap', label: 'Roadmap', icon: Map, toggleKey: 'nav.analyticsRoadmap' },
      { path: '/analytics/intake-pipeline', label: 'Intake Analytics', icon: GitBranch, toggleKey: 'nav.analyticsIntakePipeline' },
      { path: '/analytics/routing-qa', label: 'Routing QA', icon: Bot, toggleKey: 'nav.analyticsRoutingQa' },
    ],
  },
  {
    id: 'admin',
    header: 'Administration',
    items: [
      { path: '/teams', label: 'Teams', icon: Users },
      { path: '/admin/settings', label: 'Settings', icon: Settings },
      { path: '/admin/change-history', label: 'Change History', icon: History },
      { path: '/admin/user-feedback', label: 'User Feedback', icon: MessageSquareText },
    ],
  },
];

export function Sidebar() {
  const { collapsed, setCollapsed } = useSidebarState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const userAdminRole = useAdminRole();                       // real role (drives toggle visibility)
  const effectiveAdminRole = useEffectiveAdminRole();           // gated role (drives Admin section visibility)
  const impersonating = useSyncExternalStore(subscribeToImpersonation, isImpersonatingUser);
  const pendingApprovals = usePendingApprovalCount();
  const featureToggles = useFeatureToggles();

  const [envLabel, setEnvLabel] = useState<'DEV' | 'UAT' | 'PROD' | null>(null);
  useEffect(() => {
    let cancelled = false;
    initDeepLinkContext().then(() => {
      if (cancelled) return;
      const id = getCachedEnvironmentId();
      console.info('[Sidebar] env id =', id);
      if (id === ENV_IDS.dev) setEnvLabel('DEV');
      else if (id === ENV_IDS.uat) setEnvLabel('UAT');
      else if (id === ENV_IDS.prod) setEnvLabel('PROD');
    });
    return () => { cancelled = true; };
  }, []);

  // Inject live badge count into the Intake Queue nav item
  const visibleSections = NAV_SECTIONS
    .filter((s) => s.id !== 'admin' || effectiveAdminRole !== 'none')
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => !item.toggleKey || featureToggles[item.toggleKey] !== false),
    }))
    .filter((s) => s.items.length > 0)
    .map((s) => {
      if (s.id !== 'intake') return s;
      return {
        ...s,
        items: s.items.map((item) =>
          item.path === '/intake'
            ? { ...item, badge: pendingApprovals }
            : item,
        ),
      };
    });

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    NAV_SECTIONS.forEach((s) => { if (s.defaultOpen) initial.add(s.id); });
    return initial;
  });

  const allItems = visibleSections.flatMap((s) => s.items);
  // Match exact path first, then prefix — prefer longer matches (e.g. /analytics/by-team over /analytics)
  const selectedPath = (() => {
    if (pathname === '/' || pathname === '/dashboard') return '/dashboard';
    const exact = allItems.find((item) => item.path === pathname);
    if (exact) return exact.path;
    // Sort by path length descending so longer prefixes match first
    const prefix = [...allItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => pathname.startsWith(item.path));
    return prefix?.path ?? '';
  })();

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNavItem(item: NavItem) {
    const isActive = selectedPath === item.path;
    const Icon = item.icon;
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        title={collapsed ? item.label : undefined}
        className={cn(
          'relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150',
          isActive
            ? 'bg-primary/15 text-primary font-medium'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="activeNav"
            className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-r-full"
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          />
        )}
        <div className="relative shrink-0">
          <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-sidebar-foreground/50')} />
          {/* Badge — always visible, positioned on icon for both collapsed and expanded */}
          {item.badge != null && item.badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="whitespace-nowrap overflow-hidden text-[13px] leading-none"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }

  return (
    <motion.aside
      className="fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-50 flex flex-col"
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Logo header */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg btn-brand shrink-0 glow-primary-sm">
          <span className="text-white font-bold text-sm select-none">P</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <span className="ml-3 font-bold text-foreground text-base whitespace-nowrap flex items-center gap-2">
                CFR PMO
                {envLabel && (
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                    envLabel === 'DEV'
                      ? 'bg-amber-100 text-amber-700 border-amber-300'
                      : envLabel === 'UAT'
                      ? 'bg-sky-100 text-sky-700 border-sky-300'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-300',
                  )}>
                    {envLabel}
                  </span>
                )}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dashboard pinned at top */}
      {featureToggles['nav.dashboard'] && (
        <div className="px-2 pt-2 shrink-0">
          {renderNavItem({ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard })}
        </div>
      )}

      {/* Collapsible nav sections */}
      <nav className="flex-1 overflow-y-auto py-1 px-2">
        {visibleSections.map((section) => {
          const isOpen = openSections.has(section.id);
          return (
            <div key={section.id} className="mb-0.5">
              <AnimatePresence>
                {!collapsed && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 mt-1 text-[10px] font-semibold text-sidebar-foreground/35 uppercase tracking-widest hover:text-sidebar-foreground/60 transition-colors"
                  >
                    {section.header}
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 transition-transform duration-200',
                        isOpen ? 'rotate-0' : '-rotate-90'
                      )}
                    />
                  </motion.button>
                )}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {(isOpen || collapsed) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    {section.items.map(renderNavItem)}
                    {section.id === 'admin' && userAdminRole !== 'none' && (
                      <ImpersonationPill collapsed={collapsed} impersonating={impersonating} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {/* When impersonating, the Admin section hides entirely — keep the pill
            available so the admin can flip back. */}
        {/* My Teams debug pill - visible only in non-prod OR when impersonating. */}
        {(envLabel !== 'PROD' || impersonating) && (
          <div className="mt-2 px-1">
            <MyTeamsPill collapsed={collapsed} />
          </div>
        )}
        {impersonating && userAdminRole !== 'none' && (
          <div className="mt-2 px-1">
            <ImpersonationPill collapsed={collapsed} impersonating={impersonating} />
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="whitespace-nowrap text-[13px]"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}

/**
 * Admin "act as user" pill toggle, rendered under the Administration section.
 * Real admins only. When ON, useEffectiveAdminRole() returns 'none' so the
 * rest of the app gates them like a regular user (hides Admin section, blocks
 * project edits for projects they aren't on a team for, etc.). Flip back
 * instantly — setting is per-browser via localStorage.
 */
function ImpersonationPill({ collapsed, impersonating }: { collapsed: boolean; impersonating: boolean }) {
  function toggle() {
    setImpersonatingUser(!impersonating);
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={impersonating}
      onClick={toggle}
      title={collapsed
        ? (impersonating ? 'Acting as user — click to restore admin' : 'Act as user (hide admin)')
        : undefined}
      className={cn(
        'mt-2 w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors',
        impersonating
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
          : 'bg-sidebar-accent/40 border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent',
      )}
    >
      <UserCog className={cn('h-3.5 w-3.5 shrink-0', impersonating ? 'text-amber-600 dark:text-amber-400' : 'text-sidebar-foreground/50')} />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="whitespace-nowrap overflow-hidden text-left leading-none"
          >
            {impersonating ? 'Acting as user' : 'Act as user'}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function MyTeamsPill({ collapsed }: { collapsed: boolean }) {
  const teams = useCurrentUserTeamsWithNames();
  const count = teams ? teams.length : 0;
  const loading = teams === undefined;

  const pill = (
    <div
      className="mt-2 w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-full border border-sidebar-border bg-sidebar-accent/30 text-[11px] font-medium text-sidebar-foreground/70 cursor-help"
    >
      <UsersIcon className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="whitespace-nowrap overflow-hidden text-left leading-none"
          >
            {loading ? 'Loading...' : `My Teams (${count})`}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        {loading ? (
          <span>Loading team membership...</span>
        ) : count === 0 ? (
          <span>You are not on any teams.</span>
        ) : (
          <div className="space-y-1">
            <p className="font-semibold">Your teams ({count})</p>
            <ul className="text-left space-y-0.5">
              {teams!.map((t) => (
                <li key={t.teamid} className="text-[11px]">{t.name}</li>
              ))}
            </ul>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
