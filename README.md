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

## Catalogue et cours de démonstration

Le catalogue public est accessible à `/cours`. Il permet de rechercher les
cours publiés par titre ou description, de filtrer par catégorie et niveau, et
de consulter le programme depuis une page de détails. Les leçons publiques
n'affichent ni les URL vidéo ni leur contenu réservé.

Après avoir renseigné `MONGODB_URI` dans votre configuration locale, ajoutez
explicitement les cours de démonstration depuis PowerShell :

```powershell
Set-Location .\backend
npm run seed:courses
```

Ce script ne s'exécute pas au démarrage de l'application. Il ajoute quatre
cours INR si leurs slugs de démonstration n'existent pas ; le relancer ne crée
pas de doublons et ne modifie ni ne supprime les cours déjà présents.
L'image utilisée par ces cours est le placeholder local
[`frontend/public/courses/course-placeholder.svg`](frontend/public/courses/course-placeholder.svg).
Remplacez ce fichier par votre visuel en conservant ce chemin, ou modifiez le
champ `image` d'un cours pour référencer un autre fichier placé dans
`frontend/public/`.
Pour tester l'interface, démarrez le backend et le frontend comme ci-dessous,
ouvrez `http://localhost:5173/cours`, puis essayez la recherche, les filtres de
catégorie et de niveau, la pagination et l'ouverture d'une fiche de cours. Les
cours non publiés ne sont pas visibles dans ce catalogue public.

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
Les jetons d'e-mail expirent après 24 heures et les jetons de réinitialisation
après une heure.

## Administration des cours

Pour promouvoir un compte existant, créez d'abord ce compte depuis l'inscription
et configurez sa boîte e-mail si vous devez vérifier son adresse. Depuis
PowerShell, exécutez ensuite explicitement :

```powershell
Set-Location .\backend
npm run admin:promote -- adresse-du-compte@example.com
```

Le script ne crée pas de compte et ne définit aucun mot de passe. Il attribue le
rôle administrateur au compte correspondant dans MongoDB et invalide son ancien
jeton de session ; déconnectez-vous puis reconnectez-vous pour charger le
nouveau rôle. La création/modification des cours et leurs mutations sont
réservées au rôle administrateur, avec vérification JWT, rôle et CSRF côté API.
Les modules et leçons ont des identifiants stables pour rester référencés lors
de leur édition ou réorganisation. Les suppressions de cours demandent une
confirmation dans l'interface.

Une fois promu et reconnecté, ouvrez « Administration » dans la navigation.
Vous pourrez créer un cours en brouillon, modifier ses champs, ajouter,
supprimer et réordonner ses modules et leçons, saisir leurs URL vidéo, puis
enregistrer ou publier le cours. Le prix doit être un entier en paise
(par exemple `49900` pour ₹499,00), et les URL vidéo doivent commencer par
`http://` ou `https://`. La publication rend le cours visible dans le catalogue
public ; les brouillons et contenus vidéo/privés restent masqués des routes
publiques.

## Paiement test et inscriptions aux cours

**État de validation : le paiement réel avec Razorpay Checkout en mode Test
n'est pas validé.** L'inscription Razorpay bloque actuellement l'accès aux clés
de test. Jusqu'à ce que cet accès soit débloqué, seuls les tests automatisés
avec un service Razorpay factice ont été réalisés. Ces tests ne contactent pas
Razorpay, n'ouvrent pas Checkout et ne constituent pas la validation d'un
paiement réel, même en mode Test. N'annoncez donc pas ce flux comme vérifié de
bout en bout.

Quand l'accès aux clés sera disponible, le backend pourra utiliser les clés
Razorpay de test. Pour les obtenir :

1. Créez ou ouvrez votre compte sur le tableau de bord Razorpay développeur.
2. Activez le mode **Test** (pas le mode Live).
3. Dans **Account & Settings → API Keys**, générez ou affichez les clés de test.
4. Ajoutez les deux valeurs directement dans votre fichier local
   `backend/.env` :

```text
RAZORPAY_KEY_ID=rzp_test_votreKeyId
RAZORPAY_KEY_SECRET=votreSecretDeTest
```

Ne collez pas ces valeurs dans le chat et ne les ajoutez jamais à Git. Seule la
Key ID publique est transmise au navigateur au moment d'ouvrir Checkout ; la
Key Secret reste exclusivement dans le backend. L'application refuse les
identifiants Live et n'accorde jamais d'accès si les clés ne sont pas
configurées. Dans ce cas, l'API renvoie une erreur explicite indiquant de
configurer `RAZORPAY_KEY_ID` et `RAZORPAY_KEY_SECRET` ; elle ne simule pas de
paiement réussi. Redémarrez le backend après l'ajout des variables.

Un utilisateur doit être connecté et avoir vérifié son adresse e-mail pour
commander. Le backend calcule le montant en paise depuis le cours publié en
base, vérifie la signature puis relit le paiement auprès de Razorpay ; seule la
confirmation d'un paiement capturé crée l'inscription. Les confirmations sont
idempotentes, et les écritures de paiement/inscription sont transactionnelles
pour pouvoir retenter une confirmation si la base rencontre une erreur après
la capture. Les cours avec des inscriptions ne peuvent pas être supprimés :
l'administration permet de les archiver.

Un essai réel restera à effectuer après obtention des clés : configurer les
clés de test, ouvrir un cours publié avec un compte dont l'adresse est vérifiée,
puis suivre « S'inscrire maintenant » dans Razorpay Checkout en mode Test.
Il faudra vérifier également l'annulation et confirmer que « Mes cours »
n'affiche l'inscription qu'après validation du paiement capturé par le backend.

Les tests automatisés utilisent un client Razorpay factice : ils vérifient la
signature, les montants, la devise, l'utilisateur, l'état capturé, les
confirmations répétées et l'accès aux inscriptions, sans contacter Razorpay ni
effectuer de débit. Ils constituent les seuls tests Razorpay réalisés à ce
stade et ne remplacent pas l'essai Checkout réel qui reste bloqué par l'accès
aux clés de test. Cette étape n'ajoute pas encore de lecteur vidéo ni de suivi
de progression.
