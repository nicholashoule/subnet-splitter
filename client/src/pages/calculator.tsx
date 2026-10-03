/**
 * client/src/pages/calculator.tsx
 * 
 * Main calculator page component. Provides an interactive interface for:
 * - Calculating subnet information from CIDR notation
 * - Splitting subnets into smaller networks
 * - Viewing and exporting subnet hierarchy
 * - Selecting and managing multiple subnets
 * 
 * Features:
 * - Form validation with validateCidrInput (no form library needed for one field)
 * - Interactive tree view for subnet hierarchy
 * - Copy-to-clipboard functionality for subnet details
 * - CSV export of selected subnets
 * - Recursion depth limiting and memory protection
 */

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, memo, type FormEvent } from "react";
import { Moon, Sun, Network, Split, Copy, Check, CheckCircle2, Info, Trash2, Download, Loader2, Eye, EyeOff, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// The module-level toast() avoids subscribing every row to toast state (useToast re-renders on each toast)
import { toast } from "@/hooks/use-toast";
import { applyTheme, getSavedTheme, saveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import type { SubnetInfo } from "@shared/schema";
import { calculateSubnet, splitSubnet, formatNumber, getSubnetClass, SubnetCalculationError, countSubnetNodes, collectVisibleSubnets, getDepthIndicatorClasses, validateCidrInput } from "@/lib/subnet-utils";

function findSubnetById(subnet: SubnetInfo, targetId: string): SubnetInfo | null {
  if (subnet.id === targetId) return subnet;
  for (const child of subnet.children ?? []) {
    const found = findSubnetById(child, targetId);
    if (found) return found;
  }
  return null;
}

function findParentOf(subnet: SubnetInfo, childId: string): SubnetInfo | null {
  for (const child of subnet.children ?? []) {
    if (child.id === childId) return subnet;
    const found = findParentOf(child, childId);
    if (found) return found;
  }
  return null;
}

function findAndUpdateSubnet(
  subnet: SubnetInfo,
  targetId: string,
  updateFn: (s: SubnetInfo) => SubnetInfo
): SubnetInfo {
  if (subnet.id === targetId) return updateFn(subnet);
  if (!subnet.children) return subnet;
  return {
    ...subnet,
    children: subnet.children.map(child => findAndUpdateSubnet(child, targetId, updateFn)),
  };
}

// Defined at module scope so cells keep their identity across renders
// (a component declared inside SubnetRow would remount on every render).
function CopyableCell({
  value,
  fieldName,
  subnetId,
  copied,
  onCopy,
}: {
  value: string;
  fieldName: string;
  subnetId: string;
  copied: boolean;
  onCopy: (value: string, fieldName: string) => void;
}) {
  return (
    <TableCell className="font-mono text-xs py-2 px-2">
      <div className="flex items-center gap-1">
        <span>{value}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
          onClick={() => onCopy(value, fieldName)}
          data-testid={`button-copy-${fieldName.toLowerCase().replace(' ', '-')}-${subnetId}`}
          aria-label={`Copy ${fieldName}: ${value}`}
        >
          {copied ? (
            <Check className="h-2.5 w-2.5 text-success" />
          ) : (
            <Copy className="h-2.5 w-2.5" />
          )}
        </Button>
      </div>
    </TableCell>
  );
}

const SubnetRow = memo(function SubnetRow({
  subnet, 
  depth = 0, 
  onSplit, 
  onDelete,
  selectedIds,
  onSelectChange,
  hideParents = false
}: { 
  subnet: SubnetInfo; 
  depth?: number; 
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
  selectedIds: Set<string>;
  onSelectChange: (id: string, checked: boolean) => void;
  hideParents?: boolean;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const copyToClipboard = useCallback(async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({
        title: "Copied!",
        description: `${fieldName} copied to clipboard`,
      });
      // Restart the timer so an earlier copy can't clear this checkmark early
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  }, []);

  const copyCellProps = (value: string, fieldName: string) => ({
    value,
    fieldName,
    subnetId: subnet.id,
    copied: copiedField === fieldName,
    onCopy: copyToClipboard,
  });

  const hasChildren = subnet.children && subnet.children.length > 0;

  // If hideParents is true and this subnet has children, only render the children
  if (hideParents && hasChildren) {
    return (
      <>
        {subnet.children?.map((child) => (
          <SubnetRow
            key={child.id}
            subnet={child}
            depth={depth + 1}
            onSplit={onSplit}
            onDelete={onDelete}
            selectedIds={selectedIds}
            onSelectChange={onSelectChange}
            hideParents={hideParents}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <TableRow 
        className="group hover-elevate"
        data-testid={`row-subnet-${subnet.id}`}
      >
        <TableCell className="py-2 px-2 w-10">
          <Checkbox
            checked={selectedIds.has(subnet.id)}
            onCheckedChange={(checked) => onSelectChange(subnet.id, checked === true)}
            data-testid={`checkbox-select-${subnet.id}`}
            aria-label={`Select subnet ${subnet.cidr}`}
          />
        </TableCell>
        <TableCell className="py-2 px-2">
          <div className="flex items-center gap-2">
            {/* Color-coded depth indicator - High contrast colors for maximum distinction */}
            <div className={getDepthIndicatorClasses(depth, subnet.prefix)} />
            
            <Badge 
              variant="outline" 
              className="font-mono text-xs"
              data-testid={`badge-cidr-${subnet.id}`}
            >
              {subnet.cidr}
            </Badge>
          </div>
        </TableCell>
        <TableCell className="py-2 px-2">
          <Badge variant="secondary" className="text-[10px]">
            Class {getSubnetClass(subnet)}
          </Badge>
        </TableCell>
        <CopyableCell {...copyCellProps(subnet.networkAddress, "Network")} />
        <CopyableCell {...copyCellProps(subnet.broadcastAddress, "Broadcast")} />
        <CopyableCell {...copyCellProps(subnet.firstHost, "First Host")} />
        <CopyableCell {...copyCellProps(subnet.lastHost, "Last Host")} />
        <TableCell className="text-right font-mono text-xs py-2 px-2">
          {formatNumber(subnet.usableHosts)}
        </TableCell>
        <CopyableCell {...copyCellProps(subnet.subnetMask, "Subnet Mask")} />
        <TableCell className="py-2 px-2">
          <div className="flex items-center gap-0.5 justify-end">
            {subnet.canSplit && !hasChildren && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onSplit(subnet.id)}
                    data-testid={`button-split-${subnet.id}`}
                    aria-label={`Split ${subnet.cidr} into two /${subnet.prefix + 1} subnets`}
                  >
                    <Split className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Split into /{subnet.prefix + 1} subnets</p>
                </TooltipContent>
              </Tooltip>
            )}
            {depth > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(subnet.id)}
                    data-testid={`button-delete-${subnet.id}`}
                    aria-label={`Remove split for ${subnet.cidr}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove subnet split</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
      </TableRow>
      {hasChildren && subnet.isExpanded && subnet.children?.map((child) => (
        <SubnetRow
          key={child.id}
          subnet={child}
          depth={depth + 1}
          onSplit={onSplit}
          onDelete={onDelete}
          selectedIds={selectedIds}
          onSelectChange={onSelectChange}
          hideParents={hideParents}
        />
      ))}
    </>
  );
});

function SubnetDetails({ subnet }: { subnet: SubnetInfo }) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="h-5 w-5" />
          Network Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Addresses</p>
            <p className="text-2xl font-bold font-mono" data-testid="text-total-addresses">
              {formatNumber(subnet.totalHosts)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Usable Hosts</p>
            <p className="text-2xl font-bold font-mono" data-testid="text-usable-hosts">
              {formatNumber(subnet.usableHosts)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Wildcard Mask</p>
            <p className="text-lg font-mono" data-testid="text-wildcard-mask">
              {subnet.wildcardMask}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Prefix Length</p>
            <p className="text-lg font-mono" data-testid="text-prefix">
              /{subnet.prefix}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Calculator() {
  const [isDark, setIsDark] = useState(() => getSavedTheme() === 'dark');
  const [rootSubnet, setRootSubnet] = useState<SubnetInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hideParents, setHideParents] = useState(false);
  const [cidrValue, setCidrValue] = useState("");
  const [cidrError, setCidrError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Status line under the table title; each message restarts the timer that clears it
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();
  const showStatus = useCallback((message: string | null) => {
    clearTimeout(statusTimer.current);
    setStatusMessage(message);
    if (message) statusTimer.current = setTimeout(() => setStatusMessage(null), 2500);
  }, []);
  useEffect(() => () => clearTimeout(statusTimer.current), []);

  // Split and remove unmount the button that was clicked; move focus to a control in
  // the same place in the table (selector applied after the tree re-renders)
  const pendingFocus = useRef<string | null>(null);

  // main.tsx applied the saved theme before the first render. Follow changes made
  // in other tabs (e.g. the API docs page), which share the same storage key.
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const theme = getSavedTheme();
        applyTheme(theme);
        setIsDark(theme === 'dark');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = isDark ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
    setIsDark(next === 'dark');
  }, [isDark]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateCidrInput(cidrValue);
    setCidrError(error);
    if (error) {
      // The input carries aria-invalid and aria-describedby, so focusing it reads the error
      inputRef.current?.focus();
      return;
    }

    setIsCalculating(true);
    try {
      const subnet = calculateSubnet(cidrValue.trim());
      setRootSubnet(subnet);
      setSelectedIds(new Set());
      showStatus(null);
      toast({
        title: "Subnet calculated",
        description: `Showing details for ${subnet.cidr}`,
      });
    } catch (error) {
      const message = error instanceof SubnetCalculationError 
        ? error.message 
        : "Please enter a valid CIDR notation";
      toast({
        title: "Invalid CIDR",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Read the latest tree through a ref so handleSplit stays referentially
  // stable; otherwise every split would re-render every memoized row.
  const rootSubnetRef = useRef(rootSubnet);
  useLayoutEffect(() => {
    rootSubnetRef.current = rootSubnet;
  }, [rootSubnet]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    document.querySelector<HTMLElement>(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [rootSubnet]);

  const handleSplit = useCallback((id: string) => {
    const root = rootSubnetRef.current;
    if (!root) return;

    try {
      const targetSubnet = findSubnetById(root, id);

      // State validation: ensure target exists and is in valid state for splitting
      if (!targetSubnet || !targetSubnet.canSplit || targetSubnet.children?.length) {
        return;
      }

      // Validate tree size before splitting (throws past the node limit)
      const children = splitSubnet(targetSubnet, countSubnetNodes(root));
      setRootSubnet(findAndUpdateSubnet(root, id, (subnet) => ({
        ...subnet,
        children,
        isExpanded: true,
      })));

      // The split button is gone (and with Hide Parents the whole row); continue on the first child
      const [first] = children;
      pendingFocus.current = first.canSplit
        ? `[data-testid="button-split-${first.id}"]`
        : `[data-testid="checkbox-select-${first.id}"]`;
      showStatus(`Successfully split subnet into two equal /${targetSubnet.prefix + 1} networks`);
    } catch (error) {
      const message = error instanceof SubnetCalculationError
        ? error.message
        : "Failed to split subnet";
      toast({
        title: "Split failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [showStatus]);

  const handleDelete = useCallback((id: string) => {
    // The removed row's parent gets its split button back; focus it
    const root = rootSubnetRef.current;
    const parent = root && findParentOf(root, id);
    if (parent) pendingFocus.current = `[data-testid="button-split-${parent.id}"]`;

    const deleteFromChildren = (subnet: SubnetInfo): SubnetInfo => {
      if (!subnet.children) return subnet;
      
      const hasTargetChild = subnet.children.some(c => c.id === id);
      if (hasTargetChild) {
        return {
          ...subnet,
          children: undefined,
          isExpanded: false,
        };
      }

      return {
        ...subnet,
        children: subnet.children.map(deleteFromChildren),
      };
    };

    setRootSubnet(prev => {
      if (!prev) return prev;
      return deleteFromChildren(prev);
    });

    showStatus("Subnet split removed - parent restored");
  }, [showStatus]);

  const handleReset = () => {
    setRootSubnet(null);
    setSelectedIds(new Set());
    showStatus(null);
    setCidrValue("");
    setCidrError(null);
    // The Reset button disappears with the results; return focus to the input
    inputRef.current?.focus();
  };

  const handleSelectChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  // Selection counts only rows on screen: removing a split or hiding parents can leave
  // selected ids that are no longer visible, and those are neither counted nor exported
  const visibleSubnets = useMemo(
    () => (rootSubnet ? collectVisibleSubnets(rootSubnet, hideParents) : []),
    [rootSubnet, hideParents],
  );
  const selectedSubnets = useMemo(
    () => visibleSubnets.filter(s => selectedIds.has(s.id)),
    [visibleSubnets, selectedIds],
  );
  const allVisibleSelected = selectedSubnets.length > 0 && selectedSubnets.length === visibleSubnets.length;

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? new Set(visibleSubnets.map(s => s.id)) : new Set());
  }, [visibleSubnets]);

  const handleExportCSV = useCallback(() => {
    if (selectedSubnets.length === 0) {
      toast({
        title: "No rows selected",
        description: "Please select at least one subnet row to export",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);

    try {

      const headers = ["CIDR", "Network Address", "Broadcast Address", "First Host", "Last Host", "Usable Hosts", "Total Hosts", "Subnet Mask", "Wildcard Mask", "Prefix"];
      const rows = selectedSubnets.map(s => [
        s.cidr,
        s.networkAddress,
        s.broadcastAddress,
        s.firstHost,
        s.lastHost,
        s.usableHosts.toString(),
        s.totalHosts.toString(),
        s.subnetMask,
        s.wildcardMask,
        `/${s.prefix}`
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `subnet-export-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "CSV exported",
        description: `Exported ${selectedSubnets.length} subnet${selectedSubnets.length > 1 ? 's' : ''} to CSV`,
      });
    } finally {
      setIsExporting(false);
    }
  }, [selectedSubnets]);

  const loadExample = (cidr: string) => {
    setCidrValue(cidr);
    setCidrError(null);
    setRootSubnet(calculateSubnet(cidr));
    setSelectedIds(new Set());
    showStatus(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-end items-center gap-1 px-6 py-2 border-b border-border bg-muted/20">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="rounded-lg hover:bg-muted transition-colors"
            >
              <a
                href="/api/docs/ui"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open API documentation"
                data-testid="link-api-docs"
              >
                <BookOpen className="h-5 w-5 text-muted-foreground" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            API docs
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-lg hover:bg-muted transition-colors"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <Sun className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Moon className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isDark ? "Switch to light mode" : "Switch to dark mode"}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="container mx-auto px-6 pb-8 max-w-[1600px]">
        <header className="border-b border-border bg-muted/20 -mx-6 px-6 py-4 mb-6 text-center">
          <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="inline-block">
            <img src="/github-nicholashoule.png" alt="nicholashoule on GitHub (QR code)" className="w-16 h-16 rounded-lg hover:opacity-80 transition-opacity mb-2" />
          </a>
          <h1 className="text-4xl font-bold tracking-tight mb-3" data-testid="text-title">
            CIDR Subnet Calculator
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            Calculate subnet details and recursively split networks into smaller subnets. 
            Perfect for network planning and IP address management.
          </p>
        </header>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Enter CIDR Range</CardTitle>
            <CardDescription>
              Enter a CIDR notation to analyze your network and plan subnets (e.g., 10.0.0.0/8 for Class A, 172.16.0.0/12 for Class B, or 192.168.0.0/16 for Class C)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 space-y-2">
                <label htmlFor="cidr-input" className="sr-only">CIDR Notation</label>
                <Input
                  ref={inputRef}
                  id="cidr-input"
                  name="cidr"
                  placeholder="e.g., 192.168.1.0/24"
                  className="font-mono text-lg h-12"
                  data-testid="input-cidr"
                  autoComplete="off"
                  spellCheck={false}
                  value={cidrValue}
                  onChange={(e) => {
                    setCidrValue(e.target.value);
                    if (cidrError) setCidrError(null);
                  }}
                  aria-invalid={!!cidrError}
                  aria-describedby={cidrError ? "cidr-input-error" : undefined}
                />
                {cidrError && (
                  <p id="cidr-input-error" className="text-sm font-medium text-destructive">
                    {cidrError}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="lg" className="h-12" data-testid="button-calculate" aria-label="Calculate subnet details" disabled={isCalculating}>
                  {isCalculating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    "Calculate"
                  )}
                </Button>
                {rootSubnet && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="lg"
                    className="h-12"
                    onClick={handleReset}
                    data-testid="button-reset"
                    aria-label="Reset calculator and clear results"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Try examples:</span>
              {["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "192.168.1.0/24"].map((example) => (
                <Button
                  key={example}
                  variant="secondary"
                  size="sm"
                  onClick={() => loadExample(example)}
                  data-testid={`button-example-${example.replace(/[./]/g, '-')}`}
                >
                  {example}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {rootSubnet && (
          <>
            <SubnetDetails subnet={rootSubnet} />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between flex-wrap gap-4">
                  <span>Subnet Table</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHideParents(!hideParents)}
                      data-testid="button-toggle-view"
                    >
                      {hideParents ? (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Show All
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Hide Parents
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCSV}
                      disabled={selectedSubnets.length === 0 || isExporting}
                      data-testid="button-export-csv"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Export CSV ({selectedSubnets.length})
                        </>
                      )}
                    </Button>
                    <Badge variant="outline" className="font-normal">
                      Click <Split className="h-3 w-3 inline mx-1" /> to split a subnet
                    </Badge>
                  </div>
                </CardTitle>
                <div className="flex items-center justify-between">
                  <CardDescription>
                    Split any subnet into two smaller networks, or remove a split to restore its parent. Select rows to export them as CSV.
                  </CardDescription>
                  {/* Always mounted, so screen readers announce each message placed in it */}
                  <div role="status">
                    {statusMessage && (
                      <span key={statusMessage} className="flex items-center gap-1.5 text-xs font-semibold text-success animate-in fade-in duration-300" data-testid="text-status-message">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {statusMessage}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto elegant-scrollbar">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-xs py-2 px-2">
                          <Checkbox
                            checked={allVisibleSelected ? true : selectedSubnets.length > 0 ? "indeterminate" : false}
                            onCheckedChange={(checked) => handleSelectAll(checked === true)}
                            data-testid="checkbox-select-all"
                            aria-label="Select all subnets"
                          />
                        </TableHead>
                        <TableHead className="min-w-[180px] text-xs py-2 px-2">CIDR</TableHead>
                        <TableHead className="text-xs py-2 px-2">Class</TableHead>
                        <TableHead className="text-xs py-2 px-2">Network</TableHead>
                        <TableHead className="text-xs py-2 px-2">Broadcast</TableHead>
                        <TableHead className="text-xs py-2 px-2">First Host</TableHead>
                        <TableHead className="text-xs py-2 px-2">Last Host</TableHead>
                        <TableHead className="text-right text-xs py-2 px-2">Usable Hosts</TableHead>
                        <TableHead className="text-xs py-2 px-2">Subnet Mask</TableHead>
                        <TableHead className="text-right w-20 text-xs py-2 px-2">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SubnetRow 
                        subnet={rootSubnet} 
                        onSplit={handleSplit}
                        onDelete={handleDelete}
                        selectedIds={selectedIds}
                        onSelectChange={handleSelectChange}
                        hideParents={hideParents}
                      />
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!rootSubnet && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Network className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h2 className="text-xl font-semibold mb-2">No subnet calculated yet</h2>
              <p className="text-muted-foreground text-center max-w-md">
                Enter a CIDR notation above or click one of the example buttons to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      
      <footer className="border-t border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground space-y-3">
        <p className="max-w-2xl mx-auto leading-relaxed">
          CIDR (Classless Inter-Domain Routing) allows flexible IP allocation. Split subnets to create smaller network segments for better organization, efficient management, and improved security through network isolation.
        </p>
        <p className="text-xs">
          Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium" data-testid="link-github">nicholashoule</a>
        </p>
      </footer>
    </div>
  );
}
