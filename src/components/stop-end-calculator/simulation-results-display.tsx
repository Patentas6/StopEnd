"use client";

import React from "react";
import { format } from "date-fns";
import { SimulationLogEntry, SimulationSummary, FirstShortageInfo } from "@/types/stop-end-calculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SimulationResultsDisplayProps {
  results: SimulationLogEntry[];
  summary: SimulationSummary;
  firstShortage: FirstShortageInfo;
  target10mNeeded: number;
  target6mNeeded: number;
}

export default function SimulationResultsDisplay({
  results,
  summary,
  firstShortage,
  target10mNeeded,
  target6mNeeded,
}: SimulationResultsDisplayProps) {

  let cumulativeProduced10m = 0;
  let cumulativeProduced6m = 0;
  let cumulativeInstalled10m = 0;
  let cumulativeInstalled6m = 0;

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
    <Card>
      <CardHeader>
        <CardTitle>Full Simulation Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <p>Total Installed 10m: <span className="font-bold">{summary.totalActualInstalled10m}</span> (Target: {target10mNeeded})</p>
            <p>Total Installed 6m: <span className="font-bold">{summary.totalActualInstalled6m}</span> (Target: {target6mNeeded})</p>
            <p className={cn(summary.meetsTarget10m ? "text-green-600" : "text-red-600")}>
              10m Target Met: <span className="font-bold">{summary.meetsTarget10m ? "Yes" : "No"}</span>
              {!summary.meetsTarget10m && ` (Shortfall: ${summary.targetShortfall10m})`}
            </p>
            <p className={cn(summary.meetsTarget6m ? "text-green-600" : "text-red-600")}>
              6m Target Met: <span className="font-bold">{summary.meetsTarget6m ? "Yes" : "No"}</span>
              {!summary.meetsTarget6m && ` (Shortfall: ${summary.targetShortfall6m})`}
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">First Shortages</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <p>10m: {firstShortage.day10m 
              ? <span className="font-bold text-orange-600">Day {firstShortage.day10m} ({firstShortage.date10m ? format(firstShortage.date10m, "MMM d") : ""})</span>
              : <span className="text-green-600 font-bold">No 10m shortages</span>}
            </p>
            <p>6m: {firstShortage.day6m
              ? <span className="font-bold text-orange-600">Day {firstShortage.day6m} ({firstShortage.date6m ? format(firstShortage.date6m, "MMM d") : ""})</span>
              : <span className="text-green-600 font-bold">No 6m shortages</span>}
            </p>
          </div>
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-2">Daily Log</h3>
          <div className="w-full border rounded-md overflow-x-auto" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <Table className="min-w-max">
              <TableHeader className="sticky top-0 bg-background z-20">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Day</TableHead>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Daily Prod (10m/6m)</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Total Prod (10m/6m)</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Closing Stock (10m/6m)</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Total Inst (10m/6m)</TableHead>
                  <TableHead className="text-center text-red-500 whitespace-nowrap">Daily Shortage (10m/6m)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedResults.map((log) => (
                  <TableRow key={log.id} className={cn((log.shortage10m > 0 || log.shortage6m > 0) && "bg-red-50 dark:bg-red-900/30")}>
                    <TableCell className="whitespace-nowrap">{log.projectDayNumber} ({log.dayOfWeek})</TableCell>
                    <TableCell className="whitespace-nowrap">{format(log.actualDate, "MMM d")}</TableCell>
                    <TableCell className="text-center">{log.produced10m} / {log.produced6m}</TableCell>
                    <TableCell className="text-center">{log.cumulativeProduced10m} / {log.cumulativeProduced6m}</TableCell>
                    <TableCell className="text-center">{log.closingStock10m} / {log.closingStock6m}</TableCell>
                    <TableCell className="text-center">{log.cumulativeInstalled10m} / {log.cumulativeInstalled6m}</TableCell>
                    <TableCell className={cn("text-center", (log.shortage10m > 0 || log.shortage6m > 0) && "font-bold text-red-600")}>
                      {log.shortage10m} / {log.shortage6m}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}