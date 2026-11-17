// =========================================================
// LOGICA PRINCIPALE: RICETTE, DISPENSA, MODALE E TIMER
// =========================================================
let editingRecipeId = null;
let wakeLockSentinel = null;
let timerInterval = null;
let timerSecondsRemaining = 0;
let currentOpenRecipe = null;
let currentModalServings = 4;
let audioCtx = null;

window.onload = async () => {
  updateSubcatOptions();

  const modalEl = document.getElementById("recipe-modal");
  if (modalEl) {
    modalEl.addEventListener("click", (e) => {
      if (e.target.id === "recipe-modal") closeRecipeModal();
    });
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  handleSessionChange(session);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    handleSessionChange(session);
    if (event === "PASSWORD_RECOVERY") {
      const resetModal = document.getElementById("reset-password-modal");
      if (resetModal) resetModal.classList.add("open");
    }
  });
};

async function loadUserProfileAndData() {
  if (!currentUser) return;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (profile) {
    currentProfile = profile;
    pantry = profile.pantry || {};
    customIngredients = profile.custom_ingredients || [];
    INGREDIENTS_DB = [...BASE_INGREDIENTS, ...customIngredients];

    document.getElementById("drawer-username").innerText = profile.username || currentUser.email.split("@")[0];
    document.getElementById("drawer-email").innerText = profile.email || currentUser.email;
  }

  buildPantryUI();
  await loadFriendships();
  await loadRecipesFromCloud();
}

async function loadRecipesFromCloud() {
  const { data, error } = await supabaseClient
    .from("recipes")
    .select("*, profiles(username, email)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return showToast("Errore caricamento ricette");
  }

  recipes = (data || []).map(r => ({
    id: r.id,
    userId: r.user_id,
    authorName: r.profiles?.username || r.profiles?.email?.split("@")[0] || "Utente",
    title: r.title,
    macro: r.macro,
    subcat: r.subcat,
    servings: r.servings || 1,
    timerMinutes: r.timer_minutes,
    rating: r.rating || 5,
    procedure: r.procedure,
    photo: r.photo,
    ingredients: r.ingredients || [],
    visibility: r.visibility || "friends"
  }));

  renderRecipes();
}

/* --- NAVIGAZIONE --- */
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById('view-' + tabId);
  if (targetView) targetView.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tabId === 'recipes') renderRecipes();
  if (tabId !== 'add' && editingRecipeId !== null) resetAddForm();

  window.scrollTo(0, 0);
}

function showFormView() {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
  document.getElementById('view-add').classList.add('active');
  window.scrollTo(0, 0);
}

function cancelRecipeForm() {
  resetAddForm();
  switchTab('recipes', document.getElementById('nav-btn-recipes'));
}

/* --- FORM RICETTA & INGREDIENTI --- */
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

function getIngredientOptionsHtml(selectedId = null) {
  let html = `<option value="">-- Seleziona --</option>`;
  html += `<option value="__NEW__" style="font-weight: bold; background-color: var(--c-sky-blue);">➕ + Nuovo ingrediente...</option>`;

  if (customIngredients.length > 0) {
    html += `<option value="__MANAGE__" style="font-weight: bold; background-color: #fca5a5;">🗑️ Elimina un ingrediente creato...</option>`;
  }

  const sortedIngredients = [...INGREDIENTS_DB].sort((a, b) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
  );

  html += sortedIngredients.map(i => `<option value="${i.id}" ${selectedId === i.id ? 'selected' : ''}>${i.name} (${i.unit})</option>`).join("");
  return html;
}

async function handleIngredientSelectChange(selectEl) {
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

    await supabaseClient
      .from("profiles")
      .update({ custom_ingredients: customIngredients })
      .eq("id", currentUser.id);

    document.querySelectorAll("#recipe-ingredients-form .ing-select").forEach(sel => {
      const curVal = sel.value;
      sel.innerHTML = getIngredientOptionsHtml(curVal === "__NEW__" ? id : curVal);
    });

    selectEl.value = id;
    buildPantryUI();
    showToast("Ingrediente salvato nel cloud!");
  } else if (selectEl.value === "__MANAGE__") {
    await deleteCustomIngredientPrompt();
    selectEl.value = "";
  }
}

async function deleteCustomIngredientPrompt() {
  if (customIngredients.length === 0) return showToast("Nessun ingrediente personalizzato.");

  let promptText = "Digita il NUMERO dell'ingrediente da eliminare:\n\n";
  customIngredients.forEach((ing, index) => {
    promptText += `${index + 1}) ${ing.name} (${ing.unit})\n`;
  });

  const choice = prompt(promptText);
  if (!choice) return;

  const selectedIndex = parseInt(choice.trim(), 10) - 1;
  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= customIngredients.length) {
    return showToast("Scelta non valida");
  }

  const removed = customIngredients[selectedIndex];
  if (confirm(`Eliminare "${removed.name}"?`)) {
    customIngredients.splice(selectedIndex, 1);
    INGREDIENTS_DB = [...BASE_INGREDIENTS, ...customIngredients];
    delete pantry[removed.id];

    await supabaseClient
      .from("profiles")
      .update({ custom_ingredients: customIngredients, pantry })
      .eq("id", currentUser.id);

    document.querySelectorAll("#recipe-ingredients-form .ing-select").forEach(sel => {
      const curVal = sel.value === removed.id ? "" : sel.value;
      sel.innerHTML = getIngredientOptionsHtml(curVal);
    });

    buildPantryUI();
    showToast(`"${removed.name}" rimosso!`);
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
  document.getElementById("rec-visibility").value = "friends";
  document.getElementById("rec-procedure").value = "";
  document.getElementById("rec-photo").value = "";
  document.getElementById("rec-rating").value = "5";
  document.getElementById("rec-servings").value = "1";
  const timerInput = document.getElementById("rec-timer-min");
  if (timerInput) timerInput.value = "";
  document.getElementById("recipe-ingredients-form").innerHTML = "";

  document.querySelector("#view-add .page-title").innerText = "Nuova Ricetta";
  document.getElementById("save-recipe-btn").innerText = "Salva Ricetta";

  const display = document.getElementById("file-name-display");
  if (display) {
    display.innerText = "Carica o scatta foto";
    display.style.background = "var(--c-cream)";
  }
}

async function saveNewRecipe() {
  const title = document.getElementById("rec-title").value.trim();
  if (!title) return showToast("Inserisci un titolo");

  const visibility = document.getElementById("rec-visibility").value;
  const macro = document.getElementById("rec-macro").value;
  const subcat = document.getElementById("rec-subcat").value;
  const rating = Number(document.getElementById("rec-rating").value);
  const servings = Number(document.getElementById("rec-servings").value) || 1;
  const timerMinutesVal = document.getElementById("rec-timer-min").value.trim();
  const timerMinutes = timerMinutesVal ? Number(timerMinutesVal) : null;
  const procedure = document.getElementById("rec-procedure").value;
  const photoFile = document.getElementById("rec-photo").files[0];

  const ingRows = document.querySelectorAll("#recipe-ingredients-form .ingredient-row");
  const ingredients = [];
  ingRows.forEach(row => {
    const id = row.querySelector(".ing-select").value;
    const amount = Number(row.querySelector(".ing-amount").value);
    if (id && id !== "__NEW__" && id !== "__MANAGE__" && amount > 0) {
      ingredients.push({ id, amount });
    }
  });

  const saveBtn = document.getElementById("save-recipe-btn");
  saveBtn.innerText = "Salvataggio nel cloud...";
  saveBtn.disabled = true;

  let photoBase64 = null;
  if (photoFile) {
    photoBase64 = await compressImage(photoFile);
  } else if (editingRecipeId !== null) {
    const existing = recipes.find(r => r.id === editingRecipeId);
    if (existing) photoBase64 = existing.photo;
  }

  const payload = {
    user_id: currentUser.id,
    title,
    macro,
    subcat,
    servings,
    timer_minutes: timerMinutes,
    rating,
    procedure,
    photo: photoBase64,
    ingredients,
    visibility
  };

  if (editingRecipeId !== null) {
    const { error } = await supabaseClient.from("recipes").update(payload).eq("id", editingRecipeId);
    if (error) showToast("Errore aggiornamento");
    else showToast("Ricetta aggiornata!");
  } else {
    const { error } = await supabaseClient.from("recipes").insert(payload);
    if (error) showToast("Errore salvataggio");
    else showToast("Ricetta salvata!");
  }

  saveBtn.disabled = false;
  resetAddForm();
  await loadRecipesFromCloud();
  switchTab('recipes', document.getElementById('nav-btn-recipes'));
}

function editRecipe(recipeId) {
  const r = recipes.find(item => item.id === recipeId);
  if (!r || r.userId !== currentUser.id) return;

  closeRecipeModal();
  editingRecipeId = r.id;

  document.getElementById("rec-title").value = r.title;
  document.getElementById("rec-visibility").value = r.visibility || "friends";
  document.getElementById("rec-macro").value = r.macro;
  updateSubcatOptions();

  if (r.subcat) document.getElementById("rec-subcat").value = r.subcat;
  document.getElementById("rec-rating").value = r.rating;
  document.getElementById("rec-servings").value = r.servings || 1;
  document.getElementById("rec-timer-min").value = r.timerMinutes || "";
  document.getElementById("rec-procedure").value = r.procedure || "";

  const container = document.getElementById("recipe-ingredients-form");
  container.innerHTML = "";
  (r.ingredients || []).forEach(ing => addIngredientField(ing.id, ing.amount));

  const display = document.getElementById("file-name-display");
  display.innerText = r.photo ? "Foto presente (clicca per sostituire)" : "Carica o scatta foto";
  display.style.background = r.photo ? "var(--c-sky-blue)" : "var(--c-cream)";

  document.querySelector("#view-add .page-title").innerText = "Modifica Ricetta";
  document.getElementById("save-recipe-btn").innerText = "Aggiorna";

  showFormView();
}

async function deleteRecipe(recipeId) {
  const r = recipes.find(item => item.id === recipeId);
  if (!r || r.userId !== currentUser.id) return;

  if (confirm(`Vuoi eliminare "${r.title}"?`)) {
    await supabaseClient.from("recipes").delete().eq("id", recipeId);
    closeRecipeModal();
    await loadRecipesFromCloud();
    showToast("Ricetta eliminata.");
  }
}

/* --- DISPENSA --- */
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

async function savePantry() {
  INGREDIENTS_DB.filter(i => !i.staple).forEach(ing => {
    const el = document.getElementById("pantry-" + ing.id);
    const val = el ? Number(el.value) : 0;
    pantry[ing.id] = val > 0 ? val : 0;
  });

  const { error } = await supabaseClient
    .from("profiles")
    .update({ pantry })
    .eq("id", currentUser.id);

  if (error) showToast("Errore salvataggio dispensa");
  else showToast("Dispensa sincronizzata!");
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

/* --- LISTA RICETTE --- */
function renderRecipes() {
  const list = document.getElementById("recipe-list");
  if (!list) return;
  list.innerHTML = "";

  const keyword = (document.getElementById("search-keyword")?.value || "").toLowerCase().trim();
  const onlyDoable = document.getElementById("toggle-doable")?.checked || false;
  const authorFilter = document.getElementById("filter-author")?.value || "all";
  const macroFilter = document.getElementById("filter-macro")?.value || "tutti";
  const subcatFilter = document.getElementById("filter-subcat")?.value || "tutti";

  const filtered = recipes.filter(r => {
    const isMine = r.userId === currentUser.id;
    if (authorFilter === "mine" && !isMine) return false;
    if (authorFilter === "friends" && isMine) return false;

    if (keyword) {
      const matchTitle = r.title.toLowerCase().includes(keyword);
      const matchAuthor = r.authorName.toLowerCase().includes(keyword);
      const matchIngredient = (r.ingredients || []).some(i => {
        const info = INGREDIENTS_DB.find(db => db.id === i.id);
        return info && info.name.toLowerCase().includes(keyword);
      });
      if (!matchTitle && !matchIngredient && !matchAuthor) return false;
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
    const isMine = r.userId === currentUser.id;
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
      <div class="recipe-card-img-container">${imgHtml}</div>
      <div class="recipe-body">
        <div>
          <h4 class="recipe-title">${r.title}</h4>
          <div>
            <div class="stars">${"★".repeat(r.rating || 5)}${"☆".repeat(5 - (r.rating || 5))}</div>
            <div class="recipe-tags">
              ${!isMine ? `<span class="badge badge-author">👤 ${r.authorName}</span>` : ''}
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

/* --- MODALE E TIMER --- */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try { wakeLockSentinel = await navigator.wakeLock.request('screen'); } catch (err) {}
  }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

function openRecipeModal(recipeId) {
  const r = recipes.find(item => item.id === recipeId);
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

  const isMine = r.userId === currentUser.id;
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
    ? `<img src="${r.photo}" class="modal-img">`
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

  const ownerActionsHtml = isMine ? `
    <div class="modal-actions">
      <button type="button" class="btn-action btn-edit" onclick="editRecipe('${r.id}')">✏️ Modifica</button>
      <button type="button" class="btn-action btn-delete" onclick="deleteRecipe('${r.id}')">🗑️ Elimina</button>
    </div>
  ` : '';

  body.innerHTML = `
    ${imageHtml}
    <h3 class="modal-title">${r.title}</h3>
    <div style="margin-bottom: 10px;">
      ${!isMine ? `<span class="badge badge-author">DI ${r.authorName.toUpperCase()}</span>` : ''}
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
    ${ownerActionsHtml}
  `;
}

function adjustServings(delta) {
  const newServings = currentModalServings + delta;
  if (newServings >= 1 && newServings <= 30) {
    currentModalServings = newServings;
    renderModalContent();
  }
}

function unlockAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const buffer = audioCtx.createBuffer(1, 1, 22050);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(0);
}

function startKitchenTimer() {
  if (timerInterval) clearInterval(timerInterval);
  unlockAudioContext();

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
      setTimeout(() => showToast("⏰ Tempo scaduto!", 2000), 1000);
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
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    [0, 0.35, 0.7].forEach(delay => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + delay);
      const startTime = audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  } catch (e) {}
}

function closeRecipeModal() {
  const modal = document.getElementById("recipe-modal");
  if (modal) modal.classList.remove("open");
  releaseWakeLock();
  resetKitchenTimer();
  currentOpenRecipe = null;
}