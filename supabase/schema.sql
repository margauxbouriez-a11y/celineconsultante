-- =====================================================================
--  Plateforme de démarchage — base de données Supabase
--  À coller en entier dans Supabase : SQL Editor > New query > Run.
--  Le script peut être relancé sans risque.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.prospects (
  id                bigint generated always as identity primary key,
  entreprise        text not null,
  secteur           text,
  contact_nom       text,
  contact_poste     text,
  email             text unique,
  telephone         text,
  ville             text,
  site_web          text,
  statut            text not null default 'a_contacter'
                    check (statut in ('a_contacter','contacte','relance','repondu','rdv','client','perdu')),
  emails_envoyes    integer not null default 0,
  dernier_contact   timestamptz,
  prochaine_relance date,
  notes             text,
  source            text not null default 'manuel',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.activites (
  id          bigint generated always as identity primary key,
  prospect_id bigint references public.prospects(id) on delete cascade,
  type        text not null,
  detail      text,
  source      text not null default 'manuel',
  created_at  timestamptz not null default now()
);

-- Personnes autorisées à ouvrir la plateforme (leur email de connexion)
create table if not exists public.equipe (
  email text primary key
);

create index if not exists idx_prospects_statut on public.prospects(statut);
create index if not exists idx_activites_prospect on public.activites(prospect_id);
create index if not exists idx_activites_date on public.activites(created_at desc);

-- ---------- Automatismes ----------
-- Emails en minuscules, champs vides => null, date de mise à jour
create or replace function public.prospects_avant_ecriture()
returns trigger language plpgsql as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.entreprise := trim(new.entreprise);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists t_prospects_avant on public.prospects;
create trigger t_prospects_avant before insert or update on public.prospects
  for each row execute function public.prospects_avant_ecriture();

-- Historique automatique : création et changement de statut
create or replace function public.prospects_apres_ecriture()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activites(prospect_id, type, detail, source)
    values (new.id, 'creation', 'Prospect ajouté : ' || new.entreprise, new.source);
  elsif new.statut is distinct from old.statut and new.emails_envoyes = old.emails_envoyes
        and coalesce(current_setting('plateforme.silence', true), '') <> 'oui' then
    insert into public.activites(prospect_id, type, detail, source)
    values (new.id, 'statut', 'Statut : ' || old.statut || ' → ' || new.statut,
            coalesce(current_setting('plateforme.source', true), 'manuel'));
  end if;
  return null;
end $$;

drop trigger if exists t_prospects_apres on public.prospects;
create trigger t_prospects_apres after insert or update on public.prospects
  for each row execute function public.prospects_apres_ecriture();

-- ---------- Fonctions appelées par n8n (et par la plateforme) ----------

-- Un email vient de partir : crée l'entreprise si besoin, compte l'envoi, programme la relance
create or replace function public.enregistrer_email(
  p_email         text   default null,
  p_entreprise    text   default null,
  p_contact_nom   text   default null,
  p_secteur       text   default null,
  p_objet         text   default null,
  p_id            bigint default null,
  p_source        text   default 'n8n',
  p_relance_jours int    default 4
) returns public.prospects language plpgsql as $$
declare
  p public.prospects;
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if p_id is not null then
    select * into p from public.prospects where id = p_id;
  elsif v_email is not null then
    select * into p from public.prospects where email = v_email;
  else
    raise exception 'Il faut un email (p_email) ou un identifiant (p_id).';
  end if;

  if not found then
    if v_email is null then raise exception 'Aucun prospect avec cet identifiant.'; end if;
    insert into public.prospects(entreprise, email, contact_nom, secteur, source)
    values (coalesce(nullif(trim(p_entreprise), ''), split_part(split_part(v_email, '@', 2), '.', 1)),
            v_email, nullif(trim(p_contact_nom), ''), nullif(trim(p_secteur), ''), p_source)
    returning * into p;
  end if;

  update public.prospects set
    emails_envoyes    = emails_envoyes + 1,
    dernier_contact   = now(),
    prochaine_relance = current_date + p_relance_jours,
    statut = case when statut = 'a_contacter' then 'contacte'
                  when statut in ('contacte', 'relance') then 'relance'
                  else statut end,
    contact_nom = coalesce(contact_nom, nullif(trim(p_contact_nom), '')),
    secteur     = coalesce(secteur, nullif(trim(p_secteur), ''))
  where id = p.id
  returning * into p;

  insert into public.activites(prospect_id, type, detail, source)
  values (p.id, 'email_envoye',
          case when nullif(trim(p_objet), '') is null then 'Email envoyé'
               else 'Email envoyé : « ' || trim(p_objet) || ' »' end,
          p_source);
  return p;
end $$;

-- Une entreprise a répondu
create or replace function public.enregistrer_reponse(
  p_email   text,
  p_extrait text default null,
  p_statut  text default 'repondu'
) returns public.prospects language plpgsql as $$
declare p public.prospects;
begin
  perform set_config('plateforme.silence', 'oui', true);  -- l'historique note déjà la réponse
  update public.prospects set statut = p_statut, prochaine_relance = null
  where email = lower(trim(p_email))
  returning * into p;
  if not found then raise exception 'Aucun prospect avec l''email %', p_email; end if;
  insert into public.activites(prospect_id, type, detail, source)
  values (p.id, 'reponse',
          case when p_extrait is null then 'Réponse reçue' else 'Réponse reçue : ' || left(p_extrait, 500) end,
          'n8n');
  return p;
end $$;

-- Entreprises à contacter (qui ont un email)
create or replace function public.prospects_a_contacter(p_limit int default 20, p_secteur text default null)
returns setof public.prospects language sql stable as $$
  select * from public.prospects
  where statut = 'a_contacter' and email is not null
    and (p_secteur is null or secteur = p_secteur)
  order by created_at
  limit least(p_limit, 200);
$$;

-- Entreprises à relancer aujourd'hui
create or replace function public.relances_du_jour(p_limit int default 20, p_max_emails int default 3)
returns setof public.prospects language sql stable as $$
  select * from public.prospects
  where statut in ('contacte', 'relance') and email is not null
    and prochaine_relance <= current_date and emails_envoyes < p_max_emails
  order by prochaine_relance
  limit least(p_limit, 200);
$$;

-- Ajoute ou met à jour une liste d'entreprises (noms de champs en français ou en anglais)
create or replace function public.importer_prospects(p_lignes jsonb)
returns jsonb language plpgsql as $$
declare
  e jsonb;
  v_email text; v_entreprise text;
  n_crees int := 0; n_maj int := 0; erreurs jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_lignes) = 'object' then p_lignes := jsonb_build_array(p_lignes); end if;
  for e in select * from jsonb_array_elements(p_lignes) loop
    v_email := nullif(lower(trim(coalesce(e->>'email', e->>'mail', e->>'e-mail'))), '');
    v_entreprise := nullif(trim(coalesce(e->>'entreprise', e->>'company', e->>'company_name', e->>'societe', e->>'organization')), '');
    if v_entreprise is null and v_email is not null then
      v_entreprise := split_part(split_part(v_email, '@', 2), '.', 1);
    end if;
    if v_entreprise is null then
      erreurs := erreurs || jsonb_build_object('entree', e, 'erreur', 'entreprise manquante');
      continue;
    end if;
    if v_email is not null and exists (select 1 from public.prospects where email = v_email) then
      update public.prospects set
        entreprise    = v_entreprise,
        secteur       = coalesce(nullif(coalesce(e->>'secteur', e->>'industry', e->>'sector'), ''), secteur),
        contact_nom   = coalesce(nullif(coalesce(e->>'contact_nom', e->>'contact', e->>'name', e->>'full_name'), ''), contact_nom),
        contact_poste = coalesce(nullif(coalesce(e->>'contact_poste', e->>'poste', e->>'title', e->>'job_title'), ''), contact_poste),
        telephone     = coalesce(nullif(coalesce(e->>'telephone', e->>'phone', e->>'tel'), ''), telephone),
        ville         = coalesce(nullif(coalesce(e->>'ville', e->>'city'), ''), ville),
        site_web      = coalesce(nullif(coalesce(e->>'site_web', e->>'website', e->>'site'), ''), site_web)
      where email = v_email;
      n_maj := n_maj + 1;
    else
      insert into public.prospects(entreprise, email, secteur, contact_nom, contact_poste, telephone, ville, site_web, source)
      values (v_entreprise, v_email,
        nullif(coalesce(e->>'secteur', e->>'industry', e->>'sector'), ''),
        nullif(coalesce(e->>'contact_nom', e->>'contact', e->>'name', e->>'full_name'), ''),
        nullif(coalesce(e->>'contact_poste', e->>'poste', e->>'title', e->>'job_title'), ''),
        nullif(coalesce(e->>'telephone', e->>'phone', e->>'tel'), ''),
        nullif(coalesce(e->>'ville', e->>'city'), ''),
        nullif(coalesce(e->>'site_web', e->>'website', e->>'site'), ''),
        coalesce(e->>'source', 'n8n'));
      n_crees := n_crees + 1;
    end if;
  end loop;
  return jsonb_build_object('crees', n_crees, 'mis_a_jour', n_maj, 'erreurs', erreurs);
end $$;

-- ---------- Sécurité ----------
-- Seules les personnes inscrites dans la table "equipe" voient et modifient les données.
-- n8n utilise la clé "service_role", qui passe outre ces règles.
create or replace function public.est_membre()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipe where email = lower(auth.jwt() ->> 'email'));
$$;

alter table public.prospects enable row level security;
alter table public.activites enable row level security;
alter table public.equipe    enable row level security;

drop policy if exists "equipe_prospects" on public.prospects;
create policy "equipe_prospects" on public.prospects for all to authenticated
  using (public.est_membre()) with check (public.est_membre());

drop policy if exists "equipe_activites" on public.activites;
create policy "equipe_activites" on public.activites for all to authenticated
  using (public.est_membre()) with check (public.est_membre());

drop policy if exists "equipe_lecture" on public.equipe;
create policy "equipe_lecture" on public.equipe for select to authenticated
  using (public.est_membre());

-- Personne d'anonyme ne peut appeler les fonctions
revoke execute on function public.enregistrer_email(text,text,text,text,text,bigint,text,int) from public, anon;
revoke execute on function public.enregistrer_reponse(text,text,text) from public, anon;
revoke execute on function public.prospects_a_contacter(int,text) from public, anon;
revoke execute on function public.relances_du_jour(int,int) from public, anon;
revoke execute on function public.importer_prospects(jsonb) from public, anon;
grant execute on function public.enregistrer_email(text,text,text,text,text,bigint,text,int) to authenticated, service_role;
grant execute on function public.enregistrer_reponse(text,text,text) to authenticated, service_role;
grant execute on function public.prospects_a_contacter(int,text) to authenticated, service_role;
grant execute on function public.relances_du_jour(int,int) to authenticated, service_role;
grant execute on function public.importer_prospects(jsonb) to authenticated, service_role;

-- ---------- À personnaliser ----------
-- Remplace l'adresse ci-dessous par l'email avec lequel tu te connecteras, puis exécute cette ligne :
-- insert into public.equipe(email) values ('ton.email@exemple.com') on conflict do nothing;
