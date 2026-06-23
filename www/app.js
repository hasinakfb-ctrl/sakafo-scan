const API_URL = "https://script.google.com/macros/s/AKfycbyd1wbja2174XuQoPdvlX0zdsJEM1IqLt1eJCBeyJaDZKz2Mkd-6tbeMt6kfgtz-rAO-A/exec";

// Éléments de l'interface
const screens = {
    splash: document.getElementById('splash-screen'),
    home: document.getElementById('home-screen'),
    scanner: document.getElementById('scanner-screen'),
    stats: document.getElementById('stats-screen')
};

let html5QrcodeScanner = null;
let isProcessing = false;

// --- GESTION DES ÉCRANS ---
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Faux chargement au démarrage (2 secondes)
setTimeout(() => { showScreen('home'); }, 2000);

// --- NAVIGATION ---
document.getElementById('btn-go-scan').addEventListener('click', () => {
    showScreen('scanner');
    startScanner();
});

document.getElementById('btn-go-stats').addEventListener('click', () => {
    showScreen('stats');
    fetchStats();
});

document.getElementById('btn-back-home').addEventListener('click', () => { stopScanner(); showScreen('home'); });
document.getElementById('btn-back-home2').addEventListener('click', () => { showScreen('home'); });
document.getElementById('btn-refresh-stats').addEventListener('click', fetchStats);

// --- SCANNER ---
function startScanner() {
    isProcessing = false;
    document.getElementById('result-overlay').classList.add('hidden');
    
    // On force la caméra arrière (environment)
    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        videoConstraints: { facingMode: "environment" }
    }, false);
    
    html5QrcodeScanner.render(onScanSuccess);
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }
}

function onScanSuccess(qrCodeText) {
    if (isProcessing) return;
    isProcessing = true;
    
    if (navigator.vibrate) navigator.vibrate(50);
    const ticketNumber = qrCodeText.trim();
    
    const overlay = document.getElementById('result-overlay');
    overlay.className = 'loading';
    document.getElementById('result-ticket').innerText = ticketNumber;
    document.getElementById('result-title').innerText = 'VÉRIFICATION...';
    document.getElementById('result-message').innerText = '';

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ qrCode: ticketNumber }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'valid') {
            overlay.className = 'success';
            document.getElementById('result-title').innerText = 'VALIDE';
        } else if (data.status === 'used') {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            overlay.className = 'error';
            document.getElementById('result-title').innerText = 'DÉJÀ SCANNÉ';
        } else {
            overlay.className = 'error';
            document.getElementById('result-title').innerText = 'INCONNU';
        }
    }).catch(err => {
        overlay.className = 'error';
        document.getElementById('result-title').innerText = 'ERREUR RÉSEAU';
    });
}

document.getElementById('btn-next').addEventListener('click', () => {
    isProcessing = false;
    document.getElementById('result-overlay').className = 'hidden';
});

// --- STATISTIQUES ---
function fetchStats() {
    document.getElementById('stat-scanned').innerText = "...";
    document.getElementById('stat-remaining').innerText = "...";

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'stats' }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'success') {
            document.getElementById('stat-scanned').innerText = data.scanned;
            document.getElementById('stat-remaining').innerText = data.remaining;
        }
    });
}
