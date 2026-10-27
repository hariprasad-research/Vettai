
const config = window.VETTAI_CONFIG;

if (
  !window.supabase ||
  !config?.SUPABASE_URL ||
  !config?.SUPABASE_PUBLISHABLE_KEY
) {
  throw new Error("Supabase configuration is missing.");
}

const supabase = window.supabase.createClient(
  config.SUPABASE_URL,
  config.SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

const loginSection = $("superAdminLogin");
const dashboard = $("adminDashboard");
const loginForm = $("superAdminLoginForm");
const loginButton = $("adminLoginButton");
const loginError = $("adminLoginError");

let toastTimer;
let superAdminUsers = [];
let selectedProfileId = null;

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.hidden = false;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function showLogin(message = "") {
  if (loginSection) loginSection.hidden = false;
  if (dashboard) dashboard.hidden = true;
  if (loginError) loginError.textContent = message;
}

function showDashboard() {
  if (loginSection) loginSection.hidden = true;
  if (dashboard) dashboard.hidden = false;

  if ($("supabaseStatus")) {
    $("supabaseStatus").textContent =
      "Supabase authentication connected.";
  }

  if ($("supabaseStatusBadge")) {
    $("supabaseStatusBadge").textContent = "Connected";
    $("supabaseStatusBadge").classList.remove("closed");
  }

  if ($("systemSupabaseStatus")) {
    $("systemSupabaseStatus").textContent =
      "Authentication connection active.";
  }

  if ($("systemSupabaseBadge")) {
    $("systemSupabaseBadge").textContent = "Connected";
    $("systemSupabaseBadge").classList.remove("closed");
  }

  if ($("authorizationStatus")) {
    $("authorizationStatus").textContent = "Verified";
    $("authorizationStatus").classList.remove("closed");
  }

  showView("overview", false);
}

async function verifySuperAdmin() {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) return false;

  const { data, error } =
    await supabase.rpc("is_super_admin");

  if (error || data !== true) {
    await supabase.auth.signOut();
    return false;
  }

  return true;
}

// Dashboard statistics
async function loadSuperAdminStats() {
  const { data, error } = await supabase.rpc(
    "get_super_admin_stats"
  );

  if (error) {
    console.error("Failed to load statistics:", error);
    showToast("Could not load dashboard statistics.");
    return;
  }

  if ($("totalUsersValue")) {
    $("totalUsersValue").textContent = data.total_users ?? 0;
  }

  if ($("institutionAccountsValue")) {
    $("institutionAccountsValue").textContent =
      data.institution_accounts ?? 0;
  }

  if ($("organiserAccountsValue")) {
    $("organiserAccountsValue").textContent =
      data.organiser_accounts ?? 0;
  }
}

// Safe HTML output
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function roleLabel(role) {
  const value = String(role ?? "").toLowerCase();

  if (value === "organiser") return "Organiser";
  if (value === "academy") return "Institution";
  if (value === "super_admin") return "Super Admin";

  return value ? value.replace(/_/g, " ") : "Unknown";
}

// User Manager rows
function accountRowsMarkup(users) {
  if (!users.length) return "";

  return users.map((user, index) => {
    const displayName =
      user.academy_name ||
      user.full_name ||
      user.email ||
      `Account ${index + 1}`;

    const details =
      user.email ||
      user.academy_code ||
      user.academy_id ||
      "No contact details";

    return `
      <tr>
        <td>${escapeHTML(displayName)}</td>
        <td>${escapeHTML(details)}</td>
        <td>${escapeHTML(roleLabel(user.role))}</td>
        <td>${escapeHTML(formatDate(user.created_at))}</td>
        <td>
          <button
            class="btn outline"
            type="button"
            data-user-details="${escapeHTML(user.profile_id)}">
            View
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderUserTables() {
  const managerRows = $("managerRows");
  const recentRows = $("recentRows");
  const managerEmpty = $("managerEmpty");
  const recentEmpty = $("recentEmpty");

  if (managerRows) {
    managerRows.innerHTML = accountRowsMarkup(superAdminUsers);
  }

  const recent = [...superAdminUsers]
    .sort((a, b) =>
      new Date(b.created_at || 0) -
      new Date(a.created_at || 0)
    )
    .slice(0, 5);

  if (recentRows) {
    recentRows.innerHTML = accountRowsMarkup(recent);
  }

  if (managerEmpty) {
    managerEmpty.hidden = superAdminUsers.length > 0;
    managerEmpty.textContent = "No accounts found.";
  }

  if (recentEmpty) {
    recentEmpty.hidden = recent.length > 0;
    recentEmpty.textContent = "No accounts found.";
  }
}

// Requires the protected Supabase RPC get_super_admin_users
async function loadSuperAdminUsers() {
  const managerRows = $("managerRows");

  if (managerRows) {
    managerRows.innerHTML =
      '<tr><td colspan="5">Loading accounts...</td></tr>';
  }

  const { data, error } = await supabase.rpc(
    "get_super_admin_users"
  );

  if (error) {
    console.error("Failed to load users:", error);

    if (managerRows) managerRows.innerHTML = "";

    if ($("managerEmpty")) {
      $("managerEmpty").hidden = false;
      $("managerEmpty").textContent =
        "Unable to load accounts. Check the database function and permissions.";
    }

    if ($("recentEmpty")) {
      $("recentEmpty").hidden = false;
      $("recentEmpty").textContent =
        "Unable to load recent registrations.";
    }

    showToast("Unable to load users. Check the Console.");
    return;
  }

  superAdminUsers = Array.isArray(data) ? data : [];
  renderUserTables();
}

// User details modal
function openUserDetails(profileId) {
  selectedProfileId = profileId;
  const user = superAdminUsers.find(
    (item) => String(item.profile_id) === String(profileId)
  );

  if (!user) return;

  const details = [
    ["Account", user.academy_name || user.full_name || "—"],
    ["Email", user.email || "Not available"],
    ["Phone", user.phone || "—"],
    ["Academy code", user.academy_code || "—"],
    ["Profile ID", user.profile_id || "—"],
    ["Academy ID", user.academy_id || "—"],
    ["Role", roleLabel(user.role)],
    ["Registered", formatDate(user.created_at)]
  ];

  const container = $("userDetails");

  if (container) {
    container.innerHTML = details.map(([label, value]) => `
      <div class="detail-item">
        <small>${escapeHTML(label)}</small>
        <div>${escapeHTML(value)}</div>
      </div>
    `).join("");
  }

  // Role updates remain disabled until secure backend support exists.
  const roleSelect = $("roleSelect");
  const applyRole = $("applyRole");

  if (roleSelect) {
    roleSelect.value =
      String(user.role).toLowerCase() === "organiser"
        ? "Organiser"
        : "Institution";

    roleSelect.disabled = false;
  }

  if (applyRole) {
    applyRole.disabled = false;
    applyRole.title =
      "Role changes are not enabled yet.";
  }

  if ($("userModal")) {
    $("userModal").hidden = false;
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) return;

  const button = target.closest("[data-user-details]");

  if (button) {
    openUserDetails(button.dataset.userDetails);
  }
});

$("closeModal")?.addEventListener("click", () => {
  if ($("userModal")) $("userModal").hidden = true;
});

$("cancelRole")?.addEventListener("click", () => {
  if ($("userModal")) $("userModal").hidden = true;
});

$("userModal")?.addEventListener("click", (event) => {
  if (event.target === $("userModal")) {
    $("userModal").hidden = true;
  }
});

// Dashboard navigation
function showView(viewName, updateHash = true) {
  const validViews = [
    "overview",
    "users",
    "registration",
    "contact",
    "system"
  ];

  const view = validViews.includes(viewName)
    ? viewName
    : "overview";

  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });

  document.querySelectorAll("[data-admin-view]").forEach((link) => {
    const active = link.dataset.adminView === view;

    if (link.classList.contains("nav")) {
      link.classList.toggle("active", active);

      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  });

  if (updateHash && window.location.hash !== `#${view}`) {
    history.replaceState(null, "", `#${view}`);
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) return;

  const nav = target.closest("[data-admin-view]");

  if (nav) {
    event.preventDefault();
    showView(nav.dataset.adminView);
  }
});

$("openManager")?.addEventListener("click", () => {
  showView("users");
});

$("backOverview")?.addEventListener("click", () => {
  showView("overview");
});

window.addEventListener("hashchange", () => {
  if (dashboard && !dashboard.hidden) {
    showView(window.location.hash.slice(1), false);
  }
});

// WhatsApp link preview
function openWhatsApp() {
  const number = ($("waNumber")?.value || "").replace(/\D/g, "");
  const message = ($("waMessage")?.value || "").trim();

  if (number.length < 10 || number.length > 15) {
    showToast("Enter a valid WhatsApp number with country code.");
    $("waNumber")?.focus();
    return;
  }

  const url =
    `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

$("testWhatsApp")?.addEventListener("click", openWhatsApp);
$("previewWhatsApp")?.addEventListener("click", openWhatsApp);

// Unimplemented operations must not pretend to save
$("applyRole").addEventListener("click", async () => {
  if (!selectedProfileId) {
    alert("Please select a user first.");
    return;
  }

  const roleSelect = $("roleSelect");
  const applyButton = $("applyRole");

  const newRole =
    roleSelect.value === "Institution" ? "academy" :
    roleSelect.value === "Organiser" ? "organiser" :
    null;

  if (!newRole) {
    alert("Invalid role selected.");
    return;
  }

  applyButton.disabled = true;
  applyButton.textContent = "Saving...";

  try {
    const { error } = await supabase.rpc(
      "set_super_admin_user_role",
      {
        target_profile_id: selectedProfileId,
        new_role: newRole
      }
    );

    if (error) throw error;

    alert("User role updated successfully.");

    $("userModal").hidden = true;

    await loadSuperAdminUsers();
    await loadSuperAdminStats();
  } catch (error) {
    console.error("Role update failed:", error);
    alert("Failed to update role: " + error.message);
  } finally {
    applyButton.disabled = false;
    applyButton.textContent = "Save Role";
  }
});

// Contact settings — save to Supabase
async function saveContactSettings() {
  const numberInput = $("waNumber");
  const messageInput = $("waMessage");
  const saveButton = $("saveContactSettings");
  const status = $("contactSaveStatus");
  const mode = $("contactPageState");

  const number = (numberInput?.value || "").replace(/\D/g, "");
  const message = (messageInput?.value || "").trim();

  if (number.length < 10 || number.length > 15) {
    showToast("Enter a valid WhatsApp number with country code.");
    numberInput?.focus();
    return;
  }

  if (!message) {
    showToast("Enter a pre-filled WhatsApp message.");
    messageInput?.focus();
    return;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  try {
    const authorised = await verifySuperAdmin();

    if (!authorised) {
      showLogin("Super Admin access required.");
      return;
    }

    const { data, error } = await supabase.rpc(
      "save_contact_settings",
      {
        p_whatsapp_number: number,
        p_whatsapp_message: message
      }
    );

    if (error) throw error;

    if (status) status.textContent = "Contact settings saved.";
    if (mode) mode.textContent = "Connected";

    showToast("Contact settings saved successfully.");
  } catch (error) {
    console.error("Contact settings save failed:", error);
    if (status) status.textContent = "Save failed. Please try again.";
    showToast("Could not save contact settings.");
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Contact Settings";
    }
  }
}

$("saveContactSettings")?.addEventListener(
  "click",
  saveContactSettings
);

// Contact settings — load from Supabase
async function loadContactSettings() {
  const status = $("contactSaveStatus");
  const mode = $("contactPageState");

  try {
    const { data, error } = await supabase.rpc(
      "get_contact_settings"
    );

    if (error) throw error;

    const settings = Array.isArray(data) ? data[0] : data;

    if (!settings) {
      throw new Error("Contact settings have not been configured.");
    }

    $("waNumber").value = settings.whatsapp_number || "";
    $("waMessage").value = settings.whatsapp_message || "";

    if (mode) mode.textContent = "Connected";
    if (status) status.textContent = "Contact settings loaded.";
  } catch (error) {
    console.error("Contact settings load failed:", error);

    if (mode) mode.textContent = "Load failed";
    if (status) {
      status.textContent = "Could not load contact settings.";
    }
  }
}
// Registration settings — load and save through Supabase.
async function loadRegistrationStatus() {
  const { data, error } = await supabase.rpc(
    "get_registration_status"
  );

  if (error) {
    console.error("Registration status load failed:", error);
    showToast("Could not load registration settings.");
    return;
  }

  updateRegistrationUI(data);
}

function updateRegistrationUI(enabled) {
  const isEnabled = Boolean(enabled);

  ["registrationSwitch", "registrationSwitchPage"].forEach((id) => {
    const input = $(id);
    if (input) input.checked = isEnabled;
  });

  if ($("accessState")) {
    $("accessState").textContent = isEnabled
      ? "Registration enabled"
      : "Contact page mode";
    $("accessState").classList.toggle("closed", !isEnabled);
  }

  if ($("switchTitle")) {
    $("switchTitle").textContent = isEnabled
      ? "Registration is open"
      : "Registration is switched off";
  }

  if ($("switchDescription")) {
    $("switchDescription").textContent = isEnabled
      ? "Visitors can see the registration options."
      : "Visitors should see the WhatsApp contact page.";
  }

  if ($("registrationPageTitle")) {
    $("registrationPageTitle").textContent = isEnabled
      ? "Public registration is enabled"
      : "Public registration is disabled";
  }

  if ($("registrationPageDescription")) {
    $("registrationPageDescription").textContent = isEnabled
      ? "Visitors can use the registration options."
      : "Visitors will see the WhatsApp contact page.";
  }

  if ($("contactPreview")) {
    $("contactPreview").hidden = isEnabled;
  }
}

async function saveRegistrationStatus(enabled) {
  const switches = ["registrationSwitch", "registrationSwitchPage"]
    .map((id) => $(id))
    .filter(Boolean);

  switches.forEach((input) => {
    input.disabled = true;
  });

  try {
    const { data, error } = await supabase.rpc(
      "set_registration_status",
      { enabled }
    );

    if (error) throw error;

    updateRegistrationUI(data);
    showToast(data ? "Registration enabled." : "Registration disabled.");
  } catch (error) {
    console.error("Registration status save failed:", error);
    await loadRegistrationStatus();
    showToast("Could not save registration setting.");
  } finally {
    switches.forEach((input) => {
      input.disabled = false;
    });
  }
}

$("registrationSwitch")?.addEventListener("change", (event) => {
  saveRegistrationStatus(event.target.checked);
});

$("registrationSwitchPage")?.addEventListener("change", (event) => {
  saveRegistrationStatus(event.target.checked);
});

// Portal startup
async function initialisePortal() {
  showLogin();

  try {
    const authorised = await verifySuperAdmin();

    if (!authorised) {
      showLogin();
      return;
    }

    showDashboard();

await Promise.all([
  loadSuperAdminStats(),
  loadSuperAdminUsers(),
  loadRegistrationStatus(),
  loadContactSettings()
]);
  } catch (error) {
    console.error("Portal initialization failed:", error);
    showLogin("Unable to verify access. Please sign in again.");
  }
}

// Login
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value;

  if (!email || !password) {
    showLogin("Enter your email and password.");
    return;
  }

  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = "Verifying...";
  }

  if (loginError) loginError.textContent = "";

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showLogin("Login failed. Check your email and password.");
      return;
    }

    const authorised = await verifySuperAdmin();

    if (!authorised) {
      showLogin("Access denied. Super Admin only.");
      return;
    }

    loginForm.reset();
    showDashboard();

    await Promise.all([
  loadSuperAdminStats(),
  loadSuperAdminUsers(),
  loadContactSettings()
]);
  } catch (error) {
    console.error("Login error:", error);
    showLogin("Unable to sign in. Please try again.");
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = "Sign In";
    }
  }
});

// Logout
$("adminLogoutButton")?.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    showToast("Could not sign out. Please try again.");
    return;
  }

  showLogin();
  showToast("Signed out successfully.");
});

initialisePortal();
