# Plateforme de cours en ligne

Projet réalisé dans le cadre de la tâche 8 du stage chez Synent Technologies.
Le frontend React communique avec une API Express ; MongoDB Atlas est utilisé
comme base de données.

## Démarrage local

Depuis un terminal PowerShell, préparez la configuration locale du backend :

```powershell
Set-Location .\backend
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```

Dans `.env`, remplacez l'exemple de `MONGODB_URI` par votre URI MongoDB Atlas.
Ne partagez pas ce fichier et ne l'ajoutez pas à Git. Le fichier `.env.example`
ne contient que des valeurs d'exemple.

Dans un second terminal PowerShell :

```powershell
Set-Location .\frontend
npm install
npm run dev
```

Ouvrez l'adresse locale affichée par Vite (par défaut
`http://localhost:5173`). La page interroge `/api/health` via le proxy Vite.
MongoDB est confirmé connecté uniquement quand le statut affiché est
`connected`.

L'API est disponible sur `http://localhost:5000/api/health`.
