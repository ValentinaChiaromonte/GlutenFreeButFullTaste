const INGREDIENTS_DB = [
  // Farine e Amidi
  { id: "farina_riso", name: "Farina di riso", unit: "g", staple: false },
  { id: "maizena", name: "Maizena / Amido di mais", unit: "g", staple: false },
  { id: "fecola", name: "Fecola di patate", unit: "g", staple: false },
  { id: "farina_ceci", name: "Farina di ceci", unit: "g", staple: false },
  { id: "farina_cocco", name: "Farina di cocco", unit: "g", staple: false },
  { id: "mix_farine", name: "Mix di farine", unit: "g", staple: false },
  { id: "prep_dolci", name: "Preparato per dolci", unit: "g", staple: false },
  { id: "prep_salati", name: "Preparato per salati", unit: "g", staple: false },

  // Lieviti
  { id: "lievito_dolci", name: "Lievito per dolci", unit: "g", staple: false },
  { id: "lievito_birra_secco", name: "Lievito di birra secco", unit: "g", staple: false },
  { id: "lievito_birra_fresco", name: "Lievito di birra fresco", unit: "g", staple: false },

  // Latticini e Liquidi
  { id: "latte", name: "Latte", unit: "ml", staple: false },
  { id: "burro", name: "Burro", unit: "g", staple: false },
  { id: "panna_fresca", name: "Panna fresca", unit: "ml", staple: false },
  { id: "panna_cucina", name: "Panna da cucina", unit: "ml", staple: false },
  { id: "alcool_96", name: "Alcool 96°", unit: "ml", staple: false },

  // Dolci & Dispensa
  { id: "cacao", name: "Cacao", unit: "g", staple: false },
  { id: "biscotti_secchi", name: "Biscotti secchi", unit: "g", staple: false },
  { id: "salsa", name: "Salsa / Passata", unit: "g", staple: false },
  { id: "zucchero", name: "Zucchero", unit: "g", staple: false },
  { id: "cioccolato", name: "Cioccolato fondente", unit: "g", staple: false },
  { id: "uova", name: "Uova", unit: "pz", staple: false },

  // Ingredienti base e condimenti trascurabili
  { id: "condimenti_piacere", name: "Condimenti a piacere", unit: "g", staple: true },
  { id: "sale", name: "Sale", unit: "g", staple: true },
  { id: "acqua", name: "Acqua", unit: "ml", staple: true },
  { id: "olio", name: "Olio extravergine", unit: "ml", staple: true }
];

const SUBCATS = {
  dolci: ["Festività", "Merenda"],
  salati: ["Primi", "Secondi", "Contorni", "Stuzzichini"]
};

const QUOTES = [
  "Il glutine non fa per me, io preferisco brillare!",
  "Niente glutine, tanto gusto.",
  "Celiaco ma con stile (e farina di riso).",
  "Il grano saluta, noi ci divertiamo comunque."
];

let recipes = JSON.parse(localStorage.getItem("gf_recipes")) || [];
let pantry = JSON.parse(localStorage.getItem("gf_pantry")) || {};

window.onload = () => {
  const quoteEl = document.getElementById("quote-display");
  if (quoteEl) {
    quoteEl.innerText = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
  updateSubcatOptions();
  buildPantryUI();
  renderRecipes();
};

function switchTab(tabId, btn) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(el => el.classList.remove('active'));

  const navButtons = document.querySelectorAll('nav button');
  navButtons.forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById('view-' + tabId);
  if (targetView) {
    targetView.classList.add('active');
  }

  if (btn) {
    btn.classList.add('active');
  }

  if (tabId === 'recipes') {
    renderRecipes();
  }

  window.scrollTo(0, 0);
}

function updateFileName(input) {
  const display = document.getElementById("file-name-display");
  if (!display) return;
  if (input.files && input.files[0]) {
    display.innerText = "Foto pronta per il salvataggio";
    display.style.background = "var(--c-sky-blue)";
  } else {
    display.innerText = "Carica o scatta foto";
    display.style.background = "var(--c-cream)";
  }
}

function updateSubcatOptions() {
  const macroEl = document.getElementById("rec-macro");
  const subcatContainer = document.getElementById("subcat-container");
  const subcatSelect = document.getElementById("rec-subcat");
  if (!macroEl || !subcatContainer || !subcatSelect) return;

  const macro = macroEl.value;
  subcatSelect.innerHTML = "";

  if (macro === "liquori") {
    subcatContainer.style.display = "none";
  } else {
    subcatContainer.style.display = "block";
    (SUBCATS[macro] || []).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.toLowerCase();
      opt.innerText = s;
      subcatSelect.appendChild(opt);
    });
  }
}

function updateFilterSubcatOptions() {
  const macroEl = document.getElementById("filter-macro");
  const subContainer = document.getElementById("filter-subcat-container");
  const subSelect = document.getElementById("filter-subcat");
  if (!macroEl || !subContainer || !subSelect) return;

  const macro = macroEl.value;
  subSelect.innerHTML = `<option value="tutti">Tutte le sottocategorie</option>`;

  if (macro === "dolci" || macro === "salati") {
    (SUBCATS[macro] || []).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.toLowerCase();
      opt.innerText = s;
      subSelect.appendChild(opt);
    });
    subContainer.style.display = "block";
  } else {
    subContainer.style.display = "none";
  }
}

function addIngredientField() {
  const container = document.getElementById("recipe-ingredients-form");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "ingredient-row";
  
  let opts = INGREDIENTS_DB.map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join("");
  row.innerHTML = `
    <select class="ing-select" style="flex:2">${opts}</select>
    <input type="number" class="ing-amount" placeholder="Q.tà" style="flex:1" min="1">
    <button type="button" onclick="this.parentElement.remove()" style="border:none;background:none;font-weight:bold;padding:0 6px;font-size:1.1rem;">✕</button>
  `;
  container.appendChild(row);
}

function compressImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scale = MAX_WIDTH / img.width;
        canvas.width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
        canvas.height = (img.width > MAX_WIDTH) ? (img.height * scale) : img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7)); 
      };
    };
  });
}

async function saveNewRecipe() {
  const title = document.getElementById("rec-title").value.trim();
  if (!title) return alert("Inserisci un titolo");

  const macro = document.getElementById("rec-macro").value;
  const subcat = macro === "liquori" ? null : document.getElementById("rec-subcat").value;
  const rating = Number(document.getElementById("rec-rating").value);
  const procedure = document.getElementById("rec-procedure").value;
  const photoFile = document.getElementById("rec-photo").files[0];

  const ingRows = document.querySelectorAll("#recipe-ingredients-form .ingredient-row");
  const ingredients = [];
  ingRows.forEach(row => {
    const id = row.querySelector(".ing-select").value;
    const amount = Number(row.querySelector(".ing-amount").value);
    if (amount > 0) ingredients.push({ id, amount });
  });

  const saveBtn = document.querySelector("#view-add .btn-main");
  if (saveBtn) {
    saveBtn.innerText = "Salvataggio...";
    saveBtn.disabled = true;
  }

  const photoBase64 = await compressImage(photoFile);

  recipes.push({
    id: Date.now(),
    title,
    macro,
    subcat,
    rating,
    procedure,
    photo: photoBase64,
    ingredients
  });

  localStorage.setItem("gf_recipes", JSON.stringify(recipes));
  if (saveBtn) {
    saveBtn.innerText = "Salva Ricetta";
    saveBtn.disabled = false;
  }
  alert("Ricetta salvata!");
  
  document.getElementById("rec-title").value = "";
  document.getElementById("rec-procedure").value = "";
  document.getElementById("rec-photo").value = "";
  const display = document.getElementById("file-name-display");
  if (display) {
    display.innerText = "Carica o scatta foto";
    display.style.background = "var(--c-cream)";
  }
  document.getElementById("recipe-ingredients-form").innerHTML = "";
  switchTab('recipes', document.querySelectorAll('nav button')[0]);
}

function buildPantryUI() {
  const c = document.getElementById("pantry-inputs");
  if (!c) return;
  c.innerHTML = "";
  INGREDIENTS_DB.filter(i => !i.staple).forEach(ing => {
    const val = pantry[ing.id] || 0;
    const div = document.createElement("div");
    div.className = "ingredient-row";
    div.innerHTML = `
      <span style="flex:2; font-size:0.95rem; font-weight:700;">${ing.name}</span>
      <span style="font-size:0.85rem; margin-right:6px;">${ing.unit}</span>
      <input type="number" id="pantry-${ing.id}" value="${val > 0 ? val : ''}" placeholder="0" style="flex:1; text-align:right;">
    `;
    c.appendChild(div);
  });
}

function savePantry() {
  INGREDIENTS_DB.filter(i => !i.staple).forEach(ing => {
    const el = document.getElementById("pantry-" + ing.id);
    const val = el ? Number(el.value) : 0;
    pantry[ing.id] = val > 0 ? val : 0;
  });
  localStorage.setItem("gf_pantry", JSON.stringify(pantry));
  alert("Dispensa aggiornata!");
}

function isRecipeDoable(recipe) {
  if (!recipe.ingredients || recipe.ingredients.length === 0) return true;
  return recipe.ingredients.every(item => {
    const info = INGREDIENTS_DB.find(i => i.id === item.id);
    if (info && info.staple) return true;
    const available = pantry[item.id] || 0;
    return available >= item.amount;
  });
}

function renderRecipes() {
  const list = document.getElementById("recipe-list");
  if (!list) return;
  list.innerHTML = "";

  const toggleEl = document.getElementById("toggle-doable");
  const onlyDoable = toggleEl ? toggleEl.checked : false;

  const macroFilterEl = document.getElementById("filter-macro");
  const macroFilter = macroFilterEl ? macroFilterEl.value : "tutti";

  const subcatSelect = document.getElementById("filter-subcat");
  const subcatFilter = subcatSelect ? subcatSelect.value : "tutti";

  const filtered = recipes.filter(r => {
    if (macroFilter !== "tutti" && r.macro !== macroFilter) return false;
    if (subcatFilter !== "tutti" && (r.macro === "dolci" || r.macro === "salati")) {
      if (r.subcat !== subcatFilter) return false;
    }
    if (onlyDoable && !isRecipeDoable(r)) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p style="text-align:center; margin-top:24px; font-size:1.1rem; font-weight:700;">Nessuna ricetta trovata</p>`;
    return;
  }

  filtered.forEach(r => {
    const doable = isRecipeDoable(r);
    const card = document.createElement("div");
    card.className = "recipe-card";
    card.onclick = () => openRecipeModal(r.id);
    
    const imgHtml = r.photo 
      ? `<img src="${r.photo}" class="recipe-img">`
      : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;">🍽️</div>`;

    card.innerHTML = `
      <div class="recipe-card-img-container">
        ${imgHtml}
      </div>
      <div class="recipe-body">
        <div>
          <h4 class="recipe-title">${r.title}</h4>
          <div>
            <div class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
            <div class="recipe-tags">
              <span class="badge badge-macro">${r.macro}</span>
              ${r.subcat ? `<span class="badge badge-sub">${r.subcat}</span>` : ''}
              ${doable ? `<span class="badge badge-doable">Fattibile</span>` : ''}
            </div>
          </div>
        </div>
        <div style="font-size:0.8rem; margin-top:6px; font-weight:600;">
          ${r.ingredients.length} ingredienti (tocca per aprire)
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function openRecipeModal(recipeId) {
  const r = recipes.find(item => item.id === recipeId);
  if (!r) return;

  const doable = isRecipeDoable(r);
  const body = document.getElementById("modal-body");
  if (!body) return;

  const ingredientsListHtml = r.ingredients.map(i => {
    const info = INGREDIENTS_DB.find(db => db.id === i.id);
    const name = info ? info.name : i.id;
    const unit = info ? info.unit : '';
    return `<div class="modal-ingredient-item">• ${name}: <strong>${i.amount} ${unit}</strong></div>`;
  }).join("");

  body.innerHTML = `
    ${r.photo ? `<img src="${r.photo}" class="modal-img">` : ''}
    <h3 class="modal-title">${r.title}</h3>
    <div style="margin-bottom: 10px;">
      <span class="badge badge-macro">${r.macro.toUpperCase()}</span>
      ${r.subcat ? `<span class="badge badge-sub">${r.subcat.toUpperCase()}</span>` : ''}
      ${doable ? `<span class="badge badge-doable">FATTIBILE ORA</span>` : ''}
    </div>
    <div class="stars" style="font-size: 1.2rem; margin-bottom: 12px;">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>

    <div class="modal-section-title">Ingredienti</div>
    <div style="margin-bottom: 14px;">${ingredientsListHtml.length > 0 ? ingredientsListHtml : '<p>Nessun ingrediente inserito.</p>'}</div>

    <div class="modal-section-title">Procedimento</div>
    <div class="modal-procedure-text">${r.procedure ? r.procedure : 'Nessun procedimento inserito.'}</div>
  `;

  const modal = document.getElementById("recipe-modal");
  if (modal) modal.classList.add("open");
}

function closeRecipeModal() {
  const modal = document.getElementById("recipe-modal");
  if (modal) modal.classList.remove("open");
}

function closeModalOnBackdrop(event) {
  if (event.target.id === "recipe-modal") {
    closeRecipeModal();
  }
}