// --server.js

const dotenv = require("dotenv");
dotenv.config();

const cors = require("cors");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "*",
    })
);

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
    },
});

// NEW: Maintain a map of active users (userId => { socketId, publicKeyPem })
const activeUsers = new Map(); // userId => { socketId, publicKeyPem }

/**
 * Broadcasts the list of active users (including their public keys)
 * to all connected clients.
 */
function broadcastUserList() {
    // Convert the map values to a list of user objects for the client
    const usersForClient = Array.from(activeUsers.entries()).map(
        ([userId, userData]) => ({
            userId: userId,
            publicKeyPem: userData.publicKeyPem,
        })
    );
    io.emit("update_users", usersForClient);
    console.log(
        `Broadcasting updated user list. Total users: ${activeUsers.size}`
    );
}

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Send socket id to client on connection (might be used as temp userId)
    socket.emit("your_id", socket.id);

    // Store the socket ID to userId mapping for easy lookup during disconnect
    let currentUserId = socket.id; // Start with socket.id as temp ID

    // Listen for user registration
    socket.on("register", ({ userId, publicKeyPem }) => {
        if (!userId || !publicKeyPem) return;

        // 1. Remove old entry if this socket was registered with a different ID before
        if (
            currentUserId !== socket.id &&
            activeUsers.has(currentUserId) &&
            activeUsers.get(currentUserId).socketId === socket.id
        ) {
            activeUsers.delete(currentUserId);
        }

        // 2. Update currentUserId tracker
        currentUserId = userId;

        // 3. Register the new user/key
        activeUsers.set(userId, {
            socketId: socket.id,
            publicKeyPem: publicKeyPem,
        });
        console.log(`User registered: ${userId} with Socket ID: ${socket.id}`);

        // Confirm registration back to client
        socket.emit("your_registered_id", userId);

        // 4. Broadcast the updated list
        broadcastUserList();
    });

    // Handle sending messages to other users by their userId
    socket.on(
        "send_message",
        ({ toUserId, encryptedAESKey, encryptedMessage, iv }) => {
            // Find socket of recipient userId using the activeUsers map
            const recipientData = activeUsers.get(toUserId);

            if (recipientData) {
                const recipientSocket = io.sockets.sockets.get(
                    recipientData.socketId
                );

                if (recipientSocket) {
                    recipientSocket.emit("receive_message", {
                        // The server uses the registered userId, not the raw socket.id, as the fromUserId
                        fromUserId: currentUserId,
                        encryptedAESKey,
                        encryptedMessage,
                        iv,
                    });
                } else {
                    console.log(
                        `Recipient socket not found for userId: ${toUserId}`
                    );
                }
            } else {
                console.log(
                    `Recipient userId not found in activeUsers: ${toUserId}`
                );
            }
        }
    );

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        // Remove the user from the active list if they were registered
        if (
            activeUsers.has(currentUserId) &&
            activeUsers.get(currentUserId).socketId === socket.id
        ) {
            activeUsers.delete(currentUserId);
            // Broadcast the updated list
            broadcastUserList();
        }
    });
});

app.get("/", (req, res) => {
    res.status(200).json({ success: true, msg: "E2EE chat server running" });
});

const HOST = process.env.HOST || "localhost";
const PORT = process.env.PORT || 5000;

server.listen(PORT, () =>
    console.log(`Server running on: http://${HOST}:${PORT}`)
);
