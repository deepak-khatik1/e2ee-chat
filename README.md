# SecureChat

## Links

* (Github Repo) https://github.com/deepak-khatik1/e2ee-chat
* (Production) https://e2ee-secure-chat.vercel.app

---
This app is a **real-time, end-to-end encrypted chat application** using **React**, **Node.js**, **Socket.IO**, and **Web Crypto API** (for cryptography).

It’s designed so that **messages are encrypted on the sender’s device and decrypted only on the receiver’s device**, meaning the server never sees any plaintext messages or keys.

---

## 🧠 1. Overview of the Architecture

### Components:

1. **Frontend (React App - `App.jsx`)**

   * Handles user interface, key generation, encryption/decryption, and Socket.IO client logic.
   * Uses **Web Crypto API** for RSA and AES encryption.

2. **Backend (Node.js - `server.js`)**

   * Manages user connections, broadcasting user lists, and message routing.
   * **Does not perform encryption/decryption** — it just passes encrypted data between clients.

3. **Crypto Module (crypto.js)**

   * Implements cryptographic helper functions:

     * RSA key generation, import/export, encryption/decryption
     * AES key generation, encryption/decryption
     * Base64 encoding/decoding utilities for data transmission

---

## 🔒 2. Cryptography Used

### a) **RSA (Asymmetric Encryption)**

Used to encrypt the AES key.

* **Algorithm:** RSA-OAEP (Optimal Asymmetric Encryption Padding)
* **Key size:** 2048 bits
* **Hash function:** SHA-256
* **Usage:**

  * Each user generates their own RSA key pair.
  * Public key is shared with peers (and stored on the server for broadcasting).
  * Private key stays securely in the browser (never leaves).

#### Example:

* Alice wants to send a message to Bob.

  * Alice encrypts a randomly generated AES key with **Bob’s public key** using RSA-OAEP.
  * Only Bob can decrypt that AES key using his **private key**.

---

### b) **AES (Symmetric Encryption)**

Used to encrypt the **actual chat message**.

* **Algorithm:** AES-GCM (Galois/Counter Mode)
* **Key length:** 256 bits
* **Features:**

  * Provides both **confidentiality** and **integrity** (detects tampering).
  * Uses a 12-byte **IV (Initialization Vector)** generated randomly per message.

#### Example:

* Alice encrypts her plaintext message using AES-GCM with a random AES key and IV.
* The resulting ciphertext + IV are sent (in base64 form).

---

### c) **Base64 Encoding**

Since binary data can’t be directly transmitted via WebSocket (Socket.IO) easily, it’s encoded using **base64**:

* AES ciphertext, RSA-encrypted AES key, and IV are all converted to base64 strings before sending.
* On receipt, they’re converted back to `Uint8Array` for decryption.

---

## 🔄 3. Data Flow in the App

Let’s follow the **message flow** step-by-step between two users — **Alice** and **Bob**.

---

### **Step 1: Connection & Registration**

* When a user connects to the server, they receive a temporary socket ID:

  ```js
  socket.on("your_id", id => setUserId(id))
  ```
* The user generates a **RSA key pair**:

  ```js
  generateRSAKeyPair()
  ```
* Then, the public key is exported as **PEM format** and sent to the server:

  ```js
  socket.emit("register", { userId, publicKeyPem })
  ```

---

### **Step 2: Server Management of Users**

The server (`server.js`) maintains:

```js
const activeUsers = new Map(); // userId => { socketId, publicKeyPem }
```

When a user registers:

1. The server saves their `socketId` and `publicKeyPem`.
2. It then broadcasts an updated list of all active users (with their public keys) to every client:

   ```js
   io.emit("update_users", usersForClient)
   ```

So, everyone always knows who is online and has access to their **public keys**.

---

### **Step 3: Selecting a Peer**

In the frontend, users can click an “Active User” to select them as a chat peer:

```js
setPeerId(user.userId)
setPeerPublicKeyPem(user.publicKeyPem)
```

This means the sender (say Alice) now has **Bob’s public key**.

---

### **Step 4: Sending an Encrypted Message**

When Alice types a message and clicks **Send**:

1. **Generate AES Key:**

   ```js
   const aesKey = await generateAESKey()
   ```

2. **Encrypt the message using AES-GCM:**

   ```js
   const { ciphertext, iv } = await aesEncrypt(aesKey, message)
   ```

3. **Export AES key and encrypt it using Bob’s RSA public key:**

   ```js
   const aesKeyRaw = await exportAESKey(aesKey)
   const encryptedAESKeyBuffer = await rsaEncrypt(peerPublicKey.current, aesKeyRaw)
   ```

4. **Convert all binary data to base64:**

   ```js
   encryptedAESKey = uint8ArrayToBase64(new Uint8Array(encryptedAESKeyBuffer))
   encryptedMessage = uint8ArrayToBase64(ciphertext)
   ivBase64 = uint8ArrayToBase64(iv)
   ```

5. **Send via Socket.IO:**

   ```js
   socket.emit("send_message", {
     toUserId: peerId,
     encryptedAESKey,
     encryptedMessage,
     iv
   })
   ```

At this point, the **server just relays** the encrypted message to the recipient’s socket:

```js
recipientSocket.emit("receive_message", {...})
```

The server does **not decrypt or inspect** the message content.

---

### **Step 5: Receiving and Decrypting**

On Bob’s side, the app listens for `receive_message`:

1. Bob receives:

   * `encryptedAESKey` (RSA-encrypted AES key)
   * `encryptedMessage` (AES ciphertext)
   * `iv` (initialization vector)

2. **Decrypt AES key with his private RSA key:**

   ```js
   const aesKeyRaw = await rsaDecrypt(privateKey, encryptedAESKeyBytes)
   const aesKey = await importAESKey(new Uint8Array(aesKeyRaw))
   ```

3. **Decrypt the message using AES-GCM:**

   ```js
   const plaintext = await aesDecrypt(aesKey, ciphertextBytes, ivBytes)
   ```

4. Finally, the decrypted message is displayed in the chat log.

---

## 🔁 4. Message Lifecycle Summary

| Stage | Operation             | Encryption Used                   | Performed By               | Data Visible To |
| ----- | --------------------- | --------------------------------- | -------------------------- | --------------- |
| 1     | Generate RSA key pair | RSA-OAEP                          | Client                     | Only user       |
| 2     | Share public key      | PEM text                          | Client → Server → Everyone | Everyone        |
| 3     | Generate AES key      | AES-GCM                           | Sender                     | Sender          |
| 4     | Encrypt message       | AES-GCM                           | Sender                     | Sender          |
| 5     | Encrypt AES key       | RSA-OAEP (receiver’s pubkey)      | Sender                     | Sender          |
| 6     | Send via Socket.IO    | (No encryption by server)         | Server relays              | Encrypted only  |
| 7     | Decrypt AES key       | RSA-OAEP (receiver’s private key) | Receiver                   | Receiver        |
| 8     | Decrypt message       | AES-GCM                           | Receiver                   | Receiver        |

---

## ⚙️ 5. Security Properties

✅ **End-to-End Encryption:**
Only the sender and receiver have the keys needed to decrypt.

✅ **Perfect Forward Secrecy (Partial):**
Each message uses a **new AES key**, so compromising one message doesn’t decrypt others.

✅ **Integrity:**
AES-GCM ensures the message hasn’t been modified.

❌ **No Authentication/Signature:**
RSA-OAEP only ensures confidentiality, not sender authenticity. A malicious server could theoretically impersonate someone (a fix would be to use **RSA-PSS** for signatures).

---

## 📦 6. Technologies Used

| Component    | Library/Standard    | Role                             |
| ------------ | ------------------- | -------------------------------- |
| Frontend     | React               | UI + encryption logic            |
| Backend      | Express + Socket.IO | Real-time communication          |
| Cryptography | Web Crypto API      | RSA + AES                        |
| Encoding     | Base64              | Transfer binary data via sockets |
| Styling      | Tailwind CSS        | UI design                        |

---

## 🧩 7. Key Takeaways

* **Encryption Algorithms Used:**

  * RSA-OAEP (asymmetric)
  * AES-GCM (symmetric)
* **Key Management:**

  * RSA keys generated per user in browser
  * AES keys generated per message
  * Public keys shared; private keys never transmitted
* **Server Role:**

  * Message relay only — no decryption
* **End-to-End Security:**

  * Guaranteed because encryption/decryption happen client-side

---

## 🎯 8. In Short

> “This app demonstrates **end-to-end encrypted real-time messaging** using a hybrid cryptosystem — RSA for key exchange and AES-GCM for message encryption. The backend acts as a relay, while all cryptographic operations occur on the client, ensuring complete message confidentiality.”

---
