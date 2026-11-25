import { isSupabaseConfigured, supabase, validateSupabaseApiKey } from "./supabase.js";

const form = document.querySelector("#event-registration-form");
const eventSelect = document.querySelector("#signup-event");
const loadingStatus = document.querySelector("#event-loading");
const registrationStatus = document.querySelector("#registration-status");
const submitButton = form?.querySelector('[type="submit"]');

function showStatus(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle("is-error", isError);
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function eventLabel(event) {
  const dateLabel = event.starts_on === event.ends_on
    ? formatDate(event.starts_on)
    : `${formatDate(event.starts_on)} a ${formatDate(event.ends_on)}`;
  const venue = event.venue ? ` · ${event.venue}` : "";
  return `${event.event_name} — ${event.city}/${event.state} · ${dateLabel}${venue}`;
}

async function loadOpenEvents() {
  if (!isSupabaseConfigured || !supabase) {
    showStatus(loadingStatus, "As inscrições estão indisponíveis no momento. Tente novamente mais tarde.", true);
    return;
  }
  try {
    await validateSupabaseApiKey();
    const { data, error } = await supabase.from("event_cities")
      .select("id,event_name,city,state,starts_on,ends_on,venue")
      .eq("active", true)
      .order("starts_on", { ascending: true });
    if (error) throw error;

    (data || []).forEach((event) => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = eventLabel(event);
      eventSelect.append(option);
    });

    if (data?.length) {
      showStatus(loadingStatus, "Selecione o encontro em que deseja participar.");
      submitButton.disabled = false;
    } else {
      showStatus(loadingStatus, "Não há inscrições abertas no momento. Acompanhe nossas notícias para saber das próximas datas.");
    }
  } catch (error) {
    console.error("Não foi possível carregar os encontros disponíveis:", error);
    showStatus(loadingStatus, "Não foi possível carregar os encontros. Atualize a página ou tente novamente mais tarde.", true);
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || submitButton.disabled) return;

  const buttonLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";
  form.setAttribute("aria-busy", "true");
  showStatus(registrationStatus, "");

  try {
    const values = Object.fromEntries(new FormData(form).entries());
    const details = {
      birth_date: values.birth_date,
      whatsapp: values.phone,
      address_street: values.address_street,
      address_number: values.address_number,
      address_complement: values.address_complement,
      address_neighborhood: values.address_neighborhood,
      postal_code: values.postal_code,
      address_city: values.address_city,
      address_state: values.address_state,
      departure_city: values.departure_city,
      transport_needed: form.elements.namedItem("transport_needed").checked,
      emergency_name: values.emergency_name,
      emergency_relationship: values.emergency_relationship,
      emergency_phone: values.emergency_phone,
      emergency_phone_backup: values.emergency_phone_backup,
      dietary_restrictions: values.dietary_restrictions,
      dietary_details: values.dietary_details,
      food_allergies: values.food_allergies,
      health_notes: values.health_notes,
      medications: values.medications,
      accessibility_needs: values.accessibility_needs,
      additional_notes: values.additional_notes,
      consent_given: form.elements.namedItem("privacy_consent").checked,
    };
    const { error } = await supabase.from("event_registrations").insert({
      event_id: values.event_id,
      full_name: values.full_name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      details,
    });
    if (error) throw error;

    form.reset();
    showStatus(registrationStatus, "Inscrição enviada. Obrigado! A equipe do Instituto Canopus entrará em contato.");
  } catch (error) {
    console.error("Não foi possível enviar a inscrição:", error);
    showStatus(registrationStatus, "Não foi possível enviar sua inscrição. Confira os dados e tente novamente.", true);
  } finally {
    submitButton.disabled = eventSelect.options.length <= 1;
    submitButton.textContent = buttonLabel;
    form.removeAttribute("aria-busy");
  }
});

loadOpenEvents();
