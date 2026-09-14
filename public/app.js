// Inisialisasi Socket.IO Client
const socket = io();

// Global State
let currentUser = null;
let currentProfile = null;
let localStream = null;
let peerConnections = {}; // { socketId: RTCPeerConnection }
let activeCallTargetSocket = null;
let currentChatTarget = null; // null = Public Chat, String = Target Username

// WebRTC Configuration (Menggunakan Google STUN Server Free)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Auto Check Login Session saat Halaman Dimuat
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = savedUser;
    // Buka section main jika sudah login
    showSection('mainSection');
    socket.emit('register-user', currentUser);
    document.getElementById('displayUsername').innerText = currentUser;
  } else {
    showSection('authSection');
  }
});

// Helper Pengganti Tab / Section
function showSection(sectionId) {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('profileSection').classList.add('hidden');
  document.getElementById('mainSection').classList.add('hidden');

  const target = document.getElementById(sectionId);
  if (target) target.classList.remove('hidden');
}

// ==========================================
// AUTHENTICATION LOGIC (REGISTER & LOGIN)
// ==========================================

async function register() {
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username || !password) {
    alert('Harap masukkan Username dan Password!');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      alert(data.message);
    } else {
      alert(data.message || 'Pendaftaran gagal!');
    }
  } catch (err) {
    console.error('Error Register:', err);
    alert('Terjadi kesalahan koneksi ke server!');
  }
}

async function login() {
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username || !password) {
    alert('Harap masukkan Username dan Password!');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      currentUser = username;
      localStorage.setItem('currentUser', currentUser);
      socket.emit('register-user', currentUser);
      document.getElementById('displayUsername').innerText = currentUser;

      if (data.user && data.user.profile) {
        currentProfile = data.user.profile;
        showSection('mainSection');
      } else {
        showSection('profileSection');
      }
    } else {
      alert(data.message || 'Login gagal!');
    }
  } catch (err) {
    console.error('Error Login:', err);
    alert('Terjadi kesalahan koneksi!');
  }
}

function logout() {
  localStorage.removeItem('currentUser');
  currentUser = null;
  currentProfile = null;
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  location.reload();
}

// ==========================================
// PROFILE MANAGEMENT LOGIC
// ==========================================

function editProfile() {
  showSection('profileSection');
}

async function saveProfile() {
  const fullName = document.getElementById('profFullName').value.trim();
  const age = document.getElementById('profAge').value.trim();
  const birthYear = document.getElementById('profBirthYear').value.trim();
  const photoInput = document.getElementById('profPhotoInput');

  let photoBase64 = currentProfile ? currentProfile.photo : null;

  if (photoInput && photoInput.files && photoInput.files[0]) {
    document.getElementById('uploadStatus').innerText = 'Memproses foto...';
    photoBase64 = await convertFileToBase64(photoInput.files[0]);
  }

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        fullName,
        age,
        birthYear,
        photo: photoBase64
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('Profil berhasil disimpan!');
      currentProfile = data.profile;
      showSection('mainSection');
    } else {
      alert(data.message || 'Gagal menyimpan profil.');
    }
  } catch (err) {
    console.error('Error Save Profile:', err);
    alert('Terjadi kesalahan saat menyimpan profil.');
  }
}

function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// Google Sign-In Callback Dummy Handler
function handleCredentialResponse(response) {
  alert('Google Login berhasil dipicu! Menggunakan token ID.');
}

// ==========================================
// REAL-TIME USER LIST & CHAT LOGIC
// ==========================================

socket.on('update-user-list', (users) => {
  const userGrid = document.getElementById('userGrid');
  if (!userGrid) return;

  userGrid.innerHTML = '';

  users.forEach(user => {
    if (user.username === currentUser) return; // Jangan tampilkan diri sendiri

    const card = document.createElement('div');
    card.className = 'user-card';
    card.style.padding = '12px';

    const photoSrc = (user.profile && user.profile.photo) 
      ? user.profile.photo 
      : 'https://via.placeholder.com/80?text=User';

    const displayName = (user.profile && user.profile.fullName) 
      ? user.profile.fullName 
      : user.username;

    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${photoSrc}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;">
        <div>
          <strong style="display:block; font-size:14px;">${displayName}</strong>
          <span style="font-size:12px; color:#2ecc71;">● Online</span>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn btn-primary" style="font-size:11px; flex:1;" onclick="startVideoCall('${user.socketId}')">Panggil Video</button>
        <button class="btn btn-secondary" style="font-size:11px; flex:1;" onclick="setPrivateChat('${user.username}')">DM Chat</button>
      </div>
    `;

    userGrid.appendChild(card);
  });
});

function setPrivateChat(targetUsername) {
  currentChatTarget = targetUsername;
  document.getElementById('chatHeader').innerText = `Obrolan Privat (DM dengan ${targetUsername})`;
  document.getElementById('btnResetChatTarget').classList.remove('hidden');
}

function resetChatTarget() {
  currentChatTarget = null;
  document.getElementById('chatHeader').innerText = 'Obrolan Teks (Publik)';
  document.getElementById('btnResetChatTarget').classList.add('hidden');
}

function sendChatMessage() {
  const msgInput = document.getElementById('msgInput');
  const message = msgInput.value.trim();
  if (!message) return;

  socket.emit('send-chat', {
    targetUser: currentChatTarget,
    message: message
  });

  msgInput.value = '';
}

socket.on('receive-chat', (data) => {
  const chatBox = document.getElementById('chat-box');
  if (!chatBox) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = data.isPrivate ? 'msg msg-private' : 'msg';
  msgDiv.innerHTML = `<strong>${data.sender}:</strong> ${escapeHTML(data.message)}`;

  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ==========================================
// WEBRTC VIDEO CALL LOGIC
// ==========================================

async function initLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const localVideo = document.getElementById('localVideo');
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      console.error('Gagal mengakses kamera/mikrofon:', err);
      alert('Izinkan akses kamera dan mikrofon pada browser Anda!');
      throw err;
    }
  }
}

async function startVideoCall(targetSocketId) {
  try {
    await initLocalStream();
    document.getElementById('callContainer').classList.remove('hidden');
    activeCallTargetSocket = targetSocketId;

    const pc = createPeerConnection(targetSocketId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('call-user', {
      offer: offer,
      userToCall: targetSocketId
    });
  } catch (err) {
    console.error('Gagal membuat panggilan:', err);
  }
}

socket.on('call-made', async (data) => {
  const confirmCall = confirm(`Panggilan video masuk dari ${data.fromUser}. Terima?`);
  if (!confirmCall) return;

  try {
    await initLocalStream();
    document.getElementById('callContainer').classList.remove('hidden');
    activeCallTargetSocket = data.socket;

    const pc = createPeerConnection(data.socket);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('make-answer', {
      answer: answer,
      to: data.socket
    });
  } catch (err) {
    console.error('Gagal menerima panggilan:', err);
  }
});

socket.on('answer-made', async (data) => {
  const pc = peerConnections[data.socket];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
});

socket.on('ice-candidate', async (data) => {
  const pc = peerConnections[data.from];
  if (pc && data.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error('Error ICE Candidate:', e);
    }
  }
});

socket.on('call-ended', () => {
  alert('Panggilan video telah diakhiri.');
  endCallUI();
});

function createPeerConnection(socketId) {
  if (peerConnections[socketId]) return peerConnections[socketId];

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[socketId] = pc;

  // Add Local Tracks to PC
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Handle Remote Stream
  pc.ontrack = (event) => {
    let remoteCard = document.getElementById(`card-${socketId}`);
    if (!remoteCard) {
      const videoGrid = document.getElementById('videoGrid');
      remoteCard = document.createElement('div');
      remoteCard.className = 'video-card';
      remoteCard.id = `card-${socketId}`;
      remoteCard.innerHTML = `
        <video id="video-${socketId}" autoplay playsinline></video>
        <div class="video-label">Lawan Bicara</div>
      `;
      videoGrid.appendChild(remoteCard);
    }
    const remoteVideo = document.getElementById(`video-${socketId}`);
    if (remoteVideo) remoteVideo.srcObject = event.streams[0];
  };

  // ICE Candidate Transmission
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        to: socketId,
        candidate: event.candidate
      });
    }
  };

  return pc;
}

function toggleMic() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('btnMuteMic').innerText = audioTrack.enabled ? 'Mute Mic' : 'Unmute Mic';
    }
  }
}

function toggleCam() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('btnMuteCam').innerText = videoTrack.enabled ? 'Matikan Kamera' : 'Nyalakan Kamera';
    }
  }
}

function endCall() {
  if (activeCallTargetSocket) {
    socket.emit('end-call', { to: activeCallTargetSocket });
  }
  endCallUI();
}

function endCallUI() {
  for (const sId in peerConnections) {
    peerConnections[sId].close();
  }
  peerConnections = {};

  const videoGrid = document.getElementById('videoGrid');
  const cards = videoGrid.querySelectorAll('.video-card');
  cards.forEach(card => {
    if (card.id !== 'card-local') card.remove();
  });

  document.getElementById('callContainer').classList.add('hidden');
  activeCallTargetSocket = null;
}
