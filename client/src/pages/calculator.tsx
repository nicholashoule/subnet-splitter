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
 * - Real-time form validation with react-hook-form + Zod
 * - Interactive tree view for subnet hierarchy
 * - Copy-to-clipboard functionality for subnet details
 * - CSV export of selected subnets
 * - Recursion depth limiting and memory protection
 */

import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Moon, Sun, Network, Split, Copy, Check, Info, Trash2, Download, Loader2, Eye, EyeOff } from "lucide-react";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { SubnetInfo, CidrInput } from "@shared/schema";
import { cidrInputSchema } from "@shared/schema";
import { calculateSubnet, splitSubnet, formatNumber, getSubnetClass, SubnetCalculationError, countSubnetNodes, collectVisibleSubnets, getDepthIndicatorClasses } from "@/lib/subnet-utils";

function SubnetRow({ 
  subnet, 
  depth = 0, 
  onSplit, 
  onToggle,
  onDelete,
  selectedIds,
  onSelectChange,
  hideParents = false
}: { 
  subnet: SubnetInfo; 
  depth?: number; 
  onSplit: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  selectedIds: Set<string>;
  onSelectChange: (id: string, checked: boolean) => void;
  hideParents?: boolean;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({
        title: "Copied!",
        description: `${fieldName} copied to clipboard`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const CopyableCell = ({ value, fieldName }: { value: string; fieldName: string }) => (
    <TableCell className="font-mono text-xs py-2 px-2">
      <div className="flex items-center gap-1">
        <span>{value}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => copyToClipboard(value, fieldName)}
          data-testid={`button-copy-${fieldName.toLowerCase().replace(' ', '-')}-${subnet.id}`}
          aria-label={`Copy ${fieldName}: ${value}`}
        >
          {copiedField === fieldName ? (
            <Check className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <Copy className="h-2.5 w-2.5" />
          )}
        </Button>
      </div>
    </TableCell>
  );

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
            onToggle={onToggle}
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
        <CopyableCell value={subnet.networkAddress} fieldName="Network" />
        <CopyableCell value={subnet.broadcastAddress} fieldName="Broadcast" />
        <CopyableCell value={subnet.firstHost} fieldName="First Host" />
        <CopyableCell value={subnet.lastHost} fieldName="Last Host" />
        <TableCell className="text-right font-mono text-xs py-2 px-2">
          {formatNumber(subnet.usableHosts)}
        </TableCell>
        <CopyableCell value={subnet.subnetMask} fieldName="Subnet Mask" />
        <TableCell className="py-2 px-2">
          <div className="flex items-center gap-0.5 justify-end">
            {subnet.canSplit && (
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
          onToggle={onToggle}
          onDelete={onDelete}
          selectedIds={selectedIds}
          onSelectChange={onSelectChange}
          hideParents={hideParents}
        />
      ))}
    </>
  );
}

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
  const [isDark, setIsDark] = useState(false);
  const [rootSubnet, setRootSubnet] = useState<SubnetInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hideParents, setHideParents] = useState(false);
  const { toast } = useToast();

  // Initialize theme from localStorage, default to light mode
  useEffect(() => {
    const isDarkMode = localStorage.getItem('theme') === 'dark' && 
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(isDarkMode);
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Listen for theme changes from other tabs/windows (e.g., Swagger UI)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme' && e.newValue) {
        const isDark = e.newValue === 'dark';
        setIsDark(isDark);
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const newState = !prev;
      if (newState) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return newState;
    });
  }, []);

  const form = useForm<CidrInput>({
    resolver: zodResolver(cidrInputSchema),
    defaultValues: {
      cidr: "",
    },
  });

  const onSubmit = (data: CidrInput) => {
    setIsCalculating(true);
    try {
      const subnet = calculateSubnet(data.cidr);
      setRootSubnet(subnet);
      setSelectedIds(new Set());
      setStatusMessage(null);
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

  const findAndUpdateSubnet = useCallback((
    subnet: SubnetInfo, 
    targetId: string, 
    updateFn: (s: SubnetInfo) => SubnetInfo
  ): SubnetInfo => {
    if (subnet.id === targetId) {
      return updateFn(subnet);
    }
    if (subnet.children) {
      return {
        ...subnet,
        children: subnet.children.map(child => 
          findAndUpdateSubnet(child, targetId, updateFn)
        ),
      };
    }
    return subnet;
  }, []);

  const findSubnetById = useCallback((subnet: SubnetInfo, targetId: string): SubnetInfo | null => {
    if (subnet.id === targetId) return subnet;
    if (subnet.children) {
      for (const child of subnet.children) {
        const found = findSubnetById(child, targetId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const handleSplit = useCallback((id: string) => {
    if (!rootSubnet) return;

    try {
      const targetSubnet = findSubnetById(rootSubnet, id);
      
      // State validation: ensure target exists and is in valid state for splitting
      if (!targetSubnet) {
        console.error(`Subnet with id ${id} not found`);
        return;
      }
      
      if (!targetSubnet.canSplit) {
        console.warn(`Cannot split subnet ${id} - already at /32`);
        return;
      }
      
      if (targetSubnet.children && targetSubnet.children.length > 0) {
        console.warn(`Cannot split subnet ${id} - already has children`);
        return;
      }

      setRootSubnet(prev => {
        if (!prev) return prev;
        
        return findAndUpdateSubnet(prev, id, (subnet) => {
          // Validate tree size before splitting
          const currentSize = countSubnetNodes(prev);
          const children = splitSubnet(subnet, currentSize);
          
          return {
            ...subnet,
            children,
            isExpanded: true,
          };
        });
      });

      setStatusMessage(`[PASS] Successfully split subnet into two equal /${targetSubnet.prefix + 1} networks`);
      setTimeout(() => setStatusMessage(null), 2500);
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
  }, [rootSubnet, findSubnetById, findAndUpdateSubnet, toast]);

  const handleToggle = useCallback((id: string) => {
    if (!rootSubnet) return;

    setRootSubnet(prev => {
      if (!prev) return prev;
      return findAndUpdateSubnet(prev, id, (subnet) => ({
        ...subnet,
        isExpanded: !subnet.isExpanded,
      }));
    });
  }, [rootSubnet, findAndUpdateSubnet]);

  const handleDelete = useCallback((id: string) => {
    if (!rootSubnet) return;

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

    setStatusMessage("[PASS] Subnet split removed - parent restored");
    setTimeout(() => setStatusMessage(null), 2500);
  }, [rootSubnet]);

  const handleReset = () => {
    setRootSubnet(null);
    setSelectedIds(new Set());
    setStatusMessage(null);
    form.reset();
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

  const handleSelectAll = useCallback((checked: boolean) => {
    if (!rootSubnet) return;
    const allSubnets = collectVisibleSubnets(rootSubnet, hideParents);
    if (checked) {
      setSelectedIds(new Set(allSubnets.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [rootSubnet, hideParents]);

  const handleExportCSV = useCallback(() => {
    if (!rootSubnet || selectedIds.size === 0) {
      toast({
        title: "No rows selected",
        description: "Please select at least one subnet row to export",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);

    try {
      const visibleSubnets = collectVisibleSubnets(rootSubnet, hideParents);
      const selectedSubnets = visibleSubnets.filter(s => selectedIds.has(s.id));

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
  }, [rootSubnet, selectedIds, hideParents, toast]);

  const loadExample = (cidr: string) => {
    form.setValue("cidr", cidr);
    const subnet = calculateSubnet(cidr);
    setRootSubnet(subnet);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-end px-6 py-2 border-b border-border bg-muted/20">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <Sun className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Moon className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isDark ? 'Light mode' : 'Dark mode'}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="container mx-auto px-6 pb-8 max-w-[1600px]">
        <header className="border-b border-border bg-muted/20 -mx-6 px-6 py-4 mb-6 text-center">
          <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer" className="inline-block">
            <img src="/github-nicholashoule.png" alt="GitHub QR Code" className="w-16 h-16 rounded-lg hover:opacity-80 transition-opacity mb-2" />
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-4">
                <FormField
                  control={form.control}
                  name="cidr"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="sr-only">CIDR Notation</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., 192.168.1.0/24" 
                          className="font-mono text-lg h-12"
                          data-testid="input-cidr"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="lg" data-testid="button-calculate" aria-label="Calculate subnet details" disabled={isCalculating}>
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
                      onClick={handleReset}
                      data-testid="button-reset"
                      aria-label="Reset calculator and clear results"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </form>
            </Form>

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
                      aria-label={hideParents ? "Show all subnets including parents" : "Hide parent subnets after split"}
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
                      disabled={selectedIds.size === 0 || isExporting}
                      data-testid="button-export-csv"
                      aria-label={`Export ${selectedIds.size} selected subnets to CSV`}
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Export CSV ({selectedIds.size})
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
                    Manage your subnet hierarchy by expanding rows to view details or splitting any subnet into smaller networks.
                  </CardDescription>
                  {statusMessage && (
                    <span className="text-xs font-semibold text-green-600 dark:text-green-400 animate-in fade-in duration-300" data-testid="text-status-message">
                      {statusMessage}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto elegant-scrollbar">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-xs py-2 px-2">
                          <Checkbox
                            checked={
                              selectedIds.size > 0 &&
                              selectedIds.size ===
                                collectVisibleSubnets(rootSubnet!, hideParents).length
                            }
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
                        onToggle={handleToggle}
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
              <h3 className="text-xl font-semibold mb-2">No subnet calculated yet</h3>
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
