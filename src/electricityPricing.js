/**
 * WEIAP - Elektrik Fiyat Servisi
 * Çoklu API Entegrasyonu:
 * - EPIAS (Türkiye PTF)
 * - ENTSO-E (Avrupa)
 * - EIA (ABD)
 * - Ember (Küresel)
 * - Eurostat (AB Perakende)
 * - Statik Fallback (GlobalPetrolPrices)
 */

// ========================
// VERİ KAYNAKLARI
// ========================

export const DATA_SOURCES = {
     EPIAS: {
          name: 'EPİAŞ Şeffaflık Platformu',
          url: 'https://seffaflik.epias.com.tr/transparency/',
          type: 'Spot (PTF)',
          coverage: ['TR'],
          frequency: 'Saatlik',
          apiType: 'REST (CORS proxy gerekli)'
     },
     ENTSOE: {
          name: 'ENTSO-E Transparency',
          url: 'https://transparency.entsoe.eu/',
          type: 'Spot',
          coverage: ['EU'],
          frequency: 'Saatlik',
          apiType: 'REST (Token gerekli)'
     },
     EIA: {
          name: 'U.S. Energy Information Administration',
          url: 'https://api.eia.gov/v2/',
          type: 'Ortalama',
          coverage: ['US'],
          frequency: 'Aylık',
          apiType: 'REST (Ücretsiz API key)'
     },
     EMBER: {
          name: 'Ember Energy',
          url: 'https://ember-climate.org/data/',
          type: 'Analiz',
          coverage: ['Global'],
          frequency: 'Aylık',
          apiType: 'CSV'
     },
     EUROSTAT: {
          name: 'Eurostat',
          url: 'https://ec.europa.eu/eurostat/',
          type: 'Perakende',
          coverage: ['EU'],
          frequency: '6 Aylık',
          apiType: 'REST'
     },
     STATIC: {
          name: 'GlobalPetrolPrices',
          url: 'https://www.globalpetrolprices.com/',
          type: 'Perakende',
          coverage: ['Global'],
          frequency: 'Çeyreklik',
          apiType: 'Statik'
     }
};

// ========================
// EPİAŞ API (Türkiye PTF)
// ========================

const EPIAS_PROXY = 'https://corsproxy.io/?'; // CORS proxy

export async function fetchEPIASPrice() {
     try {
          // PTF (Piyasa Takas Fiyatı) endpoint
          const today = new Date().toISOString().slice(0, 10);
          const url = `${EPIAS_PROXY}https://seffaflik.epias.com.tr/transparency/service/market/day-ahead-mcp?startDate=${today}&endDate=${today}`;

          const res = await fetch(url, {
               headers: { 'Accept': 'application/json' },
               timeout: 10000
          });

          if (!res.ok) throw new Error(`EPİAŞ HTTP ${res.status}`);

          const data = await res.json();

          if (data.body?.dayAheadMCPList?.length > 0) {
               // TL/MWh -> $/kWh dönüşüm (1 MWh = 1000 kWh)
               const avgMCP = data.body.dayAheadMCPList.reduce((sum, h) => sum + h.price, 0) / data.body.dayAheadMCPList.length;
               const usdRate = 34; // Yaklaşık TL/USD kuru
               const priceUSD = (avgMCP / 1000) / usdRate; // $/kWh

               return {
                    price: priceUSD,
                    currency: 'USD',
                    unit: 'kWh',
                    type: 'spot',
                    source: 'EPIAS',
                    timestamp: new Date().toISOString(),
                    raw: { avgMCP, currency: 'TRY/MWh' }
               };
          }
          throw new Error('EPİAŞ veri boş');
     } catch (err) {
          console.warn('EPİAŞ API hatası:', err.message);
          return null;
     }
}

// ========================
// EIA API (ABD)
// ========================

// EIA API ücretsiz, kayıt sonrası key gerekli
const EIA_API_KEY = 'DEMO_KEY'; // Demo key veya gerçek key

export async function fetchEIAPrice(state = 'US') {
     try {
          // ABD ortalama perakende elektrik fiyatı
          const url = `https://api.eia.gov/v2/electricity/retail-sales/data?api_key=${EIA_API_KEY}&frequency=monthly&data[0]=price&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=1`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`EIA HTTP ${res.status}`);

          const data = await res.json();

          if (data.response?.data?.length > 0) {
               // cents/kWh -> $/kWh
               const priceData = data.response.data[0];
               return {
                    price: priceData.price / 100,
                    currency: 'USD',
                    unit: 'kWh',
                    type: 'retail',
                    source: 'EIA',
                    timestamp: priceData.period,
                    state: priceData.stateDescription
               };
          }
          throw new Error('EIA veri boş');
     } catch (err) {
          console.warn('EIA API hatası:', err.message);
          return null;
     }
}

// ========================
// ENTSO-E API (Avrupa)
// ========================

// ENTSO-E token gerekli - transparency@entsoe.eu adresine mail atılmalı
export async function fetchENTSOEPrice(countryCode, token = null) {
     if (!token) {
          console.warn('ENTSO-E: Token gerekli');
          return null;
     }

     try {
          // Day-ahead fiyat endpoint
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const domain = getENTSOEDomain(countryCode);

          const url = `https://web-api.tp.entsoe.eu/api?documentType=A44&in_Domain=${domain}&out_Domain=${domain}&periodStart=${today}0000&periodEnd=${today}2300&securityToken=${token}`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`ENTSO-E HTTP ${res.status}`);

          // XML parse gerekli
          const text = await res.text();
          // Basitleştirilmiş XML parse
          const priceMatch = text.match(/<price.amount>(\d+\.?\d*)<\/price.amount>/g);
          if (priceMatch && priceMatch.length > 0) {
               const prices = priceMatch.map(m => parseFloat(m.replace(/<\/?price.amount>/g, '')));
               const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

               return {
                    price: avgPrice / 1000, // EUR/MWh -> EUR/kWh
                    currency: 'EUR',
                    unit: 'kWh',
                    type: 'spot',
                    source: 'ENTSOE',
                    timestamp: new Date().toISOString()
               };
          }
          throw new Error('ENTSO-E veri parse edilemedi');
     } catch (err) {
          console.warn('ENTSO-E API hatası:', err.message);
          return null;
     }
}

function getENTSOEDomain(countryCode) {
     const domains = {
          DE: '10Y1001A1001A83F', AT: '10YAT-APG------L', BE: '10YBE----------2',
          BG: '10YCA-BULGARIA-R', HR: '10YHR-HEP------M', CZ: '10YCZ-CEPS-----N',
          DK: '10Y1001A1001A65H', EE: '10Y1001A1001A39I', FI: '10YFI-1--------U',
          FR: '10YFR-RTE------C', GR: '10YGR-HTSO-----Y', HU: '10YHU-MAVIR----U',
          IE: '10YIE-1001A00010', IT: '10YIT-GRTN-----B', LV: '10YLV-1001A00074',
          LT: '10YLT-1001A0008Q', LU: '10YLU-CEGEDEL-NQ', NL: '10YNL----------L',
          NO: '10YNO-0--------C', PL: '10YPL-AREA-----S', PT: '10YPT-REN------W',
          RO: '10YRO-TEL------P', SK: '10YSK-SEPS-----K', SI: '10YSI-ELES-----O',
          ES: '10YES-REE------0', SE: '10YSE-1--------K', CH: '10YCH-SWISSGRIDZ',
          GB: '10YGB----------A', TR: '10YTR-TEIAS----W'
     };
     return domains[countryCode] || domains.DE;
}

// ========================
// EUROSTAT API (AB Perakende)
// ========================

export async function fetchEurostatPrice(countryCode) {
     try {
          // Hane halkı elektrik fiyatları
          const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_204?format=JSON&geo=${countryCode}&nrg_cons=4141903&tax=I_TAX&currency=EUR&unit=KWH`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`Eurostat HTTP ${res.status}`);

          const data = await res.json();

          // En son değeri al
          if (data.value) {
               const values = Object.values(data.value);
               const latestPrice = values[values.length - 1];

               return {
                    price: latestPrice,
                    currency: 'EUR',
                    unit: 'kWh',
                    type: 'retail',
                    source: 'EUROSTAT',
                    timestamp: Object.keys(data.dimension?.time?.category?.index || {}).pop()
               };
          }
          throw new Error('Eurostat veri boş');
     } catch (err) {
          console.warn('Eurostat API hatası:', err.message);
          return null;
     }
}

// ========================
// ANA FONKSİYON: Dinamik Fiyat Çekme
// ========================

export async function fetchDynamicElectricityPrice(countryCode, options = {}) {
     const { forceSource = null, entsoeToken = null } = options;

     console.log(`🔌 ${countryCode} için elektrik fiyatı aranıyor...`);

     let result = null;

     // Öncelik sırasına göre dene

     // 1. Türkiye için EPİAŞ
     if (!result && (forceSource === 'EPIAS' || countryCode === 'TR')) {
          result = await fetchEPIASPrice();
          if (result) console.log('✅ EPİAŞ fiyatı alındı:', result.price.toFixed(4));
     }

     // 2. ABD için EIA
     if (!result && (forceSource === 'EIA' || countryCode === 'US')) {
          result = await fetchEIAPrice();
          if (result) console.log('✅ EIA fiyatı alındı:', result.price.toFixed(4));
     }

     // 3. AB ülkeleri için ENTSO-E (token varsa)
     if (!result && entsoeToken && isEUCountry(countryCode)) {
          result = await fetchENTSOEPrice(countryCode, entsoeToken);
          if (result) console.log('✅ ENTSO-E fiyatı alındı:', result.price.toFixed(4));
     }

     // 4. AB ülkeleri için Eurostat
     if (!result && isEUCountry(countryCode)) {
          result = await fetchEurostatPrice(countryCode);
          if (result) console.log('✅ Eurostat fiyatı alındı:', result.price.toFixed(4));
     }

     // 5. Fallback: Statik veri
     if (!result) {
          const { ELECTRICITY_PRICES } = await import('./calculations.js');
          const staticPrice = ELECTRICITY_PRICES[countryCode] || ELECTRICITY_PRICES.DEFAULT;
          result = {
               price: staticPrice,
               currency: 'USD',
               unit: 'kWh',
               type: 'retail',
               source: 'STATIC',
               timestamp: '2024-Q4'
          };
          console.log('📊 Statik fiyat kullanıldı:', staticPrice);
     }

     return result;
}

function isEUCountry(code) {
     const eu = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
          'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
          'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
     return eu.includes(code);
}

// ========================
// ÖNBELLEK
// ========================

const priceCache = new Map();
const CACHE_TTL = 3600000; // 1 saat

export async function getCachedElectricityPrice(countryCode, options = {}) {
     const cacheKey = `${countryCode}_${options.forceSource || 'auto'}`;
     const cached = priceCache.get(cacheKey);

     if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
          console.log('📦 Önbellek kullanıldı:', countryCode);
          return cached.data;
     }

     const data = await fetchDynamicElectricityPrice(countryCode, options);
     priceCache.set(cacheKey, { data, fetchedAt: Date.now() });

     return data;
}

// ========================
// API BİLGİSİ
// ========================

export function getAPIInfo() {
     return {
          sources: DATA_SOURCES,
          instructions: {
               EPIAS: 'Otomatik çalışır (CORS proxy ile)',
               ENTSOE: 'transparency@entsoe.eu adresine "Restful API access" konulu mail atarak token talep edin',
               EIA: 'https://www.eia.gov/opendata/register.php adresinden ücretsiz API key alın',
               EUROSTAT: 'Otomatik çalışır',
               EMBER: 'CSV indirme - ember-climate.org/data-catalogue/'
          }
     };
}
