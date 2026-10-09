# Plateforme de cours en ligne

Projet réalisé dans le cadre de la tâche 8 du stage chez Synent Technologies.
Le frontend React communique avec une API Express ; MongoDB Atlas est utilisé
comme base de données.

## Démarrage local

Depuis un terminal PowerShell, préparez la configuration locale du backend
uniquement si le fichier `.env` n'existe pas déjà :

```powershell
Set-Location .\backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm install
npm run dev
```

Dans `.env`, `MONGODB_URI` doit contenir votre URI MongoDB Atlas. Définissez
aussi `JWT_SECRET` avec une valeur aléatoire d'au moins 32 octets. Pour ajouter
une valeur générée localement sans l'afficher dans le terminal, si cette clé
n'est pas déjà définie dans le fichier :

```powershell
$randomBytes = New-Object byte[] 48
$randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($randomBytes)
$jwtSecret = [Convert]::ToBase64String($randomBytes)
Add-Content .env "JWT_SECRET=$jwtSecret"
$randomGenerator.Dispose()
Remove-Variable randomBytes, randomGenerator
Remove-Variable jwtSecret
```

Ne partagez pas `.env` et ne l'ajoutez pas à Git. Le fichier `.env.example` ne
contient que des valeurs fictives à remplacer localement.

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
