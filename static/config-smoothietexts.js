// File: static/config–therichjoe.js

window.__247CONVO_CONFIG__ = {
  chatbotName: "Mr. Smoothie",
  brandName: "SmoothieTexts",
  supportUrl: "https://smoothietexts.com",
  primaryColor: "#1d5e79",
  accentColor: "#800080",
  lightAccent: "#d9b3ff",
  buttonColor: "#800080",
  textLight: "#f9f9f9",
  avatarUrl: "https://two47convo.onrender.com/avatar.png",
  token: "smoothietexts",
  client_id: "smoothietexts",
  client_email: "jacksilva87@gmail.com",
  meetingDuration: "30",
  bookingProvider: "google",
  timezone: "America/New_York",
  availableHours: {
    monday: ["09:00", "17:00"],
    tuesday: ["10:00", "16:00"],
    wednesday: ["09:00", "15:00"],
    thursday: ["10:00", "14:00"],
    friday: ["11:00", "18:00"]
  },
  memoryLimit: 5,
  handoff: {
    intro: "Connecting you to a human agent...",
    whatsapp: "<a href='https://wa.me/234XXXXXXXXXX'>Chat with us on WhatsApp</a>"
  },
  // =========== MULTI-LANGUAGE PACK =============
  // ...everything above stays the same...

lang_pack: {
  en: {
    // --- Greetings and Prompts ---
    greeting: "Good morning!",
    greeting_afternoon: "Good afternoon!",
    greeting_evening: "Good evening!",
    greeting_intro: "What’s your name?",
    ask_email: "Now, what’s your email?",

    // --- Widget/UI/Proactive ---
    bubble: "Need help? Ask Mr. Smoothie.",
    proactive_bubble: "Not sure where to start? Click here to chat!",
    proactive_timeOnPage: "How can I help you today?",
    proactive_exitIntent: "Leaving already? Any last questions?",
    proactive_scrollDepth: "Questions so far? Ask me!",

    // --- Quick options ---
    quick_1: "What is SmoothieTexts",
    quick_2: "How can I get started?",
    quick_3: "Why do you need my card?",

    // --- Booking/Lead/Calendar ---
    book_lead_prompt: "Before booking, may I have your name and email?",
    book_timezones: "All available times are shown in <b>your local timezone</b>: {userTZ}.<br>Business location timezone: <b>{bizTZ}</b>.",
    book_times_for_date: "Available times for {date}:",
    book_confirm_details: "Confirm booking:<br><b>{userTime} (your time: {userTZ})</b><br><b>{bizTime} (business time: {bizTZ})</b><br>Duration: {duration} min",
    book_in_progress: "Booking your appointment…",
    book_cancelled: "Booking cancelled.",
    book_no_slots: "No available slots for that date. Please pick another day.",
    book_confirm: "Proceed with this booking? (yes/no)",
    book_purpose: "What’s the purpose of this meeting?",
    book_success: "✅ Appointment booked!<br><a href=\"{link}\" target=\"_blank\">View details</a><br>You'll receive a confirmation email.",
    book_fail: "⚠️ Couldn’t complete booking. Please try again.",
    date_placeholder: "Click to select date 📅",
    date_helptext: "(Only available dates can be selected. Use the calendar.)",

    // --- Lead/Thank You/Name ---
    lead_thanks: "✅ Thanks, {name}! I’m {bot}. How can I help?",

    // --- Rating/Feedback ---
    rating_prompt: "How would you rate this experience?",
    rating_thanks: "Thank you for your feedback!",
    rating_error: "⚠️ Couldn't send your rating.",

    // --- Handoff/Human agent ---
    handoff_intro: "Connecting you to a human agent...",
    handoff_whatsapp: "<a href='https://wa.me/234XXXXXXXXXX'>Chat with us on WhatsApp</a>",

    // --- UI Labels ---
    send: "Send",
    input_placeholder: "Type your message…",
    support_link: "📞 Need more help? Contact Support",
    select_date: "Select a date:",
    pick_time: "Pick a time (all shown in your local timezone: {tz}):",
    cancel: "Cancel",
    confirmation_view: "View details",
    language: "Language",

    // --- Errors/Edge Cases ---
    error_email: "Please enter a valid email address.",
    error_name: "Please enter your name.",
    error_missing: "This field is required.",
    error_generic: "Sorry, something went wrong. Please try again.",
    no_response: "No response from bot."
  },

  fr: {
    greeting: "Bonjour !",
    greeting_afternoon: "Bon après-midi !",
    greeting_evening: "Bonsoir !",
    greeting_intro: "Quel est votre nom ?",
    ask_email: "Maintenant, quel est votre e-mail ?",
    bubble: "Besoin d'aide ? Demandez à JoeBot.",
    proactive_bubble: "Vous ne savez pas par où commencer ? Cliquez ici pour discuter !",
    proactive_timeOnPage: "Comment puis-je vous aider aujourd'hui ?",
    proactive_exitIntent: "Vous partez déjà ? Dernières questions ?",
    proactive_scrollDepth: "Des questions jusqu'à présent ? Demandez-moi !",
    quick_1: "Quels services proposez-vous ?",
    quick_2: "Comment puis-je commencer ?",
    quick_3: "Prendre rendez-vous",

    // Booking/Lead
    book_lead_prompt: "Avant de réserver, puis-je avoir votre nom et votre e-mail ?",
    book_timezones: "Toutes les heures disponibles sont affichées dans <b>votre fuseau horaire local</b> : {userTZ}.<br>Fuseau horaire de l'entreprise : <b>{bizTZ}</b>.",
    book_times_for_date: "Heures disponibles pour {date} :",
    book_confirm_details: "Confirmer la réservation :<br><b>{userTime} (votre heure : {userTZ})</b><br><b>{bizTime} (heure de l'entreprise : {bizTZ})</b><br>Durée : {duration} min",
    book_in_progress: "Réservation de votre rendez-vous…",
    book_cancelled: "Réservation annulée.",
    book_no_slots: "Aucun créneau disponible pour cette date. Veuillez en choisir une autre.",
    book_confirm: "Continuer avec cette réservation ? (oui/non)",
    book_purpose: "Quel est le but de cette réunion ?",
    book_success: "✅ Rendez-vous réservé !<br><a href=\"{link}\" target=\"_blank\">Voir les détails</a><br>Vous recevrez un e-mail de confirmation.",
    book_fail: "⚠️ Impossible de compléter la réservation. Veuillez réessayer.",
    date_placeholder: "Cliquez pour sélectionner une date 📅",
    date_helptext: "(Seules les dates disponibles peuvent être sélectionnées. Utilisez le calendrier.)",

    // Lead
    lead_thanks: "✅ Merci, {name} ! Je suis {bot}. Comment puis-je vous aider ?",

    rating_prompt: "Comment évalueriez-vous cette expérience ?",
    rating_thanks: "Merci pour vos commentaires !",
    rating_error: "⚠️ Impossible d'envoyer votre note.",
    handoff_intro: "Nous vous mettons en relation avec un agent humain...",
    handoff_whatsapp: "<a href='https://wa.me/234XXXXXXXXXX'>Discutez avec nous sur WhatsApp</a>",
    send: "Envoyer",
    input_placeholder: "Tapez votre message…",
    support_link: "📞 Besoin d'aide ? Contactez le support",
    select_date: "Sélectionnez une date :",
    pick_time: "Choisissez une heure (toutes affichées dans votre fuseau horaire : {tz}) :",
    cancel: "Annuler",
    confirmation_view: "Voir les détails",
    language: "Langue",

    error_email: "Veuillez entrer une adresse e-mail valide.",
    error_name: "Veuillez entrer votre nom.",
    error_missing: "Ce champ est requis.",
    error_generic: "Désolé, une erreur est survenue. Veuillez réessayer.",
    no_response: "Aucune réponse du bot."
  },

  es: {
    greeting: "¡Buenos días!",
    greeting_afternoon: "¡Buenas tardes!",
    greeting_evening: "¡Buenas noches!",
    greeting_intro: "¿Cómo te llamas?",
    ask_email: "Ahora, ¿cuál es tu correo electrónico?",
    bubble: "¿Necesitas ayuda? Pregunta a JoeBot.",
    proactive_bubble: "¿No sabes por dónde empezar? ¡Haz clic aquí para chatear!",
    proactive_timeOnPage: "¿Cómo puedo ayudarte hoy?",
    proactive_exitIntent: "¿Ya te vas? ¿Alguna pregunta final?",
    proactive_scrollDepth: "¿Preguntas hasta ahora? ¡Pregúntame!",
    quick_1: "¿Qué servicios ofrecen?",
    quick_2: "¿Cómo puedo empezar?",
    quick_3: "Reservar cita",

    book_lead_prompt: "Antes de reservar, ¿puedo tener tu nombre y correo electrónico?",
    book_timezones: "Todas las horas disponibles se muestran en <b>tu zona horaria local</b>: {userTZ}.<br>Zona horaria del negocio: <b>{bizTZ}</b>.",
    book_times_for_date: "Horas disponibles para {date}:",
    book_confirm_details: "Confirmar reserva:<br><b>{userTime} (tu hora: {userTZ})</b><br><b>{bizTime} (hora del negocio: {bizTZ})</b><br>Duración: {duration} min",
    book_in_progress: "Reservando tu cita…",
    book_cancelled: "Reserva cancelada.",
    book_no_slots: "No hay horarios disponibles para esa fecha. Elija otro día.",
    book_confirm: "¿Continuar con esta reserva? (sí/no)",
    book_purpose: "¿Cuál es el propósito de esta reunión?",
    book_success: "✅ ¡Cita reservada!<br><a href=\"{link}\" target=\"_blank\">Ver detalles</a><br>Recibirás un correo de confirmación.",
    book_fail: "⚠️ No se pudo completar la reserva. Por favor, inténtalo de nuevo.",
    date_placeholder: "Haz clic para seleccionar la fecha 📅",
    date_helptext: "(Solo se pueden seleccionar las fechas disponibles. Usa el calendario.)",

    lead_thanks: "✅ ¡Gracias, {name}! Soy {bot}. ¿Cómo puedo ayudarte?",

    rating_prompt: "¿Cómo calificarías esta experiencia?",
    rating_thanks: "¡Gracias por tus comentarios!",
    rating_error: "⚠️ No se pudo enviar tu calificación.",
    handoff_intro: "Conectándote con un agente humano...",
    handoff_whatsapp: "<a href='https://wa.me/234XXXXXXXXXX'>Chatea con nosotros en WhatsApp</a>",
    send: "Enviar",
    input_placeholder: "Escribe tu mensaje…",
    support_link: "📞 ¿Necesitas más ayuda? Contacta soporte",
    select_date: "Seleccione una fecha:",
    pick_time: "Elige una hora (todas en tu zona horaria: {tz}):",
    cancel: "Cancelar",
    confirmation_view: "Ver detalles",
    language: "Idioma",

    error_email: "Por favor ingresa una dirección de correo válida.",
    error_name: "Por favor ingresa tu nombre.",
    error_missing: "Este campo es obligatorio.",
    error_generic: "Lo siento, algo salió mal. Por favor, inténtalo de nuevo.",
    no_response: "Sin respuesta del bot."
  }
}
// ...rest of your config stays the same...
};
