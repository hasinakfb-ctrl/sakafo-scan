// REMPLACEZ BIEN PAR VOTRE LIEN DE DEPLOIEMENT GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbz_z79F3y57Ek0dOchmdcgYx_9isX3MWMVxw1JoLJ8_wuP_4ZswJ33yMU5EcAz3aUvi8w/exec";

const screens = {
    splash: document.getElementById('splash-screen'),
    home: document.getElementById('home-screen'),
    scanner: document.getElementById('scanner-screen'),
    manual: document.getElementById('manual-screen'),
    stats: document.getElementById('stats-screen'),
    about: document.getElementById('about-screen')
};

let html5QrcodeScanner = null;
let isProcessing = false;

// Navigation Inter-écrans
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    document.getElementById('manual-result').classList.add('hidden');
    document.getElementById('manual-ticket-input').value = "";
}

// Faux chargement de démarrage (2 secondes)
setTimeout(() => { showScreen('home'); }, 2000);

// Événements boutons de Navigation
document.getElementById('btn-go-scan').addEventListener('click', () => { showScreen('scanner'); startScanner(); });
document.getElementById('btn-go-manual').addEventListener('click', () => { showScreen('manual'); });
document.getElementById('btn-go-stats').addEventListener('click', () => { showScreen('stats'); fetchStats(); });
document.getElementById('btn-go-about').addEventListener('click', () => { showScreen('about'); });

document.getElementById('btn-back-home1').addEventListener('click', () => { stopScanner(); showScreen('home'); });
document.getElementById('btn-back-home2').addEventListener('click', () => { showScreen('home'); });
document.getElementById('btn-back-home3').addEventListener('click', () => { showScreen('home'); });
document.getElementById('btn-back-home4').addEventListener('click', () => { showScreen('home'); });

document.getElementById('btn-refresh-stats').addEventListener('click', fetchStats);

// --- PARTIE 1 : SCANNER QR CODE ---
function startScanner() {
    isProcessing = false;
    document.getElementById('result-overlay').classList.add('hidden');
    
    html5QrcodeScanner = new Html5QrcodeScanner("qr-reader", { 
        fps: 12, 
        qrbox: { width: 250, height: 250 },
        videoConstraints: { facingMode: "environment" } // Caméra arrière d'office
    }, false);
    
    html5QrcodeScanner.render(onScanSuccess);
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.log(err));
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
    document.getElementById('result-message').innerText = 'Attente réponse Google...';

    // Anti-figeage : On force l'annulation si pas de réponse au bout de 6 secondes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ qrCode: ticketNumber }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        signal: controller.signal
    })
    .then(res => res.json())
    .then(data => {
        clearTimeout(timeoutId);
        if (data.status === 'valid') {
            overlay.className = 'success';
            document.getElementById('result-title').innerText = 'VALIDE';
            document.getElementById('result-message').innerText = 'Entrée enregistrée.';
        } else if (data.status === 'used') {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            overlay.className = 'error';
            document.getElementById('result-title').innerText = 'DÉJÀ SCANNÉ';
            document.getElementById('result-message').innerText = 'Scanné à : ' + (data.time || 'Heure inconnue');
        } else {
            overlay.className = 'error';
            document.getElementById('result-title').innerText = 'INCONNU';
            document.getElementById('result-message').innerText = 'Billet non répertorié dans la liste.';
        }
    })
    .catch(err => {
        clearTimeout(timeoutId);
        overlay.className = 'error';
        document.getElementById('result-title').innerText = 'ERREUR RÉSEAU';
        document.getElementById('result-message').innerText = 'La requête a expiré ou le réseau a coupé. Réessayez.';
    });
}

document.getElementById('btn-next').addEventListener('click', () => {
    isProcessing = false;
    document.getElementById('result-overlay').className = 'hidden';
});


// --- PARTIE 2 : VALIDATION MANUELLE ---
document.getElementById('btn-submit-manual').addEventListener('click', () => {
    const inputField = document.getElementById('manual-ticket-input');
    const value = inputField.value.trim();
    const resultBox = document.getElementById('manual-result');
    
    if(!value) return;
    
    resultBox.className = "manual-result-box";
    resultBox.style.background = "#f39c12";
    resultBox.style.color = "#white";
    resultBox.innerText = "Validation en cours...";
    resultBox.classList.remove('hidden');

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'manual_validate', qrCode: value }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    })
    .then(res => res.json())
    .then(data => {
        if(data.status === 'valid') {
            resultBox.style.background = "#2ecc71";
            resultBox.innerText = "SUCCÈS : Le billet " + value + " est maintenant validé !";
            inputField.value = "";
        } else {
            resultBox.style.background = "#e74c3c";
            resultBox.innerText = "ERREUR : Numéro " + value + " introuvable.";
        }
    })
    .catch(() => {
        resultBox.style.background = "#e74c3c";
        resultBox.innerText = "Erreur de connexion réseau.";
    });
});


// --- PARTIE 3 : ÉTAT DES LIEUX & CORRECTION LECTURE + RESET ---
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
            document.getElementById('stat-total').innerText = data.total;
        } else {
            alert("Erreur de format de données reçues.");
        }
    })
    .catch(err => {
        document.getElementById('stat-scanned').innerText = "Erreur";
        document.getElementById('stat-remaining').innerText = "Erreur";
        alert("Impossible de lire les statistiques depuis Google Sheet. Vérifiez la connexion internet.");
    });
}

// Option de Reset (Vider la liste)
document.getElementById('btn-reset-stats').addEventListener('click', () => {
    if(confirm("⚠️ ATTENTION :\nVoulez-vous vraiment effacer tous les scans du fichier Google Sheet ? Cette action videra les colonnes Statut et Heure pour recommencer à zéro.")) {
        const btn = document.getElementById('btn-reset-stats');
        btn.disabled = true;
        btn.innerText = "Réinitialisation en cours...";
        
        fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'reset' }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            btn.innerText = "⚠️ Réinitialiser la liste (Reset)";
            if(data.status === 'success') {
                alert("✅ Le fichier Google Sheets a été vidé avec succès !");
                fetchStats();
            } else {
                alert("Erreur lors de la réinitialisation.");
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.innerText = "⚠️ Réinitialiser la liste (Reset)";
            alert("Erreur réseau lors de la demande de reset.");
        });
    }
});
