"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { DailyOperation, ProductionPlanOption, SimulationLogEntry } from "@/types/stop-end-calculator";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";

interface PrintablePlanProps {
  dailyPlan: (DailyOperation | SimulationLogEntry)[];
  productionPlans: ProductionPlanOption[];
  initialStock10m: number;
  initialStock6m: number;
  projectName: string;
  onBack: () => void;
  savedStateId: string | null;
  supabase: SupabaseClient;
}

export default function PrintablePlan({
  dailyPlan,
  productionPlans,
  initialStock10m,
  initialStock6m,
  projectName,
  onBack,
  savedStateId,
  supabase,
}: PrintablePlanProps) {
  const [isCompact, setIsCompact] = useState(false);
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple');

  const hasDetailedData = dailyPlan.length > 0 && 'closingStock10m' in dailyPlan[0];

  const getPlanName = (op: DailyOperation) => {
    if (op.isSunday) return "No Production";
    const plan = productionPlans.find(p => p.id === op.chosenProductionPlanId);
    if (plan) {
        if (plan.produces10m !== op.produced10m || plan.produces6m !== op.produced6m) {
            return `${plan.name} (Adjusted to ${op.produced10m}/${op.produced6m})`;
        }
        return plan.name;
    }
    if (op.produced10m > 0 || op.produced6m > 0) {
      return `Manual: ${op.produced10m} / ${op.produced6m}`;
    }
    return "No Production";
  };

  const handleShare = async () => {
    if (!savedStateId) {
      toast.error("Please save the project first", {
        description: "A saved project is needed to create a shareable link.",
      });
      return;
    }

    const { error } = await supabase
      .from('calculator_state')
      .update({ is_public: true })
      .eq('id', savedStateId);

    if (error) {
      toast.error("Could not make plan public", { description: error.message });
      return;
    }

    const shareUrl = `${window.location.origin}/share/${savedStateId}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied to clipboard!");
  };

  const SimplePlanView = () => {
    let cumulativeProduced10m = initialStock10m;
    let cumulativeProduced6m = initialStock6m;
    return (
      <Table className={cn(isCompact && "text-xs")}>
        <TableHeader>
          <TableRow>
            <TableHead className={cn("w-[150px]", isCompact && "p-2")}>Date</TableHead>
            <TableHead className={cn(isCompact && "p-2")}>Production Plan</TableHead>
            <TableHead className={cn("text-right", isCompact && "p-2")}>Cumulative Production (10m / 6m)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className={cn("font-medium", isCompact && "p-2")}>Start of Project</TableCell>
            <TableCell className={cn(isCompact && "p-2")}>Initial Stock</TableCell>
            <TableCell className={cn("text-right", isCompact && "p-2")}>{initialStock10m} / {initialStock6m}</TableCell>
          </TableRow>
          {dailyPlan.map((op) => {
            cumulativeProduced10m += op.produced10m;
            cumulativeProduced6m += op.produced6m;
            return (
              <TableRow key={op.id}>
                <TableCell className={cn("font-medium", isCompact && "p-2")}>{format(op.actualDate, "E, MMM d")}</TableCell>
                <TableCell className={cn(isCompact && "p-2")}>{getPlanName(op)}</TableCell>
                <TableCell className={cn("text-right", isCompact && "p-2")}>{cumulativeProduced10m} / {cumulativeProduced6m}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const DetailedLogView = () => {
    let cumulativeProduced10m = 0;
    let cumulativeProduced6m = 0;
    let cumulativeInstalled10m = 0;
    let cumulativeInstalled6m = 0;

    const results = dailyPlan as SimulationLogEntry[];

    const processedResults = results.map(log => {
        cumulativeProduced10m += log.produced10m;
        cumulativeProduced6m += log.produced6m;
        cumulativeInstalled10m += log.actualInstalled10m;
        cumulativeInstalled6m += log.actualInstalled6m;
        return {
            ...log,
            cumulativeProduced10m,
            cumulativeProduced6m,
            cumulativeInstalled10m,
            cumulativeInstalled6m,
        };
    });

    return (
        <Table className={cn("min-w-full", isCompact ? "text-xs" : "text-sm")}>
            <TableHeader>
                <TableRow>
                    <TableHead className={cn("p-2", isCompact && "p-1")}>Day</TableHead>
                    <TableHead className={cn("p-2", isCompact && "p-1")}>Date</TableHead>
                    <TableHead className={cn("text-center p-2", isCompact && "p-1")}>Daily Prod</TableHead>
                    <TableHead className={cn("text-center p-2", isCompact && "p-1")}>Total Prod</TableHead>
                    <TableHead className={cn("text-center p-2", isCompact && "p-1")}>Closing Stock</TableHead>
                    <TableHead className={cn("text-center p-2", isCompact && "p-1")}>Total Inst</TableHead>
                    <TableHead className={cn("text-center p-2", isCompact && "p-1")}>Shortage</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {processedResults.map((log) => (
                  <TableRow key={log.id} className={cn((log.shortage10m > 0 || log.shortage6m > 0) && "bg-red-50 dark:bg-red-900/30")}>
                    <TableCell className={cn("p-2", isCompact && "p-1")}>{log.projectDayNumber}</TableCell>
                    <TableCell className={cn("p-2", isCompact && "p-1")}>{format(log.actualDate, "E, MMM d")}</TableCell>
                    <TableCell className={cn("text-center p-2", isCompact && "p-1")}>{log.produced10m}/{log.produced6m}</TableCell>
                    <TableCell className={cn("text-center p-2", isCompact && "p-1")}>{log.cumulativeProduced10m}/{log.cumulativeProduced6m}</TableCell>
                    <TableCell className={cn("text-center p-2", isCompact && "p-1")}>{log.closingStock10m}/{log.closingStock6m}</TableCell>
                    <TableCell className={cn("text-center p-2", isCompact && "p-1")}>{log.cumulativeInstalled10m}/{log.cumulativeInstalled6m}</TableCell>
                    <TableCell className={cn("text-center font-bold p-2", isCompact && "p-1", (log.shortage10m > 0 || log.shortage6m > 0) ? "text-red-600" : "text-green-600")}>
                      {log.shortage10m}/{log.shortage6m}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
        </Table>
    );
  };

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-4 print:hidden">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center space-x-4">
            {hasDetailedData && (
              <div className="flex items-center rounded-md border bg-muted p-1">
                <Button variant={viewMode === 'simple' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setViewMode('simple')}>Simple Plan</Button>
                <Button variant={viewMode === 'detailed' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setViewMode('detailed')}>Detailed Log</Button>
              </div>
            )}
            <div className="flex items-center space-x-2">
                <Switch id="compact-view" checked={isCompact} onCheckedChange={setIsCompact} />
                <Label htmlFor="compact-view">Compact</Label>
            </div>
            <Button onClick={handleShare} variant="outline" size="sm">
                <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            <Button onClick={() => window.print()} size="sm">
                <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        </div>
        <div className="text-center mb-6">
            <h1 className="text-2xl font-bold print:text-xl">Production Plan: {projectName}</h1>
            <p className="text-sm text-muted-foreground">Generated on: {format(new Date(), "PPP")}</p>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          {viewMode === 'simple' ? <SimplePlanView /> : <DetailedLogView />}
        </div>
      </div>
    </div>
  );
}