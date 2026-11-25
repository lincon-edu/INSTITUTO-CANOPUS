import icon1 from "../assets/img/ods/1-n.svg";
import icon2 from "../assets/img/ods/2-n.svg";
import icon3 from "../assets/img/ods/3-n.svg";
import icon4 from "../assets/img/ods/4-n.svg";
import icon5 from "../assets/img/ods/5-n.svg";
import icon6 from "../assets/img/ods/6-n.svg";
import icon7 from "../assets/img/ods/7-n.svg";
import icon8 from "../assets/img/ods/8-n.svg";
import icon9 from "../assets/img/ods/9-n.svg";
import icon10 from "../assets/img/ods/10-n.svg";
import icon11 from "../assets/img/ods/11-n.svg";
import icon12 from "../assets/img/ods/12-n.svg";
import icon13 from "../assets/img/ods/13-n.svg";
import icon14 from "../assets/img/ods/14-n.svg";
import icon15 from "../assets/img/ods/15-n.svg";
import icon16 from "../assets/img/ods/16-n.svg";
import icon17 from "../assets/img/ods/17-n.svg";

export const ODS = {
  1: ["Erradicação da pobreza", icon1],
  2: ["Fome zero e agricultura sustentável", icon2],
  3: ["Saúde e bem-estar", icon3],
  4: ["Educação de qualidade", icon4],
  5: ["Igualdade de gênero", icon5],
  6: ["Água potável e saneamento", icon6],
  7: ["Energia limpa e acessível", icon7],
  8: ["Trabalho decente e crescimento econômico", icon8],
  9: ["Indústria, inovação e infraestrutura", icon9],
  10: ["Redução das desigualdades", icon10],
  11: ["Cidades e comunidades sustentáveis", icon11],
  12: ["Consumo e produção responsáveis", icon12],
  13: ["Ação contra a mudança global do clima", icon13],
  14: ["Vida na água", icon14],
  15: ["Vida terrestre", icon15],
  16: ["Paz, justiça e instituições eficazes", icon16],
  17: ["Parcerias e meios de implementação", icon17],
};

export function renderOds(list, values) {
  const numbers = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  const validNumbers = [];

  list.setAttribute("aria-label", "Objetivos de Desenvolvimento Sustentável");
  list.replaceChildren();
  numbers.forEach((value) => {
    const number = Number(value);
    const [label, iconUrl] = ODS[number] || [];
    if (!Number.isInteger(number) || !label) return;
    validNumbers.push(number);

    const badge = document.createElement("li");
    badge.title = `ODS ${number} – ${label}`;
    badge.setAttribute("aria-label", `ODS ${number}: ${label}`);
    const icon = document.createElement("img");
    icon.className = "icon";
    icon.src = iconUrl;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.loading = "lazy";
    icon.decoding = "async";
    badge.append(icon);
    list.append(badge);
  });
  list.dataset.ods = validNumbers.join(",");
}
