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

`DNS_SERVERS` est facultative. Si elle est absente ou vide, Node.js conserve
la configuration DNS du système. Si le résolveur système échoue pour les
enregistrements SRV de MongoDB Atlas alors que `nslookup` réussit, vous pouvez
définir une liste d'adresses IP de serveurs DNS séparées par des virgules,
par exemple `DNS_SERVERS=8.8.8.8,8.8.4.4`. Node.js applique cette liste au
démarrage, avant toute connexion MongoDB. Ce réglage s'applique au serveur,
aux scripts backend qui se connectent à la base et aux tests d'intégration.
Utilisez les serveurs DNS autorisés sur votre réseau ; un DNS public peut être
bloqué par le réseau ou la politique de votre organisation.

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
aux clés de test.

## Apprentissage et progression

Depuis « Mes cours », ouvrez un cours pour lire ses modules et leçons dans leur
ordre actuel. La progression est enregistrée par compte et cours, reste
disponible après actualisation/reconnexion, et son pourcentage est recalculé
par le serveur à partir des leçons présentes. Réordonner les modules ou les
leçons ne perd pas les états terminés, car les identifiants des leçons restent
stables. Les leçons supprimées ne sont plus comptées ; un cours sans leçon
affiche une progression de 0 %.

### Inscription locale de développement (sans Razorpay)

Pour tester le lecteur et la progression avec un compte existant dont l'adresse
est vérifiée, et un cours existant publié, depuis PowerShell :

```powershell
Set-Location .\backend
$env:NODE_ENV = 'development'
npm run enrollment:test -- add adresse-du-compte@example.com ID_DU_COURS
```

Cette commande est strictement refusée hors de `NODE_ENV=development` et n'est
pas exposée par une route HTTP ni lancée au démarrage. Elle crée une inscription
marquée `development-test` ; elle **n'est pas payée** et aucun document
`Payment` n'est créé. La commande est idempotente. Pour retirer uniquement
cette inscription de test :

```powershell
npm run enrollment:test -- remove adresse-du-compte@example.com ID_DU_COURS
```

Elle ne supprime jamais les inscriptions de source `payment`. Arrêtez et
redémarrez le backend avec l'environnement local habituel après ce test si vous
avez défini `NODE_ENV` dans ce terminal, ou exécutez cette commande dans un
terminal PowerShell distinct de celui qui lance le serveur.

Quand une leçon n'a pas d'URL vidéo, le lecteur utilise à titre de démonstration
la vidéo [flower.mp4 des exemples MDN](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4),
publiée sous licence CC0 (domaine public) ; la documentation de l'élément vidéo
est sur [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video).
Cette vidéo de démonstration n'est pas enregistrée dans le cours.

**Limite de protection vidéo :** les routes d'apprentissage vérifient la session
et l'inscription avant de révéler le contenu et l'URL vidéo. Toutefois, si une
URL HTTP/HTTPS pointe vers un fichier directement accessible publiquement,
toute personne qui obtient cette URL peut potentiellement la partager ou
l'ouvrir hors de la plateforme. L'authentification de l'application ne protège
pas le fichier hébergé publiquement et le lecteur HTML5 n'empêche pas sa copie.
Pour une véritable protection, hébergez les vidéos dans un stockage privé et
servez-les avec des URL signées à durée courte ou un fournisseur vidéo avec
contrôle d'accès. Cette étape ne met pas en place de DRM.

Cette étape ajoute la lecture des leçons et la progression, mais pas de
paiement supplémentaire, d'inscription commerciale, ni de lecteur DRM.

## Administration des utilisateurs et inscriptions

Après connexion avec un compte administrateur, ouvrez « Administration » puis
les sections « Utilisateurs » et « Inscriptions ». Ces pages sont en lecture
seule : elles permettent de rechercher et filtrer les résultats, puis de les
parcourir par pages. L’API exige une session valide et le rôle `admin`. La liste
des utilisateurs n’expose ni hash de mot de passe, ni jeton. La liste des
inscriptions affiche l’origine et la progression actuelle ; une inscription
`payment` montre le montant, la devise et le statut associé. Une inscription
`development-test` est explicitement libellée « Test local · non payé » et ne
présente aucun paiement.

La création d’un compte continue d’envoyer uniquement l’e-mail de vérification
d’adresse prévu à cet effet. Une tentative d’inscription avec une adresse déjà
utilisée est refusée et ne déclenche pas de nouvel e-mail. Aucun message de
bienvenue redondant n’est ajouté.

### Notifications d’inscription

Après qu’une confirmation serveur a vérifié un paiement Razorpay capturé et
créé l’inscription, une notification de confirmation est enregistrée dans
MongoDB et l’envoi SMTP est tenté. La notification et l’inscription payée sont
créées dans la même transaction ; la livraison SMTP se fait ensuite. Ainsi,
une panne SMTP ne peut pas annuler le paiement confirmé ni l’accès au cours.
Les confirmations répétées réutilisent l’inscription existante et ne créent
pas de nouvelle notification.

Les notifications ont un état (`pending`, `sending`, `sent` ou `failed`) et un
compteur de tentatives. Les erreurs de livraison ne stockent qu’un code
technique filtré, jamais le contenu SMTP, les identifiants ou un secret. Pour
relancer manuellement les notifications échouées, depuis PowerShell :

```powershell
Set-Location .\backend
npm run email:retry
```

La relance récupère aussi les envois restés en état `sending` après une
interruption de processus. Une livraison e-mail via SMTP ne peut pas garantir
une sémantique « exactement une fois » : si le serveur de messagerie accepte le
message mais que la connexion tombe avant l’accusé de réception, une relance
peut produire un doublon. La clé d’idempotence empêche les confirmations de
paiement répétées de créer plusieurs notifications en base, mais ne peut pas
annuler ce cas ambigu côté fournisseur SMTP.

Pour tester manuellement l’envoi, utilisez la section « Tester une notification
e-mail » des pages d’administration en lançant le backend avec
`NODE_ENV=development`. Le point d’accès exige aussi un administrateur et une
protection CSRF ; il refuse toute exécution dans un autre environnement. Le
message porte `[TEST]` dans son objet et précise qu’aucun paiement ni aucune
inscription n’a été créé. Cette fonction n’est pas une notification d’achat.
Les tests automatisés utilisent un transport factice ; ils vérifient notamment
qu’un échec SMTP laisse l’inscription active et que la notification peut être
relancée. Ils ne valident pas la livraison réelle par Gmail.

Le parcours réel Razorpay Checkout en mode Test reste **non validé** : seuls les
tests automatisés avec un service Razorpay factice ont été réalisés, faute
d’accès aux clés de test. L’envoi SMTP réel et l’achat Checkout réel doivent
être vérifiés séparément lorsque les configurations correspondantes seront
disponibles.
