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
// ÜLKE BAZLI ELEKTRİK FİYATLARI ($/kWh)
// Kaynak: GlobalPetrolPrices.com (2024 Q4)
// Konut elektrik fiyatları, vergiler dahil
// ========================

export const ELECTRICITY_PRICES = {
     // AVRUPA
     DE: 0.38,  // Almanya
     BE: 0.35,  // Belçika
     DK: 0.36,  // Danimarka
     IE: 0.32,  // İrlanda
     GB: 0.34,  // İngiltere
     NL: 0.30,  // Hollanda
     IT: 0.28,  // İtalya
     AT: 0.27,  // Avusturya
     ES: 0.22,  // İspanya
     PT: 0.21,  // Portekiz
     FR: 0.25,  // Fransa
     SE: 0.24,  // İsveç
     CH: 0.23,  // İsviçre
     NO: 0.18,  // Norveç
     FI: 0.19,  // Finlandiya
     PL: 0.17,  // Polonya
     CZ: 0.22,  // Çekya
     SK: 0.18,  // Slovakya
     HU: 0.11,  // Macaristan
     RO: 0.14,  // Romanya
     BG: 0.12,  // Bulgaristan
     GR: 0.19,  // Yunanistan
     HR: 0.15,  // Hırvatistan
     SI: 0.18,  // Slovenya
     RS: 0.08,  // Sırbistan
     BA: 0.09,  // Bosna Hersek
     AL: 0.10,  // Arnavutluk
     MK: 0.09,  // K. Makedonya
     MT: 0.13,  // Malta
     CY: 0.24,  // Kıbrıs
     LU: 0.21,  // Lüksemburg
     EE: 0.18,  // Estonya
     LV: 0.19,  // Letonya
     LT: 0.17,  // Litvanya
     IS: 0.14,  // İzlanda
     UA: 0.05,  // Ukrayna
     BY: 0.06,  // Belarus
     MD: 0.11,  // Moldova

     // TÜRKİYE VE ORTA DOĞU
     TR: 0.09,  // Türkiye
     IL: 0.17,  // İsrail
     JO: 0.11,  // Ürdün
     SA: 0.05,  // Suudi Arabistan
     AE: 0.08,  // BAE
     QA: 0.03,  // Katar
     KW: 0.02,  // Kuveyt
     BH: 0.03,  // Bahreyn
     OM: 0.04,  // Umman
     LB: 0.10,  // Lübnan
     SY: 0.02,  // Suriye
     IQ: 0.03,  // Irak
     IR: 0.01,  // İran

     // ASYA
     CN: 0.09,  // Çin
     JP: 0.23,  // Japonya
     KR: 0.11,  // Güney Kore
     TW: 0.10,  // Tayvan
     HK: 0.15,  // Hong Kong
     SG: 0.18,  // Singapur
     MY: 0.06,  // Malezya
     TH: 0.11,  // Tayland
     VN: 0.08,  // Vietnam
     PH: 0.18,  // Filipinler
     ID: 0.10,  // Endonezya
     IN: 0.07,  // Hindistan
     PK: 0.08,  // Pakistan
     BD: 0.07,  // Bangladeş
     LK: 0.11,  // Sri Lanka
     NP: 0.07,  // Nepal
     MM: 0.05,  // Myanmar
     KH: 0.18,  // Kamboçya
     LA: 0.06,  // Laos
     MN: 0.05,  // Moğolistan
     KZ: 0.04,  // Kazakistan
     UZ: 0.02,  // Özbekistan
     AZ: 0.04,  // Azerbaycan
     GE: 0.07,  // Gürcistan
     AM: 0.08,  // Ermenistan

     // AMERİKA
     US: 0.16,  // ABD
     CA: 0.13,  // Kanada
     MX: 0.09,  // Meksika
     BR: 0.15,  // Brezilya
     AR: 0.06,  // Arjantin
     CL: 0.14,  // Şili
     CO: 0.12,  // Kolombiya
     PE: 0.11,  // Peru
     VE: 0.01,  // Venezuela (sübvanse)
     EC: 0.09,  // Ekvador
     UY: 0.17,  // Uruguay
     PY: 0.05,  // Paraguay
     BO: 0.06,  // Bolivya
     CR: 0.14,  // Kosta Rika
     PA: 0.18,  // Panama
     GT: 0.15,  // Guatemala
     HN: 0.14,  // Honduras
     SV: 0.16,  // El Salvador
     NI: 0.21,  // Nikaragua
     DO: 0.14,  // Dominik C.
     CU: 0.02,  // Küba
     JM: 0.28,  // Jamaika
     TT: 0.04,  // Trinidad
     PR: 0.24,  // Porto Riko

     // AFRİKA
     ZA: 0.12,  // Güney Afrika
     EG: 0.04,  // Mısır
     NG: 0.05,  // Nijerya
     KE: 0.18,  // Kenya
     TZ: 0.10,  // Tanzanya
     UG: 0.16,  // Uganda
     GH: 0.13,  // Gana
     CI: 0.14,  // Fildişi S.
     SN: 0.19,  // Senegal
     CM: 0.08,  // Kamerun
     ET: 0.03,  // Etiyopya
     MA: 0.12,  // Fas
     DZ: 0.04,  // Cezayir
     TN: 0.07,  // Tunus
     LY: 0.01,  // Libya
     ZW: 0.10,  // Zimbabve
     ZM: 0.06,  // Zambiya
     MZ: 0.10,  // Mozambik
     AO: 0.06,  // Angola
     BW: 0.09,  // Botsvana
     NA: 0.14,  // Namibya
     MU: 0.12,  // Mauritius
     MG: 0.14,  // Madagaskar
     MW: 0.10,  // Malavi

     // OKYANUSYA
     AU: 0.22,  // Avustralya
     NZ: 0.18,  // Yeni Zelanda
     FJ: 0.16,  // Fiji
     PG: 0.20,  // Papua Y.G.

     // RUSYA VE BDT
     RU: 0.06,  // Rusya

     // VARSAYILAN
     DEFAULT: 0.15
};

// Ülke isimlerini içeren yardımcı obje
export const COUNTRY_NAMES = {
     TR: 'Türkiye', DE: 'Almanya', US: 'ABD', GB: 'İngiltere', CN: 'Çin',
     FR: 'Fransa', IT: 'İtalya', ES: 'İspanya', JP: 'Japonya', KR: 'G. Kore',
     BR: 'Brezilya', IN: 'Hindistan', RU: 'Rusya', AU: 'Avustralya', CA: 'Kanada',
     MX: 'Meksika', NL: 'Hollanda', BE: 'Belçika', SE: 'İsveç', PL: 'Polonya',
     SA: 'S. Arabistan', AE: 'BAE', EG: 'Mısır', ZA: 'G. Afrika', ID: 'Endonezya',
     TH: 'Tayland', VN: 'Vietnam', MY: 'Malezya', PH: 'Filipinler', SG: 'Singapur'
};

export function getElectricityPrice(countryCode) {
     return ELECTRICITY_PRICES[countryCode?.toUpperCase()] || ELECTRICITY_PRICES.DEFAULT;
}

export function getCountryName(countryCode) {
     return COUNTRY_NAMES[countryCode?.toUpperCase()] || countryCode;
}

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

/**
 * Net Present Value (NPV) hesaplama
 */
export function calculateNPV(capex, annualCashFlow, discountRate, lifetime) {
     let npv = -capex;
     for (let year = 1; year <= lifetime; year++) {
          npv += annualCashFlow / Math.pow(1 + discountRate, year);
     }
     return npv;
}

/**
 * Internal Rate of Return (IRR) hesaplama - Newton-Raphson yöntemi
 */
export function calculateIRR(capex, annualCashFlow, lifetime, maxIterations = 100) {
     if (annualCashFlow <= 0) return 0;

     let irr = 0.1; // Başlangıç tahmini %10

     for (let i = 0; i < maxIterations; i++) {
          let npv = -capex;
          let derivative = 0;

          for (let year = 1; year <= lifetime; year++) {
               const df = Math.pow(1 + irr, year);
               npv += annualCashFlow / df;
               derivative -= year * annualCashFlow / Math.pow(1 + irr, year + 1);
          }

          if (Math.abs(npv) < 0.01) break;
          if (derivative === 0) break;

          irr = irr - npv / derivative;

          // Sınırlar
          if (irr < -0.99) irr = -0.99;
          if (irr > 1) irr = 1;
     }

     return irr;
}

/**
 * Return on Investment (ROI) hesaplama
 */
export function calculateROI(totalRevenue, totalCost) {
     if (totalCost <= 0) return 0;
     return ((totalRevenue - totalCost) / totalCost) * 100;
}

/**
 * Kapsamlı finansal analiz
 */
export function calculateFinancials(params) {
     const {
          netAEP,
          electricityPrice,
          capexPerKw,
          opexPerMw,
          ratedPower,
          lifetime = 20,
          discountRate = 0.08,
          degradationRate = 0.005, // Yıllık %0.5 verim kaybı
          inflationRate = 0.02 // Yıllık %2 enflasyon
     } = params;

     // Temel hesaplamalar
     const totalCapex = ratedPower * capexPerKw;
     const annualOpex = opexPerMw * (ratedPower / 1000);
     const baseRevenue = netAEP * 1000 * electricityPrice;

     // Yıllık nakit akışları
     let totalRevenue = 0;
     let totalOpex = 0;
     let npv = -totalCapex;
     const cashFlows = [-totalCapex];

     for (let year = 1; year <= lifetime; year++) {
          // Verim kaybı ve enflasyon ayarlaması
          const yearlyAEP = netAEP * Math.pow(1 - degradationRate, year - 1);
          const yearlyPrice = electricityPrice * Math.pow(1 + inflationRate, year - 1);
          const yearlyOpex = annualOpex * Math.pow(1 + inflationRate, year - 1);

          const yearlyRevenue = yearlyAEP * 1000 * yearlyPrice;
          const yearlyCashFlow = yearlyRevenue - yearlyOpex;

          totalRevenue += yearlyRevenue;
          totalOpex += yearlyOpex;
          npv += yearlyCashFlow / Math.pow(1 + discountRate, year);
          cashFlows.push(yearlyCashFlow);
     }

     // IRR hesaplama
     const avgCashFlow = (totalRevenue - totalOpex) / lifetime;
     const irr = calculateIRR(totalCapex, avgCashFlow, lifetime);

     // Basit geri ödeme
     const simplePayback = calculatePayback(totalCapex, baseRevenue, annualOpex);

     // İndirimli geri ödeme
     let discountedPayback = Infinity;
     let cumulative = -totalCapex;
     for (let year = 1; year <= lifetime; year++) {
          cumulative += cashFlows[year] / Math.pow(1 + discountRate, year);
          if (cumulative >= 0) {
               discountedPayback = year;
               break;
          }
     }

     // ROI
     const roi = calculateROI(totalRevenue, totalCapex + totalOpex);

     // LCOE
     const lcoe = calculateLCOE(totalCapex, annualOpex, netAEP, lifetime, discountRate);

     // Profit Margin
     const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCapex - totalOpex) / totalRevenue) * 100 : 0;

     return {
          // Yatırım
          totalCapex,
          annualOpex,
          totalOpex,

          // Gelir
          annualRevenue: baseRevenue,
          totalRevenue,

          // Karlılık
          npv,
          irr: irr * 100, // Yüzde olarak
          roi,
          profitMargin,

          // Geri ödeme
          simplePayback,
          discountedPayback,

          // Maliyet
          lcoe,

          // Değerlendirme
          isViable: npv > 0,
          riskLevel: irr > 0.15 ? 'Düşük' : irr > 0.08 ? 'Orta' : 'Yüksek',
          recommendation: npv > 0 && simplePayback < lifetime * 0.5 ? 'Yatırım Önerilir' :
               npv > 0 ? 'Dikkatli Değerlendir' : 'Yatırım Önerilmez'
     };
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
