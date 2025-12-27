/**
 * WEIAP - Walrus Upload Modülü
 * Merkeziyetsiz depolama için Walrus entegrasyonu (Testnet + Devnet Fallback)
 */

// Walrus Configs
const TESTNET_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
const TESTNET_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

const DEVNET_PUBLISHER = 'https://publisher-devnet.walrus.space';
const DEVNET_AGGREGATOR = 'https://aggregator-devnet.walrus.space';

// Varsayılan olarak Testnet kullanacağız, hata alırsak Devnet'e geçeceğiz.
let CURRENT_AGGREGATOR = TESTNET_AGGREGATOR;

/**
 * Walrus'a yükleme (Otomatik Failover ile)
 * Hedef: Gerçek bir Blob ID almak (Demo/Simülasyon olmadan)
 * @param {Uint8Array} data - Yüklenecek veri
 * @param {number} epochs - Depolama süresi (epoch sayısı)
 * @returns {Object} - Upload sonucu
 */
export async function uploadToWalrus(data, epochs = 1) {
     console.log('📤 Walrus\'a yükleniyor...');

     // 1. Deneme: Testnet Relay
     try {
          console.log('🌐 Testnet Relay deneniyor...');
          return await uploadToUrl(TESTNET_PUBLISHER, data, epochs);
     } catch (e) {
          console.warn('⚠️ Testnet Relay başarısız oldu (Bakiye/Ağ sorunu):', e.message);
          console.log('🔄 Devnet Relay (Yedek) deneniyor...');

          // 2. Deneme: Devnet Relay (Fallback)
          try {
               // Aggregator'ı güncelle ki okuma yaparken oradan okusun
               CURRENT_AGGREGATOR = DEVNET_AGGREGATOR;

               // Devnet genelde CORS hatası verir, o yüzden Proxy kullanıyoruz
               const PROXY_URL = 'https://corsproxy.io/?' + encodeURIComponent(DEVNET_PUBLISHER);
               const result = await uploadToUrl(PROXY_URL, data, epochs);

               // Başarılı olursa extra bilgi ekle
               result.network = 'devnet';
               result.note = 'Testnet yoğunluğu nedeniyle veri Devnet ağına yüklendi.';
               return result;

          } catch (devnetError) {
               console.error('❌ Devnet Relay de başarısız:', devnetError);
               // Demo yok, gerçek hata döndürüyoruz
               throw new Error('Walrus ağlarına erişilemiyor (Testnet & Devnet). Lütfen daha sonra tekrar deneyin.');
          }
     }
}

/**
 * Belirtilen URL'e upload yapan yardımcı fonksiyon
 */
async function uploadToUrl(publisherUrl, data, epochs) {
     const response = await fetch(`${publisherUrl}/v1/blobs?epochs=${epochs}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: data
     });

     if (!response.ok) {
          let msg = `HTTP ${response.status}`;
          try {
               const json = await response.json();
               if (json.error?.message) msg = json.error.message;
          } catch (e) { msg = await response.text(); }
          throw new Error(msg);
     }

     const result = await response.json();
     console.log('✅ Yükleme başarılı:', result);

     let blobId;
     if (result.newlyCreated) blobId = result.newlyCreated.blobObject.blobId;
     else if (result.alreadyCertified) blobId = result.alreadyCertified.blobId;

     return { success: true, blobId, ...result };
}

/**
 * Walrus'tan blob okuma
 * @param {string} blobId - Blob ID
 * @returns {Uint8Array} - Blob verisi
 */
export async function readFromWalrus(blobId) {
     console.log('📥 Walrus\'tan okunuyor:', blobId);

     // Blob ID format kontrolü
     if (!blobId || blobId.startsWith('DEMO_')) {
          console.warn('Geçersiz veya Demo Blob ID');
          return new Uint8Array();
     }

     try {
          // Doğru aggregator URL'ini kullan
          const response = await fetch(`${CURRENT_AGGREGATOR}/v1/blobs/${blobId}`);

          if (!response.ok) {
               throw new Error(`Walrus HTTP ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          console.log('✅ Walrus okuma başarılı');
          return new Uint8Array(arrayBuffer);

     } catch (error) {
          console.error('❌ Walrus okuma hatası:', error);
          throw error;
     }
}

export function getWalrusUrl(blobId) {
     return `${CURRENT_AGGREGATOR}/v1/blobs/${blobId}`;
}

export function getWalrusScanUrl(blobId) {
     // Scan URL için ağa göre seçim
     const networkPath = CURRENT_AGGREGATOR.includes('devnet') ? 'devnet' : 'testnet';
     return `https://walruscan.com/${networkPath}/blob/${blobId}`;
}
