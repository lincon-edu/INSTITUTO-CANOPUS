import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

let apiKeyStatus;

export async function validateSupabaseApiKey() {
  if (!isSupabaseConfigured) throw new Error("As variáveis do Supabase não estão configuradas.");
  if (apiKeyStatus) return apiKeyStatus;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
    });
    if (response.status === 401) {
      throw new Error("Invalid API key");
    }
    if (!response.ok) {
      throw new Error(`A API do Supabase respondeu com status ${response.status}.`);
    }
    apiKeyStatus = true;
    return true;
  } catch (error) {
    if (error.message === "Invalid API key") throw error;
    throw new Error(`Não foi possível conectar ao Supabase: ${error.message}`);
  }
}

export function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function safeRichHtml(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const allowedTags = new Set(["P", "BR", "DIV", "STRONG", "B", "EM", "I", "H2", "H3", "UL", "OL", "LI", "A", "IMG", "BLOCKQUOTE", "SPAN"]);
  const normalizeColor = (value) => {
    if (/^#[0-9a-f]{6}$/i.test(value || "")) return value.toLowerCase();
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value || "");
    if (!rgb) return "";
    const channels = rgb.slice(1).map(Number);
    if (channels.some((channel) => channel > 255)) return "";
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  };
  const cleanNode = (parent) => {
    [...parent.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowedTags.has(child.tagName)) {
          cleanNode(child);
          child.replaceWith(...child.childNodes);
          return;
        }
        const href = child.getAttribute("href");
        const src = child.getAttribute("src");
        const alt = child.getAttribute("alt") || "";
        const style = child.getAttribute("style") || "";
        [...child.attributes].forEach((attribute) => child.removeAttribute(attribute.name));
        if (child.tagName === "A") {
          if (/^(https?:|mailto:|tel:)/i.test(href || "")) {
            child.setAttribute("href", href);
            child.setAttribute("rel", "noopener noreferrer");
          }
        } else if (child.tagName === "IMG") {
          if (/^https?:\/\//i.test(src || "")) child.setAttribute("src", src);
          child.setAttribute("alt", alt);
        } else if (child.tagName === "SPAN") {
          const declarations = Object.fromEntries(style.split(";").map((declaration) => {
            const separator = declaration.indexOf(":");
            return separator < 0
              ? ["", ""]
              : [declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).trim().toLowerCase()];
          }));
          const safeStyles = [];
          const color = normalizeColor(declarations.color);
          if (color) safeStyles.push(`color: ${color}`);
          const fontSize = declarations["font-size"];
          if (["0.875rem", "1rem", "1.125rem", "1.25rem", "1.5rem", "1.75rem"].includes(fontSize) ||
            /^(?:[1-2]\d|3[0-6])px$/.test(fontSize)) {
            safeStyles.push(`font-size: ${fontSize}`);
          }
          if (safeStyles.length) child.setAttribute("style", safeStyles.join("; "));
        }
        cleanNode(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  };
  cleanNode(parsed.body);
  return parsed.body.innerHTML;
}

export async function uploadImage(file, folder) {
  if (!supabase) throw new Error("Supabase não está configurado.");
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) throw new Error("Formato inválido. Use JPG, PNG, WebP ou GIF.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");

  const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("site-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return supabase.storage.from("site-media").getPublicUrl(path).data.publicUrl;
}
