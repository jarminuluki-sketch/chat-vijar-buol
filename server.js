const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let activeUsers = {};

io.on('connection', (socket) => {
  console.log('User terhubung:', socket.id);

  socket.on('register-user', (data) => {
    let username = typeof data === 'string' ? data : data.username;
    let profile = typeof data === 'object' && data.profile ? data.profile : {};

    activeUsers[socket.id] = {
      id: socket.id,
      username: username,
      profile: profile
    };

    io.emit('update-user-list', Object.values(activeUsers));
  });

  socket.on('update-profile', (profileData) => {
    if (activeUsers[socket.id]) {
      activeUsers[socket.id].profile = profileData;
      io.emit('update-user-list', Object.values(activeUsers));
    }
  });

  socket.on('private-message', (data) => {
    io.to(data.to).emit('private-message', data);
  });

  socket.on('call-offer', (data) => {
    io.to(data.to).emit('call-offer', data);
  });

  socket.on('call-answer', (data) => {
    io.to(data.to).emit('call-answer', data);
  });

  socket.on('ice-candidate', (data) => {
    io.to(data.to).emit('ice-candidate', data);
  });

  socket.on('disconnect', () => {
    console.log('User terputus:', socket.id);
    delete activeUsers[socket.id];
    io.emit('update-user-list', Object.values(activeUsers));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
