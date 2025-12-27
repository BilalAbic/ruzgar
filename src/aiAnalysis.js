/**
 * WEIAP - ChatGPT-4o AI Analiz Modülü
 * Yatırım analizi için OpenAI GPT-4o entegrasyonu
 */

// API Anahtarı - Sabit olarak tanımlı
const OPENAI_API_KEY = 'api_key_giriniz';

/**
 * API anahtarını kontrol et
 */
export function hasAPIKey() {
     return !!OPENAI_API_KEY;
}

/**
 * API anahtarını yükle (uyumluluk için)
 */
export function loadOpenAIKey() {
     return OPENAI_API_KEY;
}

/**
 * Yatırım analizi verilerini hazırla
 */
export function prepareAnalysisData(params) {
     const {
          location,
          countryCode,
          windData,
          turbine,
          aep,
          financials,
          electricityPrice
     } = params;

     return {
          konum: {
               koordinatlar: `${location.lat.toFixed(4)}°N, ${location.lng.toFixed(4)}°E`,
               ulke: countryCode
          },
          ruzgar: {
               ortalamaHiz: `${windData.avgSpeed.toFixed(2)} m/s`,
               maksimumHiz: `${windData.maxSpeed?.toFixed(2) || 'N/A'} m/s`,
               hakimYon: windData.dominantDirection || 'N/A',
               veriSayisi: `${windData.dataPoints} saatlik kayıt`
          },
          turbin: {
               model: turbine.name,
               guc: `${turbine.ratedPower} kW`,
               hubYuksekligi: `${turbine.hubHeight} m`,
               cutIn: `${turbine.cutIn} m/s`,
               ratedSpeed: `${turbine.ratedSpeed} m/s`,
               cutOut: `${turbine.cutOut} m/s`
          },
          uretim: {
               brutAEP: `${aep.grossAEP.toLocaleString('tr-TR')} MWh/yıl`,
               netAEP: `${aep.netAEP.toLocaleString('tr-TR')} MWh/yıl`,
               kapasiteFaktoru: `${(aep.capacityFactor * 100).toFixed(1)}%`
          },
          ekonomi: {
               elektrikFiyati: `$${electricityPrice}/kWh`,
               toplamYatirim: `$${(financials.totalCapex / 1e6).toFixed(2)}M`,
               yillikGelir: `$${financials.annualRevenue.toLocaleString('tr-TR')}`,
               toplamGelir: `$${(financials.totalRevenue / 1e6).toFixed(1)}M (${financials.lifetime || 20} yıl)`,
               LCOE: `$${financials.lcoe.toFixed(2)}/MWh`,
               NPV: `$${(financials.npv / 1e6).toFixed(2)}M`,
               IRR: `${financials.irr.toFixed(1)}%`,
               ROI: `${financials.roi.toFixed(0)}%`,
               geriOdeme: `${financials.simplePayback.toFixed(1)} yıl`,
               yatirimOneri: financials.recommendation
          }
     };
}

/**
 * ChatGPT-4o ile yatırım analizi yap
 */
export async function analyzeWithGPT(analysisData) {
     if (!OPENAI_API_KEY) {
          throw new Error('OpenAI API anahtarı gerekli. Ayarlardan ekleyin.');
     }

     const prompt = `Sen bir rüzgar enerjisi yatırım danışmanısın. Aşağıdaki teknik ve ekonomik verilere göre, yatırımcıya hitap eden, profesyonel ama anlaşılır bir paragraf yaz.

Paragrafta şunları belirt:
1. Bu lokasyonun rüzgar potansiyeli hakkında kısa değerlendirme
2. Yıllık tahmini gelir ve geri ödeme süresi
3. NPV pozitif mi negatif mi, yatırım mantıklı mı
4. Risk değerlendirmesi (IRR'ye göre)
5. Alternatif öneriler veya dikkat edilmesi gerekenler

VERİLER:
${JSON.stringify(analysisData, null, 2)}

KURALLAR:
- Türkçe yaz
- Tek paragraf olsun (maksimum 150 kelime)
- Sayıları kullan ama çok teknik olma
- Yatırımcıya doğrudan hitap et
- Olumlu veya olumsuz net bir sonuç ver`;

     try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
               method: 'POST',
               headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
               },
               body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                         {
                              role: 'system',
                              content: 'Sen deneyimli bir rüzgar enerjisi yatırım danışmanısın. Teknik verileri anlaşılır şekilde analiz edip yatırımcılara net öneriler sunuyorsun.'
                         },
                         {
                              role: 'user',
                              content: prompt
                         }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
               })
          });

          if (!response.ok) {
               const error = await response.json();
               throw new Error(error.error?.message || `API Hatası: ${response.status}`);
          }

          const data = await response.json();
          return {
               success: true,
               analysis: data.choices[0].message.content,
               model: data.model,
               usage: data.usage
          };

     } catch (error) {
          console.error('GPT Analiz Hatası:', error);
          return {
               success: false,
               error: error.message
          };
     }
}

/**
 * Fallback: API olmadan basit analiz
 */
export function generateBasicAnalysis(data) {
     const { ekonomi, uretim, ruzgar, konum } = data;

     const isPositive = ekonomi.yatirimOneri === 'Yatırım Önerilir';
     const isCautious = ekonomi.yatirimOneri === 'Dikkatli Değerlendir';

     if (isPositive) {
          return `Bu lokasyon (${konum.koordinatlar}) rüzgar enerjisi yatırımı için **olumlu** görünmektedir. ${ruzgar.ortalamaHiz} ortalama rüzgar hızı ve ${uretim.kapasiteFaktoru} kapasite faktörü ile yıllık ${ekonomi.yillikGelir} gelir elde edilebilir. ${ekonomi.toplamYatirim} yatırım, yaklaşık ${ekonomi.geriOdeme}'de geri dönecektir. NPV ${ekonomi.NPV} ve IRR ${ekonomi.IRR} değerleri yatırımın karlı olduğunu göstermektedir. LCOE ${ekonomi.LCOE} ile piyasa fiyatlarıyla rekabetçi bir üretim maliyeti elde edilebilir.`;
     } else if (isCautious) {
          return `Bu lokasyonda yatırım yapılabilir ancak dikkatli değerlendirme gerekir. ${ruzgar.ortalamaHiz} rüzgar hızı orta seviyededir. ${ekonomi.geriOdeme} geri ödeme süresi proje ömrünün önemli bir kısmını oluşturmaktadır. NPV ${ekonomi.NPV} pozitif olsa da, marjinal kar marjı nedeniyle elektrik fiyatlarındaki değişimler projeyi etkileyebilir.`;
     } else {
          return `Mevcut koşullarda bu lokasyonda yatırım **önerilmemektedir**. ${ruzgar.ortalamaHiz} rüzgar hızı hedeflenen üretim için yetersizdir. NPV ${ekonomi.NPV} negatif değer göstermekte, bu da yatırımın zarar edeceğini işaret etmektedir. Daha yüksek rüzgar potansiyeline sahip alternatif lokasyonlar değerlendirilmelidir.`;
     }
}
