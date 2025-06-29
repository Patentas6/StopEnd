"use client";

import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ProductionPlanOption } from "@/types/stop-end-calculator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { PlusCircle, Trash2, Edit3, Save, XCircle } from "lucide-react";

interface ProductionPlanEditorProps {
  productionPlanOptions: ProductionPlanOption[];
  setProductionPlanOptions: React.Dispatch<React.SetStateAction<ProductionPlanOption[]>>;
}

export default function ProductionPlanEditor({
  productionPlanOptions,
  setProductionPlanOptions,
}: ProductionPlanEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentEdit, setCurrentEdit] = useState<Partial<ProductionPlanOption>>({});

  const handleAddPlan = () => {
    const newPlan: ProductionPlanOption = {
      id: uuidv4(),
      name: "New Plan",
      produces10m: 0,
      produces6m: 0,
    };
    setProductionPlanOptions([...productionPlanOptions, newPlan]);
    setEditingId(newPlan.id);
    setCurrentEdit(newPlan);
  };

  const handleRemovePlan = (id: string) => {
    setProductionPlanOptions(productionPlanOptions.filter((plan) => plan.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setCurrentEdit({});
    }
  };

  const handleEdit = (plan: ProductionPlanOption) => {
    setEditingId(plan.id);
    setCurrentEdit({...plan});
  };

  const handleSave = (id: string) => {
    setProductionPlanOptions(
      productionPlanOptions.map((plan) =>
        plan.id === id ? { ...plan, ...currentEdit, id } as ProductionPlanOption : plan
      )
    );
    setEditingId(null);
    setCurrentEdit({});
  };
  
  const handleCancelEdit = () => {
    setEditingId(null);
    setCurrentEdit({});
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentEdit(prev => ({ ...prev, [name]: name.startsWith("produces") ? parseInt(value) || 0 : value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Production Options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {productionPlanOptions.map((plan) => (
          <div key={plan.id} className="p-3 border rounded-md space-y-2">
            {editingId === plan.id ? (
              <div className="space-y-2">
                <div>
                  <Label htmlFor={`name-${plan.id}`}>Plan Name</Label>
                  <Input id={`name-${plan.id}`} name="name" value={currentEdit.name || ""} onChange={handleChange} />
                </div>
                <div>
                  <Label htmlFor={`produces10m-${plan.id}`}>Produces 10m</Label>
                  <Input id={`produces10m-${plan.id}`} name="produces10m" type="number" value={currentEdit.produces10m || 0} onChange={handleChange} min="0"/>
                </div>
                <div>
                  <Label htmlFor={`produces6m-${plan.id}`}>Produces 6m</Label>
                  <Input id={`produces6m-${plan.id}`} name="produces6m" type="number" value={currentEdit.produces6m || 0} onChange={handleChange} min="0"/>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleSave(plan.id)} size="sm"><Save className="mr-1 h-4 w-4" /> Save</Button>
                  <Button onClick={handleCancelEdit} variant="outline" size="sm"><XCircle className="mr-1 h-4 w-4" /> Cancel</Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-semibold">{plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  10m: {plan.produces10m}, 6m: {plan.produces6m}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button onClick={() => handleEdit(plan)} size="sm" variant="outline"><Edit3 className="mr-1 h-4 w-4" /> Edit</Button>
                  <Button onClick={() => handleRemovePlan(plan.id)} variant="destructive" size="sm"><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button onClick={handleAddPlan} className="w-full">
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Production Plan
        </Button>
      </CardFooter>
    </Card>
  );
}