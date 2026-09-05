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
  { id: "salsa", name: "Salsa / Passata", unit: "g", staple: false },
  { id: "zucchero", name: "Zucchero", unit: "g", staple: false },
  { id: "zucchero_velo", name: "Zucchero a velo", unit: "g", staple: false },
  { id: "cioccolato", name: "Cioccolato fondente", unit: "g", staple: false },
  { id: "uova", name: "Uova", unit: "pz", staple: false },
  { id: "condimenti_piacere", name: "Condimenti a piacere", unit: "g", staple: true },
  { id: "sale", name: "Sale", unit: "g", staple: true },
  { id: "acqua", name: "Acqua", unit: "ml", staple: true },
  { id: "olio_oliva", name: "Olio extravergine d'oliva", unit: "ml", staple: true },
  { id: "olio_semi", name: "Olio di semi", unit: "ml", staple: true }
];

// Caricamento ingredienti personalizzati da memoria
let customIngredients = JSON.parse(localStorage.getItem("gf_custom_ingredients")) || [];
let INGREDIENTS_DB = [...BASE_INGREDIENTS, ...customIngredients];

const SUBCATS = {
  dolci: ["Festività", "Merenda"],
  salati: ["Primi", "Secondi", "Contorni", "Stuzzichini"]
};

let recipes = JSON.parse(localStorage.getItem("gf_recipes")) || [];
let pantry = JSON.parse(localStorage.getItem("gf_pantry")) || {};
let editingRecipeId = null;

let wakeLockSentinel = null;
let timerInterval = null;
let timerSecondsRemaining = 0;
let currentOpenRecipe = null;
let currentModalServings = 4;

window.onload = () => {
  updateSubcatOptions();
  buildPantryUI();
  renderRecipes();

  const modalEl = document.getElementById("recipe-modal");
  if (modalEl) {
    modalEl.addEventListener("click", (e) => {
      if (e.target.id === "recipe-modal") closeRecipeModal();
    });
  }
};

function switchTab(tabId, btn) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(el => el.classList.remove('active'));

  const navButtons = document.querySelectorAll('nav button');
  navButtons.forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById('view-' + tabId);
  if (targetView) targetView.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tabId === 'recipes') renderRecipes();
  if (tabId !== 'add' && editingRecipeId !== null) resetAddForm();

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
  const subcatSelect = document.getElementById("rec-subcat");
  if (!macroEl || !subcatSelect) return;

  const macro = macroEl.value;
  subcatSelect.innerHTML = "";

  (SUBCATS[macro] || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.toLowerCase();
    opt.innerText = s;
    subcatSelect.appendChild(opt);
  });
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

// Opzioni ordinate alfabeticamente A-Z per nome
function getIngredientOptionsHtml(selectedId = null) {
  let html = `<option value="">-- Seleziona --</option>`;
  html += `<option value="__NEW__" style="font-weight: bold; background-color: var(--c-sky-blue);">➕ + Nuovo ingrediente...</option>`;
  
  const sortedIngredients = [...INGREDIENTS_DB].sort((a, b) => 
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
  );

  html += sortedIngredients.map(i => `<option value="${i.id}" ${selectedId === i.id ? 'selected' : ''}>${i.name} (${i.unit})</option>`).join("");
  return html;
}

function handleIngredientSelectChange(selectEl) {
  if (selectEl.value === "__NEW__") {
    const name = prompt("Nome del nuovo ingrediente:");
    if (!name || !name.trim()) {
      selectEl.value = "";
      return;
    }

    let unit = prompt("Unità di misura (es. g, ml, pz):", "g");
    unit = unit ? unit.trim().toLowerCase() : "g";

    const cleanName = name.trim();
    const id = "custom_" + Date.now();
    const newIng = { id, name: cleanName, unit, staple: false };

    customIngredients.push(newIng);
    INGREDIENTS_DB.push(newIng);
    localStorage.setItem("gf_custom_ingredients", JSON.stringify(customIngredients));

    document.querySelectorAll("#recipe-ingredients-form .ing-select").forEach(sel => {
      const curVal = sel.value;
      sel.innerHTML = getIngredientOptionsHtml(curVal === "__NEW__" ? id : curVal);
    });

    selectEl.value = id;
    buildPantryUI();
  }
}

function addIngredientField(presetId = null, presetAmount = "") {
  const container = document.getElementById("recipe-ingredients-form");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "ingredient-row";
  
  row.innerHTML = `
    <select class="ing-select" style="flex:2" onchange="handleIngredientSelectChange(this)">
      ${getIngredientOptionsHtml(presetId)}
    </select>
    <input type="number" class="ing-amount" placeholder="Q.tà" value="${presetAmount}" style="flex:1" min="1">
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
        const MAX_WIDTH = 600;
        const scale = MAX_WIDTH / img.width;
        canvas.width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
        canvas.height = (img.width > MAX_WIDTH) ? (img.height * scale) : img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };
      img.onerror = () => resolve(null);
    };
    reader.onerror = () => resolve(null);
  });
}

function resetAddForm() {
  editingRecipeId = null;
  document.getElementById("rec-title").value = "";
  document.getElementById("rec-procedure").value = "";
  document.getElementById("rec-photo").value = "";
  document.getElementById("rec-rating").value = "5";
  document.getElementById("rec-servings").value = "1";
  const timerInput = document.getElementById("rec-timer-min");
  if (timerInput) timerInput.value = "";
  document.getElementById("recipe-ingredients-form").innerHTML = "";

  const titlePage = document.querySelector("#view-add .page-title");
  if (titlePage) titlePage.innerText = "Nuova Ricetta";

  const saveBtn = document.querySelector("#view-add .btn-main");
  if (saveBtn) saveBtn.innerText = "Salva Ricetta";

  const display = document.getElementById("file-name-display");
  if (display) {
    display.innerText = "Carica o scatta foto";
    display.style.background = "var(--c-cream)";
  }
}

async function saveNewRecipe() {
  const title = document.getElementById("rec-title").value.trim();
  if (!title) return alert("Inserisci un titolo");

  const macro = document.getElementById("rec-macro").value;
  const subcat = document.getElementById("rec-subcat").value;
  const rating = Number(document.getElementById("rec-rating").value);
  const servings = Number(document.getElementById("rec-servings").value) || 1;
  
  const timerInput = document.getElementById("rec-timer-min");
  const timerMinutesVal = timerInput ? timerInput.value.trim() : "";
  const timerMinutes = timerMinutesVal ? Number(timerMinutesVal) : null;

  const procedure = document.getElementById("rec-procedure").value;
  const photoFile = document.getElementById("rec-photo").files[0];

  const ingRows = document.querySelectorAll("#recipe-ingredients-form .ingredient-row");
  const ingredients = [];
  ingRows.forEach(row => {
    const id = row.querySelector(".ing-select").value;
    const amount = Number(row.querySelector(".ing-amount").value);
    if (id && id !== "__NEW__" && amount > 0) {
      ingredients.push({ id, amount });
    }
  });

  const saveBtn = document.querySelector("#view-add .btn-main");
  if (saveBtn) {
    saveBtn.innerText = "Salvataggio...";
    saveBtn.disabled = true;
  }

  let photoBase64 = null;
  if (photoFile) {
    photoBase64 = await compressImage(photoFile);
  } else if (editingRecipeId !== null) {
    const existing = recipes.find(r => String(r.id) === String(editingRecipeId));
    if (existing) photoBase64 = existing.photo;
  }

  if (editingRecipeId !== null) {
    const index = recipes.findIndex(r => String(r.id) === String(editingRecipeId));
    if (index !== -1) {
      recipes[index] = {
        id: editingRecipeId,
        title,
        macro,
        subcat,
        servings,
        timerMinutes,
        rating,
        procedure,
        photo: photoBase64,
        ingredients
      };
    }
    alert("Ricetta aggiornata con successo!");
  } else {
    recipes.push({
      id: Date.now(),
      title,
      macro,
      subcat,
      servings,
      timerMinutes,
      rating,
      procedure,
      photo: photoBase64,
      ingredients
    });
    alert("Ricetta salvata!");
  }

  localStorage.setItem("gf_recipes", JSON.stringify(recipes));
  if (saveBtn) saveBtn.disabled = false;
  
  resetAddForm();
  switchTab('recipes', document.querySelectorAll('nav button')[0]);
}

function editRecipe(recipeId) {
  const r = recipes.find(item => String(item.id) === String(recipeId));
  if (!r) return;

  closeRecipeModal();
  editingRecipeId = r.id;

  document.getElementById("rec-title").value = r.title;
  document.getElementById("rec-macro").value = r.macro;
  updateSubcatOptions();

  if (r.subcat) document.getElementById("rec-subcat").value = r.subcat;
  document.getElementById("rec-rating").value = r.rating;
  document.getElementById("rec-servings").value = r.servings || 1;
  
  const timerInput = document.getElementById("rec-timer-min");
  if (timerInput) timerInput.value = r.timerMinutes || "";

  document.getElementById("rec-procedure").value = r.procedure;

  const container = document.getElementById("recipe-ingredients-form");
  container.innerHTML = "";
  r.ingredients.forEach(ing => {
    addIngredientField(ing.id, ing.amount);
  });

  const display = document.getElementById("file-name-display");
  if (display) {
    display.innerText = r.photo ? "Foto presente (clicca per sostituire)" : "Carica o scatta foto";
    display.style.background = r.photo ? "var(--c-sky-blue)" : "var(--c-cream)";
  }

  const titlePage = document.querySelector("#view-add .page-title");
  if (titlePage) titlePage.innerText = "Modifica";

  const saveBtn = document.querySelector("#view-add .btn-main");
  if (saveBtn) saveBtn.innerText = "Aggiorna";

  switchTab('add', document.querySelectorAll('nav button')[2]);
}

function deleteRecipe(recipeId) {
  const r = recipes.find(item => String(item.id) === String(recipeId));
  if (!r) return;

  if (confirm(`Sei sicuro di voler eliminare la ricetta "${r.title}"?`)) {
    recipes = recipes.filter(item => String(item.id) !== String(recipeId));
    localStorage.setItem("gf_recipes", JSON.stringify(recipes));
    closeRecipeModal();
    renderRecipes();
    alert("Ricetta eliminata.");
  }
}

function buildPantryUI() {
  const c = document.getElementById("pantry-inputs");
  if (!c) return;
  c.innerHTML = "";

  const pantryIngredients = INGREDIENTS_DB
    .filter(i => !i.staple)
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));

  pantryIngredients.forEach(ing => {
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

  const keyword = (document.getElementById("search-keyword")?.value || "").toLowerCase().trim();
  const toggleEl = document.getElementById("toggle-doable");
  const onlyDoable = toggleEl ? toggleEl.checked : false;

  const macroFilterEl = document.getElementById("filter-macro");
  const macroFilter = macroFilterEl ? macroFilterEl.value : "tutti";

  const subcatSelect = document.getElementById("filter-subcat");
  const subcatFilter = subcatSelect ? subcatSelect.value : "tutti";

  const filtered = recipes.filter(r => {
    if (keyword) {
      const matchTitle = r.title.toLowerCase().includes(keyword);
      const matchIngredient = (r.ingredients || []).some(i => {
        const info = INGREDIENTS_DB.find(db => db.id === i.id);
        return info && info.name.toLowerCase().includes(keyword);
      });
      if (!matchTitle && !matchIngredient) return false;
    }

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
    
    card.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openRecipeModal(r.id);
    });

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
            <div class="stars">${"★".repeat(r.rating || 5)}${"☆".repeat(5 - (r.rating || 5))}</div>
            <div class="recipe-tags">
              <span class="badge badge-macro">${r.macro}</span>
              ${r.subcat ? `<span class="badge badge-sub">${r.subcat}</span>` : ''}
              ${doable ? `<span class="badge badge-doable">Fattibile</span>` : ''}
            </div>
          </div>
        </div>
        <div style="font-size:0.8rem; margin-top:6px; font-weight:600;">
          ${(r.ingredients || []).length} ingredienti • ${r.servings || 1} porzioni
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

/* --- DETTAGLIO SCHEDA RICETTA --- */

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (err) {}
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

function openRecipeModal(recipeId) {
  const r = recipes.find(item => String(item.id) === String(recipeId));
  if (!r) return;

  currentOpenRecipe = r;
  currentModalServings = r.servings || 1;

  requestWakeLock();
  renderModalContent();

  const modal = document.getElementById("recipe-modal");
  if (modal) modal.classList.add("open");
}

function renderModalContent() {
  const r = currentOpenRecipe;
  if (!r) return;

  const doable = isRecipeDoable(r);
  const body = document.getElementById("modal-body");
  if (!body) return;

  const baseServings = r.servings || 1;
  const ratio = currentModalServings / baseServings;

  const ingredientsListHtml = (r.ingredients || []).map(i => {
    const info = INGREDIENTS_DB.find(db => db.id === i.id);
    const name = info ? info.name : i.id;
    const unit = info ? info.unit : '';
    let scaledAmount = Math.round(i.amount * ratio * 10) / 10;
    return `<div class="modal-ingredient-item">• ${name}: <strong>${scaledAmount} ${unit}</strong></div>`;
  }).join("");

  const imageHtml = r.photo 
    ? `<img src="${r.photo}" class="modal-img" onerror="this.onerror=null; this.src=''; this.style.display='none'; document.getElementById('modal-img-fallback').style.display='flex';">
       <div id="modal-img-fallback" class="modal-img" style="display:none;align-items:center;justify-content:center;font-size:3rem;">🍽️</div>` 
    : `<div class="modal-img" style="display:flex;align-items:center;justify-content:center;font-size:3rem;">🍽️</div>`;

  const timerHtml = r.timerMinutes ? `
    <div class="kitchen-timer-box">
      <div style="font-size: 1rem; color: var(--c-cream);">⏱️ Timer di Cottura</div>
      <div class="timer-display" id="timer-clock">${String(r.timerMinutes).padStart(2, '0')}:00</div>
      <div class="timer-controls">
        <input type="number" id="timer-minutes-input" min="1" max="360" value="${r.timerMinutes}">
        <button type="button" class="btn-timer" onclick="startKitchenTimer()">Avvia</button>
        <button type="button" class="btn-timer" onclick="resetKitchenTimer()">Stop</button>
      </div>
    </div>
  ` : '';

  body.innerHTML = `
    ${imageHtml}
    <h3 class="modal-title">${r.title}</h3>
    <div style="margin-bottom: 10px;">
      <span class="badge badge-macro">${(r.macro || '').toUpperCase()}</span>
      ${r.subcat ? `<span class="badge badge-sub">${r.subcat.toUpperCase()}</span>` : ''}
      ${doable ? `<span class="badge badge-doable">FATTIBILE ORA</span>` : ''}
    </div>
    <div class="stars" style="font-size: 1.2rem; margin-bottom: 12px;">${"★".repeat(r.rating || 5)}${"☆".repeat(5 - (r.rating || 5))}</div>

    <div class="modal-section-title">
      <span>Ingredienti</span>
      <div class="portion-scaler">
        <button type="button" class="btn-portion" onclick="adjustServings(-1)">-</button>
        <span style="font-size:0.9rem;">${currentModalServings} porzioni</span>
        <button type="button" class="btn-portion" onclick="adjustServings(1)">+</button>
      </div>
    </div>
    <div style="margin-bottom: 14px;">${ingredientsListHtml.length > 0 ? ingredientsListHtml : '<p>Nessun ingrediente inserito.</p>'}</div>

    <div class="modal-section-title">Procedimento</div>
    <div class="modal-procedure-text">${r.procedure ? r.procedure : 'Nessun procedimento inserito.'}</div>

    ${timerHtml}

    <div class="modal-actions">
      <button type="button" class="btn-action btn-edit" onclick="editRecipe('${r.id}')">✏️ Modifica</button>
      <button type="button" class="btn-action btn-delete" onclick="deleteRecipe('${r.id}')">🗑️ Elimina</button>
    </div>
  `;
}

function adjustServings(delta) {
  const newServings = currentModalServings + delta;
  if (newServings >= 1 && newServings <= 30) {
    currentModalServings = newServings;
    renderModalContent();
  }
}

// Inizializzazione audio globale per iPhone
let audioContextInstance = null;

function getAudioContext() {
  if (!audioContextInstance) {
    audioContextInstance = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContextInstance.state === 'suspended') {
    audioContextInstance.resume();
  }
  return audioContextInstance;
}

function startKitchenTimer() {
  if (timerInterval) clearInterval(timerInterval);

  getAudioContext();

  const inputMinutes = Number(document.getElementById("timer-minutes-input")?.value) || 1;
  timerSecondsRemaining = inputMinutes * 60;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timerSecondsRemaining--;
    updateTimerDisplay();

    if (timerSecondsRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      playBeepSound();
      alert("⏰ Tempo scaduto per la tua ricetta!");
    }
  }, 1000);
}

function resetKitchenTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerSecondsRemaining = 0;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const clock = document.getElementById("timer-clock");
  if (!clock) return;
  const m = Math.floor(timerSecondsRemaining / 60).toString().padStart(2, '0');
  const s = (timerSecondsRemaining % 60).toString().padStart(2, '0');
  clock.innerText = `${m}:${s}`;
}

function playBeepSound() {
  try {
    const ctx = getAudioContext();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;

      const startTime = ctx.currentTime + (i * 0.35);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.start(startTime);
      osc.stop(startTime + 0.25);
    }
  } catch(e) {}
}

function closeRecipeModal() {
  const modal = document.getElementById("recipe-modal");
  if (modal) modal.classList.remove("open");
  
  releaseWakeLock();
  resetKitchenTimer();
  currentOpenRecipe = null;
}

/* --- FUNZIONI DI SALVATAGGIO DATI (COPIA / INCOLLA & FILE) --- */

function exportDataBackup() {
  const exportPayload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    recipes: recipes,
    pantry: pantry,
    customIngredients: customIngredients
  };

  const jsonString = JSON.stringify(exportPayload);
  const container = document.getElementById("backup-text-container");
  const textarea = document.getElementById("backup-text-area");

  if (container && textarea) {
    textarea.value = jsonString;
    container.style.display = "block";
    textarea.scrollIntoView({ behavior: 'smooth' });
  }

  if (navigator.share) {
    try {
      navigator.share({
        title: "Backup Ricette GF",
        text: jsonString
      }).catch(() => {});
    } catch(e) {}
  }
}

function copyBackupToClipboard() {
  const textarea = document.getElementById("backup-text-area");
  if (!textarea || !textarea.value) return;

  navigator.clipboard.writeText(textarea.value).then(() => {
    alert("✅ Codice di backup copiato! Ora puoi incollarlo nelle Note o inviarlo al tablet.");
  }).catch(() => {
    textarea.select();
    document.execCommand("copy");
    alert("✅ Codice selezionato e copiato negli appunti!");
  });
}

function importFromTextArea() {
  const textarea = document.getElementById("backup-text-area");
  const rawData = textarea ? textarea.value.trim() : "";
  if (!rawData) return alert("Incolla prima il testo del backup nel riquadro.");

  try {
    const data = JSON.parse(rawData);
    processImportedData(data);
  } catch(err) {
    alert("Il testo inserito non è valido. Assicurati di aver copiato tutto il codice.");
  }
}

function importDataBackup(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      processImportedData(data);
      input.value = "";
    } catch (err) {
      alert("Errore durante la lettura del file di backup.");
    }
  };
  reader.readAsText(file);
}

function processImportedData(data) {
  if (!data.recipes || !Array.isArray(data.recipes)) {
    alert("Formato dati non valido.");
    return;
  }

  if (data.customIngredients && Array.isArray(data.customIngredients)) {
    const existingIds = new Set(customIngredients.map(i => i.id));
    data.customIngredients.forEach(i => {
      if (!existingIds.has(i.id)) {
        customIngredients.push(i);
      }
    });
    localStorage.setItem("gf_custom_ingredients", JSON.stringify(customIngredients));
    INGREDIENTS_DB = [...BASE_INGREDIENTS, ...customIngredients];
  }

  if (confirm(`Trovate ${data.recipes.length} ricette.\n\nPremi OK per SOSTITUIRE tutto l'archivio.\nPremi ANNULLA per UNIRE alle ricette attuali.`)) {
    recipes = data.recipes;
    pantry = data.pantry || {};
  } else {
    const existingIds = new Set(recipes.map(r => String(r.id)));
    data.recipes.forEach(r => {
      if (!existingIds.has(String(r.id))) {
        recipes.push(r);
      }
    });
    pantry = Object.assign({}, pantry, data.pantry || {});
  }

  localStorage.setItem("gf_recipes", JSON.stringify(recipes));
  localStorage.setItem("gf_pantry", JSON.stringify(pantry));

  alert("Dati ripristinati con successo!");
  buildPantryUI();
  renderRecipes();
}