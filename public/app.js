<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aplikasi Obrolan & Panggilan Video</title>
  
  <!-- CSS Utama -->
  <link rel="stylesheet" href="style.css">

  <!-- Google Sign-In SDK -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>

  <div class="container">
    <!-- HEADER APLIKASI -->
    <h2>Aplikasi Obrolan & Panggilan Video</h2>

    <!-- =================================================================== -->
    <!-- SECTION 1: AUTENTIKASI (LOGIN / REGISTER)                          -->
    <!-- =================================================================== -->
    <div id="authSection">
      <h3>Masuk / Daftar Akun</h3>
      
      <div style="margin-bottom: 15px;">
        <label for="authUsername" style="display:block; font-weight:600; margin-bottom:5px;">Username</label>
        <input type="text" id="authUsername" placeholder="Masukkan username">
      </div>

      <div style="margin-bottom: 15px;">
        <label for="authPassword" style="display:block; font-weight:600; margin-bottom:5px;">Password</label>
        <input type="password" id="authPassword" placeholder="Masukkan password">
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button class="btn btn-primary" onclick="login()">Masuk (Login)</button>
        <button class="btn btn-secondary" onclick="register()">Daftar Baru</button>
      </div>

      <hr style="border:0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

      <!-- Google Sign-In Button -->
      <div style="display: flex; justify-content: center;">
        <div id="g_id_onload"
             data-client_id="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
             data-callback="handleCredentialResponse">
        </div>
        <div class="g_id_signin" data-type="standard" data-theme="outline" data-text="sign_in_with"></div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- SECTION 2: PENGISIAN PROFIL PENGGUNA                                -->
    <!-- =================================================================== -->
    <div id="profileSection" class="hidden">
      <h3>Lengkapi Profil Anda</h3>
      <p style="font-size: 13px; color: #666; margin-bottom: 15px;">Silakan lengkapi informasi diri Anda untuk melanjutkan.</p>

      <div style="margin-bottom: 15px;">
        <label for="profFullName" style="display:block; font-weight:600; margin-bottom:5px;">Nama Lengkap</label>
        <input type="text" id="profFullName" placeholder="Masukkan nama lengkap">
      </div>

      <div style="margin-bottom: 15px;">
        <label for="profAge" style="display:block; font-weight:600; margin-bottom:5px;">Umur</label>
        <input type="number" id="profAge" placeholder="Contoh: 25">
      </div>

      <div style="margin-bottom: 15px;">
        <label for="profBirthYear" style="display:block; font-weight:600; margin-bottom:5px;">Tahun Lahir</label>
        <input type="number" id="profBirthYear" placeholder="Contoh: 1999">
      </div>

      <div style="margin-bottom: 20px;">
        <label for="profPhotoInput" style="display:block; font-weight:600; margin-bottom:5px;">Foto Profil</label>
        <input type="file" id="profPhotoInput" accept="image/*">
        <div id="uploadStatus" style="font-size:12px; color:#0072ff; margin-top:5px;"></div>
      </div>

      <button class="btn btn-primary" id="btnSaveProfile" onclick="saveProfile()">Simpan & Lanjutkan</button>
    </div>

    <!-- =================================================================== -->
    <!-- SECTION 3: DASHBOARD UTAMA (VIDEO CALL & CHAT)                      -->
    <!-- =================================================================== -->
    <div id="mainSection" class="hidden">
      <!-- Status User Logged In -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 12px 18px; border-radius: 10px; margin-bottom: 20px;">
        <div>
          <span>Halo, <strong id="displayUsername" style="color: #0072ff;">-</strong></span>
        </div>
        <div>
          <button class="btn btn-secondary" style="font-size:12px; padding:6px 12px;" onclick="editProfile()">Edit Profil</button>
          <button class="btn btn-danger" style="font-size:12px; padding:6px 12px;" onclick="logout()">Log Out</button>
        </div>
      </div>

      <!-- AREA PANGGILAN VIDEO -->
      <div id="callContainer" class="hidden" style="margin-bottom: 25px;">
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; background: #e2e8f0; padding: 10px; border-radius: 8px;">
          <button class="btn btn-warning" id="btnMuteMic" onclick="toggleMic()">Mute Mic</button>
          <button class="btn btn-warning" id="btnMuteCam" onclick="toggleCam()">Matikan Kamera</button>
          <button class="btn btn-danger" onclick="endCall()">Akhiri Panggilan</button>
        </div>

        <div class="video-grid" id="videoGrid">
          <!-- Video Kamera Lokal Saya -->
          <div class="video-card" id="card-local">
            <video id="localVideo" autoplay playsinline muted></video>
            <div class="video-label">Saya (Lokal)</div>
          </div>
          <!-- Video Lawan Bicara Akan Muncul Secara Dinamis Di Sini -->
        </div>
      </div>

      <!-- DAFTAR PENGGUNA ONLINE -->
      <h3 style="margin-top: 20px;">Daftar Pengguna Online</h3>
      <div class="user-grid" id="userGrid" style="margin-bottom: 25px;">
        <!-- Pengguna lain akan dimasukkan secara otomatis oleh Socket.IO -->
      </div>

      <!-- OBROLAN TEKS & DM PRIVAT -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 id="chatHeader">Obrolan Teks (Publik)</h3>
        <button id="btnResetChatTarget" class="btn btn-secondary hidden" style="font-size:11px;" onclick="resetChatTarget()">Kembali ke Chat Publik</button>
      </div>

      <div id="chat-box"></div>

      <div style="display: flex; gap: 10px;">
        <input type="text" id="msgInput" placeholder="Ketik pesan..." style="margin-bottom: 0;" onkeypress="if(event.key==='Enter') sendChatMessage()">
        <button class="btn btn-primary" onclick="sendChatMessage()">Kirim</button>
      </div>
    </div>
  </div>

  <!-- Socket.IO Client Library -->
  <script src="/socket.io/socket.io.js"></script>
  
  <!-- App Logic JavaScript -->
  <script src="app.js"></script>

</body>
</html>
<!-- NAVIGASI BAWAH (BOTTOM NAVBAR) -->
<nav class="bottom-nav">
  <button class="nav-item active" onclick="switchTab('explore')">
    <svg class="nav-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
    <span>Jelajahi</span>
  </button>
  <button class="nav-item" onclick="switchTab('video-match')">
    <svg class="nav-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
    <span>Video</span>
  </button>
  <button class="nav-item" onclick="switchTab('chat')">
    <svg class="nav-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>
    <span>Obrolan</span>
  </button>
  <button class="nav-item" onclick="switchTab('profile')">
    <svg class="nav-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
    <span>Saya</span>
  </button>
</nav>
