# R(ali) Photo

Application web progressive (PWA) pour organiser des rallyes photo / chasses au tresor a travers la France. Parcourez des etapes, prenez des photos, relevez des defis bonus, repondez aux quiz et debloquez des achievements.

## Fonctionnalites

- **Rallyes photo** : parcourez des checkpoints geolocalises, validez chaque etape en prenant une photo
- **Defis bonus** : challenge photo supplementaire par etape pour gagner des points bonus
- **Quiz** : QCM optionnel apres validation photo (facile 5 pts, moyen 10 pts, difficile 15 pts)
- **Carte interactive** : visualisation des etapes sur une carte Leaflet avec geolocalisation
- **Mode equipe** : classement entre equipes participantes
- **Achievements** : systeme de trophees (premier pas, completiste, chasseur de bonus, erudit quiz...)
- **Editeur de rallyes** : creez vos propres rallyes custom avec l'editeur integre
- **Partage** : partagez vos rallyes custom par lien ou QR code
- **Mode hors-ligne** : fonctionne sans connexion grace au Service Worker
- **Export/Import** : sauvegardez et restaurez vos donnees de progression
- **Dark mode** : theme sombre disponible

## Rallyes inclus

- **Normandie** : 24 etapes de Giverny a la Cote d'Albatre (chateaux, abbayes, falaises, villages)
- **Lyon** : 21 etapes du Vieux-Lyon a la Confluence (traboules, Fourviere, Presqu'ile, street art)

## Installation

Aucun build necessaire. Servez les fichiers avec n'importe quel serveur HTTP :

```bash
# Avec Python
python3 -m http.server 8000

# Avec Node.js
npx serve .
```

Ouvrez `http://localhost:8000` dans un navigateur. L'application peut etre installee comme PWA sur mobile.

## Structure du projet

```
rally/
  index.html              # Page unique (SPA)
  manifest.json           # Manifest PWA
  sw.js                   # Service Worker (cache hors-ligne)
  css/style.css           # Styles + dark mode + themes par rally
  js/
    rallies.js            # Registre global des rallyes, CHECKPOINTS, scores
    app.js                # Logique UI, navigation, sons, dialogs
    game.js               # Etat de jeu, validation, scores, achievements
    map.js                # Carte Leaflet, markers, geolocalisation
    photos.js             # Compression et traitement des photos
    photostore.js         # Stockage IndexedDB des photos
    editor.js             # Editeur de rallyes custom (wizard 4 etapes)
    custom-loader.js      # Chargement des rallyes custom depuis localStorage
    compress-worker.js    # Web Worker pour compression photo
    lzstring.min.js       # Compression pour partage par URL
    qrcode.min.js         # Generation de QR codes
  rallies/
    normandie.js          # Donnees du rally Normandie
    lyon.js               # Donnees du rally Lyon
  icons/
    icon-192x192.png      # Icone PWA
    icon-512x512.png      # Icone PWA
```

## Creer un nouveau rally

### Via l'editeur integre

Ouvrez l'application, allez dans l'ecran de selection et cliquez sur "Creer un rally". L'editeur vous guide en 4 etapes : metadonnees, checkpoints, carte, apercu.

### En tant que fichier built-in

1. Creez `rallies/mon-rally.js` en suivant le format de `rallies/normandie.js`
2. Ajoutez `<script src="rallies/mon-rally.js"></script>` dans `index.html` (apres `rallies.js`, avant `custom-loader.js`)
3. Ajoutez le fichier dans le tableau `ASSETS` de `sw.js`
4. Incrementez `CACHE_VERSION` dans `sw.js`

### Format d'un checkpoint

```javascript
{
  id: 1,
  name: "Nom du lieu",
  description: "Description du lieu...",
  photoHint: "Indication pour la photo a prendre.",
  bonusChallenge: "Defi bonus (+10 pts bonus)",
  bonusPoints: 10,
  lat: 48.8566,
  lng: 2.3522,
  points: 15,
  info: { horaires: "9h-18h", tarifs: "Gratuit" },
  hints: [
    { text: "Premier indice", penalty: 5 },
  ],
  quiz: {  // optionnel
    question: "Question du quiz ?",
    choices: ["Choix A", "Choix B", "Choix C", "Choix D"],
    answer: 1,       // index de la bonne reponse
    difficulty: 2,   // 1=facile(5pts), 2=moyen(10pts), 3=difficile(15pts)
  },
}
```

## Technologies

- Vanilla JavaScript (ES6+), sans framework ni build
- [Leaflet.js](https://leafletjs.com/) pour les cartes
- IndexedDB pour le stockage des photos
- localStorage pour l'etat de jeu
- Service Worker pour le mode hors-ligne
- Web Workers pour la compression photo

## Licence

Projet prive.
