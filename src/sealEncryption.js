/**
 * WEIAP - Seal Şifreleme Modülü
 * Merkeziyetsiz gizlilik için Seal SDK entegrasyonu
 * Testnet konfigürasyonu
 */

import { SealClient, SessionKey } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/bcs';

// Sui Testnet istemcisi
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

// Seal Testnet Key Servers
const TESTNET_KEY_SERVERS = [
     {
          objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
          weight: 1
     },
     {
          objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
          weight: 1
     }
];

// Seal istemcisi
let sealClient = null;

/**
 * Seal istemcisini başlat
 */
export function initSealClient() {
     if (!sealClient) {
          sealClient = new SealClient({
               suiClient,
               serverConfigs: TESTNET_KEY_SERVERS,
               verifyKeyServers: false // Testnet için
          });
          console.log('🔐 Seal client başlatıldı');
     }
     return sealClient;
}

/**
 * Veriyi Seal ile şifrele
 * @param {Uint8Array} data - Şifrelenecek veri
 * @param {string} packageId - Move sözleşme adresi
 * @param {string} scopeId - Erişim kontrolü için ID
 * @returns {Object} - Şifrelenmiş veri ve metadata
 */
export async function encryptWithSeal(data, packageId, scopeId) {
     const client = initSealClient();

     console.log('🔒 Seal ile şifreleniyor...');
     console.log(`   Package: ${packageId}`);
     console.log(`   Scope: ${scopeId}`);

     try {
          const { encryptedObject } = await client.encrypt({
               data: data,
               packageId: packageId,
               id: scopeId,
               threshold: 2, // 2-of-N eşik
          });

          console.log('✅ Şifreleme başarılı');

          return {
               success: true,
               encryptedData: encryptedObject,
               packageId,
               scopeId
          };

     } catch (error) {
          console.error('❌ Şifreleme hatası:', error);
          return {
               success: false,
               error: error.message
          };
     }
}

/**
 * Seal ile şifrelenmiş veriyi çöz
 * @param {Uint8Array} encryptedData - Şifreli veri
 * @param {string} packageId - Move sözleşme adresi
 * @param {Object} signer - Cüzdan imzalayıcı
 * @returns {Uint8Array} - Çözülmüş veri
 */
export async function decryptWithSeal(encryptedData, packageId, signer) {
     const client = initSealClient();

     console.log('🔓 Seal ile şifre çözülüyor...');

     try {
          // Session key oluştur
          const sessionKey = new SessionKey({
               address: await signer.getAddress(),
               packageId: packageId,
               ttlMin: 10 // 10 dakika geçerli
          });

          // Session key'i imzala
          await sessionKey.setPersonalMessage();
          const signature = await signer.signPersonalMessage({
               message: sessionKey.getPersonalMessage()
          });
          sessionKey.setSignature(signature);

          // Şifre çöz
          const decryptedData = await client.decrypt({
               data: encryptedData,
               sessionKey: sessionKey,
               txBytes: new Uint8Array() // Basit erişim için boş tx
          });

          console.log('✅ Şifre çözme başarılı');
          return decryptedData;

     } catch (error) {
          console.error('❌ Şifre çözme hatası:', error);
          throw error;
     }
}

/**
 * Basit şifreleme (Seal olmadan, AES-GCM)
 * Seal Move sözleşmesi gerekmedığinde kullanılır
 * @param {Uint8Array} data - Şifrelenecek veri
 * @param {string} password - Şifre
 * @returns {Object} - Şifrelenmiş veri ve IV
 */
export async function simpleEncrypt(data, password) {
     const encoder = new TextEncoder();
     const keyMaterial = await crypto.subtle.importKey(
          'raw',
          encoder.encode(password),
          'PBKDF2',
          false,
          ['deriveKey']
     );

     const salt = crypto.getRandomValues(new Uint8Array(16));
     const key = await crypto.subtle.deriveKey(
          {
               name: 'PBKDF2',
               salt: salt,
               iterations: 100000,
               hash: 'SHA-256'
          },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt']
     );

     const iv = crypto.getRandomValues(new Uint8Array(12));
     const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          data
     );

     // Salt + IV + şifreli veriyi birleştir
     const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
     result.set(salt, 0);
     result.set(iv, salt.length);
     result.set(new Uint8Array(encrypted), salt.length + iv.length);

     return {
          encryptedData: result,
          format: 'aes-gcm-256'
     };
}

/**
 * Basit şifre çözme
 * @param {Uint8Array} encryptedData - Şifrelenmiş veri (salt + iv + data)
 * @param {string} password - Şifre
 * @returns {Uint8Array} - Çözülmüş veri
 */
export async function simpleDecrypt(encryptedData, password) {
     const encoder = new TextEncoder();

     const salt = encryptedData.slice(0, 16);
     const iv = encryptedData.slice(16, 28);
     const data = encryptedData.slice(28);

     const keyMaterial = await crypto.subtle.importKey(
          'raw',
          encoder.encode(password),
          'PBKDF2',
          false,
          ['deriveKey']
     );

     const key = await crypto.subtle.deriveKey(
          {
               name: 'PBKDF2',
               salt: salt,
               iterations: 100000,
               hash: 'SHA-256'
          },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
     );

     const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          key,
          data
     );

     return new Uint8Array(decrypted);
}

// Export
export { suiClient, sealClient };
