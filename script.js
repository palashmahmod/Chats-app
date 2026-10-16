// ১. ফায়ারবেস কনফিগারেশন বসান (Firebase Console থেকে পাওয়া তথ্য)
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
let isSelectingFile = false; // গ্যালারি খোলার সময় ফ্ল্যাগ চেক করার জন্য

// ১. পাসওয়ার্ড মুছে ফেলা ও স্ক্রিন লকে অটো-লগআউট
function logout() {
  auth.signOut().then(() => {
    document.getElementById("password").value = ""; // পাসওয়ার্ড ইনপুট ফিল্ড খালি করা
  });
}

// স্ক্রিন লক বা অ্যাপ মিনিমাইজ হলে লগআউট (ফাইল সিলেক্ট করার সময় ছাড় দেওয়া হবে)
document.addEventListener("visibilitychange", function() {
  if (document.hidden && !isSelectingFile) {
    logout();
  }
});

// উইন্ডো ফোকাস চলে গেলেও লগআউট (ফাইল সিলেক্ট করার সময় ছাড়া)
window.addEventListener("blur", function() {
  if (!isSelectingFile) {
    logout();
  }
});

// ২. ফাইল ইনপুট ট্রিগার ফাংশন (গ্যালারি খোলার সময় অটো-লগআউট পজ রাখবে)
function triggerFileInput() {
  isSelectingFile = true;
  document.getElementById("file-input").click();
}

// ৩. লগইন সার্ভিস
function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const errorElement = document.getElementById("auth-error");

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      errorElement.innerText = "";
      document.getElementById("password").value = ""; // সফল লগইনের পর পাসওয়ার্ড রিসেট
    })
    .catch((error) => {
      errorElement.innerText = "লগইন ব্যর্থ হয়েছে!";
    });
}

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("chat-screen").classList.remove("hidden");
    document.getElementById("user-display").innerText = user.email.split('@')[0];
    loadMessages();
  } else {
    currentUser = null;
    document.getElementById("password").value = "";
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("chat-screen").classList.add("hidden");
    document.getElementById("messages-container").innerHTML = "";
  }
});

// ৪. গ্যালারি থেকে ছবি ও ভিডিও রূপান্তর (Base64)
function handleFileUpload(event) {
  const file = event.target.files[0];

  // ফাইল সিলেকশন শেষ হওয়ার পর সেফটি টাইমআউট
  setTimeout(() => {
    isSelectingFile = false;
  }, 1000);

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
    timestamp: Date.now()
  });
  cancelReply();
}

// ৫. মেসেজ পাঠানো (টেক্সট, ইউটিউব/রিলস লিংক, এবং রিপ্লাইসহ)
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
      timestamp: Date.now()
    });
    input.value = "";
    cancelReply();
  }
}

// ৬. রিয়েলটাইম মেসেজ লোড ও রেন্ডারিং
function loadMessages() {
  const messagesContainer = document.getElementById("messages-container");

  database.ref("messages").on("value", (snapshot) => {
    messagesContainer.innerHTML = "";

    snapshot.forEach((childSnapshot) => {
      const msgKey = childSnapshot.key;
      const msgData = childSnapshot.val();

      const msgDiv = document.createElement("div");
      const isMe = msgData.senderUid === currentUser.uid;

      msgDiv.classList.add("message", isMe ? "sent" : "received");
      msgDiv.setAttribute("data-key", msgKey);

      let contentHTML = "";

      // রিপ্লাই মেসেজ থাকলে প্রিভিউ দেখানো
      if (msgData.replyTo) {
        contentHTML += `<div class="reply-quote">📌 ${msgData.replyTo}</div>`;
      }

      // টেক্সট নাকি মিডিয়া তা পরোক্ষভাবে চেক
      if (msgData.mediaType === "image") {
        contentHTML += `<img src="${msgData.mediaData}" class="media-preview-img">
                        <a href="${msgData.mediaData}" download="image.jpg" class="download-link">📥 ডাউনলোড করুন</a>`;
      } else if (msgData.mediaType === "video") {
        contentHTML += `<video src="${msgData.mediaData}" controls class="media-preview-video"></video>
                        <a href="${msgData.mediaData}" download="video.mp4" class="download-link">📥 ডাউনলোড করুন</a>`;
      } else if (msgData.text) {
        // ইউটিউব লিংক ডিটেকশন
        if (msgData.text.includes("youtube.com") || msgData.text.includes("youtu.be")) {
          const videoId = extractYouTubeId(msgData.text);
          contentHTML += `<p>${msgData.text}</p>
                          <iframe class="video-embed" src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>`;
        } else {
          contentHTML += `<p>${msgData.text}</p>`;
        }
      }

      msgDiv.innerHTML = contentHTML;

      // সিলেক্টেড কি না দেখা
      if (selectedMessageIds.includes(msgKey)) {
        msgDiv.classList.add("selected-message");
      }

      // কাস্টম ক্লিক ও স্লাইড ইভেন্ট যোগ করা (ডানদিকে স্লাইড করে রিপ্লাই)
      addSwipeAndSelectEvents(msgDiv, msgKey, msgData.text || "মিডিয়া ফাইল");

      messagesContainer.appendChild(msgDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// ইউটিউব ID বের করার সাহায্যকারী ফাংশন
function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// ৭. ডানদিকে স্লাইড (Swipe Right) করে রিপ্লাই এবং সিলেকশন
function addSwipeAndSelectEvents(element, msgKey, textPreview) {
  let startX = 0;
  let currentX = 0;

  element.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });

  element.addEventListener("touchmove", (e) => {
    currentX = e.touches[0].clientX;
    let diff = currentX - startX;

    if (diff > 0 && diff < 80) { // ডানদিকে স্লাইড সীমা
      element.style.transform = `translateX(${diff}px)`;
    }
  });

  element.addEventListener("touchend", (e) => {
    let diff = currentX - startX;
    element.style.transform = `translateX(0px)`;

    if (diff > 50) { // স্লাইড সম্পন্ন হলে রিপ্লাই ট্রিগার
      setReply(textPreview);
    }

    startX = 0;
    currentX = 0;
  });

  // লং প্রেস করে মাল্টিপল মেসেজ সিলেকশন
  let timer;
  element.addEventListener("touchstart", () => {
    timer = setTimeout(() => {
      toggleSelectMessage(msgKey);
    }, 600);
  });

  element.addEventListener("touchend", () => clearTimeout(timer));
  element.addEventListener("touchmove", () => clearTimeout(timer));
}

// ৮. সিলেকশন ও ডিলিট অপশনস
function toggleSelectMessage(key) {
  const index = selectedMessageIds.indexOf(key);

  if (index > -1) {
    selectedMessageIds.splice(index, 1);
  } else {
    selectedMessageIds.push(key);
  }

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

// সিলেক্ট করা মেসেজগুলো ডিলিট করা
function deleteSelectedMessages() {
  if (confirm("সিলেক্ট করা মেসেজগুলো ডিলিট করতে চান?")) {
    selectedMessageIds.forEach(key => {
      database.ref("messages").child(key).remove();
    });
    cancelSelection();
  }
}

// সব মেসেজ একসাথে ক্লিয়ার করার সিস্টেম
function clearAllMessages() {
  if (confirm("সতর্কতা: চ্যাটের সকল মেসেজ মুছে ফেলা হবে! আপনি কি নিশ্চিত?")) {
    database.ref("messages").remove();
    cancelSelection();
  }
}

// ৯. রিপ্লাই ফাংশনালিটি
function setReply(text) {
  replyingToMessage = text;
  document.getElementById("reply-preview-bar").classList.remove("hidden");
  document.getElementById("reply-text").innerText = `রিপ্লাই দেওয়া হচ্ছে: ${text}`;
}

function cancelReply() {
  replyingToMessage = null;
  document.getElementById("reply-preview-bar").classList.add("hidden");
}