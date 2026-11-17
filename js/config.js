// =========================================================
// CONFIGURAZIONE SUPABASE E COSTANTI GLOBALI
// =========================================================
const SUPABASE_URL = "https://dggidzqiwzynldamgaxc.supabase.co";
const SUPABASE_ANON_KEY = "INSERISCI_QUI_LA_TUA_PUBLISHABLE_O_ANON_KEY";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage
  }
});

const BASE_INGREDIENTS = [
  { id: "farina_riso", name: "Farina di riso", unit: "g", staple: false },
  { id: "maizena", name: "Amido di mais", unit: "g", staple: false },
  { id: "fecola", name: "Fecola di patate", unit: "g", staple: false },
  { id: "farina_ceci", name: "Farina di ceci", unit: "g", staple: false },
  { id: "farina_cocco", name: "Farina di cocco", unit: "g", staple: false },
  { id: "mix_farine", name: "Mix di farine", unit: "g", staple: false },
  { id: "prep_dolci", name: "Preparato per dolci", unit: "g", staple: false },
  { id: "prep_salati", name: "Preparato per salati", unit: "g", staple: false },
  { id: "lievito_dolci", name: "Lievito per dolci", unit: "g", staple: false },
  { id: "lievito_birra_secco", name: "Lievito di birra secco", unit: "g", staple: false },
  { id: "lievito_birra_fresco", name: "Lievito di birra fresco", unit: "g", staple: false },
  { id: "latte", name: "Latte", unit: "ml", staple: false },
  { id: "burro", name: "Burro", unit: "g", staple: false },
  { id: "panna_fresca", name: "Panna fresca", unit: "ml", staple: false },
  { id: "panna_cucina", name: "Panna da cucina", unit: "ml", staple: false },
  { id: "cacao", name: "Cacao", unit: "g", staple: false },
  { id: "biscotti_secchi", name: "Biscotti secchi", unit: "g", staple: false },
  { id: "zucchero", name: "Zucchero", unit: "g", staple: false },
  { id: "zucchero_velo", name: "Zucchero a velo", unit: "g", staple: false },
  { id: "cioccolato", name: "Cioccolato fondente", unit: "g", staple: false },
  { id: "uova", name: "Uova", unit: "pz", staple: false },
  { id: "condimenti_piacere", name: "Condimenti a piacere", unit: "g", staple: true },
  { id: "acqua", name: "Acqua", unit: "ml", staple: true },
  { id: "olio_oliva", name: "Olio extravergine d'oliva", unit: "ml", staple: true },
  { id: "olio_semi", name: "Olio di semi", unit: "ml", staple: true }
];

const SUBCATS = {
  dolci: ["Biscotti", "Merenda", "Torte", "Feste"],
  salati: ["Primi", "Secondi", "Cena", "Contorni", "Stuzzichini"]
};

// Stato globale condiviso
let currentUser = null;
let currentProfile = null;
let customIngredients = [];
let INGREDIENTS_DB = [...BASE_INGREDIENTS];
let recipes = [];
let pantry = {};
let friendships = [];

function showToast(message, duration = 1800) {
  const existingToast = document.querySelector(".toast-notification");
  if (existingToast) existingToast.remove();

  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}