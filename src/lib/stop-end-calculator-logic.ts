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

// Helper to calculate actual sets installed based on requests and stock
function calculateActualSetInstallations(
    requested10m: number,
    requested6m: number,
    stock10m: number,
    stock6m: number
): { actualInstalled10m: number; actualInstalled6m: number; setsInstalled: number } {
    const desiredSetsBasedOn10mRequest = requested10m;
    const desiredSetsBasedOn6mRequest = requested6m;
    const maxPossibleSetsFromRequest = Math.min(desiredSetsBasedOn10mRequest, desiredSetsBasedOn6mRequest);

    const maxPossibleSetsFromStock10m = stock10m;
    const maxPossibleSetsFromStock6m = stock6m;
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
      stock6mBeforeInstall_DD
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
                stock6BeforeInstall_FD
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
            currentSimStock6m
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


export function calculateOptimalProductionPlan(
  baseOperations: DailyOperation[],
  productionOptions: ProductionPlanOption[],
  productionRestrictions: ProductionRestriction[],
  initialStock10m: number,
  initialStock6m: number,
  target10mNeeded: number,
  target6mNeeded: number
): { optimalPlan: DailyOperation[]; } {

  const optimalPlanResult: DailyOperation[] = baseOperations.map(op => ({ ...op }));
  let currentGlobalStock10m = initialStock10m;
  let currentGlobalStock6m = initialStock6m;
  let totalProduced10m = 0;
  let totalProduced6m = 0;

  for (let i = 0; i < optimalPlanResult.length; i++) {
    const decisionDay = optimalPlanResult[i];
    const decisionDayDate = decisionDay.actualDate;

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
                        // All shortage metrics are equal, now apply stock-based tie-breakers
                        const candStock10mAfterDD = simResult.stock10mAfterDecisionDayInstall;
                        const candStock6mAfterDD = simResult.stock6mAfterDecisionDayInstall;
                        const bestStock10mAfterDD = bestSimResult.stock10mAfterDecisionDayInstall;
                        const bestStock6mAfterDD = bestSimResult.stock6mAfterDecisionDayInstall;

                        // 1. Strongly avoid zero stock
                        const candHasZeroStock = candStock10mAfterDD === 0 || candStock6mAfterDD === 0;
                        const bestHasZeroStock = bestStock10mAfterDD === 0 || bestStock6mAfterDD === 0;

                        if (bestHasZeroStock && !candHasZeroStock) {
                            candidateIsBetter = true;
                        } else if (!bestHasZeroStock && candHasZeroStock) {
                            candidateIsBetter = false; // Current best is already better
                        } else { // Either both have zero stock, or neither does. Proceed to next tie-breaker.
                            // 2. Maximize minimum stock
                            const candMinStock = Math.min(candStock10mAfterDD, candStock6mAfterDD);
                            const bestMinStock = Math.min(bestStock10mAfterDD, bestStock6mAfterDD);

                            if (candMinStock > bestMinStock) {
                                candidateIsBetter = true;
                            } else if (candMinStock === bestMinStock) {
                                // 3. Maximize total stock
                                const candTotalStock = candStock10mAfterDD + candStock6mAfterDD;
                                const bestTotalStock = bestStock10mAfterDD + bestStock6mAfterDD;

                                if (candTotalStock > bestTotalStock) {
                                    candidateIsBetter = true;
                                } else if (candTotalStock === bestTotalStock) {
                                    // 4. Address global scarcity (prefer producing the item that was lower before today's production)
                                    const candProd10 = simResult.decisionDayProduces10m;
                                    const candProd6 = simResult.decisionDayProduces6m;
                                    const bestProd10 = bestSimResult.decisionDayProduces10m;
                                    const bestProd6 = bestSimResult.decisionDayProduces6m;

                                    if (currentGlobalStock10m < currentGlobalStock6m) { // 10m is scarcer globally
                                        if (candProd10 > bestProd10) candidateIsBetter = true;
                                        else if (candProd10 === bestProd10 && candProd6 > bestProd6) candidateIsBetter = true; // Secondary: produce more of other if primary is same
                                    } else if (currentGlobalStock6m < currentGlobalStock10m) { // 6m is scarcer globally
                                        if (candProd6 > bestProd6) candidateIsBetter = true;
                                        else if (candProd6 === bestProd6 && candProd10 > bestProd10) candidateIsBetter = true;
                                    } else { // Stocks were equal globally, prefer plan that produces more overall, then more 10m
                                        if (candProd10 + candProd6 > bestProd10 + bestProd6) candidateIsBetter = true;
                                        else if (candProd10 + candProd6 === bestProd10 + bestProd6) {
                                            if (candProd10 > bestProd10) candidateIsBetter = true;
                                        }
                                    }
                                }
                            }
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
        decisionDay.produced10m = bestSimResult.decisionDayProduces10m;
        decisionDay.produced6m = bestSimResult.decisionDayProduces6m;
        decisionDay.chosenProductionPlanId = bestSimResult.decisionDayChosenPlanId;
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
            currentGlobalStock6m
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
            currentStock6m
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