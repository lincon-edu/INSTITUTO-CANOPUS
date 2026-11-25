import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = process.cwd();

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: [
        "index.html",
        "quem-somos.html",
        "noticias.html",
        "inscreva-se.html",
        "blog/index.html",
        "noticia.html",
        "noticia-1-encontro-joao-pessoa.html",
        "noticia-19-encontro-juina.html",
        "noticia-2-encontro-teresina.html",
        "noticia-3-encontro-recife.html",
        "noticia-49-encontro-cuiaba.html",
        "noticia-doacao-venezuela.html",
        "admin/index.html",
      ].map((file) => resolve(root, file)),
    },
  },
});
