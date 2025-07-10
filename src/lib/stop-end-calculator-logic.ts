import { v4 as uuidv4 } from "uuid";
import { isWithinInterval, startOfDay } from "date-fns";
import {
  DailyOperation,
  ProductionPlanOption,
  ProductionRestriction,
  SimulationLogEntry,
  SimulationSummary,
  FirstShortageInfo,
} from "@/types/stop-end-calculator";

const STOCK_BUFFER = 4; // Safety stock buffer

// Helper to check if production of a specific item type is restricted on a given date
export function isProductionRestricted(
  itemType: "10m" | "6m",
  date: Date,
  restrictions: ProductionRestriction[]
): boolean {
  const targetDate = startOfDay(date);
  for (const restriction of restrictions) {
    if (restriction.itemType === itemType) {
      if (isWithinInterval(targetDate, { start: startOfDay(new Date(restriction.unavailableFrom)), end: startOfDay(new Date(restriction.unavailableTo)) })) {
        return true;
      }
    }
  }
  return false;
}

// Helper to calculate actual sets installed based on requests and available stock
function calculateActualSetInstallations(
    requested10m: number,
    requested6m: number,
    stock10m: number,
    stock6m: number,
    useBuffer: boolean = true
): { actualInstalled10m: number; actualInstalled6m: number; setsInstalled: number } {
    const buffer = useBuffer ? STOCK_BUFFER : 0;
    const availableStock10m = Math.max(0, stock10m - buffer);
    const availableStock6m = Math.max(0, stock6m - buffer);

    const desiredSetsBasedOn10mRequest = requested10m;
    const desiredSetsBasedOn6mRequest = requested6m;
    const maxPossibleSetsFromRequest = Math.min(desiredSetsBasedOn10mRequest, desiredSetsBasedOn6mRequest);

    const maxPossibleSetsFromStock10m = availableStock10m;
    const maxPossibleSetsFromStock6m = availableStock6m;
    const maxPossibleSetsFromStock = Math.min(maxPossibleSetsFromStock10m, maxPossibleSetsFromStock6m);

    const setsInstalled = Math.min(maxPossibleSetsFromRequest, maxPossibleSetsFromStock);

    return {
        actualInstalled10m: setsInstalled * 1,
        actualInstalled6m: setsInstalled * 1,
        setsInstalled,
    };
}


interface DetailedInternalSimulationResult {
  immediateShortage10m: number;
  immediateShortage6m: number;
  futureDaysWithShortage: number;
  firstFutureShortageDay10m: number | null;
  firstFutureShortageDay6m: number | null;
  futureTotalShortage10m: number;
  futureTotalShortage6m: number;
  stock10mAfterDecisionDayInstall: number;
  stock6mAfterDecisionDayInstall: number;
  decisionDayProduces10m: number;
  decisionDayProduces6m: number;
  decisionDayChosenPlanId?: string;
}


function runDetailedInternalSimulation(
  baseOps: DailyOperation[],
  decisionDayIndex: number,
  planToApplyForDecisionDay: ProductionPlanOption | null,
  manualProd10m: number | null,
  manualProd6m: number | null,
  allProductionOptions: ProductionPlanOption[],
  productionRestrictions: ProductionRestriction[],
  initialStock10mAtDecisionDay: number,
  initialStock6mAtDecisionDay: number
): DetailedInternalSimulationResult {

  let currentSimStock10m = initialStock10mAtDecisionDay;
  let currentSimStock6m = initialStock6mAtDecisionDay;

  const decisionDayOp = baseOps[decisionDayIndex];
  const decisionDayDate = decisionDayOp.actualDate;

  let decisionDayProduces10m = 0;
  let decisionDayProduces6m = 0;
  let decisionDayChosenPlanId = planToApplyForDecisionDay?.id;

  if (manualProd10m !== null && manualProd6m !== null) { // Manual override takes precedence
    decisionDayProduces10m = isProductionRestricted("10m", decisionDayDate, productionRestrictions) ? 0 : manualProd10m;
    decisionDayProduces6m = isProductionRestricted("6m", decisionDayDate, productionRestrictions) ? 0 : manualProd6m;
    decisionDayChosenPlanId = undefined; // Mark as manual
    const matchingPlan = allProductionOptions.find(p => p.produces10m === manualProd10m && p.produces6m === manualProd6m);
    if (matchingPlan && !isProductionRestricted("10m", decisionDayDate, productionRestrictions) && !isProductionRestricted("6m", decisionDayDate, productionRestrictions)) {
        decisionDayChosenPlanId = matchingPlan.id;
    }
  } else if (planToApplyForDecisionDay && !decisionDayOp.isSunday) {
    decisionDayProduces10m = isProductionRestricted("10m", decisionDayDate, productionRestrictions) ? 0 : planToApplyForDecisionDay.produces10m;
    decisionDayProduces6m = isProductionRestricted("6m", decisionDayDate, productionRestrictions) ? 0 : planToApplyForDecisionDay.produces6m;
  }


  let stock10mBeforeInstall_DD = currentSimStock10m + decisionDayProduces10m;
  let stock6mBeforeInstall_DD = currentSimStock6m + decisionDayProduces6m;

  const { actualInstalled10m: actualInstalled10m_DD, actualInstalled6m: actualInstalled6m_DD } =
    calculateActualSetInstallations(
      decisionDayOp.installed10m,
      decisionDayOp.installed6m,
      stock10mBeforeInstall_DD,
      stock6mBeforeInstall_DD,
      true // For planning, always use the buffer
    );

  const immediateShortage10m = decisionDayOp.installed10m - actualInstalled10m_DD;
  const immediateShortage6m = decisionDayOp.installed6m - actualInstalled6m_DD;

  currentSimStock10m = stock10mBeforeInstall_DD - actualInstalled10m_DD;
  currentSimStock6m = stock6mBeforeInstall_DD - actualInstalled6m_DD;

  const stock10mAfterDecisionDayInstall = currentSimStock10m;
  const stock6mAfterDecisionDayInstall = currentSimStock6m;

  let futureDaysWithShortage = 0;
  let firstFutureShortageDay10m: number | null = null;
  let firstFutureShortageDay6m: number | null = null;
  let futureTotalShortage10m = 0;
  let futureTotalShortage6m = 0;

  for (let i = decisionDayIndex + 1; i < baseOps.length; i++) {
    const futureDayOp = baseOps[i];
    const futureDayDate = futureDayOp.actualDate;
    let bestPlanForFutureDay: ProductionPlanOption | null = null;

    let minShort10 = Infinity;
    let minShort6 = Infinity;

    let isFutureDayManuallySet = futureDayOp.chosenProductionPlanId === undefined && (futureDayOp.produced10m > 0 || futureDayOp.produced6m > 0);
    let futureDayManualProd10m = isFutureDayManuallySet ? futureDayOp.produced10m : 0;
    let futureDayManualProd6m = isFutureDayManuallySet ? futureDayOp.produced6m : 0;


    if (futureDayOp.isSunday || (allProductionOptions.length === 0 && !isFutureDayManuallySet)) {
      // No production or no options unless manually set
    } else if (isFutureDayManuallySet) {
        // Use manual values, no optimization needed for this day's production choice
    } else { // Optimize for this future day
      const futureDayOptions = [null, ...allProductionOptions];
      for (const candidateFuturePlan of futureDayOptions) {
        let futProduces10m = 0;
        let futProduces6m = 0;
        if (candidateFuturePlan) {
          futProduces10m = isProductionRestricted("10m", futureDayDate, productionRestrictions) ? 0 : candidateFuturePlan.produces10m;
          futProduces6m = isProductionRestricted("6m", futureDayDate, productionRestrictions) ? 0 : candidateFuturePlan.produces6m;
        }

        const stock10BeforeInstall_FD = currentSimStock10m + futProduces10m;
        const stock6BeforeInstall_FD = currentSimStock6m + futProduces6m;

        const { actualInstalled10m: inst10mThisOpt, actualInstalled6m: inst6mThisOpt } =
            calculateActualSetInstallations(
                futureDayOp.installed10m,
                futureDayOp.installed6m,
                stock10BeforeInstall_FD,
                stock6BeforeInstall_FD,
                true // For planning, always use the buffer
            );

        const short10ThisOpt = futureDayOp.installed10m - inst10mThisOpt;
        const short6ThisOpt = futureDayOp.installed6m - inst6mThisOpt;

        let isBetterOpt = false;
        if (short10ThisOpt < minShort10) {
          isBetterOpt = true;
        } else if (short10ThisOpt === minShort10) {
          if (short6ThisOpt < minShort6) {
            isBetterOpt = true;
          } else if (short6ThisOpt === minShort6) {
            const currentBestProd10 = bestPlanForFutureDay ? (isProductionRestricted("10m", futureDayDate, productionRestrictions) ? 0 : bestPlanForFutureDay.produces10m) : 0;
            const currentBestProd6 = bestPlanForFutureDay ? (isProductionRestricted("6m", futureDayDate, productionRestrictions) ? 0 : bestPlanForFutureDay.produces6m) : 0;
            if (futProduces10m > currentBestProd10) isBetterOpt = true;
            else if (futProduces10m === currentBestProd10 && futProduces6m > currentBestProd6) isBetterOpt = true;
          }
        }
        if (isBetterOpt) {
          minShort10 = short10ThisOpt;
          minShort6 = short6ThisOpt;
          bestPlanForFutureDay = candidateFuturePlan;
        }
      }
    }

    let actualFutureDayProduces10m = 0;
    let actualFutureDayProduces6m = 0;

    if (isFutureDayManuallySet) {
        actualFutureDayProduces10m = isProductionRestricted("10m", futureDayDate, productionRestrictions) ? 0 : futureDayManualProd10m;
        actualFutureDayProduces6m = isProductionRestricted("6m", futureDayDate, productionRestrictions) ? 0 : futureDayManualProd6m;
    } else if (bestPlanForFutureDay && !futureDayOp.isSunday) {
      actualFutureDayProduces10m = isProductionRestricted("10m", futureDayDate, productionRestrictions) ? 0 : bestPlanForFutureDay.produces10m;
      actualFutureDayProduces6m = isProductionRestricted("6m", futureDayDate, productionRestrictions) ? 0 : bestPlanForFutureDay.produces6m;
    }

    currentSimStock10m += actualFutureDayProduces10m;
    currentSimStock6m += actualFutureDayProduces6m;

    const { actualInstalled10m: actualInstalled10m_FD, actualInstalled6m: actualInstalled6m_FD } =
        calculateActualSetInstallations(
            futureDayOp.installed10m,
            futureDayOp.installed6m,
            currentSimStock10m,
            currentSimStock6m,
            true // For planning, always use the buffer
        );

    const short10_FD = futureDayOp.installed10m - actualInstalled10m_FD;
    const short6_FD = futureDayOp.installed6m - actualInstalled6m_FD;

    if (short10_FD > 0) {
      if (!firstFutureShortageDay10m) firstFutureShortageDay10m = futureDayOp.projectDayNumber;
      futureTotalShortage10m += short10_FD;
    }
    if (short6_FD > 0) {
      if (!firstFutureShortageDay6m) firstFutureShortageDay6m = futureDayOp.projectDayNumber;
      futureTotalShortage6m += short6_FD;
    }
    if (short10_FD > 0 || short6_FD > 0) {
      futureDaysWithShortage++;
    }
    currentSimStock10m -= actualInstalled10m_FD;
    currentSimStock6m -= actualInstalled6m_FD;
  }

  return {
    immediateShortage10m,
    immediateShortage6m,
    futureDaysWithShortage,
    firstFutureShortageDay10m,
    firstFutureShortageDay6m,
    futureTotalShortage10m,
    futureTotalShortage6m,
    stock10mAfterDecisionDayInstall,
    stock6mAfterDecisionDayInstall,
    decisionDayProduces10m,
    decisionDayProduces6m,
    decisionDayChosenPlanId: decisionDayChosenPlanId,
  };
}

function runStockTieBreakers(
  simResult: DetailedInternalSimulationResult,
  bestSimResult: DetailedInternalSimulationResult,
  currentGlobalStock10m: number,
  currentGlobalStock6m: number
): boolean {
    // Emergency Production Heuristic: If one stock is at/below buffer and the other is not,
    // we must prioritize producing the low-stock item.
    const stock10mIsLow = currentGlobalStock10m <= STOCK_BUFFER;
    const stock6mIsLow = currentGlobalStock6m <= STOCK_BUFFER;

    // Case 1: Only 10m stock is low.
    if (stock10mIsLow && !stock6mIsLow) {
        // A plan that produces more 10m is better.
        if (simResult.decisionDayProduces10m > bestSimResult.decisionDayProduces10m) return true;
        if (simResult.decisionDayProduces10m < bestSimResult.decisionDayProduces10m) return false;
        // If 10m production is equal, prefer the one that produces less 6m to focus resources.
        if (simResult.decisionDayProduces6m < bestSimResult.decisionDayProduces6m) return true;
        if (simResult.decisionDayProduces6m > bestSimResult.decisionDayProduces6m) return false;
    }

    // Case 2: Only 6m stock is low.
    if (stock6mIsLow && !stock10mIsLow) {
        // A plan that produces more 6m is better.
        if (simResult.decisionDayProduces6m > bestSimResult.decisionDayProduces6m) return true;
        if (simResult.decisionDayProduces6m < bestSimResult.decisionDayProduces6m) return false;
        // If 6m production is equal, prefer the one that produces less 10m to focus resources.
        if (simResult.decisionDayProduces10m < bestSimResult.decisionDayProduces10m) return true;
        if (simResult.decisionDayProduces10m > bestSimResult.decisionDayProduces10m) return false;
    }

    // If we reach here, it means either both stocks are low/critical, or neither are.
    // In this situation, we fall back to the standard tie-breakers to ensure overall health.
    const candStock10mAfterDD = simResult.stock10mAfterDecisionDayInstall;
    const candStock6mAfterDD = simResult.stock6mAfterDecisionDayInstall;
    const bestStock10mAfterDD = bestSimResult.stock10mAfterDecisionDayInstall;
    const bestStock6mAfterDD = bestSimResult.stock6mAfterDecisionDayInstall;

    // Standard Tie-Breaker 1: Strongly avoid dipping into buffer post-installation.
    const candDipsIntoBuffer = candStock10mAfterDD < STOCK_BUFFER || candStock6mAfterDD < STOCK_BUFFER;
    const bestDipsIntoBuffer = bestStock10mAfterDD < STOCK_BUFFER || bestStock6mAfterDD < STOCK_BUFFER;

    if (bestDipsIntoBuffer && !candDipsIntoBuffer) return true;
    if (!bestDipsIntoBuffer && candDipsIntoBuffer) return false;

    // Standard Tie-Breaker 2: Maximize the minimum stock level.
    const candMinStock = Math.min(candStock10mAfterDD, candStock6mAfterDD);
    const bestMinStock = Math.min(bestStock10mAfterDD, bestStock6mAfterDD);

    if (candMinStock > bestMinStock) return true;
    if (candMinStock < bestMinStock) return false;

    // Standard Tie-Breaker 3: Maximize the total combined stock.
    const candTotalStock = candStock10mAfterDD + candStock6mAfterDD;
    const bestTotalStock = bestStock10mAfterDD + bestStock6mAfterDD;

    if (candTotalStock > bestTotalStock) return true;
    if (candTotalStock < bestTotalStock) return false;

    return false; // All else being equal, the existing plan is fine.
}


export function calculateOptimalProductionPlan(
  baseOperations: DailyOperation[],
  productionOptions: ProductionPlanOption[],
  productionRestrictions: ProductionRestriction[],
  initialStock10m: number,
  initialStock6m: number,
  target10mNeeded: number,
  target6mNeeded: number,
  optimizationStrategy: 'performance' | 'consistency' = 'performance'
): { optimalPlan: DailyOperation[]; } {

  const optimalPlanResult: DailyOperation[] = baseOperations.map(op => ({ ...op }));
  let currentGlobalStock10m = initialStock10m;
  let currentGlobalStock6m = initialStock6m;
  let totalProduced10m = 0;
  let totalProduced6m = 0;

  for (let i = 0; i < optimalPlanResult.length; i++) {
    const decisionDay = optimalPlanResult[i];
    const decisionDayDate = decisionDay.actualDate;
    const previousDayPlanId = i > 0 ? optimalPlanResult[i - 1].chosenProductionPlanId : undefined;

    const isManuallyOverridden = decisionDay.chosenProductionPlanId === undefined &&
                                 (decisionDay.produced10m > 0 || decisionDay.produced6m > 0);

    if (decisionDay.isSunday) {
      decisionDay.produced10m = 0;
      decisionDay.produced6m = 0;
      decisionDay.chosenProductionPlanId = undefined;
    } else if (isManuallyOverridden) {
      decisionDay.produced10m = isProductionRestricted("10m", decisionDayDate, productionRestrictions) ? 0 : decisionDay.produced10m;
      decisionDay.produced6m = isProductionRestricted("6m", decisionDayDate, productionRestrictions) ? 0 : decisionDay.produced6m;
      const matchingPlan = productionOptions.find(p => p.produces10m === decisionDay.produced10m && p.produces6m === decisionDay.produced6m);
      if (matchingPlan && !isProductionRestricted("10m", decisionDayDate, productionRestrictions) && !isProductionRestricted("6m", decisionDayDate, productionRestrictions)) {
        decisionDay.chosenProductionPlanId = matchingPlan.id;
      } else {
        decisionDay.chosenProductionPlanId = undefined;
      }

    } else if (productionOptions.length === 0) {
        decisionDay.produced10m = 0;
        decisionDay.produced6m = 0;
        decisionDay.chosenProductionPlanId = undefined;
    } else {
      let bestPlanForDecisionDay: ProductionPlanOption | null = null;
      let bestSimResult: DetailedInternalSimulationResult | null = null;

      const hasMetTarget10m = (initialStock10m + totalProduced10m) >= target10mNeeded;
      const hasMetTarget6m = (initialStock6m + totalProduced6m) >= target6mNeeded;

      const plansToEvaluate = [null, ...productionOptions].filter(plan => {
        if (!plan) return true; // Always consider "do nothing"
        if (hasMetTarget10m && plan.produces10m > 0) return false;
        if (hasMetTarget6m && plan.produces6m > 0) return false;
        return true;
      });

      for (const candidatePlan of plansToEvaluate) {
        const simResult = runDetailedInternalSimulation(
          optimalPlanResult,
          i,
          candidatePlan,
          null, null,
          productionOptions,
          productionRestrictions,
          currentGlobalStock10m,
          currentGlobalStock6m
        );

        if (!bestSimResult) {
          bestSimResult = simResult;
          bestPlanForDecisionDay = candidatePlan;
        } else {
          let candidateIsBetter = false;

          if (simResult.immediateShortage10m < bestSimResult.immediateShortage10m) candidateIsBetter = true;
          else if (simResult.immediateShortage10m === bestSimResult.immediateShortage10m) {
            if (simResult.immediateShortage6m < bestSimResult.immediateShortage6m) candidateIsBetter = true;
            else if (simResult.immediateShortage6m === bestSimResult.immediateShortage6m) {
              const canProceedToFutureMetrics = (bestSimResult.immediateShortage10m === 0 && bestSimResult.immediateShortage6m === 0 &&
                                                 simResult.immediateShortage10m === 0 && simResult.immediateShortage6m === 0) ||
                                                (bestSimResult.immediateShortage10m > 0 || bestSimResult.immediateShortage6m > 0);

              if (canProceedToFutureMetrics) {
                const simFuture10Day = simResult.firstFutureShortageDay10m ?? Infinity;
                const bestFuture10Day = bestSimResult.firstFutureShortageDay10m ?? Infinity;
                if (simFuture10Day > bestFuture10Day) candidateIsBetter = true;
                else if (simFuture10Day === bestFuture10Day) {
                  const simFuture6Day = simResult.firstFutureShortageDay6m ?? Infinity;
                  const bestFuture6Day = bestSimResult.firstFutureShortageDay6m ?? Infinity;
                  if (simFuture6Day > bestFuture6Day) candidateIsBetter = true;
                  else if (simFuture6Day === bestFuture6Day) {
                    if (simResult.futureTotalShortage10m < bestSimResult.futureTotalShortage10m) candidateIsBetter = true;
                    else if (simResult.futureTotalShortage10m === bestSimResult.futureTotalShortage10m) {
                      if (simResult.futureTotalShortage6m < bestSimResult.futureTotalShortage6m) candidateIsBetter = true;
                      else if (simResult.futureTotalShortage6m === bestSimResult.futureTotalShortage6m) {
                        // All shortage metrics are equal. Time for tie-breakers.
                        
                        // Consistency Tie-Breaker
                        if (optimizationStrategy === 'consistency' && previousDayPlanId) {
                            const candidatePlanId = candidatePlan?.id;
                            const bestPlanId = bestPlanForDecisionDay?.id;

                            const candidateMatchesPrevious = !!candidatePlanId && candidatePlanId === previousDayPlanId;
                            const bestMatchesPrevious = !!bestPlanId && bestPlanId === previousDayPlanId;

                            if (candidateMatchesPrevious && !bestMatchesPrevious) {
                                candidateIsBetter = true;
                            } else if (!candidateMatchesPrevious && bestMatchesPrevious) {
                                candidateIsBetter = false; // Current best is already better
                            } else {
                                // Both match or both don't match, proceed to stock tie-breakers
                                candidateIsBetter = runStockTieBreakers(simResult, bestSimResult, currentGlobalStock10m, currentGlobalStock6m);
                            }
                        } else {
                            // Performance mode or first day, proceed to stock tie-breakers
                            candidateIsBetter = runStockTieBreakers(simResult, bestSimResult, currentGlobalStock10m, currentGlobalStock6m);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          if (candidateIsBetter) {
            bestSimResult = simResult;
            bestPlanForDecisionDay = candidatePlan;
          }
        }
      }

      if (bestSimResult) {
        let finalProd10m = bestSimResult.decisionDayProduces10m;
        let finalProd6m = bestSimResult.decisionDayProduces6m;
        let planId = bestSimResult.decisionDayChosenPlanId;

        const remaining10mNeeded = Math.max(0, target10mNeeded - (initialStock10m + totalProduced10m));
        const remaining6mNeeded = Math.max(0, target6mNeeded - (initialStock6m + totalProduced6m));

        if (finalProd10m > 0 && finalProd10m > remaining10mNeeded) {
            finalProd10m = remaining10mNeeded;
        }
        if (finalProd6m > 0 && finalProd6m > remaining6mNeeded) {
            finalProd6m = remaining6mNeeded;
        }

        decisionDay.produced10m = finalProd10m;
        decisionDay.produced6m = finalProd6m;
        decisionDay.chosenProductionPlanId = planId;
      } else {
        decisionDay.produced10m = 0;
        decisionDay.produced6m = 0;
        decisionDay.chosenProductionPlanId = undefined;
      }
    }

    totalProduced10m += decisionDay.produced10m;
    totalProduced6m += decisionDay.produced6m;

    currentGlobalStock10m += decisionDay.produced10m;
    currentGlobalStock6m += decisionDay.produced6m;

    const { actualInstalled10m: actualInstalled10m_Global, actualInstalled6m: actualInstalled6m_Global } =
        calculateActualSetInstallations(
            decisionDay.installed10m,
            decisionDay.installed6m,
            currentGlobalStock10m,
            currentGlobalStock6m,
            false // Use real stock for global state update
        );

    currentGlobalStock10m -= actualInstalled10m_Global;
    currentGlobalStock6m -= actualInstalled6m_Global;
  }
  return { optimalPlan: optimalPlanResult };
}

export function runFullSimulation(
  dailyOperations: DailyOperation[],
  initialStock10m: number,
  initialStock6m: number,
  target10mNeeded: number,
  target6mNeeded: number
): {
  simulationLog: SimulationLogEntry[];
  summary: SimulationSummary;
  firstShortageInfo: FirstShortageInfo;
} {
  const simulationLog: SimulationLogEntry[] = [];
  let currentStock10m = initialStock10m;
  let currentStock6m = initialStock6m;
  let totalActualInstalled10m = 0;
  let totalActualInstalled6m = 0;

  const firstShortageInfo: FirstShortageInfo = {};

  for (const op of dailyOperations) {
    const openingStock10m = currentStock10m;
    const openingStock6m = currentStock6m;

    currentStock10m += op.produced10m;
    currentStock6m += op.produced6m;

    const requestedInstall10m = op.installed10m;
    const requestedInstall6m = op.installed6m;

    const { actualInstalled10m, actualInstalled6m } =
        calculateActualSetInstallations(
            requestedInstall10m,
            requestedInstall6m,
            currentStock10m,
            currentStock6m,
            false // Final simulation uses real stock, not buffered stock
        );

    currentStock10m -= actualInstalled10m;
    currentStock6m -= actualInstalled6m;

    totalActualInstalled10m += actualInstalled10m;
    totalActualInstalled6m += actualInstalled6m;

    const shortage10m = requestedInstall10m - actualInstalled10m;
    const shortage6m = requestedInstall6m - actualInstalled6m;


    if (shortage10m > 0 && !firstShortageInfo.day10m) {
      firstShortageInfo.day10m = op.projectDayNumber;
      firstShortageInfo.date10m = op.actualDate;
    }
    if (shortage6m > 0 && !firstShortageInfo.day6m) {
      firstShortageInfo.day6m = op.projectDayNumber;
      firstShortageInfo.date6m = op.actualDate;
    }

    simulationLog.push({
      ...op,
      openingStock10m,
      openingStock6m,
      requestedInstall10m,
      requestedInstall6m,
      actualInstalled10m,
      actualInstalled6m,
      closingStock10m: currentStock10m,
      closingStock6m: currentStock6m,
      shortage10m,
      shortage6m,
    });

    // Check if both targets have been met or exceeded
    if (totalActualInstalled10m >= target10mNeeded && totalActualInstalled6m >= target6mNeeded) {
      break; // Stop the simulation
    }
  }

  const targetShortfall10m = Math.max(0, target10mNeeded - totalActualInstalled10m);
  const targetShortfall6m = Math.max(0, target6mNeeded - totalActualInstalled6m);

  const summary: SimulationSummary = {
    totalActualInstalled10m,
    totalActualInstalled6m,
    targetShortfall10m,
    targetShortfall6m,
    meetsTarget10m: totalActualInstalled10m >= target10mNeeded,
    meetsTarget6m: totalActualInstalled6m >= target6mNeeded,
  };

  return { simulationLog, summary, firstShortageInfo };
}