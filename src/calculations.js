/**
 * WEIAP - Rüzgar Enerjisi Hesaplama Motoru (Optimized)
 * Web Worker desteği ile ağır hesaplamalar
 */

// ========================
// SABİTLER
// ========================

export const CONSTANTS = {
     R_SPECIFIC: 287.058,
     STD_AIR_DENSITY: 1.225,
     HOURS_PER_YEAR: 8760
};

export const LOSS_FACTORS = {
     electrical: 0.02,
     availability: 0.03,
     wakeEffect: 0.05,
     transformer: 0.015,
     other: 0.015
};

// ========================
// TÜRBİN MODELLERİ
// ========================

export const TURBINES = {
     generic_2mw: {
          name: 'Genel 2 MW',
          ratedPower: 2000,
          hubHeight: 80,
          rotorDiameter: 90,
          cutIn: 3.5,
          ratedSpeed: 12,
          cutOut: 25,
          powerCurve: [
               [0, 0], [3, 0], [3.5, 25], [4, 82], [5, 174], [6, 321],
               [7, 532], [8, 815], [9, 1180], [10, 1580], [11, 1890],
               [12, 2000], [13, 2000], [14, 2000], [15, 2000], [16, 2000],
               [17, 2000], [18, 2000], [19, 2000], [20, 2000], [21, 2000],
               [22, 2000], [23, 2000], [24, 2000], [25, 2000], [25.1, 0]
          ]
     },
     vestas_v110: {
          name: 'Vestas V110-2.0',
          ratedPower: 2000,
          hubHeight: 95,
          rotorDiameter: 110,
          cutIn: 3.0,
          ratedSpeed: 11.5,
          cutOut: 25,
          powerCurve: [
               [0, 0], [2.5, 0], [3, 20], [4, 115], [5, 248], [6, 442],
               [7, 710], [8, 1050], [9, 1430], [10, 1780], [11, 1960],
               [11.5, 2000], [12, 2000], [13, 2000], [14, 2000], [15, 2000],
               [16, 2000], [17, 2000], [18, 2000], [19, 2000], [20, 2000],
               [21, 2000], [22, 2000], [23, 2000], [24, 2000], [25, 2000], [25.1, 0]
          ]
     },
     vestas_v150: {
          name: 'Vestas V150-4.2',
          ratedPower: 4200,
          hubHeight: 105,
          rotorDiameter: 150,
          cutIn: 3.0,
          ratedSpeed: 12.5,
          cutOut: 25,
          powerCurve: [
               [0, 0], [2.5, 0], [3, 50], [4, 220], [5, 520], [6, 920],
               [7, 1480], [8, 2180], [9, 2980], [10, 3680], [11, 4050],
               [12, 4180], [12.5, 4200], [13, 4200], [14, 4200], [15, 4200],
               [16, 4200], [17, 4200], [18, 4200], [19, 4200], [20, 4200],
               [21, 4200], [22, 4200], [23, 4200], [24, 4200], [25, 4200], [25.1, 0]
          ]
     }
};

// ========================
// HESAPLAMA FONKSİYONLARI
// ========================

export function kmhToMs(v) {
     return v / 3.6;
}

export function calculateAirDensity(tempC, pressureHpa) {
     const T = tempC + 273.15;
     const P = pressureHpa * 100;
     return P / (CONSTANTS.R_SPECIFIC * T);
}

export function calculateWindShear(v1, h1, v2, h2, targetHeight) {
     let alpha = 0.14;

     if (v1 > 0 && v2 > 0 && v1 !== v2) {
          alpha = Math.log(v2 / v1) / Math.log(h2 / h1);
          alpha = Math.max(0.05, Math.min(0.5, alpha));
     }

     const windSpeed = v2 * Math.pow(targetHeight / h2, alpha);
     return { windSpeed, alpha };
}

export function interpolatePowerCurve(windSpeed, powerCurve) {
     if (windSpeed <= powerCurve[0][0]) return 0;
     if (windSpeed >= powerCurve[powerCurve.length - 1][0]) return 0;

     for (let i = 0; i < powerCurve.length - 1; i++) {
          const [v1, p1] = powerCurve[i];
          const [v2, p2] = powerCurve[i + 1];

          if (windSpeed >= v1 && windSpeed < v2) {
               const ratio = (windSpeed - v1) / (v2 - v1);
               return p1 + ratio * (p2 - p1);
          }
     }
     return 0;
}

export function getPowerOutput(windSpeed, turbineKey, airDensity) {
     const turbine = TURBINES[turbineKey];
     if (!turbine) return 0;

     const curveOutput = interpolatePowerCurve(windSpeed, turbine.powerCurve);
     return curveOutput * (airDensity / CONSTANTS.STD_AIR_DENSITY);
}

export function calculateAEP(hourlyData, turbineKey) {
     const turbine = TURBINES[turbineKey];
     if (!turbine || !hourlyData.length) {
          return { grossAEP: 0, netAEP: 0, capacityFactor: 0, avgPower: 0 };
     }

     let totalEnergy = 0;

     for (let i = 0; i < hourlyData.length; i++) {
          const hour = hourlyData[i];
          totalEnergy += getPowerOutput(hour.windSpeed, turbineKey, hour.airDensity);
     }

     const years = hourlyData.length / CONSTANTS.HOURS_PER_YEAR;
     const grossAEP = (totalEnergy / years) / 1000;

     const totalLossFactor = Object.values(LOSS_FACTORS).reduce((a, b) => a + b, 0);
     const netAEP = grossAEP * (1 - totalLossFactor);

     const maxPossibleEnergy = turbine.ratedPower * CONSTANTS.HOURS_PER_YEAR / 1000;
     const capacityFactor = netAEP / maxPossibleEnergy;
     const avgPower = totalEnergy / hourlyData.length;

     return {
          grossAEP: Math.round(grossAEP),
          netAEP: Math.round(netAEP),
          capacityFactor,
          avgPower: Math.round(avgPower)
     };
}

export function calculateLCOE(capex, opexPerYear, netAEP, lifetime = 20, discountRate = 0.08) {
     if (netAEP <= 0) return Infinity;

     let totalCost = capex;
     let totalEnergy = 0;

     for (let year = 1; year <= lifetime; year++) {
          const df = Math.pow(1 + discountRate, year);
          totalCost += opexPerYear / df;
          totalEnergy += netAEP / df;
     }

     return totalCost / totalEnergy;
}

export function calculatePayback(capex, annualRevenue, opexPerYear) {
     const net = annualRevenue - opexPerYear;
     return net > 0 ? capex / net : Infinity;
}

export function calculateAnnualRevenue(netAEP, electricityPrice) {
     return netAEP * 1000 * electricityPrice;
}

export function fillDataGaps(data) {
     const result = [...data];

     for (let i = 0; i < result.length; i++) {
          if (result[i] === null || result[i] === undefined) {
               let prevIdx = i - 1;
               let nextIdx = i + 1;

               while (prevIdx >= 0 && result[prevIdx] == null) prevIdx--;
               while (nextIdx < result.length && result[nextIdx] == null) nextIdx++;

               if (prevIdx >= 0 && nextIdx < result.length) {
                    result[i] = result[prevIdx] + ((i - prevIdx) / (nextIdx - prevIdx)) * (result[nextIdx] - result[prevIdx]);
               } else if (prevIdx >= 0) {
                    result[i] = result[prevIdx];
               } else if (nextIdx < result.length) {
                    result[i] = result[nextIdx];
               }
          }
     }

     return result;
}

export function calculateWindRose(directions, speeds) {
     const sectors = 16;
     const sectorSize = 360 / sectors;
     const rose = Array(sectors).fill(null).map(() => ({ count: 0, totalSpeed: 0 }));

     for (let i = 0; i < directions.length; i++) {
          if (directions[i] != null && speeds[i] != null) {
               const idx = Math.floor(((directions[i] + sectorSize / 2) % 360) / sectorSize);
               rose[idx].count++;
               rose[idx].totalSpeed += speeds[i];
          }
     }

     const total = rose.reduce((sum, s) => sum + s.count, 0);
     const labels = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];

     return rose.map((sector, i) => ({
          direction: i * sectorSize,
          label: labels[i],
          frequency: total > 0 ? sector.count / total : 0,
          avgSpeed: sector.count > 0 ? sector.totalSpeed / sector.count : 0
     }));
}
