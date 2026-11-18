// =========================================================
// LOGICA PRINCIPALE: RICETTE, ESPLORA, DISPENSA, MODALE, STORAGE E TIMER
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

  const { data: savedData } = await supabaseClient
    .from("saved_recipes")
    .select("recipe_id, rating")
    .eq("user_id", currentUser.id);

  savedRecipesMap = {};
  (savedData || []).forEach(item => {
    savedRecipesMap[item.recipe_id] = item.rating;
  });

  recipes = (data || []).map(r => {
    const isMine = r.user_id === currentUser.id;
    const isSaved = Object.prototype.hasOwnProperty.call(savedRecipesMap, r.id);
    const effectiveRating = isSaved ? savedRecipesMap[r.id] : (r.rating || 5);

    return {
      id: r.id,
      userId: r.user_id,
      isMine,
      isSaved,
      createdAt: r.created_at,
      authorName: r.profiles?.username || r.profiles?.email?.split("@")[0] || "Utente",
      title: r.title,
      macro: r.macro,
      subcat: r.subcat,
      servings: r.servings || 1,
      timerMinutes: r.timer_minutes,
      originalRating: r.rating || 5,
      rating: effectiveRating,
      procedure: r.procedure,
      photo: r.photo,
      ingredients: r.ingredients || [],
      visibility: r.visibility || "friends"
    };
  });

  renderRecipes();
  renderExploreRecipes();
}

/* --- SALVATAGGIO E VALUTAZIONE RICETTE --- */
async function toggleSaveRecipe(recipeId) {
  const r = recipes.find(item => item.id === recipeId);
  if (!r || r.isMine) return;

  if (r.isSaved) {
    const { error } = await supabaseClient
      .from("saved_recipes")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("recipe_id", recipeId);

    if (error) return showToast("Errore rimozione");
    showToast("Rimossa dal tuo ricettario");
  } else {
    const { error } = await supabaseClient
      .from("saved_recipes")
      .insert({
        user_id: currentUser.id,
        recipe_id: recipeId,
        rating: r.originalRating || 5
      });

    if (error) return showToast("Errore salvataggio");
    showToast("Salvata nel tuo Ricettario!");
  }

  await loadRecipesFromCloud();
  if (currentOpenRecipe && currentOpenRecipe.id === recipeId) {
    currentOpenRecipe = recipes.find(item => item.id === recipeId);
    renderModalContent();
  }
}

async function updateRecipeRating(recipeId, newRating) {
  const r = recipes.find(item => item.id === recipeId);
  if (!r) return;

  if (r.isMine) {
    const { error } = await supabaseClient
      .from("recipes")
      .update({ rating: newRating })
      .eq("id", recipeId);

    if (error) return showToast("Errore aggiornamento voto");
  } else if (r.isSaved) {
    const { error } = await supabaseClient
      .from("saved_recipes")
      .update({ rating: newRating })
      .eq("user_id", currentUser.id)
      .eq("recipe_id", recipeId);

    if (error) return showToast("Errore aggiornamento voto");
  } else {
    return;
  }

  showToast(`Valutazione aggiornata: ${newRating} ★`);
  await loadRecipesFromCloud();

  if (currentOpenRecipe && currentOpenRecipe.id === recipeId) {
    currentOpenRecipe = recipes.find(item => item.id === recipeId);
    renderModalContent();
  }
}

/* --- NAVIGAZIONE --- */
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById('view-' + tabId);
  if (targetView) targetView.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tabId === 'recipes') renderRecipes();
  if (tabId === 'explore') renderExploreRecipes();
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

/* --- SUPABASE STORAGE PER FOTO --- */
function compressImageToBlob(file) {
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
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.78);
      };
      img.onerror = () => resolve(null);
    };
    reader.onerror = () => resolve(null);
  });
}

async function uploadPhotoToStorage(file) {
  const blob = await compressImageToBlob(file);
  if (!blob) return null;

  const filePath = `${currentUser.id}/${Date.now()}.jpg`;
  const { error } = await supabaseClient.storage
    .from("recipe-photos")
    .upload(filePath, blob, { contentType: "image/jpeg", upsert: true });

  if (error) {
    console.error("Storage upload error:", error);
    return null;
  }

  const { data } = supabaseClient.storage.from("recipe-photos").getPublicUrl(filePath);
  return data?.publicUrl || null;
}

async function deletePhotoFromStorage(photoUrl) {
  if (!photoUrl || !photoUrl.includes("/recipe-photos/")) return;
  const parts = photoUrl.split("/recipe-photos/");
  if (parts.length === 2) {
    await supabaseClient.storage.from("recipe-photos").remove([parts[1]]);
  }
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

function updateFilterSubcatOptions(prefix = "filter") {
  const macroEl = document.getElementById(`${prefix}-macro`);
  const subContainer = document.getElementById(`${prefix}-subcat-container`);
  const subSelect = document.getElementById(`${prefix}-subcat`);
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

  let photoUrl = null;
  const existing = editingRecipeId !== null ? recipes.find(r => r.id === editingRecipeId) : null;

  if (photoFile) {
    photoUrl = await uploadPhotoToStorage(photoFile);
    if (photoUrl && existing?.photo) {
      await deletePhotoFromStorage(existing.photo);
    }
  } else if (existing) {
    photoUrl = existing.photo;
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
    photo: photoUrl,
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
  if (!r || !r.isMine) return;

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
  if (!r || !r.isMine) return;

  if (confirm(`Vuoi eliminare "${r.title}"?`)) {
    if (r.photo) await deletePhotoFromStorage(r.photo);
    await supabaseClient.from("recipes").delete().eq("id", recipeId);
    closeRecipeModal();
    await loadRecipesFromCloud();
    showToast("Ricetta eliminata.");
  }
}

/* --- DISPENSA DINAMICA (SPESA + SCALA AUTOMATICA) --- */
let pantryMode = "restock"; // "restock" (Aggiungi spesa) | "edit" (Modifica scorte totali)
let pendingRestockValues = {}; // Mantiene i valori digitati mentre si filtra la lista

function setPantryMode(mode) {
  // Salva eventuali valori già digitati prima di cambiare vista
  if (pantryMode === "restock") {
    capturePendingRestockInputs();
  }
  pantryMode = mode;

  const restockBtn = document.getElementById("pantry-mode-restock-btn");
  const editBtn = document.getElementById("pantry-mode-edit-btn");
  const hintEl = document.getElementById("pantry-mode-hint");
  const saveBtn = document.getElementById("pantry-save-btn");

  if (restockBtn && editBtn) {
    restockBtn.classList.toggle("active", mode === "restock");
    editBtn.classList.toggle("active", mode === "edit");
  }

  if (mode === "restock") {
    if (hintEl) {
      hintEl.innerHTML = `Inserisci solo le quantità comprate al supermercato: verranno <strong>sommate</strong> a ciò che hai già in casa.`;
    }
    if (saveBtn) saveBtn.innerText = "➕ Aggiungi Spesa alla Dispensa";
  } else {
    if (hintEl) {
      hintEl.innerHTML = `Modifica direttamente il totale disponibile in dispensa (imposta <strong>0</strong> se un prodotto è finito).`;
    }
    if (saveBtn) saveBtn.innerText = "💾 Salva Scorte Attuali";
  }

  buildPantryUI();
}

function capturePendingRestockInputs() {
  INGREDIENTS_DB.filter(i => !i.staple).forEach(ing => {
    const el = document.getElementById("pantry-" + ing.id);
    if (el) {
      const val = Number(el.value);
      if (val > 0) pendingRestockValues[ing.id] = val;
      else delete pendingRestockValues[ing.id];
    }
  });
}

function buildPantryUI() {
  const c = document.getElementById("pantry-inputs");
  if (!c) return;

  if (pantryMode === "restock") {
    capturePendingRestockInputs();
  }

  const filterText = (document.getElementById("pantry-search")?.value || "").toLowerCase().trim();
  c.innerHTML = "";

  const pantryIngredients = INGREDIENTS_DB
    .filter(i => !i.staple)
    .filter(i => !filterText || i.name.toLowerCase().includes(filterText))
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));

  if (pantryIngredients.length === 0) {
    c.innerHTML = `<p style="text-align:center; margin: 12px 0;">Nessun ingrediente trovato.</p>`;
    return;
  }

  pantryIngredients.forEach(ing => {
    const currentStock = pantry[ing.id] || 0;
    const div = document.createElement("div");
    div.className = "ingredient-row";

    if (pantryMode === "restock") {
      const draftAdd = pendingRestockValues[ing.id] || "";
      div.innerHTML = `
        <div style="flex:2; min-width:0;">
          <div style="font-size:1rem;">${ing.name}</div>
          <span class="pantry-current-badge">In casa: ${currentStock} ${ing.unit}</span>
        </div>
        <span style="font-size:0.9rem; margin-right:4px;">+</span>
        <input type="number" id="pantry-${ing.id}" value="${draftAdd}" placeholder="0" min="0" step="any" style="width:85px; text-align:right; padding:8px 10px;">
        <span style="font-size:0.85rem; width:24px;">${ing.unit}</span>
      `;
    } else {
      div.innerHTML = `
        <div style="flex:2; min-width:0;">
          <div style="font-size:1rem;">${ing.name}</div>
        </div>
        <input type="number" id="pantry-${ing.id}" value="${currentStock > 0 ? currentStock : ''}" placeholder="0" min="0" step="any" style="width:90px; text-align:right; padding:8px 10px;">
        <span style="font-size:0.85rem; width:24px;">${ing.unit}</span>
      `;
    }

    c.appendChild(div);
  });
}

async function savePantry() {
  if (pantryMode === "restock") {
    capturePendingRestockInputs();
    let updatedCount = 0;

    Object.keys(pendingRestockValues).forEach(ingId => {
      const added = Number(pendingRestockValues[ingId]) || 0;
      if (added > 0) {
        const current = pantry[ingId] || 0;
        pantry[ingId] = Math.round((current + added) * 10) / 10;
        updatedCount++;
      }
    });

    if (updatedCount === 0) {
      return showToast("Inserisci almeno un prodotto acquistato!");
    }

    const { error } = await supabaseClient
      .from("profiles")
      .update({ pantry })
      .eq("id", currentUser.id);

    if (error) {
      showToast("Errore aggiornamento dispensa");
    } else {
      pendingRestockValues = {};
      const searchEl = document.getElementById("pantry-search");
      if (searchEl) searchEl.value = "";
      buildPantryUI();
      renderRecipes();
      renderExploreRecipes();
      showToast(`Spesa aggiunta (+${updatedCount} prodotti)!`);
    }
  } else {
    INGREDIENTS_DB.filter(i => !i.staple).forEach(ing => {
      const el = document.getElementById("pantry-" + ing.id);
      if (el) {
        const val = Number(el.value);
        pantry[ing.id] = val > 0 ? Math.round(val * 10) / 10 : 0;
      }
    });

    const { error } = await supabaseClient
      .from("profiles")
      .update({ pantry })
      .eq("id", currentUser.id);

    if (error) {
      showToast("Errore salvataggio dispensa");
    } else {
      buildPantryUI();
      renderRecipes();
      renderExploreRecipes();
      showToast("Scorte attuali salvate!");
    }
  }
}

async function markRecipeAsCooked() {
  const r = currentOpenRecipe;
  if (!r || !r.ingredients || r.ingredients.length === 0) return;

  const baseServings = r.servings || 1;
  const ratio = currentModalServings / baseServings;
  const missing = getMissingIngredients(r, currentModalServings);

  let confirmMsg = `Scalare dalla dispensa gli ingredienti per ${currentModalServings} porzioni di "${r.title}"?`;
  if (missing.length > 0) {
    confirmMsg += `\n\nNota: alcuni ingredienti sono inferiori alla quantità richiesta e verranno portati a 0.`;
  }

  if (!confirm(confirmMsg)) return;

  r.ingredients.forEach(item => {
    const info = INGREDIENTS_DB.find(i => i.id === item.id);
    if (info && info.staple) return;

    const used = Math.round(item.amount * ratio * 10) / 10;
    const currentAvail = pantry[item.id] || 0;
    pantry[item.id] = Math.max(0, Math.round((currentAvail - used) * 10) / 10);
  });

  const { error } = await supabaseClient
    .from("profiles")
    .update({ pantry })
    .eq("id", currentUser.id);

  if (error) {
    showToast("Errore aggiornamento dispensa");
  } else {
    buildPantryUI();
    renderRecipes();
    renderExploreRecipes();
    renderModalContent();
    showToast("Ingredienti scalati dalla dispensa!");
  }
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

function isRecipeDoable(recipe, targetServings = null) {
  if (!recipe.ingredients || recipe.ingredients.length === 0) return true;
  const baseServings = recipe.servings || 1;
  const ratio = targetServings ? (targetServings / baseServings) : 1;

  return recipe.ingredients.every(item => {
    const info = INGREDIENTS_DB.find(i => i.id === item.id);
    if (info && info.staple) return true;
    const required = Math.round(item.amount * ratio * 10) / 10;
    const available = pantry[item.id] || 0;
    return available >= required;
  });
}

function getMissingIngredients(recipe, targetServings) {
  const missing = [];
  const baseServings = recipe.servings || 1;
  const ratio = targetServings / baseServings;

  (recipe.ingredients || []).forEach(item => {
    const info = INGREDIENTS_DB.find(i => i.id === item.id);
    if (info && info.staple) return;

    const required = Math.round(item.amount * ratio * 10) / 10;
    const available = pantry[item.id] || 0;
    if (available < required) {
      const diff = Math.round((required - available) * 10) / 10;
      missing.push({
        name: info ? info.name : item.id,
        missingAmount: diff,
        unit: info ? info.unit : ""
      });
    }
  });
  return missing;
}

async function markRecipeAsCooked() {
  const r = currentOpenRecipe;
  if (!r || !r.ingredients || r.ingredients.length === 0) return;

  if (!confirm(`Scalare dalla dispensa gli ingredienti per ${currentModalServings} porzioni di "${r.title}"?`)) {
    return;
  }

  const baseServings = r.servings || 1;
  const ratio = currentModalServings / baseServings;

  r.ingredients.forEach(item => {
    const info = INGREDIENTS_DB.find(i => i.id === item.id);
    if (info && info.staple) return;

    const used = Math.round(item.amount * ratio * 10) / 10;
    const currentAvail = pantry[item.id] || 0;
    pantry[item.id] = Math.max(0, Math.round((currentAvail - used) * 10) / 10);
  });

  const { error } = await supabaseClient
    .from("profiles")
    .update({ pantry })
    .eq("id", currentUser.id);

  if (error) {
    showToast("Errore aggiornamento dispensa");
  } else {
    buildPantryUI();
    renderRecipes();
    renderExploreRecipes();
    renderModalContent();
    showToast("Dispensa aggiornata! Buon appetito!");
  }
}

async function copyShoppingListToClipboard() {
  if (!currentOpenRecipe) return;
  const missing = getMissingIngredients(currentOpenRecipe, currentModalServings);
  if (missing.length === 0) return;

  const lines = missing.map(m => `- ${m.name}: ${m.missingAmount} ${m.unit}`);
  const text = `Lista spesa per "${currentOpenRecipe.title}" (${currentModalServings} porz.):\n${lines.join("\n")}`;

  try {
    await navigator.clipboard.writeText(text);
    showToast("Lista della spesa copiata!");
  } catch (e) {
    showToast("Impossibile copiare automaticamente");
  }
}

/* --- ORDINAMENTO E RENDER SCHEDE --- */
function sortRecipeList(list, sortMode) {
  const copy = [...list];
  if (sortMode === "rating") {
    copy.sort((a, b) => (b.rating || 5) - (a.rating || 5));
  } else if (sortMode === "alpha") {
    copy.sort((a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' }));
  }
  // "newest" mantiene già l'ordine cronologico decrescente di Supabase
  return copy;
}

function createRecipeCardElement(r, showSavedBadge = false) {
  const doable = isRecipeDoable(r);
  const card = document.createElement("div");
  card.className = "recipe-card";

  card.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openRecipeModal(r.id);
  });

  const imgHtml = r.photo
    ? `<img src="${r.photo}" class="recipe-img" loading="lazy">`
    : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;">🍽️</div>`;

  const displayRating = r.rating || 5;

  card.innerHTML = `
    <div class="recipe-card-img-container">${imgHtml}</div>
    <div class="recipe-body">
      <div>
        <h4 class="recipe-title">${r.title}</h4>
        <div>
          <div class="stars">${"★".repeat(displayRating)}${"☆".repeat(5 - displayRating)}</div>
          <div class="recipe-tags">
            ${!r.isMine ? `<span class="badge badge-author">👤 ${r.authorName}</span>` : ''}
            ${showSavedBadge && r.isSaved ? `<span class="badge" style="background:#86efac;">✓ Salvata</span>` : ''}
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
  return card;
}

function renderRecipes() {
  const list = document.getElementById("recipe-list");
  if (!list) return;
  list.innerHTML = "";

  const keyword = (document.getElementById("search-keyword")?.value || "").toLowerCase().trim();
  const onlyDoable = document.getElementById("toggle-doable")?.checked || false;
  const originFilter = document.getElementById("filter-origin")?.value || "all";
  const macroFilter = document.getElementById("filter-macro")?.value || "tutti";
  const subcatFilter = document.getElementById("filter-subcat")?.value || "tutti";
  const sortMode = document.getElementById("filter-sort")?.value || "newest";

  let filtered = recipes.filter(r => {
    if (!r.isMine && !r.isSaved) return false;
    if (originFilter === "mine" && !r.isMine) return false;
    if (originFilter === "saved" && !r.isSaved) return false;

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

  filtered = sortRecipeList(filtered, sortMode);

  if (filtered.length === 0) {
    list.innerHTML = `<p style="text-align:center; margin-top:24px; font-size:1.1rem; font-weight:700;">Nessuna ricetta trovata. Scopri nuove idee nella scheda Esplora!</p>`;
    return;
  }

  filtered.forEach(r => list.appendChild(createRecipeCardElement(r, false)));
}

function renderExploreRecipes() {
  const list = document.getElementById("explore-list");
  if (!list) return;
  list.innerHTML = "";

  const keyword = (document.getElementById("explore-keyword")?.value || "").toLowerCase().trim();
  const onlyDoable = document.getElementById("explore-toggle-doable")?.checked || false;
  const scopeFilter = document.getElementById("explore-scope")?.value || "all";
  const macroFilter = document.getElementById("explore-macro")?.value || "tutti";
  const subcatFilter = document.getElementById("explore-subcat")?.value || "tutti";
  const sortMode = document.getElementById("explore-sort")?.value || "newest";

  let filtered = recipes.filter(r => {
    if (r.isMine) return false;
    if (scopeFilter === "friends" && r.visibility !== "friends") return false;
    if (scopeFilter === "public" && r.visibility !== "public") return false;

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

  filtered = sortRecipeList(filtered, sortMode);

  if (filtered.length === 0) {
    list.innerHTML = `<p style="text-align:center; margin-top:24px; font-size:1.1rem; font-weight:700;">Nessuna ricetta trovata nella community.</p>`;
    return;
  }

  filtered.forEach(r => list.appendChild(createRecipeCardElement(r, true)));
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

  const doable = isRecipeDoable(r, currentModalServings);
  const missingItems = getMissingIngredients(r, currentModalServings);
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

  const canRate = r.isMine || r.isSaved;
  const currentRating = r.rating || 5;
  let ratingHtml = "";

  if (canRate) {
    let starsButtons = "";
    for (let s = 1; s <= 5; s++) {
      starsButtons += `<button type="button" class="star-btn" onclick="updateRecipeRating('${r.id}', ${s})">${s <= currentRating ? '★' : '☆'}</button>`;
    }
    ratingHtml = `
      <div class="rating-picker-box">
        <span style="font-size: 0.95rem;">Il tuo voto:</span>
        <div>${starsButtons}</div>
      </div>
    `;
  } else {
    ratingHtml = `<div class="stars" style="font-size: 1.2rem; margin-bottom: 12px;">${"★".repeat(currentRating)}${"☆".repeat(5 - currentRating)}</div>`;
  }

  // Lista della spesa automatica se mancano ingredienti per le porzioni selezionate
  const missingHtml = missingItems.length > 0 ? `
    <div class="missing-box">
      <div class="missing-box-header">
        <span>🛒 Ti mancano in dispensa:</span>
        <button type="button" class="btn-copy-shopping" onclick="copyShoppingListToClipboard()">📋 Copia lista</button>
      </div>
      <div style="font-size: 0.95rem;">
        ${missingItems.map(m => `• ${m.name}: <strong>${m.missingAmount} ${m.unit}</strong>`).join("<br>")}
      </div>
    </div>
  ` : "";

  const cookedBtnHtml = (r.ingredients && r.ingredients.length > 0) ? `
    <button type="button" class="btn-cooked" onclick="markRecipeAsCooked()">
      🍳 Ho cucinato questa ricetta (Scala dispensa)
    </button>
  ` : "";

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

  let actionsHtml = "";
  if (r.isMine) {
    actionsHtml = `
      <div class="modal-actions">
        <button type="button" class="btn-action btn-edit" onclick="editRecipe('${r.id}')">✏️ Modifica</button>
        <button type="button" class="btn-action btn-delete" onclick="deleteRecipe('${r.id}')">🗑️ Elimina</button>
      </div>
    `;
  } else {
    actionsHtml = `
      <div class="modal-actions">
        <button type="button" class="btn-action ${r.isSaved ? 'btn-unsave-recipe' : 'btn-save-recipe'}" onclick="toggleSaveRecipe('${r.id}')">
          ${r.isSaved ? '🗑️ Rimuovi dai salvati' : '⭐ Salva nel mio Ricettario'}
        </button>
      </div>
    `;
  }

  body.innerHTML = `
    ${imageHtml}
    <h3 class="modal-title">${r.title}</h3>
    <div style="margin-bottom: 10px;">
      ${!r.isMine ? `<span class="badge badge-author">DI ${r.authorName.toUpperCase()}</span>` : ''}
      <span class="badge badge-macro">${(r.macro || '').toUpperCase()}</span>
      ${r.subcat ? `<span class="badge badge-sub">${r.subcat.toUpperCase()}</span>` : ''}
      ${doable ? `<span class="badge badge-doable">FATTIBILE ORA</span>` : ''}
    </div>

    ${ratingHtml}

    <div class="modal-section-title">
      <span>Ingredienti</span>
      <div class="portion-scaler">
        <button type="button" class="btn-portion" onclick="adjustServings(-1)">-</button>
        <span style="font-size:0.9rem;">${currentModalServings} porzioni</span>
        <button type="button" class="btn-portion" onclick="adjustServings(1)">+</button>
      </div>
    </div>
    <div style="margin-bottom: 10px;">${ingredientsListHtml.length > 0 ? ingredientsListHtml : '<p>Nessun ingrediente inserito.</p>'}</div>

    ${missingHtml}

    <div class="modal-section-title">Procedimento</div>
    <div class="modal-procedure-text">${r.procedure ? r.procedure : 'Nessun procedimento inserito.'}</div>

    ${timerHtml}
    ${cookedBtnHtml}
    ${actionsHtml}
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