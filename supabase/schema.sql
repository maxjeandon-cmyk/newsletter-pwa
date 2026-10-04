-- schema.sql — comptes & préférences de la PWA Newsletter (v23).
-- À exécuter UNE FOIS dans l'éditeur SQL de la console Supabase
-- (Database > SQL Editor > New query > coller > Run).
--
-- Sécurité — les 3 règles d'or :
--   1. Les mots de passe ne passent JAMAIS ici : ils sont hachés (bcrypt)
--      par l'API auth de Supabase. Cette base ne stocke que les préférences.
--   2. Row Level Security (RLS) : chaque utilisateur ne peut lire/écrire QUE
--      la ligne qui porte son id. La clé anon publique ne peut rien voir
--      d'autre, même en fabriquant des requêtes à la main.
--   3. Moins de privilèges = mieux : la table ne retient ni IP, ni date de
--      naissance, ni aucune donnée personnelle au-delà de l'e-mail (géré par
--      l'auth, pas ici) et des préférences d'affichage.

-- 1. Table des préférences : une ligne par utilisateur.
create table if not exists public.preferences (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. RLS obligatoire : sans politique, tout est interdit par défaut.
alter table public.preferences enable row level security;

-- 3. Politiques : chaque utilisateur ne touche que SA ligne.
drop policy if exists "prefs_select" on public.preferences;
create policy "prefs_select" on public.preferences
  for select using (auth.uid() = user_id);

drop policy if exists "prefs_insert" on public.preferences;
create policy "prefs_insert" on public.preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "prefs_update" on public.preferences;
create policy "prefs_update" on public.preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. user_id forcé = utilisateur connecté (impossible d'écrire pour un autre).
alter table public.preferences
  alter column user_id set default auth.uid();

-- 5. updated_at mis à jour automatiquement à chaque écriture.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_prefs_updated on public.preferences;
create trigger trg_prefs_updated before update on public.preferences
  for each row execute function public.set_updated_at();

-- 6. Hygiène : quand un compte est supprimé, ses préférences partent avec lui.
--    (on delete cascade déjà posé sur la clé primaire.)

-- v28 : notifications push — abonnements Web Push par utilisateur.
-- Une ligne par endpoint de navigateur ; les toggles (édition/Copernicus/médias)
-- vivent dans les préférences (table preferences) — pas ici.
create table if not exists public.abonnements_push (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth text,
  created_at timestamptz not null default now()
);

alter table public.abonnements_push enable row level security;

drop policy if exists "push_select" on public.abonnements_push;
create policy "push_select" on public.abonnements_push
  for select using (auth.uid() = user_id);

drop policy if exists "push_insert" on public.abonnements_push;
create policy "push_insert" on public.abonnements_push
  for insert with check (auth.uid() = user_id);

-- v80 : UPSERT — le client réenregistre son endpoint avec
-- Prefer: resolution=merge-duplicates : en cas de conflit sur endpoint,
-- PostgREST bascule en UPDATE, qui exige une policy update (sinon 42501).
drop policy if exists "push_update" on public.abonnements_push;
create policy "push_update" on public.abonnements_push
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push_delete" on public.abonnements_push;
create policy "push_delete" on public.abonnements_push
  for delete using (auth.uid() = user_id);

-- Le workflow d'envoi (GitHub Actions) lit via la clé service_role (secret
-- SUPABASE_SERVICE_ROLE) qui contourne le RLS : à ranger dans les secrets du
-- dépôt, jamais dans le code.

-- v31 : feedback — messages anonymes des lecteurs (onglet Feedback).
-- Insert-only pour la clé anon (pas de lecture publique : les messages sont privés),
-- la clé service_role (GitHub Actions) lit et résume chaque nuit via tools/feedback.js.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 3 and 2000),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "feedback_insert" on public.feedback;
create policy "feedback_insert" on public.feedback
  for insert with check (true);
