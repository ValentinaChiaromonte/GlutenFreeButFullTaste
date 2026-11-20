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

  const usernameGroup = document.getElementById("auth-username-group");
  if (usernameGroup) usernameGroup.style.display = isSignUpMode ? "block" : "none";
}

async function handleAuthSubmit() {
  const email = document.getElementById("auth-email").value.trim().toLowerCase();
  const password = document.getElementById("auth-password").value;
  const username = document.getElementById("auth-username")?.value.trim() || "";

  if (!email || !password) return showToast("Inserisci email e password");
  if (password.length < 6) return showToast("La password deve avere almeno 6 caratteri");

  if (isSignUpMode) {
    if (!username || username.length < 3) {
      return showToast("Inserisci un nome utente (almeno 3 caratteri)");
    }
    if (username.includes("@")) {
      return showToast("Il nome utente non può contenere @");
    }
  }

  const btn = document.getElementById("auth-submit-btn");
  btn.disabled = true;
  btn.innerText = "Attendere...";

  if (isSignUpMode) {
    const { data: isAvailable } = await supabaseClient.rpc("is_username_available", {
      check_username: username
    });

    if (isAvailable === false) {
      btn.disabled = false;
      btn.innerText = "Registrati";
      return showToast("Questo nome utente è già occupato, scegline un altro!", 2800);
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) {
      showToast("Errore registrazione: " + error.message, 3000);
    } else {
      showToast("Registrazione completata!");
      if (data?.session) await handleSessionChange(data.session);
    }
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showToast("Credenziali non valide", 2500);
    } else {
      showToast("Bentornato!");
      if (data?.session) await handleSessionChange(data.session);
    }
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

async function requestPasswordResetFromDrawer() {
  const email = currentProfile?.email || currentUser?.email;
  if (!email) return;

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });

  if (error) {
    showToast("Errore: " + error.message, 3000);
  } else {
    showToast("Email per cambiare password inviata a " + email, 3500);
  }
}

async function submitNewPassword() {
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
    if (authScreen) authScreen.style.display = "none";
    if (appMain) appMain.style.display = "block";
    if (drawerBtn) drawerBtn.style.display = "flex";

    await loadUserProfileAndData();
  } else {
    currentUser = null;
    currentProfile = null;
    closeSideDrawer();
    if (authScreen) authScreen.style.display = "block";
    if (appMain) appMain.style.display = "none";
    if (drawerBtn) drawerBtn.style.display = "none";
  }
}

/* --- PANNELLO LATERALE --- */
function updateHeaderAvatarInitial(username) {
  const initialEl = document.getElementById("drawer-avatar-initial");
  if (initialEl && username) {
    initialEl.innerText = username.trim().charAt(0).toUpperCase();
  }
}

function openSideDrawer() {
  const overlay = document.getElementById("side-drawer-overlay");
  if (overlay) overlay.classList.add("open");
  loadFriendships();
}

function closeSideDrawer() {
  const overlay = document.getElementById("side-drawer-overlay");
  if (overlay) overlay.classList.remove("open");
}

function toggleFriendsAccordion() {
  const body = document.getElementById("friends-accordion-body");
  const arrow = document.getElementById("friends-accordion-arrow");
  if (!body) return;

  const isOpen = body.style.display === "block";
  body.style.display = isOpen ? "none" : "block";
  if (arrow) arrow.innerText = isOpen ? "▼" : "▲";
}

async function changeUsername() {
  const currentName = currentProfile?.username || currentUser.email.split("@")[0];
  const newName = prompt("Inserisci il nuovo nome utente:", currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;

  const cleanName = newName.trim();
  if (cleanName.length < 3 || cleanName.includes("@")) {
    return showToast("Nome utente non valido (min. 3 caratteri, senza @)");
  }

  const { error } = await supabaseClient
    .from("profiles")
    .update({ username: cleanName })
    .eq("id", currentUser.id);

  if (error) {
    showToast("Nome utente già in uso o non valido", 2500);
  } else {
    if (currentProfile) currentProfile.username = cleanName;
    const userEl = document.getElementById("drawer-username");
    if (userEl) userEl.innerText = cleanName;
    updateHeaderAvatarInitial(cleanName);
    showToast("Nome utente aggiornato!");
    await loadRecipesFromCloud();
  }
}

async function handleLogout() {
  closeSideDrawer();
  await supabaseClient.auth.signOut();
  showToast("Disconnesso");
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
  const reqSection = document.getElementById("friend-requests-section");
  const reqList = document.getElementById("friend-requests-list");
  const friendsList = document.getElementById("friends-list");
  const notifDot = document.getElementById("drawer-notif-dot");
  const countBadge = document.getElementById("friends-count-badge");

  const incomingPending = friendships.filter(
    f => f.status === "pending" && f.addressee_id === currentUser.id
  );

  if (incomingPending.length > 0) {
    if (reqSection) reqSection.style.display = "block";
    if (notifDot) notifDot.style.display = "block";
    if (reqList) {
      reqList.innerHTML = incomingPending.map(req => `
        <div class="friend-row">
          <div style="min-width: 0;">
            <strong>👤 ${req.requester.username}</strong>
          </div>
          <div style="display:flex; gap:4px; flex-shrink: 0;">
            <button type="button" class="btn-timer" style="background:#86efac; padding:6px 8px;" onclick="respondFriendRequest('${req.id}', true)">✓</button>
            <button type="button" class="btn-timer" style="background:#fca5a5; padding:6px 8px;" onclick="respondFriendRequest('${req.id}', false)">✕</button>
          </div>
        </div>
      `).join("");
    }
  } else {
    if (reqSection) reqSection.style.display = "none";
    if (notifDot) notifDot.style.display = "none";
  }

  const accepted = friendships.filter(f => f.status === "accepted");
  if (countBadge) countBadge.innerText = String(accepted.length);

  if (friendsList) {
    if (accepted.length === 0) {
      friendsList.innerHTML = `<p style="margin:0; font-size:0.95rem;">Nessun amico salvato.</p>`;
    } else {
      friendsList.innerHTML = accepted.map(f => {
        const friendProfile = f.requester_id === currentUser.id ? f.addressee : f.requester;
        return `
          <div class="friend-row">
            <div style="min-width: 0;">
              <strong>👤 ${friendProfile.username}</strong>
            </div>
            <button type="button" class="btn-timer" style="flex:0; background:#fca5a5; padding:6px 8px;" onclick="removeFriend('${f.id}')">✕</button>
          </div>
        `;
      }).join("");
    }
  }
}

async function sendFriendRequest() {
  const input = document.getElementById("friend-search-input");
  const query = (input?.value || "").trim();

  if (!query) return showToast("Inserisci un nome utente o un'email");

  let targetProfile = null;
  if (query.includes("@")) {
    const { data } = await supabaseClient
      .from("profiles")
      .select("id, username, email")
      .eq("email", query.toLowerCase())
      .maybeSingle();
    targetProfile = data;
  } else {
    const { data } = await supabaseClient
      .from("profiles")
      .select("id, username, email")
      .ilike("username", query)
      .maybeSingle();
    targetProfile = data;
  }

  if (!targetProfile) {
    return showToast("Nessun utente trovato con questo nome", 2500);
  }

  if (targetProfile.id === currentUser.id) {
    return showToast("Non puoi invitare te stesso!");
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
    if (input) input.value = "";
    showToast(`Richiesta inviata a ${targetProfile.username}!`);
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
