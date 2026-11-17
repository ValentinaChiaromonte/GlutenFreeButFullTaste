// =========================================================
// AUTENTICAZIONE, RECUPERO PASSWORD, PANNELLO LATERALE E AMICI
// =========================================================
let isSignUpMode = false;

function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  document.getElementById("auth-title").innerText = isSignUpMode ? "Crea un nuovo account" : "Accedi alla Community";
  document.getElementById("auth-submit-btn").innerText = isSignUpMode ? "Registrati" : "Accedi";
  document.getElementById("auth-toggle-btn").innerText = isSignUpMode
    ? "Hai già un account? Accedi"
    : "Non hai un account? Registrati";

  const forgotBtn = document.getElementById("forgot-password-btn");
  if (forgotBtn) forgotBtn.style.display = isSignUpMode ? "none" : "block";
}

async function handleAuthSubmit() {
  const email = document.getElementById("auth-email").value.trim().toLowerCase();
  const password = document.getElementById("auth-password").value;

  if (!email || !password) return showToast("Inserisci email e password");
  if (password.length < 6) return showToast("La password deve avere almeno 6 caratteri");

  const btn = document.getElementById("auth-submit-btn");
  btn.disabled = true;
  btn.innerText = "Attendere...";

  if (isSignUpMode) {
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) showToast("Errore registrazione: " + error.message, 3000);
    else showToast("Registrazione completata!");
  } else {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) showToast("Credenziali non valide", 2500);
    else showToast("Bentornato!");
  }

  btn.disabled = false;
  btn.innerText = isSignUpMode ? "Registrati" : "Accedi";
}

async function handleForgotPassword() {
  const email = document.getElementById("auth-email").value.trim().toLowerCase();
  if (!email) {
    return showToast("Inserisci prima la tua email nel campo qui sopra!", 2500);
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });

  if (error) {
    showToast("Errore: " + error.message, 3000);
  } else {
    showToast("Email inviata! Controlla la tua casella di posta.", 3500);
  }
}

async function updateNewPassword() {
  const newPassword = document.getElementById("new-password-input").value;
  if (!newPassword || newPassword.length < 6) {
    return showToast("La password deve avere almeno 6 caratteri");
  }

  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) {
    showToast("Errore aggiornamento: " + error.message, 3000);
  } else {
    document.getElementById("new-password-input").value = "";
    const resetModal = document.getElementById("reset-password-modal");
    if (resetModal) resetModal.classList.remove("open");
    showToast("Password aggiornata con successo!", 2500);
  }
}

async function handleSessionChange(session) {
  const authScreen = document.getElementById("auth-screen");
  const appMain = document.getElementById("app-main");
  const drawerBtn = document.getElementById("open-drawer-btn");

  if (session && session.user) {
    currentUser = session.user;
    authScreen.style.display = "none";
    appMain.style.display = "block";
    drawerBtn.style.display = "flex";

    await loadUserProfileAndData();
  } else {
    currentUser = null;
    currentProfile = null;
    closeSideDrawer();
    authScreen.style.display = "block";
    appMain.style.display = "none";
    drawerBtn.style.display = "none";
  }
}

/* --- PANNELLO LATERALE --- */
function openSideDrawer() {
  const overlay = document.getElementById("side-drawer-overlay");
  if (overlay) overlay.classList.add("open");
  loadFriendships();
}

function closeSideDrawer() {
  const overlay = document.getElementById("side-drawer-overlay");
  if (overlay) overlay.classList.remove("open");
}

function toggleFriendsDrawerSection() {
  const content = document.getElementById("drawer-friends-content");
  const chevron = document.getElementById("friends-chevron");
  if (!content) return;

  const isOpen = content.style.display === "block";
  content.style.display = isOpen ? "none" : "block";
  if (chevron) chevron.innerText = isOpen ? "▼" : "▲";
}

function openNewRecipeFormFromDrawer() {
  closeSideDrawer();
  resetAddForm();
  showFormView();
}

async function changeUsername() {
  const currentName = currentProfile?.username || currentUser.email.split("@")[0];
  const newName = prompt("Inserisci il nuovo nome utente:", currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;

  const cleanName = newName.trim();
  const { error } = await supabaseClient
    .from("profiles")
    .update({ username: cleanName })
    .eq("id", currentUser.id);

  if (error) {
    showToast("Errore aggiornamento nome");
  } else {
    if (currentProfile) currentProfile.username = cleanName;
    document.getElementById("drawer-username").innerText = cleanName;
    showToast("Nome utente aggiornato!");
    await loadRecipesFromCloud();
  }
}

async function logoutUser() {
  closeSideDrawer();
  await supabaseClient.auth.signOut();
  showToast("Disconnesso");
}

async function deleteUserAccount() {
  const confirmFirst = confirm(
    "ATTENZIONE: Stai per eliminare definitivamente il tuo account, le tue ricette e la tua dispensa.\n\nVuoi procedere?"
  );
  if (!confirmFirst) return;

  const confirmText = prompt('Per confermare, scrivi ELIMINA in maiuscolo:');
  if (confirmText !== "ELIMINA") return showToast("Eliminazione annullata");

  const { error } = await supabaseClient.rpc("delete_own_account");
  if (error) {
    console.error(error);
    return showToast("Errore eliminazione account", 3000);
  }

  closeSideDrawer();
  await supabaseClient.auth.signOut();
  showToast("Account eliminato definitivamente.", 2500);
}

/* --- AMICI E RICHIESTE --- */
async function loadFriendships() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from("friendships")
    .select(`
      id,
      status,
      requester_id,
      addressee_id,
      requester:profiles!friendships_requester_id_fkey(id, email, username),
      addressee:profiles!friendships_addressee_id_fkey(id, email, username)
    `);

  if (!error) {
    friendships = data || [];
    renderFriendsUI();
  }
}

function renderFriendsUI() {
  const pendingBox = document.getElementById("pending-requests-box");
  const pendingList = document.getElementById("pending-requests-list");
  const friendsList = document.getElementById("friends-list");
  const notifDot = document.getElementById("drawer-notif-dot");
  const countSpan = document.getElementById("drawer-friends-count");

  const incomingPending = friendships.filter(
    f => f.status === "pending" && f.addressee_id === currentUser.id
  );

  if (incomingPending.length > 0) {
    pendingBox.style.display = "block";
    notifDot.style.display = "block";
    pendingList.innerHTML = incomingPending.map(req => `
      <div class="friend-row">
        <div style="min-width: 0;">
          <strong>${req.requester.username}</strong><br>
          <span style="font-size:0.8rem; word-break:break-all;">${req.requester.email}</span>
        </div>
        <div style="display:flex; gap:4px; flex-shrink: 0;">
          <button type="button" class="btn-timer" style="background:#86efac; padding:6px 8px;" onclick="respondFriendRequest('${req.id}', true)">✓</button>
          <button type="button" class="btn-timer" style="background:#fca5a5; padding:6px 8px;" onclick="respondFriendRequest('${req.id}', false)">✕</button>
        </div>
      </div>
    `).join("");
  } else {
    pendingBox.style.display = "none";
    notifDot.style.display = "none";
  }

  const accepted = friendships.filter(f => f.status === "accepted");
  if (countSpan) countSpan.innerText = `(${accepted.length})`;

  if (accepted.length === 0) {
    friendsList.innerHTML = `<p style="margin:0; font-size:0.95rem;">Nessun amico salvato.</p>`;
  } else {
    friendsList.innerHTML = accepted.map(f => {
      const friendProfile = f.requester_id === currentUser.id ? f.addressee : f.requester;
      return `
        <div class="friend-row">
          <div style="min-width: 0;">
            <strong>${friendProfile.username}</strong><br>
            <span style="font-size:0.8rem; word-break:break-all;">${friendProfile.email}</span>
          </div>
          <button type="button" class="btn-timer" style="flex:0; background:#fca5a5; padding:6px 8px;" onclick="removeFriend('${f.id}')">✕</button>
        </div>
      `;
    }).join("");
  }
}

async function sendFriendRequest() {
  const input = document.getElementById("friend-email-input");
  const targetEmail = input.value.trim().toLowerCase();

  if (!targetEmail) return showToast("Inserisci un'email");
  if (targetEmail === currentUser.email.toLowerCase()) return showToast("Non puoi invitare te stesso!");

  const { data: targetProfile, error: findErr } = await supabaseClient
    .from("profiles")
    .select("id, email")
    .eq("email", targetEmail)
    .single();

  if (findErr || !targetProfile) {
    return showToast("Nessun utente trovato con questa email", 2500);
  }

  const alreadyExists = friendships.some(
    f => (f.requester_id === targetProfile.id || f.addressee_id === targetProfile.id)
  );
  if (alreadyExists) return showToast("Richiesta già inviata o già amici");

  const { error } = await supabaseClient
    .from("friendships")
    .insert({
      requester_id: currentUser.id,
      addressee_id: targetProfile.id,
      status: "pending"
    });

  if (error) {
    showToast("Errore invio richiesta");
  } else {
    input.value = "";
    showToast("Richiesta inviata!");
    await loadFriendships();
  }
}

async function respondFriendRequest(friendshipId, accept) {
  if (accept) {
    await supabaseClient.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
    showToast("Amicizia accettata!");
  } else {
    await supabaseClient.from("friendships").delete().eq("id", friendshipId);
    showToast("Richiesta rifiutata");
  }
  await loadFriendships();
  await loadRecipesFromCloud();
}

async function removeFriend(friendshipId) {
  if (!confirm("Rimuovere questo amico?")) return;
  await supabaseClient.from("friendships").delete().eq("id", friendshipId);
  showToast("Amico rimosso");
  await loadFriendships();
  await loadRecipesFromCloud();
}