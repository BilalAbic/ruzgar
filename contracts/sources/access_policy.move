// WEIAP Seal Access Policy
// Bu sözleşme, Seal şifre çözme erişimini kontrol eder
// Basit versiyon: Herkes erişebilir (demo amaçlı)

module weiap::access_policy {
    use sui::tx_context::TxContext;

    /// Seal tarafından çağrılan zorunlu fonksiyon
    /// Bu basit politika herkese erişim verir
    /// Gerçek uygulamada NFT sahipliği, whitelist vb. kontrol edilebilir
    public entry fun seal_approve(
        _scope_id: vector<u8>,
        _ctx: &TxContext
    ) {
        // Basit versiyon: Tüm isteklere izin ver
        // İleride buraya erişim kontrolleri eklenebilir:
        // - NFT sahipliği kontrolü
        // - Whitelist kontrolü
        // - Ödeme kontrolü
        // - Zaman bazlı kontrol
    }
}
