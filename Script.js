const SUPABASE_URL = "https://oiikkvxxfezsexpaijvp.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_SugIxdhqMOrjDgXw8-mChA_2D1aM2fU";
let supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let rawClientsList = [];
let rawAppsList = [];
let rawConsolesList = [];

const modal = document.getElementById('add-modal');
document.getElementById('open-modal-btn').onclick = () => { loadDropdowns(); modal.classList.remove('hidden'); };
document.getElementById('close-modal-btn').onclick = () => modal.classList.add('hidden');
document.getElementById('cancel-modal-btn').onclick = () => modal.classList.add('hidden');

function switchTab(tabId) {
  localStorage.setItem('activeTab', tabId);
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('border-indigo-500', 'text-indigo-400');
    b.classList.add('border-transparent', 'text-slate-400');
  });
  document.getElementById(tabId).classList.remove('hidden');
  document.getElementById('btn-' + tabId).classList.add('border-indigo-500', 'text-indigo-400');

  if (tabId === 'apps-tab') fetchApps();
  if (tabId === 'manage-apps-tab') fetchAppsManagement();
  if (tabId === 'consoles-tab') fetchConsoles();
  if (tabId === 'clients-tab') fetchClients();
}

function toggleCustomNationality() {
  const select = document.getElementById('c-nationality-select');
  const customInput = document.getElementById('c-nationality-custom');
  if (select.value === 'أخرى') {
    customInput.classList.remove('hidden');
  } else {
    customInput.classList.add('hidden');
  }
}

// 1. الصفحة الرئيسية
async function fetchApps() {
  if (!supabaseClient) return;

  const { data: apps, error } = await supabaseClient.from('apps').select('*').order('created_at', { ascending: false });
  
  if (error) {
    console.error("خطأ جلب البيانات:", error);
    return;
  }

  const tableBody = document.getElementById('apps-table-body');
  tableBody.innerHTML = '';

  let totalRent = 0;
  let pendingRent = 0;

  apps.forEach(app => {
    totalRent += Number(app.monthly_rent || 0);
    if (app.rent_status !== 'paid') pendingRent += Number(app.monthly_rent || 0);

    const row = document.createElement('tr');
    row.className = 'hover:bg-slate-800/30 transition';
    row.innerHTML = `
      <td class="p-4 font-semibold text-slate-100">${app.app_name}</td>
      <td class="p-4 text-slate-400">${app.console_account}</td>
      <td class="p-4 text-slate-300">${app.client_name}</td>
      <td class="p-4"><span class="px-2 py-1 bg-slate-800 text-indigo-400 rounded-lg text-xs">${app.partner_owner}</span></td>
      <td class="p-4">$${app.setup_fee}</td>
      <td class="p-4">$${app.monthly_rent} <span class="text-xs text-slate-500">/${getRentCycleText(app.rent_cycle)}</span></td>
      <td class="p-4">${app.next_due_date || '-'}</td>
      <td class="p-4">
        <button onclick="togglePaymentStatus(${app.id}, '${app.rent_status}')" class="px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer ${getStatusStyle(app.rent_status)}">
          ${getStatusText(app.rent_status)}
        </button>
      </td>
      <td class="p-4">
        <button onclick="deleteApp(${app.id})" class="text-rose-400 hover:text-rose-300 text-xs cursor-pointer">حذف</button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  document.getElementById('stat-total-rent').textContent = `$${totalRent}`;
  document.getElementById('stat-total-apps').textContent = apps.length;
  document.getElementById('stat-pending-rent').textContent = `$${pendingRent}`;
}

// زر السداد: تعليم السجل القديم كـ "تم الدفع" وإنشاء سجل جديد للدورة القادمة فقط إذا كانت الدورية (شهري / أسبوعي)
async function handlePaymentClick(appId) {
  const app = rawAppsList.find(a => a.id === appId);
  if (!app) return;

  if (app.rent_status !== 'paid') {
    // 1. تحديث السجل الحسابي الحالي كـ "تم الدفع"
    await supabaseClient.from('apps').update({ rent_status: 'paid' }).eq('id', appId);

    const currentAppStatus = app.app_status || 'active';
    const rentCycle = app.rent_cycle;

    // 2. إنشاء سجل دورة جديدة فقط إذا كان التطبيق نشطاً وبنظام إيجار دوي (شهري أو أسبوعي)
    // وفي حالة "رفع مستمر" أو "رفع ونقل" لن يتم إنشاء أي سجل جديد إطلاقاً
    if (currentAppStatus === 'active' && (rentCycle === 'monthly' || rentCycle === 'weekly')) {
      const currentDueDate = new Date(app.next_due_date || new Date());
      let nextDueDate = new Date(currentDueDate);

      if (rentCycle === 'weekly') {
        nextDueDate.setDate(nextDueDate.getDate() + 7);
      } else if (rentCycle === 'monthly') {
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      }

      const formattedNextDate = nextDueDate.toISOString().split('T')[0];

      // إنشاء السجل الجديد للدورة القادمة
      const newCycleApp = {
        app_name: app.app_name,
        console_account: app.console_account,
        client_name: app.client_name,
        partner_owner: app.partner_owner,
        setup_fee: 0, // رسوم الرفع تدفع مرة واحدة فقط
        monthly_rent: app.monthly_rent,
        rent_cycle: app.rent_cycle,
        next_due_date: formattedNextDate,
        rent_status: 'pending',
        app_status: 'active'
      };

      const { error } = await supabaseClient.from('apps').insert([newCycleApp]);
      if (error) {
        console.error("خطأ أثناء إنشاء سجل الدورة القادمة:", error.message);
      }
    }

  } else {
    // إرجاع الحالة إلى معلق في حال الضغط بالخطأ على "تم الدفع"
    await supabaseClient.from('apps').update({ rent_status: 'pending' }).eq('id', appId);
  }

  fetchApps();
}

// 2. إدارة التطبيقات
async function fetchAppsManagement() {
  const { data: apps } = await supabaseClient.from('apps').select('*').order('created_at', { ascending: false });
  rawAppsList = apps || [];
  const body = document.getElementById('manage-apps-table-body');
  body.innerHTML = '';

  const filterValue = document.getElementById('app-filter-status').value;

  const uniqueAppsMap = new Map();
  rawAppsList.forEach(app => {
    if (!uniqueAppsMap.has(app.app_name) || app.rent_status === 'pending') {
      uniqueAppsMap.set(app.app_name, app);
    }
  });

  let filteredApps = Array.from(uniqueAppsMap.values());

  if (filterValue !== 'all') {
    filteredApps = filteredApps.filter(app => (app.app_status || 'active') === filterValue);
  }

  if (filteredApps.length === 0) {
    body.innerHTML = `<tr><td colspan="9" class="text-center p-8 text-slate-500">لا توجد تطبيقات مطابقة لهذا التصنيف</td></tr>`;
    return;
  }

  filteredApps.forEach(app => {
    body.innerHTML += `
      <tr class="hover:bg-slate-800/30 transition">
        <td class="p-4 font-semibold text-slate-100">${app.app_name}</td>
        <td class="p-4">${getAppBadgeStyle(app.app_status || 'active')}</td>
        <td class="p-4 text-slate-400">${app.console_account}</td>
        <td class="p-4 text-slate-300">${app.client_name}</td>
        <td class="p-4"><span class="px-2 py-1 bg-slate-800 text-indigo-400 rounded-lg text-xs">${app.partner_owner || 'Maldino'}</span></td>
        <td class="p-4 text-xs">${app.rent_cycle === 'monthly' ? 'شهري' : 'أسبوعي'}</td>
        <td class="p-4">$${app.monthly_rent}</td>
        <td class="p-4">${app.next_due_date || '-'}</td>
        <td class="p-4 space-x-2 space-x-reverse">
          <button onclick="openEditAppModal(${app.id})" class="text-amber-400 hover:underline text-xs">تعديل</button>
          <button onclick="deleteApp(${app.id})" class="text-rose-400 hover:underline text-xs">حذف</button>
        </td>
      </tr>`;
  });
}

function openEditAppModal(id) {
  const app = rawAppsList.find(a => a.id === id);
  if (!app) return;
  document.getElementById('edit-app-id').value = app.id;
  document.getElementById('edit-app-original-name').value = app.app_name;
  document.getElementById('edit-app-name').value = app.app_name || '';
  document.getElementById('edit-app-status').value = app.app_status || 'active';
  document.getElementById('edit-app-setup').value = app.setup_fee || 0;
  document.getElementById('edit-app-rent').value = app.monthly_rent || 0;
  document.getElementById('edit-app-cycle').value = app.rent_cycle || 'weekly';
  document.getElementById('edit-app-date').value = app.next_due_date || '';
  document.getElementById('edit-app-modal').classList.remove('hidden');
}

function closeEditAppModal() { document.getElementById('edit-app-modal').classList.add('hidden'); }

async function saveAppEdit() {
  const id = document.getElementById('edit-app-id').value;
  const appName = document.getElementById('edit-app-original-name').value;
  const newStatus = document.getElementById('edit-app-status').value;

  const updates = {
    app_name: document.getElementById('edit-app-name').value,
    app_status: newStatus,
    setup_fee: Number(document.getElementById('edit-app-setup').value),
    monthly_rent: Number(document.getElementById('edit-app-rent').value),
    rent_cycle: document.getElementById('edit-app-cycle').value,
    next_due_date: document.getElementById('edit-app-date').value
  };

  await supabaseClient.from('apps').update(updates).eq('app_name', appName);

  if (newStatus === 'transferred' || newStatus === 'banned') {
    await supabaseClient.from('apps').delete().eq('app_name', appName).eq('rent_status', 'pending');
  }

  closeEditAppModal();
  fetchAppsManagement();
}

// 3. إدارة الحسابات (الكونسول)
async function fetchConsoles() {
  const { data: consoles } = await supabaseClient.from('consoles').select('*').order('created_at', { ascending: false });
  rawConsolesList = consoles || [];
  
  const body = document.getElementById('consoles-table-body');
  body.innerHTML = '';

  consoles?.forEach(c => {
    const accStatus = c.account_status || c.status || 'active';
    const isActive = accStatus === 'active';
    
    const consoleApps = rawAppsList.filter(a => a.console_account === c.name && a.rent_status !== 'paid' && (a.app_status || 'active') === 'active');
    const appCount = consoleApps.length;
    const totalIncome = consoleApps.reduce((sum, a) => sum + Number(a.monthly_rent || 0), 0);

    const linkHtml = c.console_url 
      ? `<a href="${c.console_url}" target="_blank" class="text-indigo-400 hover:underline text-xs block truncate max-w-[150px]">🔗 فتح الرابط</a>` 
      : '<span class="text-slate-600 text-xs">بدون رابط</span>';

    body.innerHTML += `
      <tr class="hover:bg-slate-800/30">
        <td class="p-4">
          <div class="font-bold text-slate-100">${c.name}</div>
          ${linkHtml}
        </td>
        <td class="p-4 text-xs space-y-1">
          <div class="text-slate-300">📧 ${c.email || '-'}</div>
          <div class="text-slate-400">🔑 ${c.password || '-'}</div>
        </td>
        <td class="p-4"><span class="px-2 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs">${c.nationality || 'مصري'}</span></td>
        <td class="p-4 text-xs">
          <div class="text-emerald-400 font-semibold">الدخل: $${totalIncome}/شهر</div>
          <div class="text-slate-400">عدد التطبيقات النشطة: ${appCount}</div>
        </td>
        <td class="p-4 max-w-xs break-words whitespace-normal text-slate-400 text-xs leading-relaxed">${c.notes || '-'}</td>
        <td class="p-4">
          <button onclick="toggleConsoleStatus(${c.id}, '${accStatus}')" class="px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
            ${isActive ? 'نشط 🟢' : 'محظور 🔴'}
          </button>
        </td>
        <td class="p-4 space-x-2 space-x-reverse">
          <button onclick="openEditConsoleModal(${c.id})" class="text-amber-400 hover:underline text-xs">تعديل</button>
          <button onclick="deleteConsole(${c.id})" class="text-rose-400 hover:underline text-xs">حذف</button>
        </td>
      </tr>`;
  });
}

async function addConsoleFromTab() {
  const name = document.getElementById('c-name').value.trim();
  const url = document.getElementById('c-url').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const password = document.getElementById('c-password').value.trim();
  const account_status = document.getElementById('c-account-status').value;
  const notes = document.getElementById('c-notes').value.trim();

  const selectNat = document.getElementById('c-nationality-select').value;
  const customNat = document.getElementById('c-nationality-custom').value.trim();
  const nationality = selectNat === 'أخرى' ? customNat : selectNat;

  const missingFields = [];
  if (!name) missingFields.push("اسم الحساب");
  if (!url) missingFields.push("رابط الحساب");
  if (!email) missingFields.push("البريد الإلكتروني");
  if (!password) missingFields.push("كلمة المرور");
  if (selectNat === 'أخرى' && !customNat) missingFields.push("تحديد الجنسية");

  if (missingFields.length > 0) {
    alert("⚠️ يرجى إكمال الخانات التالية المتبقية قبل الإضافة:\n- " + missingFields.join("\n- "));
    return;
  }

  const { error } = await supabaseClient.from('consoles').insert([{
    name, 
    console_url: url, 
    email, 
    password, 
    nationality, 
    account_status,
    status: account_status,
    notes
  }]);

  if (!error) {
    alert("تمت إضافة الحساب بنجاح!");
    document.getElementById('c-name').value = '';
    document.getElementById('c-url').value = '';
    document.getElementById('c-email').value = '';
    document.getElementById('c-password').value = '';
    document.getElementById('c-nationality-custom').value = '';
    document.getElementById('c-notes').value = '';
    fetchConsoles();
  } else {
    alert("حدث خطأ أثناء إضافة الحساب: " + error.message);
  }
}

function openEditConsoleModal(id) {
  const consoleObj = rawConsolesList.find(c => c.id === id);
  if (!consoleObj) return;
  document.getElementById('edit-c-id').value = consoleObj.id;
  document.getElementById('edit-c-name').value = consoleObj.name || '';
  document.getElementById('edit-c-url').value = consoleObj.console_url || '';
  document.getElementById('edit-c-email').value = consoleObj.email || '';
  document.getElementById('edit-c-password').value = consoleObj.password || '';
  document.getElementById('edit-c-nationality').value = consoleObj.nationality || '';
  document.getElementById('edit-c-status').value = consoleObj.account_status || consoleObj.status || 'active';
  document.getElementById('edit-c-notes').value = consoleObj.notes || '';
  document.getElementById('edit-console-modal').classList.remove('hidden');
}

function closeEditConsoleModal() { document.getElementById('edit-console-modal').classList.add('hidden'); }

async function saveConsoleEdit() {
  const id = document.getElementById('edit-c-id').value;
  const statusVal = document.getElementById('edit-c-status').value;
  const updates = {
    name: document.getElementById('edit-c-name').value,
    console_url: document.getElementById('edit-c-url').value,
    email: document.getElementById('edit-c-email').value,
    password: document.getElementById('edit-c-password').value,
    nationality: document.getElementById('edit-c-nationality').value,
    account_status: statusVal,
    status: statusVal,
    notes: document.getElementById('edit-c-notes').value
  };
  await supabaseClient.from('consoles').update(updates).eq('id', id);
  closeEditConsoleModal();
  fetchConsoles();
}

async function toggleConsoleStatus(id, currentStatus) {
  const next = currentStatus === 'active' ? 'banned' : 'active';
  await supabaseClient.from('consoles').update({ account_status: next, status: next }).eq('id', id);
  fetchConsoles();
}

async function deleteConsole(id) {
  if (confirm("هل أنت متأكد من حذف هذا الحساب؟")) {
    await supabaseClient.from('consoles').delete().eq('id', id);
    fetchConsoles();
  }
}

// 4. إدارة العملاء
async function fetchClients() {
  const { data: clients } = await supabaseClient.from('clients').select('*').order('created_at', { ascending: false });
  const { data: apps } = await supabaseClient.from('apps').select('*');
  
  rawClientsList = clients || [];
  const body = document.getElementById('clients-table-body');
  body.innerHTML = '';

  clients?.forEach(c => {
    const clientApps = apps ? apps.filter(a => a.client_name === c.name) : [];
    const uniqueAppNames = [...new Set(clientApps.map(a => a.app_name))];

    const appsHtml = uniqueAppNames.length > 0 
      ? uniqueAppNames.map(appName => `<span class="inline-block bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded text-[11px] ml-1 mb-1">${appName}</span>`).join('')
      : '<span class="text-slate-600 text-xs">لا توجد تطبيقات مسجلة</span>';

    body.innerHTML += `
      <tr class="hover:bg-slate-800/30">
        <td class="p-4 font-semibold text-slate-100">${c.name}</td>
        <td class="p-4"><span class="px-2 py-1 bg-slate-800 text-indigo-400 rounded-lg text-xs">${c.default_partner || 'Maldino'}</span></td>
        <td class="p-4 max-w-xs">${appsHtml}</td>
        <td class="p-4 max-w-xs break-words whitespace-normal text-slate-400 text-xs leading-relaxed">${c.notes || '-'}</td>
        <td class="p-4 space-x-2 space-x-reverse">
          <button onclick="openEditClientModal(${c.id})" class="text-amber-400 hover:underline text-xs">تعديل</button>
          <button onclick="deleteClient(${c.id})" class="text-rose-400 hover:underline text-xs">حذف</button>
        </td>
      </tr>`;
  });
}

async function addClientFromTab() {
  const name = document.getElementById('new-client-name').value.trim();
  const partner = document.getElementById('new-client-partner').value;
  const notes = document.getElementById('new-client-notes').value.trim();
  if (!name) {
    alert("⚠️ يرجى كتابة اسم العميل على الأقل قبل الإضافة.");
    return;
  }

  const { error } = await supabaseClient.from('clients').insert([{ name, default_partner: partner, notes }]);
  if (!error) {
    alert("تمت الإضافة بنجاح!");
    document.getElementById('new-client-name').value = '';
    document.getElementById('new-client-notes').value = '';
    fetchClients();
  }
}

function openEditClientModal(id) {
  const clientObj = rawClientsList.find(c => c.id === id);
  if (!clientObj) return;
  document.getElementById('edit-cl-id').value = clientObj.id;
  document.getElementById('edit-cl-name').value = clientObj.name || '';
  document.getElementById('edit-cl-partner').value = clientObj.default_partner || 'Maldino';
  document.getElementById('edit-cl-notes').value = clientObj.notes || '';
  document.getElementById('edit-client-modal').classList.remove('hidden');
}

function closeEditClientModal() { document.getElementById('edit-client-modal').classList.add('hidden'); }

async function saveClientEdit() {
  const id = document.getElementById('edit-cl-id').value;
  const updates = {
    name: document.getElementById('edit-cl-name').value,
    default_partner: document.getElementById('edit-cl-partner').value,
    notes: document.getElementById('edit-cl-notes').value
  };
  await supabaseClient.from('clients').update(updates).eq('id', id);
  closeEditClientModal();
  fetchClients();
}

async function deleteClient(id) {
  if (confirm("هل أنت متأكد من حذف العميل؟")) {
    await supabaseClient.from('clients').delete().eq('id', id);
    fetchClients();
  }
}

// 5. قسم الأدوات (توليد سياسة الخصوصية)
function generatePrivacyPolicy() {
  const appName = document.getElementById('pp-app-name').value.trim() || '[AppName]';
  const companyName = document.getElementById('pp-company-name').value.trim() || '[CompanyName]';
  const email = document.getElementById('pp-email').value.trim() || '[Email]';
  
  const todayDate = new Date().toISOString().split('T')[0];

  const template = `Privacy Policy
This privacy policy applies to the ${appName} app for mobile devices, together with any related services operated by ${companyName} (collectively, the "Application"). ${companyName} is hereby referred to as the "Service Provider".

Information Collection and Use
The Application collects information when you download and use it. This information may include information such as
Your device's Internet Protocol address
The pages of the Application that you visit, the time and date of your visit, the time spent on those pages
The time spent on the Application
your mobile operating system you use

Cookies and tracking technologies
The Application or its third-party SDKs may use cookies, SDKs, pixels, and similar technologies to support functionality, analytics, or service delivery. Where required by applicable law, the Service Provider will obtain consent before using non-essential tracking technologies.

Your Rights
You may request access to, correction of, or deletion of your personal data held by the Service Provider. To exercise these rights, or to withdraw consent where processing is based on consent, contact the Service Provider at ${email}.

Your California privacy rights (CCPA/CPRA)
If you are a California resident, you have the right to know what personal information is collected, the right to delete personal information, the right to opt out of the sale or sharing of personal information, and the right to non-discrimination for exercising these rights. To exercise your CCPA/CPRA rights, contact the Service Provider at ${email}.
The Service Provider may use the information you provide to send important information, required notices, and, where permitted by law, marketing communications.

For a better experience while using the Application, the Service Provider may require you to provide certain personally identifiable information. The information the Service Provider requests will be retained and used as described in this privacy policy.

Third Party Access
Only aggregated, anonymized data is periodically transmitted to external services to aid the Service Provider in improving the Application and their service. The Service Provider may share your information with third parties in the ways that are described in this privacy statement.

International Data Transfers
The Service Provider or its third-party service providers may transfer personal data to countries outside your country of residence, including outside the European Economic Area (EEA). Where applicable law requires safeguards for international transfers, the Service Provider will use appropriate mechanisms.
Standard Contractual Clauses (SCCs) approved by the European Commission
Adequacy decisions or other legally recognized transfer mechanisms
Your consent, where required and legally permitted
Data protection laws in other countries may differ from those in your jurisdiction. Where required by law, the Service Provider will apply appropriate safeguards and obtain any consent required for the transfer.

The Service Provider may disclose User Provided and Automatically Collected Information:
as required by law, such as to comply with a subpoena, or similar legal process;
when they believe in good faith that disclosure is necessary to protect their rights, protect your safety or the safety of others, investigate fraud, or respond to a government request;
with their trusted services providers who work on their behalf, do not have an independent use of the information the Service Provider discloses to them, and have agreed to adhere to the rules set forth in this privacy statement.

Opt-Out Rights
You can stop further collection of information from your mobile device by uninstalling the Application. Uninstalling will stop the Application from collecting data from your device, but it does not automatically delete information that has already been transmitted to the Service Provider or to third parties.
To request deletion of your personal data, to withdraw consent, or to exercise any of your rights, contact the Service Provider at ${email}.

Data Retention Policy
The Service Provider retains personal data based on its necessity for the stated purposes:
User Provided Data: Retained for the duration of your use of the Application plus 12 months thereafter, unless longer retention is required by law
Automatically Collected Data: Retained for up to 24 months from collection, unless longer retention is required for legal compliance
Aggregated and Anonymized Data: Retained indefinitely as it no longer identifies you
Data required for legal compliance: Retained as long as required by applicable law
You may request deletion of your personal data, subject to any legal obligation to retain it. If you want the Service Provider to delete User Provided Data submitted through the Application, please contact them at ${email}. Please note that some User Provided Data may be required for the Application to function properly.

Children
The Application is not intended for children under 16 years of age, or such higher age as required by applicable law. The Service Provider does not knowingly solicit data from children or market the Application to them.

The Service Provider does not knowingly collect personally identifiable information from children. The Service Provider encourages all children to never submit any personally identifiable information through the Application and/or Services. The Service Provider encourages parents and legal guardians to monitor their children's Internet usage and to help enforce this Policy by instructing their children never to provide personally identifiable information through the Application and/or Services without their permission. If you have reason to believe that a child has provided personally identifiable information to the Service Provider through the Application and/or Services, please contact the Service Provider so that they will be able to take the necessary actions. If you are under 16 years of age, your parent or guardian must provide consent on your behalf where permitted by law.

Security
The Service Provider is concerned about safeguarding the confidentiality of your information. The Service Provider provides physical, electronic, and procedural safeguards to protect information the Service Provider processes and maintains.

Data Breach Notification
If a data breach occurs that affects your personal data, the Service Provider will notify you in accordance with applicable legal requirements, including, where required, providing information about the nature of the breach and the steps being taken to address it.

Changes
The Service Provider may update this Privacy Policy from time to time. The Service Provider will notify you of material changes by posting the updated Privacy Policy with an effective date. Where required by law, the Service Provider will seek your consent to material changes before they take effect.

Previous versions of this Privacy Policy will be maintained and made available upon request by contacting the Service Provider at ${email}.

This privacy policy is effective as of ${todayDate}

Your Consent
Where processing is based on consent, you provide that consent by affirmatively opting in to the relevant feature or action. You may withdraw consent at any time without affecting processing carried out before withdrawal. Processing based on other lawful bases is carried out as described above.

Contact Us
If you have any questions regarding privacy while using the Application, or have questions about the practices, please contact the Service Provider via email at ${email}.`;

  document.getElementById('pp-result').value = template;
}

function copyPrivacyPolicy() {
  const textarea = document.getElementById('pp-result');
  if (!textarea.value.trim()) {
    alert("⚠️ قم بتوليد النص أولاً قبل النسخ.");
    return;
  }
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  alert("📋 تم نسخ سياسة الخصوصية كنص إلى الحافظة بنجاح!");
}

function copyPrivacyPolicyHTML() {
  const textVal = document.getElementById('pp-result').value.trim();
  if (!textVal) {
    alert("⚠️ قم بتوليد النص أولاً قبل النسخ.");
    return;
  }

  const appName = document.getElementById('pp-app-name').value.trim() || '[AppName]';
  const companyName = document.getElementById('pp-company-name').value.trim() || '[CompanyName]';
  const email = document.getElementById('pp-email').value.trim() || '[Email]';
  const todayDate = new Date().toISOString().split('T')[0];

  const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - ${appName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-w: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #222; margin-top: 24px; }
    p { margin-bottom: 16px; }
    ul { margin-bottom: 16px; padding-left: 20px; }
    li { margin-bottom: 8px; }
    a { color: #4f46e5; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>

  <h1>Privacy Policy</h1>
  <p>This privacy policy applies to the <strong>${appName}</strong> app for mobile devices, together with any related services operated by <strong>${companyName}</strong> (collectively, the "Application"). <strong>${companyName}</strong> is hereby referred to as the "Service Provider".</p>

  <h2>Information Collection and Use</h2>
  <p>The Application collects information when you download and use it. This information may include information such as:</p>
  <ul>
    <li>Your device's Internet Protocol address (IP)</li>
    <li>The pages of the Application that you visit, the time and date of your visit, the time spent on those pages</li>
    <li>The time spent on the Application</li>
    <li>Your mobile operating system you use</li>
  </ul>

  <h2>Cookies and Tracking Technologies</h2>
  <p>The Application or its third-party SDKs may use cookies, SDKs, pixels, and similar technologies to support functionality, analytics, or service delivery. Where required by applicable law, the Service Provider will obtain consent before using non-essential tracking technologies.</p>

  <h2>Your Rights</h2>
  <p>You may request access to, correction of, or deletion of your personal data held by the Service Provider. To exercise these rights, or to withdraw consent where processing is based on consent, contact the Service Provider at <a href="mailto:${email}">${email}</a>.</p>

  <h2>Your California Privacy Rights (CCPA/CPRA)</h2>
  <p>If you are a California resident, you have the right to know what personal information is collected, the right to delete personal information, the right to opt out of the sale or sharing of personal information, and the right to non-discrimination for exercising these rights. To exercise your CCPA/CPRA rights, contact the Service Provider at <a href="mailto:${email}">${email}</a>.</p>
  <p>The Service Provider may use the information you provide to send important information, required notices, and, where permitted by law, marketing communications.</p>
  <p>For a better experience while using the Application, the Service Provider may require you to provide certain personally identifiable information. The information the Service Provider requests will be retained and used as described in this privacy policy.</p>

  <h2>Third Party Access</h2>
  <p>Only aggregated, anonymized data is periodically transmitted to external services to aid the Service Provider in improving the Application and their service. The Service Provider may share your information with third parties in the ways that are described in this privacy statement.</p>

  <h2>International Data Transfers</h2>
  <p>The Service Provider or its third-party service providers may transfer personal data to countries outside your country of residence, including outside the European Economic Area (EEA). Where applicable law requires safeguards for international transfers, the Service Provider will use appropriate mechanisms:</p>
  <ul>
    <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
    <li>Adequacy decisions or other legally recognized transfer mechanisms</li>
    <li>Your consent, where required and legally permitted</li>
  </ul>
  <p>Data protection laws in other countries may differ from those in your jurisdiction. Where required by law, the Service Provider will apply appropriate safeguards and obtain any consent required for the transfer.</p>
  <p>The Service Provider may disclose User Provided and Automatically Collected Information:</p>
  <ul>
    <li>As required by law, such as to comply with a subpoena, or similar legal process;</li>
    <li>When they believe in good faith that disclosure is necessary to protect their rights, protect your safety or the safety of others, investigate fraud, or respond to a government request;</li>
    <li>With their trusted services providers who work on their behalf, do not have an independent use of the information the Service Provider discloses to them, and have agreed to adhere to the rules set forth in this privacy statement.</li>
  </ul>

  <h2>Opt-Out Rights</h2>
  <p>You can stop further collection of information from your mobile device by uninstalling the Application. Uninstalling will stop the Application from collecting data from your device, but it does not automatically delete information that has already been transmitted to the Service Provider or to third parties.</p>
  <p>To request deletion of your personal data, to withdraw consent, or to exercise any of your rights, contact the Service Provider at <a href="mailto:${email}">${email}</a>.</p>

  <h2>Data Retention Policy</h2>
  <p>The Service Provider retains personal data based on its necessity for the stated purposes:</p>
  <ul>
    <li><strong>User Provided Data:</strong> Retained for the duration of your use of the Application plus 12 months thereafter, unless longer retention is required by law</li>
    <li><strong>Automatically Collected Data:</strong> Retained for up to 24 months from collection, unless longer retention is required for legal compliance</li>
    <li><strong>Aggregated and Anonymized Data:</strong> Retained indefinitely as it no longer identifies you</li>
    <li><strong>Data required for legal compliance:</strong> Retained as long as required by applicable law</li>
  </ul>
  <p>You may request deletion of your personal data, subject to any legal obligation to retain it. If you want the Service Provider to delete User Provided Data submitted through the Application, please contact them at <a href="mailto:${email}">${email}</a>. Please note that some User Provided Data may be required for the Application to function properly.</p>

  <h2>Children</h2>
  <p>The Application is not intended for children under 16 years of age, or such higher age as required by applicable law. The Service Provider does not knowingly solicit data from children or market the Application to them.</p>
  <p>The Service Provider does not knowingly collect personally identifiable information from children. The Service Provider encourages all children to never submit any personally identifiable information through the Application and/or Services. The Service Provider encourages parents and legal guardians to monitor their children's Internet usage and to help enforce this Policy by instructing their children never to provide personally identifiable information through the Application and/or Services without their permission. If you have reason to believe that a child has provided personally identifiable information to the Service Provider through the Application and/or Services, please contact the Service Provider so that they will be able to take the necessary actions. If you are under 16 years of age, your parent or guardian must provide consent on your behalf where permitted by law.</p>

  <h2>Security</h2>
  <p>The Service Provider is concerned about safeguarding the confidentiality of your information. The Service Provider provides physical, electronic, and procedural safeguards to protect information the Service Provider processes and maintains.</p>

  <h2>Data Breach Notification</h2>
  <p>If a data breach occurs that affects your personal data, the Service Provider will notify you in accordance with applicable legal requirements, including, where required, providing information about the nature of the breach and the steps being taken to address it.</p>

  <h2>Changes</h2>
  <p>The Service Provider may update this Privacy Policy from time to time. The Service Provider will notify you of material changes by posting the updated Privacy Policy with an effective date. Where required by law, the Service Provider will seek your consent to material changes before they take effect.</p>
  <p>Previous versions of this Privacy Policy will be maintained and made available upon request by contacting the Service Provider at <a href="mailto:${email}">${email}</a>.</p>

  <p><em>This privacy policy is effective as of ${todayDate}</em></p>

  <h2>Your Consent</h2>
  <p>Where processing is based on consent, you provide that consent by affirmatively opting in to the relevant feature or action. You may withdraw consent at any time without affecting processing carried out before withdrawal. Processing based on other lawful bases is carried out as described above.</p>

  <h2>Contact Us</h2>
  <p>If you have any questions regarding privacy while using the Application, or have questions about the practices, please contact the Service Provider via email at <a href="mailto:${email}">${email}</a>.</p>

</body>
</html>`;

  navigator.clipboard.writeText(htmlTemplate);
  alert("🏷️ تم نسخ كود HTML لسياسة الخصوصية بالكامل إلى الحافظة بنجاح!");
}

// القوائم المنسدلة
async function loadDropdowns() {
  const { data: consoles } = await supabaseClient.from('consoles').select('*').order('name');
  const consoleSelect = document.getElementById('console_account');
  consoleSelect.innerHTML = '<option value="">اختر الكونسول...</option>';
  
  const activeConsoles = consoles?.filter(c => (c.account_status || c.status || 'active') === 'active');
  activeConsoles?.forEach(c => consoleSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`);

  const { data: clients } = await supabaseClient.from('clients').select('*').order('name');
  rawClientsList = clients || [];
  const clientSelect = document.getElementById('client_name');
  clientSelect.innerHTML = '<option value="">اختر العميل...</option>';
  clients?.forEach(c => clientSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`);
}

function onClientSelectChange() {
  const selectedName = document.getElementById('client_name').value;
  const clientObj = rawClientsList.find(c => c.name === selectedName);
  if (clientObj && clientObj.default_partner) {
    document.getElementById('partner_owner').value = clientObj.default_partner;
  }
}

// إضافة تطبيق
document.getElementById('app-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newApp = {
    app_name: document.getElementById('app_name').value,
    console_account: document.getElementById('console_account').value,
    client_name: document.getElementById('client_name').value,
    partner_owner: document.getElementById('partner_owner').value,
    app_status: document.getElementById('app_status').value,
    setup_fee: Number(document.getElementById('setup_fee').value),
    monthly_rent: Number(document.getElementById('monthly_rent').value),
    rent_cycle: document.getElementById('rent_cycle').value,
    next_due_date: document.getElementById('next_due_date').value,
    rent_status: 'pending'
  };

  const { error } = await supabaseClient.from('apps').insert([newApp]);
  if (!error) {
    alert("تمت إضافه التطبيق بنجاح!");
    modal.classList.add('hidden');
    document.getElementById('app-form').reset();
    document.getElementById('app_status').value = 'active';
    document.getElementById('rent_cycle').value = 'weekly';
    await fetchApps();
  } else {
    alert("حدث خطأ أثناء إضافة التطبيق: " + error.message);
  }
});

function getStatusStyle(status) {
  if (status === 'paid') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (status === 'overdue') return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
  return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
}

function getStatusText(status) {
  if (status === 'paid') return 'تم الدفع ✓';
  if (status === 'overdue') return 'متأخر ✕';
  return 'معلق ⏳';
}

function getAppBadgeStyle(appStatus) {
  if (appStatus === 'transferred') return '<span class="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full text-xs">منقول 🔵</span>';
  if (appStatus === 'banned') return '<span class="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-xs">محظور 🔴</span>';
  return '<span class="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs">نشط 🟢</span>';
}

async function deleteApp(id) {
  if (confirm("هل أنت متأكد من حذف هذا السجل؟")) {
    await supabaseClient.from('apps').delete().eq('id', id);
    const activeTab = localStorage.getItem('activeTab') || 'apps-tab';
    switchTab(activeTab);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const activeTab = localStorage.getItem('activeTab') || 'apps-tab';
  switchTab(activeTab);
});

// دالة إخفاء وإظهار حقل الإيجار الدوري وتعديل المتطلبات حسب دورية الإيجار
function toggleRentFields() {
  const rentCycle = document.getElementById('rent_cycle').value;
  const rentContainer = document.getElementById('rent_amount_container');
  const rentInput = document.getElementById('monthly_rent');
  const dueDateInput = document.getElementById('next_due_date');

  // في حالة اختيار رفع مستمر أو رفع ونقل
  if (rentCycle === 'continuous' || rentCycle === 'transfer') {
    if (rentContainer) rentContainer.classList.add('hidden');
    if (rentInput) rentInput.value = 0; // تصغير قيمة الإيجار إلى 0
    if (dueDateInput) {
      dueDateInput.removeAttribute('required'); // جعل التاريخ غير إجباري
    }
  } else {
    // في حالة الاختيارات العادية (شهري / أسبوعي)
    if (rentContainer) rentContainer.classList.remove('hidden');
    if (dueDateInput) {
      dueDateInput.setAttribute('required', 'required'); // إعادة التاريخ ليكون إجبارياً
    }
  }
}


// دالة مساعدة لإظهار نص الدورية بشكل صحيح في الجدول
function getCycleText(cycle) {
  switch (cycle) {
    case 'monthly':
      return 'شهر';
    case 'weekly':
      return 'أسبوع';
    case 'continuous':
      return 'رفع مستمر';
    case 'transfer':
      return 'رفع ونقل';
    default:
      return cycle || '-';
  }
}