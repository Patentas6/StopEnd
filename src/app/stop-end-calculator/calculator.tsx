"use client";
// Forcing a new commit to trigger Vercel deployment

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { addDays, differenceInDays, format, getDay, startOfDay, parseISO, isWithinInterval } from "date-fns";
import { toast } from "sonner";

// Manually define the PanelHandle type as a workaround for the persistent import issue.
interface PanelHandle {
  collapse: () => void;
  expand: () => void;
  isCollapsed: () => boolean;
  isExpanded: () => boolean;
  resize: (percentage: number) => void;
  getSize: () => number;
  getId: () => string;
}

import { ProductionPlanOption, ProductionRestriction, DailyOperation, SimulationLogEntry, SimulationSummary, FirstShortageInfo, InstallationBlackout } from "@/types/stop-end-calculator";
import { calculateOptimalProductionPlan, runFullSimulation } from "@/lib/stop-end-calculator-logic";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon, ChevronsRight, Loader2, Save, Play, PanelLeftClose, PanelLeftOpen, LogOut, BarChart, List, Printer } from "lucide-react";
import ProductionPlanEditor from "@/components/stop-end-calculator/production-plan-editor";
import ProductionRestrictionEditor from "@/components/stop-end-calculator/production-restriction-editor";
import InstallationBlackoutEditor from "@/components/stop-end-calculator/installation-blackout-editor";
import DailyOperationCard from "@/components/stop-end-calculator/daily-operation-card";
import SimulationResultsDisplay from "@/components/stop-end-calculator/simulation-results-display";
import PrintablePlan from "@/components/stop-end-calculator/printable-plan";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const today = startOfDay(new Date());

interface CalculatorProps {
  user: User;
}

export default function Calculator({ user }: CalculatorProps) {
  const supabase = createClient();
  const router = useRouter();
  const sidebarPanelRef = useRef<PanelHandle>(null);

  // Main state for calculator inputs
  const [projectName, setProjectName] = useState("New Project");
  const [projectStartDate, setProjectStartDate] = useState<Date>(today);
  const [projectEndDate, setProjectEndDate] = useState<Date>(addDays(today, 89));
  const [installationStartDate, setInstallationStartDate] = useState<Date>(addDays(today, 14));
  const [defaultInstallSetRate, setDefaultInstallSetRate] = useState(2);
  const [defaultInstallSetRateSaturday, setDefaultInstallSetRateSaturday] = useState(1);
  const [initialStock10m, setInitialStock10m] = useState(10);
  const [initialStock6m, setInitialStock6m] = useState(10);
  const [target10mNeeded, setTarget10mNeeded] = useState(100);
  const [target6mNeeded, setTarget6mNeeded] = useState(100);
  const [productionPlanOptions, setProductionPlanOptions] = useState<ProductionPlanOption[]>([
    { id: uuidv4(), name: "Standard Day", produces10m: 2, produces6m: 2 },
    { id: uuidv4(), name: "Focus 10m", produces10m: 3, produces6m: 0 },
  ]);
  const [productionRestrictions, setProductionRestrictions] = useState<ProductionRestriction[]>([]);
  const [installationBlackouts, setInstallationBlackouts] = useState<InstallationBlackout[]>([]);
  
  // State for derived data and simulation results
  const [dailyOperations, setDailyOperations] = useState<DailyOperation[]>([]);
  const [simulationResults, setSimulationResults] = useState<SimulationLogEntry[] | null>(null);
  const [simulationSummary, setSimulationSummary] = useState<SimulationSummary | null>(null);
  const [firstShortage, setFirstShortage] = useState<FirstShortageInfo | null>(null);

  // UI and loading state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [savedStateId, setSavedStateId] = useState<string | null>(null);
  const [isResultsVisible, setIsResultsVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [optimizationStrategy, setOptimizationStrategy] = useState<'performance' | 'consistency'>('performance');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleToggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  // Load saved state from Supabase
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('calculator_state')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        toast.error("Failed to load saved project.", { description: error.message });
      } else if (data && data.length > 0) {
        const saved = data[0];
        setProjectName(saved.name);
        setProjectStartDate(parseISO(saved.project_start_date));
        setProjectEndDate(parseISO(saved.project_end_date));
        setInstallationStartDate(parseISO(saved.installation_start_date));
        setDefaultInstallSetRate(saved.default_install_set_rate);
        setDefaultInstallSetRateSaturday(saved.default_install_set_rate_saturday);
        setInitialStock10m(saved.initial_stock_10m);
        setInitialStock6m(saved.initial_stock_6m);
        setTarget10mNeeded(saved.target_10m_needed);
        setTarget6mNeeded(saved.target_6m_needed);
        setProductionPlanOptions(saved.production_plan_options || []);
        setProductionRestrictions(saved.production_restrictions || []);
        setInstallationBlackouts(saved.installation_blackouts || []);
        setSavedStateId(saved.id);
        toast.success("Loaded your most recent project.");
      }
      setIsLoading(false);
    };
    loadData();
  }, [user.id, supabase]);

  // Generate the base daily operations schedule
  const baseDailyOperations = useMemo<DailyOperation[]>(() => {
    const ops: DailyOperation[] = [];
    if (!projectStartDate || !projectEndDate || projectEndDate < projectStartDate) return [];

    const duration = differenceInDays(projectEndDate, projectStartDate) + 1;
    for (let i = 0; i < duration; i++) {
      const currentDate = startOfDay(addDays(projectStartDate, i));
      const dayOfWeek = getDay(currentDate); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      
      const isBlackout = installationBlackouts.some(b => 
        isWithinInterval(currentDate, {
          start: startOfDay(new Date(b.unavailableFrom)),
          end: startOfDay(new Date(b.unavailableTo))
        })
      );

      let installSets = 0;
      if (!isBlackout && currentDate >= startOfDay(installationStartDate) && !isSunday) {
        installSets = isSaturday ? defaultInstallSetRateSaturday : defaultInstallSetRate;
      }

      ops.push({
        id: uuidv4(),
        projectDayNumber: i + 1,
        actualDate: currentDate,
        dayOfWeek: format(currentDate, "E"),
        isSunday: isSunday,
        produced10m: 0,
        produced6m: 0,
        installed10m: installSets,
        installed6m: installSets,
      });
    }
    return ops;
  }, [projectStartDate, projectEndDate, installationStartDate, defaultInstallSetRate, defaultInstallSetRateSaturday, installationBlackouts]);

  // Initialize or update dailyOperations when base changes
  useEffect(() => {
    setDailyOperations(prevOps => {
      if (prevOps.length === baseDailyOperations.length) {
        return prevOps.map((op, i) => ({
          ...baseDailyOperations[i],
          produced10m: op.produced10m,
          produced6m: op.produced6m,
          chosenProductionPlanId: op.chosenProductionPlanId,
        }));
      }
      return baseDailyOperations;
    });
  }, [baseDailyOperations]);

  const handleDailyOpChange = useCallback((updatedOp: DailyOperation) => {
    setDailyOperations(prevOps =>
      prevOps.map(op => (op.id === updatedOp.id ? updatedOp : op))
    );
    // When a manual change is made, clear the chosen plan ID
    if (updatedOp.chosenProductionPlanId) {
        const plan = productionPlanOptions.find(p => p.id === updatedOp.chosenProductionPlanId);
        if (plan && (plan.produces10m !== updatedOp.produced10m || plan.produces6m !== updatedOp.produced6m)) {
            setDailyOperations(prevOps => prevOps.map(op => op.id === updatedOp.id ? {...updatedOp, chosenProductionPlanId: undefined} : op));
        }
    }
  }, [productionPlanOptions]);

  const handleRunSimulation = useCallback(() => {
    setIsSimulating(true);
    setSimulationResults(null); // Clear previous results
    setIsResultsVisible(false); // Default to showing the plan view after calculation

    // Use a timeout to allow the UI to update to the loading state
    setTimeout(() => {
      try {
        const { optimalPlan } = calculateOptimalProductionPlan(
          dailyOperations,
          productionPlanOptions,
          productionRestrictions,
          initialStock10m,
          initialStock6m,
          target10mNeeded,
          target6mNeeded,
          optimizationStrategy
        );
        setDailyOperations(optimalPlan);

        const { simulationLog, summary, firstShortageInfo } = runFullSimulation(
          optimalPlan,
          initialStock10m,
          initialStock6m,
          target10mNeeded,
          target6mNeeded
        );

        setSimulationResults(simulationLog);
        setSimulationSummary(summary);
        setFirstShortage(firstShortageInfo);
        toast.success("Optimal plan calculated!", {
            description: "The daily plan has been updated. You can now view the full simulation results."
        });
      } catch (error) {
        console.error("Simulation Error:", error);
        toast.error("An error occurred during simulation.");
      } finally {
        setIsSimulating(false);
      }
    }, 50);
  }, [dailyOperations, productionPlanOptions, productionRestrictions, initialStock10m, initialStock6m, target10mNeeded, target6mNeeded, optimizationStrategy]);

  const handleSaveState = async () => {
    setIsSaving(true);
    const stateToSave = {
      id: savedStateId || uuidv4(),
      user_id: user.id,
      name: projectName,
      updated_at: new Date().toISOString(),
      project_start_date: projectStartDate.toISOString(),
      project_end_date: projectEndDate.toISOString(),
      installation_start_date: installationStartDate.toISOString(),
      default_install_set_rate: defaultInstallSetRate,
      default_install_set_rate_saturday: defaultInstallSetRateSaturday,
      initial_stock_10m: initialStock10m,
      initial_stock_6m: initialStock6m,
      target_10m_needed: target10mNeeded,
      target_6m_needed: target6mNeeded,
      production_plan_options: productionPlanOptions,
      production_restrictions: productionRestrictions,
      installation_blackouts: installationBlackouts,
    };

    const { error } = await supabase.from('calculator_state').upsert(stateToSave);

    if (error) {
      toast.error("Failed to save project.", { description: error.message });
    } else {
      toast.success("Project saved successfully!");
      if (!savedStateId) setSavedStateId(stateToSave.id);
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-4 text-lg">Loading your project...</p>
      </div>
    );
  }

  if (isPrinting) {
    return (
      <PrintablePlan
        dailyPlan={simulationResults || dailyOperations}
        productionPlans={productionPlanOptions}
        initialStock10m={initialStock10m}
        initialStock6m={initialStock6m}
        projectName={projectName}
        onBack={() => setIsPrinting(false)}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
        <header className="flex items-center justify-between p-2 border-b bg-background">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleToggleSidebar}>
                    {isSidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
                <h1 className="text-lg font-semibold">Stop-End Calculator</h1>
            </div>
            <div className="flex items-center gap-2">
                <Button onClick={handleSaveState} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                </Button>
                <Button onClick={handleLogout} variant="outline">
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                </Button>
            </div>
        </header>
        <ResizablePanelGroup direction="horizontal" className="flex-grow">
            <ResizablePanel id="sidebar-panel" ref={sidebarPanelRef} collapsedSize={0} collapsible={true} minSize={25} defaultSize={30} onCollapse={() => setIsSidebarOpen(false)} onExpand={() => setIsSidebarOpen(true)}>
                <ScrollArea className="h-full p-4">
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Project Name</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g., Downtown Tower Project" />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Key Dates</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1">
                                    <Label>Project Start</Label>
                                    <Popover>
                                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><CalendarIcon className="mr-2 h-4 w-4" />{format(projectStartDate, "PPP")}</Button></PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={projectStartDate} onSelect={(d) => d && setProjectStartDate(d)} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-1">
                                    <Label>Project End</Label>
                                    <Popover>
                                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><CalendarIcon className="mr-2 h-4 w-4" />{format(projectEndDate, "PPP")}</Button></PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={projectEndDate} onSelect={(d) => d && setProjectEndDate(d)} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-1">
                                    <Label>Installation Start</Label>
                                    <Popover>
                                        <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><CalendarIcon className="mr-2 h-4 w-4" />{format(installationStartDate, "PPP")}</Button></PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={installationStartDate} onSelect={(d) => d && setInstallationStartDate(d)} initialFocus /></PopoverContent>
                                    </Popover>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Installation Rates</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1">
                                    <Label>Default Sets/Day (Mon-Fri)</Label>
                                    <Input type="number" value={defaultInstallSetRate} onChange={(e) => setDefaultInstallSetRate(parseInt(e.target.value) || 0)} min="0" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Sets on Saturday</Label>
                                    <Input type="number" value={defaultInstallSetRateSaturday} onChange={(e) => setDefaultInstallSetRateSaturday(parseInt(e.target.value) || 0)} min="0" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Targets & Initial Stock</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1">
                                    <Label>Target 10m Needed</Label>
                                    <Input type="number" value={target10mNeeded} onChange={(e) => setTarget10mNeeded(parseInt(e.target.value) || 0)} min="0" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Target 6m Needed</Label>
                                    <Input type="number" value={target6mNeeded} onChange={(e) => setTarget6mNeeded(parseInt(e.target.value) || 0)} min="0" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Initial Stock 10m</Label>
                                    <Input type="number" value={initialStock10m} onChange={(e) => setInitialStock10m(parseInt(e.target.value) || 0)} min="0" />
                                </div>
                                <div className="space-y-1">
                                    <Label>Initial Stock 6m</Label>
                                    <Input type="number" value={initialStock6m} onChange={(e) => setInitialStock6m(parseInt(e.target.value) || 0)} min="0" />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Calculation Settings</CardTitle>
                                <CardDescription>Fine-tune the optimization logic.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="optimization-strategy" className="text-base">Prioritize Production Consistency</Label>
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Reduces frequent changes in production methods. May result in a less optimal stock level.
                                        </p>
                                    </div>
                                    <Switch
                                        id="optimization-strategy"
                                        checked={optimizationStrategy === 'consistency'}
                                        onCheckedChange={(checked) => setOptimizationStrategy(checked ? 'consistency' : 'performance')}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                        <ProductionPlanEditor productionPlanOptions={productionPlanOptions} setProductionPlanOptions={setProductionPlanOptions} />
                        <ProductionRestrictionEditor productionRestrictions={productionRestrictions} setProductionRestrictions={setProductionRestrictions} />
                        <InstallationBlackoutEditor installationBlackouts={installationBlackouts} setInstallationBlackouts={setInstallationBlackouts} />
                    </div>
                </ScrollArea>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70}>
                <div className="flex flex-col h-full">
                    <div className="p-4 border-b flex items-center gap-4">
                        <Button onClick={handleRunSimulation} disabled={isSimulating} className="flex-grow">
                            {isSimulating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                            Calculate Optimal Plan & Run Simulation
                        </Button>
                        {simulationResults && (
                            <>
                                <Button variant="outline" onClick={() => setIsResultsVisible(!isResultsVisible)}>
                                    {isResultsVisible ? <List className="mr-2 h-4 w-4" /> : <BarChart className="mr-2 h-4 w-4" />}
                                    {isResultsVisible ? "View Plan" : "View Simulation Results"}
                                </Button>
                                <Button variant="outline" onClick={() => setIsPrinting(true)}>
                                    <Printer className="mr-2 h-4 w-4" /> Print Plan
                                </Button>
                            </>
                        )}
                    </div>
                    <ScrollArea className="flex-grow p-4 bg-muted/40">
                        {isSimulating && (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin" />
                                <p className="ml-4 text-lg">Calculating...</p>
                            </div>
                        )}
                        
                        {isResultsVisible && simulationResults && simulationSummary && firstShortage ? (
                            <SimulationResultsDisplay results={simulationResults} summary={simulationSummary} firstShortage={firstShortage} target10mNeeded={target10mNeeded} target6mNeeded={target6mNeeded} />
                        ) : (
                            !isSimulating && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {dailyOperations.map(op => (
                                        <DailyOperationCard key={op.id} operation={op} productionPlans={productionPlanOptions} onChange={handleDailyOpChange} />
                                    ))}
                                </div>
                            )
                        )}

                        {!simulationResults && !isSimulating && dailyOperations.length === 0 && (
                            <Alert>
                                <ChevronsRight className="h-4 w-4" />
                                <AlertTitle>Ready to Plan!</AlertTitle>
                                <AlertDescription>
                                    Adjust your project settings on the left, then click the calculate button to generate your production schedule.
                                </AlertDescription>
                            </Alert>
                        )}
                    </ScrollArea>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    </div>
  );
}