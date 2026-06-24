// CONFIGURATION : LIEN DE DEPLOIEMENT GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbzTx82Wz5mw4OuLV-WvEqQ3MZSJc5DsyMBdXTKu1fzdj1LB_UEFFdceR_3FpD8wd2YiLg/exec";

let localDB = JSON.parse(localStorage.getItem('sakafom_db')) || [];
let syncQueue = JSON.parse(localStorage.getItem('sakafom_queue')) || [];
let currentUser = localStorage.getItem('sakafom_user') || null;

const screens = {
    splash: document.getElementById('splash-screen'),
    user: document.getElementById('user-screen'),
    home: document.getElementById('home-screen'),
    scanner: document.getElementById('scanner-screen'),
    stats: document.getElementById('stats-screen'),
    about: document.getElementById('about-screen')
};

let html5QrCode = null; // Changement de variable pour l'API pure
let isProcessing = false;

// --- CYCLE DE DÉMARRAGE ---
function initApp() {
    setTimeout(() => {
        if (!currentUser) { 
            showScreen('user'); 
        } else { 
            document.getElementById('current-user-display').innerText = currentUser; 
            showScreen('home'); 
            updateSyncUI(); 
            fetchDatabase(); 
        }
    }, 1500);
}
initApp();

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// GESTION AGENTS
function setUser(name) {
    currentUser = name;
    localStorage.setItem('sakafom_user', name);
    document.getElementById('current-user-display').innerText = currentUser;
    showScreen('home');
    fetchDatabase();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('sakafom_user');
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
    statusBox.innerText = "⏳ Actualisation de la liste...";
    statusBox.style.background = "#e1b12c";
    statusBox.style.color = "#111111";

    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'fetch_db' }) })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            localDB = data.db;
            localStorage.setItem('sakafom_db', JSON.stringify(localDB));
            updateSyncUI();
        }
    })
    .catch(() => { updateSyncUI(); });
}

function updateSyncUI() {
    const statusBox = document.getElementById('sync-status');
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
            localStorage.setItem('sakafom_queue', JSON.stringify([]));
            updateSyncUI();
        }
    })
    .catch(() => console.log("Attente signal Internet..."));
}

// --- SCANNER PUR (CAMÉRA ARRIÈRE FORCÉE SANS INTERFACE MOCHE) ---
function startScanner() {
    isProcessing = false;
    document.getElementById('result-overlay').classList.add('hidden');
    
    // On utilise l'objet brut Html5Qrcode (pas "Scanner") pour tout contrôler
    html5QrCode = new Html5Qrcode("qr-reader");
    
    const config = { fps: 20, qrbox: { width: 250, height: 250 } };
    
    // facingMode: "environment" force l'appareil photo arrière
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        alert("Erreur Caméra : Autorisez l'accès à la caméra pour scanner.");
    });
}

function stopScanner() { 
    if (html5QrCode) { 
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        }).catch(err => console.log("Erreur d'arrêt scanner"));
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
            // VALIDE
            if (navigator.vibrate) navigator.vibrate(80);
            popCard.classList.add('success-pop');
            document.getElementById('result-title').innerText = "VALIDE";
            document.getElementById('result-message').innerText = `Enregistré par ${currentUser}`;
            
            ticket.status = "UTILISÉ";
            ticket.time = new Date().toLocaleTimeString('fr-FR');
            ticket.user = currentUser;
            localStorage.setItem('sakafom_db', JSON.stringify(localDB));
            
            syncQueue.push({ id: ticket.id, time: ticket.time, user: ticket.user });
            localStorage.setItem('sakafom_queue', JSON.stringify(syncQueue));
        } else {
            // DÉJÀ UTILISÉ
            if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
            popCard.classList.add('error-pop');
            document.getElementById('result-title').innerText = "DÉJA SCANNÉ";
            document.getElementById('result-message').innerText = `À ${ticket.time} par ${ticket.user}`;
        }
    } else {
        // INCONNU
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

// --- ÉTAT DES LIEUX & DÉTAILS AGENTS ---
function loadLocalStats() {
    let total = localDB.length;
    let scannedList = localDB.filter(t => t.status !== "");
    let scanned = scannedList.length;
    let remaining = Math.max(0, total - scanned);

    document.getElementById('stat-scanned').innerText = total === 0 ? "..." : scanned;
    document.getElementById('stat-remaining').innerText = total === 0 ? "..." : remaining;
    document.getElementById('stat-total').innerText = total === 0 ? "..." : total;

    // Calcul des statistiques détaillées par agent
    let agentStats = {};
    scannedList.forEach(ticket => {
        let user = ticket.user || "Inconnu";
        if (!agentStats[user]) agentStats[user] = 0;
        agentStats[user]++;
    });

    // Génération du HTML pour les détails
    let detailsHTML = "";
    for (const [agent, count] of Object.entries(agentStats)) {
        detailsHTML += `<div class="agent-stat-row"><span>👤 ${agent}</span> <span class="agent-stat-count">${count}</span></div>`;
    }
    
    if(detailsHTML === "") detailsHTML = `<div class="agent-stat-row" style="justify-content: center; color: #888;">Aucun scan pour le moment</div>`;
    
    document.getElementById('details-stats-box').innerHTML = detailsHTML;
}

// Bouton Afficher/Masquer les détails
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
            localStorage.setItem('sakafom_db', JSON.stringify(localDB));
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
                localStorage.setItem('sakafom_db', JSON.stringify(localDB));
                localStorage.setItem('sakafom_queue', JSON.stringify([]));
                loadLocalStats();
                alert("✅ Remis à zéro !");
            }
        }).catch(() => { btn.disabled = false; alert("Erreur réseau."); });
    }
});
        }).catch(() => { btn.disabled = false; alert("Erreur réseau."); });
    }
});
