"use client";

import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { format, startOfDay, parseISO } from "date-fns";
import { InstallationBlackout } from "@/types/stop-end-calculator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, PlusCircle, Trash2, Edit3, Save, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InstallationBlackoutEditorProps {
  installationBlackouts: InstallationBlackout[];
  setInstallationBlackouts: React.Dispatch<React.SetStateAction<InstallationBlackout[]>>;
}

const today = startOfDay(new Date());

export default function InstallationBlackoutEditor({
  installationBlackouts,
  setInstallationBlackouts,
}: InstallationBlackoutEditorProps) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [currentEdit, setCurrentEdit] = useState<Partial<InstallationBlackout> & { id?: string }>({
    unavailableFrom: today,
    unavailableTo: today,
  });

  const handleAddNewBlackout = () => {
    setCurrentEdit({
      id: uuidv4(),
      unavailableFrom: today,
      unavailableTo: today,
      reason: "",
    });
    setIsAdding(true);
  };

  const handleSaveBlackout = () => {
    if (!currentEdit.id || !currentEdit.unavailableFrom || !currentEdit.unavailableTo) {
      toast.error("Please fill all fields for the blackout period.");
      return;
    }
    if (currentEdit.unavailableTo < currentEdit.unavailableFrom) {
        toast.error("'Unavailable To' date cannot be before 'Unavailable From' date.");
        return;
    }

    const newBlackout: InstallationBlackout = {
      id: currentEdit.id,
      unavailableFrom: startOfDay(currentEdit.unavailableFrom),
      unavailableTo: startOfDay(currentEdit.unavailableTo),
      reason: currentEdit.reason || "",
    };

    const existingIndex = installationBlackouts.findIndex(b => b.id === newBlackout.id);
    if (existingIndex > -1) {
      setInstallationBlackouts(prev => prev.map(b => b.id === newBlackout.id ? newBlackout : b));
    } else {
      setInstallationBlackouts(prev => [...prev, newBlackout]);
    }
    
    setIsAdding(false);
    setCurrentEdit({ unavailableFrom: today, unavailableTo: today });
    toast.success("Installation blackout saved.");
  };

  const handleEditBlackout = (blackout: InstallationBlackout) => {
    setCurrentEdit({ 
        ...blackout,
        unavailableFrom: typeof blackout.unavailableFrom === 'string' ? parseISO(blackout.unavailableFrom) : blackout.unavailableFrom,
        unavailableTo: typeof blackout.unavailableTo === 'string' ? parseISO(blackout.unavailableTo) : blackout.unavailableTo,
    });
    setIsAdding(true);
  };
  
  const handleCancel = () => {
    setIsAdding(false);
    setCurrentEdit({ unavailableFrom: today, unavailableTo: today });
  };

  const handleRemoveBlackout = (id: string) => {
    setInstallationBlackouts(installationBlackouts.filter((b) => b.id !== id));
    toast.info("Installation blackout removed.");
  };

  const handleFieldChange = (field: keyof InstallationBlackout, value: any) => {
    setCurrentEdit(prev => ({ ...prev, [field]: value }));
  };
  
  const handleDateChange = (field: "unavailableFrom" | "unavailableTo", date: Date | undefined) => {
    if (date) {
      setCurrentEdit(prev => ({ ...prev, [field]: startOfDay(date) }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Installation Blackouts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {installationBlackouts.map((blackout) => (
          <div key={blackout.id} className="p-3 border rounded-md space-y-1 text-sm">
            <p className="font-semibold">
              Installation Paused
            </p>
            <p>
              From: {format(new Date(blackout.unavailableFrom), "PPP")} To: {format(new Date(blackout.unavailableTo), "PPP")}
            </p>
            {blackout.reason && <p className="text-xs text-muted-foreground">Reason: {blackout.reason}</p>}
            <div className="flex gap-2 mt-2">
              <Button onClick={() => handleEditBlackout(blackout)} size="sm" variant="outline">
                <Edit3 className="mr-1 h-3 w-3" /> Edit
              </Button>
              <Button onClick={() => handleRemoveBlackout(blackout.id)} variant="destructive" size="sm">
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
            </div>
          </div>
        ))}

        {isAdding && (
          <div className="p-3 border rounded-md space-y-3 bg-muted/30">
            <h4 className="font-medium text-sm">{currentEdit.id && installationBlackouts.find(b => b.id === currentEdit.id) ? "Edit Blackout" : "Add New Blackout"}</h4>
            <div>
              <Label htmlFor="unavailableFrom">Unavailable From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !currentEdit.unavailableFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {currentEdit.unavailableFrom ? format(new Date(currentEdit.unavailableFrom), "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={currentEdit.unavailableFrom ? new Date(currentEdit.unavailableFrom) : undefined} onSelect={(date) => handleDateChange("unavailableFrom", date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="unavailableTo">Unavailable To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !currentEdit.unavailableTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {currentEdit.unavailableTo ? format(new Date(currentEdit.unavailableTo), "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={currentEdit.unavailableTo ? new Date(currentEdit.unavailableTo) : undefined} onSelect={(date) => handleDateChange("unavailableTo", date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Input id="reason" name="reason" value={currentEdit.reason || ""} onChange={(e) => handleFieldChange("reason", e.target.value)} placeholder="e.g., Public Holiday"/>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveBlackout} size="sm"><Save className="mr-1 h-4 w-4" /> Save Blackout</Button>
              <Button onClick={handleCancel} variant="outline" size="sm"><XCircle className="mr-1 h-4 w-4" /> Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {!isAdding && (
          <Button onClick={handleAddNewBlackout} className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Installation Blackout Period
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}