/**
 * WEIAP - API Servisi (Fixed)
 */

const CACHE_KEY = 'weiap_cache_v2'; // Yeni cache versiyonu

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
          if (entry && Date.now() - entry.ts < 86400000) {
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

     // 1 yıllık veri
     const endDate = new Date();
     endDate.setDate(endDate.getDate() - 5); // 5 gün gecikme (API kısıtı)
     const startDate = new Date(endDate);
     startDate.setFullYear(startDate.getFullYear() - 1);

     // DOĞRU PARAMETRELER: wind_speed_10m ve wind_speed_100m
     const params = [
          'wind_speed_10m',
          'wind_speed_100m',  // 80m yok, 100m kullanıyoruz
          'wind_direction_100m',
          'temperature_2m',
          'surface_pressure'
     ].join(',');

     const url = new URL('https://archive-api.open-meteo.com/v1/archive');
     url.searchParams.set('latitude', lat.toFixed(4));
     url.searchParams.set('longitude', lng.toFixed(4));
     url.searchParams.set('start_date', formatDate(startDate));
     url.searchParams.set('end_date', formatDate(endDate));
     url.searchParams.set('hourly', params);
     url.searchParams.set('timezone', 'auto');

     console.log('🌐 API URL:', url.toString());
     onProgress?.('Veri indiriliyor...');

     const controller = new AbortController();
     const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

     try {
          const res = await fetch(url.toString(), { signal: controller.signal });
          clearTimeout(timeout);

          if (!res.ok) {
               throw new Error(`HTTP ${res.status}`);
          }

          const data = await res.json();

          if (data.error) {
               throw new Error(data.reason || 'API hatası');
          }

          if (!data.hourly?.time?.length) {
               throw new Error('Veri bulunamadı');
          }

          console.log(`✅ ${data.hourly.time.length} saat veri alındı`);
          console.log('📊 Örnek veri:', {
               wind_10m: data.hourly.wind_speed_10m?.slice(0, 3),
               wind_100m: data.hourly.wind_speed_100m?.slice(0, 3),
               temp: data.hourly.temperature_2m?.slice(0, 3)
          });

          setCache(lat, lng, data);
          onProgress?.('Veri alındı ✓');
          return data;

     } catch (err) {
          clearTimeout(timeout);
          if (err.name === 'AbortError') {
               throw new Error('Zaman aşımı - tekrar deneyin');
          }
          throw err;
     }
}

/**
 * Koordinatlardan ülke kodu tespit et
 */
export async function detectCountry(lat, lng) {
     try {
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=3`;
          const res = await fetch(url, {
               headers: { 'User-Agent': 'WEIAP/1.1' }
          });

          if (!res.ok) return null;

          const data = await res.json();
          const code = data?.address?.country_code?.toUpperCase();
          console.log('🌍 Ülke:', code);
          return code || null;
     } catch (e) {
          return null;
     }
}
