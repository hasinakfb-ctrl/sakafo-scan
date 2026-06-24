// CONFIGURATION : LIEN DE DEPLOIEMENT GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbzTx82Wz5mw4OuLV-WvEqQ3MZSJc5DsyMBdXTKu1fzdj1LB_UEFFdceR_3FpD8wd2YiLg/exec";

// --- STARTUP FEATURES : Audio Synthétique & Haptique ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // Bip aigu pro
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.15);
        if (navigator.vibrate) navigator.vibrate([50]); // Vibration courte
    } else {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(200, audioCtx.currentTime); // Buzzer grave
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.3);
        if (navigator.vibrate) navigator.vibrate([150, 50, 150]); // Double vibration lourde
    }
}

// Micro-vibration pour les boutons (Haptic Feedback)
function vibrateClick() { if (navigator.vibrate) navigator.vibrate(15); }
document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', vibrateClick));

// Toast Notifications (remplace les alertes moches)
function showToast(message, type = 'default') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- MÉMOIRE LOCALE ---
let localDB = [];
let syncQueue = [];
let currentUser = null;

try {
    localDB = JSON.parse(localStorage.getItem('sakafom_db')) || [];
    syncQueue = JSON.parse(localStorage.getItem('sakafom_queue')) || [];
    currentUser = localStorage.getItem('sakafom_user') || null;
} catch (e) { console.error("Erreur cache", e); }

const screens = {
    splash: document.getElementById('splash-screen'), user: document.getElementById('user-screen'),
    home: document.getElementById('home-screen'), scanner: document.getElementById('scanner-screen'),
    stats: document.getElementById('stats-screen'), about: document.getElementById('about-screen')
};

let html5QrCode = null;
let isProcessing = false;

// --- DÉMARRAGE ---
setTimeout(() => {
    if (!currentUser) { showScreen('user'); } 
    else { 
        document.getElementById('current-user-display').innerText = currentUser; 
        showScreen('home'); updateSyncUI(); fetchDatabase(); 
    }
}, 1500);

function showScreen(screenName) {
    Object.values(screens).forEach(s => { if(s) s.classList.remove('active'); });
    if(screens[screenName]) screens[screenName].classList.add('active');
}

// GESTION AGENTS
function setUser(name) {
    currentUser = name;
    localStorage.setItem('sakafom_user', name);
    document.getElementById('current-user-display').innerText = currentUser;
    showScreen('home'); fetchDatabase();
}

function logout() {
    currentUser = null; localStorage.removeItem('sakafom_user'); showScreen('user');
}

// --- NAVIGATIONS ---
document.getElementById('btn-go-scan').addEventListener('click', () => { showScreen('scanner'); startScanner(); });
document.getElementById('btn-go-stats').addEventListener('click', () => { showScreen('stats'); loadLocalStats(); document.getElementById('details-stats-box').classList.add('hidden'); });
document.getElementById('btn-go-about').addEventListener('click', () => { showScreen('about'); });
document.getElementById('btn-back-home1').addEventListener('click', () => { stopScanner(); showScreen('home'); updateSyncUI(); });
document.getElementById('btn-back-home3').addEventListener('click', () => { showScreen('home'); });
document.getElementById('btn-back-home4').addEventListener('click', () => { showScreen('home'); });

// Sortie de l'application
document.getElementById('btn-quit').addEventListener('click', () => {
    const farewell = document.getElementById('farewell-screen');
    farewell.classList.remove('hidden');
    // Petit délai pour forcer le navigateur à peindre l'élément avant de lancer l'animation
    setTimeout(() => {
        farewell.classList.add('active');
        // Tente de fermer l'application après 2 secondes
        setTimeout(() => {
            try { navigator.app.exitApp(); } catch(e) {} // Cordova/Capacitor
            try { window.close(); } catch(e) {} // Navigateur web
        }, 2000);
    }, 10);
});

// --- SYNCHRONISATION ---
function fetchDatabase() {
    const statusBox = document.getElementById('sync-status');
    statusBox.innerText = "⏳ Actualisation..."; statusBox.style.background = "#e1b12c"; statusBox.style.color = "#111";

    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'fetch_db' }) })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            localDB = data.db; localStorage.setItem('sakafom_db', JSON.stringify(localDB)); updateSyncUI();
        }
    }).catch(() => updateSyncUI());
}

function updateSyncUI() {
    const statusBox = document.getElementById('sync-status');
    if (syncQueue.length > 0) { 
        statusBox.innerText = `⚠️ ${syncQueue.length} scan(s) en attente réseau`; statusBox.style.background = "#e67e22"; statusBox.style.color = "#fff"; pushSyncQueue(); 
    } else { 
        statusBox.innerText = `🟢 Base synchronisée (${localDB.length})`; statusBox.style.background = "#2ecc71"; statusBox.style.color = "#fff";
    }
}

function pushSyncQueue() {
    if (syncQueue.length === 0) return;
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'sync_batch', batch: syncQueue }) })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            syncQueue = []; localStorage.setItem('sakafom_queue', JSON.stringify([])); updateSyncUI();
        }
    }).catch(() => console.log("Attente réseau..."));
}

// --- SCANNER ---
function startScanner() {
    isProcessing = false; document.getElementById('result-overlay').classList.add('hidden');
    if (audioCtx.state === 'suspended') audioCtx.resume(); // Débloque le son au clic de l'utilisateur
    
    if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 20, qrbox: { width: 250, height: 250 } }, onScanSuccess)
    .catch(err => showToast("Erreur Caméra", "error"));
}

function stopScanner() { if (html5QrCode) html5QrCode.stop().catch(err => console.log("Déjà arrêté.")); }

function onScanSuccess(decodedText) {
    if (isProcessing) return;
    isProcessing = true; 
    
    const ticketNumber = decodedText.trim();
    const overlay = document.getElementById('result-overlay');
    const popCard = document.getElementById('pop-card');
    
    popCard.className = "pop-card"; void popCard.offsetWidth; 
    document.getElementById('result-ticket').innerText = ticketNumber;
    overlay.classList.remove('hidden');

    let ticket = localDB.find(t => t.id === ticketNumber);

    if (ticket) {
        if (ticket.status === "") {
            playBeep('success'); // BIP Pro
            popCard.classList.add('success-pop');
            document.getElementById('result-title').innerText = "VALIDE";
            document.getElementById('result-message').innerText = `Enregistré par ${currentUser}`;
            
            ticket.status = "UTILISÉ"; ticket.time = new Date().toLocaleTimeString('fr-FR'); ticket.user = currentUser;
            localStorage.setItem('sakafom_db', JSON.stringify(localDB));
            syncQueue.push({ id: ticket.id, time: ticket.time, user: ticket.user });
            localStorage.setItem('sakafom_queue', JSON.stringify(syncQueue));
        } else {
            playBeep('error'); // BUZZER
            popCard.classList.add('error-pop');
            document.getElementById('result-title').innerText = "DÉJA SCANNÉ";
            document.getElementById('result-message').innerText = `À ${ticket.time} par ${ticket.user}`;
        }
    } else {
        playBeep('error'); // BUZZER
        popCard.classList.add('error-pop');
        document.getElementById('result-title').innerText = "INCONNU";
        document.getElementById('result-message').innerText = "Billet absent du fichier.";
    }

    setTimeout(() => { overlay.classList.add('hidden'); isProcessing = false; pushSyncQueue(); }, 1400);
}

// --- ÉTAT DES LIEUX ---
function loadLocalStats() {
    let total = localDB.length;
    let scannedList = localDB.filter(t => t.status !== "");
    let scanned = scannedList.length;
    let remaining = Math.max(0, total - scanned);

    document.getElementById('stat-scanned').innerText = total === 0 ? "..." : scanned;
    document.getElementById('stat-remaining').innerText = total === 0 ? "..." : remaining;
    document.getElementById('stat-total').innerText = total === 0 ? "..." : total;

    let agentStats = {};
    scannedList.forEach(ticket => {
        let user = ticket.user || "Inconnu";
        if (!agentStats[user]) agentStats[user] = 0;
        agentStats[user]++;
    });

    let detailsHTML = "";
    for (const [agent, count] of Object.entries(agentStats)) {
        detailsHTML += `<div class="agent-stat-row"><span>👤 ${agent}</span> <span class="agent-stat-count">${count}</span></div>`;
    }
    if(detailsHTML === "") detailsHTML = `<div class="agent-stat-row" style="justify-content: center; color: #888;">Aucun scan pour le moment</div>`;
    document.getElementById('details-stats-box').innerHTML = detailsHTML;
}

// Toggle détails
document.getElementById('btn-more-stats').addEventListener('click', () => {
    const box = document.getElementById('details-stats-box');
    box.classList.toggle('hidden');
});

document.getElementById('btn-refresh-stats').addEventListener('click', () => {
    showToast("Téléchargement en cours...", "default");
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'fetch_db' }) })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            localDB = data.db; localStorage.setItem('sakafom_db', JSON.stringify(localDB)); loadLocalStats();
            showToast("Liste synchronisée avec succès !", "success");
        }
    }).catch(() => showToast("Erreur de connexion.", "error"));
});

// --- RESET PROTÉGÉ PAR ZOKY HASINA ---
document.getElementById('btn-reset-stats').addEventListener('click', () => {
    const pin = prompt("Entrez le code PIN pour réinitialiser la base :");
    
    if (pin === "1234") {
        if(confirm("⚠️ RESET GÉNÉRAL : Voulez-vous vider tous les scans du serveur ?")) {
            const btn = document.getElementById('btn-reset-stats');
            btn.disabled = true; btn.innerText = "Attente serveur...";
            
            fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'reset' }) })
            .then(res => res.json())
            .then(data => {
                btn.disabled = false; btn.innerText = "⚠️ Réinitialiser la liste (Reset)";
                if(data.status === 'success') {
                    localDB.forEach(t => { t.status = ""; t.time = ""; t.user = ""; });
                    syncQueue = [];
                    localStorage.setItem('sakafom_db', JSON.stringify(localDB));
                    localStorage.setItem('sakafom_queue', JSON.stringify([]));
                    loadLocalStats();
                    showToast("Base remise à zéro avec succès !", "success");
                }
            }).catch(() => { btn.disabled = false; showToast("Erreur réseau.", "error"); });
        }
    } else if (pin !== null) { // S'il n'a pas cliqué sur Annuler
        showToast("Interdit par Zoky Hasina 🛑", "error");
    }
});
