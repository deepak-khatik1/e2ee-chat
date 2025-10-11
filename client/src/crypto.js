// crypto.js

// Convert ArrayBuffer to base64 string
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

// Convert base64 string to Uint8Array
export function base64ToUint8Array(base64) {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// Format base64 string as PEM (64 chars per line)
function formatAsPem(base64String) {
  return base64String.match(/.{1,64}/g).join('\n')
}

// Generate RSA key pair for encryption (RSA-OAEP with SHA-256)
export async function generateRSAKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  )
}

// Export public key to PEM format
export async function exportPublicKey(key) {
  const spki = await window.crypto.subtle.exportKey('spki', key)
  const base64 = arrayBufferToBase64(spki)
  return `-----BEGIN PUBLIC KEY-----\n${formatAsPem(
    base64
  )}\n-----END PUBLIC KEY-----`
}

// Import PEM formatted RSA public key
export async function importPublicKey(pem) {
  // Remove PEM header/footer and line breaks
  const b64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')

  const binaryDer = base64ToUint8Array(b64)

  return await window.crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  )
}

// RSA encrypt data with public key (input: ArrayBuffer or Uint8Array)
export async function rsaEncrypt(publicKey, data) {
  return await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    data
  )
}

// RSA decrypt data with private key (input: ArrayBuffer or Uint8Array)
export async function rsaDecrypt(privateKey, data) {
  return await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    privateKey,
    data
  )
}

// Generate AES key (AES-CBC or AES-GCM, here AES-GCM)
export async function generateAESKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

// Export AES key as raw bytes (Uint8Array)
export async function exportAESKey(key) {
  const raw = await window.crypto.subtle.exportKey('raw', key)
  return new Uint8Array(raw)
}

// Import AES key from raw bytes (Uint8Array)
export async function importAESKey(rawKey) {
  return await window.crypto.subtle.importKey('raw', rawKey, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ])
}

// AES-GCM encrypt plaintext string
export async function aesEncrypt(key, plaintext) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)

  const iv = window.crypto.getRandomValues(new Uint8Array(12)) // 96-bit nonce for AES-GCM

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
  }
}

// AES-GCM decrypt ciphertext Uint8Array, returns plaintext string
export async function aesDecrypt(key, ciphertext, iv) {
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    ciphertext
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

// Convert Uint8Array to base64 string
export function uint8ArrayToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}
