/**
 * WEIAP - PDF Export Modülü
 * jsPDF ile analiz sonuçlarını PDF'e dönüştürür
 */

import { jsPDF } from 'jspdf';

/**
 * Analiz verilerini PDF'e dönüştür
 * @param {Object} data - Analiz verileri
 * @returns {Uint8Array} - PDF dosyası byte array olarak
 */
export function generateAnalysisPDF(data) {
     const {
          location,
          windData,
          turbine,
          aep,
          financials,
          aiAnalysis
     } = data;

     const doc = new jsPDF();
     const pageWidth = doc.internal.pageSize.getWidth();
     let y = 20;

     // Başlık
     doc.setFontSize(22);
     doc.setTextColor(6, 182, 212); // Cyan
     doc.text('WEIAP', pageWidth / 2, y, { align: 'center' });
     y += 8;

     doc.setFontSize(12);
     doc.setTextColor(100);
     doc.text('Rüzgar Enerjisi Fizibilite Analizi', pageWidth / 2, y, { align: 'center' });
     y += 15;

     // Tarih
     doc.setFontSize(10);
     doc.setTextColor(150);
     doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth / 2, y, { align: 'center' });
     y += 15;

     // Çizgi
     doc.setDrawColor(6, 182, 212);
     doc.setLineWidth(0.5);
     doc.line(20, y, pageWidth - 20, y);
     y += 15;

     // Konum Bilgisi
     doc.setFontSize(14);
     doc.setTextColor(30);
     doc.text('📍 Konum Bilgisi', 20, y);
     y += 10;

     doc.setFontSize(11);
     doc.setTextColor(60);
     if (location) {
          doc.text(`Koordinatlar: ${location.lat.toFixed(4)}°N, ${location.lng.toFixed(4)}°E`, 25, y);
          y += 7;
          doc.text(`Ülke: ${location.country || 'Bilinmiyor'}`, 25, y);
          y += 12;
     }

     // Rüzgar Verileri
     doc.setFontSize(14);
     doc.setTextColor(30);
     doc.text('💨 Rüzgar Verileri', 20, y);
     y += 10;

     doc.setFontSize(11);
     doc.setTextColor(60);
     if (windData) {
          doc.text(`Ortalama Hız: ${windData.avgSpeed?.toFixed(2) || '—'} m/s`, 25, y);
          y += 7;
          doc.text(`Maksimum Hız: ${windData.maxSpeed?.toFixed(2) || '—'} m/s`, 25, y);
          y += 7;
          doc.text(`Hakim Yön: ${windData.dominantDirection || '—'}`, 25, y);
          y += 12;
     }

     // Türbin Bilgisi
     doc.setFontSize(14);
     doc.setTextColor(30);
     doc.text('⚙️ Türbin Konfigürasyonu', 20, y);
     y += 10;

     doc.setFontSize(11);
     doc.setTextColor(60);
     if (turbine) {
          doc.text(`Model: ${turbine.name}`, 25, y);
          y += 7;
          doc.text(`Nominal Güç: ${turbine.ratedPower} kW`, 25, y);
          y += 7;
          doc.text(`Hub Yüksekliği: ${turbine.hubHeight} m`, 25, y);
          y += 12;
     }

     // Enerji Üretimi
     doc.setFontSize(14);
     doc.setTextColor(30);
     doc.text('⚡ Yıllık Enerji Üretimi (AEP)', 20, y);
     y += 10;

     doc.setFontSize(11);
     doc.setTextColor(60);
     if (aep) {
          doc.text(`Brüt AEP: ${aep.grossAEP?.toLocaleString('tr-TR') || '—'} MWh/yıl`, 25, y);
          y += 7;
          doc.text(`Net AEP: ${aep.netAEP?.toLocaleString('tr-TR') || '—'} MWh/yıl`, 25, y);
          y += 7;
          doc.text(`Kapasite Faktörü: ${((aep.capacityFactor || 0) * 100).toFixed(1)}%`, 25, y);
          y += 12;
     }

     // Ekonomik Analiz
     doc.setFontSize(14);
     doc.setTextColor(30);
     doc.text('💰 Ekonomik Fizibilite', 20, y);
     y += 10;

     doc.setFontSize(11);
     doc.setTextColor(60);
     if (financials) {
          // Özet Metrikler (Daha basit ve net)
          doc.text(`Toplam Yatırım: $${(financials.totalCapex / 1e6).toFixed(2)}M`, 25, y);
          y += 7;
          doc.text(`Yıllık Gelir: $${(financials.annualRevenue / 1e6).toFixed(2)}M`, 25, y);
          y += 7;
          doc.text(`Geri Ödeme Süresi: ${financials.simplePayback?.toFixed(1) || '—'} yıl`, 25, y);
          y += 12;


          // Yatırım Önerisi
          doc.setFontSize(12);
          const recColor = financials.recommendation === 'Yatırım Önerilir' ? [34, 197, 94] :
               financials.recommendation === 'Dikkatli Değerlendir' ? [234, 179, 8] : [239, 68, 68];
          doc.setTextColor(...recColor);
          doc.text(`Öneri: ${financials.recommendation || '—'}`, 25, y);
          y += 15;
     }

     // AI Analizi
     if (aiAnalysis) {
          doc.setFontSize(14);
          doc.setTextColor(30);
          doc.text('🤖 AI Yatırım Değerlendirmesi', 20, y);
          y += 10;

          doc.setFontSize(10);
          doc.setTextColor(80);

          // Metni satırlara böl
          const lines = doc.splitTextToSize(aiAnalysis, pageWidth - 50);
          doc.text(lines, 25, y);
          y += lines.length * 5 + 10;
     }

     // Footer
     doc.setFontSize(9);
     doc.setTextColor(150);
     doc.text('Bu rapor WEIAP (Wind Energy Investment Analysis Platform) tarafından oluşturulmuştur.', pageWidth / 2, 280, { align: 'center' });
     doc.text('Walrus Merkeziyetsiz Depolama ile saklanmaktadır.', pageWidth / 2, 285, { align: 'center' });

     // PDF'i Uint8Array olarak döndür
     const pdfOutput = doc.output('arraybuffer');
     return new Uint8Array(pdfOutput);
}

/**
 * PDF'i indir (tarayıcıda)
 */
export function downloadPDF(data, filename = 'weiap-analiz.pdf') {
     const pdfBytes = generateAnalysisPDF(data);
     const blob = new Blob([pdfBytes], { type: 'application/pdf' });
     const url = URL.createObjectURL(blob);

     const a = document.createElement('a');
     a.href = url;
     a.download = filename;
     a.click();

     URL.revokeObjectURL(url);
}
