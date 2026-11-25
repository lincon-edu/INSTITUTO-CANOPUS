import { supabase } from "./supabase.js";

const byId = (id) => document.getElementById(id);
const eventForm = byId("event-form");
const eventItems = byId("event-items");
const registrationsList = byId("registration-items");
const registrationFilter = byId("registration-event-filter");
const selectAll = byId("registration-select-all");
const exportSelected = byId("registrations-export");

const registrationStatuses = [
  ["registered", "Inscrito"],
  ["confirmed", "Confirmado"],
  ["cancelled", "Cancelado"],
  ["attended", "Compareceu"],
];
const detailFields = [
  ["birth_date", "Data de nascimento"],
  ["whatsapp", "WhatsApp"],
  ["address_street", "Rua / avenida"],
  ["address_number", "Número"],
  ["address_complement", "Complemento"],
  ["address_neighborhood", "Bairro"],
  ["postal_code", "CEP"],
  ["address_city", "Cidade de residência"],
  ["address_state", "Estado de residência"],
  ["departure_city", "Cidade de partida"],
  ["transport_needed", "Precisa de orientação sobre transporte"],
  ["emergency_name", "Contato de emergência"],
  ["emergency_relationship", "Relação com o participante"],
  ["emergency_phone", "Telefone de emergência"],
  ["emergency_phone_backup", "Telefone alternativo de emergência"],
  ["dietary_restrictions", "Restrição alimentar"],
  ["dietary_details", "Detalhes alimentares"],
  ["food_allergies", "Alergias alimentares"],
  ["health_notes", "Alergias / informações de saúde"],
  ["medications", "Medicamentos de uso contínuo"],
  ["accessibility_needs", "Acessibilidade / acomodação"],
  ["additional_notes", "Observações"],
  ["consent_given", "Consentimento para uso dos dados"],
];

let initialized = false;
let events = [];
let registrations = [];
let selectedRegistrationIds = new Set();

function setStatus(id, text, isError = false) {
  const target = byId(id);
  target.textContent = text;
  target.classList.toggle("is-error", isError);
}

function formatDate(value) {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function eventLabel(event) {
  const dateLabel = event.starts_on === event.ends_on
    ? formatDate(event.starts_on)
    : `${formatDate(event.starts_on)} a ${formatDate(event.ends_on)}`;
  return `${event.event_name} — ${event.city}/${event.state} · ${dateLabel}`;
}

function createButton(text, action, id, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.dataset.action = action;
  button.dataset.id = id;
  if (className) button.className = className;
  return button;
}

function resetEventForm() {
  eventForm.reset();
  eventForm.elements.namedItem("id").value = "";
  setStatus("event-admin-status", "");
}

async function loadEvents() {
  const { data, error } = await supabase.from("event_cities")
    .select("id,event_name,city,state,starts_on,ends_on,venue,active,created_at")
    .order("starts_on", { ascending: false });
  if (error) throw error;
  events = data || [];
  renderEvents();
  renderRegistrationFilter();
}

function renderEvents() {
  eventItems.replaceChildren();
  if (!events.length) {
    const empty = document.createElement("p");
    empty.textContent = "Ainda não há eventos cadastrados.";
    eventItems.append(empty);
    return;
  }

  events.forEach((event) => {
    const row = document.createElement("article");
    row.className = "admin-item";
    const title = document.createElement("strong");
    title.textContent = event.event_name;
    const details = document.createElement("span");
    const venue = event.venue ? ` · ${event.venue}` : "";
    details.textContent = `${event.city}/${event.state} · ${formatDate(event.starts_on)} a ${formatDate(event.ends_on)} · ${event.active ? "Inscrições abertas" : "Encerrado"}${venue}`;
    row.append(title, details, createButton("Alterar", "edit-event", event.id),
      createButton(event.active ? "Encerrar inscrições" : "Reabrir inscrições", "toggle-event", event.id));
    eventItems.append(row);
  });
}

function renderRegistrationFilter() {
  const selected = registrationFilter.value;
  const firstOption = registrationFilter.querySelector("option[value='']");
  registrationFilter.replaceChildren(firstOption);
  events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = eventLabel(event);
    registrationFilter.append(option);
  });
  registrationFilter.value = events.some((event) => event.id === selected) ? selected : "";
}

async function saveEvent(event) {
  event.preventDefault();
  const button = eventForm.querySelector('[type="submit"]');
  const values = Object.fromEntries(new FormData(eventForm).entries());
  if (values.ends_on < values.starts_on) {
    setStatus("event-admin-status", "A data de término precisa ser igual ou posterior à data de início.", true);
    return;
  }

  button.disabled = true;
  setStatus("event-admin-status", "Salvando evento...");
  try {
    const record = {
      event_name: values.event_name.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      starts_on: values.starts_on,
      ends_on: values.ends_on,
      venue: values.venue.trim(),
      active: eventForm.elements.namedItem("active").checked,
      updated_at: new Date().toISOString(),
    };
    const result = values.id
      ? await supabase.from("event_cities").update(record).eq("id", values.id)
      : await supabase.from("event_cities").insert(record);
    if (result.error) throw result.error;
    resetEventForm();
    setStatus("event-admin-status", "Evento salvo. O histórico de inscrições foi mantido.");
    await loadEvents();
  } catch (error) {
    setStatus("event-admin-status", `Não foi possível salvar o evento: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function editEvent(id) {
  const event = events.find((item) => item.id === id);
  if (!event) throw new Error("O evento selecionado não está mais disponível.");
  eventForm.elements.namedItem("id").value = event.id;
  eventForm.elements.namedItem("event_name").value = event.event_name;
  eventForm.elements.namedItem("city").value = event.city;
  eventForm.elements.namedItem("state").value = event.state;
  eventForm.elements.namedItem("starts_on").value = event.starts_on;
  eventForm.elements.namedItem("ends_on").value = event.ends_on;
  eventForm.elements.namedItem("venue").value = event.venue || "";
  eventForm.elements.namedItem("active").checked = event.active;
  eventForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleEvent(id) {
  const event = events.find((item) => item.id === id);
  if (!event) throw new Error("O evento selecionado não está mais disponível.");
  if (event.active && !window.confirm(`Encerrar as inscrições para ${event.city}/${event.state}? O histórico será preservado.`)) return;
  const { error } = await supabase.from("event_cities")
    .update({ active: !event.active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await loadEvents();
}

function registrationDetails(registration) {
  return registration.details && typeof registration.details === "object" ? registration.details : {};
}

function normalizedDetail(value) {
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join(", ");
  return value == null ? "" : String(value).trim();
}

function renderRegistrationDetails(registration) {
  const details = registrationDetails(registration);
  const rows = detailFields
    .map(([key, label]) => [label, normalizedDetail(details[key])])
    .filter(([, value]) => value !== "");
  const disclosure = document.createElement("details");
  disclosure.className = "registration-details";
  const summary = document.createElement("summary");
  summary.textContent = "Ver dados completos da inscrição";
  const list = document.createElement("dl");
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    list.append(term, description);
  });
  disclosure.append(summary, list);
  return disclosure;
}

function renderRegistration(registration) {
  const row = document.createElement("article");
  row.className = "admin-item registration-item";
  const selectLabel = document.createElement("label");
  selectLabel.className = "admin-checkbox registration-row-select";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.registrationSelect = registration.id;
  checkbox.setAttribute("aria-label", `Selecionar inscrição de ${registration.full_name}`);
  checkbox.checked = selectedRegistrationIds.has(registration.id);
  selectLabel.append(checkbox);

  const name = document.createElement("strong");
  name.textContent = registration.full_name;
  const contact = document.createElement("span");
  contact.textContent = `${registration.email} · ${registration.phone}`;

  const statusSelect = document.createElement("select");
  statusSelect.setAttribute("aria-label", `Situação de ${registration.full_name}`);
  statusSelect.dataset.registrationStatus = registration.id;
  registrationStatuses.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    statusSelect.append(option);
  });
  statusSelect.value = registration.status;
  const statusButton = createButton("Salvar situação", "save-registration-status", registration.id);
  const exportButton = createButton("Exportar ficha (.xls)", "export-registration", registration.id);
  const registeredAt = document.createElement("span");
  registeredAt.textContent = `Inscrito em ${formatDate(registration.created_at)}`;
  const details = renderRegistrationDetails(registration);
  row.append(selectLabel, name, contact, registeredAt, statusSelect, statusButton, exportButton, details);
  return row;
}

function renderRegistrations() {
  registrationsList.replaceChildren();
  if (!registrations.length) {
    const empty = document.createElement("p");
    empty.textContent = "Não há inscrições para este filtro.";
    registrationsList.append(empty);
    updateRegistrationSelection();
    return;
  }

  const eventMap = new Map(events.map((event) => [event.id, event]));
  const groups = new Map();
  registrations.forEach((registration) => {
    const event = eventMap.get(registration.event_id) || registration.event_cities || {
      event_name: "Evento arquivado",
      city: "Cidade não disponível",
      state: "",
      starts_on: "",
      ends_on: "",
    };
    if (!groups.has(registration.event_id)) groups.set(registration.event_id, { event, registrations: [] });
    groups.get(registration.event_id).registrations.push(registration);
  });

  [...groups.values()]
    .sort((a, b) => eventLabel(a.event).localeCompare(eventLabel(b.event), "pt-BR"))
    .forEach(({ event, registrations: eventRegistrations }) => {
      eventRegistrations.sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
      const group = document.createElement("section");
      group.className = "admin-registration-group";
      const heading = document.createElement("h2");
      heading.textContent = `${event.event_name} — ${event.city}/${event.state}`;
      const count = document.createElement("p");
      count.textContent = `${eventRegistrations.length} inscrito(s)`;
      const items = document.createElement("div");
      items.className = "admin-items";
      items.append(...eventRegistrations.map(renderRegistration));
      group.append(heading, count, items);
      registrationsList.append(group);
    });

  setStatus("registration-admin-status", `${registrations.length} inscrição(ões) carregada(s).`);
  updateRegistrationSelection();
}

async function fetchAllRegistrations() {
  const eventId = registrationFilter.value;
  const rows = [];
  registrations = [];
  registrationsList.replaceChildren();
  updateRegistrationSelection();
  setStatus("registration-admin-status", "Carregando inscrições...");
  const batchSize = 1000;
  for (let offset = 0; ; offset += batchSize) {
    let query = supabase.from("event_registrations")
      .select("id,event_id,full_name,email,phone,details,status,created_at,updated_at,event_cities(event_name,city,state,starts_on,ends_on,venue)")
      .order("created_at", { ascending: false })
      .range(offset, offset + batchSize - 1);
    if (eventId) query = query.eq("event_id", eventId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < batchSize) break;
  }
  registrations = rows;
  renderRegistrations();
}

async function loadEventsPanel() {
  setStatus("event-admin-status", "Carregando eventos...");
  try {
    await loadEvents();
    setStatus("event-admin-status", `${events.length} evento(s) cadastrado(s).`);
  } catch (error) {
    setStatus("event-admin-status", `Não foi possível carregar os eventos: ${error.message}`, true);
  }
}

async function loadRegistrationsPanel() {
  setStatus("registration-admin-status", "Carregando inscrições...");
  try {
    await loadEvents();
    await fetchAllRegistrations();
  } catch (error) {
    console.error("Falha ao carregar inscrições:", error);
    setStatus("registration-admin-status", `Não foi possível carregar as inscrições: ${error.message}`, true);
  }
}

function updateRegistrationSelection() {
  const visible = [...registrationsList.querySelectorAll("[data-registration-select]")];
  const selectedCount = visible.filter((checkbox) => selectedRegistrationIds.has(checkbox.dataset.registrationSelect)).length;
  exportSelected.disabled = selectedCount === 0;
  exportSelected.textContent = selectedCount
    ? `Exportar selecionados (${selectedCount}) (.xls)`
    : "Exportar selecionados (.xls)";
  selectAll.checked = visible.length > 0 && selectedCount === visible.length;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < visible.length;
}

function registrationExportRow(registration) {
  const event = registration.event_cities || events.find((item) => item.id === registration.event_id) || {};
  const details = registrationDetails(registration);
  const row = {
    "Encontro": event.event_name || "",
    "Cidade do evento": event.city || "",
    "Estado do evento": event.state || "",
    "Data de início": formatDate(event.starts_on),
    "Data de término": formatDate(event.ends_on),
    "Local": event.venue || "",
    "Nome completo": registration.full_name,
    "E-mail": registration.email,
    "Telefone": registration.phone,
    "Situação": registrationStatuses.find(([value]) => value === registration.status)?.[1] || registration.status,
    "Data da inscrição": formatDate(registration.created_at),
  };
  detailFields.forEach(([key, label]) => {
    row[label] = normalizedDetail(details[key]);
  });
  return row;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFileName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "inscricao";
}

function exportExcel(records, filename) {
  if (!records.length) return;
  const rows = records.map(registrationExportRow);
  const columns = Object.keys(rows[0]);
  const header = `<Row>${columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(column)}</Data></Cell>`).join("")}</Row>`;
  const body = rows.map((row) =>
    `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xmlEscape(row[column])}</Data></Cell>`).join("")}</Row>`
  ).join("");
  const spreadsheet = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCEAF5" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Inscricoes"><Table>${header}${body}</Table></Worksheet></Workbook>`;
  const blob = new Blob([spreadsheet], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(filename)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function updateRegistrationStatus(id) {
  const select = registrationsList.querySelector(`[data-registration-status="${CSS.escape(id)}"]`);
  const button = registrationsList.querySelector(`[data-action="save-registration-status"][data-id="${CSS.escape(id)}"]`);
  if (!select || !button) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from("event_registrations")
      .update({ status: select.value, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    const registration = registrations.find((item) => item.id === id);
    if (registration) registration.status = select.value;
    setStatus("registration-admin-status", "Situação atualizada.");
    renderRegistrations();
  } catch (error) {
    setStatus("registration-admin-status", `Não foi possível atualizar a situação: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

export function initializeEventAdmin() {
  if (initialized) return;
  initialized = true;

  eventForm.addEventListener("submit", saveEvent);
  byId("event-new").addEventListener("click", resetEventForm);
  eventItems.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const operation = button.dataset.action === "edit-event"
      ? editEvent(button.dataset.id)
      : toggleEvent(button.dataset.id);
    operation.catch((error) => setStatus("event-admin-status", error.message, true));
  });

  document.addEventListener("admin:view-selected", (event) => {
    if (event.detail.view === "events") loadEventsPanel();
    if (event.detail.view === "registrations") loadRegistrationsPanel();
  });

  registrationFilter.addEventListener("change", () => {
    selectedRegistrationIds.clear();
    selectAll.checked = false;
    fetchAllRegistrations().catch((error) => {
      console.error("Falha ao filtrar inscrições:", error);
      setStatus("registration-admin-status", `Não foi possível carregar as inscrições: ${error.message}`, true);
    });
  });
  selectAll.addEventListener("change", () => {
    registrationsList.querySelectorAll("[data-registration-select]").forEach((checkbox) => {
      if (selectAll.checked) selectedRegistrationIds.add(checkbox.dataset.registrationSelect);
      else selectedRegistrationIds.delete(checkbox.dataset.registrationSelect);
      checkbox.checked = selectAll.checked;
    });
    updateRegistrationSelection();
  });
  registrationsList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-registration-select]");
    if (!checkbox) return;
    if (checkbox.checked) selectedRegistrationIds.add(checkbox.dataset.registrationSelect);
    else selectedRegistrationIds.delete(checkbox.dataset.registrationSelect);
    updateRegistrationSelection();
  });
  registrationsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "export-registration") {
      const registration = registrations.find((item) => item.id === button.dataset.id);
      if (registration) exportExcel([registration], `ficha-${registration.full_name}-${registration.event_cities?.city || ""}`);
    } else if (button.dataset.action === "save-registration-status") {
      updateRegistrationStatus(button.dataset.id);
    }
  });
  exportSelected.addEventListener("click", () => {
    const selected = registrations.filter((registration) => selectedRegistrationIds.has(registration.id));
    exportExcel(selected, `inscricoes-${registrationFilter.selectedOptions[0]?.textContent || "todos-eventos"}`);
  });
}
