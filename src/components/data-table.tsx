import { useState, useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Search, X, ArrowUp, ArrowDown, Filter, Database } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import { cn } from '../lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  filterOptions?: { value: string; label: string }[];
  render?: (row: T, index: number) => ReactNode;
  getValue?: (row: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  keyExtractor: (row: T) => string;
  searchPlaceholder?: string;
  searchFn?: (row: T, query: string) => boolean;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  actionButton?: ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  searchPlaceholder = 'Search...',
  searchFn,
  onRowClick,
  rowClassName,
  actionButton,
  isLoading,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    let result = data;
    if (search && searchFn) {
      result = result.filter((row) => searchFn(row, search));
    }
    for (const col of columns) {
      if (col.filterable && filters[col.key] && filters[col.key] !== '__all__') {
        const filterVal = filters[col.key];
        result = result.filter((row) => {
          const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
          return String(val) === filterVal;
        });
      }
    }
    return result;
  }, [data, search, searchFn, columns, filters]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const valA = col.getValue ? col.getValue(a) : (a as Record<string, unknown>)[col.key];
      const valB = col.getValue ? col.getValue(b) : (b as Record<string, unknown>)[col.key];
      const cmp = String(valA ?? '').localeCompare(String(valB ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const hasActiveFilters = search || Object.values(filters).some((v) => v && v !== '__all__');

  function clearAll() {
    setSearch('');
    setFilters({});
  }

  const filterableCols = columns.filter((col) => col.filterable && col.filterOptions);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm bg-muted/50 border-border/60 focus-visible:ring-1"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        {filterableCols.map((col) => (
          <Select
            key={col.key}
            value={filters[col.key] ?? '__all__'}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, [col.key]: val }))}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs bg-muted/50 border-border/60 text-foreground gap-1.5">
              <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All {col.header}</SelectItem>
              {col.filterOptions!.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {/* Clear button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}

        {/* Action button (right-aligned) */}
        {actionButton && <div className="ml-auto">{actionButton}</div>}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading records...</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
              <Database className="h-5 w-5" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">No records found</p>
              <p className="text-xs text-muted-foreground mt-0.5">{emptyMessage}</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border bg-muted/20">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      'h-10 px-4 text-left align-middle text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap select-none',
                      col.sortable && 'cursor-pointer hover:text-foreground transition-colors'
                    )}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && (
                        <span className="inline-flex flex-col gap-px opacity-40">
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="h-3 w-3 opacity-100 text-primary" />
                            ) : (
                              <ArrowDown className="h-3 w-3 opacity-100 text-primary" />
                            )
                          ) : (
                            <ArrowUp className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, i) => (
                <motion.tr
                  key={keyExtractor(row)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.018, ease: 'easeOut' }}
                  className={cn(
                    'border-b border-border/60 transition-colors last:border-b-0 group',
                    onRowClick &&
                      'cursor-pointer hover:bg-primary/5 hover:border-border active:bg-primary/10',
                    rowClassName?.(row)
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className="px-4 py-3 align-middle text-sm"
                    >
                      {col.render
                        ? col.render(row, i)
                        : String((row as Record<string, unknown>)[col.key] ?? '—')}
                    </TableCell>
                  ))}
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Footer */}
      {!isLoading && sorted.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Showing <span className="text-foreground font-medium">{sorted.length}</span> of{' '}
            <span className="text-foreground font-medium">{data.length}</span> results
          </p>
        </div>
      )}
    </div>
  );
}
