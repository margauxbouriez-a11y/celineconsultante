// Réglages de la plateforme.
// L'adresse du projet et la clé "anon public" se trouvent dans Supabase : Project Settings > API.
// La clé anon peut être publique : la base est protégée par les règles d'accès (seule l'équipe voit les données).
// Ne mets JAMAIS la clé "service_role" ici : elle est réservée à n8n.
window.PLATEFORME = {
  nom: 'Prospection',
  sousTitre: 'IA & automatisation',
  supabaseUrl: '',      // ex. 'https://abcdefghijkl.supabase.co'
  supabaseCleAnon: '',  // ex. 'eyJhbGciOi...'
  // Adresse du workflow n8n « Prospection – Recherche d’entreprises et emails » (lance la recherche tout de suite)
  n8nWebhookRecherche: 'https://margauxbouriez2.app.n8n.cloud/webhook/prospection-recherche',
};
