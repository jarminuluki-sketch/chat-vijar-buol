const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e7
});

app.use(express.static(path.join(__dirname, 'public')));

const users = {};          // { username: { password, fullName, age, birthYear, photo } }
const connectedUsers = {}; // { username: socketId }

io.on('connection', (socket) => {
  console.log('User terhubung:', socket.id);

  // 1. REGISTRASI AKUN
  socket.on('register_account', ({ username, password }) => {
    try {
      if (!username || !password) {
        return socket.emit('register_response', { success: false, message: 'Username & Password wajib diisi!' });
      }
      if (users[username]) {
        return socket.emit('register_response', { success: false, message: 'Username sudah terdaftar!' });
      }
      users[username] = { password, fullName: '', age: '', birthYear: '', photo: '' };
      
      socket.username = username;
      connectedUsers[username] = socket.id;

      socket.emit('register_response', { 
        success: true, 
        message: 'Registrasi berhasil! Silakan isi profil.',
        username: username,
        profile: users[username]
      });
      broadcastUserList();
    } catch (err) {
      socket.emit('register_response', { success: false, message: 'Gagal melakukan registrasi.' });
    }
  });

  // 2. LOGIN AKUN & AUTO LOGIN
  socket.on('login_account', ({ username, password, isGoogle, googleProfile, autoLogin }) => {
    try {
      if (isGoogle && googleProfile) {
        const gUsername = googleProfile.email.split('@')[0];
        if (!users[gUsername]) {
          users[gUsername] = {
            password: 'GOOGLE_AUTH_USER',
            fullName: googleProfile.name || gUsername,
            age: '',
            birthYear: '',
            photo: googleProfile.picture || ''
          };
        }
        socket.username = gUsername;
        connectedUsers[gUsername] = socket.id;
        broadcastUserList();
        return socket.emit('login_response', { success: true, username: gUsername, profile: users[gUsername] });
      }

      if (autoLogin && username && users[username]) {
        socket.username = username;
        connectedUsers[username] = socket.id;
        broadcastUserList();
        return socket.emit('login_response', { success: true, username: username, profile: users[username] });
      }

      if (users[username] && users[username].password === password) {
        connectedUsers[username] = socket.id;
        socket.username = username;
        broadcastUserList();
        socket.emit('login_response', { success: true, username: username, profile: users[username] });
      } else {
        socket.emit('login_response', { success: false, message: 'Username atau Password salah!' });
      }
    } catch (err) {
      socket.emit('login_response', { success: false, message: 'Gagal melakukan login.' });
    }
  });

  // 3. UPDATE PROFIL
  socket.on('update_profile', ({ fullName, age, birthYear, photo }) => {
    try {
      if (socket.username && users[socket.username]) {
        users[socket.username].fullName = fullName || socket.username;
        users[socket.username].age = age || '-';
        users[socket.username].birthYear = birthYear || '-';
        if (photo) users[socket.username].photo = photo;

        socket.emit('profile_updated', { success: true, profile: users[socket.username] });
        broadcastUserList();
      } else {
        socket.emit('profile_updated', { success: false, message: 'Sesi habis, silakan login ulang.' });
      }
    } catch (err) {
      socket.emit('profile_updated', { success: false, message: 'Gagal memperbarui profil.' });
    }
  });

  // 4. DAFTAR USER ONLINE
  socket.on('get_user_list', () => sendUserList(socket));

  function broadcastUserList() {
    io.emit('user_list_updated', getUserListData());
  }

  function sendUserList(targetSocket) {
    targetSocket.emit('user_list_updated', getUserListData());
  }

  function getUserListData() {
    const list = [];
    for (let u in connectedUsers) {
      if (users[u]) {
        list.push({
          username: u,
          fullName: users[u].fullName || u,
          age: users[u].age,
          birthYear: users[u].birthYear,
          photo: users[u].photo || 'https://via.placeholder.com/150'
        });
      }
    }
    return list;
  }

  // 5. CHAT SYSTEM
  socket.on('send_chat', ({ to, message }) => {
    const senderName = (users[socket.username] && users[socket.username].fullName) ? users[socket.username].fullName : socket.username;

    if (to && connectedUsers[to]) {
      io.to(connectedUsers[to]).emit('receive_chat', {
        from: socket.username,
        senderName: senderName,
        message: message,
        isPrivate: true
      });
    } else {
      io.emit('receive_chat', {
        from: socket.username,
        senderName: senderName,
        message: message,
        isPrivate: false
      });
    }
  });

  // 6. WEBRTC SIGNALING (CROSS-NETWORK / DIFFERENT NETWORKS)
  socket.on('call_user', ({ userToCall, offer }) => {
    const targetSocketId = connectedUsers[userToCall];
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', {
        from: socket.username,
        callerProfile: users[socket.username] || {},
        offer: offer
      });
    } else {
      socket.emit('call_failed', { message: `Pengguna '${userToCall}' sedang tidak aktif.` });
    }
  });

  socket.on('answer_call', ({ to, answer }) => {
    const targetSocketId = connectedUsers[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_accepted', { from: socket.username, answer });
    }
  });

  socket.on('send_ice_candidate', ({ to, candidate }) => {
    const targetSocketId = connectedUsers[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_ice_candidate', { from: socket.username, candidate });
    }
  });

  socket.on('end_call', ({ to }) => {
    const targetSocketId = connectedUsers[to];
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended_by_peer', { from: socket.username });
    }
  });

  // 7. DISCONNECT & LOGOUT
  socket.on('logout_account', () => {
    if (socket.username) {
      delete connectedUsers[socket.username];
      delete socket.username;
      broadcastUserList();
    }
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      delete connectedUsers[socket.username];
      broadcastUserList();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server aktif di port ${PORT}`);
});
