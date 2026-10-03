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
 * - Subnet hierarchy shown as a flat list of table rows (collectVisibleRows)
 * - Copy-to-clipboard functionality for subnet details
 * - CSV export of selected subnets
 * - Tree size limit (splitSubnetInTree) for memory protection
 */

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, memo, type FormEvent } from "react";
import { Moon, Sun, Network, Split, Copy, Check, CheckCircle2, Info, Trash2, Download, Eye, EyeOff, BookOpen } from "lucide-react";
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
import {
  calculateSubnet,
  formatNumber,
  getSubnetClass,
  SubnetCalculationError,
  collectVisibleRows,
  splitSubnetInTree,
  removeSplitInTree,
  selectedVisibleSubnets,
  subnetsToCsv,
  getDepthIndicatorClasses,
  validateCidrInput,
} from "@/lib/subnet-utils";

/** A message with a fresh id each time it is shown, so the same text can be announced again */
type Message = { id: number; text: string };

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
        {/* 24x24 target (WCAG 2.5.8); the icon is the Button's 16px [&_svg]:size-4 */}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity"
          onClick={() => onCopy(value, fieldName)}
          data-testid={`button-copy-${fieldName.toLowerCase().replace(' ', '-')}-${subnetId}`}
          aria-label={`Copy ${fieldName}: ${value}`}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </TableCell>
  );
}

// One table row. Rows are rendered as a flat list (collectVisibleRows); every prop is a
// primitive, a callback that keeps its identity, or a subnet object that the immutable
// tree updates replace only along the path to a change, so memo skips unchanged rows.
const SubnetRow = memo(function SubnetRow({
  subnet,
  depth,
  parentCidr,
  selected,
  onSplit,
  onDelete,
  onSelectChange,
}: {
  subnet: SubnetInfo;
  depth: number;
  parentCidr?: string;
  selected: boolean;
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
  onSelectChange: (id: string, checked: boolean) => void;
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

  const hasChildren = !!subnet.children?.length;

  return (
    <TableRow
      className="group hover-elevate"
      data-testid={`row-subnet-${subnet.id}`}
    >
      <TableCell className="py-2 px-2 w-10">
        <Checkbox
          checked={selected}
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
          {/* Removes the parent's split: this row, its sibling and everything below them */}
          {parentCidr && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(subnet.id)}
                  data-testid={`button-delete-${subnet.id}`}
                  aria-label={`Remove split of ${parentCidr}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Remove split of {parentCidr}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </TableRow>
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
        {/* One column on phones: two columns of 4,294,967,296 (a /0) would overlap at 320px */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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
  const [statusMessage, setStatusMessage] = useState<Message | null>(null);
  const [hideParents, setHideParents] = useState(false);
  const [cidrValue, setCidrValue] = useState("");
  const [cidrError, setCidrError] = useState<Message | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useRef(0);

  // Status line under the table title; each message restarts the timer that clears it.
  // A new id per message re-mounts the text, so a repeat of the same text is announced too.
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();
  const showStatus = useCallback((text: string | null) => {
    clearTimeout(statusTimer.current);
    setStatusMessage(text ? { id: ++messageId.current, text } : null);
    if (text) statusTimer.current = setTimeout(() => setStatusMessage(null), 2500);
  }, []);
  useEffect(() => () => clearTimeout(statusTimer.current), []);

  // Split and remove unmount the button that was clicked; move focus to a control in
  // the same place in the table (selector applied after the tree re-renders)
  const pendingFocus = useRef<string | null>(null);

  // public/theme-init.js applied the saved theme before first paint. Follow changes
  // made in other tabs (e.g. the API docs page), which share the same storage key.
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
    // The message is role="alert", so it is announced once however the form was
    // submitted (Enter in the input or the Calculate button). A new id per failed submit
    // re-mounts it, so a repeated error is announced again. Focus stays where it is:
    // moving it to the input would read the error a second time, through
    // aria-describedby, which still ties the error to the input.
    setCidrError(error ? { id: ++messageId.current, text: error } : null);
    if (error) return;

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
    }
  };

  // Read the latest tree through a ref so handleSplit and handleDelete stay
  // referentially stable; otherwise every tree change would re-render every row.
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
      // Null when the row is missing, already split or a /32; throws past the tree size limit
      const result = splitSubnetInTree(root, id);
      if (!result) return;
      setRootSubnet(result.root);

      // The split button is gone (and with Hide Parents the whole row); continue on the first
      // child's checkbox. Not its Split button: focusing that would pop up its tooltip, and a
      // held Enter would keep splitting.
      const [first] = result.children;
      pendingFocus.current = `[data-testid="checkbox-select-${first.id}"]`;
      showStatus(`Successfully split subnet into two equal /${first.prefix} networks`);
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
    const root = rootSubnetRef.current;
    const result = root && removeSplitInTree(root, id);
    if (!result) return;
    setRootSubnet(result.root);

    // The parent row is whole again (and reappears with Hide Parents); focus its checkbox,
    // which has no tooltip to pop up
    pendingFocus.current = `[data-testid="checkbox-select-${result.parent.id}"]`;
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

  // The table's rows. Selection counts only rows on screen: removing a split or hiding
  // parents can leave selected ids that are no longer visible, and those are neither
  // counted nor exported
  const visibleRows = useMemo(
    () => (rootSubnet ? collectVisibleRows(rootSubnet, hideParents) : []),
    [rootSubnet, hideParents],
  );
  const visibleSubnets = useMemo(() => visibleRows.map(row => row.subnet), [visibleRows]);
  const selectedSubnets = useMemo(
    () => selectedVisibleSubnets(visibleSubnets, selectedIds),
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

    const blob = new Blob([subnetsToCsv(selectedSubnets)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    // The user's local date (toISOString is UTC: a day ahead in the evening west of UTC)
    link.setAttribute("download", `subnet-export-${new Date().toLocaleDateString("en-CA")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "CSV exported",
      description: `Exported ${selectedSubnets.length} subnet${selectedSubnets.length > 1 ? 's' : ''} to CSV`,
    });
  }, [selectedSubnets]);

  const loadExample = (cidr: string) => {
    const subnet = calculateSubnet(cidr);
    setCidrValue(cidr);
    setCidrError(null);
    setRootSubnet(subnet);
    setSelectedIds(new Set());
    showStatus(null);
    // Same confirmation as Calculate; the toast region announces it to screen readers
    toast({
      title: "Subnet calculated",
      description: `Showing details for ${subnet.cidr}`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <nav aria-label="Site" className="flex justify-end items-center gap-1 px-6 py-2 border-b border-border bg-muted/20">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="rounded-lg hover:bg-muted transition-colors [&_svg]:size-5"
            >
              <a
                href="/api/docs/ui"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open API documentation"
                data-testid="link-api-docs"
              >
                <BookOpen className="text-muted-foreground" />
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
              className="rounded-lg hover:bg-muted transition-colors [&_svg]:size-5"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <Sun className="text-muted-foreground" />
              ) : (
                <Moon className="text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isDark ? "Switch to light mode" : "Switch to dark mode"}
          </TooltipContent>
        </Tooltip>
      </nav>
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

        <main>
        <Card className="mb-8">
          <CardHeader>
            <CardTitle id="cidr-heading">Enter CIDR Range</CardTitle>
            <CardDescription>
              Enter a CIDR notation to analyze your network and plan subnets (e.g., 10.0.0.0/8 for Class A, 172.16.0.0/12 for Class B, or 192.168.0.0/16 for Class C)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 space-y-2">
                {/* Named by the visible heading, so the accessible name matches what is shown (WCAG 2.5.3) */}
                <Input
                  ref={inputRef}
                  id="cidr-input"
                  name="cidr"
                  aria-labelledby="cidr-heading"
                  placeholder="e.g., 192.168.1.0/24"
                  className="font-mono text-lg md:text-lg h-12"
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
                  <p key={cidrError.id} id="cidr-input-error" role="alert" className="text-sm font-medium text-destructive">
                    {cidrError.text}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="lg" className="h-12" data-testid="button-calculate" aria-label="Calculate subnet details">
                  Calculate
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
                <div className="flex items-center justify-between flex-wrap gap-4">
                  {/* The heading holds only its text; it names the table (aria-labelledby) */}
                  <CardTitle id="subnet-table-title">Subnet Table</CardTitle>
                  {/* Wraps on narrow screens: only the table itself scrolls sideways (WCAG 1.4.10) */}
                  <div className="flex flex-wrap items-center gap-2">
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
                      disabled={selectedSubnets.length === 0}
                      data-testid="button-export-csv"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV ({selectedSubnets.length})
                    </Button>
                    {/* Hint only; the description below says the same. Hidden where it would crowd the buttons */}
                    <Badge variant="outline" className="hidden sm:inline-flex font-normal">
                      Click <Split className="h-3 w-3 inline mx-1" aria-hidden="true" /> to split a subnet
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <CardDescription>
                    Split any subnet into two smaller networks, or remove a split to restore its parent. Select rows to export them as CSV.
                  </CardDescription>
                  {/* Always mounted, so screen readers announce each message placed in it */}
                  <div role="status">
                    {statusMessage && (
                      <span key={statusMessage.id} className="flex items-center gap-1.5 text-xs font-semibold text-success animate-in fade-in duration-300" data-testid="text-status-message">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {statusMessage.text}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* The Table's own wrapper is what scrolls, so the scrollbar style goes there */}
                <div>
                  <Table className="text-xs" containerClassName="elegant-scrollbar" aria-labelledby="subnet-table-title">
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
                      {visibleRows.map(({ subnet, depth, parentCidr }) => (
                        <SubnetRow
                          key={subnet.id}
                          subnet={subnet}
                          depth={depth}
                          parentCidr={parentCidr}
                          selected={selectedIds.has(subnet.id)}
                          onSplit={handleSplit}
                          onDelete={handleDelete}
                          onSelectChange={handleSelectChange}
                        />
                      ))}
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
        </main>
      </div>
      
      <footer className="border-t border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground space-y-3">
        <p className="max-w-2xl mx-auto leading-relaxed">
          CIDR (Classless Inter-Domain Routing) allows flexible IP allocation. Split subnets to create smaller network segments for better organization, efficient management, and improved security through network isolation.
        </p>
        <p className="text-xs">
          Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:decoration-2 font-medium" data-testid="link-github">nicholashoule</a>
        </p>
      </footer>
    </div>
  );
}
