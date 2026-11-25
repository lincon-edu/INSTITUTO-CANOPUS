import { isSupabaseConfigured, safeRichHtml, supabase, validateSupabaseApiKey } from "./supabase.js";
import { renderOds } from "./ods.js";
import { NEWS_CATEGORIES } from "./news-categories.js";

let activeNewsCategory = "all";

function safeMediaUrl(url) {
  return /^(https?:\/\/|\/|\.\/|assets\/)/i.test(url || "");
}

function showImage(element, url) {
  if (element && safeMediaUrl(url)) element.src = url;
}

function renderHeroSlides(slides, fallback = {}) {
  const hero = document.querySelector(".hero");
  const template = hero?.querySelector(".hero-slide");
  if (!hero || !template || !Array.isArray(slides)) return;

  const validSlides = slides.filter((slide) => slide && safeMediaUrl(slide.image_url));
  if (!validSlides.length) return;

  const fallbackTitle = typeof fallback?.hero_title === "string" ? fallback.hero_title : "";
  const fallbackSubtitle = typeof fallback?.hero_subtitle === "string" ? fallback.hero_subtitle : "";
  const fragment = document.createDocumentFragment();
  validSlides.forEach((slide, index) => {
    const element = template.cloneNode(true);
    element.classList.toggle("is-active", index === 0);
    const image = element.querySelector("img");
    image.src = slide.image_url;
    image.alt = typeof slide.alt === "string" ? slide.alt : image.alt;
    const title = typeof slide.title === "string" ? slide.title : fallbackTitle;
    const subtitle = typeof slide.subtitle === "string" ? slide.subtitle : fallbackSubtitle;
    const titleElement = element.querySelector(".hero-title");
    const subtitleElement = element.querySelector(".hero-text");
    titleElement.textContent = title;
    titleElement.hidden = !title.trim();
    subtitleElement.querySelector("span").textContent = subtitle;
    subtitleElement.hidden = !subtitle.trim();
    fragment.append(element);
  });
  hero.querySelectorAll(".hero-slide").forEach((slide) => slide.remove());
  hero.insertBefore(fragment, hero.firstChild);
  document.dispatchEvent(new Event("cms:hero-updated"));
}

function applyContent(section, content) {
  Object.entries(content || {}).forEach(([key, value]) => {
    const element = key === "button_url" && section === "home"
      ? document.querySelector('[data-cms="home.button_text"]')
      : document.querySelector(`[data-cms="${section}.${key}"]`);
    if (!element || typeof value !== "string") return;
    if (element instanceof HTMLImageElement) showImage(element, value);
    else if (element instanceof HTMLUListElement) {
      element.replaceChildren(...value.split(/\r?\n/).filter(Boolean).map((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        return item;
      }));
    } else if (element instanceof HTMLAnchorElement && key.endsWith("_url")) {
      if (/^(https?:\/\/|\/|#|\.\/)/i.test(value)) element.href = value;
    }
    else element.textContent = value;
    if (element instanceof HTMLAnchorElement && key === "button_text" && value.trim()) element.hidden = false;
  });
  if (section === "home") {
    const address = typeof content?.contact_address === "string" && content.contact_address.trim()
      ? content.contact_address.trim()
      : "Rua Paraguaçu, 31 - Pico do Amor";
    const city = typeof content?.contact_city === "string" && content.contact_city.trim()
      ? content.contact_city.trim()
      : "Cuiabá";
    const state = typeof content?.contact_state === "string" && content.contact_state.trim()
      ? content.contact_state.trim()
      : "MT";
    const postcode = typeof content?.contact_postcode === "string" && content.contact_postcode.trim()
      ? content.contact_postcode.trim()
      : "78065-085";
    const mapUrl = typeof content?.contact_map_url === "string" && /^https?:\/\//i.test(content.contact_map_url)
      ? content.contact_map_url
      : "https://maps.app.goo.gl/KjGQ9RGixdeS3Ktf7";
    const addressLink = document.querySelector("[data-contact-address]");
    if (addressLink) {
      addressLink.href = mapUrl;
      addressLink.textContent = address;
    }
    const cityElement = document.querySelector('[data-cms="home.contact_city"]');
    const stateElement = document.querySelector('[data-cms="home.contact_state"]');
    const postcodeElement = document.querySelector('[data-cms="home.contact_postcode"]');
    if (cityElement) cityElement.textContent = city;
    if (stateElement) stateElement.textContent = state;
    if (postcodeElement) postcodeElement.textContent = postcode;

    const primary = typeof content?.contact_phone_primary === "string" ? content.contact_phone_primary.trim() : "(65) 99967-6394";
    const secondary = typeof content?.contact_phone_secondary === "string" ? content.contact_phone_secondary.trim() : "(65) 99984-8311";
    const primaryLink = document.querySelector("[data-contact-phone-primary]");
    const secondaryLink = document.querySelector("[data-contact-phone-secondary]");
    if (primaryLink) {
      primaryLink.textContent = primary;
      primaryLink.hidden = !primary;
      primaryLink.href = primary ? `tel:+55${primary.replace(/\D/g, "")}` : "#";
    }
    if (secondaryLink) {
      secondaryLink.textContent = secondary;
      secondaryLink.hidden = !secondary;
      secondaryLink.href = secondary ? `tel:+55${secondary.replace(/\D/g, "")}` : "#";
    }
    const email = typeof content?.contact_email === "string" ? content.contact_email.trim() : "";
    const emailLink = document.querySelector("[data-contact-email]");
    const emailWrap = document.querySelector("[data-contact-email-wrap]");
    if (emailLink) {
      emailLink.textContent = email;
      emailLink.href = email ? `mailto:${email}` : "#";
    }
    if (emailWrap) emailWrap.hidden = !email;

    const mapFrame = document.querySelector("[data-contact-map]");
    if (mapFrame) {
      const query = `${address}, ${city} - ${state}, CEP ${postcode}`;
      mapFrame.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    }

    const slides = Array.isArray(content?.slides)
      ? content.slides
      : content?.hero_image
        ? [{ image_url: content.hero_image }]
        : [];
    renderHeroSlides(slides, content);
  }
}

function addLoginLink() {
  const nav = document.querySelector(".main-nav ul");
  if (!nav || nav.querySelector(".login-nav-item")) return;
  const item = document.createElement("li");
  item.className = "login-nav-item";
  const link = document.createElement("a");
  link.href = "admin/index.html";
  link.className = "login-nav-link";
  link.textContent = "Entrar";
  item.append(link);
  nav.append(item);

  if (!isSupabaseConfigured) return;
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Não foi possível verificar a sessão do Supabase:", error);
      return;
    }
    link.textContent = data.session ? "Painel" : "Entrar";
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    link.textContent = session ? "Painel" : "Entrar";
  });
}

function renderTeam(members) {
  const grid = document.querySelector(".team-grid");
  if (!grid) return;
  grid.replaceChildren();
  members.forEach((member) => {
    const card = document.createElement("article");
    card.className = "team-card";
    const image = document.createElement("img");
    image.src = safeMediaUrl(member.photo_url) ? member.photo_url : "assets/img/logos/simbolo.png";
    image.alt = member.name;
    image.loading = "lazy";
    const role = document.createElement("p");
    role.className = "role";
    role.textContent = member.role;
    const name = document.createElement("p");
    name.className = "name";
    name.textContent = member.name;
    card.append(image, role, name);
    if (member.email) {
      const email = document.createElement("a");
      email.href = `mailto:${member.email}?subject=CONTATO%20DO%20SITE`;
      email.textContent = "EMAIL";
      card.append(email);
    }
    grid.append(card);
  });
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(value));
}

function normalizeCategory(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function applyNewsCategoryFilter() {
  const selected = normalizeCategory(activeNewsCategory);
  document.querySelectorAll(".news-list .post-grid > .post-card").forEach((card) => {
    const category = normalizeCategory(card.dataset.category);
    card.hidden = selected !== "all" && category !== selected;
  });
}

function initializeNewsCategoryFilter() {
  const nav = document.querySelector("#news-category-filter");
  if (!nav) return;
  const categories = [["all", "All Posts"], ...NEWS_CATEGORIES.map((category) => [category, category])];
  const visibleCategories = categories.slice(0, 5);
  const additionalCategories = categories.slice(5);

  const createFilterButton = ([value, label], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.newsFilter = value;
    button.setAttribute("aria-pressed", String(index === 0));
    button.addEventListener("click", () => {
      activeNewsCategory = value;
      nav.querySelectorAll("[data-news-filter]").forEach((filter) => {
        filter.setAttribute("aria-pressed", String(filter === button));
      });
      applyNewsCategoryFilter();
      const more = nav.querySelector(".blog-category-more");
      if (more) {
        more.querySelector(".blog-category-more-toggle").setAttribute("aria-expanded", "false");
        more.querySelector(".blog-category-more-menu").hidden = true;
      }
    });
    return button;
  };

  const visibleButtons = visibleCategories.map(createFilterButton);
  if (!additionalCategories.length) {
    nav.replaceChildren(...visibleButtons);
    return;
  }

  const more = document.createElement("div");
  more.className = "blog-category-more";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "blog-category-more-toggle";
  toggle.textContent = "Mais";
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "blog-category-more-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Mais categorias");
  menu.hidden = true;
  menu.append(...additionalCategories.map((category, index) =>
    createFilterButton(category, visibleCategories.length + index)
  ));
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    menu.hidden = !expanded;
  });
  more.append(toggle, menu);
  nav.replaceChildren(...visibleButtons, more);
  nav.addEventListener("click", (event) => {
    if (!more.contains(event.target)) {
      toggle.setAttribute("aria-expanded", "false");
      menu.hidden = true;
    }
  });
  nav.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      toggle.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      toggle.focus();
    }
  });
}

function createNewsCard(news) {
  const link = document.createElement("a");
  link.className = "post-card";
  link.dataset.category = news.category || "";
  link.href = `noticia.html#${encodeURIComponent(news.slug)}`;
  const image = document.createElement("img");
  image.src = safeMediaUrl(news.cover_url) ? news.cover_url : "assets/img/logos/simbolo.png";
  image.alt = "";
  image.loading = "lazy";
  const content = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = news.title;
  const excerpt = document.createElement("p");
  excerpt.className = "post-excerpt";
  excerpt.textContent = news.excerpt || "";
  const date = document.createElement("span");
  date.className = "post-date";
  date.textContent = formatDate(news.published_at);
  content.append(title, excerpt, date);
  link.append(image, content);
  return link;
}

function createRecentPostCard(news) {
  const card = document.createElement("article");
  card.className = "recent-post-card";
  const link = document.createElement("a");
  link.className = "recent-post-link";
  link.href = `noticia.html#${encodeURIComponent(news.slug)}`;
  const image = document.createElement("img");
  image.src = safeMediaUrl(news.cover_url) ? news.cover_url : "assets/img/logos/simbolo.png";
  image.alt = "";
  image.loading = "lazy";
  const title = document.createElement("h3");
  title.textContent = news.title;
  const date = document.createElement("span");
  date.className = "post-date";
  date.textContent = formatDate(news.published_at);
  link.append(image, title, date);
  const like = document.createElement("button");
  like.type = "button";
  like.className = "news-like-button";
  like.dataset.newsLike = "recent";
  like.dataset.newsSlug = news.slug;
  like.setAttribute("aria-label", "Curtir notícia");
  like.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
  card.append(link, like);
  return card;
}

function renderNewsGallery(urls) {
  const gallery = document.querySelector("[data-news-gallery]");
  if (!gallery) return;
  gallery.replaceChildren();
  (Array.isArray(urls) ? urls : []).filter(safeMediaUrl).forEach((url, index) => {
    const link = document.createElement("a");
    link.href = url;
    const image = document.createElement("img");
    image.src = url;
    image.alt = `Foto ${index + 1} da notícia`;
    image.loading = "lazy";
    link.append(image);
    gallery.append(link);
  });
}

function renderRecentNews(newsList) {
  const grid = document.querySelector(".related .post-grid");
  if (!grid || !newsList.length) return;
  grid.replaceChildren(...newsList.map(createRecentPostCard));
}

function renderNews(newsList) {
  if (!newsList.length) return;
  const featured = document.querySelector(".news .post-featured");
  const grid = document.querySelector(".news .post-grid");
  if (!grid) return;

  if (featured) {
    const first = newsList[0];
    featured.href = `noticia.html#${encodeURIComponent(first.slug)}`;
    featured.querySelector("img").src = safeMediaUrl(first.cover_url) ? first.cover_url : "assets/img/logos/simbolo.png";
    featured.querySelector("img").alt = first.title;
    featured.querySelector(".post-date").textContent = formatDate(first.published_at);
    featured.querySelector("h3").textContent = first.title;
    featured.querySelector(".body p").textContent = first.excerpt;
    featured.dataset.category = first.category || "";
  }
  const legacyCards = [...grid.querySelectorAll(".post-card")].filter((card) => !card.href.includes("noticia.html#"));
  grid.replaceChildren(...newsList.slice(featured ? 1 : 0).map(createNewsCard), ...legacyCards);
  applyNewsCategoryFilter();
}

function renderProjects(projects) {
  const tabs = document.querySelector(".tabs");
  const tabList = tabs?.querySelector('[role="tablist"]');
  if (!tabs || !tabList) return;
  tabs.querySelectorAll("[data-cms-project]").forEach((element) => element.remove());

  projects.forEach((project) => {
    const safeId = String(project.id).replace(/[^a-zA-Z0-9_-]/g, "");
    const tabId = `tab-project-${safeId}`;
    const panelId = `projeto-cms-${safeId}`;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.id = tabId;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panelId);
    tab.textContent = project.title;
    tab.dataset.cmsProject = "";
    if (/^#[0-9a-f]{6}$/i.test(project.ods_color || "")) {
      tab.style.setProperty("--tab-cor", project.ods_color);
    }

    const panel = document.createElement("div");
    panel.className = "tabpanel";
    panel.id = panelId;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tabId);
    panel.dataset.cmsProject = "";
    panel.hidden = true;

    const imagePosition = ["right", "left", "bottom-left", "bottom-right"].includes(project.image_position)
      ? project.image_position
      : "right";
    const header = document.createElement("div");
    header.className = "tabpanel-head";
    const title = document.createElement("h3");
    title.textContent = project.title;
    header.append(title);
    if (safeMediaUrl(project.logo_url)) {
      const logo = document.createElement("img");
      logo.src = project.logo_url;
      logo.alt = `Logo ${project.title}`;
      logo.className = "project-logo";
      logo.loading = "lazy";
      header.append(logo);
    }
    panel.append(header);

    if (project.subtitle?.trim()) {
      const subtitle = document.createElement("p");
      subtitle.className = "lead project-subtitle";
      subtitle.textContent = project.subtitle;
      panel.append(subtitle);
    }

    const description = document.createElement("div");
    description.className = "project-rich-content";
    description.innerHTML = safeRichHtml(project.description);
    const hasDetails = Boolean(project.details?.trim());
    const hasImage = safeMediaUrl(project.image_url);
    const createProjectImage = () => {
      const image = document.createElement("img");
      image.className = "circle-img";
      image.src = project.image_url;
      image.alt = `Imagem do projeto ${project.title}`;
      image.loading = "lazy";
      return image;
    };
    if (hasDetails) {
      panel.append(description);
      const details = document.createElement("p");
      details.className = "project-info info destaque";
      details.textContent = project.details;
      if (hasImage) {
        const columns = document.createElement("div");
        columns.className = `tabpanel-cols project-image-position--${imagePosition}`;
        columns.append(details, createProjectImage());
        panel.append(columns);
      } else {
        panel.append(details);
      }
    } else if (hasImage && ["right", "left"].includes(imagePosition)) {
      const columns = document.createElement("div");
      columns.className = `tabpanel-cols project-image-position--${imagePosition}`;
      columns.append(description, createProjectImage());
      panel.append(columns);
    } else {
      panel.append(description);
      if (hasImage) {
        const columns = document.createElement("div");
        columns.className = `tabpanel-cols project-image-position--${imagePosition}`;
        columns.append(createProjectImage());
        panel.append(columns);
      }
    }

    if (Array.isArray(project.ods) && project.ods.length) {
      const ods = document.createElement("ul");
      ods.className = "ods";
      renderOds(ods, project.ods);
      panel.append(ods);
    }
    tabList.append(tab);
    tabs.append(panel);
  });
  document.dispatchEvent(new Event("cms:projects-updated"));
}

async function loadContent(section) {
  const { data, error } = await supabase.from("site_content").select("content").eq("section", section).maybeSingle();
  if (error) throw error;
  applyContent(section, data?.content);
}

async function loadPublishedNewsBySlug(slug) {
  const { data, error } = await supabase.from("news")
    .select("title,excerpt,body,cover_url,gallery_urls,category,published_at")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  if (!error) return data;
  if (error.code !== "42703" || !error.message.includes("gallery_urls")) throw error;

  const legacyResult = await supabase.from("news")
    .select("title,excerpt,body,cover_url,category,published_at")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data ? { ...legacyResult.data, gallery_urls: [] } : null;
}

async function loadPublicContent() {
  const jobs = [];
  if (document.querySelector('[data-cms^="home."]')) jobs.push(loadContent("home"));
  if (document.querySelector('[data-cms^="about."]')) jobs.push(loadContent("about"));

  if (document.querySelector(".team-grid")) {
    jobs.push(supabase.from("team_members").select("name,role,email,photo_url,sort_order")
      .eq("active", true).order("sort_order").then(({ data, error }) => {
        if (error) throw error;
        if (data?.length) renderTeam(data);
      }));
  }
  if (document.querySelector(".news .post-grid")) {
    jobs.push(supabase.from("news").select("title,slug,excerpt,cover_url,category,published_at")
      .eq("status", "published").order("published_at", { ascending: false }).then(({ data, error }) => {
        if (error) throw error;
        if (data?.length) renderNews(data);
      }));
  }
  if (document.querySelector(".tabs [role='tablist']")) {
    jobs.push(supabase.from("projects").select("id,title,subtitle,description,details,image_url,image_position,logo_url,ods,ods_color")
      .eq("active", true).order("sort_order").then(({ data, error }) => {
        if (error) throw error;
        renderProjects(data || []);
      }));
  }
  if (document.querySelector(".article-card[data-cms-news]")) {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (!slug) {
      document.querySelector(".article-body").textContent = "Selecione uma notícia no blog.";
    } else {
      jobs.push(loadPublishedNewsBySlug(slug).then((data) => {
          if (!data) {
            document.querySelector(".article-body").textContent = "Notícia não encontrada.";
            return;
          }
          document.title = `${data.title} | Instituto Canopus`;
          const cover = document.querySelector(".article-cover");
          cover.hidden = !safeMediaUrl(data.cover_url);
          if (!cover.hidden) cover.src = data.cover_url;
          cover.alt = data.title;
          document.querySelector(".article-body .post-date").textContent = formatDate(data.published_at);
          document.querySelector(".article-body h1").textContent = data.title;
          document.querySelector(".article-content").innerHTML = safeRichHtml(data.body);
          const like = document.querySelector("[data-news-like='article']");
          if (like) like.dataset.newsSlug = slug;
          renderNewsGallery(data.gallery_urls);
          document.dispatchEvent(new Event("cms:news-updated"));
        }));
      jobs.push(supabase.from("news").select("title,slug,cover_url,published_at")
        .eq("status", "published").neq("slug", slug)
        .order("published_at", { ascending: false }).limit(3)
        .then(({ data, error }) => {
          if (error) throw error;
          renderRecentNews(data || []);
          document.dispatchEvent(new Event("cms:news-updated"));
        }));
    }
  }
  const results = await Promise.allSettled(jobs);
  results.filter((result) => result.status === "rejected").forEach((result) => {
    console.error("Não foi possível carregar conteúdo público do Supabase:", result.reason);
  });
}

export function initializePublicContent() {
  initializeNewsCategoryFilter();
  addLoginLink();
  if (!isSupabaseConfigured) return;
  validateSupabaseApiKey()
    .then(() => loadPublicContent())
    .catch((error) => {
      if (error.message !== "Invalid API key") {
        console.error("Falha ao carregar o conteúdo do site:", error);
      }
    });
}
