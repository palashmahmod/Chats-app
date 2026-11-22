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
let allVisibleMessageIds = [];
let isSelectionMode = false;
let replyingToMessage = null;
let replyingToMsgKey = null;
let isSelectingFile = false;
let isViewingMedia = false;
let wakeLock = null;

// সময় ফরম্যাট করার ফাংশন
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ২. লগআউট ও ইনপুট ফিল্ড ক্লিয়ার রাখা
function logout() {
  if (currentUser) {
    database.ref("users/" + currentUser.uid).update({
      status: "Offline",
      lastSeen: Date.now()
    });
  }
  auth.signOut().then(() => {
    clearLoginInputs();
  });
}

function clearLoginInputs() {
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  if (emailEl) {
    emailEl.value = "";
    emailEl.setAttribute("readonly", "true");
  }
  if (passEl) {
    passEl.value = "";
    passEl.setAttribute("readonly", "true");
  }
}

document.addEventListener("visibilitychange", function() {
  if (document.hidden && !isSelectingFile && !isViewingMedia) {
    logout();
  }
});

window.addEventListener("blur", function() {
  if (!isSelectingFile && !isViewingMedia) {
    logout();
  }
});

function triggerFileInput() {
  isSelectingFile = true;
  document.getElementById("file-input").click();
}

function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorElement = document.getElementById("auth-error");

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      errorElement.innerText = "";
      clearLoginInputs();
    })
    .catch(() => {
      errorElement.innerText = "লগইন ব্যর্থ হয়েছে! ইমেইল ও পাসওয়ার্ড চেক করুন।";
    });
}

// ৩. ইউজার স্টেট ও অনলাইন স্ট্যাটাস
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    clearLoginInputs();
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("chat-screen").classList.remove("hidden");
    document.getElementById("user-display").innerText = user.email.split('@')[0];

    database.ref("users/" + user.uid).set({
      email: user.email,
      status: "Online",
      lastSeen: Date.now()
    });

    trackPartnerStatus();
    loadMessages();
  } else {
    currentUser = null;
    clearLoginInputs();
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("chat-screen").classList.add("hidden");
    document.getElementById("messages-container").innerHTML = "";
  }
});

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

// ৪. ফাইল আপলোড
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

// ৫. মেসেজ পাঠানো
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
    input.style.height = "auto";
    cancelReply();
  }
}

// ৬. রিয়েলটাইম মেসেজ লোড ও রেন্ডারিং
function loadMessages() {
  const messagesContainer = document.getElementById("messages-container");

  database.ref("messages").on("value", (snapshot) => {
    messagesContainer.innerHTML = "";
    allVisibleMessageIds = [];

    snapshot.forEach((childSnapshot) => {
      const msgKey = childSnapshot.key;
      const msgData = childSnapshot.val();
      const isMe = msgData.senderUid === currentUser.uid;

      if (!isMe && !msgData.isSeen) {
        database.ref("messages/" + msgKey).update({ isSeen: true });
      }

      if (!msgData.isDeleted) {
        allVisibleMessageIds.push(msgKey);
      }

      // প্রতিটি মেসেজের জন্য রো (Row) তৈরি
      const rowDiv = document.createElement("div");
      rowDiv.classList.add("message-row", isMe ? "sent-row" : "received-row");

      // সিলেকশন মোড চালু থাকলে গোল সিলেকশন বাটন দেখাবে
      if (isSelectionMode && !msgData.isDeleted) {
        const circleDiv = document.createElement("div");
        circleDiv.classList.add("select-circle");
        if (selectedMessageIds.includes(msgKey)) {
          circleDiv.classList.add("checked");
          circleDiv.innerText = "✓";
        }
        circleDiv.onclick = () => toggleSelectMessage(msgKey);
        rowDiv.appendChild(circleDiv);
      }

      // বামপাশে ডিলিট আইকন (নিজের মেসেজের ক্ষেত্রে)
      if (!isSelectionMode && !msgData.isDeleted && isMe) {
        const delIcon = document.createElement("span");
        delIcon.className = "msg-delete-icon";
        delIcon.innerText = "🗑️";
        delIcon.title = "ডিলিট নির্বাচন করুন";
        delIcon.onclick = () => startSelectionWith(msgKey);
        rowDiv.appendChild(delIcon);
      }

      // মূল মেসেজ বাবল
      const msgDiv = document.createElement("div");
      msgDiv.classList.add("message", isMe ? "sent" : "received");
      msgDiv.id = "msg-" + msgKey;

      let contentHTML = "";

      if (msgData.isDeleted) {
        contentHTML = `<p class="deleted-msg">🚫 এই মেসেজটি মুছে ফেলা হয়েছে</p>`;
      } else {
        // রিপ্লাই করা মেসেজের উপরে আগের মেসেজের প্রিভিউ এবং ক্লিক করলে স্ক্রোল
        if (msgData.replyTo) {
          const safeKey = msgData.replyToKey || "";
          contentHTML += `<div class="reply-quote" onclick="scrollToMessage('${safeKey}')">📌 ${msgData.replyTo}</div>`;
        }

        if (msgData.mediaType === "image") {
          contentHTML += `<img src="${msgData.mediaData}" class="media-preview-img" onclick="openMediaViewer('${msgKey}', 'image')">
                          <a href="${msgData.mediaData}" download="image.jpg" class="download-link">📥 ডাউনলোড করুন</a>`;
        } else if (msgData.mediaType === "video") {
          contentHTML += `<div class="video-thumb-wrapper" onclick="openMediaViewer('${msgKey}', 'video')">
                            <video src="${msgData.mediaData}#t=0.5" class="media-preview-video" preload="metadata"></video>
                            <div class="play-overlay-icon">▶</div>
                          </div>
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

      const timeStr = formatTime(msgData.timestamp);
      const tickHTML = isMe && !msgData.isDeleted ? (msgData.isSeen ? `<span class="seen-tick">✓✓</span>` : `<span class="unseen-tick">✓</span>`) : "";
      contentHTML += `<div class="msg-footer"><span>${timeStr}</span> ${tickHTML}</div>`;

      msgDiv.innerHTML = contentHTML;

      if (selectedMessageIds.includes(msgKey)) {
        msgDiv.classList.add("selected-message");
      }

      // ডানদিকে স্লাইড করে রিপ্লাই (লং-প্রেস ডিলিট বাদ দেওয়া হয়েছে যাতে টেক্সট কপি করা যায়)
      if (!msgData.isDeleted) {
        addSwipeReplyEvent(msgDiv, msgKey, msgData.text || "মিডিয়া ফাইল");
        
        // সিলেকশন মোড চালু থাকলে মেসেজে ক্লিক করলেও সিলেক্ট/আনসিলেক্ট হবে
        msgDiv.addEventListener("click", (e) => {
          if (isSelectionMode) {
            e.stopPropagation();
            toggleSelectMessage(msgKey);
          }
        });
      }

      rowDiv.appendChild(msgDiv);

      // ডানপাশে ডিলিট আইকন (অপরজনের মেসেজের ক্ষেত্রে)
      if (!isSelectionMode && !msgData.isDeleted && !isMe) {
        const delIcon = document.createElement("span");
        delIcon.className = "msg-delete-icon";
        delIcon.innerText = "🗑️";
        delIcon.title = "ডিলিট নির্বাচন করুন";
        delIcon.onclick = () => startSelectionWith(msgKey);
        rowDiv.appendChild(delIcon);
      }

      messagesContainer.appendChild(rowDiv);
    });

    if (!isSelectionMode) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });
}

function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// ৭. রিপ্লাই প্রিভিউতে ক্লিক করলে মূল মেসেজে গিয়ে হালকা ভিন্ন কালারে হাইলাইট করা
function scrollToMessage(key) {
  if (!key) return;
  const targetElement = document.getElementById("msg-" + key);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetElement.classList.remove("highlight-message");
    void targetElement.offsetWidth; // এনিমেশন রিস্টার্ট করার জন্য
    targetElement.classList.add("highlight-message");
    
    setTimeout(() => {
      targetElement.classList.remove("highlight-message");
    }, 2000);
  }
}

// ৮. শুধুমাত্র ডানদিকে স্লাইড করে রিপ্লাই (টেক্সট কপি বাধামুক্ত রাখা হয়েছে)
function addSwipeReplyEvent(element, msgKey, textPreview) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;

  element.addEventListener("touchstart", (e) => {
    if (isSelectionMode) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = false;
  }, { passive: true });

  element.addEventListener("touchmove", (e) => {
    if (isSelectionMode) return;
    currentX = e.touches[0].clientX;
    let currentY = e.touches[0].clientY;
    let diffX = currentX - startX;
    let diffY = Math.abs(currentY - startY);

    // শুধুমাত্র ডানদিকে স্লাইড করলে কাজ করবে (উপর-নিচ স্ক্রোল বা টেক্সট সিলেকশনে বাধা দেবে না)
    if (diffX > 15 && diffY < 25) {
      isSwiping = true;
      if (diffX < 80) {
        element.style.transform = `translateX(${diffX}px)`;
      }
    }
  }, { passive: true });

  element.addEventListener("touchend", () => {
    if (isSelectionMode) return;
    let diffX = currentX - startX;
    element.style.transform = `translateX(0px)`;

    if (isSwiping && diffX > 50) {
      setReply(textPreview, msgKey);
    }

    startX = 0;
    currentX = 0;
    isSwiping = false;
  });
}

// ৯. নতুন সিলেকশন ও ডিলিট সিস্টেম (ডিলিট চিহ্নে ক্লিক করলে চালু হবে)
function startSelectionWith(key) {
  isSelectionMode = true;
  selectedMessageIds = [key];
  history.pushState({ selectionMode: true }, "");
  updateSelectionUI();
}

function toggleSelectMessage(key) {
  const index = selectedMessageIds.indexOf(key);
  if (index > -1) {
    selectedMessageIds.splice(index, 1);
  } else {
    selectedMessageIds.push(key);
  }
  updateSelectionUI();
}

function toggleSelectAll() {
  if (selectedMessageIds.length === allVisibleMessageIds.length) {
    selectedMessageIds = [];
  } else {
    selectedMessageIds = [...allVisibleMessageIds];
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const selectionBar = document.getElementById("selection-bar");
  const selectAllBtn = document.getElementById("select-all-btn");

  if (isSelectionMode) {
    selectionBar.classList.remove("hidden");
    document.getElementById("selected-count").innerText = `${selectedMessageIds.length} টি সিলেক্টেড`;
    
    if (selectedMessageIds.length === allVisibleMessageIds.length && allVisibleMessageIds.length > 0) {
      selectAllBtn.innerText = "⬜ Unselect All";
    } else {
      selectAllBtn.innerText = "☑️ All";
    }
  } else {
    selectionBar.classList.add("hidden");
  }
  loadMessages();
}

function cancelSelection() {
  isSelectionMode = false;
  selectedMessageIds = [];
  document.getElementById("selection-bar").classList.add("hidden");
  loadMessages();
}

// মোবাইলের ব্যাক বাটন চাপলে সিলেকশন বাতিল হবে
window.addEventListener("popstate", function() {
  if (isViewingMedia) {
    closeMediaViewer();
  } else if (isSelectionMode) {
    cancelSelection();
  }
});

// ১০. নির্বাচিত বা সব মেসেজ ডিলিট করা
function deleteSelectedMessages() {
  if (selectedMessageIds.length === 0) {
    alert("ডিলিট করার জন্য অন্তত একটি মেসেজ সিলেক্ট করুন।");
    return;
  }

  if (confirm(`নির্বাচিত ${selectedMessageIds.length} টি মেসেজ ডিলিট করতে চান?`)) {
    // সব মেসেজ সিলেক্ট করা থাকলে পুরো ডাটাবেস ক্লিয়ার হবে, নাহলে নির্দিষ্ট মেসেজ ডিলিট চিহ্নিত হবে
    if (selectedMessageIds.length === allVisibleMessageIds.length) {
      database.ref("messages").remove();
    } else {
      selectedMessageIds.forEach(key => {
        database.ref("messages").child(key).update({ isDeleted: true, text: "", mediaData: "" });
      });
    }
    cancelSelection();
  }
}

// ১১. রিপ্লাই সেট ও বাতিল করা
function setReply(text, key) {
  replyingToMessage = text;
  replyingToMsgKey = key;
  document.getElementById("reply-preview-bar").classList.remove("hidden");
  document.getElementById("reply-text").innerText = text;
}

function cancelReply() {
  replyingToMessage = null;
  replyingToMsgKey = null;
  document.getElementById("reply-preview-bar").classList.add("hidden");
}

// ১২. টেক্সটএরিয়া অটো-রিসাইজ
function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = (el.scrollHeight) + "px";
}

// ১৩. ফুল-স্ক্রিন ছবি ভিউ ও ভিডিও প্লেয়ার ফাংশন
async function openMediaViewer(msgKey, type) {
  if (isSelectionMode) return; // ডিলিট সিলেকশন চালু থাকলে ওপেন হবে না

  const targetImgOrVid = document.querySelector(`#msg-${msgKey} ${type === 'image' ? 'img' : 'video'}`);
  if (!targetImgOrVid) return;

  // ভিডিওর সোর্স থেকে #t=0.5 বাদ দিয়ে আসল ডাটা নেওয়া
  const mediaSrc = targetImgOrVid.src.replace("#t=0.5", "");

  isViewingMedia = true; // অটো-লগআউট সাময়িকভাবে বন্ধ করা হলো

  // ভিডিও চলার সময় মোবাইলের স্ক্রিন যাতে অফ না হয়ে যায় (Wake Lock API)
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {}

  const modal = document.getElementById("media-viewer-modal");
  const modalContent = document.getElementById("media-modal-content");
  const downloadBtn = document.getElementById("modal-download-btn");

  downloadBtn.href = mediaSrc;
  downloadBtn.download = type === "image" ? "image.jpg" : "video.mp4";

  if (type === "image") {
    modalContent.innerHTML = `<img src="${mediaSrc}" alt="Full Image">`;
  } else {
    modalContent.innerHTML = `<video src="${mediaSrc}" controls autoplay playsinline></video>`;
  }

  modal.classList.remove("hidden");
  history.pushState({ mediaViewer: true }, "");
}

function closeMediaViewer() {
  const modal = document.getElementById("media-viewer-modal");
  const modalContent = document.getElementById("media-modal-content");

  modal.classList.add("hidden");
  modalContent.innerHTML = ""; // ভিডিও প্লে বন্ধ করা হলো
  isViewingMedia = false; // আবার স্বাভাবিক অটো-লগআউট সেফটি চালু হলো

  // Wake Lock রিলিজ করা
  if (wakeLock !== null) {
    wakeLock.release().then(() => { wakeLock = null; });
  }
}