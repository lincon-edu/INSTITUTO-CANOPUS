create extension if not exists pgcrypto;

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  section text not null unique,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  body text not null default '',
  cover_url text not null default '',
  gallery_urls text[] not null default '{}',
  category text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news add column if not exists gallery_urls text[] not null default '{}';

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  email text,
  photo_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  details text not null default '',
  logo_url text not null default '',
  image_url text not null default '',
  image_position text not null default 'right' check (image_position in ('right', 'left', 'bottom-left', 'bottom-right')),
  ods integer[] not null default '{}',
  ods_color text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists subtitle text not null default '';
alter table public.projects add column if not exists details text not null default '';
alter table public.projects add column if not exists logo_url text not null default '';
alter table public.projects add column if not exists image_position text not null default 'right';
alter table public.projects add column if not exists ods integer[] not null default '{}';
alter table public.projects add column if not exists ods_color text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_image_position_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_image_position_check
      check (image_position in ('right', 'left', 'bottom-left', 'bottom-right'));
  end if;
end
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists news_status_idx on public.news (status);
create index if not exists news_published_at_idx on public.news (published_at desc);
create index if not exists team_members_sort_order_idx on public.team_members (sort_order);
create index if not exists team_members_active_idx on public.team_members (active);
create index if not exists projects_sort_order_idx on public.projects (sort_order);
create index if not exists projects_active_idx on public.projects (active);

do $$
begin
  if not exists (select 1 from public.team_members) then
    insert into public.team_members (name, role, email, photo_url, sort_order, active) values
      ('Maísa Santos Coutinho', 'Presidente', 'maisacoutinho@grupocanopus.com.br', 'assets/img/equipe/maisa-santos-coutinho.jpg', 1, true),
      ('Hérika Brino Lima', 'Coordenadora de Projetos', 'herika.lima@grupocanopus.com.br', 'assets/img/equipe/herika-brino-lima.jpg', 2, true),
      ('Marisa Olkoski', 'Tesoureira', 'marisa.olkosi@grupocanopus.com.br', 'assets/img/equipe/marisa-olkoski.jpg', 3, true),
      ('Rodrigo Fleury', 'Vice-Presidente', 'rodrigofleury@grupocanopus.com.br', 'assets/img/equipe/rodrigo-fleury.jpg', 4, true);
  end if;
end
$$;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

alter table public.site_content enable row level security;
alter table public.news enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.admin_users enable row level security;

grant select on public.site_content, public.news, public.team_members, public.projects to anon, authenticated;
grant insert, update, delete on public.site_content, public.news, public.team_members, public.projects to authenticated;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

drop policy if exists "Public can read site content" on public.site_content;
create policy "Public can read site content" on public.site_content
  for select to anon, authenticated using (true);
drop policy if exists "Admins manage site content" on public.site_content;
create policy "Admins manage site content" on public.site_content
  for all to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Public can read published news" on public.news;
create policy "Public can read published news" on public.news
  for select to anon, authenticated using (status = 'published');
drop policy if exists "Admins manage news" on public.news;
create policy "Admins manage news" on public.news
  for all to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Public can read active team members" on public.team_members;
create policy "Public can read active team members" on public.team_members
  for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage team members" on public.team_members;
create policy "Admins manage team members" on public.team_members
  for all to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Public can read active projects" on public.projects;
create policy "Public can read active projects" on public.projects
  for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage projects" on public.projects;
create policy "Admins manage projects" on public.projects
  for all to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Admins can read their own admin record" on public.admin_users;
create policy "Admins can read their own admin record" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view site media" on storage.objects;
create policy "Public can view site media" on storage.objects
  for select to anon, authenticated using (bucket_id = 'site-media');
drop policy if exists "Admins can upload site media" on storage.objects;
create policy "Admins can upload site media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'site-media' and (select public.is_site_admin())
  );
drop policy if exists "Admins can update site media" on storage.objects;
create policy "Admins can update site media" on storage.objects
  for update to authenticated using (
    bucket_id = 'site-media' and (select public.is_site_admin())
  ) with check (bucket_id = 'site-media' and (select public.is_site_admin()));
drop policy if exists "Admins can delete site media" on storage.objects;
create policy "Admins can delete site media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'site-media' and (select public.is_site_admin())
  );

-- Valores padrão da seção de contato. Os campos ficam no JSON existente
-- site_content.home e podem ser alterados pelo painel sem nova tabela.
insert into public.site_content (section, content)
values (
  'home',
  jsonb_build_object(
    'contact_address', 'Rua Paraguaçu, 31 - Pico do Amor',
    'contact_postcode', '78065-085',
    'contact_city', 'Cuiabá',
    'contact_state', 'MT',
    'contact_phone_primary', '(65) 99967-6394',
    'contact_phone_secondary', '(65) 99984-8311',
    'contact_email', '',
    'contact_map_url', 'https://maps.app.goo.gl/KjGQ9RGixdeS3Ktf7'
  )
)
on conflict (section) do update set content =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  public.site_content.content,
                  '{contact_address}',
                  to_jsonb(coalesce(public.site_content.content->>'contact_address', 'Rua Paraguaçu, 31 - Pico do Amor')),
                  true
                ),
                '{contact_postcode}',
                to_jsonb(coalesce(public.site_content.content->>'contact_postcode', '78065-085')),
                true
              ),
              '{contact_city}',
              to_jsonb(coalesce(public.site_content.content->>'contact_city', 'Cuiabá')),
              true
            ),
            '{contact_state}',
            to_jsonb(coalesce(public.site_content.content->>'contact_state', 'MT')),
            true
          ),
          '{contact_phone_primary}',
          to_jsonb(coalesce(public.site_content.content->>'contact_phone_primary', '(65) 99967-6394')),
          true
        ),
        '{contact_phone_secondary}',
        to_jsonb(coalesce(public.site_content.content->>'contact_phone_secondary', '(65) 99984-8311')),
        true
      ),
      '{contact_email}',
      to_jsonb(coalesce(public.site_content.content->>'contact_email', '')),
      true
    ),
    '{contact_map_url}',
    to_jsonb(coalesce(public.site_content.content->>'contact_map_url', 'https://maps.app.goo.gl/KjGQ9RGixdeS3Ktf7')),
    true
  );

create table if not exists public.event_cities (
  id uuid primary key default gen_random_uuid(),
  event_name text not null default 'Encontro Estilo de Vida Canopus',
  city text not null,
  state text not null,
  starts_on date not null,
  ends_on date not null,
  venue text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_cities_dates_check check (ends_on >= starts_on)
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.event_cities(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 160),
  email text not null check (char_length(email) <= 254),
  phone text not null check (char_length(phone) <= 40),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  status text not null default 'registered'
    check (status in ('registered', 'confirmed', 'cancelled', 'attended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_cities_active_dates_idx
  on public.event_cities (active, starts_on);
create index if not exists event_registrations_event_created_idx
  on public.event_registrations (event_id, created_at desc);
create index if not exists event_registrations_name_idx
  on public.event_registrations (full_name);

alter table public.event_cities enable row level security;
alter table public.event_registrations enable row level security;

revoke all on public.event_cities from anon, authenticated;
grant select on public.event_cities to anon, authenticated;
grant insert, update, delete on public.event_cities to authenticated;

revoke all on public.event_registrations from anon, authenticated;
grant insert (event_id, full_name, email, phone, details)
  on public.event_registrations to anon, authenticated;
grant select, update on public.event_registrations to authenticated;

drop policy if exists "Public can read open event cities" on public.event_cities;
create policy "Public can read open event cities" on public.event_cities
  for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage event cities" on public.event_cities;
create policy "Admins manage event cities" on public.event_cities
  for all to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Public can submit registrations for open events" on public.event_registrations;
create policy "Public can submit registrations for open events" on public.event_registrations
  for insert to anon, authenticated with check (
    status = 'registered'
    and exists (
      select 1 from public.event_cities
      where id = event_id and active = true
    )
  );
drop policy if exists "Admins can read event registrations" on public.event_registrations;
create policy "Admins can read event registrations" on public.event_registrations
  for select to authenticated using ((select public.is_site_admin()));
drop policy if exists "Admins can update event registrations" on public.event_registrations;
create policy "Admins can update event registrations" on public.event_registrations
  for update to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));
