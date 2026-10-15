import { esc, ageAtMatch, dateLabel, csvCell, nextId } from './utils.js';
import { signInWithPassword, signUpAcademy, signOut } from './auth.js';
import { participantFromRow, participantPayload, newParticipantPayload } from './participants.js';
import {
  refereeValues,
  refereeFromRow,
  loadReferees,
  createReferee,
  updateReferee,
  deleteReferee as deleteRefereeFromSupabase
} from './referees.js';

const MATCH_DATE = '2026-10-24';
const STORAGE_KEY = 'vettai-match-data-v1';
const SESSION_KEY = 'vettai-match-session-v1';
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } =
  window.VETTAI_CONFIG;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂', roles: ['ORGANISER', 'INSTITUTE'] },
  { id: 'institutes', label: 'Institutes', icon: '▦', roles: ['ORGANISER'] },
  { id: 'participants', label: 'Participants', icon: '◉', roles: ['ORGANISER', 'INSTITUTE'] },
  { id: 'referees', label: 'Referees', icon: '✳', roles: ['ORGANISER', 'INSTITUTE'] },
  { id: 'pitches', label: 'Pitches', icon: '⌁', roles: ['ORGANISER'] },
  { id: 'downloads', label: 'Downloads', icon: '⇩', roles: ['ORGANISER'] },
  { id: 'profile', label: 'Profile', icon: '◉', roles: ['INSTITUTE'] }
];


const seed = {
  registrationOpen: true,
  institutes: [],
  students: [],
  referees: [],
  studentSequence: 1,
  ageGroups: [
    { label: 'Under 10', min: 0, max: 10 },
    { label: 'Under 12', min: 11, max: 12 },
    { label: 'Under 14', min: 13, max: 14 },
    { label: 'Under 16', min: 15, max: 16 },
    { label: 'Open', min: 17, max: 99 }
  ],
  pitches: []
};


let data = loadData();
// Never trust a browser-stored role; authenticate with Supabase.
let session = null;
let authView = 'registration';
let signupCreatedId = null;
let activePage = 'dashboard';
let selectedInstitute = null;
let searchText = '';
let categoryFilter = 'ALL';
let instituteFilter = 'ALL';
let ageGroupFilter = 'ALL';
let modalState = null;
const initialPage = location.hash.slice(1);
if (session && NAV_ITEMS.some(item => item.id === initialPage && item.roles.includes(session.role))) activePage = initialPage;



function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (saved && typeof saved === 'object') {
      return {
        ...structuredClone(seed),
        ...saved,
        institutes: [],
        students: [],
        referees: [],
        ageGroups: Array.isArray(saved.ageGroups)
          ? saved.ageGroups
          : structuredClone(seed.ageGroups),
        pitches: Array.isArray(saved.pitches) ? saved.pitches : []
      };
    }
  } catch (error) {
    console.warn('Stored data could not be read.', error);
  }

  return structuredClone(seed);
}



function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}


async function loadParticipantsFromSupabase() {
  const institute = currentInstitute();
  if (!institute?.id) return;

  const { data: rows, error } = await supabaseClient
    .from("participants")
    .select("*")
    .eq("academy_id", institute.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load participants failed:", error);
    toast("Could not load participants: " + error.message, true);
    return;
  }

  data.students = rows.map(participantFromRow);

  render();
}

async function loadRefereesFromSupabase() {
  try {
    const academyId = currentInstitute()?.id;

    let query = supabaseClient
      .from('referees')
      .select('*')
      .order('created_at', { ascending: true });

    if (!isOrganiser()) {
      if (!academyId) throw new Error('Academy ID missing.');
      query = query.eq('academy_id', academyId);
    }

    const { data: rows, error } = await query;

    if (error) throw error;

    data.referees = (rows || []).map(refereeFromRow);
    render();
  } catch (error) {
    console.error('Load referees failed:', error);
    toast(`Could not load referees: ${error.message}`, true);
  }
}


async function restoreAuthSession() {
  try {
    // Verify the currently authenticated Supabase user.
    const { data: authData, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !authData.user) {
      session = null;
      render();
      return;
    }
console.log('AUTH RESTORE:', {
  user: authData?.user?.id,
  error: authError?.message
});
    const user = authData.user;

    // Always load the role from the database.
    const { data: profile, error: profileError } =
      await supabaseClient
        .from('profiles')
        .select('id, role, academy_id')
        .eq('id', user.id)
        .single();

if (profileError || !profile) {
  console.error('PROFILE RESTORE FAILED:', profileError);
  session = null;
  render();
  toast(
    `Profile restore failed: ${profileError?.message || 'Profile not found'}`,
    true
  );
  return;
}

console.log('PROFILE RESTORE:', {
  profile,
  error: profileError?.message
});


if (profile.role === 'organiser') {
  session = { role: 'ORGANISER', userId: user.id };
  activePage = 'dashboard';

  await loadInstitutesFromSupabase();
  await loadAllParticipantsFromSupabase();
  await loadRefereesFromSupabase();

  render();
  return;
}


async function loadAllParticipantsFromSupabase() {
  try {
    const { data: rows, error } = await supabaseClient
      .from('participants')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    data.students = (rows || []).map(participantFromRow);

    persist();
    console.log('Participants loaded:', data.students.length);
  } catch (error) {
    console.error('Load all participants failed:', error);
    toast(`Could not load participants: ${error.message}`, true);
  }
}


    if (profile.role !== 'academy' || !profile.academy_id) {
      await signOut(supabaseClient);
      session = null;
      render();
      return;
    }

    const { data: academy, error: academyError } =
      await supabaseClient
        .from('academies')
        .select(
          'id, academy_code, academy_name, master_name, phone, email'
        )
        .eq('id', profile.academy_id)
        .single();

   if (academyError || !academy) {
  console.error('ACADEMY RESTORE FAILED:', academyError);
  session = null;
  render();
  toast(
    `Academy restore failed: ${academyError?.message || 'Academy not found'}`,
    true
  );
  return;
}

    const institute = {
      id: academy.id,
      loginId: academy.academy_code || academy.id,
      academyName: academy.academy_name,
      masterName: academy.master_name,
      phone: academy.phone,
      email: academy.email
    };

  data.institutes = Array.isArray(data.institutes)
  ? data.institutes
  : [];

if (!data.institutes.some(item => item.id === institute.id)) {
  data.institutes.push(institute);
}
    session = {
      role: 'INSTITUTE',
      instituteId: institute.id,
      institute,
      userId: user.id
    };

    activePage = 'participants';
    render();

    await loadParticipantsFromSupabase();
    await loadRefereesFromSupabase();

  } catch (error) {
    console.error('Session restore failed:', error);
    session = null;
    render();
    toast('Could not restore your login. Please sign in again.', true);
  }
}


function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function persistSession() { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function instituteById(id) { return data.institutes.find(item => item.id === id); }
function currentInstitute() { return session?.role === 'INSTITUTE' ? (instituteById(session.instituteId) || session.institute || null) : null; }
function isOrganiser() { return session?.role === 'ORGANISER'; }
function participantAge(student) { return Number.isFinite(Number(student.age)) && student.age !== '' ? Number(student.age) : ageAtMatch(student.dob); }
function participantEvents(student) {
  if (Array.isArray(student.events) && student.events.length) return student.events;
  if (student.category === 'BOTH') return ['INDIVIDUAL', 'FIGHT'];
  return student.category ? [student.category] : [];
}
function eventLabel(student) { return participantEvents(student).map(event => event === 'INDIVIDUAL' ? 'Individual' : 'Fight').join(' + ') || '—'; }
function weightLabel(student) { return student.weight ? `${esc(student.weight)}${/kg/i.test(student.weight) ? '' : ' KG'}` : '—'; }
function ageGroup(age) { return data.ageGroups.find(group => age >= Number(group.min) && age <= Number(group.max)); }

function instituteStudents(id) {
  const students = Array.isArray(data.students) ? data.students : [];
  return students.filter(student => student.instituteId === id);
}

function instituteReferees(id) {
  const referees = Array.isArray(data.referees) ? data.referees : [];
  return referees.filter(referee => referee.instituteId === id);
}

function nextStudentCode() { return `STU${String(data.studentSequence).padStart(4, '0')}`; }

function allStats(students = data.students) {
  const list = Array.isArray(students) ? students : [];
  const events = list.map(participantEvents);

  return {
    total: list.length,
    individual: events.filter(items => items.includes('INDIVIDUAL')).length,
    fight: events.filter(items => items.includes('FIGHT')).length,
    both: events.filter(
      items => items.includes('INDIVIDUAL') && items.includes('FIGHT')
    ).length
  };
}

function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  document.querySelector('#toast-root').append(node);
  setTimeout(() => node.remove(), 3100);
}




function render() {
  const root = document.querySelector('#app');

  if (!session) {
    root.innerHTML = authView === 'login'
      ? renderLogin()
      : renderRegistrationChoice();
    return;
  }

  if (session.role === 'INSTITUTE' && !currentInstitute()) { logout(); return; }
  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(session.role));
  if (activePage === 'institute-detail' && !isOrganiser()) activePage = 'dashboard';
  if (!visibleNav.some(item => item.id === activePage) && activePage !== 'institute-detail') activePage = 'dashboard';
  const title = activePage === 'institute-detail' ? 'Institute profile' : NAV_ITEMS.find(item => item.id === activePage)?.label || 'Dashboard';
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        ${brand()}
        <div class="side-event"><span>District tournament</span><strong>Silambam Match</strong><small>24 October 2026 · Tamil Nadu</small></div>
        <div class="nav-label">Workspace</div>
        <nav class="side-nav">${visibleNav.map(item => navButton(item, activePage)).join('')}</nav>
        <div class="side-bottom">
          ${isOrganiser() ? `<div class="registration-chip"><i class="live-dot"></i> Registration ${data.registrationOpen ? 'open' : 'closed'}</div>` : ''}
          ${profileRow()}
        </div>
      </aside>
      <section class="main-area">
        <header class="topbar">
          <div class="breadcrumb-wrap"><button class="mobile-menu" data-action="mobile-menu" aria-label="Open navigation">☰</button><div class="breadcrumb">Vettai <span aria-hidden="true">/</span> <strong>${esc(title)}</strong></div></div>
          <div class="top-actions"><span class="event-date">24 OCT 2026</span><span class="role-tag">${session.role}</span></div>
        </header>
        <main class="content">${renderPage()}</main>
      </section>
      <nav class="mobile-nav">${visibleNav.map(item => navButton(item, activePage)).join('')}<button class="nav-button" data-action="logout"><span class="nav-icon" aria-hidden="true">↗</span><span>Logout</span></button></nav>
    </div>`;
  renderModal();
}

function brand() { return `<div class="brand"><span class="brand-mark" aria-hidden="true">⌁</span><span>VETTAI</span></div>`; }
function navButton(item, current) { const selectedPage = current === 'institute-detail' ? 'institutes' : current; return `<button class="nav-button ${selectedPage === item.id ? 'active' : ''}" data-page="${item.id}"><span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span></button>`; }
function profileRow() {
  const institute = currentInstitute();
  const name = isOrganiser() ? 'HFS Academy' : institute.academyName;
  const role = isOrganiser() ? 'Organiser account' : institute.id;
  const initials = isOrganiser() ? 'HFS' : institute.academyName.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return `<div class="profile-row"><div class="avatar">${esc(initials)}</div><div class="profile-meta"><strong>${esc(name)}</strong><small>${esc(role)}</small></div><button class="logout-icon" data-action="logout" title="Log out" aria-label="Log out">↗</button></div>`;
}

function renderRegistrationChoice() {
  return `<div class="login-shell">
    <section class="login-art">${brand()}
      <div class="art-copy">
        <p class="eyebrow">One district. One arena.</p>
        <h1>Discipline meets the day.</h1>
        <p>Registration, verification and pitch coordination for the district Silambam match.</p>
        <div class="event-stamp">24 OCTOBER 2026</div>
      </div>
      <div class="art-foot">DISTRICT SILAMBAM MATCH · 2026</div>
    </section>

    <section class="login-main">
      <div class="login-panel">
        <p class="eyebrow">Registration</p>
        <h2>Choose Registration Type</h2>
        <p>Select how you want to register for the tournament.</p>

        <button class="btn btn-primary btn-wide"
          type="button"
          data-action="self-registration">
          Self Registration →
        </button>

        <button class="btn btn-outline btn-wide"
          type="button"
          data-action="academy-registration">
          Academy / Institution Registration →
        </button>
      </div>
    </section>
  </div>`;
}

function renderLogin() {
  if (authView === 'signup') return renderAcademySignup();
  if (authView === 'signup-success') return renderSignupSuccess();

  return `<div class="login-shell">
    <section class="login-art">${brand()}<div class="art-copy"><p class="eyebrow">One district. One arena.</p><h1>Discipline meets the day.</h1><p>Registration, verification and pitch coordination for the district Silambam match.</p><div class="event-stamp">24 OCTOBER 2026</div></div><div class="art-foot">DISTRICT SILAMBAM MATCH · 2026</div></section>
    <section class="login-main"><div class="login-panel"><p class="eyebrow">Match administration</p><h2>Welcome back</h2><p>Sign in to your tournament workspace.</p>
      <form id="login-form"><div class="field"><label for="login-id">Login ID</label><input id="login-id" name="loginId" autocomplete="username" placeholder="Email address" required></div><div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></div><div class="login-actions">
<button class="btn btn-outline btn-wide"
  type="button"
  data-action="back-to-registration">
  ← Back to Registration
</button>
<button class="btn btn-primary btn-wide" type="submit">Sign in <span aria-hidden="true">→</span></button><button class="btn btn-outline btn-inline" type="button" data-action="show-signup">Sign Up</button></div></form>
    </div></section>
  </div>`;
}

function renderSignupSuccess() {
  return `<div class="login-shell">
    <section class="login-art">
      ${brand()}
      <div class="art-copy">
        <p class="eyebrow">One district. One arena.</p>
        <h1>Discipline meets the day.</h1>
        <p>Your academy registration is ready for verification.</p>
        <div class="event-stamp">24 OCTOBER 2026</div>
      </div>
      <div class="art-foot">DISTRICT SILAMBAM MATCH · 2026</div>
    </section>

    <section class="login-main">
      <div class="login-panel signup-panel">
        <p class="eyebrow">One last step</p>
        <h2>Check Your Email!</h2>

        <p>
          Your academy account has been created successfully.
          We've sent a confirmation link to your registered email address.
        </p>

        <div class="notice">
          <strong>What should you do next?</strong>
          <p>1. Open your email inbox.</p>
          <p>2. Check your Spam or Junk folder if you don't see our email.</p>
          <p>3. Click the confirmation link in the email.</p>
          <p>4. Return here and sign in to your VETTAI account.</p>
        </div>

        <p class="muted">
          Didn't receive the email? Please check your email address
          and try again later.
        </p>

        <button
          class="btn btn-primary btn-wide"
          type="button"
          data-action="show-login"
        >
          Go to Login →
        </button>
      </div>
    </section>
  </div>`;
}

function renderAcademySignup() {
  return `<div class="login-shell">
    <section class="login-art">${brand()}<div class="art-copy"><p class="eyebrow">One district. One arena.</p><h1>Discipline meets the day.</h1><p>Register your academy to participate in the district Silambam match.</p><div class="event-stamp">24 OCTOBER 2026</div></div><div class="art-foot">DISTRICT SILAMBAM MATCH · 2026</div></section>
    <section class="login-main"><div class="login-panel signup-panel"><p class="eyebrow">Academy access</p><h2>ACADEMY REGISTRATION</h2><p>Create your institute account for tournament participation.</p>
      <form id="academy-signup-form" novalidate>
        <div class="field"><label for="signup-academy-name">Academy Name</label><input id="signup-academy-name" name="academyName" type="text" placeholder="Enter academy name" required><div class="validation-message" data-error-for="academyName"></div></div>
        <div class="field"><label for="signup-master-name">Master Name</label><input id="signup-master-name" name="masterName" type="text" placeholder="Enter master name" required><div class="validation-message" data-error-for="masterName"></div></div>
        <div class="field">
  <label for="signup-phone">Phone Number</label>
  <input
    id="signup-phone"
    name="phone"
    type="tel"
    inputmode="numeric"
    pattern="[0-9]{10}"
    minlength="10"
    maxlength="10"
    placeholder="Enter 10-digit mobile number"
    required
  >
  <div class="validation-message" data-error-for="phone"></div>
</div>
        <div class="field"><label for="signup-email">Email</label><input id="signup-email" name="email" type="email" placeholder="Enter email address"><div class="validation-message" data-error-for="email"></div></div>
        <div class="field"><label for="signup-password">Password</label><input id="signup-password" name="password" type="password" placeholder="Enter password" required><div class="validation-message" data-error-for="password"></div></div>
        <div class="field"><label for="signup-confirm-password">Confirm Password</label><input id="signup-confirm-password" name="confirmPassword" type="password" placeholder="Confirm password" required><div class="validation-message" data-error-for="confirmPassword"></div></div>
        <button class="btn btn-primary btn-wide" type="submit">Create Account</button>
      </form>
      <div class="signup-row compact"><button class="btn btn-outline btn-inline" type="button" data-action="show-login">Go to Login</button></div>
    </div></section>
  </div>`;
}


function clearFieldErrors(form) {
  form.querySelectorAll('.validation-message').forEach(node => { node.textContent = ''; });
}

function validateAcademySignup(form) {
  clearFieldErrors(form);
  const values = {
    academyName: String(new FormData(form).get('academyName') || '').trim(),
    masterName: String(new FormData(form).get('masterName') || '').trim(),
    phone: String(new FormData(form).get('phone') || '').trim(),
    email: String(new FormData(form).get('email') || '').trim(),
    password: String(new FormData(form).get('password') || '').trim(),
    confirmPassword: String(new FormData(form).get('confirmPassword') || '').trim()
  };

  const errors = {};
  if (!values.academyName) errors.academyName = 'Academy name is required.';
  if (!values.masterName) errors.masterName = 'Master name is required.';
  if (!values.phone) {
  errors.phone = 'Phone number is required.';
} else if (!/^[0-9]{10}$/.test(values.phone)) {
  errors.phone = 'Enter exactly 10 digits.';
}
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Enter a valid email address.';
  if (!values.password) errors.password = 'Password is required.';
  else if (values.password.length < 6) errors.password = 'Password must be at least 6 characters.';
  if (!values.confirmPassword) errors.confirmPassword = 'Confirm password is required.';
  else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';

  Object.entries(errors).forEach(([field, message]) => {
    const node = form.querySelector(`[data-error-for="${field}"]`);
    if (node) node.textContent = message;
  });

  return Object.keys(errors).length === 0 ? values : null;
}

function renderPage() {
  if (activePage === 'dashboard') return renderDashboard();
  if (activePage === 'institutes') return renderInstitutes();
  if (activePage === 'institute-detail') return renderInstituteDetail();
  if (activePage === 'participants') return renderParticipants();
  if (activePage === 'referees') return renderReferees();
  if (activePage === 'pitches') return renderPitches();
  if (activePage === 'downloads') return renderDownloads();
  if (activePage === 'profile') return renderInstituteProfile();
  return renderDashboard();
}

function pageHeading(kicker, title, description, actions = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
}
function statCard(label, value, foot, icon) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
function renderDashboard() {
  if (isOrganiser()) return renderOrganiserDashboard();
  const institute = currentInstitute();
  const students = instituteStudents(institute.id);
  const stats = allStats(students);
  return `${pageHeading('Institute workspace', 'ACADEMY DASHBOARD', 'Your academy details and registrations at a glance.')}
    <div class="banner"><div class="banner-copy"><span class="banner-symbol">✳</span><div><strong>${esc(institute.academyName)}</strong><small>${esc(institute.masterName)} · ${esc(institute.phone)} · ${esc(institute.email || 'Email not provided')}</small></div></div><span class="role-tag">${institute.id}</span></div>
    <section class="stat-grid">${statCard('Total participants', stats.total, 'Registered from your academy', '◉')}${statCard('Individual', stats.individual, 'Individual event', '◎')}${statCard('Fight', stats.fight, 'Fight event', '✳')}${statCard('Both events', stats.both, 'Individual + Fight', '◉')}${statCard('Total referees', instituteReferees(institute.id).length, 'Academy referees', '⌖')}</section>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>Recent participants</h2><button class="btn btn-quiet" data-page="participants">View all →</button></div><div class="panel-body">${activityList(students.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4))}</div></section><section class="panel"><div class="panel-head"><h2>Quick actions</h2><small>Manage your entries</small></div><div class="panel-body"><div class="quick-links"><button class="quick-link" data-action="add-student" ${!data.registrationOpen ? 'disabled title="Registration is closed"' : ''}><span><strong>Add a participant</strong><small>Register for the October match</small></span><span class="quick-arrow">＋</span></button><button class="quick-link" data-page="referees"><span><strong>Manage referees</strong><small>${instituteReferees(institute.id).length} referees on your roster</small></span><span class="quick-arrow">→</span></button></div>${!data.registrationOpen ? `<p class="note" style="margin:12px 0 0">Registration is closed. New registrations and edits are unavailable.</p>` : ''}</div></section></div>`;
}
function renderOrganiserDashboard() {

data.institutes = Array.isArray(data.institutes) ? data.institutes : [];
data.students = Array.isArray(data.students) ? data.students : [];
data.referees = Array.isArray(data.referees) ? data.referees : [];

  const stats = allStats();
  const categorySummary = ['INDIVIDUAL', 'FIGHT'].map(category => {
    const count = data.students.filter(student => participantEvents(student).includes(category)).length;
    return `<div class="activity-item"><span class="activity-mark">${category === 'FIGHT' ? '✳' : '◎'}</span><span><strong>${category}</strong><small>${count} participants registered</small></span><span class="activity-time">${stats.total ? Math.round(count / stats.total * 100) : 0}%</span></div>`;
  }).join('');
  const recent = data.students.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  return `${pageHeading('Event control', 'District Silambam Match', 'A clear view of registrations and tournament readiness.', `<button class="btn ${data.registrationOpen ? 'btn-outline' : 'btn-primary'}" data-action="toggle-registration">${data.registrationOpen ? 'Close registration' : 'Reopen registration'}</button>`) }
    <div class="banner"><div class="banner-copy"><span class="banner-symbol">${data.registrationOpen ? '◉' : 'Ⅱ'}</span><div><strong>Registration ${data.registrationOpen ? 'is open' : 'is closed'}</strong><small>${data.registrationOpen ? 'Institutes can add and update participant records.' : 'Institute changes are paused. Organiser access remains active.'}</small></div></div><span class="role-tag">24 OCT 2026</span></div>
    <section class="stat-grid">${statCard('Institutes', data.institutes.length, 'Academies in the district', '▦')}${statCard('Participants', stats.total, 'Registered entries', '◉')}${statCard('Individual', stats.individual, 'Registered entries', '◎')}${statCard('Referees', data.referees.length, 'Across all registered academies', '⌖')}</section>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>Latest registrations</h2><button class="btn btn-quiet" data-page="participants">Review participants →</button></div><div class="panel-body">${activityList(recent, true)}</div></section><section class="panel"><div class="panel-head"><h2>Category mix</h2><small>${stats.total} total</small></div><div class="panel-body"><div class="activity-list">${categorySummary}</div><div class="quick-links" style="margin-top:13px"><button class="quick-link" data-page="pitches"><span><strong>Pitch readiness</strong><small>All registered participants are available for pitch review</small></span><span class="quick-arrow">→</span></button><button class="quick-link" data-page="institutes"><span><strong>Institute directory</strong><small>${data.institutes.length} academy accounts</small></span><span class="quick-arrow">→</span></button></div></div></section></div>`;
}
function activityList(students, showAcademy = false) {
  if (!students.length) return emptyState('No participants yet', 'New registrations will appear here.');
  return `<div class="activity-list">${students.map(student => {
    const academy = instituteById(student.instituteId)?.academyName || 'Institute';
    return `<div class="activity-item"><span class="activity-mark">${participantEvents(student).includes('FIGHT') ? '✳' : '◎'}</span><span><strong>${esc(student.name)} <span class="code">${student.id}</span></strong><small>${showAcademy ? `${esc(academy)} · ` : ''}${eventLabel(student)} · age ${participantAge(student) ?? '—'}</small></span><span class="activity-time">${dateLabel(student.createdAt)}</span></div>`;
  }).join('')}</div>`;
}
function emptyState(title, message) { return `<div class="empty-state"><div class="empty-icon">⌁</div><strong>${title}</strong><p>${message}</p></div>`; }

function renderInstitutes() {
  const rows = data.institutes.map(institute => {
    const students = instituteStudents(institute.id);
    return `<tr><td><span class="code">${esc(institute.id)}</span></td><td class="cell-primary">${esc(institute.academyName)}</td><td>${esc(institute.masterName)}</td><td>${esc(institute.phone)}</td><td>${esc(institute.email || '—')}</td><td>${students.length}</td><td>${instituteReferees(institute.id).length}</td><td class="actions-cell"><button class="btn btn-quiet" data-action="view-institute" data-id="${esc(institute.id)}">View</button><button class="btn btn-quiet" data-action="edit-institute" data-id="${esc(institute.id)}">Edit</button></td></tr>`;
  }).join('');
  return `${pageHeading('Directory', 'Institutes', 'Manage academy accounts and review their registrations.', '<button class="btn btn-primary" data-action="add-institute">＋ Create institute</button>')}
    <div class="summary-row"><div class="mini-stat"><span>Institutes</span><strong>${data.institutes.length}</strong></div><div class="mini-stat"><span>Participants</span><strong>${data.students.length}</strong></div><div class="mini-stat"><span>Referees</span><strong>${data.referees.length}</strong></div></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Institute ID</th><th>Academy Name</th><th>Master Name</th><th>Phone</th><th>Email</th><th>Participants</th><th>Referees</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="8">${emptyState('No institutes yet', 'Create an institute account to get started.')}</td></tr>`}</tbody></table></div></section>`;
}

function renderInstituteDetail() {
  const institute = instituteById(selectedInstitute);
  if (!institute) { activePage = 'institutes'; return renderInstitutes(); }
  const students = instituteStudents(institute.id);
  const referees = instituteReferees(institute.id);
  const studentRows = students.map(student => studentRow(student, true)).join('');
  const refereeRows = referees.map(referee => `<tr><td class="cell-primary">${esc(referee.name)}</td><td>${referee.age}</td><td>${esc(referee.academyName)}</td><td>${esc(referee.phone)}</td></tr>`).join('');
  const stats = allStats(students);
  return `${pageHeading('Institute profile', esc(institute.academyName), `${institute.id} · Added ${dateLabel(institute.createdAt)}`, '<button class="btn btn-outline" data-page="dashboard">← Back to Dashboard</button>')}
    <section class="detail-banner"><div><h2>${esc(institute.academyName)}</h2><p>Institute account · ${esc(institute.loginId)}</p><div class="detail-meta"><span>Master<strong>${esc(institute.masterName)}</strong></span><span>Phone<strong>${esc(institute.phone)}</strong></span><span>Email<strong>${esc(institute.email || '—')}</strong></span><span>Participants<strong>${stats.total}</strong></span></div></div><button class="btn btn-outline" data-action="export-institute" data-id="${esc(institute.id)}">⇩ Download data</button></section>
    <div class="summary-row"><div class="mini-stat"><span>All participants</span><strong>${stats.total}</strong></div><div class="mini-stat"><span>Individual</span><strong>${stats.individual}</strong></div><div class="mini-stat"><span>Fight</span><strong>${stats.fight}</strong></div></div>
    <section class="panel" style="margin-bottom:15px"><div class="panel-head"><h2>Participants</h2><small>${stats.total} registered</small></div><div class="table-wrap"><table><thead>${studentTableHead(true)}</thead><tbody>${studentRows || `<tr><td colspan="8">${emptyState('No participants', 'This institute has not registered students yet.')}</td></tr>`}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><h2>Referees</h2><small>${referees.length} listed</small></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Age</th><th>Academy</th><th>Phone</th></tr></thead><tbody>${refereeRows || `<tr><td colspan="4">${emptyState('No referees', 'No referees have been added by this institute.')}</td></tr>`}</tbody></table></div></section>`;
}

function renderParticipants() {
  const institute = currentInstitute();
  const organiser = isOrganiser();
  const students = organiser ? data.students : instituteStudents(institute.id);
  const needle = searchText.toLowerCase().trim();
  const visible = students.filter(student => {
    const owner = instituteById(student.instituteId);
    const matchesText = !needle || [student.id, student.name, owner?.academyName, owner?.masterName].some(value => value?.toLowerCase().includes(needle));
    const matchesInstitute = !organiser || instituteFilter === 'ALL' || student.instituteId === instituteFilter;
    const matchesAgeGroup = ageGroupFilter === 'ALL' || ageGroup(participantAge(student))?.label === ageGroupFilter;
    return matchesText && matchesInstitute && matchesAgeGroup && (categoryFilter === 'ALL' || participantEvents(student).includes(categoryFilter));
  });
  const addButton = !organiser ? `<button class="btn btn-primary" data-action="add-student" ${!data.registrationOpen ? 'disabled title="Registration is closed"' : ''}>＋ Add Participant</button>` : '';
  const description = organiser ? 'Review every student entry before pitch allocation.' : 'Manage your academy’s participant registrations.';
  return `${pageHeading(organiser ? 'Event roster' : 'Academy roster', 'Participants', description, addButton)}
    ${organiser ? `<div class="summary-row"><div class="mini-stat"><span>All entries</span><strong>${students.length}</strong></div><div class="mini-stat"><span>Individual</span><strong>${allStats(students).individual}</strong></div><div class="mini-stat"><span>Fight</span><strong>${allStats(students).fight}</strong></div><div class="mini-stat"><span>Both Events</span><strong>${allStats(students).both}</strong></div></div>` : (!data.registrationOpen ? `<div class="note" style="margin-bottom:15px">Registration is closed. You can view existing entries, but cannot add, edit or delete participants.</div>` : '')}
    <div class="toolbar"><input type="search" id="participant-search" value="${esc(searchText)}" placeholder="Search participant..." aria-label="Search participant"><select id="category-filter" aria-label="Filter by event"><option value="ALL">All</option><option value="INDIVIDUAL" ${categoryFilter === 'INDIVIDUAL' ? 'selected' : ''}>Individual</option><option value="FIGHT" ${categoryFilter === 'FIGHT' ? 'selected' : ''}>Fight</option></select><select id="age-group-filter" aria-label="Filter by age group"><option value="ALL">All ages</option>${data.ageGroups.map(group => `<option value="${esc(group.label)}" ${ageGroupFilter === group.label ? 'selected' : ''}>${esc(group.label)}</option>`).join('')}</select>${organiser ? `<select id="institute-filter" aria-label="Filter by institute"><option value="ALL">All institutes</option>${data.institutes.map(item => `<option value="${esc(item.id)}" ${instituteFilter === item.id ? 'selected' : ''}>${esc(item.academyName)}</option>`).join('')}</select>` : ''}<span class="result-count">${visible.length} of ${students.length} participants</span></div>
    <section class="panel"><div class="table-wrap"><table><thead>${studentTableHead(organiser)}</thead><tbody id="participants-body">${visible.length ? visible.map(student => studentRow(student, organiser)).join('') : `<tr><td colspan="${organiser ? 8 : 6}">${emptyState('No matching participants', 'Try another search or adjust the filters.')}</td></tr>`}</tbody></table></div></section>`;
}
function studentTableHead(organiser) { return `<tr><th>Participant ID</th><th>Name</th><th>Age</th><th>Weight</th><th>Events</th>${organiser ? '<th>Academy</th><th>Master Name</th>' : ''}<th>Actions</th></tr>`; }
function studentRow(student, organiser) {
  const owner = instituteById(student.instituteId);
  const age = participantAge(student);
  const locked = !organiser && !data.registrationOpen;
  const action = organiser
    ? `<button class="btn btn-quiet" data-action="edit-student" data-id="${student.id}">View</button><button class="btn btn-quiet" data-action="edit-student" data-id="${student.id}">Edit</button><button class="btn btn-quiet" data-action="delete-student" data-id="${student.id}">Delete</button>`
    : `<button class="btn btn-quiet" data-action="edit-student" data-id="${student.id}" ${locked ? 'disabled' : ''}>Edit</button><button class="btn btn-quiet" data-action="delete-student" data-id="${student.id}" ${locked ? 'disabled' : ''}>Delete</button>`;
  return `<tr><td><span class="code">${student.id}</span></td><td class="cell-primary">${esc(student.name)}</td><td>${age ?? '—'}</td><td>${weightLabel(student)}</td><td>${eventLabel(student)}</td>${organiser ? `<td>${esc(owner?.academyName || '—')}</td><td>${esc(owner?.masterName || '—')}</td>` : ''}<td class="actions-cell">${action}</td></tr>`;
}

function renderReferees() {
  const organiser = isOrganiser();
  const institute = currentInstitute();
  const list = organiser ? data.referees : instituteReferees(institute.id);
  const body = list.map(referee => `<tr><td class="cell-primary">${esc(referee.name)}</td><td>${referee.age}</td><td>${esc(referee.academyName)}</td><td>${esc(referee.phone)}</td><td class="actions-cell"><button class="btn btn-quiet" data-action="view-referee" data-id="${referee.id}">View</button><button class="btn btn-quiet" data-action="edit-referee" data-id="${referee.id}" ${!organiser && !data.registrationOpen ? 'disabled' : ''}>Edit</button><button class="btn btn-quiet" data-action="delete-referee" data-id="${referee.id}" ${!organiser && !data.registrationOpen ? 'disabled' : ''}>Delete</button></td></tr>`).join('');
  const addButton = !organiser ? `<button class="btn btn-primary" data-action="add-referee" ${!data.registrationOpen ? 'disabled' : ''}>＋ Add referee</button>` : '';
  return `${pageHeading(organiser ? 'Event officials' : 'Academy officials', 'Referees', organiser ? 'Referee roster across all registered institutes.' : 'Manage referees representing your academy.', addButton)}
    ${organiser ? `<div class="summary-row"><div class="mini-stat"><span>Total referees</span><strong>${list.length}</strong></div><div class="mini-stat"><span>Institutes represented</span><strong>${new Set(list.map(person => person.instituteId)).size}</strong></div><div class="mini-stat"><span>Match date</span><strong>24 Oct</strong></div></div>` : (!data.registrationOpen ? `<div class="note" style="margin-bottom:15px">Registration is closed. Referee records can no longer be changed by institutes.</div>` : '')}
    <section class="panel"><div class="panel-head"><h2>Referee directory</h2><small>${list.length} records</small></div><div class="table-wrap"><table><thead><tr><th>Referee Name</th><th>Age</th><th>Academy Name</th><th>Phone</th><th>Actions</th></tr></thead><tbody>${body || `<tr><td colspan="5">${emptyState('No referees listed', 'Add a referee to your academy roster.')}</td></tr>`}</tbody></table></div></section>`;
}

function renderPitches() {
  const rows = data.pitches.map(pitch => `<tr><td><span class="code">PITCH ${String(pitch.number).padStart(2, '0')}</span></td><td>${esc(eventLabel({ events: [pitch.event || pitch.category] }))}</td><td>${esc(pitch.ageGroup)}</td><td>${esc(pitch.weightGroup || '—')}</td><td>${pitch.students.length}</td><td><button class="btn btn-quiet" data-action="view-pitch" data-id="${pitch.number}">View</button></td></tr>`).join('');
  return `${pageHeading('Competition setup', 'Pitch Management', 'Generate pitch rosters using event and match-day age groups.', `<button class="btn btn-primary" data-action="generate-pitches">Generate Pitches</button>`)}
    <div class="toolbar"><label class="note"><input id="pitch-weight-grouping" type="checkbox" ${data.pitchWeightGrouping ? 'checked' : ''}> Group pitches by weight</label></div>
    <section class="panel"><div class="table-wrap"><table><thead><tr><th>Pitch Number</th><th>Event</th><th>Age Group</th><th>Weight Group</th><th>Participant Count</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="6">${emptyState('No pitches generated', 'Generate pitches from the registered participants.')}</td></tr>`}</tbody></table></div></section>`;
}

function renderDownloads() {
  const cards = [
    ['students', 'Download All Participants', 'Participant records across all academies.'],
    ['individual', 'Download Individual Participants', 'Participants entered in Individual.'],
    ['fight', 'Download Fight Participants', 'Participants entered in Fight.'],
    ['institutes', 'Download Academy List', 'Registered academy and contact records.'],
    ['referees', 'Download Referee List', 'Referee records across all academies.'],
    ['pitches', 'Download Pitch List', 'Generated pitch assignments.']
  ];
  return `${pageHeading('Data export', 'Download Centre', 'Export existing tournament records as CSV.')}
    <div class="download-grid">${cards.map(([type, title, desc]) => `<article class="download-card"><span class="download-icon">⇩</span><strong>${title}</strong><small>${desc}</small><button class="btn btn-outline" data-action="download" data-type="${type}">${title}</button></article>`).join('')}</div>`;
}

function renderInstituteProfile() {
  const institute = currentInstitute();
  return `${pageHeading('Academy account', 'Profile', 'Review the contact details for your institute.', '<button class="btn btn-primary" data-action="edit-institute" data-id="' + esc(institute.id) + '" data-profile="true">Edit Profile</button>')}
    <section class="detail-banner"><div><h2>${esc(institute.academyName)}</h2><p>Institute ID · ${esc(institute.id)}</p><div class="detail-meta"><span>Master Name<strong>${esc(institute.masterName)}</strong></span><span>Phone<strong>${esc(institute.phone)}</strong></span><span>Email<strong>${esc(institute.email || '—')}</strong></span></div></div></section>`;
}

function renderModal() {
  const root = document.querySelector('#modal-root');
  if (!modalState) { root.innerHTML = ''; return; }
  const { type, id } = modalState;
  if (type === 'student') root.innerHTML = studentModal(id);
  else if (type === 'institute') root.innerHTML = instituteModal();
  else if (type === 'institute-edit') root.innerHTML = instituteModal(id, modalState.profileMode);
  else if (type === 'referee') root.innerHTML = refereeModal(id);
  else if (type === 'referee-view') root.innerHTML = refereeViewModal(id);
  else if (type === 'pitch-view') root.innerHTML = pitchViewModal(id);
}
function modalFrame(title, desc, contents, wide = false) {
  return `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${title}</h2><p>${desc}</p></div><button type="button" class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></div>${contents}</section></div>`;
}
function studentModal(id) {
  const existing = data.students.find(item => item.id === id);
  if (existing && !isOrganiser() && existing.instituteId !== currentInstitute()?.id) return '';
  const locked = !isOrganiser() && !data.registrationOpen;
  const title = existing ? 'Edit participant' : 'Add participant';
  const checkedEvents = participantEvents(existing || {});
  const content = `<form id="student-form" class="modal-form" data-id="${existing?.id || ''}"><div class="form-grid"><div class="field"><label>Participant ID</label><div class="readonly-field">${existing?.id || nextStudentCode()} · automatic</div></div><div class="field"><label for="student-age">Age</label><input id="student-age" name="age" type="number" min="0" max="99" required value="${existing ? participantAge(existing) ?? '' : ''}" placeholder="Age"></div><div class="field full"><label for="student-name">Name</label><input id="student-name" name="name" required maxlength="100" value="${esc(existing?.name || '')}" placeholder="Full name"></div><div class="field full"><label for="student-weight">Weight (optional)</label><input id="student-weight" name="weight" maxlength="30" value="${esc(existing?.weight || '')}" placeholder="e.g. 41-45 KG"></div><div class="field full"><label>Events</label><div class="event-options"><label><input type="checkbox" name="events" value="INDIVIDUAL" ${checkedEvents.includes('INDIVIDUAL') ? 'checked' : ''}> Individual</label><label><input type="checkbox" name="events" value="FIGHT" ${checkedEvents.includes('FIGHT') ? 'checked' : ''}> Fight</label></div></div></div><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit" ${locked ? 'disabled' : ''}>${existing ? 'Save changes' : 'Confirm'}</button></div></form>`;
  return modalFrame(title, existing ? `${existing.id} · ${isOrganiser() ? 'Organiser edit' : 'Update academy record'}` : 'Register a participant for the district match.', content);
}
function instituteModal(id = null, profileMode = false) {
  const existing = data.institutes.find(item => item.id === id);
  if (profileMode && existing?.id !== currentInstitute()?.id) return '';
  const instituteId = existing?.id || nextId(data.institutes, 'INS', 3);
  const content = `<form id="institute-form" class="modal-form" data-id="${existing?.id || ''}" data-profile="${profileMode}"><div class="form-grid"><div class="field"><label>Institute ID</label><div class="readonly-field">${instituteId}</div></div>${existing ? '' : `<div class="field"><label for="institute-login">Institute login ID</label><input id="institute-login" name="loginId" required maxlength="30" value="${instituteId}"></div>`}<div class="field full"><label for="academy-name">Academy Name</label><input id="academy-name" name="academyName" required maxlength="120" value="${esc(existing?.academyName || '')}" placeholder="Silambam academy name"></div><div class="field"><label for="master-name">Master Name</label><input id="master-name" name="masterName" required maxlength="100" value="${esc(existing?.masterName || '')}" placeholder="Full name"></div><div class="field"><label for="institute-phone">Phone Number</label><input id="institute-phone" name="phone" type="tel" pattern="[0-9]{8,16}" required value="${esc(existing?.phone || '')}" placeholder="Contact number"></div><div class="field full"><label for="institute-email">Email</label><input id="institute-email" name="email" type="email" value="${esc(existing?.email || '')}" placeholder="Email address"></div>${existing ? '' : `<div class="field full"><label for="institute-password">Password</label><input id="institute-password" name="password" type="password" minlength="6" required placeholder="At least 6 characters"></div>`}</div><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Create institute'}</button></div></form>`;
  return modalFrame(existing ? 'Edit academy profile' : 'Create institute account', existing ? 'Update academy contact details.' : 'Add an academy to the event directory.', content, true);
}
function refereeModal(id) {
  const existing = data.referees.find(item => item.id === id);
  if (existing && !isOrganiser() && existing.instituteId !== currentInstitute()?.id) return '';
  const content = `<form id="referee-form" class="modal-form" data-id="${existing?.id || ''}"><div class="form-grid"><div class="field full"><label for="referee-name">Referee name</label><input id="referee-name" name="name" required maxlength="100" value="${esc(existing?.name || '')}" placeholder="Full name"></div><div class="field"><label for="referee-age">Age</label><input id="referee-age" name="age" type="number" min="18" max="100" required value="${existing?.age || ''}" placeholder="Age"></div><div class="field"><label for="referee-phone">Phone number</label><input id="referee-phone" name="phone" type="tel" pattern="[0-9]{8,16}" required value="${esc(existing?.phone || '')}" placeholder="Contact number"></div><div class="field full"><label for="referee-academy">Academy name</label><input id="referee-academy" name="academyName" required maxlength="120" value="${esc(existing?.academyName || currentInstitute()?.academyName || '')}" placeholder="Academy"></div></div><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Add referee'}</button></div></form>`;
  return modalFrame(existing ? 'Edit referee' : 'Add referee', 'Referee contact for the district match.', content);
}
function refereeViewModal(id) {
  const referee = data.referees.find(item => item.id === id);
  if (!referee) return '';
  const content = `<div class="modal-form"><div class="confirm-summary"><span>Name<strong>${esc(referee.name)}</strong></span><span>Age<strong>${referee.age}</strong></span><span>Academy<strong>${esc(referee.academyName)}</strong></span><span>Phone<strong>${esc(referee.phone)}</strong></span></div><div class="modal-actions"><button type="button" class="btn btn-primary" data-action="close-modal">Done</button></div></div>`;
  return modalFrame('Referee details', instituteById(referee.instituteId)?.academyName || 'Event referee', content);
}

function pitchViewModal(number) {
  const pitch = data.pitches.find(item => String(item.number) === String(number));
  if (!pitch) return '';
  const students = pitch.students.map(id => data.students.find(student => student.id === id)).filter(Boolean);
  const rows = students.map(student => `<tr><td>${esc(student.id)}</td><td>${esc(student.name)}</td><td>${participantAge(student) ?? '—'}</td><td>${esc(instituteById(student.instituteId)?.academyName || '—')}</td></tr>`).join('');
  const content = `<div class="modal-form"><div class="table-wrap"><table><thead><tr><th>Participant ID</th><th>Name</th><th>Age</th><th>Academy</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No participants assigned.</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn btn-primary" data-action="close-modal">Done</button></div></div>`;
  return modalFrame(`PITCH ${String(pitch.number).padStart(2, '0')} · ${esc(eventLabel({ events: [pitch.event || pitch.category] }))}`, `${esc(pitch.ageGroup)}${pitch.weightGroup ? ` · ${esc(pitch.weightGroup)}` : ''}`, content, true);
}

function login(role, instituteId = null) {
  authView = 'login';
  session = role === 'ORGANISER' ? { role } : { role, instituteId };
  persistSession();
  activePage = 'dashboard';
  searchText = '';
  categoryFilter = 'ALL';
  instituteFilter = 'ALL';
  ageGroupFilter = 'ALL';
  history.replaceState({ page: 'dashboard' }, '', '#dashboard');
  render();
}
async function logout() { await signOut(supabaseClient); authView = 'login'; session = null; sessionStorage.removeItem(SESSION_KEY); activePage = 'dashboard'; history.replaceState(null, '', location.pathname + location.search); render(); }
function closeModal() { modalState = null; renderModal(); }
function toggleRegistration() {
  data.registrationOpen = !data.registrationOpen;
  persist();
  render();
  toast(`Registration ${data.registrationOpen ? 'reopened' : 'closed'}.`);
}
function generatePitches() {
  const grouped = new Map();
  for (const student of data.students) {
    const group = ageGroup(participantAge(student));
    if (!group) continue;
    for (const event of participantEvents(student)) {
      const weightGroup = data.pitchWeightGrouping ? (student.weight || 'Weight not set') : '';
      const key = `${event}|${group.label}|${weightGroup}`;
      if (!grouped.has(key)) grouped.set(key, { event, category: event, ageGroup: group.label, weightGroup, students: [] });
      grouped.get(key).students.push(student.id);
    }
  }
  data.pitches = [...grouped.values()].sort((a, b) => ({ INDIVIDUAL: 0, FIGHT: 1 }[a.event] ?? 99) - ({ INDIVIDUAL: 0, FIGHT: 1 }[b.event] ?? 99) || data.ageGroups.findIndex(group => group.label === a.ageGroup) - data.ageGroups.findIndex(group => group.label === b.ageGroup) || a.weightGroup.localeCompare(b.weightGroup)).map((pitch, index) => ({ ...pitch, number: index + 1 }));
  persist();
  render();
  toast(`${data.pitches.length} pitch${data.pitches.length === 1 ? '' : 'es'} generated from registered participants.`);
}

function downloadCsv(filename, headers, rows) {
  const content = '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  toast(`${filename} downloaded.`);
}
function exportData(type, instituteId = null) {
  if (type === 'students' || type === 'individual' || type === 'fight') {
    let students = instituteId ? instituteStudents(instituteId) : data.students;
    if (type === 'individual') students = students.filter(student => participantEvents(student).includes('INDIVIDUAL'));
    if (type === 'fight') students = students.filter(student => participantEvents(student).includes('FIGHT'));
    const rows = students.flatMap(student => {
      const owner = instituteById(student.instituteId);
      return participantEvents(student).filter(event => type === 'students' || event === type.toUpperCase()).map(event => [student.id, student.name, participantAge(student), student.weight || '', event, student.instituteId, owner?.academyName, owner?.masterName]);
    });
    downloadCsv(`district-${type === 'students' ? 'participants' : `${type}-participants`}.csv`, ['Participant ID', 'Name', 'Age', 'Weight', 'Event', 'Institute ID', 'Academy', 'Master Name'], rows);
  } else if (type === 'institutes') {
    downloadCsv('district-academies.csv', ['Institute ID', 'Login ID', 'Academy', 'Master', 'Phone', 'Email', 'Participants', 'Referees'], data.institutes.map(item => [item.id, item.loginId, item.academyName, item.masterName, item.phone, item.email || '', instituteStudents(item.id).length, instituteReferees(item.id).length]));
  } else if (type === 'referees') {
    downloadCsv('district-referees.csv', ['Name', 'Age', 'Academy', 'Phone', 'Institute ID'], data.referees.map(item => [item.name, item.age, item.academyName, item.phone, item.instituteId]));
  } else if (type === 'pitches') {
    downloadCsv('district-pitches.csv', ['Pitch', 'Event', 'Age group', 'Weight group', 'Order', 'Participant ID', 'Name', 'Academy'], data.pitches.flatMap(pitch => pitch.students.map((id, index) => { const student = data.students.find(item => item.id === id); return [pitch.number, pitch.event || pitch.category, pitch.ageGroup, pitch.weightGroup || '', index + 1, id, student?.name, instituteById(student?.instituteId)?.academyName]; })));
  } else if (type === 'complete') {
    const rows = [
      ...data.institutes.map(item => ['INSTITUTE', item.id, item.academyName, item.createdAt, 'INSTITUTE', item.id, item.academyName, item.phone]),
      ...data.students.map(item => { const owner = instituteById(item.instituteId); return ['PARTICIPANT', item.id, item.name, participantAge(item), eventLabel(item), item.instituteId, owner?.academyName, item.weight || '']; }),
      ...data.referees.map(item => ['REFEREE', item.id, item.name, item.age, 'REFEREE', item.instituteId, item.academyName, item.phone]),
      ...data.pitches.flatMap(pitch => pitch.students.map((id, index) => { const student = data.students.find(item => item.id === id); return ['PITCH', `PITCH ${String(pitch.number).padStart(2, '0')}`, student?.name, index + 1, `${pitch.event || pitch.category} · ${pitch.ageGroup}`, student?.instituteId, instituteById(student?.instituteId)?.academyName, pitch.weightGroup || '']; }))
    ];
    downloadCsv('district-complete-report.csv', ['Record type', 'ID', 'Name', 'Age or date', 'Event or role', 'Institute ID', 'Academy', 'Contact or weight'], rows);
  }
}

document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    const destination = pageButton.dataset.page;
    if (!NAV_ITEMS.some(item => item.id === destination && item.roles.includes(session?.role)) && !(destination === 'institute-detail' && isOrganiser())) return;
    activePage = destination;
    searchText = '';
    history.pushState({ page: activePage }, '', `#${activePage}`);
    render();
    return;
  }
  const actionButton = event.target.closest('[data-action]');

  

  if (!actionButton) return;
  const action = actionButton.dataset.action;


if (action === 'academy-registration') {
  authView = 'login';
  render();
  return;
}


if (action === 'back-to-registration') {
  authView = 'registration';
  render();
  return;
}

  if (action === 'show-signup') { authView = 'signup'; render(); return; }
  if (action === 'show-login') { authView = 'login'; render(); return; }

  if (action === 'self-registration') {
  window.location.href = 'https://forms.gle/ythS4AWjPrLGaEwt9'; //g-form link
  return;
}



// if (action === 'academy-registration') {
//   console.log('Academy button clicked');
//   authView = 'login';
//   render();
//   return;
// }

  const button = actionButton;
  if (action === 'demo-login') login(button.dataset.role, button.dataset.role === 'INSTITUTE' ? 'INS001' : null);
  else if (action === 'logout') logout();
  else if (action === 'close-modal') closeModal();
  else if (action === 'backdrop-close' && event.target === button) closeModal();
  else if (action === 'mobile-menu') document.querySelector('.mobile-nav .nav-button')?.focus();
  else if (action === 'add-student') { if (!data.registrationOpen) toast('Registration is closed.', true); else { modalState = { type: 'student' }; renderModal(); } }
  else if (action === 'edit-student') { modalState = { type: 'student', id: button.dataset.id }; renderModal(); }
  else if (action === 'delete-student') deleteStudent(button.dataset.id);
  else if (action === 'add-institute') { modalState = { type: 'institute' }; renderModal(); }
  else if (action === 'view-institute') { selectedInstitute = button.dataset.id; activePage = 'institute-detail'; history.pushState({ page: activePage }, '', `#${activePage}`); render(); }
  else if (action === 'edit-institute') { modalState = { type: 'institute-edit', id: button.dataset.id, profileMode: button.dataset.profile === 'true' }; renderModal(); }
  else if (action === 'add-referee') { if (!data.registrationOpen) toast('Registration is closed.', true); else { modalState = { type: 'referee' }; renderModal(); } }
  else if (action === 'edit-referee') { modalState = { type: 'referee', id: button.dataset.id }; renderModal(); }
  else if (action === 'delete-referee') {
  deleteRefereeFromSupabase(supabaseClient, currentInstitute()?.id, button.dataset.id)
    .then(() => {
      data.referees = data.referees.filter(referee => referee.id !== button.dataset.id);
      persist();
      render();
      toast('Referee deleted successfully.');
    })
    .catch(error => {
      console.error('Referee delete failed:', error);
      toast('Could not delete referee. Check console.', true);
    });
}
  else if (action === 'view-referee') { modalState = { type: 'referee-view', id: button.dataset.id }; renderModal(); }
  else if (action === 'view-pitch') { modalState = { type: 'pitch-view', id: button.dataset.id }; renderModal(); }
  else if (action === 'toggle-registration') toggleRegistration();
  else if (action === 'generate-pitches') generatePitches();
  else if (action === 'download') exportData(button.dataset.type);
  else if (action === 'export-institute') exportData('students', button.dataset.id);
  else if (action === 'print-pitches') window.print();
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'login-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    const email = String(form.get('loginId') || '').trim().toLowerCase();
    const password = String(form.get('password') || '');
    const { data: authData, error: authError } = await signInWithPassword(supabaseClient, email, password);
    if (authError) { toast(authError.message || 'Email or password is incorrect.', true); return; }
    const user = authData.user;
    const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('id, role, academy_id').eq('id', user.id).single();
    if (profileError || !profile) { await signOut(supabaseClient); toast('Account profile not found. Contact the organiser.', true); return; }
    if (profile.role === 'organiser') { login('ORGANISER'); return; }
    if (profile.role !== 'academy' || !profile.academy_id) { await signOut(supabaseClient); toast('This account has no academy assigned.', true); return; }
    const { data: academy, error: academyError } = await supabaseClient.from('academies').select('id, academy_code, academy_name, master_name, phone, email').eq('id', profile.academy_id).single();
    if (academyError || !academy) { await signOut(supabaseClient); toast('Academy profile could not be loaded.', true); return; }
    const institute = { id: academy.id, loginId: academy.academy_code || academy.id, academyName: academy.academy_name, masterName: academy.master_name, phone: academy.phone, email: academy.email };
    if (!data.institutes.some(x => x.id === institute.id)) data.institutes.push(institute);
    session = { role: 'INSTITUTE', instituteId: institute.id, institute, userId: user.id };
    
authView = 'login';
activePage = 'participants';
render();
await loadParticipantsFromSupabase();
await loadRefereesFromSupabase();

  } else if (event.target.id === 'academy-signup-form') {
    event.preventDefault();
    const form = event.target;
    const values = validateAcademySignup(form);
    if (!values) return;
    if (!values.email) { toast('Email address is required.', true); return; }
    const { data: signUpData, error } = await signUpAcademy(supabaseClient, values);
    if (error) { const n=form.querySelector('[data-error-for="email"]'); if(n) n.textContent=error.message; toast(error.message, true); return; }
    signupCreatedId = signUpData.user?.id || null;
    authView = 'signup-success'; render();
  } else if (event.target.id === 'student-form') {
    event.preventDefault();
    if (!data.registrationOpen && !isOrganiser()) { toast('Registration is closed.', true); closeModal(); return; }
    const form = new FormData(event.target);
    const events = form.getAll('events').map(String);
    const values = { name: String(form.get('name') || '').trim(), age: Number(form.get('age')), weight: String(form.get('weight') || '').trim(), events, category: events.length === 2 ? 'BOTH' : events[0], instituteId: event.target.dataset.id ? data.students.find(student => student.id === event.target.dataset.id)?.instituteId : currentInstitute()?.id };
    if (!values.name || !Number.isInteger(values.age) || values.age < 0 || values.age > 99 || !events.length || !values.instituteId) { toast('Enter a name and valid age, then select at least one event.', true); return; }

const existing = data.students.find(
  student => student.id === event.target.dataset.id
);

if (existing) {
  const { data: updated, error } = await supabaseClient
    .from('participants')
    .update(participantPayload(values))
    .eq('participant_code', existing.id)
    .eq('academy_id', existing.instituteId)
    .select()
    .single();

  if (error) {
    console.error('Participant update failed:', error);
    toast(`Update failed: ${error.message}`, true);
    return;
  }

  Object.assign(existing, {
    name: updated.name,
    age: updated.age,
    weight: updated.weight ?? '',
    events: values.events,
    category: values.category
  });

  invalidatePitches();
  modalState = null;
  render();
  toast('Participant updated in Supabase.');
  return;
}

const participantCode = nextStudentCode();

const { data: savedParticipant, error } = await supabaseClient
  .from('participants')
  .insert(newParticipantPayload(values, participantCode))
  .select()
  .single();

if (error) {
  console.error('Participant save failed:', error);
  toast(`Supabase save failed: ${error.message}`, true);
  return;
}

data.students.push({
  id: savedParticipant.participant_code,
  dbId: savedParticipant.id,
  instituteId: savedParticipant.academy_id,
  name: savedParticipant.name,
  age: savedParticipant.age,
  weight: savedParticipant.weight ?? '',
  events: values.events,
  category: values.category,
  createdAt: new Date().toISOString().slice(0, 10)
});

data.studentSequence++;
invalidatePitches();
modalState = null;
render();
toast('Participant saved to Supabase successfully.');

  } else if (event.target.id === 'institute-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    const id = event.target.dataset.id;
    const existing = instituteById(id);
    const email = String(form.get('email') || '').trim();
    const duplicateEmail = email && data.institutes.some(item => item.id !== id && item.email?.toLowerCase() === email.toLowerCase());
    if (duplicateEmail) { toast('That email is already in use.', true); return; }
    const values = { academyName: String(form.get('academyName') || '').trim(), masterName: String(form.get('masterName') || '').trim(), phone: String(form.get('phone') || '').trim(), email };
    if (existing) Object.assign(existing, values);
    else {
      const loginId = String(form.get('loginId') || '').trim();
      if (data.institutes.some(item => item.loginId.toLowerCase() === loginId.toLowerCase())) { toast('That login ID is already in use.', true); return; }
      data.institutes.push({ id: nextId(data.institutes, 'INS', 3), loginId, ...values, password: String(form.get('password') || ''), createdAt: new Date().toISOString().slice(0, 10) });
    }
    persist(); modalState = null; render(); toast(existing ? 'Academy profile updated.' : 'Institute created.');
  } else if (event.target.id === 'referee-form') {
  event.preventDefault();

  if (!data.registrationOpen && !isOrganiser()) {
    toast('Registration is closed.', true);
    closeModal();
    return;
  }

  try {
    const form = new FormData(event.target);
    const id = event.target.dataset.id;
    const existing = data.referees.find(item => item.id === id);
    const values = refereeValues(form);
    const academyId = existing?.instituteId || currentInstitute()?.id;

    if (!academyId) {
      throw new Error('Academy ID not found.');
    }

    let saved;

    if (existing) {
      saved = await updateReferee(
        supabaseClient,
        academyId,
        id,
        values
      );

      data.referees = data.referees.map(item =>
        item.id === id ? saved : item
      );
    } else {
      saved = await createReferee(
        supabaseClient,
        academyId,
        values
      );

      data.referees.push(saved);
    }

    modalState = null;
    render();
    toast(existing
      ? 'Referee updated in Supabase.'
      : 'Referee saved to Supabase.');
  } catch (error) {
    console.error('Referee save failed:', error);
    toast(`Supabase save failed: ${error.message}`, true);
  } 
}else if (event.target.id === 'age-groups-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    const limits = data.ageGroups.map((group, index) => Number(form.get(`max-${index}`)));
    for (let index = 0; index < limits.length; index++) {
      if (!Number.isInteger(limits[index]) || limits[index] < data.ageGroups[index].min || limits[index] > 99 || (index > 0 && limits[index] <= limits[index - 1])) { toast('Each maximum age must be greater than the previous band and within 0–99.', true); return; }
    }
    data.ageGroups.forEach((group, index) => { group.max = limits[index]; if (index + 1 < data.ageGroups.length) data.ageGroups[index + 1].min = limits[index] + 1; });
    persist(); render(); toast('Age bands saved. Regenerate pitches to apply the changes.');
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'participant-search') {
    const position = event.target.selectionStart;
    searchText = event.target.value;
    const scrollY = window.scrollY;
    render();
    const replacement = document.querySelector('#participant-search');
    replacement?.focus(); replacement?.setSelectionRange(position, position);
    window.scrollTo(0, scrollY);
  }
});

document.addEventListener('change', event => {
  if (event.target.id === 'category-filter') { categoryFilter = event.target.value; render(); }
  else if (event.target.id === 'age-group-filter') { ageGroupFilter = event.target.value; render(); }
  else if (event.target.id === 'pitch-weight-grouping') { data.pitchWeightGrouping = event.target.checked; invalidatePitches(); persist(); render(); }
  else if (event.target.id === 'institute-filter') {
    instituteFilter = event.target.value;
    render();
  }
});

window.addEventListener('popstate', event => {
  if (!session) { render(); return; }
  const destination = event.state?.page || location.hash.slice(1) || 'dashboard';
  const allowed = NAV_ITEMS.some(item => item.id === destination && item.roles.includes(session.role));
  activePage = allowed || (destination === 'institute-detail' && isOrganiser()) ? destination : 'dashboard';
  render();
});

function invalidatePitches() {
  if (data.pitches.length) data.pitches = [];
}

async function deleteStudent(id) {
  if (!data.registrationOpen && !isOrganiser()) {
    toast('Registration is closed.', true);
    return;
  }

  const student = data.students.find(item => item.id === id);
  if (!student) {
    toast('Participant not found.', true);
    return;
  }

  if (!isOrganiser() && student.instituteId !== currentInstitute()?.id) {
    toast('You cannot delete another academy’s participant.', true);
    return;
  }

  if (!confirm(`Delete ${student.name} (${student.id}) permanently?`)) {
    return;
  }

  try {
    let query = supabaseClient
      .from('participants')
      .delete()
      .eq('participant_code', student.id);

    // Academy accounts may delete only their own participants.
    if (!isOrganiser()) {
      query = query.eq('academy_id', currentInstitute().id);
    }

    const { data: deletedRows, error } = await query
      .select('id');

    if (error) throw error;

    if (!deletedRows || deletedRows.length === 0) {
      throw new Error(
        'No participant was deleted. Check Supabase permissions and the participant ID.'
      );
    }

    data.students = data.students.filter(item => item.id !== id);
    invalidatePitches();
    render();
    toast('Participant deleted from Supabase successfully.');
  } catch (error) {
    console.error('Participant delete failed:', error);
    toast(`Participant delete failed: ${error.message}`, true);
  }
}


async function loadInstitutesFromSupabase() {
  try {
    const { data: rows, error } = await supabaseClient
      .from('academies')
      .select('id, academy_code, academy_name, master_name, phone, email, created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    console.log('Academies returned:', rows?.length, rows);

    data.institutes = (rows || []).map(academy => ({
      id: academy.id,
      loginId: academy.academy_code || academy.id,
      academyName: academy.academy_name || '',
      masterName: academy.master_name || '',
      phone: academy.phone || '',
      email: academy.email || '',
      createdAt: academy.created_at || new Date().toISOString()
    }));

    persist();
  } catch (error) {
    console.error('Load academies failed:', error);
    toast(`Could not load academies: ${error.message}`, true);
  }
}



restoreAuthSession();