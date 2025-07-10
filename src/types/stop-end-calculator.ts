export interface ProductionPlanOption {
  id: string;
  name: string;
  produces10m: number;
  produces6m: number;
}

export interface DailyOperation {
  id: string;
  projectDayNumber: number;
  actualDate: Date;
  dayOfWeek: string; // "Mon", "Tue", etc.
  isSunday: boolean;
  produced10m: number;
  produced6m: number;
  installed10m: number;
  installed6m: number;
  chosenProductionPlanId?: string;
}

export interface ProductionRestriction {
  id: string;
  itemType: "10m" | "6m";
  unavailableFrom: Date;
  unavailableTo: Date;
  reason?: string; // Optional: for user reference
}

export interface InstallationBlackout {
  id: string;
  unavailableFrom: Date;
  unavailableTo: Date;
  reason?: string;
}

export interface SimulationLogEntry extends DailyOperation {
  openingStock10m: number;
  openingStock6m: number;
  requestedInstall10m: number; // Same as installed10m from DailyOperation before adjustment
  requestedInstall6m: number;   // Same as installed6m from DailyOperation before adjustment
  actualInstalled10m: number;
  actualInstalled6m: number;
  closingStock10m: number;
  closingStock6m: number;
  shortage10m: number;
  shortage6m: number;
}

export interface SimulationSummary {
  totalActualInstalled10m: number;
  totalActualInstalled6m: number;
  targetShortfall10m: number;
  targetShortfall6m: number;
  meetsTarget10m: boolean;
  meetsTarget6m: boolean;
}

export interface FirstShortageInfo {
  day10m?: number;
  date10m?: Date;
  day6m?: number;
  date6m?: Date;
}

export interface AppState {
  projectStartDate: Date;
  projectEndDate: Date;
  installationStartDate: Date;
  defaultInstall10mRate: number;
  defaultInstall6mRate: number;
  initialStock10m: number;
  initialStock6m: number;
  target10mNeeded: number;
  target6mNeeded: number;
  productionPlanOptions: ProductionPlanOption[];
  productionRestrictions: ProductionRestriction[];
  installationBlackouts: InstallationBlackout[];
  dailyOperations: DailyOperation[];
  simulationResults: SimulationLogEntry[];
  simulationSummary: SimulationSummary | null;
  firstShortage: FirstShortageInfo | null;
  isPlanVisible: boolean;
  isLoading: boolean;
}