// Réglages de la plateforme.
// Les données et la connexion passent maintenant par n8n (workflow « Prospection – API (remplace Supabase) »).
window.PLATEFORME = {
  nom: 'Prospection',
  sousTitre: 'IA & automatisation',
  // Adresse de l'API n8n de la plateforme (données, connexion)
  n8nApi: 'https://margauxbouriez2.app.n8n.cloud/webhook/prospection-api',
  // Adresse du workflow n8n « Prospection – Recherche d’entreprises et emails » (lance la recherche tout de suite)
  n8nWebhookRecherche: 'https://margauxbouriez2.app.n8n.cloud/webhook/prospection-recherche',
};
