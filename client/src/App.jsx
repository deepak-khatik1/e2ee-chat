import React, { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import {
  generateRSAKeyPair,
  exportPublicKey,
  importPublicKey,
  rsaEncrypt,
  rsaDecrypt,
  generateAESKey,
  exportAESKey,
  importAESKey,
  aesEncrypt,
  aesDecrypt,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './crypto'

const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000')

export default function App() {
  const [userId, setUserId] = useState('')
  const rsaKeyPair = useRef(null)
  const [publicKeyPem, setPublicKeyPem] = useState('')
  const [isRegistered, setIsRegistered] = useState(false)

  const [peerId, setPeerId] = useState('')
  const [peerPublicKeyPem, setPeerPublicKeyPem] = useState('')
  const peerPublicKey = useRef(null)
  const [isPeerKeyValid, setIsPeerKeyValid] = useState(false)

  const [message, setMessage] = useState('')
  const [chatLog, setChatLog] = useState([])

  const [activeUsers, setActiveUsers] = useState([])

  // Chat box reference for auto-scrolling
  const chatBoxRef = useRef(null)

  // Auto-scroll effect
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
    }
  }, [chatLog]) // Trigger when chat log changes

  // Update the page title with the current username
  useEffect(() => {
    document.title = userId ? `SecureChat - ${userId}` : 'SecureChat'
  }, [userId]) // Update when userId changes

  useEffect(() => {
    socket.on('your_id', (id) => {
      if (!isRegistered) {
        setUserId(id)
        alert(`Your user ID is ${id}`)
      }
    })

    socket.on('your_registered_id', (regId) => {
      setUserId(regId)
      setIsRegistered(true)
    })

    return () => {
      socket.off('your_id')
      socket.off('your_registered_id')
    }
  }, [isRegistered])

  useEffect(() => {
    const handleUpdateUsers = (users) => {
      const otherUsers = users.filter((user) => user.userId !== userId)
      setActiveUsers(otherUsers)
    }

    socket.on('update_users', handleUpdateUsers)

    return () => socket.off('update_users', handleUpdateUsers)
  }, [userId])

  async function registerUser() {
    if (!userId) {
      alert('Please enter your User ID')
      return
    }

    if (!rsaKeyPair.current) {
      const keyPair = await generateRSAKeyPair()
      rsaKeyPair.current = keyPair

      const exportedPubKey = await exportPublicKey(keyPair.publicKey)
      setPublicKeyPem(exportedPubKey)

      socket.emit('register', { userId, publicKeyPem: exportedPubKey })
    } else {
      socket.emit('register', { userId, publicKeyPem: publicKeyPem })
    }
  }

  useEffect(() => {
    if (!peerPublicKeyPem) {
      peerPublicKey.current = null
      setIsPeerKeyValid(false)
      return
    }

    ;(async () => {
      try {
        peerPublicKey.current = await importPublicKey(peerPublicKeyPem)
        setIsPeerKeyValid(true)
      } catch (e) {
        console.error('Failed to import peer public key', e)
        peerPublicKey.current = null
        setIsPeerKeyValid(false)
      }
    })()
  }, [peerPublicKeyPem])

  useEffect(() => {
    const handleReceive = async ({
      fromUserId,
      encryptedAESKey,
      encryptedMessage,
      iv,
    }) => {
      try {
        if (!rsaKeyPair.current || !rsaKeyPair.current.privateKey) {
          throw new Error('RSA private key not loaded for decryption.')
        }

        const encryptedAESKeyBytes = base64ToUint8Array(encryptedAESKey)
        const aesKeyRaw = await rsaDecrypt(
          rsaKeyPair.current.privateKey,
          encryptedAESKeyBytes
        )
        const aesKey = await importAESKey(new Uint8Array(aesKeyRaw))

        const ciphertextBytes = base64ToUint8Array(encryptedMessage)
        const ivBytes = base64ToUint8Array(iv)
        const plaintext = await aesDecrypt(aesKey, ciphertextBytes, ivBytes)

        setChatLog((log) => [...log, { sender: fromUserId, text: plaintext }])
      } catch (e) {
        console.error('Error decrypting message', e)
        setChatLog((log) => [
          ...log,
          {
            sender: fromUserId,
            text: '(⚠️ Undecryptable message)',
            encryptedPreview: encryptedMessage.slice(0, 100) + '...',
          },
        ])
      }
    }

    socket.on('receive_message', handleReceive)
    return () => socket.off('receive_message', handleReceive)
  }, [])

  async function sendMessage() {
    if (!peerPublicKey.current) {
      alert("Set peer's public key first!")
      return
    }
    if (!message) return

    const aesKey = await generateAESKey()
    const { ciphertext, iv } = await aesEncrypt(aesKey, message)
    const aesKeyRaw = await exportAESKey(aesKey)
    const encryptedAESKeyBuffer = await rsaEncrypt(
      peerPublicKey.current,
      aesKeyRaw
    )

    socket.emit('send_message', {
      toUserId: peerId,
      encryptedAESKey: uint8ArrayToBase64(
        new Uint8Array(encryptedAESKeyBuffer)
      ),
      encryptedMessage: uint8ArrayToBase64(ciphertext),
      iv: uint8ArrayToBase64(iv),
    })

    setChatLog((log) => [...log, { sender: 'Me', text: message }])
    setMessage('')
  }

  const selectPeer = (user) => {
    setPeerId(user.userId)
    setPeerPublicKeyPem(user.publicKeyPem)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 text-gray-100 flex flex-col items-center p-6">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-2">
          <span className="bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
            SecureChat
          </span>
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          End-to-End Encrypted Messaging
        </p>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-6xl">
        {/* Left Panel */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 shadow-lg shadow-purple-800/20">
          <h2 className="text-xl font-semibold text-purple-400 mb-4">
            Your Account
          </h2>
          <label className="block text-sm text-gray-300 mb-1">Username</label>
          <input
            type="text"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 mb-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter your name"
            readOnly={isRegistered}
          />
          <button
            onClick={registerUser}
            disabled={isRegistered}
            className={`w-full py-2 rounded-lg font-semibold transition ${
              isRegistered
                ? 'bg-gray-700 cursor-not-allowed'
                : 'cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-500 hover:opacity-90'
            }`}
          >
            {isRegistered ? 'Registered' : 'Register & Generate Keys'}
          </button>

          <div className="mt-4">
            <label className="block text-sm text-gray-300 mb-1">
              Your Public Key
              <span className="text-cyan-400 text-xs ml-1">
                (share with peers)
              </span>
            </label>
            <textarea
              readOnly
              rows="5"
              value={publicKeyPem}
              className="w-full bg-gray-900 border border-gray-700 text-xs font-mono p-2 rounded-lg resize-none"
            />
          </div>

          <div className="mt-5 border-t border-gray-700 pt-4">
            <h3 className="inline-flex text-lg text-cyan-400 mb-2 items-center gap-1">
              Active Users
            </h3>
            <span className="text-gray-300 text-xs ml-1">
              (Click on a user to chat)
            </span>
            <div className="h-48 overflow-y-auto bg-gray-900 rounded-lg p-2 border border-gray-700">
              {isRegistered ? (
                activeUsers.length ? (
                  activeUsers.map((u) => (
                    <div
                      key={u.userId}
                      onClick={() => selectPeer(u)}
                      className={`px-3 py-2 rounded-lg cursor-pointer mb-1 transition truncate ${
                        u.userId === peerId
                          ? 'bg-purple-600 text-white'
                          : 'hover:bg-gray-700'
                      }`}
                    >
                      <svg
                        className="w-8 inline invert-10 bg-white rounded-full p-1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 640 640"
                      >
                        <path d="M320 312C386.3 312 440 258.3 440 192C440 125.7 386.3 72 320 72C253.7 72 200 125.7 200 192C200 258.3 253.7 312 320 312zM290.3 368C191.8 368 112 447.8 112 546.3C112 562.7 125.3 576 141.7 576L498.3 576C514.7 576 528 562.7 528 546.3C528 447.8 448.2 368 349.7 368L290.3 368z" />
                      </svg>{' '}
                      &nbsp; {u.userId}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">
                    No active users available
                  </p>
                )
              ) : (
                <p className="text-red-500 text-sm">
                  Register to see active peers
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 shadow-lg shadow-purple-800/20">
          <h2 className="text-xl font-semibold text-purple-400 mb-4">
            Encrypted Chat
          </h2>

          <label className="block text-sm text-gray-300 mb-1">
            Peer Username
          </label>
          <input
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 mb-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
            value={peerId}
            onChange={(e) => setPeerId(e.target.value)}
            readOnly={true}
          />

          <label className="block text-sm text-gray-300 mb-1">
            Peer Public Key
          </label>
          <textarea
            rows="5"
            value={peerPublicKeyPem}
            onChange={(e) => setPeerPublicKeyPem(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-xs font-mono p-2 rounded-lg resize-none mb-3"
          />
          {!isPeerKeyValid && peerPublicKeyPem && (
            <p className="text-red-500 text-xs mb-2">Invalid peer key format</p>
          )}

          {/* Chat area with auto scroll */}
          <div
            ref={chatBoxRef}
            className="h-64 bg-gray-900 border border-gray-700 rounded-lg p-3 overflow-y-auto mb-3"
          >
            {chatLog.length === 0 ? (
              <p className="text-gray-500 text-center mt-10">
                No messages yet — start a secure conversation.
              </p>
            ) : (
              chatLog.map((msg, i) => (
                <div
                  key={i}
                  className={`mb-2 ${
                    msg.sender === 'Me' ? 'text-right' : 'text-left'
                  }`}
                >
                  <span
                    className={`block font-semibold ${
                      msg.sender === 'Me' ? 'text-cyan-400' : 'text-purple-400'
                    }`}
                  >
                    {msg.sender}
                  </span>
                  <span
                    className={`inline-block px-3 py-2 rounded-lg text-sm ${
                      msg.sender === 'Me'
                        ? 'bg-purple-700 text-white'
                        : 'bg-gray-700 text-gray-100'
                    }`}
                  >
                    {msg.text}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 flex-col sm:flex-row items-stretch sm:items-center max-w-full overflow-hidden p-1 rounded-lg">
            <input
              type="text"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
            />
            <button
              onClick={sendMessage}
              disabled={!isPeerKeyValid || !message || !isRegistered}
              className={`px-4 py-2 rounded-lg font-semibold transition ${
                !isPeerKeyValid || !message || !isRegistered
                  ? 'bg-gray-700 cursor-not-allowed'
                  : 'cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-500 hover:opacity-90'
              }`}
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Messages are end-to-end encrypted 🔒
          </p>
        </div>
      </div>
    </div>
  )
}
