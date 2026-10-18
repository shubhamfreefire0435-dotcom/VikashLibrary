
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const tok = () => sessionStorage.getItem('vl_token') || '';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '"': '&quot;', "'": '&#39;'
}[c]));

function toast(t) {
  const e = $('#toast');
  if (!e) return;
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 3200);
}

async function api(url, o = {}) {
  const h = new Headers(o.headers || {});
  h.set('Authorization', 'Bearer ' + tok());

  if (o.body && !(o.body instanceof FormData) &&
      !h.has('Content-Type')) {
    h.set('Content-Type', 'application/json');
  }

  const r = await fetch(url, { ...o, headers: h });
  const d = await r.json().catch(() => ({}));

  if (r.status === 401) {
    sessionStorage.clear();
    location.href = '/login.html';
    throw Error('Please log in again');
  }

  if (!r.ok) throw Error(d.message || 'Request failed');
  return d;
}

function table(rows, cols) {
  return rows.length
    ? `<div class="table-wrap"><table>
        <thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(x => `<tr>${
          cols.map(c => `<td>${c[2] ? c[2](x) : esc(x[c[1]] ?? '—')}</td>`).join('')
        }</tr>`).join('')}</tbody>
      </table></div>`
    : '<div class="hint" style="padding:20px">No records found.</div>';
}

function badge(s) {
  return `<span class="badge ${esc(s)}">${esc(s)}</span>`;
}

function tab(n) {
  $$('.section').forEach(x =>
    x.classList.toggle('active', x.id === 'tab-' + n)
  );
  $$('[data-tab]').forEach(x =>
    x.classList.toggle('active', x.dataset.tab === n)
  );

  if ($('#title')) {
    $('#title').textContent = n[0].toUpperCase() + n.slice(1);
  }

  $('#side')?.classList.remove('open');

  ({
    overview,
    applications: apps,
    students: () => users('student'),
    payments,
    staff,
    seats,
    notices,
    documents: docs,
    settings,
    reports
  }[n] || (() => {}))();
}

async function overview() {
  try {
    const d = (await api('/api/admin/dashboard-stats')).stats;

    $('#sApps').textContent = d.totalApplications;
    $('#sPending').textContent = d.pendingApplications;
    $('#sStudents').textContent = d.totalStudents;
    $('#sSeats').textContent = d.availableSeats;

    const a = (await api('/api/admin/applications')).applications;

    $('#latest').innerHTML = table(a.slice(0, 5), [
      ['Applicant', 'full_name'],
      ['Application ID', 'application_code'],
      ['Phone', 'phone'],
      ['Status', 'status', x => badge(x.status)]
    ]);
  } catch (e) {
    toast(e.message);
  }
}

let allApps = [];

async function apps() {
  try {
    allApps = (await api('/api/admin/applications')).applications;
    renderApps();
  } catch (e) {
    toast(e.message);
  }
}

function renderApps() {
  const q = ($('#appSearch')?.value || '').toLowerCase();
  const f = $('#appFilter')?.value || 'all';

  const rows = allApps.filter(a =>
    [a.full_name, a.phone, a.application_code]
      .join(' ').toLowerCase().includes(q) &&
    (f === 'all' || a.status === f)
  );

  $('#apps').innerHTML = table(rows, [
    ['Applicant', 'full_name'],
    ['Application ID', 'application_code'],
    ['Phone', 'phone'],
    ['Status', 'status', a => badge(a.status)],
    ['Action', 'id', a => `
      <button type="button" class="btn primary"
        data-profile="${a.id}">View Profile</button>
      ${a.status === 'pending' ? `
        <button type="button" class="btn success"
          data-approve="${a.id}">Approve</button>
        <button type="button" class="btn danger"
          data-reject="${a.id}">Reject</button>
      ` : ''}
    `]
  ]);
}

async function action(id, a) {
  if (!confirm(a + ' this application?')) return;

  try {
    const d = await api(`/api/admin/applications/${id}/${a}`, {
      method: 'POST',
      body: '{}'
    });

    toast(d.message);
    await apps();
    overview();
  } catch (e) {
    toast(e.message);
  }
}

/* STUDENT PROFILE */

function profileField(label, value) {
  const field = document.createElement('div');
  field.className = 'profile-field';

  const small = document.createElement('small');
  small.textContent = label;

  const strong = document.createElement('strong');
  strong.textContent =
    value === null || value === undefined || value === ''
      ? '—'
      : String(value);

  field.append(small, strong);
  return field;
}

function profileSection(title, fields) {
  const section = document.createElement('section');
  section.style.marginTop = '20px';

  const heading = document.createElement('h3');
  heading.textContent = title;

  const grid = document.createElement('div');
  grid.className = 'profile-grid';

  fields.forEach(([label, value]) => {
    grid.appendChild(profileField(label, value));
  });

  section.append(heading, grid);
  return section;
}

async function openStudentProfile(id) {
  const modal = $('#profileModal');
  const content = $('#profileContent');

  if (!modal || !content) {
    toast('Profile modal missing. Check admin.html Step 2.');
    return;
  }

  modal.hidden = false;
  content.textContent = 'Loading student profile...';

  try {
    const data = await api(
      `/api/admin/applications/${encodeURIComponent(id)}/profile`
    );

    const a = data.application;
    const s = data.student;
    const seat = data.seat;

    $('#profileTitle').textContent = a.full_name || 'Student Profile';
    $('#profileSubtitle').textContent =
      `${a.application_code || ''} · ${a.status || ''}`;

    content.replaceChildren();

    const hero = document.createElement('div');
    hero.className = 'profile-hero';

    const photo = document.createElement('div');
    photo.className = 'profile-photo';
    photo.style.display = 'flex';
    photo.style.alignItems = 'center';
    photo.style.justifyContent = 'center';
    photo.textContent = a.photo_path ? 'Photo uploaded' : 'No photo';

    const summary = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = a.full_name || 'Student';

    const code = document.createElement('p');
    code.className = 'hint';
    code.textContent = `Application ID: ${a.application_code || '—'}`;

    const status = document.createElement('p');
    status.textContent = `Application status: ${a.status || '—'}`;

    summary.append(name, code, status);
    hero.append(photo, summary);
    content.appendChild(hero);

    content.appendChild(profileSection('Personal Details', [
      ['Date of Birth', a.dob],
      ['Gender', a.gender],
      ['Phone', a.phone],
      ['Email', a.email],
      ['Address', a.address],
      ['Guardian Name', a.guardian_name],
      ['Guardian Phone', a.guardian_phone],
      ['Education', a.education],
      ['School / College', a.school_college],
      ['Occupation', a.occupation],
      ['Emergency Contact', a.emergency_contact],
      ['Membership Plan', a.membership_plan],
      ['Application Status', a.status],
      ['Applied On', a.created_at]
    ]));

    content.appendChild(profileSection('Student Account', [
      ['Account Created', s ? 'Yes' : 'Not found'],
      ['Username / Library ID', s?.username],
      ['Account Status', s?.status],
      ['Student Phone', s?.phone],
      ['Student Email', s?.email],
      ['Seat Number', seat?.seat_number],
      ['Seat Zone', seat?.zone],
      ['Seat Status', seat?.status]
    ]));

    const filesSection = document.createElement('section');
    filesSection.style.marginTop = '20px';

    const filesHeading = document.createElement('h3');
    filesHeading.textContent = 'Uploaded Files';

    const filesInfo = document.createElement('p');
    filesInfo.className = 'hint';

    const hasPhoto = Boolean(a.photo_path);
    const hasDocument = Boolean(a.document_path);

    filesInfo.textContent =
      hasPhoto || hasDocument
        ? 'Uploaded file record found. Secure file preview/download needs a protected backend route.'
        : 'No uploaded photo or document is recorded for this application.';

    filesSection.append(filesHeading, filesInfo);
    content.appendChild(filesSection);

  } catch (e) {
    content.replaceChildren();

    const error = document.createElement('div');
    error.className = 'profile-error';
    error.textContent = e.message || 'Unable to load student profile.';

    content.appendChild(error);
  }
}

/* STUDENT AND STAFF ACCOUNTS */


async function users(role) {
  try {
    const [userData, appData] = await Promise.all([
      api('/api/admin/users?role=' + encodeURIComponent(role)),
      role === 'student'
        ? api('/api/admin/applications')
        : Promise.resolve({ applications: [] })
    ]);

    const rows = userData.users;
    const applications = appData.applications;

    $('#students').innerHTML = table(rows, [
      ['Name', 'full_name'],
      ['Username', 'username'],
      ['Phone', 'phone'],
      ['Status', 'status', u => badge(u.status)],
      ['Action', 'id', u => {
        const application = applications.find(
          a => a.application_code === u.username
        );

        return `
          ${application ? `
            <button type="button"
              class="btn primary"
              data-profile="${application.id}">
              View Profile
            </button>
          ` : ''}
          <button type="button"
            class="btn"
            data-user="${u.id}"
            data-status="${u.status}">
            ${u.status === 'active' ? 'Disable' : 'Enable'}
          </button>
        `;
      }]
    ]);
  } catch (e) {
    toast(e.message);
  }
}


async function staff() {
  try {
    const a = (await api('/api/admin/users?role=staff')).users;
    const b = (await api('/api/admin/users?role=editor')).users;

    $('#staff').innerHTML = table([...a, ...b], [
      ['Name', 'full_name'],
      ['Username', 'username'],
      ['Role', 'role'],
      ['Status', 'status', u => badge(u.status)],
      ['Action', 'id', u => `
        <button class="btn" data-user="${u.id}"
          data-status="${u.status}">
          ${u.status === 'active' ? 'Disable' : 'Enable'}
        </button>
      `]
    ]);
  } catch (e) {
    toast(e.message);
  }
}

async function seats() {
  try {
    const a = (await api('/api/admin/seats')).seats;

    $('#seatSummary').textContent =
      `${a.length} seats · ${a.filter(s => s.status === 'available').length} available`;

    $('#seats').innerHTML = a.map(s => `
      <button class="seat ${esc(s.status)}"
        data-seat="${s.id}" data-status="${esc(s.status)}">
        ${esc(s.seat_number)}<br>${esc(s.status)}
      </button>
    `).join('');
  } catch (e) {
    toast(e.message);
  }
}

async function notices() {
  try {
    const a = (await api('/api/admin/notices')).notices;

    $('#notices').innerHTML = table(a, [
      ['Notice', 'title', n =>
        `<strong>${esc(n.title)}</strong><br>${esc((n.body || '').slice(0, 100))}`],
      ['Audience', 'audience'],
      ['Status', 'is_published', n => badge(n.is_published ? 'published' : 'draft')],
      ['Actions', 'id', n => `
        <button class="btn" data-pub="${n.id}"
          data-state="${n.is_published}">
          ${n.is_published ? 'Unpublish' : 'Publish'}
        </button>
        <button class="btn danger" data-del="${n.id}">Delete</button>
      `]
    ]);
  } catch (e) {
    toast(e.message);
  }
}

async function docs() {
  try {
    const a = (await api('/api/admin/documents')).documents;

    $('#docs').innerHTML = table(a, [
      ['Title', 'title'],
      ['Category', 'category'],
      ['File', 'original_name'],
      ['Download', 'id', d =>
        `<a href="/api/admin/documents/${d.id}/download"
          data-download="${d.id}">Download</a>`]
    ]);
  } catch (e) {
    toast(e.message);
  }
}

async function settings() {
  try {
    const s = (await api('/api/public/settings')).settings;

    for (const [k, v] of Object.entries(s)) {
      const e = $('#settingsForm').elements.namedItem(k);
      if (e) e.value = v;
    }
  } catch (e) {
    toast(e.message);
  }
}

async function payments() {
  try {
    const [data, studentData] = await Promise.all([
      api('/api/admin/payments'),
      api('/api/admin/users?role=student')
    ]);

    $('#paymentCollected').textContent =
      '₹' + Number(data.summary.collected).toLocaleString('en-IN');
    $('#paymentPending').textContent =
      '₹' + Number(data.summary.pending).toLocaleString('en-IN');
    $('#paymentCount').textContent = data.summary.total;

    const select = $('#paymentStudent');
    const previous = select.value;

    select.replaceChildren();

    studentData.users.forEach(student => {
      const option = document.createElement('option');
      option.value = student.id;
      option.textContent = `${student.full_name} (${student.username})`;
      select.appendChild(option);
    });

    if (previous) select.value = previous;

    $('#payments').innerHTML = table(data.payments, [
      ['Student', 'full_name'],
      ['Library ID', 'username'],
      ['Amount', 'amount', p => '₹' + Number(p.amount).toLocaleString('en-IN')],
      ['Date', 'payment_date'],
      ['Method', 'payment_method'],
      ['Reference', 'reference'],
      ['Status', 'status', p => badge(p.status)]
    ]);
  } catch (e) {
    toast(e.message);
  }
}

$('#refreshPayments').onclick = payments;

$('#paymentForm').onsubmit = async e => {
  e.preventDefault();

  try {
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));

    const result = await api('/api/admin/payments', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    $('#paymentMsg').textContent = result.message;
    $('#paymentMsg').className = 'message show';
    form.reset();
    payments();
  } catch (error) {
    $('#paymentMsg').textContent = error.message;
    $('#paymentMsg').className = 'message show error';
  }
};

async function reports() {
  try {
    const s = (await api('/api/admin/reports/summary')).summary;

    $('#reports').innerHTML = table(
      Object.entries(s).map(([key, value]) => ({ key, value })),
      [['Metric', 'key'], ['Value', 'value']]
    );
  } catch (e) {
    toast(e.message);
  }
}

async function postForm(f, url) {
  return api(url, { method: 'POST', body: new FormData(f) });
}

$('#nav').onclick = e => {
  const b = e.target.closest('[data-tab]');
  if (b) tab(b.dataset.tab);
};

$('#menu').onclick = () => $('#side').classList.toggle('open');

$('#logout').onclick = () => {
  sessionStorage.clear();
  location.href = '/login.html';
};

$('#refreshApps').onclick = apps;
$('#appSearch').oninput = renderApps;
$('#appFilter').onchange = renderApps;
$('#refreshStudents').onclick = () => users('student');
$('#refreshStaff').onclick = staff;
$('#refreshSeats').onclick = seats;
$('#refreshNotices').onclick = notices;
$('#refreshDocs').onclick = docs;
$('#refreshReports').onclick = reports;

function create(role) {
  const username = prompt('New username / library ID');
  if (!username) return;

  const full_name = prompt('Full name');
  if (!full_name) return;

  const password = prompt('Password (12+ characters)');
  if (!password) return;

  api('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, full_name, password, role })
  }).then(d => {
    toast(d.message);
    role === 'student' ? users(role) : staff();
  }).catch(e => toast(e.message));
}

$('#newStudent').onclick = () => create('student');

$('#newStaff').onclick = () => {
  const r = prompt('Role: staff or editor', 'staff');
  if (['staff', 'editor'].includes(r)) create(r);
};

$('#noticeForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const d = await postForm(e.target, '/api/admin/notices');
    $('#noticeMsg').textContent = d.message;
    $('#noticeMsg').className = 'message show';
    e.target.reset();
    notices();
  } catch (x) {
    $('#noticeMsg').textContent = x.message;
    $('#noticeMsg').className = 'message show error';
  }
};

$('#docForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const d = await postForm(e.target, '/api/admin/documents');
    $('#docMsg').textContent = d.message;
    $('#docMsg').className = 'message show';
    e.target.reset();
    docs();
  } catch (x) {
    $('#docMsg').textContent = x.message;
    $('#docMsg').className = 'message show error';
  }
};

$('#settingsForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const d = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        settings: Object.fromEntries(new FormData(e.target))
      })
    });

    $('#settingsMsg').textContent = d.message;
    $('#settingsMsg').className = 'message show';
    toast(d.message);
  } catch (x) {
    $('#settingsMsg').textContent = x.message;
    $('#settingsMsg').className = 'message show error';
  }
};

$('#logoForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const d = await postForm(e.target, '/api/admin/logo');
    $('#logoMsg').textContent = d.message;
    $('#logoMsg').className = 'message show';
  } catch (x) {
    $('#logoMsg').textContent = x.message;
    $('#logoMsg').className = 'message show error';
  }
};

$('#deleteLogo').onclick = async () => {
  if (!confirm('Delete logo?')) return;

  try {
    const d = await api('/api/admin/logo', { method: 'DELETE' });
    $('#logoMsg').textContent = d.message;
    $('#logoMsg').className = 'message show';
  } catch (x) {
    toast(x.message);
  }
};

/* ONE CLICK HANDLER FOR ALL DYNAMIC BUTTONS */

document.addEventListener('click', e => {
  const profile = e.target.closest('[data-profile]');
  if (profile) {
    openStudentProfile(profile.dataset.profile);
    return;
  }

  const close = e.target.closest('#closeProfile');
  if (close) {
    $('#profileModal').hidden = true;
    return;
  }

  const a = e.target.closest('[data-approve]');
  if (a) return action(a.dataset.approve, 'approve');

  const r = e.target.closest('[data-reject]');
  if (r) return action(r.dataset.reject, 'reject');

  const u = e.target.closest('[data-user]');
  if (u) {
    const s = u.dataset.status === 'active' ? 'inactive' : 'active';

    api(`/api/admin/users/${u.dataset.user}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: s })
    }).then(d => {
      toast(d.message);
      users('student');
      staff();
    }).catch(x => toast(x.message));
    return;
  }

  const seat = e.target.closest('[data-seat]');
  if (seat) {
    const s = seat.dataset.status;
    const next = s === 'available'
      ? 'occupied'
      : s === 'occupied' ? 'maintenance' : 'available';

    api(`/api/admin/seats/${seat.dataset.seat}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next })
    }).then(seats).catch(x => toast(x.message));
    return;
  }

  const p = e.target.closest('[data-pub]');
  if (p) {
    api(`/api/admin/notices/${p.dataset.pub}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_published: p.dataset.state === '1' ? 'false' : 'true'
      })
    }).then(notices).catch(x => toast(x.message));
    return;
  }

  const d = e.target.closest('[data-del]');
  if (d && confirm('Delete this notice?')) {
    api(`/api/admin/notices/${d.dataset.del}`, {
      method: 'DELETE'
    }).then(notices).catch(x => toast(x.message));
  }
});

$('#profileModal')?.addEventListener('click', e => {
  if (e.target.id === 'profileModal') {
    $('#profileModal').hidden = true;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#profileModal')) {
    $('#profileModal').hidden = true;
  }
});


async function init() {
  if (!tok()) {
    location.href = '/login.html';
    return;
  }

  try {
    const d = await api('/api/auth/me');
    const role = d.user.role;

    if (!['admin', 'editor', 'staff'].includes(role)) {
      location.href = '/student.html';
      return;
    }

    $('#who').textContent = d.user.full_name || d.user.username;

    if (role === 'staff') {
      $$('[data-tab]').forEach(button => {
        if (!['seats', 'documents'].includes(button.dataset.tab)) {
          button.classList.add('hidden');
        }
      });

      tab('documents');
      return;
    }

    if (role === 'editor') {
      $$('[data-tab]').forEach(button => {
        if (!['overview', 'notices', 'settings'].includes(button.dataset.tab)) {
          button.classList.add('hidden');
        }
      });
    }

    tab('overview');
  } catch (e) {
    toast(e.message);
  }
}

init();

