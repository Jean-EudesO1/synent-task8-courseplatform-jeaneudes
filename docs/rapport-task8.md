# Rapport de projet — Tâche 8
## Plateforme de cours en ligne Full Stack

**Auteur :** Jean-Eudes Aka  
**Programme :** Stage de développement web — Synent Technologies  
**Date :** 14 octobre 2026  
**Dépôt prévu :** https://github.com/Jean-EudesO1/synent-task8-courseplatform-jeaneudes

## 1. Présentation et objectif

Ce projet consiste à développer une plateforme de cours en ligne où les utilisateurs peuvent créer un compte, découvrir des formations, accéder aux cours auxquels ils sont inscrits et suivre leur progression. Les administrateurs disposent d’un espace pour gérer les cours et consulter les utilisateurs et les inscriptions.

L’application repose sur une interface React, une API Express et une base MongoDB hébergée sur Atlas. Le projet intègre également l’authentification JWT, l’envoi d’e-mails et un parcours de paiement Razorpay prévu exclusivement en mode Test.

**État du projet :** les principales fonctions sont implémentées. Le paiement Razorpay a été testé avec un service factice, mais le parcours Checkout avec de véritables clés de test reste non validé, car l’inscription au service n’a pas permis d’obtenir ces clés. Le projet ne doit donc pas être présenté comme intégralement validé de bout en bout.

## 2. Exigences et périmètre

| Domaine | Fonctionnalités développées |
|---|---|
| Authentification | Inscription, connexion, déconnexion, JWT et rôles étudiant/administrateur |
| Gestion du compte | Vérification par e-mail et réinitialisation du mot de passe |
| Catalogue | Recherche, filtres, pagination et détails des cours |
| Inscriptions | Modèles de paiement et d’inscription, validation serveur et liste Mes cours |
| Apprentissage | Modules, leçons, lecture vidéo et suivi manuel de complétion |
| Administration | Gestion des cours, modules et leçons ; consultation des utilisateurs et inscriptions |
| Notifications | Vérification d’adresse, réinitialisation et confirmation de cours mise en file |
| Interface | Navigation cohérente, adaptation mobile et états de chargement et d’erreur |

Le suivi mesure les leçons explicitement marquées comme terminées par l’apprenant. Il ne mesure pas automatiquement le temps de visionnage et n’utilise pas de DRM.

## 3. Technologies et outils

| Technologie ou outil | Rôle |
|---|---|
| React et Vite | Interface utilisateur et environnement frontend |
| Node.js et Express | Serveur et API HTTP |
| MongoDB Atlas et Mongoose | Stockage et manipulation des données |
| JWT | Authentification par jeton |
| bcrypt | Hachage des mots de passe |
| Nodemailer et SMTP Gmail | Envoi des e-mails |
| Razorpay | Intégration du paiement en mode Test |
| Git et GitHub | Historique de développement et dépôt du code |
| VS Code, PowerShell et Copilot | Développement, commandes et assistance à l’implémentation |

Le travail a été effectué progressivement avec assistance de Copilot, puis vérifié par des essais manuels et des tests automatisés rapportés par l’outil. Les résultats ci-dessous reposent sur ces comptes rendus et sur les validations partagées pendant le développement ; ils ne constituent pas un audit indépendant du dépôt.

## 4. Architecture

L’application comprend trois couches principales :

1. **Interface React :** formulaires, catalogue, espace étudiant, administration et lecteur de leçons.
2. **API Express :** validation des requêtes, contrôles d’accès, logique métier, paiement, progression et notifications.
3. **MongoDB :** conservation des utilisateurs, cours, inscriptions, paiements, jetons de vérification et notifications.

En développement, le frontend fonctionne normalement sur `http://localhost:5173` et le backend sur `http://localhost:5000`. Le frontend communique avec l’API à travers le proxy de développement Vite.

La structure générale du projet est la suivante :

```text
backend/
  scripts/
  src/
    controllers/
    middleware/
    models/
    routes/
    services/
    utils/
  test/
frontend/
  public/
  src/
  test/
README.md
docs/
```

Les contrôleurs traitent les opérations métier, les routes définissent les points d’entrée et les middlewares contrôlent notamment l’authentification, le rôle, la vérification d’adresse et la protection CSRF.

### Principales données

- **User :** identité, adresse e-mail, mot de passe haché, rôle et statut de vérification.
- **Course :** titre, description, catégorie, niveau, image, prix, devise, publication et programme.
- **Enrollment :** relation utilisateur/cours, origine de l’inscription et progression.
- **Payment :** données nécessaires au suivi et à la confirmation du paiement.
- **AuthToken :** jetons temporaires dont seul le hash est conservé.
- **EmailNotification :** messages à envoyer et état de leur traitement.

Les modules et les leçons possèdent des identifiants stables pour préserver la progression lorsqu’ils sont réordonnés.

## 5. Fonctionnement de la plateforme

### 5.1 Comptes et authentification

L’utilisateur crée un compte étudiant. Le serveur valide les données, normalise l’adresse e-mail et hache le mot de passe. Le rôle administrateur ne peut pas être choisi depuis l’inscription publique ; un script manuel permet de promouvoir un compte existant.

La connexion utilise un JWT transmis par cookie HttpOnly. Les routes protégées vérifient la session et, selon l’opération, le rôle ou la vérification de l’adresse e-mail. Les opérations concernées par CSRF nécessitent un jeton valide. Les changements de session sont synchronisés entre les onglets.

Les liens de vérification et de réinitialisation reposent sur des jetons aléatoires, temporaires et à usage unique. Après une réinitialisation du mot de passe, les anciennes sessions sont invalidées. La demande de réinitialisation donne une réponse générique afin de ne pas révéler si une adresse possède un compte.

### 5.2 Catalogue et administration des cours

Le catalogue présente seulement les cours publiés. Il propose recherche, filtres et pagination. La page de détails affiche la description, le prix et le programme public, sans révéler les URL vidéo ou les contenus réservés.

L’administrateur peut créer et modifier les cours, organiser leurs modules et leçons, gérer les brouillons et publier les formations. Les cours ayant des inscriptions peuvent être archivés, mais ne sont pas supprimés définitivement par le parcours prévu. Les inscrits gardent l’accès aux cours archivés.

### 5.3 Paiement et inscription

Le backend crée la commande Razorpay à partir du prix enregistré en base. Les prix de démonstration sont en INR et stockés en paise : `49900` représente ₹499.

Lors de la confirmation, le serveur vérifie la signature, puis contrôle auprès du service de paiement la commande, le montant, la devise et le statut capturé. Une inscription payée n’est accordée qu’après ces vérifications. Des transactions et des contraintes d’unicité évitent les inscriptions en double lors de confirmations répétées.

**Limite de validation :** ces comportements ont été exercés par des tests avec un service Razorpay factice. Aucun essai Checkout avec de véritables clés de test n’a été confirmé. En l’absence de clés, l’application affiche une erreur et ne simule pas un paiement réussi.

Un script réservé à `NODE_ENV=development` permet d’inscrire un compte vérifié à un cours pour tester l’apprentissage. L’inscription est identifiée comme **Test local · non payé** et ne crée aucun Payment. Ce mécanisme ne remplace pas la validation du paiement.

### 5.4 Apprentissage et progression

Depuis Mes cours, l’utilisateur inscrit accède aux modules, aux leçons, aux vidéos et au contenu réservé. Il marque les leçons terminées ou retire ce statut.

Le pourcentage est calculé côté serveur : nombre de leçons actuelles terminées divisé par nombre total de leçons actuelles, multiplié par 100. Un cours sans leçons affiche 0 %. Les leçons supprimées ne sont plus comptées et un réordonnancement conserve les états grâce aux identifiants stables.

La progression est enregistrée dans MongoDB et retrouvée après actualisation ou reconnexion. Le backend vérifie l’inscription et l’appartenance de la leçon au cours avant de fournir le contenu ou de modifier la progression.

### 5.5 Listes administrateur et notifications

L’administration propose la consultation des utilisateurs et inscriptions avec recherche, filtres et pagination. Les inscriptions de test sont distinguées des inscriptions payées. Les données sensibles d’authentification ne figurent pas dans les réponses de ces listes.

Une confirmation de cours est mise en file après validation serveur du paiement. Une panne SMTP ne retire pas l’accès au cours ; les envois échoués peuvent être relancés. Une interruption après acceptation du message par le fournisseur peut néanmoins occasionner un doublon lors d’une relance : SMTP ne garantit pas une livraison exactement une fois.

Un outil disponible uniquement en développement permet l’envoi d’un message explicitement marqué `[TEST]`, sans créer de paiement ni d’inscription.

## 6. Méthodologie de développement

Le projet a été réalisé par étapes : définition d’un périmètre, implémentation assistée, lecture du compte rendu, configuration locale, essais manuels, correction des anomalies et création d’un commit pertinent.

| Étape | Résultat | Commit |
|---|---|---|
| 1 | Initialisation React, Express et Atlas | `79784d8` |
| 2 | Inscription et connexion JWT | `857c04a` |
| 3 | Vérification d’e-mail, réinitialisation et CSRF | `92386cd` |
| 4 | Catalogue, recherche, filtres et détails | `49c4bce` |
| 5 | Administration des cours, modules et leçons | `00b0200` |
| 6 | Paiement test et inscriptions, limite documentée | `72b806d` |
| 7 | Lecture des leçons et progression | `7d95aae` |
| 8 | Listes administrateur, notifications et configuration DNS | `e9108b8` |
| 9 | Finitions responsive et documentation | `b85b8cd` |

Ces neuf commits ont été confirmés dans l’historique local partagé. Le dépôt GitHub a été créé et les commandes de push ont été fournies ; leur résultat final n’a pas été communiqué dans les éléments utilisés pour ce rapport.

## 7. Difficultés rencontrées et corrections

| Difficulté | Analyse et solution |
|---|---|
| Configuration JWT | Le serveur refusait un secret absent ou trop court. Une valeur aléatoire a été générée et renseignée localement. |
| Réponse JSON vide | Le frontend échouait sur une réponse vide. La gestion des réponses et des erreurs a été adaptée. |
| Jeton CSRF périmé entre onglets | Les onglets conservaient des jetons différents alors que le cookie était partagé. Le cookie valide est stabilisé et le frontend lit sa valeur courante ; une mutation refusée n’est pas rejouée automatiquement. |
| Configuration de l’envoi e-mail | L’accès au portail Microsoft était bloqué. Le transport a été remplacé par SMTP Gmail avec un mot de passe d’application. |
| Leçons historiques sans identifiants | Les anciens documents ne comportaient pas d’identifiants de modules et leçons. Des identifiants stables sont créés et persistés avant de renvoyer le contenu d’apprentissage. |
| Connexion Atlas | Les recherches SRV échouaient avec le DNS par défaut de Node. Une configuration DNS facultative a été ajoutée ; l’adresse IP publique actuelle a aussi été ajoutée à la liste Atlas. |
| Liste utilisateurs invalide | Un ancien compte ne possédait pas `emailVerified`. Le backend normalise désormais cette valeur en booléen. |
| Navigation et affichage | Des corrections ont concerné les pages vides, les états actif/survol/focus et les débordements des tableaux sur mobile. |
| Accès Razorpay | L’accès aux clés de test reste bloqué par le parcours d’inscription. Cette limite est documentée ; aucun succès de paiement n’est inventé. |

## 8. Tests et niveau de validation

### Tests automatisés rapportés lors des finitions

- **Backend : 32 tests réussis.** Couverture annoncée : authentification, rôles, CSRF, e-mails avec transport factice, catalogue, administration, apprentissage, progression, configuration DNS et paiements avec service factice.
- **Frontend : 7 tests réussis.**
- **Build de production frontend : réussi.**
- **Contrôle `git diff --check` : réussi.**
- Aucun script de lint ou de vérification de types n’était défini dans les scripts disponibles lors du compte rendu final.

### Essais manuels confirmés pendant le développement

La communication React–Express et la connexion Atlas ont été observées. L’inscription, la connexion, la vérification réelle par e-mail et la réinitialisation du mot de passe ont été validées pendant les échanges. Le catalogue et la gestion des cours ont également été testés manuellement.

L’accès à un cours par inscription locale de test a fonctionné. Une anomalie de progression a ensuite été corrigée ; Copilot a rapporté un test navigateur confirmant navigation, complétion, persistance et retrait de complétion sur un cours historique.

Les dernières finitions responsive ont été contrôlées par Copilot à 360 px et 1440 px. Une partie des parcours administrateur a utilisé des réponses simulées. La confirmation explicite de tous les parcours finaux avec de véritables sessions et de la réception du nouveau message `[TEST]` n’a pas été fournie dans les éléments de rédaction ; ces essais doivent être consignés lorsqu’ils sont réalisés.

### Validation encore indispensable

Le parcours Razorpay Checkout en mode Test et la notification consécutive à un paiement capturé auprès du véritable service restent à tester. Les tests factices ne suffisent pas à confirmer l’intégration de bout en bout.

## 9. Installation et utilisation locale

Les prérequis sont Node.js, npm, Git et un accès MongoDB Atlas. Les paramètres réels sont renseignés dans `backend/.env` à partir des exemples fournis dans `.env.example`.

```powershell
# Depuis la racine du projet
cd backend
npm install
npm run dev
```

Dans un second terminal :

```powershell
# Depuis la racine du projet
cd frontend
npm install
npm run dev
```

Pour afficher les outils réservés au développement, définir dans le terminal backend avant le démarrage :

```powershell
$env:NODE_ENV = 'development'
```

Les paramètres concernent notamment le port, l’origine frontend, MongoDB, le secret JWT, SMTP Gmail et les clés Razorpay de test. `DNS_SERVERS` est facultatif et sert seulement si le DNS du réseau pose problème. Les secrets ne doivent pas être ajoutés au dépôt.

Les tests se lancent avec `npm test` dans chaque dossier. Le frontend se compile avec `npm run build`. Les scripts documentés incluent `seed:courses`, `admin:promote`, `enrollment:test` et `email:retry`. Le README reste la référence pour leurs arguments et conditions d’utilisation.

## 10. Captures d’écran à joindre

Les captures doivent être enregistrées dans `docs/screenshots/` et illustrer :

1. Le catalogue et ses filtres.
2. Les détails d’un cours.
3. Mes cours, avec l’origine de l’inscription visible.
4. Une leçon et sa progression.
5. La gestion des cours dans l’administration.
6. Les listes Utilisateurs et Inscriptions.
7. Une présentation sur petit écran.

Utiliser des noms lisibles comme `catalogue.png`, `learning-progress.png` et `admin-users.png`. Masquer les données personnelles. Ce rapport ne contient pas de captures intégrées : elles doivent être ajoutées à partir de l’application effectivement exécutée.

## 11. Limites et perspectives

Les travaux prioritaires sont l’obtention des clés Razorpay et la validation du paiement de bout en bout, puis la consignation des essais finaux avec de véritables sessions.

Les URL vidéo publiques peuvent être consultées ou partagées hors de la plateforme après divulgation. Une évolution possible consiste à utiliser un stockage privé et des URL temporaires. D’autres perspectives comprennent un traitement planifié des notifications, une meilleure supervision des erreurs et un déploiement avec HTTPS et une configuration adaptée des cookies et des origines.

Ces évolutions ne doivent pas être confondues avec les fonctionnalités déjà réalisées. L’application est principalement validée dans son environnement de développement local ; un déploiement public n’est pas confirmé dans les éléments disponibles.

## 12. Conclusion

La tâche 8 a permis de construire une plateforme intégrant comptes utilisateurs, catalogue, administration, apprentissage, progression persistante et e-mails. La démarche par étapes et les neuf commits rendent l’évolution du projet traçable.

Le principal point restant concerne Razorpay : l’implémentation et ses tests factices sont disponibles, mais Checkout doit encore être essayé avec des clés de test. Le rapport conserve cette distinction afin de présenter fidèlement les résultats et les limites du projet.
