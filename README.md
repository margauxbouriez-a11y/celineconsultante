# Prospection — plateforme de gestion

> **Prototype « plateforme consultante » (réglementaire pharma)** : voir le dossier [`prototype/`](prototype/), page autonome avec données fictives. Une fois publiée par GitHub Pages, elle s'ouvre à l'adresse `…/celineconsultante/prototype/`.

Plateforme interne d'une agence d'IA et d'automatisation, **100 % gratuite à héberger** :

- l'interface est publiée par **GitHub Pages** (ce dépôt) ;
- les données et la connexion sont dans **n8n** : une Data table « Prospection – base » et un workflow API qui la lit et l'écrit ;
- les autres workflows n8n cherchent les entreprises, trouvent leurs emails, envoient les emails et notent les réponses.

Aucune base de données externe : il n'y a rien d'autre à installer.

| Onglet | Contenu |
| --- | --- |
| Recherche | Choisis un secteur, une taille d'entreprise et une zone : n8n trouve les entreprises dans l'annuaire officiel et les ajoute au Démarchage |
| Tableau de bord | Entreprises dans le fichier, emails envoyés sur 7 jours, taux de réponse, relances à faire, résultats par secteur, dernières activités |
| Démarchage | Entreprises démarchées et leur contact (nom, poste, email, téléphone), statut, historique, notes, export CSV |
| Automatisation n8n | Les workflows en service, avec un lien vers chacun dans n8n |
| Clients, Projets | Prochains modules |

---

## Architecture

```
Page GitHub Pages ──POST /webhook/prospection-api──► Prospection – API ◄── appels internes des autres workflows
                                                           │
                                                           ▼
                                             Data table n8n « Prospection – base »

Onglet Recherche ──POST /webhook/prospection-recherche──► Recherche d'entreprises et emails
```

| Workflow n8n | Quand | Rôle |
| --- | --- | --- |
| **Prospection – API** | À chaque demande | Connexion (email + mot de passe, code par email pour la première connexion), lecture et écriture des données |
| **Recherche d'entreprises et emails** | Dès qu'une recherche est lancée, puis toutes les heures de 8 h à 20 h | [Annuaire des entreprises](https://recherche-entreprises.api.gouv.fr) (public, gratuit) → site officiel (Firecrawl) → email publié sur le site → ajout en « À contacter », sans doublon (SIREN) |
| **Compléter les emails manquants** | Toutes les heures de 8 h à 20 h | Reprend 10 entreprises « À contacter » sans email et cherche leur email sur leur site officiel |
| **Envoi des emails et suivi des réponses (Gmail)** | Du lundi au vendredi | Premiers emails toutes les heures de 9 h à 17 h (5 par passage), relances à 10 h 30, 14 h 30 et 16 h 30 (2 emails maximum par entreprise), réponses Gmail lues chaque heure |

Quand une entreprise répond, son statut passe à « A répondu » (ou « Pas intéressée » si elle écrit STOP) et les relances s'arrêtent.

### Actions de l'API

Le workflow API reçoit `{ "action": "…", … }`. La page web envoie aussi le jeton de connexion ; les autres workflows l'appellent avec *Execute Workflow* (paramètres `action` et `params`).

| Action | Utilisée par | Rôle |
| --- | --- | --- |
| `connexion`, `deconnexion`, `code`, `mdp`, `moi` | Page web | Connexion et mot de passe |
| `tout`, `tableau`, `historique` | Page web | Lecture des données |
| `enregistrer`, `statut`, `note`, `noter_email`, `supprimer` | Page web | Modification d'une entreprise |
| `lancer_recherche`, `relancer_recherche`, `effacer_recherche` | Page web | Onglet Recherche |
| `prospects_a_contacter`, `relances_du_jour`, `enregistrer_email`, `enregistrer_reponse` | Envoi des emails | Envois, relances, réponses |
| `recherche_suivante`, `sirens_existants`, `ajouter_resultats_recherche` | Recherche d'entreprises | Traitement des recherches |
| `prospects_sans_email`, `completer_email` | Compléter les emails | Emails manquants |

---

## Mise en ligne

1. Sur GitHub, dans ce dépôt : **Settings → Pages**.
2. *Source* : **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
3. Après une à deux minutes, la plateforme est en ligne à l'adresse
   **https://margauxbouriez-a11y.github.io/celineconsultante/**

Les adresses des webhooks n8n sont dans [`config.js`](config.js). Les quatre workflows ci-dessus doivent rester **actifs** dans n8n.

## Email de démarchage

Le workflow *Envoi des emails* envoie depuis Gmail un email de présentation (étudiante en 2ᵉ année à HEC Paris qui crée son entreprise
d'accompagnement en IA : formations, automatisations, plateformes centralisées), puis une relance. Le texte se modifie directement
dans les nœuds « Envoyer le premier email » et « Envoyer la relance ».

## Secteur conseillé : les cabinets d'expertise comptable

Ils perdent beaucoup de temps sur des tâches répétitives (relances de pièces, tri des factures, ressaisie entre logiciels) ; le gain
se chiffre facilement en heures, et dans les petits cabinets le dirigeant décide seul. Agences immobilières et cabinets d'avocats
sont de bonnes cibles suivantes : le champ *Secteur* permet de comparer les taux de réponse dans le tableau de bord.

## Fichiers

```
index.html, app.js, styles.css   Interface (GitHub Pages)
config.js                        Nom affiché + adresses des webhooks n8n
v2/                              Copie de l'interface (même code)
prototype/                       Prototype « plateforme consultante » (données fictives)
```
