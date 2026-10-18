# Prospection — plateforme de gestion

> **Prototype « plateforme consultante » (réglementaire pharma)** : voir le dossier [`prototype/`](prototype/), page autonome avec données fictives. Une fois publiée par GitHub Pages, elle s'ouvre à l'adresse `…/celineconsultante/prototype/`.

Plateforme interne d'une agence d'IA et d'automatisation, **100 % gratuite à héberger** :

- l'interface est publiée par **GitHub Pages** (ce dépôt) ;
- les données sont dans **Supabase** (base de données en ligne, offre gratuite) ;
- **n8n** écrit directement dans Supabase après chaque email envoyé.

| Onglet | Contenu |
| --- | --- |
| Recherche | Choisis un secteur, une taille d'entreprise et une zone : n8n trouve les entreprises dans l'annuaire officiel et les ajoute au Démarchage |
| Tableau de bord | Entreprises dans le fichier, emails envoyés sur 7 jours, taux de réponse, relances à faire, résultats par secteur, dernières activités |
| Démarchage | Entreprises démarchées et leur contact (nom, poste, email, téléphone), statut, historique, notes, export CSV |
| Automatisation n8n | Le nœud n8n à copier-coller et le workflow complet, déjà remplis avec l'adresse de ton projet |
| Clients, Projets | Prochains modules |

---

## Mise en route (environ 15 minutes, une seule fois)

### 1. Créer la base Supabase

1. Crée un compte sur [supabase.com](https://supabase.com), puis **New project** (région Europe, par exemple Paris ou Francfort).
2. Ouvre **SQL Editor → New query**, colle tout le contenu de [`supabase/schema.sql`](supabase/schema.sql) et clique sur **Run**.
3. Dans le même éditeur, exécute cette ligne avec **ton** email :
   ```sql
   insert into public.equipe(email) values ('ton.email@exemple.com');
   ```
   Seules les adresses de cette table peuvent voir les données.
4. **Authentication → Users → Add user → Create new user** : le même email, un mot de passe, et coche *Auto Confirm User*.
5. Conseillé : **Authentication → Sign In / Providers**, désactive *Allow new users to sign up*.

### 2. Mettre la plateforme en ligne avec GitHub Pages

1. Sur GitHub, dans ce dépôt : **Settings → Pages**.
2. *Source* : **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
3. Après une à deux minutes, la plateforme est en ligne à l'adresse
   **https://margauxbouriez-a11y.github.io/celineconsultante/**

### 3. Relier la plateforme à Supabase

Dans Supabase, **Project Settings → API** : copie la **Project URL** et la clé **anon public**.

- Solution rapide : ouvre la plateforme, l'écran de démarrage te les demande (elles restent sur cet appareil).
- Pour tous tes appareils : colle-les dans [`config.js`](config.js) (`supabaseUrl` et `supabaseCleAnon`).

La clé *anon* peut être publique : les règles de la base n'autorisent que les emails de la table `equipe`.
La clé **service_role** ne doit **jamais** aller dans ce dépôt ; elle sert uniquement dans n8n.

---

## Connecter n8n

1. Dans n8n : **Credentials → Add credential → Supabase API**.
   *Host* = ta Project URL, *Service Role Secret* = la clé **service_role** (Project Settings → API).
2. Deux possibilités :
   - **Tu as déjà un workflow qui envoie les emails** : dans l'onglet *Automatisation n8n* de la plateforme, copie le nœud
     et colle-le dans ton workflow, juste après ton nœud Gmail / Send Email. Choisis ton compte Supabase dans *Credential*.
     Dans le champ Body, remplace `Prospects à contacter` par le nom de ton nœud qui contient l'email du destinataire.
   - **Workflow complet** : bouton *Télécharger le workflow complet*, puis dans n8n *Import from File*.
     - 9 h, du lundi au vendredi : 20 entreprises « À contacter » → premier email (Gmail) → enregistrement.
     - 10 h, du lundi au vendredi : relances du jour → email de relance → enregistrement.
     - Après 3 emails sans réponse, l'entreprise n'est plus relancée.
     Connecte ton Gmail et ton compte Supabase dans les nœuds, puis remplace `[Prénom Nom]`, `[Nom de l'entreprise]`
     et `[Téléphone]` dans le texte et la signature.

### Fonctions disponibles pour n8n

Toutes s'appellent en `POST https://<ton-projet>.supabase.co/rest/v1/rpc/<fonction>` avec le compte Supabase de n8n.

| Fonction | Corps JSON | Rôle |
| --- | --- | --- |
| `enregistrer_email` | `{ "p_email", "p_entreprise", "p_contact_nom", "p_secteur", "p_objet" }` | Un email vient de partir : crée l'entreprise si besoin, compte l'envoi, statut « Contactée » puis « Relancée », relance dans 4 jours |
| `prospects_a_contacter` | `{ "p_limit": 20, "p_secteur": null }` | Entreprises « À contacter » qui ont un email |
| `relances_du_jour` | `{ "p_limit": 20, "p_max_emails": 3 }` | Entreprises à relancer aujourd'hui |
| `importer_prospects` | `{ "p_lignes": [ {...}, {...} ] }` | Ajoute ou met à jour des entreprises (noms de champs français ou anglais : `company`, `name`, `city`…) |
| `enregistrer_reponse` | `{ "p_email", "p_extrait" }` | Une entreprise a répondu : statut « A répondu » |

---

## Recherche automatique d'entreprises

1. Si ta base existait avant cette fonction, **relance tout le fichier [`supabase/schema.sql`](supabase/schema.sql)** dans le SQL Editor
   (aucune donnée n'est effacée) : il ajoute la table `recherches` et les fonctions utilisées par n8n.
2. Onglet *Automatisation n8n* → bouton **Workflow « Recherche d'entreprises »**, puis dans n8n *Import from File*.
   Choisis ton compte Supabase dans les nœuds « Recherche en attente » et « Ajouter à la plateforme », puis active le workflow.
3. Onglet **Recherche** de la plateforme : secteur (ou code NAF), taille, département(s) facultatif(s), nombre d'entreprises.
4. Toutes les heures de 8 h à 20 h, n8n prend la recherche en attente, interroge
   l'[API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr) (publique, gratuite, sans clé)
   et ajoute les entreprises actives trouvées en « À contacter », sans doublon (SIREN), avec le nom du dirigeant et la taille.

> L'annuaire ne fournit pas d'email. Complète l'email depuis la fiche de l'entreprise (bouton « Trouver son site »),
> le workflow *Démarchage* lui écrira ensuite automatiquement.

| Fonction (n8n, clé service_role) | Rôle |
| --- | --- |
| `recherche_suivante` | Renvoie la prochaine recherche en attente et la passe « en cours » |
| `ajouter_resultats_recherche` | `{ "p_recherche_id", "p_lignes": [...], "p_nb_trouvees" }` ou `{ "p_recherche_id", "p_erreur" }` |

## Email de démarchage

Le workflow *Démarchage* envoie un email de présentation (étudiante en 2ᵉ année à HEC Paris qui crée son entreprise
d'accompagnement en IA : formations, automatisations, plateformes centralisées), puis une relance.
Remplace `[Prénom Nom]`, `[Nom de l'entreprise]` et `[Téléphone]` dans les deux nœuds Gmail.

## Secteur conseillé : les cabinets d'expertise comptable

L'email modèle vise les cabinets comptables. Ils perdent beaucoup de temps sur des tâches répétitives (relances de pièces,
tri des factures, ressaisie entre logiciels) ; le gain se chiffre facilement en heures, et dans les petits cabinets
le dirigeant décide seul. Agences immobilières et cabinets d'avocats sont de bonnes cibles suivantes : le champ *Secteur*
permet de comparer les taux de réponse dans le tableau de bord.

## Fichiers

```
index.html, app.js, styles.css   Interface (GitHub Pages)
config.js                        Nom affiché + adresse et clé publique Supabase
supabase/schema.sql              Tables, règles d'accès et fonctions (à exécuter dans Supabase)
n8n/workflow-demarchage.json     Workflow d'envoi des emails et des relances
n8n/workflow-recherche.json      Workflow de recherche d'entreprises (onglet Recherche)
n8n/noeud-email-envoye.json      Nœud à coller dans un workflow existant
```
