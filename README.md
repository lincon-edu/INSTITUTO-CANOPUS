# Instituto Canopus — site institucional e CMS beta

Site multipágina em HTML, CSS e JavaScript, preservado e complementado com painel administrativo estático. O conteúdo editável, autenticação e arquivos usam Supabase; o build Vite prepara os arquivos para GitHub Pages. Não há servidor próprio.

## Análise da estrutura original

- Framework: nenhum; o site original usa HTML, CSS e JavaScript puros.
- Páginas públicas: `index.html`, `quem-somos.html`, `noticias.html` e páginas estáticas `noticia-*.html`.
- Rotas reais do site estático: `/`, `/quem-somos.html` e `/noticias.html` (o menu chama esta página de Notícias; `/blog/` é um alias estático para `/noticias.html`).
- Componentes compartilhados: cabeçalho, navegação móvel e rodapé repetidos nas páginas; estilos em `css/style.css`; interações em `js/main.js`.
- Compatibilidade: Vite foi adicionado como empacotador multipágina e recebe base relativa para funcionar em subcaminho do GitHub Pages. Os endereços HTML existentes são mantidos. Notícias novas usam `noticia.html#slug`, sem exigir fallback de servidor.

## Instalação e execução

Requer Node.js 22 ou mais recente.

```sh
npm ci
npm run dev
```

O painel fica em `/admin/` (no Vite: `http://localhost:5173/admin/`). Gere e valide o site estático com:

```sh
npm run build
npm run preview
```

## Configuração do Supabase

1. Copie `.env.example` para `.env.local` e preencha as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores do projeto Supabase. O arquivo `.env.local` é ignorado pelo Git e não deve ser enviado ao repositório.
2. No SQL Editor do Supabase, confira as tabelas e políticas já existentes e execute `supabase/schema.sql`. O script cria as tabelas e índices necessários, habilita RLS e configura o bucket público `site-media` com escrita reservada a administradores.
3. Crie o primeiro usuário em **Authentication → Users** (mantenha o cadastro público desabilitado).
4. Copie o UUID desse usuário e execute no SQL Editor, substituindo o exemplo:

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID-DO-USUARIO-AUTORIZADO');
   ```

5. Em **Authentication → URL Configuration**, configure a URL do site publicado como Site URL e inclua as URLs locais e do GitHub Pages em Redirect URLs.

O navegador usa somente a chave anon/public; não configure nem inclua `service_role` no frontend. A autorização é conferida por `is_site_admin()` e reforçada pelas políticas do banco. `.env.local` e `node_modules/` não são versionados.

### Tabelas e mídia

O script cria `site_content`, `news`, `team_members`, `projects` e `admin_users` com UUIDs e RLS. Se `team_members` estiver vazia, importa os quatro integrantes que já aparecem na página atual, sem duplicá-los em execuções posteriores. Notícias têm status `draft`/`published`; o site público só consulta publicadas. `news.gallery_urls` guarda os endereços de várias fotos por notícia. Integrantes e projetos são desativados logicamente. Imagens JPG, PNG, WebP e GIF de até 5 MB são enviadas com nomes únicos a `site-media/{banners,noticias,equipe,projetos,galeria}/`; as tabelas guardam URLs, nunca arquivos binários.

Projetos usam `subtitle`, `description` e `details` para separar subtítulo, texto principal e informações complementares, além de `logo_url`, `image_url`, `image_position`, `ods` e `ods_color`. A posição da imagem circular pode ser lateral (esquerda/direita) ou inferior (esquerda/direita); as informações complementares aparecem junto à imagem e aceitam uma linha por item. Os selos usam ícones ODS coloridos em português, do repositório [SDGs](https://github.com/joaomlourenco/SDGs), licença CC0 1.0. O editor aplica a tipografia pública, oferece cores predefinidas e ajusta o trecho selecionado em passos de 1 px com A+ e A-. `ods_color` controla a cor da aba. Execute novamente `supabase/schema.sql` para adicionar as colunas novas; projetos existentes recebem subtítulo e informações complementares vazios, que podem ser preenchidos ao editar o projeto.

Revise qualquer tabela, política ou bucket existente antes de rodar o script em um projeto Supabase que já contenha dados. O SQL é idempotente para as estruturas e políticas nomeadas neste arquivo, mas não remove políticas legadas com outros nomes.

## Painel

O menu público oferece **Inscreva-se** e o acesso **Entrar** (ou **Painel** quando há uma sessão ativa), na mesma aparência dos demais links e também no menu móvel. O painel oferece login Supabase Auth, dashboard, edição dos textos/imagens da inicial e de Quem Somos com prévias ao vivo, CRUD de notícias com editor formatado, gerenciamento de integrantes e projetos, galeria e inscrições para retiros. A área de eventos permite cadastrar e editar eventos por cidade e encerrar ou reabrir inscrições sem apagar o histórico. As inscrições são agrupadas por evento, podem ser filtradas e ter a situação atualizada; fichas individuais e seleções de participantes podem ser exportadas para Excel. O formulário público coleta dados pessoais, contato, endereço, emergência, alimentação, saúde e acessibilidade.

No editor da página inicial, adicione quantas imagens de banner forem necessárias, envie arquivos ou informe URLs, confira as prévias e altere a ordem. Cada slide tem título e subtítulo opcionais, que acompanham a imagem; o site alterna os slides automaticamente a cada seis segundos e também oferece setas e marcadores. As imagens e textos de cada slide ficam em `site_content.content.slides` (JSONB), sem migração de banco. Projetos novos são exibidos em abas no mesmo painel de projetos da página inicial; cada um pode ter logo PNG, imagem circular, selos ODS, cor personalizada e conteúdo com negrito, cor e tamanho de fonte por seleção. Notícias, integrantes, projetos e arquivos da galeria podem ser excluídos com confirmação; integrantes/projetos também podem ser desativados sem exclusão definitiva.

Notícias publicadas no painel aparecem no destaque e no blog; rascunhos não são expostos. A lista do blog reproduz o banner e o feed em cartões, com filtros ligados às categorias do formulário, definidas em `js/news-categories.js`. O editor aceita parágrafos, negrito, itálico, títulos, listas, links e imagens por URL. A galeria permite selecionar várias fotos ou adicionar URLs, conferir/remover imagens na prévia e publicá-las abaixo do texto; a galeria pública abre em visualizador com navegação. A página do artigo usa fundo branco, o detalhe gráfico Canopus na lateral esquerda, sem moldura decorativa, exibe três posts recentes e corações para curtir/descurtir. As curtidas ficam salvas localmente no navegador do visitante, sem contagem compartilhada entre dispositivos. Conteúdo HTML passa por uma lista de elementos permitidos antes de ser salvo/exibido. As notícias antigas em arquivos HTML continuam disponíveis e são mantidas como arquivo visual; o CMS não migra seus textos para o banco.

## GitHub Pages

O workflow `.github/workflows/pages.yml` compila e publica a pasta `dist` em push para `main` ou por execução manual. Na primeira execução, ele tenta habilitar o GitHub Pages usando GitHub Actions; se a política do repositório impedir, selecione **Settings → Pages → Build and deployment → GitHub Actions**. O site publicado no GitHub Pages fica acessível publicamente. Configure no repositório, em **Settings → Secrets and variables → Actions**, os secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Se a branch de publicação não for `main`, ajuste o gatilho do workflow. Em **Settings → Pages**, selecione **GitHub Actions** como origem. O Vite usa caminhos relativos para suportar publicação em subdiretórios.

## Estrutura adicionada

```text
admin/index.html             Painel e login
js/admin.js                  Autenticação, CRUD, editor e upload
js/site-cms.js               Integração do conteúdo público
js/ods.js                    Renderização compartilhada dos selos ODS
js/supabase.js               Cliente, validação de imagens e HTML
supabase/schema.sql          Tabelas, RLS, índices e Storage
noticia.html                 Página estática para artigos novos por slug
vite.config.js               Build multipágina para GitHub Pages
```

## Limites e testes

O build local verifica empacotamento e referências estáticas. Login, políticas RLS, operações CRUD e Storage exigem aplicar o SQL e configurar Auth/Storage no Supabase; não são simulados nem podem ser confirmados sem acesso ao projeto e um usuário administrador. O funcionamento do carrossel, seus controles, temporização automática e a edição/reordenação/remoção de slides podem ser verificados no navegador local.

---
Fotos, textos e marcas pertencem ao Instituto Canopus.
