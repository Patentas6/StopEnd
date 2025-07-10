"use client";

import React from "react";
import { format } from "date-fns";
import { DailyOperation, ProductionPlanOption } from "@/types/stop-end-calculator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DailyOperationCardProps {
  operation: DailyOperation;
  productionPlans: ProductionPlanOption[];
  onChange: (updatedOperation: DailyOperation) => void;
}

export default function DailyOperationCard({ operation, productionPlans, onChange }: DailyOperationCardProps) {
  const chosenPlan = productionPlans.find(p => p.id === operation.chosenProductionPlanId);
  
  let planDisplayString = "No Production";
  if (operation.isSunday || (productionPlans.length === 0 && !operation.produced10m && !operation.produced6m)) {
    planDisplayString = "No Production";
  } else if (chosenPlan) {
    if (chosenPlan.produces10m !== operation.produced10m || chosenPlan.produces6m !== operation.produced6m) {
        planDisplayString = `${chosenPlan.name} (Adjusted)`;
    } else {
        planDisplayString = chosenPlan.name;
    }
  } else if (operation.produced10m > 0 || operation.produced6m > 0) {
    planDisplayString = "Manual Input";
  }


  const handleInstallChange = (value: string) => {
    const numValue = parseInt(value) || 0;
    onChange({
      ...operation,
      installed10m: numValue,
      installed6m: numValue,
    });
  };

  const handleProductionChange = (itemType: "10m" | "6m", value: string) => {
    const numValue = parseInt(value) || 0;
    const updatedOp = { ...operation };
    if (itemType === "10m") {
      updatedOp.produced10m = numValue;
    } else {
      updatedOp.produced6m = numValue;
    }
    onChange(updatedOp);
  };

  return (
    <Card className={cn("flex flex-col", operation.isSunday ? "bg-muted/50" : "")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Day {operation.projectDayNumber} ({operation.dayOfWeek})
        </CardTitle>
        <CardDescription>{format(operation.actualDate, "MMM d, yyyy")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm flex-grow">
        <div>
          <Label className="text-xs">Chosen Plan:</Label>
          {chosenPlan ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="truncate font-medium cursor-default">{planDisplayString}</p>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Original Plan: {chosenPlan.produces10m} / {chosenPlan.produces6m}</p>
                  {planDisplayString.includes("Adjusted") && <p>Actual Prod: {operation.produced10m} / {operation.produced6m}</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="font-medium">{planDisplayString}</p>
          )}
        </div>
        
        <div className="pt-1">
          <Label htmlFor={`prod10m-${operation.id}`} className="text-xs">Actual Prod 10m:</Label>
          <Input
            id={`prod10m-${operation.id}`}
            type="number"
            value={operation.produced10m}
            onChange={(e) => handleProductionChange("10m", e.target.value)}
            min="0"
            className="h-8 text-sm"
            disabled={operation.isSunday}
          />
        </div>
        <div>
          <Label htmlFor={`prod6m-${operation.id}`} className="text-xs">Actual Prod 6m:</Label>
          <Input
            id={`prod6m-${operation.id}`}
            type="number"
            value={operation.produced6m}
            onChange={(e) => handleProductionChange("6m", e.target.value)}
            min="0"
            className="h-8 text-sm"
            disabled={operation.isSunday}
          />
        </div>
        
        <div className="pt-1">
          <Label htmlFor={`installSets-${operation.id}`} className="text-xs">Install Sets:</Label>
          <Input
            id={`installSets-${operation.id}`}
            type="number"
            value={operation.installed10m} 
            onChange={(e) => handleInstallChange(e.target.value)}
            min="0"
            className="h-8 text-sm"
            disabled={operation.isSunday}
          />
        </div>
      </CardContent>
    </Card>
  );
}