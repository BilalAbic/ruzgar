/**
 * WEIAP - Ana Uygulama (ERA5 Entegrasyonu)
 * Çalışan wind.js + WEIAP hesaplama motoru birleşimi
 */

import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;


import * as calc from './calculations.js';
import { detectCountry } from './api.js';
import { getCachedElectricityPrice, DATA_SOURCES } from './electricityPricing.js';
import * as ai from './aiAnalysis.js';
import * as pdf from './pdfExport.js';
import * as walrus from './walrusUpload.js';
// Seal importu dinamik yapılacak (aşağıda)
import './styles.css';
import './walrus.css';

// ========================
// SABITLER
// ========================
const START_DATE = "2022-01-01";
const DEFAULT_VIEW = { lat: 39.5, lng: 35, zoom: 6 };

// ========================
// STATE
// ========================
const state = {
     lat: null,
     lng: null,
     windData: null,
     rawHourlyData: null,
     currentTurbine: 'generic_2mw',
     isLoading: false,
     countryCode: null
};

let windChart = null;
let mapInstance = null;
let lastMarker = null;
let periodButtons = [];

// ========================
// DOM REFERANSLARI
// ========================
const $ = id => document.getElementById(id);
const dom = {
     coordsLabel: $('coordsLabel'),
     statusBadge: $('statusBadge'),
     status: $('status'),
     loadingOverlay: $('loadingOverlay'),
     loadingProgress: $('loadingProgress'),

     turbine: {
          select: $('turbineSelect'),
          ratedPower: $('turbineRatedPower'),
          hubHeight: $('turbineHubHeight'),
          speeds: $('turbineSpeeds')
     },

     metrics: {
          grossAEP: $('grossAEP'),
          netAEP: $('netAEP'),
          capacityFactor: $('capacityFactor'),
          avgWindSpeed: $('avgWindSpeed'),
          windShearAlpha: $('windShearAlpha'),
          avgDensity: $('avgDensity')
     },

     economic: {
          capexPerKw: $('capexPerKw'),
          opexPerMw: $('opexPerMw'),
          electricityPrice: $('electricityPrice'),
          projectLifetime: $('projectLifetime'),
          lcoeValue: $('lcoeValue'),
          totalCapex: $('totalCapex'),
          annualRevenue: $('annualRevenue'),
          paybackPeriod: $('paybackPeriod')
     },

     windRoseCanvas: $('windRoseCanvas'),
     dominantDirection: $('dominantDirection')
};

// ========================
// BAŞLATMA
// ========================
document.addEventListener('DOMContentLoaded', () => {
     console.log('🌀 WEIAP v1.1 başlatılıyor...');

     // Hero section kontrolü
     setupHeroSection();

     periodButtons = Array.from(document.querySelectorAll('[data-period]'));
     hookPeriodButtons();
     setupMap();
     updateTurbineSpecs();
     setupEventListeners();
});

// ========================
// HERO SECTION
// ========================
function setupHeroSection() {
     const heroSection = document.getElementById('heroSection');
     const mainContent = document.getElementById('mainContent');
     const startBtn = document.getElementById('startBtn');

     console.log('🚀 Hero setup:', { heroSection, mainContent, startBtn });

     if (startBtn) {
          startBtn.addEventListener('click', (e) => {
               e.preventDefault();
               console.log('✅ Start button clicked');
               if (heroSection) heroSection.classList.add('hidden');
               if (mainContent) mainContent.classList.add('visible');
               // Harita boyutunu yenile
               setTimeout(() => {
                    if (mapInstance) mapInstance.invalidateSize();
               }, 100);
          });
     }
}

// ========================
// HARİTA (GEOMAN)
// ========================
function setupMap() {
     mapInstance = L.map('map').setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);

     // Beyaz tema için açık harita
     L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OSM © CARTO'
     }).addTo(mapInstance);

     // Geoman kontrolleri
     mapInstance.pm.addControls({
          position: 'topleft',
          drawMarker: true,
          drawCircle: false,
          drawPolygon: false,
          drawPolyline: false,
          drawRectangle: false,
          cutPolygon: false,
          dragMode: false,
          rotateMode: false
     });

     // Marker oluşturulduğunda
     mapInstance.on('pm:create', async (e) => {
          if (lastMarker) mapInstance.removeLayer(lastMarker);
          lastMarker = e.layer;

          const { lat, lng } = e.layer.getLatLng();
          await loadWindData(lat, lng);
     });
}

// ========================
// PERİYOT BUTONLARI
// ========================
function hookPeriodButtons() {
     periodButtons.forEach(btn => {
          btn.addEventListener('click', () => {
               periodButtons.forEach(b => b.classList.toggle('active', b === btn));
               if (state.windData) {
                    animateChart(btn.dataset.period);
               } else {
                    setStatus('Önce haritadan bir nokta seç.');
               }
          });
     });
}

// ========================
// VERİ YÜKLEME (ERA5 API)
// ========================
async function loadWindData(lat, lng) {
     state.lat = lat;
     state.lng = lng;

     const latFixed = lat.toFixed(4);
     const lngFixed = lng.toFixed(4);

     dom.coordsLabel.textContent = `Koordinat: ${latFixed}, ${lngFixed}`;
     setStatus(`Koordinat: ${latFixed}, ${lngFixed} - Veri çekiliyor...`);
     setStatusBadge('Yükleniyor...', 'warn');
     showLoading(true, 'ERA5 API bağlantısı...');
     toggleButtons(true);

     const today = new Date().toISOString().slice(0, 10);

     // ERA5 API - ÇALIŞAN ENDPOINT
     const url = `https://archive-api.open-meteo.com/v1/era5` +
          `?latitude=${latFixed}` +
          `&longitude=${lngFixed}` +
          `&start_date=${START_DATE}` +
          `&end_date=${today}` +
          `&hourly=windspeed_10m,winddirection_10m,temperature_2m,surface_pressure` +
          `&windspeed_unit=ms` +
          `&timezone=auto`;

     console.log('🌐 API URL:', url);
     showLoading(true, 'Veri indiriliyor...');

     try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();

          if (data.error) {
               throw new Error(data.reason || 'API hatası');
          }

          showLoading(true, 'Veri işleniyor...');

          // Ortalamaları hesapla (grafik için)
          const grouped = buildAverages(data);
          state.windData = grouped;

          // Ham saatlik veri (AEP hesabı için)
          state.rawHourlyData = data.hourly;

          console.log(`✅ ${grouped.hourly.length} saatlik veri işlendi`);

          setStatus(`Veri hazır. Saatlik kayıt: ${grouped.hourly.length}. Aşağıdan dönem seç.`);
          setStatusBadge('Hazır ✓', 'good');

          // Grafik göster
          const activeBtn = document.querySelector('[data-period].active');
          if (activeBtn) animateChart(activeBtn.dataset.period);

          // Ülke tespiti ve dinamik fiyat güncelleme
          detectCountry(lat, lng).then(async (countryCode) => {
               if (countryCode) {
                    state.countryCode = countryCode;
                    const countryName = calc.getCountryName(countryCode);

                    // Dinamik elektrik fiyatı çek (API öncelikli, fallback statik)
                    setStatus(`${countryName} için elektrik fiyatı sorgulanıyor...`);

                    try {
                         const priceData = await getCachedElectricityPrice(countryCode);

                         if (priceData) {
                              const price = priceData.price;
                              const source = DATA_SOURCES[priceData.source]?.name || priceData.source;

                              // UI güncelle
                              if (dom.economic.electricityPrice) {
                                   dom.economic.electricityPrice.value = price.toFixed(3);
                              }

                              console.log(`🌍 ${countryName} (${countryCode})`);
                              console.log(`💰 Elektrik: $${price.toFixed(4)}/kWh`);
                              console.log(`📡 Kaynak: ${source}`);

                              setStatus(`${countryName} - $${price.toFixed(3)}/kWh (${source})`);

                              // Ekonomik hesapları yeni fiyatla güncelle
                              calculateWEIAPMetrics();
                         }
                    } catch (err) {
                         console.warn('Dinamik fiyat alınamadı, statik kullanılıyor:', err);
                         const staticPrice = calc.getElectricityPrice(countryCode);
                         if (dom.economic.electricityPrice) {
                              dom.economic.electricityPrice.value = staticPrice;
                         }
                         setStatus(`${countryName} - $${staticPrice}/kWh (Statik)`);
                         calculateWEIAPMetrics();
                    }
               }
          }).catch(err => {
               console.warn('Ülke tespiti başarısız:', err);
          });

          // WEIAP hesaplamaları (ilk yükleme)
          calculateWEIAPMetrics();

     } catch (err) {
          console.error('API Hatası:', err);
          setStatus('Veri alınamadı. Bağlantıyı kontrol et veya başka nokta seç.');
          setStatusBadge('Hata', 'error');
     } finally {
          showLoading(false);
          toggleButtons(false);
     }
}

// ========================
// ORTALAMA HESAPLAMA (GRAFİK İÇİN)
// ========================
function buildAverages(json) {
     const h = json.hourly || {};

     if (!h.time || !h.windspeed_10m || !h.winddirection_10m) {
          throw new Error('Saatlik veri bulunamadı');
     }

     const hourly = h.time
          .map((t, i) => ({
               t,
               spd: toNumber(h.windspeed_10m[i]),
               dir: toNumber(h.winddirection_10m[i]),
               temp: toNumber(h.temperature_2m?.[i]) || 15,
               pressure: toNumber(h.surface_pressure?.[i]) || 1013
          }))
          .filter(o => Number.isFinite(o.spd) && Number.isFinite(o.dir));

     const group = (arr, period) => {
          const buckets = {};
          arr.forEach(o => {
               const key = period === 'hour' ? o.t.slice(0, 13)
                    : period === 'day' ? o.t.slice(0, 10)
                         : period === 'month' ? o.t.slice(0, 7)
                              : o.t.slice(0, 4);

               if (!buckets[key]) buckets[key] = { spd: [], dir: [] };
               buckets[key].spd.push(o.spd);
               buckets[key].dir.push(o.dir);
          });

          return Object.entries(buckets)
               .map(([k, v]) => ({
                    period: k,
                    avgSpd: average(v.spd),
                    avgDir: vectorAvg(v.dir)
               }))
               .filter(o => Number.isFinite(o.avgSpd) && Number.isFinite(o.avgDir));
     };

     return {
          hourly: group(hourly, 'hour'),
          daily: group(hourly, 'day'),
          monthly: group(hourly, 'month'),
          yearly: group(hourly, 'year'),
          rawHourly: hourly
     };
}

function vectorAvg(arr) {
     const clean = arr.filter(Number.isFinite);
     if (!clean.length) return 0;
     const x = clean.map(a => Math.sin(a * Math.PI / 180)).reduce((a, b) => a + b, 0);
     const y = clean.map(a => Math.cos(a * Math.PI / 180)).reduce((a, b) => a + b, 0);
     return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

function average(arr) {
     const clean = arr.filter(Number.isFinite);
     if (!clean.length) return NaN;
     return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function toNumber(v) {
     const n = Number(v);
     return Number.isFinite(n) ? n : NaN;
}

// ========================
// GRAFİK ANİMASYONU (CHART.JS)
// ========================
function animateChart(period) {
     const dataset = state.windData?.[period] || [];

     if (!dataset.length) {
          setStatus('Veri bulunamadı. Haritadan yeni bir nokta seç.');
          return;
     }

     const capped = dataset.length > 500 ? dataset.slice(-500) : dataset;
     const chartCanvas = document.getElementById('windChart');
     const wrapper = document.getElementById('chart-wrapper');

     if (!chartCanvas || !wrapper) return;

     if (windChart) windChart.destroy();

     const labels = capped.map(o => o.period);
     const speeds = capped.map(o => Number(o.avgSpd.toFixed(1)));

     windChart = new Chart(chartCanvas.getContext('2d'), {
          type: 'line',
          data: {
               labels,
               datasets: [{
                    label: 'Ort. Rüzgar Hızı (m/s)',
                    data: speeds,
                    borderColor: '#22d3ee',
                    backgroundColor: 'rgba(34, 211, 238, 0.15)',
                    borderWidth: 2,
                    tension: 0.25,
                    pointRadius: 0,
                    fill: true
               }]
          },
          options: {
               responsive: true,
               animation: { duration: 1200, easing: 'easeOutQuart' },
               scales: {
                    y: {
                         beginAtZero: true,
                         title: { display: true, text: 'm/s', color: '#9ca3af' },
                         ticks: { color: '#9ca3af' },
                         grid: { color: 'rgba(255,255,255,0.06)' }
                    },
                    x: {
                         ticks: { maxTicksLimit: 12, color: '#9ca3af' },
                         grid: { display: false }
                    }
               },
               plugins: {
                    legend: { labels: { color: '#e5e7eb' } }
               }
          }
     });
}

// ========================
// WEIAP HESAPLAMALARI
// ========================
function calculateWEIAPMetrics() {
     if (!state.windData?.rawHourly) return;

     const hourly = state.windData.rawHourly;
     const turbine = calc.TURBINES[state.currentTurbine];

     // Veri işle
     const processed = [];
     let totalAlpha = 0, alphaCount = 0;

     for (let i = 0; i < hourly.length; i++) {
          const v10 = hourly[i].spd; // Zaten m/s
          const temp = hourly[i].temp;
          const pressure = hourly[i].pressure;

          const density = calc.calculateAirDensity(temp, pressure);

          // Wind shear: 10m'den hub yüksekliğine
          // Alpha varsayılan 0.14 (ERA5 sadece 10m veriyor)
          const alpha = 0.14;
          const windSpeed = v10 * Math.pow(turbine.hubHeight / 10, alpha);

          totalAlpha += alpha;
          alphaCount++;

          processed.push({
               windSpeed,
               airDensity: density,
               direction: hourly[i].dir
          });
     }

     // AEP hesapla
     const aep = calc.calculateAEP(processed, state.currentTurbine);
     const avgAlpha = alphaCount > 0 ? totalAlpha / alphaCount : 0.14;
     const avgDensity = processed.reduce((a, h) => a + h.airDensity, 0) / processed.length;
     const avgSpeed = processed.reduce((a, h) => a + h.windSpeed, 0) / processed.length;

     console.log('📊 WEIAP Sonuçlar:', {
          grossAEP: aep.grossAEP,
          netAEP: aep.netAEP,
          capacityFactor: (aep.capacityFactor * 100).toFixed(1) + '%',
          avgSpeed: avgSpeed.toFixed(2) + ' m/s'
     });

     // UI güncelle
     dom.metrics.grossAEP.textContent = formatNum(aep.grossAEP);
     dom.metrics.netAEP.textContent = formatNum(aep.netAEP);
     dom.metrics.capacityFactor.textContent = `${(aep.capacityFactor * 100).toFixed(1)}%`;
     dom.metrics.avgWindSpeed.textContent = `${avgSpeed.toFixed(2)} m/s`;
     dom.metrics.windShearAlpha.textContent = avgAlpha.toFixed(3);
     dom.metrics.avgDensity.textContent = avgDensity.toFixed(3);

     // Ekonomik hesaplamalar
     updateEconomics(aep);

     // Rüzgar gülü
     drawWindRose(processed);
}

function updateEconomics(aep) {
     const turbine = calc.TURBINES[state.currentTurbine];
     const capexPerKw = parseFloat(dom.economic.capexPerKw?.value) || 1100;
     const opexPerMw = parseFloat(dom.economic.opexPerMw?.value) || 30000;
     const price = parseFloat(dom.economic.electricityPrice?.value) || 0.09;
     const lifetime = parseInt(dom.economic.projectLifetime?.value) || 20;

     // Kapsamlı finansal analiz
     const financials = calc.calculateFinancials({
          netAEP: aep.netAEP,
          electricityPrice: price,
          capexPerKw,
          opexPerMw,
          ratedPower: turbine.ratedPower,
          lifetime,
          discountRate: 0.08
     });

     // Ana metrikler
     dom.economic.lcoeValue.textContent = financials.lcoe === Infinity ? '—' : financials.lcoe.toFixed(1);

     // NPV
     const npvEl = document.getElementById('npvValue');
     const npvCard = npvEl?.parentElement;
     if (npvEl) {
          const npvM = financials.npv / 1e6;
          npvEl.textContent = (financials.npv >= 0 ? '+' : '') + `$${npvM.toFixed(2)}M`;
          npvCard?.classList.toggle('negative', financials.npv < 0);
     }

     // IRR
     const irrEl = document.getElementById('irrValue');
     if (irrEl) {
          irrEl.textContent = financials.irr.toFixed(1) + '%';
     }

     // ROI
     const roiEl = document.getElementById('roiValue');
     if (roiEl) {
          roiEl.textContent = financials.roi.toFixed(0) + '%';
     }

     // Detay metrikler
     dom.economic.totalCapex.textContent = `$${(financials.totalCapex / 1e6).toFixed(2)}M`;
     dom.economic.annualRevenue.textContent = `$${formatNum(Math.round(financials.annualRevenue))}`;
     dom.economic.paybackPeriod.textContent = financials.simplePayback === Infinity ? '—' : financials.simplePayback.toFixed(1);

     // Toplam gelir
     const totalRevenueEl = document.getElementById('totalRevenue');
     if (totalRevenueEl) {
          totalRevenueEl.textContent = `$${(financials.totalRevenue / 1e6).toFixed(1)}M`;
     }

     // Proje ömrü display
     const lifetimeDisplayEl = document.getElementById('projectLifetimeDisplay');
     if (lifetimeDisplayEl) {
          lifetimeDisplayEl.textContent = `(${lifetime} yıl)`;
     }

     // Proje sonu etiketi
     const projectEndLabel = document.getElementById('projectEndLabel');
     if (projectEndLabel) {
          projectEndLabel.textContent = `${lifetime} yıl`;
     }

     // Geri ödeme progress ve timeline
     const paybackPercent = document.getElementById('paybackPercent');
     const paybackFill = document.getElementById('paybackProgressFill');
     const paybackMarker = document.getElementById('paybackMarker');
     const paybackYearLabel = document.getElementById('paybackYearLabel');

     if (paybackFill) {
          const pct = financials.simplePayback === Infinity ? 0 : Math.min(100, (financials.simplePayback / lifetime) * 100);
          const profitPct = 100 - pct;

          paybackFill.style.width = `${pct}%`;

          if (paybackMarker) {
               paybackMarker.style.left = `${pct}%`;
          }

          if (paybackPercent) {
               paybackPercent.textContent = financials.simplePayback === Infinity ? '—' : `${profitPct.toFixed(0)}% kar süresi`;
          }

          if (paybackYearLabel) {
               paybackYearLabel.textContent = financials.simplePayback === Infinity ? '—' : `${financials.simplePayback.toFixed(1)} yıl`;
          }
     }

     // Yatırım önerisi badge
     const recommendationEl = document.getElementById('investmentRecommendation');
     if (recommendationEl) {
          recommendationEl.textContent = financials.recommendation;
          recommendationEl.className = 'recommendation-badge';
          if (financials.recommendation === 'Yatırım Önerilir') {
               recommendationEl.classList.add('positive');
          } else if (financials.recommendation === 'Dikkatli Değerlendir') {
               recommendationEl.classList.add('caution');
          } else {
               recommendationEl.classList.add('negative');
          }
     }

     // Yatırım özeti kartı
     const summaryIcon = document.getElementById('summaryIcon');
     const summaryTitle = document.getElementById('summaryTitle');
     const summaryText = document.getElementById('summaryText');

     if (summaryTitle && summaryText) {
          if (financials.recommendation === 'Yatırım Önerilir') {
               summaryIcon.textContent = '✅';
               summaryTitle.textContent = 'Yatırım Önerilir';
               summaryText.textContent = `${financials.simplePayback.toFixed(1)} yılda geri dönüş, ${financials.irr.toFixed(1)}% getiri oranı.`;
          } else if (financials.recommendation === 'Dikkatli Değerlendir') {
               summaryIcon.textContent = '⚠️';
               summaryTitle.textContent = 'Dikkatli Değerlendirin';
               summaryText.textContent = `Marjinal getiri. Geri ödeme ${financials.simplePayback.toFixed(1)} yıl.`;
          } else {
               summaryIcon.textContent = '❌';
               summaryTitle.textContent = 'Yatırım Önerilmez';
               summaryText.textContent = 'NPV negatif, bu lokasyon uygun değil.';
          }
     }

     // Risk gauge
     const riskGaugeFill = document.getElementById('riskGaugeFill');
     const riskLabel = document.getElementById('riskLabel');
     if (riskGaugeFill && riskLabel) {
          // IRR'ye göre risk: yüksek IRR = düşük risk
          let rotation = -60; // Düşük risk (yeşil)
          if (financials.irr < 8) {
               rotation = 60; // Yüksek risk (kırmızı)
               riskLabel.textContent = 'Yüksek';
          } else if (financials.irr < 15) {
               rotation = 0; // Orta risk (sarı)
               riskLabel.textContent = 'Orta';
          } else {
               rotation = -60; // Düşük risk (yeşil)
               riskLabel.textContent = 'Düşük';
          }
          riskGaugeFill.style.transform = `rotate(${rotation}deg)`;
     }

     console.log('💰 Finansal Analiz:', {
          LCOE: financials.lcoe.toFixed(2) + ' $/MWh',
          NPV: '$' + (financials.npv / 1e6).toFixed(2) + 'M',
          IRR: financials.irr.toFixed(1) + '%',
          ROI: financials.roi.toFixed(0) + '%',
          Payback: financials.simplePayback.toFixed(1) + ' yıl',
          Öneri: financials.recommendation
     });

     // AI analiz için finansal verileri sakla
     storeFinancialsForAI(financials, aep);
}

// ========================
// RÜZGAR GÜLÜ (GELİŞMİŞ ANİMASYON)
// ========================
let windRoseAnimationId = null;
let windRoseFrame = 0;

function drawWindRose(data) {
     const canvas = dom.windRoseCanvas;
     if (!canvas) return;

     // Önceki animasyonu durdur
     if (windRoseAnimationId) {
          cancelAnimationFrame(windRoseAnimationId);
          windRoseAnimationId = null;
     }

     const ctx = canvas.getContext('2d');
     const cx = canvas.width / 2;
     const cy = canvas.height / 2;
     const maxR = Math.min(cx, cy) - 30;

     // Sektör verileri
     const sectors = Array(16).fill(0);
     data.forEach(h => {
          if (h.direction != null) {
               const idx = Math.floor(((h.direction + 11.25) % 360) / 22.5);
               sectors[idx]++;
          }
     });

     const maxCount = Math.max(...sectors);
     if (maxCount === 0) return;

     // Parçacıklar
     const particles = [];
     for (let i = 0; i < 20; i++) {
          particles.push({
               angle: Math.random() * Math.PI * 2,
               r: Math.random() * maxR * 0.6,
               speed: 0.01 + Math.random() * 0.02,
               size: 1 + Math.random() * 2
          });
     }

     // Animasyon değişkenleri
     let animProgress = 0;
     const animDuration = 2000;
     const startTime = Date.now();
     windRoseFrame = 0;

     function render() {
          windRoseFrame++;
          const now = Date.now();
          const elapsed = now - startTime;
          animProgress = Math.min(elapsed / animDuration, 1);

          // Easing
          const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const p = ease(animProgress);

          // Temizle
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Arka plan
          const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR + 20);
          bg.addColorStop(0, '#f8fafc');
          bg.addColorStop(1, '#e2e8f0');
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(cx, cy, maxR + 20, 0, Math.PI * 2);
          ctx.fill();

          // Dönen dış halka
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(windRoseFrame * 0.005);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 10]);
          ctx.beginPath();
          ctx.arc(0, 0, maxR + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Grid çemberleri
          [0.25, 0.5, 0.75, 1].forEach((ratio, i) => {
               const r = maxR * ratio * p;
               ctx.strokeStyle = `rgba(148, 163, 184, ${0.2 + i * 0.1})`;
               ctx.lineWidth = 1;
               ctx.beginPath();
               ctx.arc(cx, cy, r, 0, Math.PI * 2);
               ctx.stroke();
          });

          // Yön çizgileri
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 8; i++) {
               const angle = (i * 45 - 90) * Math.PI / 180;
               const len = maxR * p;
               ctx.beginPath();
               ctx.moveTo(cx, cy);
               ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
               ctx.stroke();
          }

          // Sektörler - ana animasyon
          sectors.forEach((count, i) => {
               if (count === 0) return;

               const angle = (i * 22.5 - 90) * Math.PI / 180;
               const intensity = count / maxCount;
               const targetR = intensity * maxR * 0.85;

               // Sıralı açılma efekti
               const sectorDelay = i * 0.03;
               const sectorProgress = Math.max(0, Math.min(1, (animProgress - sectorDelay) / 0.5));
               const r = targetR * ease(sectorProgress);

               if (r > 3) {
                    // Glow
                    ctx.shadowColor = `rgba(6, 182, 212, ${0.6 * intensity})`;
                    ctx.shadowBlur = 15 + 10 * intensity;

                    // Sektör gradient
                    const grad = ctx.createLinearGradient(
                         cx, cy,
                         cx + Math.cos(angle) * r,
                         cy + Math.sin(angle) * r
                    );
                    grad.addColorStop(0, `rgba(6, 182, 212, 0.3)`);
                    grad.addColorStop(0.5, `rgba(34, 211, 238, ${0.5 + intensity * 0.3})`);
                    grad.addColorStop(1, `rgba(59, 130, 246, ${0.7 + intensity * 0.2})`);

                    ctx.fillStyle = grad;
                    ctx.strokeStyle = `rgba(6, 182, 212, ${0.9})`;
                    ctx.lineWidth = 2;

                    // Sektör çiz
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, r, angle - 0.17, angle + 0.17);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    ctx.shadowBlur = 0;

                    // Parlaklık vurgusu
                    if (intensity > 0.5) {
                         const shimmer = 0.3 + Math.sin(windRoseFrame * 0.1 + i) * 0.2;
                         ctx.fillStyle = `rgba(255, 255, 255, ${shimmer * sectorProgress})`;
                         ctx.beginPath();
                         ctx.arc(
                              cx + Math.cos(angle) * r * 0.6,
                              cy + Math.sin(angle) * r * 0.6,
                              3, 0, Math.PI * 2
                         );
                         ctx.fill();
                    }
               }
          });

          // Parçacıklar
          if (animProgress > 0.3) {
               ctx.fillStyle = 'rgba(34, 211, 238, 0.6)';
               particles.forEach(pt => {
                    pt.angle += pt.speed;
                    pt.r += 0.2;
                    if (pt.r > maxR * 0.8) pt.r = maxR * 0.2;

                    const x = cx + Math.cos(pt.angle) * pt.r;
                    const y = cy + Math.sin(pt.angle) * pt.r;

                    ctx.beginPath();
                    ctx.arc(x, y, pt.size * (animProgress - 0.3), 0, Math.PI * 2);
                    ctx.fill();
               });
          }

          // Merkez - pulse
          const pulse = 5 + Math.sin(windRoseFrame * 0.08) * 3;
          const centerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulse * 3);
          centerGrad.addColorStop(0, 'rgba(6, 182, 212, 1)');
          centerGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.4)');
          centerGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');

          ctx.fillStyle = centerGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, pulse * 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(cx - 1, cy - 1, pulse * 0.4, 0, Math.PI * 2);
          ctx.fill();

          // Yön etiketleri
          ctx.fillStyle = `rgba(51, 65, 85, ${p})`;
          ctx.font = 'bold 12px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
          dirs.forEach((label, i) => {
               const angle = (i * 45 - 90) * Math.PI / 180;
               const labelR = maxR + 18;
               ctx.fillText(label, cx + Math.cos(angle) * labelR, cy + Math.sin(angle) * labelR);
          });

          // Devam
          windRoseAnimationId = requestAnimationFrame(render);
     }

     render();

     // Hakim yön güncelle
     const maxIdx = sectors.indexOf(maxCount);
     const dirLabels = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
     const pct = ((maxCount / data.length) * 100).toFixed(1);

     if (dom.dominantDirection) {
          dom.dominantDirection.textContent = `${dirLabels[maxIdx]} (${pct}%)`;
     }
}

// ========================
// TÜRBİN
// ========================
function updateTurbineSpecs() {
     const t = calc.TURBINES[state.currentTurbine];
     if (!t) return;
     dom.turbine.ratedPower.textContent = `${formatNum(t.ratedPower)} kW`;
     dom.turbine.hubHeight.textContent = `${t.hubHeight} m`;
     dom.turbine.speeds.textContent = `${t.cutIn} / ${t.ratedSpeed} / ${t.cutOut} m/s`;
}

// ========================
// EVENT LISTENERS
// ========================
function setupEventListeners() {
     dom.turbine.select?.addEventListener('change', (e) => {
          state.currentTurbine = e.target.value;
          updateTurbineSpecs();
          if (state.windData) calculateWEIAPMetrics();
     });

     [dom.economic.capexPerKw, dom.economic.opexPerMw, dom.economic.electricityPrice, dom.economic.projectLifetime]
          .filter(Boolean)
          .forEach(input => input.addEventListener('input', () => {
               if (state.windData) {
                    const hourly = state.windData.rawHourly;
                    const turbine = calc.TURBINES[state.currentTurbine];
                    const processed = hourly.map(h => ({
                         windSpeed: h.spd * Math.pow(turbine.hubHeight / 10, 0.14),
                         airDensity: calc.calculateAirDensity(h.temp, h.pressure)
                    }));
                    const aep = calc.calculateAEP(processed, state.currentTurbine);
                    updateEconomics(aep);
               }
          }));
}

// ========================
// YARDIMCI FONKSİYONLAR
// ========================
function formatNum(n) {
     return n.toLocaleString('tr-TR');
}

function setStatus(text) {
     if (dom.status) dom.status.textContent = text;
}

function setStatusBadge(text, tone = '') {
     if (dom.statusBadge) {
          dom.statusBadge.textContent = text;
          dom.statusBadge.className = `status-badge ${tone}`;
     }
}

function showLoading(show, text = '') {
     if (dom.loadingOverlay) dom.loadingOverlay.classList.toggle('active', show);
     if (dom.loadingProgress && text) dom.loadingProgress.textContent = text;
}

function toggleButtons(disabled) {
     periodButtons.forEach(btn => btn.disabled = disabled);
}

// ========================
// AI ANALİZ
// ========================
let lastFinancials = null;
let lastAEP = null;

function setupAIPanel() {
     // Run analysis button
     const runBtn = document.getElementById('runAnalysis');
     if (runBtn) {
          runBtn.addEventListener('click', runAIAnalysis);
     }
     console.log('🤖 AI Panel hazır');
}

function enableAnalysisButton(enable) {
     const btn = document.getElementById('runAnalysis');
     if (btn) btn.disabled = !enable;
}

async function runAIAnalysis() {
     if (!lastFinancials || !lastAEP) {
          alert('Önce haritadan bir konum seçin');
          return;
     }

     const resultDiv = document.getElementById('analysisResult');
     const textDiv = document.getElementById('analysisText');
     const infoDiv = document.getElementById('analysisInfo');
     const runBtn = document.getElementById('runAnalysis');

     if (!resultDiv || !textDiv) return;

     // AI Status gizle
     const aiStatus = document.getElementById('aiStatus');
     if (aiStatus) aiStatus.style.display = 'none';

     // Loading durumu
     runBtn.disabled = true;
     runBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;margin:0"></span> Analiz yapılıyor...';
     resultDiv.style.display = 'block';
     textDiv.innerHTML = '<div class="analysis-loading"><div class="spinner"></div><span>GPT-4o analiz ediyor...</span></div>';

     try {
          const turbine = calc.TURBINES[state.currentTurbine];
          const price = parseFloat(document.getElementById('electricityPrice')?.value) || 0.09;

          // Analiz verilerini hazırla
          const analysisData = ai.prepareAnalysisData({
               location: { lat: state.lat, lng: state.lng },
               countryCode: state.countryCode || 'TR',
               windData: {
                    avgSpeed: state.windData?.avgSpeed || 0,
                    maxSpeed: state.windData?.maxSpeed || 0,
                    dominantDirection: document.getElementById('dominantDirection')?.textContent || 'N/A',
                    dataPoints: state.rawHourlyData?.time?.length || 0
               },
               turbine,
               aep: lastAEP,
               financials: lastFinancials,
               electricityPrice: price
          });

          console.log('🤖 AI Analiz verileri:', analysisData);

          // GPT-4o ile analiz
          const result = await ai.analyzeWithGPT(analysisData);

          // Verdict card güncelle
          updateVerdictCard(lastFinancials);

          // Key metrics güncelle
          updateAIMetrics(lastFinancials);

          if (result.success) {
               textDiv.innerHTML = result.analysis;
               infoDiv.textContent = `GPT-4o • ${result.usage?.total_tokens || 'N/A'} token`;
               console.log('✅ AI Analiz tamamlandı');
          } else {
               // Fallback: Basit analiz
               console.warn('GPT hatası, basit analiz kullanılıyor:', result.error);
               const basicAnalysis = ai.generateBasicAnalysis(analysisData);
               textDiv.innerHTML = basicAnalysis;
               infoDiv.textContent = `Otomatik Analiz`;
          }

     } catch (err) {
          console.error('AI Analiz hatası:', err);
          textDiv.innerHTML = `<p style="color:#dc2626">Analiz sırasında hata oluştu: ${err.message}</p>`;
     } finally {
          runBtn.disabled = false;
          runBtn.innerHTML = '<span class="btn-icon">✨</span><span class="btn-text">Yatırım Analizi Yap</span><span class="btn-arrow">→</span>';
     }
}

// Store financials for AI
function storeFinancialsForAI(financials, aep) {
     lastFinancials = financials;
     lastAEP = aep;
     enableAnalysisButton(true);

     // AI Status güncelle
     const aiStatus = document.getElementById('aiStatus');
     const aiStatusText = aiStatus?.querySelector('.ai-status-text p');
     if (aiStatusText) {
          aiStatusText.textContent = 'Analiz için hazır! Butona tıklayın.';
     }

     // Walrus butonlarını aktif et
     enableWalrusButtons(true);
}

function updateVerdictCard(financials) {
     const verdictCard = document.getElementById('verdictCard');
     const verdictIcon = document.getElementById('verdictIcon');
     const verdictTitle = document.getElementById('verdictTitle');
     const verdictSubtitle = document.getElementById('verdictSubtitle');
     const verdictBadge = document.getElementById('verdictBadge');

     if (!verdictCard) return;

     verdictCard.className = 'verdict-card';
     verdictBadge.className = 'verdict-badge';

     if (financials.recommendation === 'Yatırım Önerilir') {
          verdictCard.classList.add('positive');
          verdictBadge.classList.add('positive');
          verdictIcon.textContent = '✅';
          verdictTitle.textContent = 'Yatırım Önerilir';
          verdictSubtitle.textContent = `${financials.simplePayback.toFixed(1)} yılda geri dönüş bekleniyor`;
          verdictBadge.textContent = 'Olumlu';
     } else if (financials.recommendation === 'Dikkatli Değerlendir') {
          verdictCard.classList.add('caution');
          verdictBadge.classList.add('caution');
          verdictIcon.textContent = '⚠️';
          verdictTitle.textContent = 'Dikkatli Değerlendirin';
          verdictSubtitle.textContent = 'Marjinal getiri, ek analiz önerilir';
          verdictBadge.textContent = 'Dikkat';
     } else {
          verdictCard.classList.add('negative');
          verdictBadge.classList.add('negative');
          verdictIcon.textContent = '❌';
          verdictTitle.textContent = 'Yatırım Önerilmez';
          verdictSubtitle.textContent = 'NPV negatif, alternatif lokasyon aranmalı';
          verdictBadge.textContent = 'Olumsuz';
     }
}

function updateAIMetrics(financials) {
     const aiRevenue = document.getElementById('aiRevenue');
     const aiPayback = document.getElementById('aiPayback');
     const aiIRR = document.getElementById('aiIRR');

     if (aiRevenue) {
          aiRevenue.textContent = `$${(financials.annualRevenue / 1000).toFixed(0)}K`;
     }
     if (aiPayback) {
          aiPayback.textContent = financials.simplePayback === Infinity ? '—' : `${financials.simplePayback.toFixed(1)} yıl`;
     }
     if (aiIRR) {
          aiIRR.textContent = `${financials.irr.toFixed(1)}%`;
     }
}

// Initialize AI and Walrus panels on load
document.addEventListener('DOMContentLoaded', () => {
     setupAIPanel();
     setupWalrusPanel();
});

// ========================
// WALRUS & SEAL ENTEGRASYONU
// ========================

// Seal Package ID (Kullanıcı tarafından sağlanan)
const SEAL_PACKAGE_ID = '0x4cb0efd1f14f4d1eb928762b5b3474944c7fcf0213301a18c14e3e1ccef44a69';
const SEAL_SCOPE_ID = '0x101'; // Örnek scope ID

function setupWalrusPanel() {
     console.log('☁️ Walrus Panel hazırlanıyor...');

     const btnPDF = document.getElementById('btnExportPDF');
     const btnUpload = document.getElementById('btnWalrusUpload');

     if (btnPDF) {
          btnPDF.addEventListener('click', handlePDFExport);
     }

     if (btnUpload) {
          btnUpload.addEventListener('click', handleWalrusUpload);
     }
}

function enableWalrusButtons(enable) {
     const btnPDF = document.getElementById('btnExportPDF');
     const btnUpload = document.getElementById('btnWalrusUpload');
     if (btnPDF) btnPDF.disabled = !enable;
     if (btnUpload) btnUpload.disabled = !enable;
}

// updateEconomics içinde çağrılacak: enableWalrusButtons(true);
// Bunu storeFinancialsForAI içine de ekleyebiliriz.

function getReportData() {
     if (!lastFinancials || !lastAEP) return null;

     const turbine = calc.TURBINES[state.currentTurbine];
     const aiText = document.getElementById('analysisText')?.innerText;

     return {
          location: {
               lat: state.lat,
               lng: state.lng,
               country: state.countryCode
          },
          windData: state.windData,
          turbine,
          aep: lastAEP,
          financials: lastFinancials,
          aiAnalysis: aiText
     };
}

function handlePDFExport() {
     const data = getReportData();
     if (!data) {
          alert('Analiz verisi bulunamadı. Lütfen önce analiz yapın.');
          return;
     }

     pdf.downloadPDF(data, `weiap-analiz-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function handleWalrusUpload() {
     const data = getReportData();
     if (!data) {
          alert('Analiz verisi bulunamadı.');
          return;
     }

     // UI Güncelle
     const statusDiv = document.getElementById('walrusStatus');
     const resultDiv = document.getElementById('walrusResult');
     const btnUpload = document.getElementById('btnWalrusUpload');

     statusDiv.style.display = 'block';
     resultDiv.style.display = 'none';
     btnUpload.disabled = true;

     // Adım 1: PDF Oluştur
     updateStep('stepPDF', 'active');
     await new Promise(r => setTimeout(r, 500)); // UI update için bekle

     const pdfBytes = pdf.generateAnalysisPDF(data);
     updateStep('stepPDF', 'done');

     // Adım 2: Seal ile Şifrele
     updateStep('stepEncrypt', 'active');

     let uploadData = pdfBytes;
     let encryptionMeta = null;

     try {
          // Seal ile şifreleme
          console.log('🔒 Veri şifreleniyor...');

          // Dinamik import
          let seal;
          try {
               seal = await import('./sealEncryption.js');
          } catch (e) {
               console.error('Seal module load error:', e);
               throw new Error('Seal modülü yüklenemedi: ' + e.message);
          }

          // Gerçek Seal Şifrelemesi
          console.log('🔒 Seal ile şifreleniyor...', SEAL_PACKAGE_ID);

          const result = await seal.encryptWithSeal(pdfBytes, SEAL_PACKAGE_ID, SEAL_SCOPE_ID);

          if (!result.success) {
               throw new Error(result.error || 'Şifreleme başarısız');
          }

          // Seal çıktısını Walrus'a uygun formata çevir
          // result.encryptedData bir obje olabilir, bunu serialize etmemiz lazım.
          // Basitçe JSON yapıp byte'a çeviriyoruz.
          const jsonString = JSON.stringify(result.encryptedData, (_, v) => typeof v === 'bigint' ? v.toString() : v);
          uploadData = new TextEncoder().encode(jsonString);

          encryptionMeta = { type: 'seal', packageId: SEAL_PACKAGE_ID };

          await new Promise(r => setTimeout(r, 800)); // Animasyon için
          updateStep('stepEncrypt', 'done');

     } catch (err) {
          console.error('Encryption failed:', err);
          alert('Şifreleme hatası: ' + err.message);
          btnUpload.disabled = false;
          return;
     }

     // Adım 3: Walrus'a Yükle
     updateStep('stepUpload', 'active');

     const uploadResult = await walrus.uploadToWalrus(uploadData, 1); // 1 epoch

     if (uploadResult.success) {
          updateStep('stepUpload', 'done');

          // Sonucu Göster
          document.getElementById('blobIdResult').innerText = uploadResult.blobId;

          // WalrusScan linkini güncelle
          const scanLink = document.getElementById('walrusScanLink');
          if (scanLink) scanLink.href = walrus.getWalrusScanUrl(uploadResult.blobId);

          resultDiv.style.display = 'block';
          //alert(`✅ Başarıyla yüklendi!\nBlob ID: ${uploadResult.blobId}`);
     } else {
          alert('Yükleme başarısız: ' + uploadResult.error);
          statusDiv.style.display = 'none';
     }

     btnUpload.disabled = false;
}

function updateStep(stepId, state) {
     const step = document.getElementById(stepId);
     if (!step) return;

     step.classList.remove('active', 'done');
     step.classList.add(state);

     // İkon güncelleme
     const icon = step.querySelector('.step-icon');
     if (state === 'active') icon.textContent = '⏳';
     if (state === 'done') icon.textContent = '✓';
}
