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

## E-mails Gmail par SMTP

Nodemailer envoie les e-mails par Gmail SMTP avec STARTTLS obligatoire sur le
port 587. Utilisez le mot de passe d'application Google que vous avez généré,
et non le mot de passe habituel du compte Google. Ajoutez ou adaptez ces valeurs
dans votre fichier local `backend/.env` :

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-adresse@gmail.com
SMTP_PASSWORD=votre-mot-de-passe-application-google
EMAIL_FROM=votre-adresse@gmail.com
```

Remplacez `votre-adresse@gmail.com` par la même adresse dans `SMTP_USER` et
`EMAIL_FROM`. Remplacez la valeur d'exemple de `SMTP_PASSWORD` par le mot de
passe d'application Google, sans espaces si Google l'a présenté en groupes.
Gardez le fichier privé et ne collez jamais ces valeurs dans le chat. Le port
587 utilise STARTTLS avec `SMTP_SECURE=false` ; le transport refuse de continuer
si la négociation TLS n'est pas disponible. Redémarrez le backend après toute
modification de `.env`.

Les tests utilisent un transport Nodemailer factice et n'envoient aucun message
réel. Pour vérifier l'envoi Gmail, démarrez l'application après avoir configuré
ces paramètres et effectuez une inscription avec une adresse à laquelle vous
pouvez accéder.

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

Les nouveaux comptes restent accessibles dans leur espace avant vérification.
Les futures routes d'inscription à un cours devront utiliser le middleware
`requireVerifiedEmail`. Les jetons d'e-mail expirent après 24 heures et les
jetons de réinitialisation après une heure.
