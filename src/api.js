/**
 * WEIAP - API Servisi (Simplified)
 */

const CACHE_KEY = 'weiap_cache';

function formatDate(date) {
     return date.toISOString().slice(0, 10);
}

function getCacheKey(lat, lng) {
     return `${lat.toFixed(1)}_${lng.toFixed(1)}`;
}

function getCache(lat, lng) {
     try {
          const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
          const key = getCacheKey(lat, lng);
          const entry = cache[key];
          if (entry && Date.now() - entry.ts < 86400000) { // 24 saat
               console.log('📦 Cache hit');
               return entry.data;
          }
     } catch (e) { }
     return null;
}

function setCache(lat, lng, data) {
     try {
          const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
          cache[getCacheKey(lat, lng)] = { data, ts: Date.now() };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
     } catch (e) {
          localStorage.removeItem(CACHE_KEY);
     }
}

export async function fetchWindData(lat, lng, onProgress) {
     // Cache kontrol
     const cached = getCache(lat, lng);
     if (cached) return cached;

     onProgress?.('API bağlantısı kuruluyor...');

     // 1 yıllık veri (hızlı)
     const endDate = new Date();
     const startDate = new Date();
     startDate.setFullYear(startDate.getFullYear() - 1);

     const url = new URL('https://archive-api.open-meteo.com/v1/archive');
     url.searchParams.set('latitude', lat.toFixed(4));
     url.searchParams.set('longitude', lng.toFixed(4));
     url.searchParams.set('start_date', formatDate(startDate));
     url.searchParams.set('end_date', formatDate(endDate));
     url.searchParams.set('hourly', 'wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_direction_100m,temperature_2m,surface_pressure');
     url.searchParams.set('timezone', 'auto');

     console.log('🌐 Fetching:', url.toString());
     onProgress?.('Veri indiriliyor...');

     const controller = new AbortController();
     const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

     try {
          const res = await fetch(url.toString(), { signal: controller.signal });
          clearTimeout(timeout);

          if (!res.ok) {
               throw new Error(`HTTP ${res.status}`);
          }

          onProgress?.('Veri işleniyor...');
          const data = await res.json();

          if (!data.hourly || !data.hourly.time) {
               throw new Error('Geçersiz API yanıtı');
          }

          console.log(`✅ ${data.hourly.time.length} saat veri alındı`);
          setCache(lat, lng, data);
          return data;

     } catch (err) {
          clearTimeout(timeout);
          if (err.name === 'AbortError') {
               throw new Error('Zaman aşımı - tekrar deneyin');
          }
          throw err;
     }
}
