let socket;
let currentUser = localStorage.getItem('currentUser') || null;
let userProfile = JSON.parse(localStorage.getItem('userProfile')) || null;
let currentTargetSocketId = null;
let localStream = null;
let peerConnection = null;
let activeCallTargetSocketId = null;
let compressedPhotoBase64 = null;

const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. NAVIGASI AWAL & ELEMEN UTAMA ---
  const startBtn = document.getElementById('startBtn');
  const welcomeSection = document.getElementById('welcomeSection');
  const authSection = document.getElementById('authSection');
  const appSection = document.getElementById('appSection');

  // Event Listener Tombol Mulai (Welcome -> Auth)
  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (welcomeSection) welcomeSection.classList.add('hidden');
      if (authSection) authSection.classList.remove('hidden');
    });
  }

  // Cek Status Login
  if (currentUser && appSection) {
    if (welcomeSection) welcomeSection.classList.add('hidden');
    if (authSection) authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    initSocketConnection();
  }

  // --- 2. LOGIKA AUTENTIKASI (LOGIN / REGISTER) ---
  const authForm = document.getElementById('authForm');
  const toggleAuthLink = document.getElementById('toggleAuthLink');
  const authTitle = document.getElementById('authTitle');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const toggleAuthText = document.getElementById('toggleAuthText');
  let isRegisterMode = false;

  if (toggleAuthLink) {
    toggleAuthLink.addEventListener('click', (e) => {
      e.preventDefault();
      isRegisterMode = !isRegisterMode;
      if (isRegisterMode) {
        authTitle.innerText = 'Daftar Akun Baru';
        authSubmitBtn.innerText = 'Daftar';
        toggleAuthText.innerText = 'Sudah punya akun?';
        toggleAuthLink.innerText = 'Masuk di sini';
      } else {
        authTitle.innerText = 'Masuk Aplikasi';
        authSubmitBtn.innerText = 'Masuk';
        toggleAuthText.innerText = 'Belum punya akun?';
        toggleAuthLink.innerText = 'Daftar di sini';
      }
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('username');
      const username = usernameInput ? usernameInput.value.trim() : '';

      if (username) {
        currentUser = username;
        localStorage.setItem('currentUser', username);
        
        if (welcomeSection) welcomeSection.classList.add('hidden');
        if (authSection) authSection.classList.add('hidden');
        if (appSection) appSection.classList.remove('hidden');

        initSocketConnection();
      }
    });
  }

  setupPhotoInputListener();
});

// --- 3. INISIALISASI SOCKET.IO ---
function initSocketConnection() {
  if (typeof io !== 'undefined') {
    socket = io();
    setupSocketListeners();
  }
}

function setupSocketListeners() {
  if (!socket) return;

  socket.emit('register-user', currentUser);

  socket.on('update-user-list', (users) => {
    renderUserList(users);
  });

  socket.on('private-message', (data) => {
    appendMessage(data.sender, data.message, 'incoming');
  });

  // Listener Signaling WebRTC
  socket.on('call-offer', async (data) => {
    activeCallTargetSocketId = data.from;
    await handleReceiveOffer(data.offer);
  });

  socket.on('call-answer', async (data) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  socket.on('ice-candidate', async (data) => {
    if (peerConnection && data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error addIceCandidate', e);
      }
    }
  });

  socket.on('end-call', () => {
    closeVideoCall();
  });
}

// --- 4. LISTENER INPUT FOTO / GAMBAR ---
function setupPhotoInputListener() {
  const photoInput = document.getElementById('photoInput');
  if (photoInput) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          compressedPhotoBase64 = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// --- 5. RENDER DAFTAR USER ---
function renderUserList(users) {
  const userListContainer = document.getElementById('userList');
  if (!userListContainer) return;

  userListContainer.innerHTML = '';
  users.forEach((user) => {
    if (user.username !== currentUser) {
      const li = document.createElement('li');
      li.innerText = user.username;
      li.onclick = () => selectUserToChat(user.id, user.username);
      userListContainer.appendChild(li);
    }
  });
}

function selectUserToChat(socketId, username) {
  currentTargetSocketId = socketId;
  const chatHeader = document.getElementById('chatHeader');
  if (chatHeader) chatHeader.innerText = `Chat dengan ${username}`;
}

// --- 6. LOGIKA WEBRTC / PANGGILAN VIDEO ---
async function startVideoCall() {
  if (!currentTargetSocketId) return alert('Pilih pengguna untuk dipanggil');

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  const localVideo = document.getElementById('localVideo');
  if (localVideo) localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(rtcConfiguration);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        to: currentTargetSocketId,
        candidate: event.candidate
      });
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('call-offer', {
    to: currentTargetSocketId,
    offer: offer,
    from: socket.id
  });
}

async function handleReceiveOffer(offer) {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  const localVideo = document.getElementById('localVideo');
  if (localVideo) localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(rtcConfiguration);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && activeCallTargetSocketId) {
      socket.emit('ice-candidate', {
        to: activeCallTargetSocketId,
        candidate: event.candidate
      });
    }
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit('call-answer', {
    to: activeCallTargetSocketId,
    answer: answer
  });
}

function closeVideoCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
}

// --- 7. LOGIKA CHAT MESSAGE ---
function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const message = messageInput ? messageInput.value.trim() : '';

  if ((message || compressedPhotoBase64) && currentTargetSocketId) {
    const payload = {
      to: currentTargetSocketId,
      sender: currentUser,
      message: message,
      image: compressedPhotoBase64
    };

    socket.emit('private-message', payload);
    appendMessage('Saya', message, 'outgoing', compressedPhotoBase64);

    if (messageInput) messageInput.value = '';
    compressedPhotoBase64 = null;
  }
}

function appendMessage(sender, text, type, image = null) {
  const messagesContainer = document.getElementById('messagesContainer');
  if (!messagesContainer) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${type}`;

  let content = `<strong>${sender}:</strong> ${text}`;
  if (image) {
    content += `<br><img src="${image}" style="max-width: 200px; border-radius: 8px; margin-top: 5px;">`;
  }

  msgDiv.innerHTML = content;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
