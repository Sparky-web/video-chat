require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;
const CHAT_PASSWORD = process.env.CHAT_PASSWORD || "defaultPassword";

// Store connected users (max 2)
const connectedUsers = new Set();

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Main route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  console.log("Пользователь подключился:", socket.id);

  // Handle joining the chat
  socket.on("join-chat", (data) => {
    const { password } = data;

    if (!password) {
      socket.emit("error", "Необходимо ввести пароль");
      return;
    }

    // Verify password
    if (password !== CHAT_PASSWORD) {
      socket.emit("error", "Неверный пароль");
      return;
    }

    // Check if chat is full (max 2 users)
    if (connectedUsers.size >= 2) {
      socket.emit("error", "Чат переполнен. Максимум 2 пользователя");
      return;
    }

    // Add user to chat
    connectedUsers.add(socket.id);
    socket.join("videochat");

    console.log(`Пользователь ${socket.id} присоединился к чату`);

    // Notify the user they joined successfully
    socket.emit("joined-chat", { userCount: connectedUsers.size });

    // Notify other users in the chat
    socket
      .to("videochat")
      .emit("user-joined", {
        userId: socket.id,
        userCount: connectedUsers.size,
      });
  });

  // Handle WebRTC signaling
  socket.on("offer", (data) => {
    socket.to("videochat").emit("offer", {
      offer: data.offer,
      from: socket.id,
    });
  });

  socket.on("answer", (data) => {
    socket.to("videochat").emit("answer", {
      answer: data.answer,
      from: socket.id,
    });
  });

  socket.on("ice-candidate", (data) => {
    socket.to("videochat").emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id,
    });
  });

  // Handle user disconnect
  socket.on("disconnect", () => {
    console.log("Пользователь отключился:", socket.id);

    if (connectedUsers.has(socket.id)) {
      connectedUsers.delete(socket.id);

      // Notify remaining users
      socket.to("videochat").emit("user-left", {
        userId: socket.id,
        userCount: connectedUsers.size,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
