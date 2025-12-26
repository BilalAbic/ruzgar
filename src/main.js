/**
 * WEIAP - Main Application (Simplified)
 */

import { fetchWindData } from './api.js';
import * as calc from './calculations.js';
import './styles.css';

// ========================
// DOM
// ========================
const $ = id => document.getElementById(id);
const dom = {
     locationLabel: $('locationLabel'),
     coordsLabel: $('coordsLabel'),
     statusBadge: $('statusBadge'),
     loadingOverlay: $('loadingOverlay'),
     loadingProgress: $('loadingProgress'),

     overlay: {
          avg: $('overlayAvg'),
          max: $('overlayMax'),
          count: $('overlayCount'),
          range: $('overlayRange'),
          status: $('overlayStatus')
     },

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
// STATE
// ========================
const state = {
     lat: null,
     lng: null,
     rawData: null,
     currentTurbine: 'generic_2mw',
     isLoading: false
};

// ========================
// MAP
// ========================
const map = L.map('map', { zoomControl: false }).setView([39.5, 35], 6);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
     attribution: '© OSM © CARTO',
     maxZoom: 18
}).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

let marker = null;

map.on('click', async (e) => {
     if (state.isLoading) return;
     await selectAndLoad(e.latlng.lat, e.latlng.lng);
});

// ========================
// MAIN FUNCTIONS
// ========================
async function selectAndLoad(lat, lng) {
     state.lat = lat;
     state.lng = lng;

     // UI güncelle
     dom.locationLabel.textContent = 'Yükleniyor...';
     dom.coordsLabel.textContent = `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;

     if (marker) marker.setLatLng([lat, lng]);
     else marker = L.marker([lat, lng]).addTo(map);

     // Veri yükle
     state.isLoading = true;
     showLoading(true);
     setStatus('Veri alınıyor...', 'warn');

     try {
          const data = await fetchWindData(lat, lng, (msg) => {
               if (dom.loadingProgress) dom.loadingProgress.textContent = msg;
          });

          state.rawData = data;
          dom.locationLabel.textContent = 'Seçili konum';

          // Hesapla ve göster
          updateAllMetrics();

          setStatus('Tamamlandı ✓', 'good');
          if (dom.overlay.status) dom.overlay.status.textContent = 'Hazır';

     } catch (err) {
          console.error('Hata:', err);
          setStatus('Hata: ' + err.message, 'error');
          dom.locationLabel.textContent = 'Hata oluştu';
          if (dom.overlay.status) dom.overlay.status.textContent = 'Hata';
     } finally {
          state.isLoading = false;
          showLoading(false);
     }
}

function updateAllMetrics() {
     if (!state.rawData) return;

     const hourly = state.rawData.hourly;
     const turbine = calc.TURBINES[state.currentTurbine];

     // Veri işle
     const processed = [];
     let totalAlpha = 0, alphaCount = 0;

     for (let i = 0; i < hourly.time.length; i++) {
          const v10 = calc.kmhToMs(hourly.wind_speed_10m[i] || 0);
          const v80 = calc.kmhToMs(hourly.wind_speed_80m[i] || 0);
          const temp = hourly.temperature_2m[i] || 15;
          const pressure = hourly.surface_pressure[i] || 1013;

          const density = calc.calculateAirDensity(temp, pressure);
          const shear = calc.calculateWindShear(v10, 10, v80, 80, turbine.hubHeight);

          if (shear.alpha > 0.05 && shear.alpha < 0.5) {
               totalAlpha += shear.alpha;
               alphaCount++;
          }

          processed.push({
               windSpeed: shear.windSpeed,
               airDensity: density,
               direction: hourly.wind_direction_100m?.[i] || 0
          });
     }

     // AEP hesapla
     const aep = calc.calculateAEP(processed, state.currentTurbine);
     const avgAlpha = alphaCount > 0 ? totalAlpha / alphaCount : 0.14;
     const avgDensity = processed.reduce((a, h) => a + h.airDensity, 0) / processed.length;
     const avgSpeed = processed.reduce((a, h) => a + h.windSpeed, 0) / processed.length;
     const maxSpeed = Math.max(...processed.map(h => h.windSpeed));

     // Overlay
     dom.overlay.avg.textContent = `${avgSpeed.toFixed(1)} m/s`;
     dom.overlay.max.textContent = `${maxSpeed.toFixed(1)} m/s`;
     dom.overlay.count.textContent = formatNum(processed.length);

     const startDate = hourly.time[0]?.slice(0, 10) || '';
     const endDate = hourly.time[hourly.time.length - 1]?.slice(0, 10) || '';
     dom.overlay.range.textContent = `${startDate} — ${endDate}`;

     // Metrics
     dom.metrics.grossAEP.textContent = formatNum(aep.grossAEP);
     dom.metrics.netAEP.textContent = formatNum(aep.netAEP);
     dom.metrics.capacityFactor.textContent = `${(aep.capacityFactor * 100).toFixed(1)}%`;
     dom.metrics.avgWindSpeed.textContent = `${avgSpeed.toFixed(2)} m/s`;
     dom.metrics.windShearAlpha.textContent = avgAlpha.toFixed(3);
     dom.metrics.avgDensity.textContent = avgDensity.toFixed(3);

     // Economics
     updateEconomics(aep);

     // Wind Rose
     drawWindRose(processed);
}

function updateEconomics(aep) {
     const turbine = calc.TURBINES[state.currentTurbine];
     const capexPerKw = parseFloat(dom.economic.capexPerKw?.value) || 1100;
     const opexPerMw = parseFloat(dom.economic.opexPerMw?.value) || 30000;
     const price = parseFloat(dom.economic.electricityPrice?.value) || 0.055;
     const lifetime = parseInt(dom.economic.projectLifetime?.value) || 20;

     const totalCapex = turbine.ratedPower * capexPerKw;
     const opexYear = opexPerMw * (turbine.ratedPower / 1000);
     const lcoe = calc.calculateLCOE(totalCapex, opexYear, aep.netAEP, lifetime);
     const revenue = calc.calculateAnnualRevenue(aep.netAEP, price);
     const payback = calc.calculatePayback(totalCapex, revenue, opexYear);

     dom.economic.lcoeValue.textContent = lcoe === Infinity ? '—' : lcoe.toFixed(1);
     dom.economic.totalCapex.textContent = `$${(totalCapex / 1e6).toFixed(2)}M`;
     dom.economic.annualRevenue.textContent = `$${formatNum(Math.round(revenue))}`;
     dom.economic.paybackPeriod.textContent = payback === Infinity ? '—' : payback.toFixed(1);
}

function drawWindRose(data) {
     const canvas = dom.windRoseCanvas;
     if (!canvas) return;

     const ctx = canvas.getContext('2d');
     const cx = canvas.width / 2;
     const cy = canvas.height / 2;
     const maxR = Math.min(cx, cy) - 25;

     ctx.clearRect(0, 0, canvas.width, canvas.height);

     // Grid
     ctx.strokeStyle = 'rgba(255,255,255,0.1)';
     ctx.lineWidth = 1;
     [0.25, 0.5, 0.75, 1].forEach(r => {
          ctx.beginPath();
          ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
          ctx.stroke();
     });

     // Yön çizgileri
     for (let i = 0; i < 8; i++) {
          const a = (i * 45 - 90) * Math.PI / 180;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
          ctx.stroke();
     }

     // Etiketler
     ctx.fillStyle = 'rgba(255,255,255,0.6)';
     ctx.font = '11px sans-serif';
     ctx.textAlign = 'center';
     ctx.textBaseline = 'middle';
     ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'].forEach((l, i) => {
          const a = (i * 45 - 90) * Math.PI / 180;
          ctx.fillText(l, cx + Math.cos(a) * (maxR + 15), cy + Math.sin(a) * (maxR + 15));
     });

     // Sektör say
     const sectors = Array(16).fill(0);
     data.forEach(h => {
          if (h.direction != null) {
               const idx = Math.floor(((h.direction + 11.25) % 360) / 22.5);
               sectors[idx]++;
          }
     });

     const maxCount = Math.max(...sectors);
     if (maxCount === 0) return;

     // Çiz
     ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
     ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
     ctx.lineWidth = 2;

     sectors.forEach((count, i) => {
          const angle = (i * 22.5 - 90) * Math.PI / 180;
          const r = (count / maxCount) * maxR * 0.8;
          if (r > 0) {
               ctx.beginPath();
               ctx.moveTo(cx, cy);
               ctx.arc(cx, cy, r, angle - 0.2, angle + 0.2);
               ctx.closePath();
               ctx.fill();
               ctx.stroke();
          }
     });

     // Hakim yön
     const maxIdx = sectors.indexOf(maxCount);
     const labels = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
     const pct = ((maxCount / data.length) * 100).toFixed(1);
     dom.dominantDirection.textContent = `${labels[maxIdx]} (${pct}%)`;
}

function updateTurbineSpecs() {
     const t = calc.TURBINES[state.currentTurbine];
     dom.turbine.ratedPower.textContent = `${formatNum(t.ratedPower)} kW`;
     dom.turbine.hubHeight.textContent = `${t.hubHeight} m`;
     dom.turbine.speeds.textContent = `${t.cutIn} / ${t.ratedSpeed} / ${t.cutOut} m/s`;
}

// ========================
// UTILS
// ========================
function formatNum(n) { return n.toLocaleString('tr-TR'); }
function setStatus(text, tone) {
     dom.statusBadge.textContent = text;
     dom.statusBadge.className = `status-badge ${tone}`;
}
function showLoading(show) {
     if (dom.loadingOverlay) dom.loadingOverlay.classList.toggle('active', show);
}

// ========================
// EVENTS
// ========================
dom.turbine.select?.addEventListener('change', (e) => {
     state.currentTurbine = e.target.value;
     updateTurbineSpecs();
     if (state.rawData) updateAllMetrics();
});

[dom.economic.capexPerKw, dom.economic.opexPerMw, dom.economic.electricityPrice, dom.economic.projectLifetime]
     .filter(Boolean)
     .forEach(input => input.addEventListener('input', () => {
          if (state.rawData) {
               const aep = calc.calculateAEP(
                    state.rawData.hourly.time.map((_, i) => ({
                         windSpeed: calc.kmhToMs(state.rawData.hourly.wind_speed_80m[i] || 0),
                         airDensity: calc.calculateAirDensity(
                              state.rawData.hourly.temperature_2m[i] || 15,
                              state.rawData.hourly.surface_pressure[i] || 1013
                         )
                    })),
                    state.currentTurbine
               );
               updateEconomics(aep);
          }
     }));

document.querySelector('.start-btn')?.addEventListener('click', (e) => {
     e.preventDefault();
     document.querySelector('.hero')?.classList.add('hero-dismissed');
     $('app')?.scrollIntoView({ behavior: 'smooth' });
});

// ========================
// INIT
// ========================
console.log('🌀 WEIAP v1.1 başlatılıyor...');
updateTurbineSpecs();
// Bandırma - yüksek rüzgar potansiyeli olan bölge
selectAndLoad(40.35, 27.97);
