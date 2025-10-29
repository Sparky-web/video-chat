class VideoChat {
  constructor() {
    this.socket = io();
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    this.isInitiator = false;

    // WebRTC configuration
    this.config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    this.initializeElements();
    this.setupEventListeners();
    this.setupSocketListeners();
  }

  initializeElements() {
    this.joinForm = document.getElementById("joinForm");
    this.videoContainer = document.getElementById("videoContainer");
    this.passwordInput = document.getElementById("password");
    this.joinBtn = document.getElementById("joinBtn");
    this.status = document.getElementById("status");
    this.connectionStatus = document.getElementById("connectionStatus");
    this.localVideo = document.getElementById("localVideo");
    this.remoteVideo = document.getElementById("remoteVideo");
    this.toggleVideoBtn = document.getElementById("toggleVideo");
    this.toggleAudioBtn = document.getElementById("toggleAudio");
    this.leaveRoomBtn = document.getElementById("leaveRoom");
  }

  setupEventListeners() {
    this.joinBtn.addEventListener("click", () => this.joinChat());
    this.toggleVideoBtn.addEventListener("click", () => this.toggleVideo());
    this.toggleAudioBtn.addEventListener("click", () => this.toggleAudio());
    this.leaveRoomBtn.addEventListener("click", () => this.leaveChat());

    // Allow Enter key to join chat
    this.passwordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.joinChat();
    });
  }

  setupSocketListeners() {
    this.socket.on("joined-chat", (data) => {
      this.showStatus("Успешно подключились к чату!", "success");
      this.initializeMedia();
      this.updateConnectionStatus(data.userCount);

      // Первый пользователь становится инициатором
      if (data.userCount === 1) {
        this.isInitiator = true;
        console.log("Я инициатор соединения");
      }
    });

    this.socket.on("user-joined", (data) => {
      this.updateConnectionStatus(data.userCount);
      if (data.userCount === 2) {
        console.log("Второй пользователь присоединился");
        // Инициатор создает предложение после небольшой задержки
        if (this.isInitiator) {
          setTimeout(() => {
            console.log("Инициатор создает предложение");
            this.startCall();
          }, 1500);
        } else {
          // Второй пользователь готовится принять предложение
          console.log("Готов принять предложение");
          this.prepareForCall();
        }
      }
    });

    this.socket.on("user-left", (data) => {
      this.updateConnectionStatus(data.userCount);
      this.resetPeerConnection();
    });

    this.socket.on("offer", async (data) => {
      console.log("Получено предложение");
      await this.handleOffer(data.offer);
    });

    this.socket.on("answer", async (data) => {
      console.log("Получен ответ");
      await this.handleAnswer(data.answer);
    });

    this.socket.on("ice-candidate", async (data) => {
      console.log("Получен ICE кандидат");
      await this.handleIceCandidate(data.candidate);
    });

    this.socket.on("error", (message) => {
      this.showStatus(message, "error");
      this.joinBtn.disabled = false;
    });
  }

  async joinChat() {
    const password = this.passwordInput.value.trim();

    if (!password) {
      this.showStatus("Пожалуйста, введите пароль", "error");
      return;
    }

    this.joinBtn.disabled = true;
    this.showStatus("Подключение к чату...", "info");

    this.socket.emit("join-chat", { password });
  }

  async initializeMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      this.localVideo.srcObject = this.localStream;
      this.joinForm.style.display = "none";
      this.videoContainer.style.display = "block";

      // Apply fullscreen styles
      document.body.classList.add("video-active");
      document.querySelector(".container").classList.add("fullscreen");

      console.log("Медиа инициализировано");
    } catch (error) {
      console.error("Ошибка доступа к медиа устройствам:", error);
      this.showStatus(
        "Ошибка доступа к камере/микрофону. Проверьте разрешения.",
        "error"
      );
      this.joinBtn.disabled = false;
    }
  }

  createPeerConnection() {
    console.log("Создание peer connection");
    this.peerConnection = new RTCPeerConnection(this.config);

    // Add local stream tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
        console.log("Добавлен локальный трек:", track.kind);
      });
    }

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log("Получен удаленный трек:", event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.remoteVideo.srcObject = this.remoteStream;

        // Ensure video plays
        this.remoteVideo.play().catch((e) => {
          console.log("Автовоспроизведение заблокировано:", e);
        });

        console.log("Удаленное видео установлено");
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("ice-candidate", { candidate: event.candidate });
        console.log("ICE кандидат отправлен");
      } else {
        console.log("Все ICE кандидаты отправлены");
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log("Состояние соединения:", this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === "connected") {
        this.connectionStatus.textContent = "Подключен к собеседнику";
        this.connectionStatus.className = "status success";
      } else if (this.peerConnection.connectionState === "disconnected") {
        this.connectionStatus.textContent = "Отключен от собеседника";
        this.connectionStatus.className = "status error";
      }
    };

    // Additional debugging
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE состояние:", this.peerConnection.iceConnectionState);
    };

    this.peerConnection.onsignalingstatechange = () => {
      console.log("Signaling состояние:", this.peerConnection.signalingState);
    };
  }

  async startCall() {
    console.log("Начинаем звонок (создаем предложение)");
    if (!this.localStream) {
      console.error("Нет локального потока для создания предложения");
      return;
    }

    this.createPeerConnection();

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit("offer", { offer });
      console.log("Предложение отправлено");
    } catch (error) {
      console.error("Ошибка создания предложения:", error);
    }
  }

  async prepareForCall() {
    console.log("Подготовка к принятию звонка");
    if (!this.localStream) {
      console.error("Нет локального потока для подготовки к звонку");
      return;
    }
    // Создаем peer connection заранее
    this.createPeerConnection();
  }

  async handleOffer(offer) {
    console.log("Обработка предложения");
    if (!this.localStream) {
      console.error("Нет локального потока для обработки предложения");
      return;
    }

    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    try {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      console.log("Remote description установлен");

      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.peerConnection.setLocalDescription(answer);
      this.socket.emit("answer", { answer });
      console.log("Ответ отправлен");
    } catch (error) {
      console.error("Ошибка обработки предложения:", error);
    }
  }

  async handleAnswer(answer) {
    console.log("Обработка ответа");
    try {
      if (
        this.peerConnection &&
        this.peerConnection.signalingState !== "stable"
      ) {
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        console.log("Ответ получен и обработан");
      }
    } catch (error) {
      console.error("Ошибка обработки ответа:", error);
    }
  }

  async handleIceCandidate(candidate) {
    try {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
        console.log("ICE кандидат добавлен");
      } else {
        console.log("Отложен ICE кандидат - нет remote description");
      }
    } catch (error) {
      console.error("Ошибка обработки ICE кандидата:", error);
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        this.isVideoEnabled = !this.isVideoEnabled;
        videoTrack.enabled = this.isVideoEnabled;
        this.toggleVideoBtn.textContent = this.isVideoEnabled ? "📹" : "📹";
        this.toggleVideoBtn.style.opacity = this.isVideoEnabled ? "1" : "0.5";
      }
    }
  }

  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        this.isAudioEnabled = !this.isAudioEnabled;
        audioTrack.enabled = this.isAudioEnabled;
        this.toggleAudioBtn.textContent = this.isAudioEnabled ? "🎤" : "🔇";
      }
    }
  }

  leaveChat() {
    this.resetPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.socket.disconnect();
    this.socket.connect();

    this.videoContainer.style.display = "none";
    this.joinForm.style.display = "block";
    this.joinBtn.disabled = false;
    this.passwordInput.value = "";
    this.status.className = "status hidden";

    // Remove fullscreen styles
    document.body.classList.remove("video-active");
    document.querySelector(".container").classList.remove("fullscreen");

    // Reset states
    this.isInitiator = false;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    this.toggleVideoBtn.textContent = "📹";
    this.toggleVideoBtn.style.opacity = "1";
    this.toggleAudioBtn.textContent = "🎤";
  }

  resetPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteVideo.srcObject) {
      this.remoteVideo.srcObject = null;
    }
    this.remoteStream = null;
  }

  showStatus(message, type) {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
  }

  updateConnectionStatus(userCount) {
    if (userCount === 1) {
      this.connectionStatus.textContent =
        "Ожидание подключения второго пользователя...";
      this.connectionStatus.className = "status info";
    } else if (userCount === 2) {
      this.connectionStatus.textContent =
        "Второй пользователь подключился. Соединение...";
      this.connectionStatus.className = "status info";
    }
  }
}

// Initialize the video chat when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new VideoChat();
});
