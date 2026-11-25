import { isSupabaseConfigured, safeRichHtml, slugify, supabase, uploadImage, validateSupabaseApiKey } from "./supabase.js";
import { renderOds } from "./ods.js";
import { NEWS_CATEGORIES } from "./news-categories.js";
import { initializeEventAdmin } from "./admin-events.js";

const byId = (id) => document.getElementById(id);
const login = byId("admin-login");
const app = byId("admin-app");
const loading = byId("admin-loading");
const denied = byId("admin-denied");
const logout = byId("admin-logout");
const imagePreviews = new WeakMap();
const projectImagePositions = new Set(["right", "left", "bottom-left", "bottom-right"]);
let newsGalleryItems = [];

function message(form, text, isError = false) {
  const target = form.querySelector(".admin-message");
  target.textContent = text;
  target.classList.toggle("is-error", isError);
}

function setFormValues(form, values) {
  Object.entries(values || {}).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
}

function setProjectOds(form, values) {
  const selected = new Set((Array.isArray(values) ? values : []).map(String));
  form.querySelectorAll('input[name="ods"]').forEach((checkbox) => {
    checkbox.checked = selected.has(checkbox.value);
  });
}

function initializeNewsCategories() {
  const field = byId("news-form").elements.namedItem("category");
  NEWS_CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    field.append(option);
  });
}

function setNewsCategory(value) {
  const field = byId("news-form").elements.namedItem("category");
  if (value && ![...field.options].some((option) => option.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${value} (atual)`;
    field.append(option);
  }
  field.value = value || "";
}

function setPaletteValue(select, value, fallback) {
  select.querySelector('option[data-current-color="true"]')?.remove();
  const knownOption = [...select.options].some((option) => option.value === value);
  if (!knownOption && /^#[0-9a-f]{6}$/i.test(value || "")) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `Cor atual (${value})`;
    option.dataset.currentColor = "true";
    select.append(option);
  }
  select.value = knownOption || /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function getFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function createHomeSlideRow(slide) {
  const row = document.createElement("fieldset");
  row.className = "admin-slide-item";

  const legend = document.createElement("legend");
  const imageLabel = document.createElement("label");
  imageLabel.textContent = "URL da imagem";
  const imageInput = document.createElement("input");
  imageInput.type = "text";
  imageInput.className = "home-slide-image";
  imageInput.placeholder = "https://... ou assets/...";
  imageInput.value = slide.image_url || "";
  imageLabel.append(imageInput);

  const uploadLabel = document.createElement("label");
  uploadLabel.textContent = "Ou envie uma imagem";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp,image/gif";
  uploadLabel.append(fileInput);

  const altLabel = document.createElement("label");
  altLabel.textContent = "Descrição da imagem (opcional)";
  const altInput = document.createElement("input");
  altInput.type = "text";
  altInput.className = "home-slide-alt";
  altInput.value = slide.alt || "";
  altLabel.append(altInput);

  const titleLabel = document.createElement("label");
  titleLabel.textContent = "Título do banner (opcional)";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "home-slide-title";
  titleInput.value = slide.title || "";
  titleLabel.append(titleInput);

  const subtitleLabel = document.createElement("label");
  subtitleLabel.textContent = "Subtítulo do banner (opcional)";
  const subtitleInput = document.createElement("textarea");
  subtitleInput.className = "home-slide-subtitle";
  subtitleInput.rows = 2;
  subtitleInput.value = slide.subtitle || "";
  subtitleLabel.append(subtitleInput);

  const textPreview = document.createElement("div");
  textPreview.className = "admin-slide-content-preview";
  const previewTitle = document.createElement("strong");
  const previewSubtitle = document.createElement("p");
  textPreview.append(previewTitle, previewSubtitle);

  const preview = document.createElement("img");
  preview.className = "admin-slide-image-preview";
  preview.alt = "";
  preview.hidden = true;

  const actions = document.createElement("div");
  actions.className = "admin-slide-actions";
  actions.append(
    itemButton("Mover para cima", "move-up"),
    itemButton("Mover para baixo", "move-down"),
    itemButton("Remover", "remove-slide", "", "is-danger"),
  );
  row.append(legend, imageLabel, uploadLabel, altLabel, titleLabel, subtitleLabel, textPreview, preview, actions);
  return row;
}

function updateHomeSlideOrder(form) {
  const rows = [...byId("home-slides-list").children];
  rows.forEach((row, index) => {
    row.querySelector("legend").textContent = `Imagem ${index + 1}`;
    row.querySelector('[data-action="move-up"]').disabled = index === 0;
    row.querySelector('[data-action="move-down"]').disabled = index === rows.length - 1;
  });
  updateLivePreview(form);
}

function renderHomeSlides(form, slides) {
  const list = byId("home-slides-list");
  if (!list) return;
  list.replaceChildren(...slides.map(createHomeSlideRow));
  updateHomeSlideOrder(form);
}

function readHomeSlides(form) {
  return [...byId("home-slides-list").querySelectorAll(".admin-slide-item")].map((row) => ({
    image_url: row.querySelector(".home-slide-image").value.trim(),
    alt: row.querySelector(".home-slide-alt").value.trim(),
    title: row.querySelector(".home-slide-title").value.trim(),
    subtitle: row.querySelector(".home-slide-subtitle").value.trim(),
    file: row.querySelector('input[type="file"]').files[0],
    row,
  }));
}

async function checkAuthorization() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    login.hidden = false;
    return false;
  }
  const { data: isAdmin, error } = await supabase.rpc("is_site_admin");
  if (error) throw error;
  if (!isAdmin) {
    await supabase.auth.signOut();
    denied.hidden = false;
    return false;
  }
  app.hidden = false;
  logout.hidden = false;
  initializeEventAdmin();
  await loadDashboard();
  return true;
}

function selectView(name) {
  document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("is-current", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  const loaders = {
    home: () => loadContentForm("home"),
    about: () => loadContentForm("about"),
    news: loadNews,
    team: loadTeam,
    projects: loadProjects,
    gallery: loadGallery,
  };
  if (loaders[name]) loaders[name]().catch((error) => {
    console.error(`Falha ao carregar a seção ${name}:`, error);
    const panel = document.querySelector(`[data-panel="${name}"]`);
    const status = panel.querySelector(".admin-message") || document.createElement("p");
    status.className = "admin-message is-error";
    status.setAttribute("role", "status");
    status.textContent = `Não foi possível carregar os dados: ${error.message}`;
    if (!status.parentElement) panel.append(status);
  });
  document.dispatchEvent(new CustomEvent("admin:view-selected", { detail: { view: name } }));
}

async function loadDashboard() {
  const counts = [
    ["news", "count-news", { status: "published" }],
    ["team_members", "count-team", { active: true }],
    ["projects", "count-projects", { active: true }],
  ];
  await Promise.all(counts.map(async ([table, targetId, filter]) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    Object.entries(filter).forEach(([key, value]) => { query = query.eq(key, value); });
    const { count, error } = await query;
    if (error) throw error;
    byId(targetId).textContent = String(count ?? 0);
  }));
}

async function loadContentForm(section) {
  const form = byId(`${section}-form`);
  const { data, error } = await supabase.from("site_content").select("content").eq("section", section).maybeSingle();
  if (error) throw error;
  let values = data?.content;
  if (!values) {
    const page = await fetch(section === "home" ? "../index.html" : "../quem-somos.html");
    if (!page.ok) throw new Error("Não foi possível carregar o conteúdo atual da página.");
    const parsed = new DOMParser().parseFromString(await page.text(), "text/html");
    values = {};
    parsed.querySelectorAll(`[data-cms^="${section}."]`).forEach((element) => {
      const key = element.dataset.cms.slice(section.length + 1);
      if (key === "button_text" || key === "button_url") return;
      if (element instanceof HTMLImageElement) values[key] = element.getAttribute("src");
      else if (element instanceof HTMLUListElement) values[key] = [...element.children].map((item) => item.textContent).join("\n");
      else values[key] = element.textContent.trim();
    });
  }
  setFormValues(form, values);
  if (section === "home") {
    const slides = Array.isArray(values.slides) ? values.slides : [];
    const homeSlides = slides.length ? slides : values.hero_image ? [{ image_url: values.hero_image }] : [];
    renderHomeSlides(form, homeSlides.map((slide) => ({
      ...slide,
      title: typeof slide.title === "string" ? slide.title : values.hero_title || "",
      subtitle: typeof slide.subtitle === "string" ? slide.subtitle : values.hero_subtitle || "",
    })));
  }
  updatePreviews(form);
  updateLivePreview(form);
}

function previewImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, new URL("../", location.href));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function previewFileUrl(file) {
  if (!file) return "";
  if (!imagePreviews.has(file)) imagePreviews.set(file, URL.createObjectURL(file));
  return imagePreviews.get(file);
}

function updatePreviews(form) {
  form.querySelectorAll("[data-preview]").forEach((image) => {
    const url = form.elements.namedItem(image.dataset.preview)?.value;
    const resolved = previewImageUrl(url);
    image.hidden = !resolved;
    if (resolved) image.src = resolved;
  });
}

function updateLivePreview(form) {
  const section = form.getAttribute("id").replace("-form", "");
  const values = getFormValues(form);
  Object.entries(values).forEach(([key, value]) => {
    const target = document.querySelector(`[data-live-preview="${section}.${key}"]`);
    if (!target) return;
    if (target instanceof HTMLImageElement) {
      const file = form.querySelector(`[name="${key}"]`)?.closest(".upload-row")?.querySelector('input[type="file"]')?.files[0];
      const url = file ? previewFileUrl(file) : previewImageUrl(value);
      target.hidden = !url;
      if (url) target.src = url;
      return;
    }
    if (target instanceof HTMLAnchorElement) {
      target.hidden = !value;
      target.href = value ? `mailto:${value}` : "#";
      return;
    }
    target.textContent = value || "";
  });

  if (section === "home") {
    const slides = readHomeSlides(form);
    const image = document.querySelector('[data-live-preview="home.hero_image"]');
    const thumbnails = byId("home-slides-preview");
    const count = document.querySelector('[data-live-preview="home.slides_count"]');
    thumbnails.replaceChildren();
    slides.forEach((slide, index) => {
      const url = slide.file ? previewFileUrl(slide.file) : previewImageUrl(slide.image_url);
      const thumbnail = document.createElement("img");
      thumbnail.alt = `Imagem ${index + 1} do slideshow`;
      thumbnail.title = `Imagem ${index + 1}`;
      thumbnail.hidden = !url;
      if (url) thumbnail.src = url;
      thumbnails.append(thumbnail);
      const rowPreview = slide.row.querySelector(".admin-slide-image-preview");
      rowPreview.hidden = !url;
      if (url) rowPreview.src = url;
      const textPreview = slide.row.querySelector(".admin-slide-content-preview");
      const previewTitle = textPreview.querySelector("strong");
      const previewSubtitle = textPreview.querySelector("p");
      previewTitle.textContent = slide.title;
      previewTitle.hidden = !slide.title;
      previewSubtitle.textContent = slide.subtitle;
      previewSubtitle.hidden = !slide.subtitle;
      textPreview.hidden = !slide.title && !slide.subtitle;
    });
    const first = slides[0];
    const firstUrl = first ? first.file ? previewFileUrl(first.file) : previewImageUrl(first.image_url) : "";
    image.hidden = !firstUrl;
    if (firstUrl) image.src = firstUrl;
    const firstTitle = first?.title || "";
    const firstSubtitle = first?.subtitle || "";
    const titlePreview = document.querySelector('[data-live-preview="home.hero_title"]');
    const subtitlePreview = document.querySelector('[data-live-preview="home.hero_subtitle"]');
    titlePreview.textContent = firstTitle;
    titlePreview.hidden = !firstTitle;
    subtitlePreview.textContent = firstSubtitle;
    subtitlePreview.hidden = !firstSubtitle;
    count.textContent = `${slides.length} ${slides.length === 1 ? "imagem" : "imagens"} no slideshow`;
  } else if (section === "about") {
    const list = document.querySelector('[data-live-preview="about.values"]');
    list.replaceChildren(...(values.values || "").split(/\r?\n/).filter(Boolean).map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }));
  } else if (section === "news") {
    const status = document.querySelector('[data-live-preview="news.status"]');
    status.textContent = values.status === "published" ? "Publicado" : "Rascunho";
    document.querySelector('[data-live-preview="news.body"]').innerHTML = safeRichHtml(byId("news-body").innerHTML);
    renderNewsGalleryItems();
  } else if (section === "project") {
    const ods = [...form.querySelectorAll('input[name="ods"]:checked')].map((checkbox) => Number(checkbox.value));
    const odsPreview = document.querySelector('[data-live-preview="project.ods"]');
    renderOds(odsPreview, ods);
    odsPreview.hidden = !ods.length;
    document.querySelector('[data-live-preview="project.description"]').innerHTML = safeRichHtml(byId("project-body").innerHTML);
    const subtitle = String(values.subtitle || "").trim();
    const subtitlePreview = document.querySelector('[data-live-preview="project.subtitle"]');
    subtitlePreview.textContent = values.subtitle || "";
    subtitlePreview.hidden = !subtitle;
    const details = String(values.details || "").trim();
    const detailsPreview = document.querySelector('[data-live-preview="project.details"]');
    detailsPreview.textContent = values.details || "";
    detailsPreview.hidden = !details;
    const position = form.elements.namedItem("image_position").value;
    const layout = document.querySelector("[data-project-preview-layout]");
    const previewImage = layout.querySelector(".preview-project-circle");
    const positionClass = previewImage.hidden ? "none" : projectImagePositions.has(position) ? position : "right";
    const layoutDetails = details ? " has-project-details" : "";
    const layoutImage = previewImage.hidden ? "" : " has-project-image";
    layout.className = `preview-project-layout tabpanel-cols project-image-position--${positionClass}${layoutDetails}${layoutImage}`;
  }
}

function bindProjectEditor() {
  const editor = byId("project-body");
  const toolbar = document.querySelector(".project-editor-toolbar");
  const customOdsColor = byId("use-custom-ods-color");
  const odsColor = byId("project-form").elements.namedItem("ods_color");
  let savedRange;

  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedRange || !editor.contains(savedRange.commonAncestorContainer)) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return true;
  }

  function applyStyle(property, value) {
    if (!restoreSelection()) return false;
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.getRangeAt(0).collapsed) return false;
    const range = selection.getRangeAt(0).cloneRange();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end > start) textNodes.push({ node, start, end });
    }
    const spans = [];
    textNodes.reverse().forEach(({ node, start, end }) => {
      const selectedText = document.createRange();
      selectedText.setStart(node, start);
      selectedText.setEnd(node, end);
      const span = document.createElement("span");
      span.style.setProperty(property, value);
      span.append(selectedText.extractContents());
      selectedText.insertNode(span);
      spans.unshift(span);
    });
    if (!spans.length) return false;
    const formattedRange = document.createRange();
    formattedRange.setStart(spans[0].firstChild, 0);
    formattedRange.setEnd(spans[spans.length - 1].firstChild, spans[spans.length - 1].firstChild.textContent.length);
    selection.removeAllRanges();
    selection.addRange(formattedRange);
    savedRange = formattedRange.cloneRange();
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  document.addEventListener("selectionchange", rememberSelection);
  editor.addEventListener("mouseup", rememberSelection);
  editor.addEventListener("keyup", rememberSelection);
  editor.addEventListener("input", rememberSelection);
  customOdsColor.addEventListener("change", () => {
    odsColor.disabled = !customOdsColor.checked;
  });
  toolbar.addEventListener("mousedown", (event) => {
    if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
  });
  toolbar.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const colorButton = target.closest("button[data-project-color]");
    const sizeButton = target.closest("button[data-project-size-step]");
    const applyAndReport = (property, value) => {
      if (applyStyle(property, value)) {
        message(byId("project-form"), "Formatação aplicada.");
      } else {
        message(byId("project-form"), "Selecione um trecho do texto antes de escolher a formatação.", true);
      }
    };
    if (colorButton) {
      applyAndReport("color", colorButton.dataset.projectColor);
      return;
    }
    if (sizeButton) {
      const selectedNode = savedRange?.startContainer;
      const selectedElement = selectedNode instanceof Element ? selectedNode : selectedNode?.parentElement;
      const currentSize = Number.parseFloat(getComputedStyle(selectedElement || editor).fontSize) || 15;
      const step = Number(sizeButton.dataset.projectSizeStep);
      const nextSize = Math.max(10, Math.min(36, Math.round(currentSize + step)));
      applyAndReport("font-size", `${nextSize}px`);
      return;
    }
    const button = target.closest("button[data-project-format]");
    if (!button) return;
    const format = button.dataset.projectFormat;
    if (["bold", "italic"].includes(format) && restoreSelection()) {
      document.execCommand(format, false);
      rememberSelection();
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

async function saveContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const section = form.id === "home-form" ? "home" : "about";
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  message(form, "Salvando...");
  try {
    const values = getFormValues(form);
    if (section === "home") {
      const slides = readHomeSlides(form);
      if (!slides.length) throw new Error("Adicione pelo menos uma imagem ao slideshow.");
      const savedSlides = [];
      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        if (slide.file) {
          slide.image_url = await uploadImage(slide.file, "banners");
          slide.row.querySelector(".home-slide-image").value = slide.image_url;
          slide.row.querySelector('input[type="file"]').value = "";
        }
        if (!slide.image_url || !previewImageUrl(slide.image_url)) {
          throw new Error(`Informe uma URL válida ou envie a imagem ${index + 1} do slideshow.`);
        }
        savedSlides.push({
          image_url: slide.image_url,
          alt: slide.alt,
          title: slide.title,
          subtitle: slide.subtitle,
        });
      }
      values.slides = savedSlides;
      values.hero_image = savedSlides[0].image_url;
      values.hero_title = savedSlides[0].title;
      values.hero_subtitle = savedSlides[0].subtitle;
    } else {
      const file = form.querySelector('input[type="file"]')?.files[0];
      if (file && form.elements.namedItem("banner_image")) {
        values.banner_image = await uploadImage(file, "banners");
      }
    }
    const { error } = await supabase.from("site_content").upsert({
      section,
      content: values,
      updated_at: new Date().toISOString(),
    }, { onConflict: "section" });
    if (error) throw error;
    form.reset();
    const stored = await supabase.from("site_content").select("content").eq("section", section).single();
    if (stored.error) throw stored.error;
    setFormValues(form, stored.data.content);
    if (section === "home") renderHomeSlides(form, stored.data.content.slides || []);
    updatePreviews(form);
    updateLivePreview(form);
    message(form, "Conteúdo salvo com sucesso.");
  } catch (error) {
    message(form, `Não foi possível salvar: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function bindUpload(form) {
  form.querySelectorAll('input[type="file"]').forEach((fileInput) => {
    const urlInput = fileInput.closest(".upload-row")?.querySelector('input:not([type="file"])');
    if (!urlInput) return;
    fileInput.addEventListener("change", () => {
      const image = form.querySelector(`[data-preview="${urlInput.name}"]`);
      const file = fileInput.files[0];
      if (!image || !file) return;
      image.src = previewFileUrl(file);
      image.hidden = false;
    });
  });
}

function bindHomeSlideEditor() {
  const form = byId("home-form");
  const list = byId("home-slides-list");
  byId("home-add-slide").addEventListener("click", () => {
    list.append(createHomeSlideRow({}));
    updateHomeSlideOrder(form);
    list.lastElementChild.querySelector(".home-slide-image").focus();
  });
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest(".admin-slide-item");
    if (button.dataset.action === "remove-slide") {
      row.remove();
    } else if (button.dataset.action === "move-up" && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling);
    } else if (button.dataset.action === "move-down" && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row);
    }
    updateHomeSlideOrder(form);
  });
}

async function uploadProjectImages(form) {
  for (const fieldName of ["logo_url", "image_url"]) {
    const urlInput = form.elements.namedItem(fieldName);
    const fileInput = urlInput.closest(".upload-row").querySelector('input[type="file"]');
    const file = fileInput.files[0];
    if (!file) continue;
    if (fieldName === "logo_url" && file.type !== "image/png") {
      throw new Error("A logo do projeto deve ser um arquivo PNG.");
    }
    urlInput.value = await uploadImage(file, "projetos");
    fileInput.value = "";
  }
}

async function uploadSelectedFile(form, folder) {
  const fileInput = form.querySelector('input[type="file"]');
  if (!fileInput?.files[0]) return;
  const urlInput = fileInput.closest(".upload-row").querySelector('input:not([type="file"])');
  urlInput.value = await uploadImage(fileInput.files[0], folder);
}

function validNewsGalleryUrl(url) {
  return /^(https?:\/\/|\/|\.\/|assets\/)/i.test(url || "");
}

function renderNewsGalleryItems() {
  const items = byId("news-gallery-items");
  const preview = document.querySelector('[data-live-preview="news.gallery"]');
  if (!items || !preview) return;
  const render = (container, includeRemove) => {
    container.replaceChildren();
    newsGalleryItems.forEach((item, index) => {
      const source = item.file ? previewFileUrl(item.file) : item.url;
      if (!source) return;
      const card = document.createElement("figure");
      card.className = "admin-news-gallery-item";
      const image = document.createElement("img");
      image.src = source;
      image.alt = `Foto ${index + 1} da galeria da notícia`;
      image.loading = "lazy";
      card.append(image);
      if (includeRemove) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "is-danger";
        remove.textContent = "Remover foto";
        remove.dataset.removeNewsGallery = String(index);
        card.append(remove);
      }
      container.append(card);
    });
  };
  render(items, true);
  render(preview, false);
}

function resetForm(form, defaults = {}) {
  form.reset();
  const id = form.elements.namedItem("id");
  if (id) id.value = "";
  const slug = form.elements.namedItem("slug");
  if (slug) delete slug.dataset.edited;
  setFormValues(form, defaults);
  const editor = byId("news-body");
  if (editor && form.getAttribute("id") === "news-form") {
    editor.innerHTML = "";
    newsGalleryItems = [];
    renderNewsGalleryItems();
  }
  if (form.getAttribute("id") === "project-form") {
    byId("project-body").innerHTML = "";
    setProjectOds(form, defaults.ods || []);
    const customColor = form.elements.namedItem("use_custom_ods_color");
    const colorInput = form.elements.namedItem("ods_color");
    customColor.checked = Boolean(defaults.ods_color);
    setPaletteValue(colorInput, defaults.ods_color || "#19486a", "#19486a");
    colorInput.disabled = !customColor.checked;
  }
  updatePreviews(form);
  updateLivePreview(form);
}

function itemButton(label, action, id, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  if (className) button.className = className;
  return button;
}

async function loadNews() {
  const { data, error } = await supabase.from("news")
    .select("id,title,slug,excerpt,body,cover_url,category,status,published_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list = byId("news-items");
  list.replaceChildren();
  data.forEach((news) => {
    const row = document.createElement("article");
    row.className = "admin-item";
    const title = document.createElement("strong");
    title.textContent = news.title;
    const status = document.createElement("span");
    status.textContent = news.status === "published" ? "Publicado" : "Rascunho";
    row.append(title, status, itemButton("Editar", "edit-news", news.id), itemButton("Excluir", "delete-news", news.id, "is-danger"));
    list.append(row);
  });
}

async function saveNews(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  message(form, "Salvando notícia...");
  try {
    await uploadSelectedFile(form, "noticias");
    for (const item of newsGalleryItems) {
      if (item.file) {
        item.url = await uploadImage(item.file, "noticias");
        item.file = null;
      }
    }
    byId("news-gallery-files").value = "";
    renderNewsGalleryItems();
    const values = getFormValues(form);
    const status = values.status;
    const publishedAt = status === "published"
      ? new Date(values.published_at ? `${values.published_at}T12:00:00` : Date.now()).toISOString()
      : null;
    const record = {
      title: values.title.trim(),
      slug: slugify(values.slug),
      excerpt: values.excerpt.trim(),
      body: safeRichHtml(byId("news-body").innerHTML),
      cover_url: values.cover_url || "",
      gallery_urls: newsGalleryItems.map((item) => item.url).filter(validNewsGalleryUrl),
      category: values.category.trim(),
      status,
      published_at: publishedAt,
      updated_at: new Date().toISOString(),
    };
    if (!record.slug) throw new Error("Informe um título válido para gerar o slug.");
    const id = values.id;
    const result = id
      ? await supabase.from("news").update(record).eq("id", id)
      : await supabase.from("news").insert(record);
    if (result.error) throw result.error;
    resetForm(form);
    message(form, "Notícia salva com sucesso.");
    await Promise.all([loadNews(), loadDashboard()]);
  } catch (error) {
    message(form, `Não foi possível salvar: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function editNews(id) {
  const { data, error } = await supabase.from("news").select("*").eq("id", id).single();
  if (error) throw error;
  const form = byId("news-form");
  setFormValues(form, {
    ...data,
    published_at: data.published_at ? data.published_at.slice(0, 10) : "",
  });
  setNewsCategory(data.category);
  byId("news-body").innerHTML = safeRichHtml(data.body);
  newsGalleryItems = (Array.isArray(data.gallery_urls) ? data.gallery_urls : [])
    .filter(validNewsGalleryUrl)
    .map((url) => ({ url, file: null }));
  renderNewsGalleryItems();
  updatePreviews(form);
  updateLivePreview(form);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteNews(id) {
  if (!confirm("Excluir esta notícia permanentemente?")) return;
  const { error } = await supabase.from("news").delete().eq("id", id);
  if (error) throw error;
  await Promise.all([loadNews(), loadDashboard()]);
}

async function loadTeam() {
  const { data, error } = await supabase.from("team_members").select("*").order("sort_order");
  if (error) throw error;
  const list = byId("team-items");
  list.replaceChildren();
  data.forEach((member) => {
    const row = document.createElement("article");
    row.className = "admin-item";
    const title = document.createElement("strong");
    title.textContent = member.name;
    const status = document.createElement("span");
    status.textContent = member.active ? member.role : "Inativo";
    row.append(title, status, itemButton("Alterar", "edit-team", member.id),
      itemButton(member.active ? "Desativar" : "Reativar", "toggle-team", member.id, member.active ? "is-danger" : ""),
      itemButton("Excluir", "delete-team", member.id, "is-danger"));
    list.append(row);
  });
}

async function saveTeam(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  message(form, "Salvando integrante...");
  try {
    await uploadSelectedFile(form, "equipe");
    const values = getFormValues(form);
    const record = {
      name: values.name.trim(),
      role: values.role.trim(),
      email: values.email.trim() || null,
      photo_url: values.photo_url || "",
      sort_order: Number(values.sort_order) || 0,
      active: form.elements.namedItem("active").checked,
    };
    const result = values.id
      ? await supabase.from("team_members").update(record).eq("id", values.id)
      : await supabase.from("team_members").insert(record);
    if (result.error) throw result.error;
    resetForm(form, { active: true, sort_order: 0 });
    message(form, "Integrante salvo com sucesso.");
    await Promise.all([loadTeam(), loadDashboard()]);
  } catch (error) {
    message(form, `Não foi possível salvar: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function deleteTeamMember(id) {
  if (!confirm("Excluir este integrante permanentemente? Esta ação não pode ser desfeita.")) return;
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) throw error;
  await Promise.all([loadTeam(), loadDashboard()]);
}

async function loadProjects() {
  const { data, error } = await supabase.from("projects").select("*").order("sort_order");
  if (error) throw error;
  const list = byId("project-items");
  list.replaceChildren();
  data.forEach((project) => {
    const row = document.createElement("article");
    row.className = "admin-item";
    const title = document.createElement("strong");
    title.textContent = project.title;
    const status = document.createElement("span");
    status.textContent = project.active ? "Ativo" : "Inativo";
    row.append(title, status, itemButton("Alterar", "edit-project", project.id),
      itemButton(project.active ? "Desativar" : "Reativar", "toggle-project", project.id, project.active ? "is-danger" : ""),
      itemButton("Excluir", "delete-project", project.id, "is-danger"));
    list.append(row);
  });
}

async function saveProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  message(form, "Salvando projeto...");
  try {
    if (!byId("project-body").innerText.trim()) throw new Error("Informe o conteúdo do projeto.");
    await uploadProjectImages(form);
    const values = getFormValues(form);
    const description = safeRichHtml(byId("project-body").innerHTML);
    const record = {
      title: values.title.trim(),
      subtitle: (values.subtitle || "").trim(),
      description,
      details: (values.details || "").trim(),
      logo_url: values.logo_url || "",
      image_url: values.image_url || "",
      image_position: projectImagePositions.has(values.image_position) ? values.image_position : "right",
      ods: [...form.querySelectorAll('input[name="ods"]:checked')].map((checkbox) => Number(checkbox.value)),
      ods_color: form.elements.namedItem("use_custom_ods_color").checked ? values.ods_color : "",
      sort_order: Number(values.sort_order) || 0,
      active: form.elements.namedItem("active").checked,
      updated_at: new Date().toISOString(),
    };
    const result = values.id
      ? await supabase.from("projects").update(record).eq("id", values.id)
      : await supabase.from("projects").insert(record);
    if (result.error) throw result.error;
    resetForm(form, { active: true, sort_order: 0, ods: [] });
    message(form, "Projeto salvo com sucesso.");
    await Promise.all([loadProjects(), loadDashboard()]);
  } catch (error) {
    message(form, `Não foi possível salvar: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function deleteProject(id) {
  if (!confirm("Excluir este projeto permanentemente? Esta ação não pode ser desfeita.")) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
  await Promise.all([loadProjects(), loadDashboard()]);
}

async function loadGallery() {
  const container = byId("gallery-items");
  container.replaceChildren();
  for (const folder of ["banners", "noticias", "equipe", "projetos", "galeria"]) {
    const { data, error } = await supabase.storage.from("site-media").list(folder, {
      limit: 30,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw error;
    data.filter((file) => file.id).forEach((file) => {
      const path = `${folder}/${file.name}`;
      const url = supabase.storage.from("site-media").getPublicUrl(path).data.publicUrl;
      const card = document.createElement("article");
      const image = document.createElement("img");
      image.src = url;
      image.alt = file.name;
      image.loading = "lazy";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copiar URL";
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(url);
        copy.textContent = "URL copiada";
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Excluir imagem";
      remove.className = "is-danger";
      remove.addEventListener("click", async () => {
        if (!confirm("Excluir esta imagem permanentemente? Se estiver sendo usada em uma página ou notícia, ela deixará de aparecer.")) return;
        remove.disabled = true;
        try {
          const { error: removeError } = await supabase.storage.from("site-media").remove([path]);
          if (removeError) throw removeError;
          await loadGallery();
        } catch (error) {
          byId("gallery-message").textContent = `Não foi possível excluir a imagem: ${error.message}`;
          byId("gallery-message").classList.add("is-error");
        } finally {
          remove.disabled = false;
        }
      });
      card.append(image, copy, remove);
      container.append(card);
    });
  }
}

async function uploadGalleryImage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  message(form, "Enviando imagem...");
  try {
    const file = form.elements.namedItem("image").files[0];
    const folder = form.elements.namedItem("folder").value;
    await uploadImage(file, folder);
    form.reset();
    message(form, "Imagem enviada com sucesso.");
    await loadGallery();
  } catch (error) {
    message(form, `Não foi possível enviar: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  initializeNewsCategories();
  byId("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    message(form, "Verificando credenciais...");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.elements.namedItem("email").value,
        password: form.elements.namedItem("password").value,
      });
      if (error) throw error;
      login.hidden = true;
      await checkAuthorization();
      form.reset();
    } catch (error) {
      if (error.message === "Invalid API key") {
        message(form, "A chave pública do Supabase foi recusada. Atualize VITE_SUPABASE_ANON_KEY com a chave anon/public exibida no painel do projeto.", true);
        return;
      }
      message(form, error.message.includes("Invalid login credentials")
        ? "E-mail ou senha incorretos."
        : `Não foi possível entrar: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });
  logout.addEventListener("click", () => supabase.auth.signOut().then(({ error }) => {
    if (error) throw error;
    location.href = "../index.html";
  }).catch((error) => window.alert(`Não foi possível sair: ${error.message}`)));
  document.querySelectorAll("[data-sign-out]").forEach((button) => button.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      window.alert(`Não foi possível sair: ${error.message}`);
      return;
    }
    denied.hidden = true;
    login.hidden = false;
  }));

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => selectView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => selectView(button.dataset.go)));
  byId("home-form").addEventListener("submit", saveContent);
  byId("about-form").addEventListener("submit", saveContent);
  byId("news-form").addEventListener("submit", saveNews);
  byId("team-form").addEventListener("submit", saveTeam);
  byId("project-form").addEventListener("submit", saveProject);
  byId("gallery-form").addEventListener("submit", uploadGalleryImage);
  byId("news-new").addEventListener("click", () => resetForm(byId("news-form")));
  byId("team-new").addEventListener("click", () => resetForm(byId("team-form"), { active: true, sort_order: 0 }));
  byId("project-new").addEventListener("click", () => resetForm(byId("project-form"), { active: true, sort_order: 0, image_position: "right" }));
  bindHomeSlideEditor();
  bindUpload(byId("about-form"));
  bindUpload(byId("news-form"));
  bindUpload(byId("team-form"));
  bindUpload(byId("project-form"));
  bindProjectEditor();
  ["home-form", "about-form", "news-form", "team-form", "project-form"].forEach((id) => {
    const form = byId(id);
    form.addEventListener("input", () => updateLivePreview(form));
    form.addEventListener("change", () => updateLivePreview(form));
  });
  byId("news-body").addEventListener("input", () => updateLivePreview(byId("news-form")));
  byId("news-gallery-files").addEventListener("change", (event) => {
    newsGalleryItems.push(...[...event.currentTarget.files].map((file) => ({ file, url: "" })));
    event.currentTarget.value = "";
    renderNewsGalleryItems();
  });
  byId("news-gallery-add-url").addEventListener("click", () => {
    const urlField = byId("news-gallery-url");
    const url = urlField.value.trim();
    if (!validNewsGalleryUrl(url)) {
      message(byId("news-form"), "Informe uma URL http(s) ou um caminho de imagem do site.", true);
      return;
    }
    newsGalleryItems.push({ url, file: null });
    urlField.value = "";
    renderNewsGalleryItems();
    message(byId("news-form"), "Foto adicionada à prévia da galeria.");
  });
  byId("news-gallery-items").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-news-gallery]");
    if (!button) return;
    newsGalleryItems.splice(Number(button.dataset.removeNewsGallery), 1);
    renderNewsGalleryItems();
  });

  byId("news-items").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action === "edit-news" ? editNews(button.dataset.id) : deleteNews(button.dataset.id);
    action.catch((error) => window.alert(`Não foi possível concluir a operação: ${error.message}`));
  });
  byId("team-items").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action === "edit-team"
      ? supabase.from("team_members").select("*").eq("id", button.dataset.id).single().then(({ data, error }) => {
        if (error) throw error;
        setFormValues(byId("team-form"), data);
        updatePreviews(byId("team-form"));
        updateLivePreview(byId("team-form"));
      })
      : button.dataset.action === "delete-team"
      ? deleteTeamMember(button.dataset.id)
      : supabase.from("team_members").select("active").eq("id", button.dataset.id).single().then(({ data, error }) => {
        if (error) throw error;
        if (data.active && !confirm("Desativar este integrante? Ele deixará de aparecer no site público.")) return null;
        return supabase.from("team_members").update({ active: !data.active }).eq("id", button.dataset.id);
      }).then((result) => {
        if (!result) return;
        if (result.error) throw result.error;
        return Promise.all([loadTeam(), loadDashboard()]);
      });
    action.catch((error) => window.alert(`Não foi possível concluir a operação: ${error.message}`));
  });
  byId("project-items").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action === "edit-project"
      ? supabase.from("projects").select("*").eq("id", button.dataset.id).single().then(({ data, error }) => {
        if (error) throw error;
        const form = byId("project-form");
        const { description, ods, ods_color, ...fields } = data;
        setFormValues(form, fields);
        setProjectOds(form, ods);
        const customColor = /^#[0-9a-f]{6}$/i.test(ods_color || "");
        const customColorToggle = form.elements.namedItem("use_custom_ods_color");
        const colorInput = form.elements.namedItem("ods_color");
        customColorToggle.checked = customColor;
        setPaletteValue(colorInput, customColor ? ods_color : "#19486a", "#19486a");
        colorInput.disabled = !customColor;
        byId("project-body").innerHTML = safeRichHtml(description);
        updatePreviews(form);
        updateLivePreview(form);
      })
      : button.dataset.action === "delete-project"
      ? deleteProject(button.dataset.id)
      : supabase.from("projects").select("active").eq("id", button.dataset.id).single().then(({ data, error }) => {
        if (error) throw error;
        if (data.active && !confirm("Desativar este projeto no site público?")) return null;
        return supabase.from("projects").update({ active: !data.active }).eq("id", button.dataset.id);
      }).then((result) => {
        if (!result) return;
        if (result.error) throw result.error;
        return Promise.all([loadProjects(), loadDashboard()]);
      });
    action.catch((error) => window.alert(`Não foi possível concluir a operação: ${error.message}`));
  });

  byId("news-form").elements.namedItem("title").addEventListener("input", (event) => {
    const slugField = byId("news-form").elements.namedItem("slug");
    if (!slugField.dataset.edited) slugField.value = slugify(event.target.value);
  });
  byId("news-form").elements.namedItem("slug").addEventListener("input", (event) => { event.target.dataset.edited = "true"; });
  document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => {
    const command = button.dataset.command;
    if (command === "createLink" || command === "insertImage") {
      const url = window.prompt(command === "insertImage" ? "URL da imagem" : "URL do link");
      if (!url || !/^https?:\/\//i.test(url)) return;
      document.execCommand(command, false, url);
      return;
    }
    document.execCommand(command, false, button.dataset.value || null);
    byId("news-body").focus();
  }));
}

async function initialize() {
  if (!isSupabaseConfigured) {
    loading.textContent = "O Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicie o servidor.";
    return;
  }
  bindEvents();
  try {
    await validateSupabaseApiKey();
    loading.textContent = "Verificando acesso...";
    await checkAuthorization();
    loading.hidden = true;
  } catch (error) {
    loading.hidden = false;
    login.hidden = true;
    loading.textContent = error.message === "Invalid API key"
      ? "A chave pública configurada foi recusada pelo Supabase. Obtenha novamente a chave anon/public em Project Settings → API para este projeto e atualize VITE_SUPABASE_ANON_KEY."
      : `Não foi possível validar o acesso. Verifique a configuração e as políticas RLS no Supabase. Detalhes: ${error.message}`;
    loading.classList.add("is-error");
  }
}

initialize();
