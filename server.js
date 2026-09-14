const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // Limit 10MB untuk pengiriman data foto/file via socket
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database In-Memory (Simpan sementara di memori server)
const usersDB = {}; // { username: { username, password, profile: { fullName, age, birthYear, photo } } }
const activeSockets = {}; // { socketId: username }
const userSockets = {}; // { username: socketId }

// ==========================================
// REST API ENDPOINTS (AUTH & PROFILE)
// ==========================================

// 1. Register API
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
  }

  if (usersDB[username]) {
    return res.status(400).json({ success: false, message: 'Username sudah terdaftar! Gunakan username lain atau langsung Login.' });
  }

  usersDB[username] = {
    username,
    password,
    profile: null
  };

  return res.json({ success: true, message: 'Registrasi berhasil! Silakan klik tombol Masuk (Login).' });
});

// 2. Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = usersDB[username];

  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: 'Username atau password salah!' });
  }

  return res.json({
    success: true,
    message: 'Login berhasil!',
    user: {
      username: user.username,
      profile: user.profile
    }
  });
});

// 3. Save Profile API
app.post('/api/profile', (req, res) => {
  const { username, fullName, age, birthYear, photo } = req.body;

  if (!usersDB[username]) {
    return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan!' });
  }

  usersDB[username].profile = {
    fullName: fullName || username,
    age: age || '-',
    birthYear: birthYear || '-',
    photo: photo || null
  };

  return res.json({
    success: true,
    message: 'Profil berhasil diperbarui!',
    profile: usersDB[username].profile
  });
});

// ==========================================
// SOCKET.IO (REAL-TIME CHAT & WEBRTC SIGNALING)
// ==========================================
io.on('connection', (socket) => {
  console.log(`Socket terhubung: ${socket.id}`);

  // Pendaftaran User Online di Socket
  socket.on('register-user', (username) => {
    if (!username) return;
    
    // Hapus sesi lama jika ada
    if (userSockets[username]) {
      const oldSocketId = userSockets[username];
      delete activeSockets[oldSocketId];
    }

    activeSockets[socket.id] = username;
    userSockets[username] = socket.id;

    // Kirim daftar pengguna online ke semua client
    broadcastOnlineUsers();
  });

  // Signal WebRTC: Call User
  socket.on('call-user', (data) => {
    const targetSocketId = userSockets[data.userToCall];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-made', {
        offer: data.offer,
        socket: socket.id,
        fromUser: activeSockets[socket.id]
      });
    }
  });

  // Signal WebRTC: Make Answer
  socket.on('make-answer', (data) => {
    io.to(data.to).emit('answer-made', {
      socket: socket.id,
      answer: data.answer
    });
  });

  // Signal WebRTC: ICE Candidate
  socket.on('ice-candidate', (data) => {
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // End Call Signal
  socket.on('end-call', (data) => {
    if (data && data.to) {
      io.to(data.to).emit('call-ended');
    }
  });

  // Chat Messenger
  socket.on('send-chat', (data) => {
    const sender = activeSockets[socket.id] || 'Anonim';
    
    if (data.targetUser) {
      // Private Chat / DM
      const targetSocketId = userSockets[data.targetUser];
      if (targetSocketId) {
        io.to(targetSocketId).emit('receive-chat', {
          sender,
          message: data.message,
          isPrivate: true
        });
        socket.emit('receive-chat', {
          sender: `Saya (ke ${data.targetUser})`,
          message: data.message,
          isPrivate: true
        });
      }
    } else {
      // Public Chat
      io.emit('receive-chat', {
        sender,
        message: data.message,
        isPrivate: false
      });
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    const username = activeSockets[socket.id];
    if (username) {
      delete userSockets[username];
      delete activeSockets[socket.id];
      broadcastOnlineUsers();
    }
    console.log(`Socket terputus: ${socket.id}`);
  });

  function broadcastOnlineUsers() {
    const onlineList = [];
    for (const [uname, sId] of Object.entries(userSockets)) {
      const uData = usersDB[uname];
      onlineList.push({
        username: uname,
        socketId: sId,
        profile: uData ? uData.profile : null
      });
    }
    io.emit('update-user-list', onlineList);
  }
});

// Server Listening
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
