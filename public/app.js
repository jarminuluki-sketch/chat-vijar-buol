let socket = io({ transports: ['websocket', 'polling'] });

let peerConnection;
let localStream;
let currentUsername = '';
let targetCallUser = '';
let targetChatUser = ''; // Jika kosong, pesan dikirim ke Global Chat
let photoBase64 = '';

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatBox = document.getElementById('chat-box');

let isMicMuted = false;
let isCamOff = false;

// STUN Server Lengkap untuk Mencegah Video Blank/Hitam
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

// --- AUTHENTICATION ---
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
  alert(data.message);
  if (data.success) {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('profileSection').classList.remove('hidden');
  }
});

socket.on('login_response', (data) => {
  if (data.success) {
    currentUsername = data.username;
    document.getElementById('displayUsername').textContent = currentUsername;
    document.getElementById('authSection').classList.add('hidden');

    if (!data.profile.fullName || !data.profile.age) {
      document.getElementById('profileSection').classList.remove('hidden');
    } else {
      document.getElementById('mainSection').classList.remove('hidden');
      socket.emit('get_user_list');
    }
    initWebRTCListeners();
  } else {
    alert(data.message);
  }
});

// --- KOMPRESI FOTO AUTOMATIS ---
document.getElementById('profPhotoInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  const statusDiv = document.getElementById('uploadStatus');
  if (file) {
    statusDiv.textContent = "Mengompres foto...";
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
        statusDiv.textContent = "Foto siap!";
      };
    };
    reader.readAsDataURL(file);
  }
});

function saveProfile() {
  const fullName = document.getElementById('profFullName').value.trim();
  const age = document.getElementById('profAge').value.trim();
  const birthYear = document.getElementById('profBirthYear').value.trim();

  if (!fullName || !age || !birthYear) return alert('Lengkapi semua data!');

  const btn = document.getElementById('btnSaveProfile');
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  socket.emit('update_profile', { fullName, age, birthYear, photo: photoBase64 });
}

socket.on('profile_updated', (data) => {
  const btn = document.getElementById('btnSaveProfile');
  btn.disabled = false;
  btn.textContent = "Simpan & Lanjutkan";

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

// --- USER ONLINE GRID ---
socket.on('user_list_updated', (userList) => {
  const userGrid = document.getElementById('userGrid');
  userGrid.innerHTML = '';

  userList.forEach(user => {
    if (user.username === currentUsername) return;

    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `
      <img src="${user.photo}" alt="Foto ${user.fullName}">
      <h4>${user.fullName}</h4>
      <p>Umur: ${user.age} Thn (${user.birthYear})</p>
      <div class="card-actions">
        <button class="btn btn-success" style="font-size:11px; padding:6px 10px;" onclick="startCallWith('${user.username}', '${user.fullName}')">Panggil Video</button>
        <button class="btn btn-primary" style="font-size:11px; padding:6px 10px;" onclick="selectChatTarget('${user.username}', '${user.fullName}')">Chat DM</button>
      </div>
    `;
    userGrid.appendChild(card);
  });
});

// --- CHAT LOGIC (GLOBAL & DIRECT) ---
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
  if (data.from === currentUsername) return; // Mencegah duplikasi tampilan pesan sendiri

  const prefix = data.isPrivate ? `[DM] ${data.senderName}` : data.senderName;
  appendMessage(`${prefix}: ${data.message}`, data.isPrivate);
});

function appendMessage(text, isPrivate = false) {
  const div = document.createElement('div');
  div.className = isPrivate ? 'msg msg-private' : 'msg';
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- WEBRTC 1-ON-1 LOGIC ---
function initWebRTCListeners() {
  socket.on('incoming_call', async (data) => {
    const callerName = data.callerProfile.fullName || data.from;
    const accept = confirm(`Panggilan video dari ${callerName}. Angkat?`);
    if (!accept) return;

    targetCallUser = data.from;
    document.getElementById('remoteLabel').textContent = callerName;
    document.getElementById('callContainer').classList.remove('hidden');

    await setupPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer_call', { to: data.from, answer: answer });
  });

  socket.on('call_accepted', async (data) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  socket.on('receive_ice_candidate', async (data) => {
    if (peerConnection && data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('ICE Candidate error:', e);
      }
    }
  });

  socket.on('call_ended_by_peer', () => {
    alert('Panggilan diakhiri oleh lawan bicara.');
    closeCallUI();
  });

  socket.on('call_failed', (data) => alert(data.message));
}

async function setupPeerConnection() {
  if (peerConnection) peerConnection.close();
  peerConnection = new RTCPeerConnection(rtcConfig);

  try {
    if (!localStream) {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
    }
  } catch (err) {
    alert('Gagal mengaktifkan Kamera/Mikrofon! Pastikan izin lokasi/kamera diberikan di browser.');
    return;
  }

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.play().catch(e => console.log('Autoplay error:', e));
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && targetCallUser) {
      socket.emit('send_ice_candidate', { to: targetCallUser, candidate: event.candidate });
    }
  };
}

async function startCallWith(username, fullName) {
  targetCallUser = username;
  document.getElementById('remoteLabel').textContent = fullName;
  document.getElementById('callContainer').classList.remove('hidden');

  await setupPeerConnection();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('call_user', { userToCall: username, offer: offer });
}

function toggleMic() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isMicMuted = !isMicMuted;
    audioTrack.enabled = !isMicMuted;
    const btn = document.getElementById('btnMuteMic');
    btn.textContent = isMicMuted ? 'Unmute Mic' : 'Mute Mic';
    btn.className = isMicMuted ? 'btn btn-danger' : 'btn btn-warning';
  }
}

function toggleCam() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isCamOff = !isCamOff;
    videoTrack.enabled = !isCamOff;
    const btn = document.getElementById('btnMuteCam');
    btn.textContent = isCamOff ? 'Nyalakan Kamera' : 'Matikan Kamera';
    btn.className = isCamOff ? 'btn btn-danger' : 'btn btn-warning';
  }
}

function endCall() {
  if (targetCallUser) {
    socket.emit('end_call', { to: targetCallUser });
  }
  closeCallUI();
}

function closeCallUI() {
  if (peerConnection) peerConnection.close();
  document.getElementById('callContainer').classList.add('hidden');
  targetCallUser = '';
}
