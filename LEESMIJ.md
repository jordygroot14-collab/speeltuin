# Jordy's AI speeltuin — GitHub Pages pakket

## Uploaden (eenmalig)

1. Open je repository op github.com
2. Klik **Add file → Upload files**
3. Sleep de **inhoud** van deze map erin (dus `index.html`, `sw.js`, `manifest.webmanifest` en de mappen `icons/`, `filmrol/`, `kookplanner/`, `luistervink/`) — niet de map zelf
4. Klik **Commit changes** en wacht ±1 minuut
5. Open `https://<gebruikersnaam>.github.io/<reponaam>/` op je telefoon

## Op je beginscherm

- **iPhone (Safari):** deelknop → *Zet op beginscherm*
- **Android (Chrome):** menu (⋮) → *App installeren* of *Toevoegen aan startscherm*

Dit kan met de hub, maar óók met elke app afzonderlijk — elk krijgt zijn eigen icoon en opent fullscreen als eigen app.

## Data meenemen uit de Claude-versies

De apps op deze site slaan data op in de browser van je apparaat. Je bestaande
data staat nog in de Claude-artifacts. Verhuizen gaat zo, per app:

1. Open de **oude versie** (claude.ai-link) → gebruik de **export/backup-knop** → JSON-bestand wordt gedownload
2. Open de **nieuwe versie** (github.io) → gebruik de **import-knop** → kies het JSON-bestand

## Goed om te weten

- Data staat per apparaat/browser. Telefoon en laptop delen dus niet automatisch — gebruik export/import om te synchroniseren, of houd één apparaat als "de echte".
- De AI-functies (receptimport in Kookplanner, podcast-zoeken in Luistervink) werken **niet** op deze gehoste versie — die konden alleen binnen claude.ai draaien. De rest van de apps werkt volledig.
- Nieuwe versie van een app? Vervang alleen de bestanden in de betreffende map en commit. De site pakt de nieuwste versie automatisch op.
