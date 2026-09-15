let socket;
let currentUser = null;
let currentTargetSocketId = null;
let localStream = null;
let peerConnection = null;
let activeCallTargetSocketId = null;
let compressedPhotoBase64 = null;
let activeUsersData = [];

// Profil Saya (Default)
let myProfile = {
  nama: '',
  umur: '',
  pekerjaan: '',
  alamat: '',
  bio: '',
  avatar: 'default-avatar.png'
};

const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const welcomeSection = document.getElementById('welcomeSection');
  const authSection = document.getElementById('authSection');
  const appSection = document.getElementById('appSection');

  // Clear session storage saat pertama dibuka
  localStorage.removeItem('currentUser');

  if (welcomeSection) welcomeSection.classList.remove('hidden');
  if (authSection) authSection.classList.add('hidden');
  if (appSection) appSection.classList.add('hidden');

  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (welcomeSection) welcomeSection.classList.add('hidden');
      if (authSection) authSection.classList.remove('hidden');
    });
  }

  // NAVIGASI TAB MENU & LOGOUT
  setupNavigation();

  // LOGIKA AUTH FORM
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
        if (authTitle) authTitle.innerText = 'Daftar Akun Baru';
        if (authSubmitBtn) authSubmitBtn.innerText = 'Daftar';
        if (toggleAuthText) toggleAuthText.innerText = 'Sudah punya akun?';
        toggleAuthLink.innerText = 'Masuk di sini';
      } else {
        if (authTitle) authTitle.innerText = 'Masuk Aplikasi';
        if (authSubmitBtn) authSubmitBtn.innerText = 'Masuk';
        if (toggleAuthText) toggleAuthText.innerText = 'Belum punya akun?';
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
        myProfile.nama = username;
        document.getElementById('profNama').value = username;

        if (welcomeSection) welcomeSection.classList.add('hidden');
        if (authSection) authSection.classList.add('hidden');
        if (appSection) appSection.classList.remove('hidden');

        initSocketConnection();
      }
    });
  }

  setupPhotoInputListener();
  setupProfileForm();
});

// --- NAVIGASI TAB & LOGOUT ---
function setupNavigation() {
  const navHome = document.getElementById('navHome');
  const navMessages = document.getElementById('navMessages');
  const navProfile = document.getElementById('navProfile');
  const btnLogout = document.getElementById('btnLogout');

  const tabHome = document.getElementById('tabHome');
  const tabMessages = document.getElementById('tabMessages');
  const tabProfile = document.getElementById('tabProfile');

  const welcomeSection = document.getElementById('welcomeSection');
  const appSection = document.getElementById('appSection');

  function switchTab(activeBtn, activeTab) {
    [navHome, navMessages, navProfile].forEach(btn => btn.classList.remove('active'));
    [tabHome, tabMessages, tabProfile].forEach(tab => tab.classList.add('hidden'));

    activeBtn.classList.add('active');
    activeTab.classList.remove('hidden');
  }

  navHome.addEventListener('click', () => switchTab(navHome, tabHome));
  navMessages.addEventListener('click', () => switchTab(navMessages, tabMessages));
  navProfile.addEventListener('click', () => switchTab(navProfile, tabProfile));

  // EVENT TOMBOL LOGOUT
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin keluar?')) {
        // Stop Video Stream jika sedang VC
        closeVideoCall();

        // Disconnect Socket
        if (socket) {
          socket.disconnect();
        }

        // Reset variabel lokal
        currentUser = null;
        currentTargetSocketId = null;
        localStorage.removeItem('currentUser');

        // Reset Form
        const authForm = document.getElementById('authForm');
        if (authForm) authForm.reset();

        // Kembalikan ke Welcome Screen
        appSection.classList.add('hidden');
        welcomeSection.classList.remove('hidden');

        // Tab default balik ke Home
        switchTab(navHome, tabHome);
      }
    });
  }
}

// --- LOGIKA FORM PROFIL SAYA ---
function setupProfileForm() {
  const profileForm = document.getElementById('profileForm');
  const avatarFileInput = document.getElementById('avatarFileInput');
  const profileAvatarPreview = document.getElementById('profileAvatarPreview');

  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          myProfile.avatar = event.target.result;
          profileAvatarPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      myProfile.nama = document.getElementById('profNama').value;
      myProfile.umur = document.getElementById('profUmur').value;
      myProfile.pekerjaan = document.getElementById('profPekerjaan').value;
      myProfile.alamat = document.getElementById('profAlamat').value;
      myProfile.bio = document.getElementById('profBio').value;

      if (socket) {
        socket.emit('update-profile', myProfile);
      }

      alert('Profil jati diri berhasil disimpan!');
    });
  }
}

// --- SOCKET CONNECTION ---
function initSocketConnection() {
  if (typeof io !== 'undefined') {
    socket = io();
    setupSocketListeners();
  }
}

function setupSocketListeners() {
  if (!socket) return;

  socket.emit('register-user', { username: currentUser, profile: myProfile });

  socket.on('update-user-list', (users) => {
    activeUsersData = users;
    renderHomeUsersGrid(users);
    renderUserList(users);
  });

  socket.on('private-message', (data) => {
    appendMessage(data.sender, data.message, 'incoming', data.image);
  });

  socket.on('call-offer', async (data) => {
    activeCallTargetSocketId = data.from;
    document.getElementById('videoCallContainer').classList.remove('hidden');
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

// --- RENDER MENU HOME (GRID USER AKTIF) ---
function renderHomeUsersGrid(users) {
  const gridContainer = document.getElementById('activeUsersGrid');
  if (!gridContainer) return;

  gridContainer.innerHTML = '';
  users.forEach(user => {
    if (user.username !== currentUser) {
      const prof = user.profile || {};
      const card = document.createElement('div');
      card.className = 'user-card';

      const avatarSrc = prof.avatar || 'default-avatar.png';
      const pekerjaanText = prof.pekerjaan ? prof.pekerjaan : 'Pengguna Aktif';
      const umurText = prof.umur ? `, ${prof.umur} thn` : '';

      card.innerHTML = `
        <img src="${avatarSrc}" class="user-card-avatar" alt="${user.username}">
        <h4>${prof.nama || user.username}</h4>
        <p>${pekerjaanText}${umurText}</p>
        <div class="user-card-actions">
          <button class="btn-card btn-card-msg" onclick="openChatWithUser('${user.id}', '${user.username}')">💬 Pesan</button>
          <button class="btn-card btn-card-vc" onclick="callUserDirectly('${user.id}', '${user.username}')">📹 VC</button>
        </div>
      `;

      gridContainer.appendChild(card);
    }
  });
}

function openChatWithUser(socketId, username) {
  selectUserToChat(socketId, username);
  document.getElementById('navMessages').click();
}

function callUserDirectly(socketId, username) {
  selectUserToChat(socketId, username);
  startVideoCall();
}

// --- RENDER SIDEBAR CHAT ---
function renderUserList(users) {
  const userListContainer = document.getElementById('userList');
  if (!userListContainer) return;

  userListContainer.innerHTML = '';
  users.forEach((user) => {
    if (user.username !== currentUser) {
      const li = document.createElement('li');
      li.innerText = user.profile?.nama || user.username;
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

// --- WEBRTC LOGIC ---
async function startVideoCall() {
  if (!currentTargetSocketId) return alert('Pilih pengguna terlebih dahulu');

  document.getElementById('videoCallContainer').classList.remove('hidden');

  try {
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
  } catch (err) {
    console.error("Gagal mengakses kamera/mikrofon:", err);
    alert("Kamera/Mikrofon tidak dapat diakses.");
  }
}

async function handleReceiveOffer(offer) {
  try {
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
  } catch (err) {
    console.error("Gagal mengakses kamera/mikrofon:", err);
  }
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
  document.getElementById('videoCallContainer').classList.add('hidden');
}

// --- LOGIKA PESAN ---
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
