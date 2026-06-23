/* app.js */

const API_URL = "https://script.google.com/macros/s/AKfycbwyJVA9V5jFhn9l8A8JJjf6QXac_8V5PWUTcNI2QL1nlmcevkz--kWD8oxbZ_85K-ysxQ/exec"; 

let isProcessing = false;

// Récupération des éléments du nouvel écran plein format
const resultOverlay = document.getElementById('result-overlay');
const resultTitle = document.getElementById('result-title');
const resultTicket = document.getElementById('result-ticket');
const resultMessage = document.getElementById('result-message');

// Bips et Vibrations natifs
function playNotification(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        if (type === 'success') {
            osc.type = 'sine'; osc.frequency.value = 880;
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start(); osc.stop(ctx.currentTime + 0.2);
        } else if (type === 'error') {
            osc.type = 'sawtooth'; osc.frequency.value = 150;
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            osc.start();
            setTimeout(() => osc.frequency.value = 120, 150);
            osc.stop(ctx.currentTime + 0.4);
            if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        }
    } catch (e) { console.log("Audio non supporté", e); }
}

// Fonction pour afficher l'écran Vert (success) ou Rouge (error)
function showResult(status, ticketNumber, title, message) {
    resultOverlay.className = status; // Applique la couleur de fond
    resultTicket.innerText = ticketNumber; // Affiche le GROS NUMERO
    resultTitle.innerText = title;
    resultMessage.innerText = message;
    
    playNotification(status);
}

// Fonction liée au bouton pour fermer l'alerte
function closeOverlay() {
    resultOverlay.className = 'hidden';
    // Attend 1 seconde pour éviter de re-scanner par erreur le même billet instantanément
    setTimeout(() => { isProcessing = false; }, 1000);
}

// Quand la caméra détecte un QR Code
function checkTicket(qrCodeText) {
    if (isProcessing) return;
    isProcessing = true;
    
    // Le texte contenu dans le QR code (ex: "N° 001") devient le numéro affiché
    const ticketNumber = qrCodeText.trim();

    // Code réel pour Google Sheets
    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ qrCode: ticketNumber }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'valid') {
            showResult('success', ticketNumber, 'VALIDE', 'Enregistré avec succès.');
        } else if (data.status === 'used') {
            showResult('error', ticketNumber, 'FRAUDE !', 'Billet DÉJÀ SCANNÉ !');
        } else {
            showResult('error', ticketNumber, 'INCONNU', 'Code non répertorié.');
        }
    })
    .catch(err => {
        showResult('error', ticketNumber, 'ERREUR RÉSEAU', 'Impossible de vérifier.');
    });
}

// Initialisation de la caméra
window.addEventListener('DOMContentLoaded', () => {
    const scanner = new Html5QrcodeScanner(
        "qr-reader", 
        { fps: 15, qrbox: { width: 250, height: 250 } }, 
        false
    );
    scanner.render((decodedText) => checkTicket(decodedText));
});