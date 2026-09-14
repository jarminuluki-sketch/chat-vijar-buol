let socket;
let currentUser = localStorage.getItem('currentUser') || null;
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
  socket = io();
  setupSocketListeners();
  setupPhotoInputListener();

  if (currentUser) {
    checkUserSession();
  }
});

// AUTENTIKASI
async function register() {
  const usernameInput = document.getElementById('authUsername');
  const passwordInput = document.getElementById('authPassword');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username || !password) {
    alert('Harap isi Username dan Password!');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    alert(data.message);
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
    alert('Harap isi Username dan Password!');
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
      currentUser = data.username;
      localStorage.setItem('currentUser', currentUser);

      document.getElementById('authSection').classList.add('hidden');

      if (data.profile && data.profile.fullName) {
        showMainDashboard(data.profile);
      } else {
        document.getElementById('profileSection').classList.remove('hidden');
      }
    } else {
      alert(data.message || 'Login gagal!');
    }
  } catch (err) {
    console.error('Error Login:', err);
    alert('Terjadi kesalahan koneksi ke server!');
  }
}

function logout() {
  localStorage.removeItem('currentUser');
  currentUser = null;
  location.reload();
}

function checkUserSession() {
  document.getElementById('authSection').classList.add('hidden');
  showMainDashboard();
}

// MANAGEMENT TAB NAVIGASI
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabName}`);
  const targetNav = document.getElementById(`nav-${tabName}`);

  if (targetTab) targetTab.classList.remove('hidden');
  if (targetNav) targetNav.classList.add('active');
}

// PROFIL
function setupPhotoInputListener() {
  const photoInput = document.getElementById('profPhotoInput');
  if (!photoInput) return;

  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('uploadStatus');
    if (statusDiv) statusDiv.innerText = 'Mengompres foto...';

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        compressedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
        if (statusDiv) statusDiv.innerText = 'Foto berhasil diproses!';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveProfile() {
  const fullName = document.getElementById('profFullName').value.trim();
  const age = document.getElementById('profAge').value.trim();
  const birthYear = document.getElementById('profBirthYear').value.trim();

  if (!fullName) {
    alert('Nama Lengkap wajib diisi!');
    return;
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
        photo: compressedPhotoBase64
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      alert('Profil berhasil diperbarui!');
      document.getElementById('profileSection').classList.add('hidden');
      showMainDashboard(data.profile);
    } else {
      alert(data.message || 'Gagal menyimpan profil.');
    }
  } catch (err) {
    console.error('Error Save Profile:', err);
    alert('Terjadi kesalahan saat menyimpan profil!');
  }
}

function editProfile() {
  document.getElementById('mainSection').classList.add('hidden');
  document.getElementById('profileSection').classList.remove('hidden');
}

// SOCKET & DASHBOARD UTAMA
function showMainDashboard(profileData) {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('profileSection').classList.add('hidden');
  document.getElementById('mainSection').classList.remove('hidden');

  document.getElementById('displayUsername').innerText = currentUser;
  if (profileData) {
    document.getElementById('displayFullName').innerText = profileData.fullName || currentUser;
    if (profileData.photo) {
      document.getElementById('myProfilePhoto').src = profileData.photo;
    }
  }

  socket.emit('user-online', currentUser);
  switchTab('home');
}

function setupSocketListeners() {
  socket.on('update-user-list', (users) => {
    const userGrid = document.getElementById('userGrid');
    if (!userGrid) return;

    userGrid.innerHTML = '';

    const otherUsers = users.filter(u => u.username !== currentUser);

    if (otherUsers.length === 0) {
      userGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#888; padding:20px;">Belum ada pengguna lain yang aktif saat ini.</p>`;
      return;
    }

    otherUsers.forEach(u => {
      const card = document.createElement('div');
      card.className = 'user-card';

      const displayName = (u.profile && u.profile.fullName) ? u.profile.fullName : u.username;
      const photoSrc = (u.profile && u.profile.photo) ? u.profile.photo : 'https://via.placeholder.com/150';

      card.innerHTML = `
        <div class="user-card-img" style="background-image: url('${photoSrc}');">
          <span class="status-badge">● Aktif</span>
        </div>
        <div class="user-card-info">
          <strong>${displayName}</strong>
          <div class="user-card-actions">
            <button type="button" class="btn btn-primary" style="font-size:11px; padding:6px 10px;" onclick="startCall('${u.socketId}')">Panggil</button>
            <button type="button" class="btn btn-secondary" style="font-size:11px; padding:6px 10px;" onclick="goToPrivateChat('${u.socketId}', '${displayName}')">Pesan</button>
          </div>
        </div>
      `;

      userGrid.appendChild(card);
    });
  });

  socket.on('receive-message', (data) => {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = data.isPrivate ? 'msg msg-private' : 'msg';
    
    const prefix = data.isPrivate ? '[DM] ' : '';
    msgDiv.innerHTML = `<strong>${prefix}${data.sender}:</strong> ${escapeHTML(data.text)}`;

    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  socket.on('incoming-call', async (data) => {
    const accept = confirm(`Panggilan video dari ${data.callerName}. Terima?`);
    if (accept) {
      activeCallTargetSocketId = data.from;
      document.getElementById('callContainer').classList.remove('hidden');
      await setupLocalStream();
      await createPeerConnection(data.from);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('answer-call', { signal: answer, to: data.from });
    }
  });

  socket.on('call-accepted', async (signal) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    }
  });

  socket.on('ice-candidate', async (data) => {
    if (peerConnection && data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error ICE candidate', e);
      }
    }
  });

  socket.on('call-ended', () => {
    alert('Panggilan diakhiri.');
    closeCallUI();
  });
}

// LOGIKA CHAT & ALIH TAB PESAN AUTOMATIS
function goToPrivateChat(socketId, name) {
  setPrivateChatTarget(socketId, name);
  switchTab('chat');
}

function setPrivateChatTarget(socketId, name) {
  currentTargetSocketId = socketId;
  document.getElementById('chatHeader').innerText = `Obrolan Privat dengan: ${name}`;
  document.getElementById('btnResetChatTarget').classList.remove('hidden');
}

function resetChatTarget() {
  currentTargetSocketId = null;
  document.getElementById('chatHeader').innerText = 'Obrolan Teks (Publik)';
  document.getElementById('btnResetChatTarget').classList.add('hidden');
}

function sendChatMessage() {
  const input = document.getElementById('msgInput');
  const text = input ? input.value.trim() : '';
  if (!text) return;

  socket.emit('send-message', {
    sender: currentUser,
    text: text,
    targetSocketId: currentTargetSocketId
  });

  input.value = '';
}

// WEBRTC VIDEO CALL
async function setupLocalStream() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const localVideo = document.getElementById('localVideo');
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      console.error('Gagal media:', err);
      alert('Tidak dapat mengakses kamera/mikrofon!');
    }
  }
}

async function createPeerConnection(targetSocketId) {
  peerConnection = new RTCPeerConnection(rtcConfiguration);

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (event) => {
    let remoteVideoCard = document.getElementById('card-remote');
    if (!remoteVideoCard) {
      remoteVideoCard = document.createElement('div');
      remoteVideoCard.className = 'video-card';
      remoteVideoCard.id = 'card-remote';
      remoteVideoCard.innerHTML = `
        <video id="remoteVideo" autoplay playsinline></video>
        <div class="video-label">Lawan Bicara</div>
      `;
      document.getElementById('videoGrid').appendChild(remoteVideoCard);
    }
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        candidate: event.candidate,
        to: targetSocketId
      });
    }
  };
}

async function startCall(targetSocketId) {
  activeCallTargetSocketId = targetSocketId;
  document.getElementById('callContainer').classList.remove('hidden');

  await setupLocalStream();
  await createPeerConnection(targetSocketId);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('call-user', {
    userToCall: targetSocketId,
    signalData: offer,
    callerName: currentUser
  });
}

function endCall() {
  if (activeCallTargetSocketId) {
    socket.emit('end-call', { to: activeCallTargetSocketId });
  }
  closeCallUI();
}

function closeCallUI() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  const remoteCard = document.getElementById('card-remote');
  if (remoteCard) remoteCard.remove();

  document.getElementById('callContainer').classList.add('hidden');
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

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
