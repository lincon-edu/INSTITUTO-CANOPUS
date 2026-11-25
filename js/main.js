/* ==========================================================================
   Instituto Canopus — scripts do site
   Tudo aqui é JavaScript puro (sem bibliotecas).
   ========================================================================== */
import { initializePublicContent } from "./site-cms.js";
import { renderOds } from "./ods.js";

initializePublicContent();

/* Selos ODS: nome curto de cada Objetivo e sua cor oficial.
   Para mostrar selos num projeto, use no HTML: <ul class="ods" data-ods="3,5,8"></ul> */
document.querySelectorAll(".ods[data-ods]").forEach((list) => {
  renderOds(list, list.dataset.ods);
});

/* Menu do celular */
const header = document.querySelector(".site-header");
const toggle = document.querySelector(".menu-toggle");
const mainNav = header?.querySelector(".main-nav ul");
if (mainNav && !mainNav.querySelector(".signup-nav-item")) {
  const item = document.createElement("li");
  item.className = "signup-nav-item";
  const link = document.createElement("a");
  link.href = "inscreva-se.html";
  link.className = "signup-nav-link";
  link.textContent = "Inscreva-se";
  item.append(link);
  mainNav.insertBefore(item, mainNav.querySelector(".login-nav-item"));
}
if (toggle && header) {
  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  header.querySelectorAll(".main-nav a").forEach((a) =>
    a.addEventListener("click", () => {
      header.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

/* Cabeçalho reage à direção da rolagem sem processar o scroll a cada frame. */
if (header) {
  let lastScrollY = window.scrollY;
  let scrollFrame = 0;
  const scrollThreshold = 8;
  const blogBanner = document.querySelector(".blog-banner");
  const blogBannerImage = blogBanner?.querySelector("img");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateBlogBanner = () => {
    if (!blogBanner || !blogBannerImage) return;
    if (reducedMotion.matches) {
      blogBannerImage.style.opacity = "1";
      return;
    }
    const height = blogBanner.getBoundingClientRect().height;
    const distanceScrolled = height - blogBanner.getBoundingClientRect().bottom;
    const fadeProgress = Math.min(1, Math.max(0, distanceScrolled / height));
    blogBannerImage.style.opacity = String(1 - fadeProgress);
  };
  const updateHeader = () => {
    const currentScrollY = window.scrollY;
    const difference = currentScrollY - lastScrollY;
    if (currentScrollY <= 24) {
      header.classList.remove("is-hidden");
    } else if (Math.abs(difference) >= scrollThreshold) {
      header.classList.toggle("is-hidden", difference > 0);
    }
    updateBlogBanner();
    lastScrollY = currentScrollY;
    scrollFrame = 0;
  };
  updateBlogBanner();
  window.addEventListener("scroll", () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateHeader);
  }, { passive: true });
  window.addEventListener("resize", updateBlogBanner);
}

/* Reinitialize after Supabase replaces the homepage slides. */
let cleanupHeroSlider = () => {};
function initializeHeroSlider() {
  cleanupHeroSlider();
  const hero = document.querySelector(".hero");
  if (!hero) return;
  const slides = [...hero.querySelectorAll(".hero-slide")];
  const dotsWrap = hero.querySelector(".hero-dots");
  const previous = hero.querySelector(".hero-prev");
  const next = hero.querySelector(".hero-next");
  if (!slides.length || !dotsWrap) return;

  let current = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
  let timer;
  const dots = slides.map((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Ir para o slide ${index + 1}`);
    button.addEventListener("click", () => go(index, true));
    dotsWrap.append(button);
    return button;
  });

  function go(index, user = false) {
    const nextIndex = (index + slides.length) % slides.length;
    if (nextIndex === current) return;
    const outgoing = slides[current];
    const incoming = slides[nextIndex];
    const forward = nextIndex === (current + 1) % slides.length;
    outgoing.classList.remove("is-active");
    outgoing.classList.add(forward ? "is-outgoing-next" : "is-outgoing-prev");
    incoming.classList.remove("is-entering-next", "is-entering-prev");
    incoming.classList.add(forward ? "is-entering-next" : "is-entering-prev");
    incoming.classList.add("is-active");
    dots[current].classList.remove("is-active");
    dots[nextIndex].classList.add("is-active");
    const outgoingSlide = outgoing;
    window.setTimeout(() => {
      outgoingSlide.classList.remove("is-outgoing-next", "is-outgoing-prev");
      incoming.classList.remove("is-entering-next", "is-entering-prev");
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900);
    current = nextIndex;
    if (user) restart();
  }
  function restart() {
    clearInterval(timer);
    if (slides.length > 1) timer = setInterval(() => go(current + 1), 6000);
  }
  const onPrevious = () => go(current - 1, true);
  const onNext = () => go(current + 1, true);
  previous?.addEventListener("click", onPrevious);
  next?.addEventListener("click", onNext);
  hero.classList.toggle("single", slides.length <= 1);
  go(current);
  restart();

  cleanupHeroSlider = () => {
    clearInterval(timer);
    previous?.removeEventListener("click", onPrevious);
    next?.removeEventListener("click", onNext);
    dotsWrap.replaceChildren();
  };
}
initializeHeroSlider();
document.addEventListener("cms:hero-updated", initializeHeroSlider);

/* Reinitialize project tabs after CMS projects are added. */
const tabCleanups = new WeakMap();
function initializeProjectTabs(tabs) {
  tabCleanups.get(tabs)?.();
  const tabButtons = [...tabs.querySelectorAll('[role="tab"]')];
  const list = tabs.querySelector(".tablist");
  const scrollBtn = tabs.querySelector(".tab-scroll");
  if (!tabButtons.length || !list) return;
  const listeners = [];

  function select(tab, focus) {
    tabButtons.forEach((button) => {
      const active = button === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById(button.getAttribute("aria-controls")).hidden = !active;
    });
    if (focus) tab.focus();
    if (tab.offsetLeft < list.scrollLeft || tab.offsetLeft + tab.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = tab.offsetLeft - 20;
    }
  }

  tabButtons.forEach((button, index) => {
    const onClick = () => select(button);
    const onKeydown = (event) => {
      if (event.key === "ArrowRight") select(tabButtons[(index + 1) % tabButtons.length], true);
      if (event.key === "ArrowLeft") select(tabButtons[(index - 1 + tabButtons.length) % tabButtons.length], true);
    };
    button.addEventListener("click", onClick);
    button.addEventListener("keydown", onKeydown);
    listeners.push(() => {
      button.removeEventListener("click", onClick);
      button.removeEventListener("keydown", onKeydown);
    });
  });

  const fromHash = tabButtons.find((button) => `#${button.getAttribute("aria-controls")}` === location.hash);
  const previouslySelected = tabButtons.find((button) => button.getAttribute("aria-selected") === "true");
  select(fromHash || previouslySelected || tabButtons[0]);
  if (fromHash) setTimeout(() => tabs.closest("section").scrollIntoView(), 50);

  function updateScroll() {
    if (scrollBtn) scrollBtn.hidden = list.scrollLeft + list.clientWidth >= list.scrollWidth - 4;
  }
  const onScrollClick = () => { list.scrollLeft += 220; };
  scrollBtn?.addEventListener("click", onScrollClick);
  list.addEventListener("scroll", updateScroll);
  window.addEventListener("resize", updateScroll);
  updateScroll();

  tabCleanups.set(tabs, () => {
    listeners.forEach((removeListener) => removeListener());
    scrollBtn?.removeEventListener("click", onScrollClick);
    list.removeEventListener("scroll", updateScroll);
    window.removeEventListener("resize", updateScroll);
  });
}
document.querySelectorAll(".tabs").forEach(initializeProjectTabs);
document.addEventListener("cms:projects-updated", () => {
  document.querySelectorAll(".tabs").forEach(initializeProjectTabs);
});

/* Formulário de contato.
   - Sem configuração: mostra a mensagem de agradecimento (não envia nada).
   - Para receber as mensagens por e-mail, crie um formulário grátis em
     https://formspree.io e coloque o endereço dele no atributo action do <form>.
     Ex.: <form action="https://formspree.io/f/abcdwxyz" ...> */
document.querySelectorAll(".contact-form").forEach((form) => {
  const status = form.querySelector(".form-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const action = form.getAttribute("action") || "";
    const show = (msg) => { status.textContent = msg; status.hidden = false; };
    if (!action || action === "#") {
      show("Obrigado(a)! Sua mensagem foi registrada.");
      form.reset();
      return;
    }
    try {
      const res = await fetch(action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error();
      show("Obrigado(a)! Recebemos sua mensagem e entraremos em contato em breve.");
      form.reset();
    } catch {
      show("Não foi possível enviar agora. Tente novamente ou fale conosco pelo telefone.");
    }
  });
});

/* Galeria de fotos das notícias (incluindo as galerias carregadas pelo CMS). */
let activeGalleryLinks = [];
let activeGalleryIndex = 0;
const hasNewsGallery = document.querySelector(".gallery");
let lightbox;
if (hasNewsGallery) {
  lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Galeria de fotos");
  lightbox.hidden = true;
  lightbox.innerHTML = `<button class="lb-close" type="button" aria-label="Fechar">&times;</button>
    <button class="lb-prev" type="button" aria-label="Foto anterior">&#8249;</button>
    <img alt="">
    <button class="lb-next" type="button" aria-label="Próxima foto">&#8250;</button>`;
  document.body.appendChild(lightbox);
  const image = lightbox.querySelector("img");
  const close = () => { lightbox.hidden = true; };
  const show = (index) => {
    if (!activeGalleryLinks.length) return;
    activeGalleryIndex = (index + activeGalleryLinks.length) % activeGalleryLinks.length;
    const link = activeGalleryLinks[activeGalleryIndex];
    image.src = link.href;
    image.alt = link.querySelector("img")?.alt || "";
    lightbox.hidden = false;
  };
  lightbox.querySelector(".lb-close").addEventListener("click", close);
  lightbox.querySelector(".lb-prev").addEventListener("click", () => show(activeGalleryIndex - 1));
  lightbox.querySelector(".lb-next").addEventListener("click", () => show(activeGalleryIndex + 1));
  lightbox.addEventListener("click", (event) => { if (event.target === lightbox) close(); });
  document.addEventListener("click", (event) => {
    const link = event.target.closest(".gallery a");
    if (!link) return;
    event.preventDefault();
    activeGalleryLinks = [...link.closest(".gallery").querySelectorAll("a")];
    show(activeGalleryLinks.indexOf(link));
  });
  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowRight") show(activeGalleryIndex + 1);
    if (event.key === "ArrowLeft") show(activeGalleryIndex - 1);
  });
}

/* Likes ficam associados ao navegador para que o visitante possa marcar/desmarcar. */
const newsLikesStorageKey = "canopus-news-likes-v1";
const likedNews = new Set();
try {
  const savedLikes = JSON.parse(localStorage.getItem(newsLikesStorageKey) || "[]");
  if (Array.isArray(savedLikes)) savedLikes.forEach((slug) => {
    if (typeof slug === "string") likedNews.add(slug);
  });
} catch (error) {
  console.error("Não foi possível carregar as curtidas salvas neste navegador:", error);
}

function createNewsLikeButton(slug, kind) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "news-like-button";
  button.dataset.newsLike = kind;
  button.dataset.newsSlug = slug;
  button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
  return button;
}

function syncNewsLikeButtons() {
  document.querySelectorAll("[data-news-like]").forEach((button) => {
    const slug = button.dataset.newsSlug;
    const isLiked = Boolean(slug && likedNews.has(slug));
    button.classList.toggle("is-liked", isLiked);
    button.setAttribute("aria-pressed", String(isLiked));
    button.setAttribute("aria-label", isLiked ? "Descurtir notícia" : "Curtir notícia");
    button.title = isLiked ? "Descurtir notícia" : "Curtir notícia";
  });
}

function initializeArticleLikes() {
  const articleCard = document.querySelector(".article-card");
  if (articleCard) {
    const articleSlug = location.hash
      ? decodeURIComponent(location.hash.slice(1))
      : location.pathname.split("/").pop().replace(/\.html$/, "");
    let button = articleCard.querySelector('[data-news-like="article"]');
    if (!button) {
      const actions = document.createElement("div");
      actions.className = "article-engagement";
      button = createNewsLikeButton(articleSlug, "article");
      actions.append(button);
      articleCard.append(actions);
    }
    button.dataset.newsSlug = articleSlug;
  }

  const related = document.querySelector(".related");
  const relatedTitle = related?.querySelector(":scope > h2");
  if (relatedTitle && !related.querySelector(".related-heading")) {
    const heading = document.createElement("div");
    heading.className = "related-heading";
    const allNews = document.createElement("a");
    allNews.href = "noticias.html";
    allNews.textContent = "Ver tudo";
    relatedTitle.replaceWith(heading);
    heading.append(relatedTitle, allNews);
  }

  document.querySelectorAll(".related .post-grid a.post-card").forEach((link) => {
    const wrapper = document.createElement("article");
    wrapper.className = "recent-post-card";
    const articleUrl = new URL(link.href, location.href);
    const slug = decodeURIComponent(articleUrl.hash.slice(1) || articleUrl.pathname.split("/").pop().replace(/\.html$/, ""));
    link.classList.remove("post-card");
    link.classList.add("recent-post-link");
    link.replaceWith(wrapper);
    wrapper.append(link, createNewsLikeButton(slug, "recent"));
  });
  syncNewsLikeButtons();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-news-like]");
  if (!button || !button.dataset.newsSlug) return;
  event.preventDefault();
  event.stopPropagation();
  const slug = button.dataset.newsSlug;
  if (likedNews.has(slug)) likedNews.delete(slug);
  else likedNews.add(slug);
  try {
    localStorage.setItem(newsLikesStorageKey, JSON.stringify([...likedNews]));
  } catch (error) {
    console.error("Não foi possível salvar a curtida neste navegador:", error);
  }
  syncNewsLikeButtons();
});

initializeArticleLikes();
document.addEventListener("cms:news-updated", initializeArticleLikes);

/* Links do rodapé que apontam para um projeto (ex.: #projeto-saciar) abrem a aba certa */
window.addEventListener("hashchange", () => {
  const tab = document.querySelector(`[role="tab"][aria-controls="${location.hash.slice(1)}"]`);
  if (tab) { tab.click(); tab.closest("section").scrollIntoView(); }
});
