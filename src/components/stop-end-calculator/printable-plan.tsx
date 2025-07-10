"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import { DailyOperation, ProductionPlanOption } from "@/types/stop-end-calculator";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrintablePlanProps {
  dailyPlan: DailyOperation[];
  productionPlans: ProductionPlanOption[];
  initialStock10m: number;
  initialStock6m: number;
  projectName: string;
  onBack: () => void;
}

export default function PrintablePlan({
  dailyPlan,
  productionPlans,
  initialStock10m,
  initialStock6m,
  projectName,
  onBack,
}: PrintablePlanProps) {
  const [isCompact, setIsCompact] = useState(false);
  
  let cumulativeProduced10m = initialStock10m;
  let cumulativeProduced6m = initialStock6m;

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

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4 print:hidden">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Calculator
          </Button>
          <div className="flex items-center space-x-2">
            <Switch id="compact-view" checked={isCompact} onCheckedChange={setIsCompact} />
            <Label htmlFor="compact-view">Compact View</Label>
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
        <div className="text-center mb-6">
            <h1 className="text-2xl font-bold print:text-xl">Production Plan: {projectName}</h1>
            <p className="text-sm text-muted-foreground">Generated on: {format(new Date(), "PPP")}</p>
        </div>

        <div className="border rounded-lg">
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
        </div>
      </div>
    </div>
  );
}