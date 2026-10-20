// Plateforme de gestion — version GitHub Pages + Supabase
const STATUTS = {
  a_contacter: 'À contacter',
  contacte: 'Contactée',
  relance: 'Relancée',
  repondu: 'A répondu',
  rdv: 'RDV pris',
  client: 'Cliente',
  perdu: 'Pas intéressée',
};
const ICONES = { creation: '＋', email_envoye: '✉', reponse: '↩', statut: '⇄', note: '✎' };
const SECTEURS_SUGGERES = ['Expertise comptable', 'Agences immobilières', "Cabinets d'avocats", 'BTP et artisans',
  'Cliniques et cabinets médicaux', 'E-commerce', 'Hôtellerie et restauration', 'Transport et logistique'];
// Secteurs proposés dans l'onglet Recherche, avec leurs codes NAF (nomenclature INSEE)
const SECTEURS_NAF = [
  ['Expertise comptable', '69.20Z'],
  ["Cabinets d'avocats", '69.10Z'],
  ['Conseil en gestion et stratégie', '70.22Z'],
  ['Agences immobilières', '68.31Z'],
  ["Architectes", '71.11Z'],
  ["Bureaux d'études et ingénierie", '71.12B'],
  ['Agences de communication et publicité', '73.11Z'],
  ['Services informatiques (ESN)', '62.01Z,62.02A'],
  ['Courtage en assurance', '66.22Z'],
  ['Recrutement et intérim', '78.10Z,78.20Z'],
  ['Organismes de formation', '85.59A'],
  ['Cabinets médicaux', '86.21Z,86.22C'],
  ['Cabinets dentaires', '86.23Z'],
  ['Pharmacies', '47.73Z'],
  ['Industrie pharmaceutique', '21.10Z,21.20Z'],
  ['Hôtels', '55.10Z'],
  ['Restaurants', '56.10A'],
  ['Construction de bâtiments (BTP)', '41.20A,41.20B'],
  ['Transport routier de marchandises', '49.41A,49.41B'],
  ['E-commerce (vente à distance)', '47.91B'],
];
// Tranches d'effectif salarié (codes INSEE)
const TAILLES = [
  ['01,02,03', '1 à 9', 'TPE'],
  ['11,12', '10 à 49', 'petite'],
  ['21,22,31', '50 à 249', 'moyenne'],
  ['32,41', '250 à 999', 'ETI'],
  ['42,51,52,53', '1 000 et plus', 'grande'],
];
const ETATS_RECHERCHE = { en_attente: 'En attente de n8n', en_cours: 'En cours', terminee: 'Terminée', erreur: 'Erreur' };

const CHAMPS = ['entreprise', 'secteur', 'contact_nom', 'contact_poste', 'email', 'telephone', 'ville', 'site_web',
  'statut', 'prochaine_relance', 'notes'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const echap = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = window.PLATEFORME || {};
const etat = { prospects: [], filtreStatut: '', secteur: '', q: '', courant: null };
let sb = null;

// ---------- Réglages Supabase ----------
function lireReglages() {
  let local = {};
  try { local = JSON.parse(localStorage.getItem('plateforme-supabase') || '{}'); } catch { /* stockage indisponible */ }
  return { url: (C.supabaseUrl || local.url || '').replace(/\/+$/, ''), cle: C.supabaseCleAnon || local.cle || '' };
}
const reglages = lireReglages();

// ---------- Outils ----------
function verifier({ data, error }) {
  if (error) {
    if (error.code === '23505') throw new Error('Une entreprise avec cet email existe déjà.');
    if (error.code === '42501') throw new Error("Ton compte n'a pas accès aux données. Vérifie que ton email est dans la table « equipe ».");
    if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Les tables n\'existent pas encore : exécute le fichier supabase/schema.sql dans Supabase.');
    throw new Error(error.message || 'Erreur Supabase');
  }
  return data;
}

function toast(msg, erreur = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('erreur', erreur);
  t.classList.add('visible');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('visible'), 3200);
}
const enCas = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

const versDate = (s) => new Date(s.length <= 10 ? s + 'T00:00:00' : s);
const dateCourte = (s) => (s ? versDate(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
function ilYa(s) {
  const min = Math.round((Date.now() - versDate(s)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return dateCourte(s);
}
const jourLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const aujourdhui = () => jourLocal(new Date());
const badge = (s) => `<span class="badge" style="--c:var(--s-${s})">${STATUTS[s] || s}</span>`;

// ---------- Écrans ----------
function montrer(id) {
  ['ecran-config', 'ecran-connexion', 'app'].forEach((x) => ($('#' + x).hidden = x !== id));
}
$$('.nom-marque').forEach((el) => (el.textContent = C.nom || 'Plateforme'));
$('.sous-marque').textContent = C.sousTitre || '';
document.title = `${C.nom || 'Plateforme'} — gestion`;

$('#form-config').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = e.target.url.value.trim().replace(/\/+$/, '');
  const cle = e.target.cle.value.trim();
  if (!/^https:\/\/.+\.supabase\.(co|in)$/.test(url) && !url.startsWith('http')) {
    $('#err-config').textContent = "L'adresse doit ressembler à https://abcdefghijkl.supabase.co";
    return;
  }
  try { localStorage.setItem('plateforme-supabase', JSON.stringify({ url, cle })); } catch { /* ignore */ }
  location.reload();
});

$('#form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#err-connexion').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: e.target.email.value.trim(), password: e.target.mdp.value });
  if (error) {
    $('#err-connexion').textContent = error.message.includes('Invalid login') ? 'Email ou mot de passe incorrect.' : error.message;
    return;
  }
  entrer();
});

async function demarrer() {
  if (!reglages.url || !reglages.cle) return montrer('ecran-config');
  if (!window.supabase) {
    montrer('ecran-connexion');
    $('#err-connexion').textContent = 'Impossible de charger Supabase. Vérifie ta connexion internet puis recharge la page.';
    return;
  }
  sb = window.supabase.createClient(reglages.url, reglages.cle);
  const { data } = await sb.auth.getSession();
  if (data.session) entrer();
  else montrer('ecran-connexion');
}

async function entrer() {
  const membre = await sb.from('equipe').select('email').limit(1);
  if (membre.error || !membre.data.length) {
    montrer('ecran-connexion');
    const { data } = await sb.auth.getUser();
    $('#err-connexion').textContent = membre.error && membre.error.code === 'PGRST205'
      ? 'Les tables n\'existent pas encore : exécute le fichier supabase/schema.sql dans Supabase.'
      : `Le compte ${data.user?.email || ''} n'a pas accès : ajoute cet email dans la table « equipe » de Supabase.`;
    await sb.auth.signOut();
    return;
  }
  montrer('app');
  const depart = ['tableau', 'recherche', 'demarchage', 'n8n'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'demarchage';
  afficher(depart);
  etatN8n();
  clearInterval(entrer.t);
  entrer.t = setInterval(() => {
    etatN8n();
    if (!$('#panneau').classList.contains('ouvert') && !$('[data-vue="demarchage"]').hidden) chargerProspects().catch(() => {});
    if (!$('[data-vue="recherche"]').hidden) chargerRecherches().catch(() => {});
  }, 30000);
}

$('#deconnexion').onclick = async () => { await sb.auth.signOut(); location.reload(); };

// ---------- Navigation ----------
function afficher(onglet) {
  $$('[data-vue]').forEach((v) => (v.hidden = v.dataset.vue !== onglet));
  $$('[data-onglet]').forEach((b) => {
    if (b.dataset.onglet === onglet) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  history.replaceState(null, '', '#' + onglet);
  const charger = { tableau: chargerTableau, recherche: chargerRecherches, demarchage: chargerProspects, n8n: chargerN8n }[onglet];
  enCas(charger)();
}
$$('[data-onglet]').forEach((b) => b.addEventListener('click', () => afficher(b.dataset.onglet)));

// ---------- Données ----------
async function lireProspects() {
  return verifier(await sb.from('prospects').select('*').order('updated_at', { ascending: false }));
}
function calculerStats(prospects) {
  const parStatut = Object.fromEntries(Object.keys(STATUTS).map((s) => [s, 0]));
  prospects.forEach((p) => parStatut[p.statut]++);
  const total = prospects.length;
  const contactes = total - parStatut.a_contacter;
  const reponses = parStatut.repondu + parStatut.rdv + parStatut.client;
  const auj = aujourdhui();
  const relancesDues = prospects.filter((p) => ['contacte', 'relance'].includes(p.statut) && p.prochaine_relance && p.prochaine_relance <= auj && p.emails_envoyes < 3).length;
  const secteurs = {};
  prospects.forEach((p) => {
    const s = p.secteur || 'Non renseigné';
    secteurs[s] = secteurs[s] || { secteur: s, n: 0, reponses: 0 };
    secteurs[s].n++;
    if (['repondu', 'rdv', 'client'].includes(p.statut)) secteurs[s].reponses++;
  });
  return {
    total, parStatut, relancesDues,
    tauxReponse: contactes ? Math.round((reponses / contactes) * 100) : 0,
    parSecteur: Object.values(secteurs).sort((a, b) => b.n - a.n),
  };
}

// ---------- Tableau de bord ----------
async function chargerTableau() {
  const depuis = new Date(Date.now() - 13 * 864e5);
  depuis.setHours(0, 0, 0, 0);
  const [prospects, envois, activites] = await Promise.all([
    lireProspects(),
    sb.from('activites').select('created_at').eq('type', 'email_envoye').gte('created_at', depuis.toISOString()).then(verifier),
    sb.from('activites').select('*, prospects(entreprise)').order('id', { ascending: false }).limit(12).then(verifier),
  ]);
  const s = calculerStats(prospects);
  const il7j = Date.now() - 7 * 864e5;
  $('#k-total').textContent = s.total;
  $('#k-emails7').textContent = envois.filter((a) => versDate(a.created_at) >= il7j).length;
  $('#k-taux').textContent = s.tauxReponse + ' %';
  $('#k-relances').textContent = s.relancesDues;
  $('#kpi-relances').classList.toggle('alerte', s.relancesDues > 0);
  $('#nb-prospects').textContent = s.total;

  const parJour = {};
  envois.forEach((a) => { const j = jourLocal(versDate(a.created_at)); parJour[j] = (parJour[j] || 0) + 1; });
  const jours = [...Array(14)].map((_, i) => jourLocal(new Date(Date.now() - (13 - i) * 864e5)));
  const max = Math.max(1, ...jours.map((j) => parJour[j] || 0));
  $('#histo').innerHTML = jours.map((j) => {
    const n = parJour[j] || 0;
    return `<div><i style="height:${(n / max) * 100}%" data-n="${n}" title="${n} email(s) le ${dateCourte(j)}"></i><span>${versDate(j).getDate()}</span></div>`;
  }).join('');

  const maxS = Math.max(1, ...s.parSecteur.map((r) => r.n));
  $('#secteurs').innerHTML = s.parSecteur.length ? s.parSecteur.slice(0, 6).map((r) => `
    <div class="secteur-ligne"><span>${echap(r.secteur)}</span><span class="sous">${r.n} · ${r.reponses} réponse${r.reponses > 1 ? 's' : ''}</span>
    <div class="jauge"><i style="width:${(r.n / maxS) * 100}%"></i></div></div>`).join('')
    : '<p class="sous">Les secteurs apparaîtront dès que tu auras des prospects.</p>';

  $('#flux').innerHTML = activites.length
    ? activites.map((a) => ligneActivite({ ...a, entreprise: a.prospects?.entreprise })).join('')
    : "<li><span class=\"ico\">＋</span><span>Aucune activité pour l'instant. Ajoute une entreprise ou lance ton workflow n8n.</span><span></span></li>";
}

function ligneActivite(a) {
  const qui = a.entreprise ? `<b>${echap(a.entreprise)}</b> — ` : '';
  const src = a.source === 'n8n' ? '<span class="src-n8n">n8n</span>' : '';
  return `<li><span class="ico">${ICONES[a.type] || '•'}</span><span>${qui}${echap(a.detail)}${src}</span><time>${ilYa(a.created_at)}</time></li>`;
}

// ---------- Recherche d'entreprises ----------
$('#r-secteur').innerHTML = '<option value="">Choisis un secteur…</option>' +
  SECTEURS_NAF.map(([nom], i) => `<option value="${i}">${echap(nom)}</option>`).join('') +
  '<option value="autre">Autre secteur (code NAF)…</option>';
$('#r-tailles').innerHTML = TAILLES.map(([codes, libelle, type], i) => `
  <label class="puce"><input type="checkbox" name="taille" value="${i}" ${i === 0 || i === 1 ? 'checked' : ''}>
  <span>${libelle} salariés <small>${type}</small></span></label>`).join('');
$('#r-secteur').addEventListener('change', (e) => {
  const autre = e.target.value === 'autre';
  $('#r-naf-zone').hidden = !autre;
  $('#r-naf').required = autre;
});

const libelleTailles = (indices) => indices.map((i) => TAILLES[i][1]).join(', ') + ' salariés';

$('#form-recherche').addEventListener('submit', enCas(async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#err-recherche');
  err.textContent = '';
  let secteur, codes;
  if (f.secteur.value === 'autre') {
    codes = f.naf.value.toUpperCase().split(/[\s,;]+/).filter(Boolean)
      .map((c) => (/^\d{4}[A-Z]$/.test(c) ? c.slice(0, 2) + '.' + c.slice(2) : c));
    if (!codes.length || codes.some((c) => !/^\d{2}\.\d{2}[A-Z]$/.test(c))) {
      err.textContent = 'Code NAF invalide : il doit ressembler à 70.22Z (plusieurs codes séparés par des virgules).';
      return;
    }
    secteur = 'Code NAF ' + codes.join(', ');
    codes = codes.join(',');
  } else {
    [secteur, codes] = SECTEURS_NAF[Number(f.secteur.value)];
  }
  const tailles = $$('input[name="taille"]:checked', f).map((c) => Number(c.value));
  if (!tailles.length) { err.textContent = "Choisis au moins une taille d'entreprise."; return; }
  const deps = f.departements.value.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  if (deps.some((d) => !/^(\d{2,3}|2A|2B)$/.test(d))) {
    err.textContent = 'Départements : indique des numéros séparés par des virgules, par exemple 75, 92, 69.';
    return;
  }
  verifier(await sb.from('recherches').insert({
    secteur,
    codes_naf: codes,
    tailles: tailles.map((i) => TAILLES[i][0]).join(','),
    tailles_libelle: libelleTailles(tailles),
    departements: deps.length ? deps.join(',') : null,
    nombre: Number(f.nombre.value),
  }));
  if (C.n8nWebhookRecherche) {
    // prévient n8n pour qu'il traite la recherche tout de suite (sinon il la prend à l'heure suivante)
    fetch(C.n8nWebhookRecherche, { method: 'POST', mode: 'no-cors' }).catch(() => {});
  }
  toast('Recherche lancée : les entreprises arrivent dans quelques minutes');
  chargerRecherches();
}));

async function chargerRecherches() {
  const liste = verifier(await sb.from('recherches').select('*').order('id', { ascending: false }).limit(50));
  $('#vide-recherches').hidden = liste.length > 0;
  $('#lignes-recherches').innerHTML = liste.map((r) => {
    let resultat = '<span class="sous">—</span>';
    if (r.statut === 'terminee') resultat = `<b>${r.nb_ajoutees}</b> ajoutée${r.nb_ajoutees > 1 ? 's' : ''}`
      + (r.nb_emails != null ? ` · <b>${r.nb_emails}</b> avec email` : '')
      + `<div class="sous">${r.nb_trouvees >= 10000 ? '10 000+' : r.nb_trouvees} dans l'annuaire</div>`;
    if (r.statut === 'erreur') resultat = `<span class="sous">${echap(r.message || 'Erreur inconnue')}</span>`;
    const actions = [
      r.statut === 'terminee' && r.nb_ajoutees ? `<button class="lien-action" data-voir="${echap(r.secteur)}">Voir</button>` : '',
      r.statut === 'erreur' ? `<button class="lien-action" data-relancer="${r.id}">Relancer</button>` : '',
      r.statut !== 'en_cours' ? `<button class="lien-action danger" data-effacer="${r.id}" aria-label="Effacer cette recherche">Effacer</button>` : '',
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td>${dateCourte(r.created_at)}<div class="sous">${versDate(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div></td>
      <td><b>${echap(r.secteur)}</b></td>
      <td>${echap(r.tailles_libelle || r.tailles)}</td>
      <td class="col-option">${echap(r.departements ? 'Dép. ' + r.departements.replaceAll(',', ', ') : 'France entière')}<div class="sous">${r.nombre} max.</div></td>
      <td><span class="badge etat-r ${r.statut}">${ETATS_RECHERCHE[r.statut] || r.statut}</span></td>
      <td>${resultat}</td>
      <td style="white-space:nowrap">${actions}</td>
    </tr>`;
  }).join('');
  $$('[data-voir]').forEach((b) => (b.onclick = () => {
    etat.secteur = b.dataset.voir; etat.filtreStatut = 'a_contacter'; etat.q = ''; $('#recherche').value = '';
    afficher('demarchage');
  }));
  $$('[data-relancer]').forEach((b) => (b.onclick = enCas(async () => {
    verifier(await sb.from('recherches').update({ statut: 'en_attente', message: null }).eq('id', b.dataset.relancer));
    toast('Recherche remise en attente');
    chargerRecherches();
  })));
  $$('[data-effacer]').forEach((b) => (b.onclick = enCas(async () => {
    if (!confirm('Effacer cette recherche de la liste ? Les entreprises déjà ajoutées restent dans Démarchage.')) return;
    verifier(await sb.from('recherches').delete().eq('id', b.dataset.effacer));
    chargerRecherches();
  })));
}

// ---------- Démarchage ----------
async function chargerProspects() {
  etat.prospects = await lireProspects();
  const stats = calculerStats(etat.prospects);
  $('#nb-prospects').textContent = stats.total;

  $('#pipeline').innerHTML = Object.entries(STATUTS).map(([k, v]) => `
    <button class="etape" style="--c:var(--s-${k})" data-statut="${k}" aria-pressed="${etat.filtreStatut === k}">
      <b>${stats.parStatut[k]}</b><span>${v}</span></button>`).join('');
  $$('#pipeline .etape').forEach((b) => b.addEventListener('click', () => {
    etat.filtreStatut = etat.filtreStatut === b.dataset.statut ? '' : b.dataset.statut;
    chargerProspects();
  }));

  const secteurs = [...new Set(etat.prospects.map((p) => p.secteur).filter(Boolean))].sort();
  $('#filtre-secteur').innerHTML = '<option value="">Tous les secteurs</option>' +
    secteurs.map((s) => `<option ${s === etat.secteur ? 'selected' : ''}>${echap(s)}</option>`).join('');
  $('#liste-secteurs').innerHTML = [...new Set([...SECTEURS_SUGGERES, ...secteurs])].map((s) => `<option value="${echap(s)}">`).join('');
  rendreLignes();
}

function rendreLignes() {
  const q = etat.q.toLowerCase();
  const liste = etat.prospects.filter((p) =>
    (!etat.filtreStatut || p.statut === etat.filtreStatut) &&
    (!etat.secteur || p.secteur === etat.secteur) &&
    (!q || [p.entreprise, p.contact_nom, p.email, p.ville].some((v) => (v || '').toLowerCase().includes(q))));

  const vide = $('#vide');
  if (!etat.prospects.length) {
    vide.hidden = false;
    vide.innerHTML = `<h3>Aucune entreprise démarchée pour l'instant</h3>
      <p>Ajoute ta première entreprise à la main, ou connecte ton workflow n8n : chaque email envoyé l'ajoutera ici.</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn principal" id="vide-ajouter">Ajouter une entreprise</button>
        <button class="btn" id="vide-n8n">Connecter n8n</button></div>`;
    $('#vide-ajouter').onclick = () => ouvrir();
    $('#vide-n8n').onclick = () => afficher('n8n');
  } else if (!liste.length) {
    vide.hidden = false;
    vide.innerHTML = '<h3>Aucun résultat</h3><p>Aucune entreprise ne correspond à ces filtres.</p><button class="btn" id="raz">Effacer les filtres</button>';
    $('#raz').onclick = () => { etat.filtreStatut = ''; etat.secteur = ''; etat.q = ''; $('#recherche').value = ''; chargerProspects(); };
  } else vide.hidden = true;

  const auj = aujourdhui();
  $('#lignes').innerHTML = liste.map((p) => {
    const suivi = ['contacte', 'relance'].includes(p.statut) && p.prochaine_relance;
    const enRetard = suivi && p.prochaine_relance <= auj;
    return `<tr data-id="${p.id}" tabindex="0">
      <td><div class="nom-ent">${echap(p.entreprise)}${p.source === 'n8n' ? '<span class="src-n8n">n8n</span>' : ''}</div>
        <div class="sous">${echap([p.secteur, p.ville, p.effectif].filter(Boolean).join(', '))}</div></td>
      <td><div>${echap(p.contact_nom || '—')}${p.contact_poste ? `<span class="sous">, ${echap(p.contact_poste)}</span>` : ''}</div>
        <div class="sous">${echap(p.email || p.telephone || '')}</div></td>
      <td>${badge(p.statut)}</td>
      <td class="col-option">${p.emails_envoyes}<div class="sous">${p.dernier_contact ? 'dernier ' + dateCourte(p.dernier_contact) : ''}</div></td>
      <td class="col-option ${enRetard ? 'retard' : ''}">${suivi ? (enRetard ? 'À faire · ' : '') + dateCourte(p.prochaine_relance) : '<span class="sous">—</span>'}</td>
    </tr>`;
  }).join('');
  $$('#lignes tr').forEach((tr) => {
    const ouvrirLigne = () => ouvrir(etat.prospects.find((p) => p.id === Number(tr.dataset.id)));
    tr.addEventListener('click', ouvrirLigne);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ouvrirLigne(); });
  });
}

$('#recherche').addEventListener('input', (e) => { etat.q = e.target.value; rendreLignes(); });
$('#filtre-secteur').addEventListener('change', (e) => { etat.secteur = e.target.value; rendreLignes(); });
$('#ajouter').addEventListener('click', () => ouvrir());

$('#exporter').onclick = enCas(async () => {
  const rows = await lireProspects();
  const cols = ['entreprise', 'secteur', 'contact_nom', 'contact_poste', 'email', 'telephone', 'ville', 'site_web',
    'statut', 'emails_envoyes', 'dernier_contact', 'prochaine_relance', 'notes'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(c === 'statut' ? STATUTS[r[c]] : r[c])).join(';'))].join('\n');
  telecharger(csv, `prospects-${aujourdhui()}.csv`, 'text/csv;charset=utf-8');
});

function telecharger(contenu, nom, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenu], { type }));
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Panneau entreprise ----------
$('#select-statut').innerHTML = Object.entries(STATUTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

function ouvrir(p = null) {
  etat.courant = p;
  const f = $('#form-prospect');
  f.reset();
  if (p) for (const el of f.elements) if (el.name) el.value = p[el.name] ?? '';
  $('#panneau-titre').textContent = p ? p.entreprise : 'Nouvelle entreprise';
  $('#panneau-sous').innerHTML = p ? `${badge(p.statut)} <span style="margin-left:6px">${p.emails_envoyes} email${p.emails_envoyes > 1 ? 's' : ''} envoyé${p.emails_envoyes > 1 ? 's' : ''}</span>`
    + (p.effectif || p.siren ? `<div style="margin-top:4px">${echap([p.effectif, p.siren && 'SIREN ' + p.siren].filter(Boolean).join(' · '))}</div>` : '') : '';
  if (p) $('#trouver-site').href = 'https://www.google.com/search?q=' + encodeURIComponent([p.entreprise, p.ville, 'site officiel contact'].filter(Boolean).join(' '));
  $('#supprimer').hidden = !p;
  $('#zone-suivi').hidden = !p;
  $('#zone-historique').hidden = !p;
  $('#enregistrer').textContent = p ? 'Enregistrer' : "Ajouter l'entreprise";
  $('#panneau').classList.add('ouvert');
  $('#panneau').setAttribute('aria-hidden', 'false');
  $('#voile').classList.add('ouvert');
  if (p) enCas(chargerHistorique)(p.id);
  setTimeout(() => f.elements.entreprise.focus(), 50);
}
function fermer() {
  $('#panneau').classList.remove('ouvert');
  $('#panneau').setAttribute('aria-hidden', 'true');
  $('#voile').classList.remove('ouvert');
  etat.courant = null;
}
$('#fermer').onclick = fermer;
$('#annuler').onclick = fermer;
$('#voile').onclick = fermer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });

async function chargerHistorique(id) {
  const a = verifier(await sb.from('activites').select('*').eq('prospect_id', id).order('id', { ascending: false }));
  $('#historique').innerHTML = a.map((x) => ligneActivite(x)).join('') ||
    "<li><span></span><span class=\"sous\">Rien pour l'instant.</span><span></span></li>";
}

async function rafraichirCourant(id) {
  await chargerProspects();
  const p = etat.prospects.find((x) => x.id === id);
  if (p) ouvrir(p);
}

$('#enregistrer').onclick = enCas(async () => {
  const f = $('#form-prospect');
  if (!f.reportValidity()) return;
  const brut = Object.fromEntries(new FormData(f));
  const data = {};
  for (const k of CHAMPS) data[k] = (brut[k] ?? '').trim() === '' ? null : brut[k].trim();
  if (etat.courant) {
    verifier(await sb.from('prospects').update(data).eq('id', etat.courant.id));
    toast('Modifications enregistrées');
  } else {
    data.statut = data.statut || 'a_contacter';
    data.source = 'manuel';
    verifier(await sb.from('prospects').insert(data));
    toast('Entreprise ajoutée');
  }
  fermer();
  chargerProspects();
});

$('#supprimer').onclick = enCas(async () => {
  if (!etat.courant || !confirm(`Supprimer ${etat.courant.entreprise} et son historique ?`)) return;
  verifier(await sb.from('prospects').delete().eq('id', etat.courant.id));
  toast('Entreprise supprimée');
  fermer();
  chargerProspects();
});

$('#noter-email').onclick = enCas(async () => {
  const id = etat.courant.id;
  verifier(await sb.rpc('enregistrer_email', { p_id: id, p_source: 'manuel' }));
  toast('Email noté, relance programmée');
  rafraichirCourant(id);
});
$$('[data-statut-rapide]').forEach((b) => b.addEventListener('click', enCas(async () => {
  const id = etat.courant.id;
  verifier(await sb.from('prospects').update({ statut: b.dataset.statutRapide }).eq('id', id));
  toast(`Statut : ${STATUTS[b.dataset.statutRapide]}`);
  rafraichirCourant(id);
})));
$('#form-note').addEventListener('submit', enCas(async (e) => {
  e.preventDefault();
  const texte = $('#note-texte').value.trim();
  if (!texte) return;
  const id = etat.courant.id;
  verifier(await sb.from('activites').insert({ prospect_id: id, type: 'note', detail: texte }));
  $('#note-texte').value = '';
  chargerHistorique(id);
}));

// ---------- n8n ----------
async function etatN8n() {
  const { data } = await sb.from('activites').select('created_at').eq('source', 'n8n').order('id', { ascending: false }).limit(1);
  const dernier = data && data[0] && data[0].created_at;
  $('#pastille-n8n').classList.toggle('ok', !!dernier);
  $('#texte-n8n').textContent = dernier ? `n8n : dernier envoi ${ilYa(dernier)}` : 'n8n : aucun envoi reçu';
}

const avecMonProjet = (texte) => texte.replaceAll('https://TON-PROJET.supabase.co', reglages.url);

async function chargerN8n() {
  $('#url-supabase').textContent = reglages.url;
  const noeud = await fetch('n8n/noeud-email-envoye.json').then((r) => r.text());
  $('#noeud-json').textContent = avecMonProjet(noeud);
  const points = [
    ['enregistrer_email', "Après chaque email : ajoute l'entreprise si besoin, compte l'envoi, programme la relance."],
    ['prospects_a_contacter', 'Liste des entreprises « À contacter » pour que n8n leur écrive (p_limit, p_secteur).'],
    ['relances_du_jour', "Entreprises à relancer aujourd'hui (p_limit, p_max_emails)."],
    ['importer_prospects', 'Ajoute ou met à jour une liste d\'entreprises (ex. depuis Google Sheets).'],
    ['enregistrer_reponse', 'Quand une entreprise répond : passe son statut à « A répondu ».'],
    ['recherche_suivante', "Prochaine recherche lancée depuis l'onglet Recherche (secteur, taille, zone)."],
    ['ajouter_resultats_recherche', 'Ajoute les entreprises trouvées (sans doublon) et clôt la recherche.'],
  ];
  $('#points').innerHTML = points.map(([a, b]) => `<tr><td>POST /rest/v1/rpc/${a}</td><td>${b}</td></tr>`).join('');
}

$('#telecharger-recherche').onclick = enCas(async () => {
  const wf = await fetch('n8n/workflow-recherche.json').then((r) => r.text());
  telecharger(avecMonProjet(wf), 'workflow-recherche-entreprises.json', 'application/json');
});

$('#telecharger-workflow').onclick = enCas(async () => {
  const wf = await fetch('n8n/workflow-demarchage.json').then((r) => r.text());
  telecharger(avecMonProjet(wf), 'workflow-demarchage.json', 'application/json');
});

$$('[data-copier]').forEach((b) => b.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#' + b.dataset.copier).textContent);
    toast('Copié');
  } catch { toast('Copie impossible : sélectionne le texte à la main', true); }
}));

demarrer();
