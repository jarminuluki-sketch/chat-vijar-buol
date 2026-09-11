// =========================================================================
// 1. KONEKSI SOCKET.IO
// =========================================================================
let socket = io({ 
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// Variable Global WebRTC & State Aplikasi
let peerConnections = {}; 
let pendingCandidates = {}; 
let localStream = null;
let currentUsername = '';
let targetChatUser = '';
let photoBase64 = '';
let activeCallUsers = new Set(); 

const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('videoGrid');
const chatBox = document.getElementById('chat-box');

let isMicMuted = false;
let isCamOff = false;

// =========================================================================
// 2. KONFIGURASI RTC (GOOGLE STUN + METERED TURN PRIVATE)
// =========================================================================
const rtcConfig = {
  iceServers: [
    // STUN Server Publik Google
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },

    // TURN Server Metered (Menembus CGNAT / Firewall Operator Seluler)
    {
      urls: [
        "turn:global.relays.metered.ca:80",
        "turn:global.relays.metered.ca:80?transport=tcp",
        "turn:global.relays.metered.ca:443",
        "turns:global.relays.metered.ca:443?transport=tcp"
      ],
      username: "b6547ac0c823c059fad69fe9",
      credential: "UU7TF5yHhpY9K8g2"
    }
  ],
  iceTransportPolicy: 'all', 
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// =========================================================================
// 3. INISIALISASI & AUTENTIKASI
// =========================================================================
window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('app_username');
  if (savedUser) {
    socket.emit('login_account', { username: savedUser, autoLogin: true });
  }
});

function register() {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  if (!username || !password) return alert('Isi username dan password!');
  socket.emit('register_account', { username, password });
}

function login() {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  if (!username || !password) return alert('Isi username dan password!');
  socket.emit('login_account', { username, password, isGoogle: false });
}

function handleCredentialResponse(response) {
  try {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    const profile = JSON.parse(jsonPayload);
    socket.emit('login_account', { isGoogle: true, googleProfile: profile });
  } catch (e) {
    alert('Gagal autentikasi Google.');
  }
}

socket.on('register_response', (data) => {
  if (data.success) {
    handleLoginSuccess(data);
  } else {
    alert(data.message);
  }
});

socket.on('login_response', (data) => {
  if (data.success) {
    handleLoginSuccess(data);
  } else {
    localStorage.removeItem('app_username');
    if (!data.autoLogin) alert(data.message);
  }
});

function handleLoginSuccess(data) {
  currentUsername = data.username;
  localStorage.setItem('app_username', currentUsername);
  
  const displayEl = document.getElementById('displayUsername');
  if (displayEl) displayEl.textContent = currentUsername;
  
  const authSec = document.getElementById('authSection');
  if (authSec) authSec.classList.add('hidden');

  if (!data.profile || !data.profile.fullName || !data.profile.age) {
    const profSec = document.getElementById('profileSection');
    if (profSec) profSec.classList.remove('hidden');
  } else {
    const mainSec = document.getElementById('mainSection');
    if (mainSec) mainSec.classList.remove('hidden');
    socket.emit('get_user_list');
  }
  initWebRTCListeners();
}

function logout() {
  localStorage.removeItem('app_username');
  socket.emit('logout_account');
  location.reload();
}

// =========================================================================
// 4. PROFIL & KOMPRESI GAMBAR
// =========================================================================
const profPhotoInput = document.getElementById('profPhotoInput');
if (profPhotoInput) {
  profPhotoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const statusDiv = document.getElementById('uploadStatus');
    if (file) {
      if (statusDiv) statusDiv.textContent = "Mengompres foto...";
      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300;
          const scaleFactor = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleFactor;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          photoBase64 = canvas.toDataURL('image/jpeg', 0.7);
          if (statusDiv) statusDiv.textContent = "Foto siap!";
        };
      };
      reader.readAsDataURL(file);
    }
  });
}

function saveProfile() {
  const fullName = document.getElementById('profFullName').value.trim();
  const age = document.getElementById('profAge').value.trim();
  const birthYear = document.getElementById('profBirthYear').value.trim();

  if (!fullName || !age || !birthYear) return alert('Lengkapi semua data!');

  const btn = document.getElementById('btnSaveProfile');
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menyimpan...";
  }

  socket.emit('update_profile', { fullName, age, birthYear, photo: photoBase64 });
}

socket.on('profile_updated', (data) => {
  const btn = document.getElementById('btnSaveProfile');
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Simpan & Lanjutkan";
  }

  if (data.success) {
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('mainSection').classList.remove('hidden');
    socket.emit('get_user_list');
  } else {
    alert(data.message || 'Gagal menyimpan profil.');
  }
});

function editProfile() {
  document.getElementById('mainSection').classList.add('hidden');
  document.getElementById('profileSection').classList.remove('hidden');
}

// =========================================================================
// 5. DAFTAR PENGGUNA ONLINE
// =========================================================================
socket.on('user_list_updated', (userList) => {
  const userGrid = document.getElementById('userGrid');
  if (!userGrid) return;
  userGrid.innerHTML = '';

  userList.forEach(user => {
    if (user.username === currentUsername) return;

    const card = document.createElement('div');
    card.className = 'user-card';
    
    let callBtnHtml = '';
    if (activeCallUsers.size > 0) {
      if (activeCallUsers.has(user.username)) {
        callBtnHtml = `<button class="btn btn-secondary" style="font-size:11px;" disabled>Dalam Panggilan</button>`;
      } else {
        callBtnHtml = `<button class="btn btn-warning" style="font-size:11px;" onclick="startCallWith('${user.username}', '${user.fullName}')">+ Tambah ke Panggilan</button>`;
      }
    } else {
      callBtnHtml = `<button class="btn btn-success" style="font-size:11px;" onclick="startCallWith('${user.username}', '${user.fullName}')">Panggil Video</button>`;
    }

    card.innerHTML = `
      <img src="${user.photo || 'https://via.placeholder.com/150'}" alt="Foto ${user.fullName}">
      <h4>${user.fullName}</h4>
      <p>Umur: ${user.age} Thn (${user.birthYear})</p>
      <div class="card-actions">
        ${callBtnHtml}
        <button class="btn btn-primary" style="font-size:11px;" onclick="selectChatTarget('${user.username}', '${user.fullName}')">Chat DM</button>
      </div>
    `;
    userGrid.appendChild(card);
  });
});

// =========================================================================
// 6. CHAT TEKS & DM PRIVAT
// =========================================================================
function selectChatTarget(username, fullName) {
  targetChatUser = username;
  document.getElementById('chatHeader').textContent = `Obrolan Privat (DM) dengan: ${fullName}`;
  document.getElementById('btnResetChatTarget').classList.remove('hidden');
}

function resetChatTarget() {
  targetChatUser = '';
  document.getElementById('chatHeader').textContent = `Obrolan Teks (Publik)`;
  document.getElementById('btnResetChatTarget').classList.add('hidden');
}

function sendChatMessage() {
  const msgInput = document.getElementById('msgInput');
  const message = msgInput.value.trim();
  if (!message) return;

  socket.emit('send_chat', { to: targetChatUser, message: message });

  if (targetChatUser) {
    appendMessage(`Saya (Private ke ${targetChatUser}): ${message}`, true);
  } else {
    appendMessage(`Saya: ${message}`, false);
  }

  msgInput.value = '';
}

socket.on('receive_chat', (data) => {
  if (data.from === currentUsername) return;
  const prefix = data.isPrivate ? `[DM] ${data.senderName}` : data.senderName;
  appendMessage(`${prefix}: ${data.message}`, data.isPrivate);
});

function appendMessage(text, isPrivate = false) {
  if (!chatBox) return;
  const div = document.createElement('div');
  div.className = isPrivate ? 'msg msg-private' : 'msg';
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// =========================================================================
// 7. WEBRTC ENGINE (PANGGILAN VIDEO & RELAY TURN SELULER)
// =========================================================================
function initWebRTCListeners() {
  socket.off('incoming_call');
  socket.off('call_accepted');
  socket.off('receive_ice_candidate');
  socket.off('call_ended_by_peer');
  socket.off('call_failed');

  socket.on('incoming_call', async (data) => {
    const callerName = data.callerProfile?.fullName || data.from;
    const accept = confirm(`Panggilan video dari ${callerName}. Angkat?`);
    if (!accept) return;

    document.getElementById('callContainer').classList.remove('hidden');
    activeCallUsers.add(data.from);
    socket.emit('get_user_list');

    try {
      const pc = await createPeerConnection(data.from, callerName);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      
      await processPendingCandidates(data.from, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answer_call', { to: data.from, answer: answer });
    } catch (err) {
      console.error('Gagal memproses panggilan masuk:', err);
    }
  });

  socket.on('call_accepted', async (data) => {
    const pc = peerConnections[data.from];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await processPendingCandidates(data.from, pc);
      } catch (err) {
        console.error('Gagal setRemoteDescription (answer):', err);
      }
    }
  });

  socket.on('receive_ice_candidate', async (data) => {
    const pc = peerConnections[data.from];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Gagal menambahkan Candidate:', e);
      }
    } else {
      if (!pendingCandidates[data.from]) pendingCandidates[data.from] = [];
      pendingCandidates[data.from].push(data.candidate);
    }
  });

  socket.on('call_ended_by_peer', (data) => {
    removePeerVideo(data.from);
  });

  socket.on('call_failed', (data) => alert(data.message));
}

async function processPendingCandidates(username, pc) {
  if (pendingCandidates[username] && pendingCandidates[username].length > 0) {
    for (let cand of pendingCandidates[username]) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.error('Gagal memproses pending candidate:', e);
      }
    }
    delete pendingCandidates[username];
  }
}

async function getLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      alert('Gagal mengakses Kamera/Mikrofon! Harap berikan izin akses.');
      throw err;
    }
  }
  return localStream;
}

async function createPeerConnection(targetUser, displayName) {
  if (peerConnections[targetUser]) {
    peerConnections[targetUser].close();
  }

  const stream = await getLocalStream();
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[targetUser] = pc;

  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.ontrack = (event) => {
    let remoteStream = event.streams && event.streams[0];
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteStream.addTrack(event.track);
    }
    addOrUpdateRemoteVideo(targetUser, displayName, remoteStream);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('send_ice_candidate', { to: targetUser, candidate: event.candidate });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[ICE State] ${targetUser}:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.warn('Percobaan pemulihan koneksi seluler (ICE Restart)...');
      pc.restartIce();
    }
  };

  return pc;
}

async function startCallWith(username, fullName) {
  document.getElementById('callContainer').classList.remove('hidden');
  activeCallUsers.add(username);
  socket.emit('get_user_list');

  try {
    const pc = await createPeerConnection(username, fullName);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('call_user', { userToCall: username, offer: offer });
  } catch (err) {
    console.error('Gagal memulai panggilan:', err);
  }
}

function addOrUpdateRemoteVideo(username, displayName, stream) {
  let card = document.getElementById(`card-${username}`);
  let video;

  if (!card) {
    card = document.createElement('div');
    card.className = 'video-card';
    card.id = `card-${username}`;

    video = document.createElement('video');
    video.id = `video-${username}`;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', ''); // Penting untuk iOS / Android Chrome

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = displayName || username;

    card.appendChild(video);
    card.appendChild(label);
    if (videoGrid) videoGrid.appendChild(card);
  } else {
    video = document.getElementById(`video-${username}`);
  }

  if (video && video.srcObject !== stream) {
    video.srcObject = stream;
    
    // Penanganan Autoplay di Browser HP
    video.play().catch(error => {
      console.warn("Autoplay terhalang oleh browser, mencoba mode mute:", error);
      video.muted = true;
      video.play();
    });
  }
}

function removePeerVideo(username) {
  if (peerConnections[username]) {
    peerConnections[username].close();
    delete peerConnections[username];
  }
  activeCallUsers.delete(username);
  
  const card = document.getElementById(`card-${username}`);
  if (card) card.remove();

  if (activeCallUsers.size === 0) {
    document.getElementById('callContainer').classList.add('hidden');
  }
  socket.emit('get_user_list');
}

// =========================================================================
// 8. KONTROL MIKROFON & KAMERA
// =========================================================================
function toggleMic() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isMicMuted = !isMicMuted;
    audioTrack.enabled = !isMicMuted;
    const btn = document.getElementById('btnMuteMic');
    if (btn) {
      btn.textContent = isMicMuted ? 'Unmute Mic' : 'Mute Mic';
      btn.className = isMicMuted ? 'btn btn-danger' : 'btn btn-warning';
    }
  }
}

function toggleCam() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isCamOff = !isCamOff;
    videoTrack.enabled = !isCamOff;
    const btn = document.getElementById('btnMuteCam');
    if (btn) {
      btn.textContent = isCamOff ? 'Nyalakan Kamera' : 'Matikan Kamera';
      btn.className = isCamOff ? 'btn btn-danger' : 'btn btn-warning';
    }
  }
}

function endCall() {
  for (let u of activeCallUsers) {
    socket.emit('end_call', { to: u });
    if (peerConnections[u]) peerConnections[u].close();
  }
  peerConnections = {};
  activeCallUsers.clear();
  
  if (videoGrid) {
    const cards = videoGrid.querySelectorAll('.video-card');
    cards.forEach(c => {
      if (c.id !== 'card-local') c.remove();
    });
  }

  document.getElementById('callContainer').classList.add('hidden');
  socket.emit('get_user_list');
}
