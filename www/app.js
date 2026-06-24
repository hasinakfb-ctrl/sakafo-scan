// CONFIGURATION : LIEN DE DEPLOIEMENT GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbzTx82Wz5mw4OuLV-WvEqQ3MZSJc5DsyMBdXTKu1fzdj1LB_UEFFdceR_3FpD8wd2YiLg/exec";

// Sécurisation de la mémoire locale (Évite les crashs WebView/APK)
let localDB = [];
let syncQueue = [];
let currentUser = null;

try {
    localDB = JSON.parse(localStorage.getItem('sakafom_db')) || [];
    syncQueue = JSON.parse(localStorage.getItem('sakafom_queue')) || [];
    currentUser = localStorage.getItem('sakafom_user') || null;
} catch (e) {
    console.error("Mémoire locale restreinte ou indisponible :", e);
}

const screens = {
    splash: document.getElementById('splash-screen'),
    user: document.getElementById('user-screen'),
    home: document.getElementById('home-screen'),
    scanner: document.getElementById('scanner-screen'),
    stats: document.getElementById('stats-screen'),
    about: document.getElementById('about-screen')
};

let html5QrCode = null;
let isProcessing = false;

// --- CYCLE DE DÉMARRAGE SÉCURISÉ ---
function initApp() {
    setTimeout(() => {
        try {
            if (!currentUser) { 
                showScreen('user'); 
            } else { 
                const display = document.getElementById('current-user-display');
                if (display) display.innerText = currentUser; 
                showScreen('home'); 
                updateSyncUI(); 
                fetchDatabase(); 
            }
        } catch (err) {
            console.error("Erreur au démarrage, redirection forcée :", err);
            showScreen('user'); // Débloque le splash screen en cas de coup dur
        }
    }, 1500);
}
initApp();

function showScreen(screenName) {
    Object.values(screens).forEach(s => {
        if(s) s.classList.remove('active');
    });
    if(screens[screenName]) screens[screenName].classList.add('active');
}

// GESTION AGENTS
function setUser(name) {
    currentUser = name;
    try {
        localStorage.setItem('sakafom_user', name);
    } catch(e){}
    const display = document.getElementById('current-user-display');
    if (display) display.innerText = currentUser;
    showScreen('home');
    fetchDatabase();
}

function logout() {
    currentUser = null;
    try { localStorage.removeItem('sakafom_user'); } catch(e){}
    showScreen('user');
}

// NAVIGATIONS
document.getElementById('btn-go-scan').addEventListener('click', () => { showScreen('scanner'); startScanner(); });
document.getElementById('btn-go-stats').addEventListener('click', () => { showScreen('stats'); loadLocalStats(); document.getElementById('details-stats-box').classList.add('hidden'); });
document.getElementById('btn-go-about').addEventListener('click', () => { showScreen('about'); });

document.getElementById('btn-back-home1').addEventListener('click', () => { stopScanner(); showScreen('home'); updateSyncUI(); });
document.getElementById('btn-back-home3').addEventListener('click', () => { showScreen('home'); });
document.getElementById('btn-back-home4').addEventListener('click', () => { showScreen('home'); });

// --- SYNCHRONISATION OFFLINE-FIRST ---
function fetchDatabase() {
    const statusBox = document.getElementById('sync-status');
    if(!statusBox) return;
    statusBox.innerText = "⏳ Actualisation de la liste...";
    statusBox.style.background = "#e1b12c";
    statusBox.style.color = "#111111";

    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'fetch_db' }) })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            localDB = data.db;
            try { localStorage.setItem('sakafom_db', JSON.stringify(localDB)); } catch(e){}
            updateSyncUI();
        }
    })
    .catch(() => { updateSyncUI(); });
}

function updateSyncUI() {
    const statusBox = document.getElementById('sync-status');
    if(!statusBox) return;
    
    if (syncQueue.length > 0) { 
        statusBox.innerText = `⚠️ ${syncQueue.length} scan(s) en attente de réseau...`; 
        statusBox.style.background = "#e67e22"; 
        statusBox.style.color = "#ffffff";
        pushSyncQueue(); 
    } else { 
        statusBox.innerText = `🟢 Base synchronisée (${localDB.length} places). Prêt.`; 
        statusBox.style.background = "#2ecc71"; 
        statusBox.style.color = "#ffffff";
    }
}

function pushSyncQueue() {
    if (syncQueue.length === 0) return;
    
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'sync_batch', batch: syncQueue }) })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            syncQueue = []; 
            try { localStorage.setItem('sakafom_queue', JSON.stringify([])); } catch(e){}
            updateSyncUI();
        }
    })
    .catch(() => console.log("Attente signal Internet..."));
}

// --- SCANNER PUR CORRIGÉ ---
function startScanner() {
    isProcessing = false;
    document.getElementById('result-overlay').classList.add('hidden');
    
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }
    
    const config = { fps: 20, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        alert("Erreur Caméra : Autorisez l'accès à la caméra pour scanner.");
    });
}

function stopScanner() { 
    if (html5QrCode) { 
        html5QrCode.stop().catch(err => console.log("Déjà arrêté ou en attente."));
    } 
}

function onScanSuccess(decodedText, decodedResult) {
    if (isProcessing) return;
    isProcessing = true; 
    
    const ticketNumber = decodedText.trim();
    const overlay = document.getElementById('result-overlay');
    const popCard = document.getElementById('pop-card');
    
    popCard.className = "pop-card";
    void popCard.offsetWidth; 
    
    document.getElementById('result-ticket').innerText = ticketNumber;
    overlay.classList.remove('hidden');

    let ticket = localDB.find(t => t.id === ticketNumber);

    if (ticket) {
        if (ticket.status === "") {
            if (navigator.vibrate) navigator.vibrate(80);
            popCard.classList.add('success-pop');
            document.getElementById('result-title').innerText = "VALIDE";
            document.getElementById('result-message').innerText = `Enregistré par ${currentUser}`;
            
            ticket.status = "UTILISÉ";
            ticket.time = new Date().toLocaleTimeString('fr-FR');
            ticket.user = currentUser;
            try { localStorage.setItem('sakafom_db', JSON.stringify(localDB)); } catch(e){}
            
            syncQueue.push({ id: ticket.id, time: ticket.time, user: ticket.user });
            try { localStorage.setItem('sakafom_queue', JSON.stringify(syncQueue)); } catch(e){}
        } else {
            if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
            popCard.classList.add('error-pop');
            document.getElementById('result-title').innerText = "DÉJA SCANNÉ";
            document.getElementById('result-message').innerText = `À ${ticket.time} par ${ticket.user}`;
        }
    } else {
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
        popCard.classList.add('error-pop');
        document.getElementById('result-title').innerText = "INCONNU";
        document.getElementById('result-message').innerText = "Billet absent du fichier.";
    }

    setTimeout(() => {
        overlay.classList.add('hidden');
        isProcessing = false; 
        pushSyncQueue(); 
    }, 1400);
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

document.getElementById('btn-more-stats').addEventListener('click', () => {
    const box = document.getElementById('details-stats-box');
    box.classList.toggle('hidden');
});

document.getElementById('btn-refresh-stats').addEventListener('click', () => {
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'fetch_db' }) })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            localDB = data.db;
            try { localStorage.setItem('sakafom_db', JSON.stringify(localDB)); } catch(e){}
            loadLocalStats();
            alert("📊 Liste synchronisée avec succès !");
        }
    }).catch(() => alert("Erreur de connexion."));
});

document.getElementById('btn-reset-stats').addEventListener('click', () => {
    if(confirm("⚠️ RESET GÉNÉRAL :\nVoulez-vous vider tous les scans du Google Sheets ?")) {
        const btn = document.getElementById('btn-reset-stats');
        btn.disabled = true; btn.innerText = "Attente serveur...";
        
        fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'reset' }) })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false; btn.innerText = "⚠️ Réinitialiser la liste (Reset)";
            if(data.status === 'success') {
                localDB.forEach(t => { t.status = ""; t.time = ""; t.user = ""; });
                syncQueue = [];
                try {
                    localStorage.setItem('sakafom_db', JSON.stringify(localDB));
                    localStorage.setItem('sakafom_queue', JSON.stringify([]));
                } catch(e){}
                loadLocalStats();
                alert("✅ Remis à zéro !");
            }
        }).catch(() => { btn.disabled = false; alert("Erreur réseau."); });
    }
});
