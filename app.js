const dom = {
  locationLabel: document.getElementById('locationLabel'),
  coordsLabel: document.getElementById('coordsLabel'),
  statusBadge: document.getElementById('statusBadge'),
  apiModeBadge: document.getElementById('apiModeBadge'),
  overlay: {
    avg: document.getElementById('overlayAvg'),
    max: document.getElementById('overlayMax'),
    count: document.getElementById('overlayCount'),
    range: document.getElementById('overlayRange'),
    status: document.getElementById('overlayStatus')
  },
  metrics: {
    daily: document.getElementById('dailyValue'),
    weekly: document.getElementById('weeklyValue'),
    monthly: document.getElementById('monthlyValue'),
    yearly: document.getElementById('yearlyValue'),
    speed: document.getElementById('windSpeed'),
    capacityFactor: document.getElementById('capacityFactor')
  },
  inputs: {
    capacityKw: document.getElementById('capacityKw'),
    costPerKw: document.getElementById('costPerKw'),
    omCost: document.getElementById('omCost'),
    energyPrice: document.getElementById('energyPrice')
  },
  results: {
    annualEnergy: document.getElementById('annualEnergy'),
    annualNet: document.getElementById('annualNet'),
    payback: document.getElementById('payback')
  }
};

const state = {
  lat: null,
  lng: null,
  wind: null
};

const windDataService = {
  useMock: false, // Mock'a dönmek isterseniz true yapın
  async fetch(lat, lng) {
    if (this.useMock) {
      return mockWindPayload(lat, lng);
    }
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      hourly: 'wind_speed_80m',
      timezone: 'auto',
      forecast_days: 7
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) throw new Error('Open-Meteo yanıt vermedi');
    const data = await res.json();
    return adaptOpenMeteo(data);
  }
};

// Harita: Türkiye odağı (ilk seçim Ankara)
const map = L.map('map', { zoomControl: false }).setView([39, 35], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap katkıcıları'
}).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

let marker = null;

map.on('click', async (e) => {
  selectLocation(e.latlng.lat, e.latlng.lng);
  await loadWindData(e.latlng.lat, e.latlng.lng);
});

// Başlangıç noktası: Ankara
selectLocation(39.925, 32.835);
loadWindData(39.925, 32.835);

function selectLocation(lat, lng) {
  state.lat = lat;
  state.lng = lng;
  dom.locationLabel.textContent = 'Seçili nokta';
  dom.coordsLabel.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }
}

async function loadWindData(lat, lng) {
  setStatus('Veri alınıyor...', 'warn');
  if (dom.overlay.status) dom.overlay.status.textContent = 'Yükleniyor';
  try {
    const payload = await windDataService.fetch(lat, lng);
    state.wind = payload.wind;
    dom.locationLabel.textContent = payload.locationLabel || 'Seçili nokta';
    dom.apiModeBadge.textContent = windDataService.useMock ? 'Mock veri' : 'Open-Meteo';
    updateWindMetrics(payload.wind);
    updateOverlay(payload.meta);
    updateCalculations();
    setStatus('Güncellendi', 'good');
    if (dom.overlay.status) dom.overlay.status.textContent = 'Canlı';
  } catch (err) {
    console.error(err);
    setStatus('Veri alınamadı', 'error');
    if (dom.overlay.status) dom.overlay.status.textContent = 'Hata';
  }
}

function updateWindMetrics(wind) {
  dom.metrics.daily.textContent = formatNumber(wind.dailyKwhPerMw);
  dom.metrics.weekly.textContent = formatNumber(wind.weeklyKwhPerMw);
  dom.metrics.monthly.textContent = formatNumber(wind.monthlyKwhPerMw);
  dom.metrics.yearly.textContent = formatNumber(wind.yearlyKwhPerMw);
  dom.metrics.speed.textContent = `${wind.windSpeed.toFixed(1)} m/s`;
  dom.metrics.capacityFactor.textContent = `${(wind.capacityFactor * 100).toFixed(1)}%`;
}

function updateOverlay(meta) {
  if (!meta) return;
  dom.overlay.avg.textContent = `${meta.avg.toFixed(1)} m/s`;
  dom.overlay.max.textContent = `${meta.max.toFixed(1)} m/s`;
  dom.overlay.count.textContent = `${meta.count} saat`;
  dom.overlay.range.textContent = meta.rangeText || '—';
  dom.overlay.status.textContent = 'Canlı';
}

function updateCalculations() {
  if (!state.wind) return;
  const capacityKw = parseInput(dom.inputs.capacityKw.value, 0);
  const costPerKw = parseInput(dom.inputs.costPerKw.value, 0);
  const omCost = parseInput(dom.inputs.omCost.value, 0);
  const energyPrice = parseInput(dom.inputs.energyPrice.value, 0);

  const capacityFactor = state.wind.capacityFactor;
  const annualMWh = (capacityKw * 8760 * capacityFactor) / 1000; // kWh -> MWh
  const grossRevenue = annualMWh * 1000 * energyPrice; // kWh * fiyat
  const netRevenue = grossRevenue - omCost;
  const capex = capacityKw * costPerKw;
  const paybackYears = netRevenue > 0 ? capex / netRevenue : Infinity;

  dom.results.annualEnergy.textContent = `${formatEnergy(annualMWh)} MWh`;
  dom.results.annualNet.textContent = `${formatCurrency(netRevenue)} ₺`;
  dom.results.payback.textContent = paybackYears === Infinity ? 'Hesaplanamadı' : `${paybackYears.toFixed(1)} yıl`;
}

function setStatus(text, tone = 'idle') {
  dom.statusBadge.textContent = text;
  dom.statusBadge.className = `status-badge ${tone}`;
}

function adaptOpenMeteo(data) {
  const speeds = data?.hourly?.wind_speed_80m || [];
  const times = data?.hourly?.time || [];
  if (!speeds.length) {
    throw new Error('Open-Meteo boş veri döndürdü');
  }

  const sum = speeds.reduce((acc, n) => acc + n, 0);
  const avg = sum / speeds.length;
  const max = Math.max(...speeds);
  const capacityFactor = Math.min(0.6, Math.max(0, (avg - 3) / 12)); // 3 m/s kesme, 15 m/s üst sınır
  const dailyKwhPerMw = Math.round(24_000 * capacityFactor);
  const weeklyKwhPerMw = Math.round(dailyKwhPerMw * 7);
  const monthlyKwhPerMw = Math.round(dailyKwhPerMw * 30);
  const yearlyKwhPerMw = Math.round(dailyKwhPerMw * 365);
  const rangeText = times.length ? `${times[0].slice(0, 10)} - ${times[times.length - 1].slice(0, 10)}` : '—';

  return {
    locationLabel: `Koordinatlar: ${data.latitude?.toFixed?.(3) ?? '?'} , ${data.longitude?.toFixed?.(3) ?? '?'}`,
    meta: {
      avg,
      max,
      count: speeds.length,
      rangeText
    },
    wind: {
      capacityFactor,
      windSpeed: avg,
      dailyKwhPerMw,
      weeklyKwhPerMw,
      monthlyKwhPerMw,
      yearlyKwhPerMw
    }
  };
}

function parseInput(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(n) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function formatEnergy(n) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function formatCurrency(n) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

Object.values(dom.inputs).forEach((input) => {
  input.addEventListener('input', updateCalculations);
});

const startBtn = document.querySelector('.start-btn');
const heroSection = document.querySelector('.hero');
if (startBtn && heroSection) {
  startBtn.addEventListener('click', (e) => {
    e.preventDefault();
    heroSection.classList.add('hero-dismissed');
    document.getElementById('app')?.scrollIntoView({ behavior: 'smooth' });
  });
}

function mockWindPayload(lat, lng) {
  const seed = Math.abs(Math.sin(lat * 12.9898 + lng * 78.233)) % 1;
  const capacityFactor = 0.22 + seed * 0.28; // 0.22 - 0.50
  const windSpeed = 4 + seed * 5; // 4 - 9 m/s arası
  const dailyKwhPerMw = Math.round(24_000 * capacityFactor); // 1 MW referans
  const weeklyKwhPerMw = Math.round(dailyKwhPerMw * 7);
  const monthlyKwhPerMw = Math.round(dailyKwhPerMw * 30);
  const yearlyKwhPerMw = Math.round(dailyKwhPerMw * 365);

  return {
    locationLabel: `Koordinatlar: ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
    wind: {
      capacityFactor,
      windSpeed,
      dailyKwhPerMw,
      weeklyKwhPerMw,
      monthlyKwhPerMw,
      yearlyKwhPerMw
    }
  };
}
