"use client";

import React from "react";
import { format } from "date-fns";
import { DailyOperation, ProductionPlanOption } from "@/types/stop-end-calculator";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer } from "lucide-react";

interface PublicPrintablePlanProps {
  plan: {
    dailyPlan: DailyOperation[];
    productionPlans: ProductionPlanOption[];
    initialStock10m: number;
    initialStock6m: number;
    projectName: string;
  }
}

export default function PublicPrintablePlan({ plan }: PublicPrintablePlanProps) {
  const {
    dailyPlan,
    productionPlans,
    initialStock10m,
    initialStock6m,
    projectName,
  } = plan;

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
    <div className="p-4 sm:p-8 bg-background">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6 print:hidden">
          <h1 className="text-2xl font-bold text-center flex-grow">
            Production Plan: {projectName}
          </h1>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
        <div className="hidden print:block text-center mb-6">
            <h1 className="text-2xl font-bold">{projectName}</h1>
            <p className="text-sm text-muted-foreground">Generated on: {format(new Date(), "PPP")}</p>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Date</TableHead>
                <TableHead>Production Plan</TableHead>
                <TableHead className="text-right">Cumulative Production (10m / 6m)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Start of Project</TableCell>
                <TableCell>Initial Stock</TableCell>
                <TableCell className="text-right">{initialStock10m} / {initialStock6m}</TableCell>
              </TableRow>
              {dailyPlan.map((op) => {
                cumulativeProduced10m += op.produced10m;
                cumulativeProduced6m += op.produced6m;
                return (
                  <TableRow key={op.id}>
                    <TableCell className="font-medium">{format(new Date(op.actualDate), "E, MMM d, yyyy")}</TableCell>
                    <TableCell>{getPlanName(op)}</TableCell>
                    <TableCell className="text-right">{cumulativeProduced10m} / {cumulativeProduced6m}</TableCell>
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