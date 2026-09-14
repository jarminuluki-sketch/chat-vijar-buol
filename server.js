const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware untuk memproses data JSON dan Form
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Melayani file statis dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// Database Sementara di Memori Server
const usersDB = {};       // Data pengguna: { username: { username, password, profile } }
const onlineSockets = {}; // Mapping Socket: { socketId: username }

// ==========================================
// REST API ENDPOINTS
// ==========================================

// Endpoint Register
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
  }

  const cleanUser = username.trim().toLowerCase();

  if (usersDB[cleanUser]) {
    return res.status(400).json({ success: false, message: 'Username sudah terdaftar! Silakan login.' });
  }

  usersDB[cleanUser] = {
    username: cleanUser,
    password: password.trim(),
    profile: null
  };

  console.log(`[REGISTER SUCCESS] User terdaftar: ${cleanUser}`);
  return res.json({ success: true, message: 'Pendaftaran berhasil! Silakan klik Masuk (Login).' });
});

// Endpoint Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi!' });
  }

  const cleanUser = username.trim().toLowerCase();
  const user = usersDB[cleanUser];

  if (!user || user.password !== password.trim()) {
    return res.status(401).json({ success: false, message: 'Username atau password salah!' });
  }

  console.log(`[LOGIN SUCCESS] User masuk: ${cleanUser}`);
  return res.json({ 
    success: true, 
    message: 'Login berhasil!', 
    username: cleanUser,
    profile: user.profile 
  });
});

// Endpoint Profil
app.post('/api/profile', (req, res) => {
  const { username, fullName, age, birthYear, photo } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'Sesi username tidak valid!' });
  }

  const cleanUser = username.trim().toLowerCase();

  if (!usersDB[cleanUser]) {
    return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan!' });
  }

  usersDB[cleanUser].profile = {
    fullName: fullName || cleanUser,
    age: age || '',
    birthYear: birthYear || '',
    photo: photo || null
  };

  console.log(`[PROFILE UPDATED] User: ${cleanUser}`);
  return res.json({ success: true, message: 'Profil berhasil disimpan!', profile: usersDB[cleanUser].profile });
});

// ==========================================
// SOCKET.IO SIGNALING
// ==========================================
io.on('connection', (socket) => {
  console.log(`[SOCKET CONNECT] ID: ${socket.id}`);

  socket.on('user-online', (username) => {
    if (username) {
      const cleanUser = username.trim().toLowerCase();
      onlineSockets[socket.id] = cleanUser;
      socket.username = cleanUser;
      broadcastOnlineUsers();
    }
  });

  socket.on('send-message', (data) => {
    if (data.targetSocketId) {
      io.to(data.targetSocketId).emit('receive-message', {
        sender: data.sender,
        text: data.text,
        isPrivate: true,
        fromSocketId: socket.id
      });
      socket.emit('receive-message', {
        sender: data.sender,
        text: data.text,
        isPrivate: true,
        toSocketId: data.targetSocketId
      });
    } else {
      io.emit('receive-message', {
        sender: data.sender,
        text: data.text,
        isPrivate: false
      });
    }
  });

  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('incoming-call', {
      signal: data.signalData,
      from: socket.id,
      callerName: data.callerName
    });
  });

  socket.on('answer-call', (data) => {
    io.to(data.to).emit('call-accepted', data.signal);
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on('end-call', (data) => {
    if (data && data.to) {
      io.to(data.to).emit('call-ended');
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET DISCONNECT] ID: ${socket.id}`);
    delete onlineSockets[socket.id];
    broadcastOnlineUsers();
  });
});

function broadcastOnlineUsers() {
  const usersList = Object.keys(onlineSockets).map(socketId => ({
    socketId: socketId,
    username: onlineSockets[socketId],
    profile: usersDB[onlineSockets[socketId]] ? usersDB[onlineSockets[socketId]].profile : null
  }));

  io.emit('update-user-list', usersList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server aktif di port ${PORT}`);
});
