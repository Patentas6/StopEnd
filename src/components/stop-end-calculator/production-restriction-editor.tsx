"use client";

import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { format, startOfDay, parseISO } from "date-fns";
import { ProductionRestriction } from "@/types/stop-end-calculator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, PlusCircle, Trash2, Edit3, Save, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ProductionRestrictionEditorProps {
  productionRestrictions: ProductionRestriction[];
  setProductionRestrictions: React.Dispatch<React.SetStateAction<ProductionRestriction[]>>;
}

const today = startOfDay(new Date());

export default function ProductionRestrictionEditor({
  productionRestrictions,
  setProductionRestrictions,
}: ProductionRestrictionEditorProps) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [currentEdit, setCurrentEdit] = useState<Partial<ProductionRestriction> & { id?: string }>({
    itemType: "10m",
    unavailableFrom: today,
    unavailableTo: today,
  });

  const handleAddNewRestriction = () => {
    setCurrentEdit({
      id: uuidv4(), // Generate ID for the new one
      itemType: "10m",
      unavailableFrom: today,
      unavailableTo: today,
      reason: "",
    });
    setIsAdding(true);
  };

  const handleSaveRestriction = () => {
    if (!currentEdit.id || !currentEdit.itemType || !currentEdit.unavailableFrom || !currentEdit.unavailableTo) {
      toast.error("Please fill all fields for the restriction.");
      return;
    }
    if (currentEdit.unavailableTo < currentEdit.unavailableFrom) {
        toast.error("'Unavailable To' date cannot be before 'Unavailable From' date.");
        return;
    }

    const newRestriction: ProductionRestriction = {
      id: currentEdit.id,
      itemType: currentEdit.itemType,
      unavailableFrom: startOfDay(currentEdit.unavailableFrom),
      unavailableTo: startOfDay(currentEdit.unavailableTo),
      reason: currentEdit.reason || "",
    };

    // Check if editing or adding new
    const existingIndex = productionRestrictions.findIndex(r => r.id === newRestriction.id);
    if (existingIndex > -1) {
      setProductionRestrictions(prev => prev.map(r => r.id === newRestriction.id ? newRestriction : r));
    } else {
      setProductionRestrictions(prev => [...prev, newRestriction]);
    }
    
    setIsAdding(false);
    setCurrentEdit({ itemType: "10m", unavailableFrom: today, unavailableTo: today }); // Reset for next potential add
    toast.success("Production restriction saved.");
  };

  const handleEditRestriction = (restriction: ProductionRestriction) => {
    setCurrentEdit({ 
        ...restriction,
        unavailableFrom: typeof restriction.unavailableFrom === 'string' ? parseISO(restriction.unavailableFrom) : restriction.unavailableFrom,
        unavailableTo: typeof restriction.unavailableTo === 'string' ? parseISO(restriction.unavailableTo) : restriction.unavailableTo,
    });
    setIsAdding(true); // Re-use the adding form for editing
  };
  
  const handleCancel = () => {
    setIsAdding(false);
    setCurrentEdit({ itemType: "10m", unavailableFrom: today, unavailableTo: today });
  };

  const handleRemoveRestriction = (id: string) => {
    setProductionRestrictions(productionRestrictions.filter((r) => r.id !== id));
    toast.info("Production restriction removed.");
  };

  const handleFieldChange = (field: keyof ProductionRestriction, value: any) => {
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
        <CardTitle>Production Blackouts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {productionRestrictions.map((restriction) => (
          <div key={restriction.id} className="p-3 border rounded-md space-y-1 text-sm">
            <p className="font-semibold">
              {restriction.itemType.toUpperCase()} Production Unavailable
            </p>
            <p>
              From: {format(new Date(restriction.unavailableFrom), "PPP")} To: {format(new Date(restriction.unavailableTo), "PPP")}
            </p>
            {restriction.reason && <p className="text-xs text-muted-foreground">Reason: {restriction.reason}</p>}
            <div className="flex gap-2 mt-2">
              <Button onClick={() => handleEditRestriction(restriction)} size="sm" variant="outline">
                <Edit3 className="mr-1 h-3 w-3" /> Edit
              </Button>
              <Button onClick={() => handleRemoveRestriction(restriction.id)} variant="destructive" size="sm">
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
            </div>
          </div>
        ))}

        {isAdding && (
          <div className="p-3 border rounded-md space-y-3 bg-muted/30">
            <h4 className="font-medium text-sm">{currentEdit.id && productionRestrictions.find(r => r.id === currentEdit.id) ? "Edit Restriction" : "Add New Restriction"}</h4>
            <div>
              <Label htmlFor="itemType">Item Type</Label>
              <Select
                value={currentEdit.itemType}
                onValueChange={(value: "10m" | "6m") => handleFieldChange("itemType", value)}
              >
                <SelectTrigger id="itemType">
                  <SelectValue placeholder="Select item type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10m">10m Stop-End</SelectItem>
                  <SelectItem value="6m">6m Stop-End</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                <Input id="reason" name="reason" value={currentEdit.reason || ""} onChange={(e) => handleFieldChange("reason", e.target.value)} placeholder="e.g., Supplier maintenance"/>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveRestriction} size="sm"><Save className="mr-1 h-4 w-4" /> Save Restriction</Button>
              <Button onClick={handleCancel} variant="outline" size="sm"><XCircle className="mr-1 h-4 w-4" /> Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {!isAdding && (
          <Button onClick={handleAddNewRestriction} className="w-full">
            <PlusCircle className="mr-2 h-4 w-4" /> Add Production Blackout Period
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}