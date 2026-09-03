const INGREDIENTS_DB = [
  { id: "farina_riso", name: "Farina di riso", unit: "g", staple: false },
  { id: "maizena", name: "Maizena / Amido di mais", unit: "g", staple: false },
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
  { id: "alcool_96", name: "Alcool 96°", unit: "ml", staple: false },
  { id: "cacao", name: "Cacao", unit: "g", staple: false },
  { id: "biscotti_secchi", name: "Biscotti secchi", unit: "g", staple: false },
  { id: "salsa", name: "Salsa / Passata", unit: "g", staple: false },
  { id: "zucchero", name: "Zucchero", unit: "g", staple: false },
  { id: "cioccolato", name: "Cioccolato fondente", unit: "g", staple: false },
  { id: "uova", name: "Uova", unit: "pz", staple: false },
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
let editingRecipeId = null;

let wakeLockSentinel = null;
let timerInterval = null;
let timerSecondsRemaining = 0;
let currentOpenRecipe = null;
let currentModalServings = 4;

window.onload = () => {
  const quoteEl = document.getElementById("quote-display");
  if (quoteEl) {
    quoteEl.innerText = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
  updateSubcatOptions();
  buildPantryUI();
  renderRecipes();

  // Chiudi cliccando fuori dal modale
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

function addIngredientField(presetId = null, presetAmount = "") {
  const container = document.getElementById("recipe-ingredients-form");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "ingredient-row";
  
  let opts = INGREDIENTS_DB.map(i => `<option value="${i.id}" ${presetId === i.id ? 'selected' : ''}>${i.name} (${i.unit})</option>`).join("");
  row.innerHTML = `
    <select class="ing-select" style="flex:2">${opts}</select>
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
  document.getElementById("rec-servings").value = "4";
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
  const subcat = macro === "liquori" ? null : document.getElementById("rec-subcat").value;
  const rating = Number(document.getElementById("rec-rating").value);
  const servings = Number(document.getElementById("rec-servings").value) || 4;
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
  document.getElementById("rec-servings").value = r.servings || 4;
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
  if (titlePage) titlePage.innerText = "Modifica Ricetta";

  const saveBtn = document.querySelector("#view-add .btn-main");
  if (saveBtn) saveBtn.innerText = "💾 Aggiorna Ricetta";

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
    
    // Assegnazione sicura click senza richiamare eventi indesiderati
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
          ${(r.ingredients || []).length} ingredienti • ${r.servings || 4} porzioni
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
  // Conversione sicura a stringa per evitare qualsiasi disallineamento
  const r = recipes.find(item => String(item.id) === String(recipeId));
  if (!r) return;

  currentOpenRecipe = r;
  currentModalServings = r.servings || 4;

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

  const baseServings = r.servings || 4;
  const ratio = currentModalServings / baseServings;

  const ingredientsListHtml = (r.ingredients || []).map(i => {
    const info = INGREDIENTS_DB.find(db => db.id === i.id);
    const name = info ? info.name : i.id;
    const unit = info ? info.unit : '';
    let scaledAmount = Math.round(i.amount * ratio * 10) / 10;
    return `<div class="modal-ingredient-item">• ${name}: <strong>${scaledAmount} ${unit}</strong></div>`;
  }).join("");

  const imageHtml = r.photo 
    ? `<img src="${r.photo}" class="modal-img">` 
    : `<div class="modal-img" style="display:flex;align-items:center;justify-content:center;font-size:3rem;">🍽️</div>`;

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
        <span style="font-size:0.9rem; font-weight:700;">${currentModalServings} porzioni</span>
        <button type="button" class="btn-portion" onclick="adjustServings(1)">+</button>
      </div>
    </div>
    <div style="margin-bottom: 14px;">${ingredientsListHtml.length > 0 ? ingredientsListHtml : '<p>Nessun ingrediente inserito.</p>'}</div>

    <div class="modal-section-title">Procedimento</div>
    <div class="modal-procedure-text">${r.procedure ? r.procedure : 'Nessun procedimento inserito.'}</div>

    <div class="kitchen-timer-box">
      <div style="font-size: 1rem; font-weight: 700; color: var(--c-cream);">⏱️ Timer di Cottura</div>
      <div class="timer-display" id="timer-clock">00:00</div>
      <div class="timer-controls">
        <input type="number" id="timer-minutes-input" min="1" max="180" placeholder="Minuti" value="15">
        <button type="button" class="btn-timer" onclick="startKitchenTimer()">Avvia</button>
        <button type="button" class="btn-timer" onclick="resetKitchenTimer()">Stop</button>
      </div>
    </div>

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

function startKitchenTimer() {
  if (timerInterval) clearInterval(timerInterval);

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
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.start(audioCtx.currentTime + i * 0.3);
      osc.stop(audioCtx.currentTime + i * 0.3 + 0.2);
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

async function exportDataBackup() {
  const exportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: recipes,
    pantry: pantry
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const fileName = `ricette_gf_backup_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([jsonString], { type: "application/json" });

  // 1. Metodo ottimale per iPhone: Menu di Condivisione iOS (AirDrop, Salva su File, ecc.)
  if (navigator.canShare) {
    const file = new File([blob], fileName, { type: "application/json" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Backup Ricette Gluten Free",
          text: "Ecco il file di backup delle mie ricette."
        });
        return; // Completato con successo tramite menu iOS
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Errore condivisione:", err);
        } else {
          return; // L'utente ha semplicemente chiuso il menu
        }
      }
    }
  }

  // 2. Metodo alternativo tramite Blob Object URL (se il menu Share non è supportato)
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement("a");
  downloadAnchor.href = url;
  downloadAnchor.download = fileName;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  
  setTimeout(() => {
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  }, 100);
}

function importDataBackup(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.recipes || !Array.isArray(data.recipes)) {
        throw new Error("Formato non valido");
      }

      if (confirm(`Trovate ${data.recipes.length} ricette nel backup. Vuoi sostituire tutto o unire?\n\nOK = Sostituisci\nAnnulla = Unisci`)) {
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
      input.value = "";
    } catch (err) {
      alert("Errore durante la lettura del file di backup.");
    }
  };
  reader.readAsText(file);
}