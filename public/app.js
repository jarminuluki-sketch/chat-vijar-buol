let socket = io({ transports: ['websocket', 'polling'] });

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

// KUNCI UTAMA: MULTI TURN & STUN SERVER UNTUK JARINGAN BEDA (SELULER / WI-FI)
const rtcConfig = {
  iceServers: [
    // STUN Servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    
    // TURN Relay Servers (Penting untuk menembus Kuota Seluler vs Wi-Fi)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

// AUTO CHECK SESSION
window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('app_username');
  if (savedUser) {
    socket.emit('login_account', { username: savedUser, autoLogin: true });
  }
});

// --- AUTENTIKASI ---
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
    currentUsername = data.username;
    localStorage.setItem('app_username', currentUsername);
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

socket.on('login_response', (data) => {
  if (data.success) {
    currentUsername = data.username;
    localStorage.setItem('app_username', currentUsername);
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
    localStorage.removeItem('app_username');
    if (!data.autoLogin) alert(data.message);
  }
});

function logout() {
  localStorage.removeItem('app_username');
  socket.emit('logout_account');
  location.reload();
}

// --- FOTO COMPRESSION ---
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

// --- ONLINE USERS ---
socket.on('user_list_updated', (userList) => {
  const userGrid = document.getElementById('userGrid');
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

// --- CHAT SYSTEM ---
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
  const div = document.createElement('div');
  div.className = isPrivate ? 'msg msg-private' : 'msg';
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- WEBRTC SIGNALING & ENGINE ---
function initWebRTCListeners() {
  socket.on('incoming_call', async (data) => {
    const callerName = data.callerProfile.fullName || data.from;
    const accept = confirm(`Panggilan video dari ${callerName}. Angkat?`);
    if (!accept) return;

    document.getElementById('callContainer').classList.remove('hidden');
    activeCallUsers.add(data.from);
    socket.emit('get_user_list');

    const pc = await createPeerConnection(data.from, callerName);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    // Terapkan penampung ICE candidates jika terkumpul sebelum RemoteDescription
    if (pendingCandidates[data.from]) {
      for (let cand of pendingCandidates[data.from]) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e){}
      }
      delete pendingCandidates[data.from];
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer_call', { to: data.from, answer: answer });
  });

  socket.on('call_accepted', async (data) => {
    const pc = peerConnections[data.from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (pendingCandidates[data.from]) {
        for (let cand of pendingCandidates[data.from]) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e){}
        }
        delete pendingCandidates[data.from];
      }
    }
  });

  socket.on('receive_ice_candidate', async (data) => {
    const pc = peerConnections[data.from];
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('ICE Candidate error:', e);
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

async function getLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
      });
      localVideo.srcObject = localStream;
    } catch (err) {
      alert('Gagal mengakses Kamera/Mikrofon! Izinkan akses perangkat.');
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

  // Menangkap Aliran Video & Audio Lawan Bicara
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

  return pc;
}

async function startCallWith(username, fullName) {
  document.getElementById('callContainer').classList.remove('hidden');
  activeCallUsers.add(username);
  socket.emit('get_user_list');

  const pc = await createPeerConnection(username, fullName);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit('call_user', { userToCall: username, offer: offer });
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

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = displayName || username;

    card.appendChild(video);
    card.appendChild(label);
    videoGrid.appendChild(card);
  } else {
    video = document.getElementById(`video-${username}`);
  }

  if (video && video.srcObject !== stream) {
    video.srcObject = stream;
    video.play().catch(e => console.log('Autoplay error:', e));
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
  for (let u of activeCallUsers) {
    socket.emit('end_call', { to: u });
    if (peerConnections[u]) peerConnections[u].close();
  }
  peerConnections = {};
  activeCallUsers.clear();
  
  const cards = videoGrid.querySelectorAll('.video-card');
  cards.forEach(c => {
    if (c.id !== 'card-local') c.remove();
  });

  document.getElementById('callContainer').classList.add('hidden');
  socket.emit('get_user_list');
}
