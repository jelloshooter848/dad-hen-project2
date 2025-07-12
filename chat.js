// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCcgpC6uXs6SzvPQ0-LQG3Ko75vfdgJRas",
  authDomain: "friend-chat-app-105d6.firebaseapp.com",
  databaseURL: "https://friend-chat-app-105d6-default-rtdb.firebaseio.com",
  projectId: "friend-chat-app-105d6",
  storageBucket: "friend-chat-app-105d6.firebasestorage.app",
  messagingSenderId: "749608456867",
  appId: "1:749608456867:web:5c84e879670118880f6516"
};

// Initialize Firebase
let database = null;
let isFirebaseEnabled = false;

try {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        isFirebaseEnabled = true;
        console.log("Firebase connected successfully!");
    } else {
        console.log("Firebase not configured - running in local mode");
    }
} catch (error) {
    console.log("Firebase connection failed - running in local mode:", error);
}

let username = '';
let messages = {};
let currentRoom = 'general';
let isPrivateChat = false;
let privateChatFriend = '';
let currentUsernames = [];
let userPresenceRef = null;

const rooms = {
    general: '🏠 General',
    games: '🎮 Games',
    homework: '📚 Homework',
    sports: '⚽ Sports',
    music: '🎵 Music',
    movies: '🎬 Movies'
};

function startChat(isAutoLogin = false) {
    const usernameInput = document.getElementById('usernameInput');
    const setupDiv = document.getElementById('setup');
    const chatArea = document.getElementById('chatArea');
    
    username = usernameInput.value.trim();
    
    if (username === '') {
        if (!isAutoLogin) {
            alert('Please enter your name! 😊');
        }
        return;
    }
    
    if (isFirebaseEnabled) {
        checkUsernameAndJoin(isAutoLogin);
    } else {
        localUsernameCheck(isAutoLogin);
    }
    
    function localUsernameCheck(isAutoLogin = false) {
        loadCurrentUsernames();
        
        if (currentUsernames.includes(username.toLowerCase())) {
            if (isAutoLogin) {
                // Auto-login failed, clear saved username and show login
                localStorage.removeItem('chatUsername');
                showNotification(`Username "${username}" is taken. Please choose a different name.`, 'error');
                return;
            } else {
                alert(`Sorry, the name "${username}" is already taken! Please choose a different name. 😔`);
                return;
            }
        }
        
        currentUsernames.push(username.toLowerCase());
        saveCurrentUsernames();
        completeSetup();
    }
    
    function checkUsernameAndJoin(isAutoLogin = false) {
        database.ref('users').once('value', (snapshot) => {
            const users = snapshot.val() || {};
            const usernames = Object.values(users).map(user => user.username.toLowerCase());
            
            if (usernames.includes(username.toLowerCase())) {
                if (isAutoLogin) {
                    // Auto-login failed, clear saved username and show login
                    localStorage.removeItem('chatUsername');
                    showNotification(`Username "${username}" is taken. Please choose a different name.`, 'error');
                    return;
                } else {
                    alert(`Sorry, the name "${username}" is already taken! Please choose a different name. 😔`);
                    return;
                }
            }
            
            // Add user to Firebase
            const userId = Date.now().toString();
            userPresenceRef = database.ref(`users/${userId}`);
            userPresenceRef.set({
                username: username,
                online: true,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            
            // Remove user when they disconnect
            userPresenceRef.onDisconnect().remove();
            
            setupFirebaseListeners();
            completeSetup();
        });
    }
    
    function completeSetup() {
        // Save username to localStorage on successful login
        localStorage.setItem('chatUsername', username);
        
        setupDiv.classList.add('hidden');
        chatArea.classList.remove('hidden');
        
        setupRoomButtons();
        setupPrivateChat();
        switchRoom('general');
        
        document.getElementById('messageInput').focus();
        
        // Initialize online users list
        const savedUsername = localStorage.getItem('chatUsername');
        const isReturningUser = savedUsername === username;
        
        if (isFirebaseEnabled) {
            if (isReturningUser) {
                showNotification(`Welcome back, ${username}! 🌐`, 'success');
            } else {
                showNotification(`Connected to live chat! 🌐`, 'success');
            }
            // Firebase listener will update the list automatically
        } else {
            if (isReturningUser) {
                showNotification(`Welcome back, ${username}! 💻`, 'info');
            } else {
                showNotification(`Running in local mode 💻`, 'info');
            }
            updateOnlineUsersList({}); // Initialize local mode display
        }
    }
}

function setupFirebaseListeners() {
    if (!isFirebaseEnabled) return;
    
    // Listen for new messages in all rooms
    Object.keys(rooms).forEach(roomName => {
        database.ref(`messages/${roomName}`).on('child_added', (snapshot) => {
            const message = snapshot.val();
            if (message && currentRoom === roomName && !isPrivateChat) {
                displayMessage(message, message.username === username);
            }
        });
        
    });
    
    // Listen for private messages
    database.ref(`privateMessages/${username}`).on('child_added', (snapshot) => {
        const message = snapshot.val();
        if (message && isPrivateChat && privateChatFriend === message.from) {
            displayMessage({
                text: message.text,
                username: message.from,
                timestamp: message.timestamp
            }, false);
        }
    });
    
    // Listen for private chat requests
    database.ref(`requests/${username}`).on('child_added', (snapshot) => {
        const request = snapshot.val();
        if (request && request.from !== username) {
            showFirebaseRequestNotification(request, snapshot.key);
        }
    });
    
    // Listen for online users changes
    database.ref('users').on('value', (snapshot) => {
        updateOnlineUsersList(snapshot.val() || {});
    });
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();
    
    if (messageText === '') {
        return;
    }
    
    const message = {
        text: messageText,
        username: username,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        id: Date.now()
    };
    
    if (isFirebaseEnabled) {
        if (isPrivateChat) {
            // Send private message
            database.ref(`privateMessages/${privateChatFriend}`).push({
                from: username,
                text: messageText,
                timestamp: message.timestamp,
                id: message.id
            });
            // Only display for private messages since they don't come back through listeners
            displayMessage(message, true);
        } else {
            // Send public message - don't display here, let the listener handle it
            database.ref(`messages/${currentRoom}`).push(message);
        }
    } else {
        // Local mode
        const chatKey = isPrivateChat ? `private_${privateChatFriend}` : currentRoom;
        
        if (!messages[chatKey]) {
            messages[chatKey] = [];
        }
        messages[chatKey].push(message);
        saveMessages();
        displayMessage(message, true);
    }
    messageInput.value = '';
    messageInput.focus();
}

function displayMessage(message, isSent = false) {
    const messagesContainer = document.getElementById('messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.innerHTML = `
        <div>${message.text}</div>
        <div class="message-info">${message.username} • ${message.timestamp}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function saveMessages() {
    if (!isFirebaseEnabled) {
        try {
            localStorage.setItem('chatMessages', JSON.stringify(messages));
        } catch (e) {
            console.log('Cannot save messages');
        }
    }
}

function loadMessages() {
    if (!isFirebaseEnabled) {
        try {
            const savedMessages = localStorage.getItem('chatMessages');
            if (savedMessages) {
                messages = JSON.parse(savedMessages);
            }
        } catch (e) {
            console.log('Cannot load messages');
            messages = {};
        }
    }
}

function loadRoomMessages() {
    const messagesContainer = document.getElementById('messages');
    
    if (isPrivateChat) {
        messagesContainer.innerHTML = `
            <div class="message received">
                <div>Private chat with ${privateChatFriend} 💬</div>
                <div class="message-info">Chat Bot • just now</div>
            </div>
        `;
    } else {
        messagesContainer.innerHTML = `
            <div class="message received">
                <div>Welcome to ${rooms[currentRoom]}! 🎉</div>
                <div class="message-info">Chat Bot • just now</div>
            </div>
        `;
    }
    
    if (isFirebaseEnabled) {
        // Load recent messages from Firebase
        if (!isPrivateChat) {
            database.ref(`messages/${currentRoom}`).limitToLast(50).once('value', (snapshot) => {
                snapshot.forEach((childSnapshot) => {
                    const message = childSnapshot.val();
                    const isSent = message.username === username;
                    displayMessage(message, isSent);
                });
            });
        }
    } else {
        // Load from local storage
        const chatKey = isPrivateChat ? `private_${privateChatFriend}` : currentRoom;
        if (messages[chatKey]) {
            messages[chatKey].forEach(message => {
                const isSent = message.username === username;
                displayMessage(message, isSent);
            });
        }
    }
}

function switchRoom(roomName) {
    isPrivateChat = false;
    currentRoom = roomName;
    
    document.getElementById('roomSelector').classList.remove('hidden');
    document.getElementById('backToRooms').classList.add('hidden');
    
    document.querySelectorAll('.room-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelector(`[data-room="${roomName}"]`).classList.add('active');
    
    document.getElementById('currentRoomDisplay').textContent = rooms[roomName];
    
    loadRoomMessages();
}

function startPrivateChat(friendName) {
    isPrivateChat = true;
    privateChatFriend = friendName;
    
    document.getElementById('roomSelector').classList.add('hidden');
    document.getElementById('backToRooms').classList.remove('hidden');
    
    const displayText = `${friendName}`;
    document.getElementById('currentRoomDisplay').innerHTML = `${displayText} <span class="private-indicator">Private</span>`;
    
    loadRoomMessages();
}

function setupRoomButtons() {
    if (!isFirebaseEnabled) {
        loadMessages();
    }
    
    document.querySelectorAll('.room-button').forEach(button => {
        button.addEventListener('click', function() {
            const roomName = this.getAttribute('data-room');
            switchRoom(roomName);
        });
    });
}

function setupPrivateChat() {
    document.getElementById('privateChatBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('privateRequestModal').classList.remove('hidden');
        document.getElementById('friendRequestInput').focus();
    });
    
    setupEmojiPicker();
    
    document.getElementById('sendRequest').addEventListener('click', () => {
        const friendName = document.getElementById('friendRequestInput').value.trim();
        if (friendName && friendName !== username) {
            sendPrivateRequest(friendName);
            document.getElementById('privateRequestModal').classList.add('hidden');
            document.getElementById('friendRequestInput').value = '';
        } else if (friendName === username) {
            alert("You can't chat with yourself! 😄");
        } else {
            alert('Please enter a friend\'s name! 😊');
        }
    });
    
    document.getElementById('cancelRequest').addEventListener('click', () => {
        document.getElementById('privateRequestModal').classList.add('hidden');
        document.getElementById('friendRequestInput').value = '';
    });
    
    document.getElementById('backToRooms').addEventListener('click', () => {
        switchRoom('general');
    });
    
    document.getElementById('friendRequestInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('sendRequest').click();
        }
    });
    
    // Setup online users toggle for all devices
    const onlineToggle = document.getElementById('onlineToggle');
    const onlineUsers = document.getElementById('onlineUsers');
    const closeOnline = document.getElementById('closeOnline');
    
    if (onlineToggle && onlineUsers && closeOnline) {
        // Initialize as hidden on all devices
        onlineUsers.classList.add('hidden');
        
        onlineToggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                // Mobile behavior - slide in/out
                if (onlineUsers.classList.contains('hidden')) {
                    onlineUsers.classList.remove('hidden');
                    onlineUsers.classList.add('show');
                } else {
                    onlineUsers.classList.remove('show');
                    setTimeout(() => {
                        onlineUsers.classList.add('hidden');
                    }, 300);
                }
            } else {
                // Desktop behavior - show/hide
                onlineUsers.classList.toggle('hidden');
            }
        });
        
        closeOnline.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                onlineUsers.classList.remove('show');
                setTimeout(() => {
                    onlineUsers.classList.add('hidden');
                }, 300);
            } else {
                onlineUsers.classList.add('hidden');
            }
        });
        
        // Close when clicking outside (on mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !onlineUsers.contains(e.target) && 
                !onlineToggle.contains(e.target) && 
                onlineUsers.classList.contains('show')) {
                onlineUsers.classList.remove('show');
                setTimeout(() => {
                    onlineUsers.classList.add('hidden');
                }, 300);
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                // Switch to desktop mode
                onlineUsers.classList.remove('show');
                if (!onlineUsers.classList.contains('hidden')) {
                    onlineUsers.style.display = 'flex';
                }
            } else {
                // Switch to mobile mode
                if (!onlineUsers.classList.contains('hidden')) {
                    onlineUsers.classList.remove('show');
                }
            }
        });
    }
    
    // Setup logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

function logout() {
    if (confirm('Are you sure you want to logout? You\'ll need to enter your username again.')) {
        // Clear saved username
        localStorage.removeItem('chatUsername');
        
        // Release current session
        releaseUsername();
        
        // Reset to login screen
        document.getElementById('chatArea').classList.add('hidden');
        document.getElementById('setup').classList.remove('hidden');
        document.getElementById('usernameInput').value = '';
        document.getElementById('usernameInput').focus();
        
        // Reset variables
        username = '';
        currentRoom = 'general';
        isPrivateChat = false;
        privateChatFriend = '';
        
        showNotification('Logged out successfully', 'info');
    }
}

function sendPrivateRequest(friendName) {
    if (isFirebaseEnabled) {
        // Check if user exists and is online
        database.ref('users').once('value', (snapshot) => {
            const users = snapshot.val() || {};
            const userExists = Object.values(users).some(user => user.username === friendName);
            
            if (userExists) {
                database.ref(`requests/${friendName}`).push({
                    from: username,
                    timestamp: Date.now(),
                    message: `${username} wants to chat privately with you!`
                });
                showNotification(`Request sent to ${friendName}! 📨`, 'info');
            } else {
                showNotification(`User "${friendName}" is not online right now.`, 'error');
            }
        });
    } else {
        // Local simulation
        showNotification(`Request sent to ${friendName}! 📨`, 'info');
        setTimeout(() => {
            simulateIncomingRequest(friendName);
        }, 2000 + Math.random() * 3000);
    }
}

function simulateIncomingRequest(fromUser) {
    const request = {
        from: fromUser,
        to: username,
        timestamp: Date.now(),
        id: `incoming_${Date.now()}`
    };
    
    showRequestNotification(request);
}

function showRequestNotification(request) {
    const notification = document.createElement('div');
    notification.className = 'notification request';
    notification.innerHTML = `
        <div><strong>${request.from}</strong> wants to chat privately with you! 💬</div>
        <div class="notification-buttons">
            <button class="notification-btn accept" onclick="acceptRequest('${request.from}', '${request.id}')">Accept ✅</button>
            <button class="notification-btn decline" onclick="declineRequest('${request.from}', '${request.id}')">Decline ❌</button>
        </div>
    `;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 30000);
}

function showFirebaseRequestNotification(request, requestKey) {
    const notification = document.createElement('div');
    notification.className = 'notification request';
    notification.innerHTML = `
        <div><strong>${request.from}</strong> wants to chat privately with you! 💬</div>
        <div class="notification-buttons">
            <button class="notification-btn accept" onclick="acceptFirebaseRequest('${request.from}', '${requestKey}')">Accept ✅</button>
            <button class="notification-btn decline" onclick="declineFirebaseRequest('${request.from}', '${requestKey}')">Decline ❌</button>
        </div>
    `;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 30000);
}

function acceptRequest(friendName, requestId) {
    const notification = document.querySelector(`[onclick*="${requestId}"]`).closest('.notification');
    if (notification) {
        notification.remove();
    }
    
    showNotification(`You accepted ${friendName}'s request! Starting private chat... 🎉`, 'success');
    
    setTimeout(() => {
        startPrivateChat(friendName);
    }, 1000);
}

function acceptFirebaseRequest(friendName, requestKey) {
    const notification = document.querySelector(`[onclick*="${requestKey}"]`).closest('.notification');
    if (notification) {
        notification.remove();
    }
    
    // Remove the request
    database.ref(`requests/${username}/${requestKey}`).remove();
    
    showNotification(`You accepted ${friendName}'s request! Starting private chat... 🎉`, 'success');
    
    setTimeout(() => {
        startPrivateChat(friendName);
    }, 1000);
}

function declineRequest(friendName, requestId) {
    const notification = document.querySelector(`[onclick*="${requestId}"]`).closest('.notification');
    if (notification) {
        notification.remove();
    }
    
    showNotification(`You declined ${friendName}'s request.`, 'info');
}

function declineFirebaseRequest(friendName, requestKey) {
    const notification = document.querySelector(`[onclick*="${requestKey}"]`).closest('.notification');
    if (notification) {
        notification.remove();
    }
    
    // Remove the request
    database.ref(`requests/${username}/${requestKey}`).remove();
    
    showNotification(`You declined ${friendName}'s request.`, 'info');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

function updateOnlineUsersList(users) {
    const onlineUsersList = document.getElementById('onlineUsersList');
    const onlineCount = document.getElementById('onlineCount');
    const mobileOnlineCount = document.getElementById('mobileOnlineCount');
    
    if (!onlineUsersList || !onlineCount) return;
    
    const userArray = Object.values(users);
    const sortedUsers = userArray.sort((a, b) => a.username.localeCompare(b.username));
    
    onlineCount.textContent = `(${userArray.length})`;
    if (mobileOnlineCount) {
        mobileOnlineCount.textContent = userArray.length;
    }
    
    if (isFirebaseEnabled) {
        onlineUsersList.innerHTML = '';
        
        if (userArray.length === 0) {
            onlineUsersList.innerHTML = `
                <div class="online-user">
                    <div class="online-indicator" style="background: #6c757d;"></div>
                    <div class="online-username">No one online</div>
                </div>
            `;
        } else {
            sortedUsers.forEach(user => {
                const userDiv = document.createElement('div');
                userDiv.className = 'online-user';
                
                const isCurrentUser = user.username === username;
                const usernameDisplay = isCurrentUser ? `${user.username} (you)` : user.username;
                
                userDiv.innerHTML = `
                    <div class="online-indicator"></div>
                    <div class="online-username" title="${user.username}">${usernameDisplay}</div>
                `;
                
                if (isCurrentUser) {
                    userDiv.style.fontWeight = 'bold';
                    userDiv.style.color = '#4a90e2';
                }
                
                onlineUsersList.appendChild(userDiv);
            });
        }
    } else {
        // Local mode - just show current user
        onlineUsersList.innerHTML = `
            <div class="online-user">
                <div class="online-indicator"></div>
                <div class="online-username">${username || 'You'} (local)</div>
            </div>
        `;
        onlineCount.textContent = '(1)';
        if (mobileOnlineCount) {
            mobileOnlineCount.textContent = '1';
        }
    }
}

function loadCurrentUsernames() {
    if (!isFirebaseEnabled) {
        try {
            const savedUsernames = localStorage.getItem('currentUsernames');
            if (savedUsernames) {
                currentUsernames = JSON.parse(savedUsernames);
            }
        } catch (e) {
            console.log('Cannot load current usernames');
            currentUsernames = [];
        }
    }
}

function saveCurrentUsernames() {
    if (!isFirebaseEnabled) {
        try {
            localStorage.setItem('currentUsernames', JSON.stringify(currentUsernames));
        } catch (e) {
            console.log('Cannot save current usernames');
        }
    }
}

function releaseUsername() {
    if (isFirebaseEnabled && userPresenceRef) {
        userPresenceRef.remove();
        userPresenceRef = null;
    } else if (username) {
        const index = currentUsernames.indexOf(username.toLowerCase());
        if (index > -1) {
            currentUsernames.splice(index, 1);
            saveCurrentUsernames();
            console.log(`Released username: ${username}`);
        }
    }
}

document.getElementById('startChat').addEventListener('click', startChat);
document.getElementById('sendButton').addEventListener('click', sendMessage);

document.getElementById('usernameInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        startChat();
    }
});

document.getElementById('messageInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

window.addEventListener('load', function() {
    document.getElementById('privateRequestModal').classList.add('hidden');
    
    // Try to auto-login with saved username
    tryAutoLogin();
    
    // Add PWA install prompt handling
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install button after a delay if not already installed
        setTimeout(() => {
            if (deferredPrompt && !window.matchMedia('(display-mode: standalone)').matches) {
                showInstallPrompt();
            }
        }, 30000); // Show after 30 seconds
    });
    
    // Handle successful installation
    window.addEventListener('appinstalled', () => {
        showNotification('Friend Chat installed! 📱', 'success');
        deferredPrompt = null;
    });
    
    function showInstallPrompt() {
        if (deferredPrompt) {
            const notification = document.createElement('div');
            notification.className = 'notification install-prompt';
            notification.innerHTML = `
                <div><strong>Install Friend Chat</strong></div>
                <div style="font-size: 0.9em; margin: 5px 0;">Add to your home screen for a better experience!</div>
                <div class="notification-buttons">
                    <button class="notification-btn accept" onclick="installApp()">Install 📱</button>
                    <button class="notification-btn decline" onclick="dismissInstall()">Not Now</button>
                </div>
            `;
            document.getElementById('notifications').appendChild(notification);
            
            window.installApp = () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((result) => {
                    deferredPrompt = null;
                    notification.remove();
                });
            };
            
            window.dismissInstall = () => {
                notification.remove();
                deferredPrompt = null;
            };
            
            // Auto-dismiss after 20 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 20000);
        }
    }
});

function tryAutoLogin() {
    const savedUsername = localStorage.getItem('chatUsername');
    if (savedUsername) {
        document.getElementById('usernameInput').value = savedUsername;
        // Show loading message
        showNotification('Reconnecting as ' + savedUsername + '...', 'info');
        // Attempt to login automatically
        setTimeout(() => {
            startChat(true); // true indicates auto-login attempt
        }, 500);
    }
}

// Release username when user leaves (using modern approach)
window.addEventListener('beforeunload', function() {
    releaseUsername();
});

// Also release on page visibility change (when tab is closed)
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        setTimeout(function() {
            if (document.hidden) {
                releaseUsername();
            }
        }, 30000);
    }
});

// Emoji picker functionality
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑'],
    food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🫑', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🥖', '🍞', '🥨', '🥯', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭'],
    activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🪂', '🏋', '🤸', '🤼', '🤽', '🤾', '🧗', '🚴', '🚵', '🧘', '🏇', '🏊'],
    objects: ['💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖', '🧰', '🔧', '🔨', '⚒', '🛠', '⛏', '🪓', '🪚', '🔩', '⚙', '🪤', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🪓', '🗡', '⚔', '🛡', '🚬', '⚰', '🪦', '⚱', '🏺', '🔮', '📿', '🧿', '💈']
};

function setupEmojiPicker() {
    const emojiButton = document.getElementById('emojiButton');
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiGrid = document.getElementById('emojiGrid');
    const messageInput = document.getElementById('messageInput');
    
    if (!emojiButton || !emojiPicker || !emojiGrid || !messageInput) return;
    
    // Toggle emoji picker
    emojiButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        emojiPicker.classList.toggle('hidden');
        if (!emojiPicker.classList.contains('hidden')) {
            populateEmojis('smileys');
        }
    });
    
    // Close emoji picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && !emojiButton.contains(e.target)) {
            emojiPicker.classList.add('hidden');
        }
    });
    
    // Category switching
    document.querySelectorAll('.emoji-category').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const category = button.getAttribute('data-category');
            
            // Update active category
            document.querySelectorAll('.emoji-category').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Populate emojis for selected category
            populateEmojis(category);
        });
    });
    
    function populateEmojis(category) {
        const emojis = emojiCategories[category] || emojiCategories.smileys;
        emojiGrid.innerHTML = '';
        
        emojis.forEach(emoji => {
            const emojiButton = document.createElement('button');
            emojiButton.className = 'emoji-item';
            emojiButton.textContent = emoji;
            emojiButton.addEventListener('click', (e) => {
                e.preventDefault();
                insertEmoji(emoji);
            });
            emojiGrid.appendChild(emojiButton);
        });
    }
    
    function insertEmoji(emoji) {
        const currentValue = messageInput.value;
        const cursorPosition = messageInput.selectionStart;
        
        const newValue = currentValue.slice(0, cursorPosition) + emoji + currentValue.slice(cursorPosition);
        messageInput.value = newValue;
        
        // Move cursor after inserted emoji
        const newPosition = cursorPosition + emoji.length;
        messageInput.setSelectionRange(newPosition, newPosition);
        messageInput.focus();
        
        // Hide emoji picker after selection
        emojiPicker.classList.add('hidden');
    }
}


