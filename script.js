// ১. ফায়ারবেস কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyCHahXJJwiBvr9ucSa9qwBTA7z4jbl71BE",
  authDomain: "myprivatechat-8f590.firebaseapp.com",
  databaseURL: "https://myprivatechat-8f590-default-rtdb.firebaseio.com",
  projectId: "myprivatechat-8f590",
  storageBucket: "myprivatechat-8f590.firebasestorage.app",
  messagingSenderId: "710234246155",
  appId: "1:710234246155:web:656666be2960c9d5f74b0e"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

let currentUser = null;
let selectedMessageIds = [];
let replyingToMessage = null;
let replyingToMsgKey = null;
let isSelectingFile = false;

// সময় ফরম্যাট করার ফাংশন (e.g. 10:30 AM)
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ২. পাসওয়ার্ড মুছে ফেলা ও অটো-লগআউট + অফলাইন স্টেট সেটিং
function logout() {
  if (currentUser) {
    // অফলাইন স্ট্যাটাস আপডেট
    database.ref("users/" + currentUser.uid).update({
      status: "Offline",
      lastSeen: Date.now()
    });
  }
  auth.signOut().then(() => {
    document.getElementById("password").value = "";
  });
}

document.addEventListener("visibilitychange", function() {
  if (document.hidden && !isSelectingFile) {
    logout();
  }
});

window.addEventListener("blur", function() {
  if (!isSelectingFile) {
    logout();
  }
});

function triggerFileInput() {
  isSelectingFile = true;
  document.getElementById("file-input").click();
}

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorElement = document.getElementById("auth-error");

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      errorElement.innerText = "";
      document.getElementById("password").value = "";
    })
    .catch((error) => {
      errorElement.innerText = "লগইন ব্যর্থ হয়েছে!";
    });
}

// ৩. ইউজার স্টেট ও অনলাইন স্ট্যাটাস ট্র্যাকিং
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("chat-screen").classList.remove("hidden");
    document.getElementById("user-display").innerText = user.email.split('@')[0];

    // অনলাইন স্ট্যাটাস সেট করা
    database.ref("users/" + user.uid).set({
      email: user.email,
      status: "Online",
      lastSeen: Date.now()
    });

    trackPartnerStatus();
    loadMessages();
  } else {
    currentUser = null;
    document.getElementById("password").value = "";
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("chat-screen").classList.add("hidden");
    document.getElementById("messages-container").innerHTML = "";
  }
});

// ৪. অপর ইউজারের অনলাইন/অফলাইন এবং লাস্ট সিন চেক করা
function trackPartnerStatus() {
  database.ref("users").on("value", (snapshot) => {
    snapshot.forEach((childSnapshot) => {
      if (childSnapshot.key !== currentUser.uid) {
        const partner = childSnapshot.val();
        const userDisplay = document.getElementById("user-display");
        
        if (partner.status === "Online") {
          userDisplay.innerHTML = `${partner.email.split('@')[0]} <span class="user-status-text" style="color: #00ff6c;">🟢 Online</span>`;
        } else {
          const lastSeenTime = partner.lastSeen ? formatTime(partner.lastSeen) : "Unknown";
          userDisplay.innerHTML = `${partner.email.split('@')[0]} <span class="user-status-text">Last seen at ${lastSeenTime}</span>`;
        }
      }
    });
  });
}

// ৫. গ্যালারি ফাইল হ্যান্ডলিং
function handleFileUpload(event) {
  const file = event.target.files[0];
  setTimeout(() => { isSelectingFile = false; }, 1000);

  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const fileData = e.target.result;
    const fileType = file.type.startsWith("image/") ? "image" : "video";
    sendMediaMessage(fileData, fileType);
  };
  reader.readAsDataURL(file);
}

function sendMediaMessage(fileData, fileType) {
  const messageRef = database.ref("messages").push();
  messageRef.set({
    sender: currentUser.email,
    senderUid: currentUser.uid,
    mediaData: fileData,
    mediaType: fileType,
    replyTo: replyingToMessage,
    replyToKey: replyingToMsgKey,
    timestamp: Date.now(),
    isSeen: false,
    isDeleted: false
  });
  cancelReply();
}

// ৬. টেক্সট মেসেজ পাঠানো
function sendMessage() {
  const input = document.getElementById("message-input");
  const text = input.value.trim();

  if (text !== "" && currentUser) {
    const messageRef = database.ref("messages").push();
    messageRef.set({
      sender: currentUser.email,
      senderUid: currentUser.uid,
      text: text,
      replyTo: replyingToMessage,
      replyToKey: replyingToMsgKey,
      timestamp: Date.now(),
      isSeen: false,
      isDeleted: false
    });
    input.value = "";
    cancelReply();
  }
}

// ৭. মেসেজ লোড করা ও "Seen" চিহ্ন আপডেট করা
function loadMessages() {
  const messagesContainer = document.getElementById("messages-container");

  database.ref("messages").on("value", (snapshot) => {
    messagesContainer.innerHTML = "";

    snapshot.forEach((childSnapshot) => {
      const msgKey = childSnapshot.key;
      const msgData = childSnapshot.val();
      const isMe = msgData.senderUid === currentUser.uid;

      // অপর ইউজার মেসেজটি দেখলে Seen করা
      if (!isMe && !msgData.isSeen) {
        database.ref("messages/" + msgKey).update({ isSeen: true });
      }

      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message", isMe ? "sent" : "received");
      msgDiv.id = "msg-" + msgKey;
      msgDiv.setAttribute("data-key", msgKey);

      let contentHTML = "";

      // ডিলিট করা মেসেজের ক্ষেত্র
      if (msgData.isDeleted) {
        contentHTML = `<p class="deleted-msg">🚫 এই মেসেজটি মুছে ফেলা হয়েছে</p>`;
      } else {
        // রিপ্লাই মেসেজ ফিল্ড
        if (msgData.replyTo) {
          contentHTML += `<div class="reply-quote" onclick="scrollToMessage('${msgData.replyToKey}')">📌 ${msgData.replyTo}</div>`;
        }

        if (msgData.mediaType === "image") {
          contentHTML += `<img src="${msgData.mediaData}" class="media-preview-img">
                          <a href="${msgData.mediaData}" download="image.jpg" class="download-link">📥 ডাউনলোড করুন</a>`;
        } else if (msgData.mediaType === "video") {
          contentHTML += `<video src="${msgData.mediaData}" controls class="media-preview-video"></video>
                          <a href="${msgData.mediaData}" download="video.mp4" class="download-link">📥 ডাউনলোড করুন</a>`;
        } else if (msgData.text) {
          if (msgData.text.includes("youtube.com") || msgData.text.includes("youtu.be")) {
            const videoId = extractYouTubeId(msgData.text);
            contentHTML += `<p>${msgData.text}</p><iframe class="video-embed" src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>`;
          } else {
            contentHTML += `<p>${msgData.text}</p>`;
          }
        }
      }

      // টাইম ও সিন টিক মার্ক
      const timeStr = formatTime(msgData.timestamp);
      const tickHTML = isMe && !msgData.isDeleted ? (msgData.isSeen ? `<span class="seen-tick">✓✓</span>` : `<span class="unseen-tick">✓</span>`) : "";
      
      contentHTML += `<div class="msg-footer"><span>${timeStr}</span> ${tickHTML}</div>`;

      msgDiv.innerHTML = contentHTML;

      if (selectedMessageIds.includes(msgKey)) {
        msgDiv.classList.add("selected-message");
      }

      if (!msgData.isDeleted) {
        addSwipeAndSelectEvents(msgDiv, msgKey, msgData.text || "মিডিয়া ফাইল");
      }

      messagesContainer.appendChild(msgDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// ৮. রিপ্লাই বাটনে ক্লিক করলে স্ক্রোল করে নির্দিষ্ট মেসেজে নিয়ে যাওয়া
function scrollToMessage(key) {
  if (!key) return;
  const targetElement = document.getElementById("msg-" + key);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetElement.classList.add("highlight-message");
    setTimeout(() => {
      targetElement.classList.remove("highlight-message");
    }, 1500);
  }
}

// ৯. স্লাইড করে রিপ্লাই ও সিলেকশন
function addSwipeAndSelectEvents(element, msgKey, textPreview) {
  let startX = 0;
  let currentX = 0;

  element.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; });
  element.addEventListener("touchmove", (e) => {
    currentX = e.touches[0].clientX;
    let diff = currentX - startX;
    if (diff > 0 && diff < 80) element.style.transform = `translateX(${diff}px)`;
  });

  element.addEventListener("touchend", () => {
    let diff = currentX - startX;
    element.style.transform = `translateX(0px)`;
    if (diff > 50) setReply(textPreview, msgKey);
    startX = 0;
    currentX = 0;
  });

  let timer;
  element.addEventListener("touchstart", () => {
    timer = setTimeout(() => { toggleSelectMessage(msgKey); }, 600);
  });
  element.addEventListener("touchend", () => clearTimeout(timer));
  element.addEventListener("touchmove", () => clearTimeout(timer));
}

function toggleSelectMessage(key) {
  const index = selectedMessageIds.indexOf(key);
  if (index > -1) selectedMessageIds.splice(index, 1);
  else selectedMessageIds.push(key);

  const selectionBar = document.getElementById("selection-bar");
  if (selectedMessageIds.length > 0) {
    selectionBar.classList.remove("hidden");
    document.getElementById("selected-count").innerText = `${selectedMessageIds.length} টি সিলেক্টেড`;
  } else {
    selectionBar.classList.add("hidden");
  }
  loadMessages();
}

function cancelSelection() {
  selectedMessageIds = [];
  document.getElementById("selection-bar").classList.add("hidden");
  loadMessages();
}

// ১০. মুছে ফেলা (isDeleted: true করা)
function deleteSelectedMessages() {
  if (confirm("সিলেক্ট করা মেসেজগুলো ডিলিট করতে চান?")) {
    selectedMessageIds.forEach(key => {
      database.ref("messages").child(key).update({ isDeleted: true, text: "", mediaData: "" });
    });
    cancelSelection();
  }
}

function clearAllMessages() {
  if (confirm("সতর্কতা: চ্যাটের সকল মেসেজ মুছে ফেলা হবে!")) {
    database.ref("messages").remove();
    cancelSelection();
  }
}

// ১১. রিপ্লাই সেট করা
function setReply(text, key) {
  replyingToMessage = text;
  replyingToMsgKey = key;
  document.getElementById("reply-preview-bar").classList.remove("hidden");
  document.getElementById("reply-text").innerText = `রিপ্লাই দেওয়া হচ্ছে: ${text}`;
}

function cancelReply() {
  replyingToMessage = null;
  replyingToMsgKey = null;
  document.getElementById("reply-preview-bar").classList.add("hidden");
}