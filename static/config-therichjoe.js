// File: static/config–therichjoe.js
// Purpose: Per-client configuration for "therichjoe", injected before widget loads

window.__247CONVO_CONFIG__ = {
  chatbotName: "JoeBot",
  brandName: "The Rich Joe",
  supportUrl: "https://therichjoe.com/contact",
  primaryColor: "#1A1A1A",
  accentColor: "#E2B007",
  lightAccent: "#FFF8E0",
  buttonColor: "#FF6F00",
  textLight: "#F5F5F5",
  avatarUrl: "https://two47convo.onrender.com/avatar.png",
  quickOption1: "What services do you offer?",
  quickOption2: "How can I get started?",
  quickOption3: "Book Appointment",
  token: "247convobot-2025",
  client_id: "therichjoe",
  meetingDuration: "30",
  // === 1. Personalized Greetings ===
  greetingTextMorning: "Good morning!",
  greetingTextAfternoon: "Good afternoon!",
  greetingTextEvening: "Good evening!",
  greetingIntro: "What’s your name?",       // Used after greeting for first-time users
  askEmail: "Now, what’s your email?",      // After name
  bubbleMessage: "Need help? Ask JoeBot.",
  
  // === 2. Proactive Messages ===
  "proactive": {
  "bubble": "Not sure where to start? Click here to chat!",
  "timeOnPage": "How can I help you today?",
  "exitIntent": "Leaving already? Any last questions?",
  "scrollDepth": "Questions so far? Ask me!"
  },

  // === 3. Rating Widget ===
  "ratingPrompt": "How would you rate this experience?",
  "ratingThanks": "Thank you for your feedback!",
  "ratingError": "⚠️ Couldn't send your rating.",

  // === 4. Memory & History ===
  "memoryLimit": 5,      // Number of Q&A turns to remember per session

  // === 5. Handoff (for human agent transfer) ===
  "handoff": {
    "intro": "Connecting you to a human agent...",
    "whatsapp": "<a href='https://wa.me/234XXXXXXXXXX'>Chat with us on WhatsApp</a>"
  },

  // ─── NEW: which provider to use for booking ("zoom", "google", or "microsoft")
  bookingProvider: "google",
  availableHours: {
    monday: ["09:00", "17:00"],
    tuesday: ["10:00", "16:00"],
    wednesday: ["09:00", "15:00"],
    thursday: ["10:00", "14:00"],
    friday: ["11:00", "18:00"]
  }
};
