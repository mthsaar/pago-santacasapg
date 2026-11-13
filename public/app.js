/**
 * Santa Casa de Ponta Grossa - Escala Maternidade
 * Material 3 Expressive Frontend Application
 * Sincronização em Tempo Real via Firebase Cloud Firestore + Fallback Local
 */

const SILHOUETTE_SVG = `
  <svg class="w-full h-full text-brand-700/40 bg-brand-50 p-2" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>
`;

const MATERNITY_SHEET_ID = '1i82ITSC-qZ564ABUo4bz0ejQKpnwO1kjUnlshivXTk0';

const MATERNITY_DEFAULT_GROUPS = [
  {
    title: 'Pré-Parto & Observação',
    beds: ['PRÉ 1', 'PRÉ 2', 'PRÉ 3', 'OBS 1', 'OBS 2']
  },
  {
    title: 'Apartamentos / Quartos (301 a 310)',
    beds: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310']
  },
  {
    title: 'Enfermarias (319 a 326)',
    beds: ['319-1', '319-2', '321-1', '321-2', '323-1', '323-2', '325-1', '325-2', '326-1', '326-2']
  },
  {
    title: 'Enfermarias & Quartos (327 a 336)',
    beds: ['327-1', '327-2', '328-1', '328-2', '329-1', '329-2', '330-1', '330-2', '331-1', '331-2', '332', '333', '334', '335-1', '335-2', '336']
  }
];

const ALTO_RISCO_PRESET_LIST = [
  { code: 'NÃO', label: 'Habitual / Sem Alto Risco (Não)', isHabitual: true },
  { code: 'DMG', label: 'DMG (Diabetes Gestacional)' },
  { code: 'DM1/DM2', label: 'DM1 / DM2 (Diabetes Prévio)' },
  { code: 'HAC', label: 'HAC (Hipertensão Crônica)' },
  { code: 'DHEG/PE', label: 'DHEG / Pré-Eclâmpsia' },
  { code: 'HIPOTIREOIDISMO', label: 'Hipotireoidismo' },
  { code: 'OBESIDADE', label: 'Obesidade' },
  { code: 'ITERATIVIDADE', label: 'Iteratividade (2+ Cesáreas)' },
  { code: 'TPP', label: 'TPP / Prematuridade / IIC' },
  { code: 'RPMO', label: 'RPMO / Bolsa Rota' },
  { code: 'ITU', label: 'ITU / Pielonefrite' },
  { code: 'RCIU', label: 'RCIU / Restrição Crescimento' },
  { code: 'OLIGODRAMNIA', label: 'Oligodramnia / Polidramnia' },
  { code: 'GEMELAR', label: 'Gestação Gemelar' },
  { code: 'IDADE >= 35A', label: 'Idade Materna ≥ 35 anos' },
  { code: 'TROMBOFILIA', label: 'Trombofilia / SAF' },
  { code: 'ALOIMUNIZAÇÃO RH', label: 'Aloimunização Rh' },
  { code: 'CARDIOPATIA', label: 'Cardiopatia / Nefropatia' },
  { code: 'TABAGISMO', label: 'Tabagismo / Drogadição' },
  { code: 'OUTROS', label: 'Outros (Digitar texto corrido)', isOther: true }
];

const INTERNACAO_DELIVERY_TYPES = ['PN', 'PN+DIU', 'CST', 'CST+DIU', 'CST+LTB'];

const app = {
  state: {
    isEditorMode: false,
    currentView: 'spreadsheet',
    escalaSubMode: 'week',
    doctors: [],
    shifts: [],
    settings: {
      hospital_name: 'Santa Casa de Ponta Grossa',
      unit_name: 'Maternidade • Escala de Plantão e Rotina Obstétrica'
    },
    currentMonth: '2026-11',
    currentWeekIndex: 1, // Primeira semana cheia de novembro (02/11 a 08/11)
    totalWeeksInMonth: 5,
    selectedDate: '2026-11-03',
    activeShiftNow: null,
    editingDoctorId: null,
    selectedShiftSlot: null,
    doctorFilter: '',
    manageFilter: '',
    firebaseActive: false,
    firestoreDb: null,
    undoStack: [],
    redoStack: [],
    maternityFirebaseMap: {},
    maternitySheetMap: {},
    maternityLastSheetHash: {},
    maternityExtraBeds: [],
    maternityAdmissions: JSON.parse(localStorage.getItem('maternity_admissions_cache') || '[]'),
    statsCollapsed: {
      professionals: false,
      patients: false
    },
    maternityWebhookUrl: localStorage.getItem('maternity_sheet_webhook') || '',
    shiftReminderConfig: {
      enabled: localStorage.getItem('shift_reminder_enabled') !== 'false',
      my_doctor_id: localStorage.getItem('shift_reminder_my_doctor_id') || 'ALL',
      notify_shift_1h: localStorage.getItem('shift_reminder_notify_1h') !== 'false',
      notify_clinical: localStorage.getItem('shift_reminder_notify_clinical') !== 'false',
      channel: 'inapp'
    },
    sentShiftReminders: JSON.parse(localStorage.getItem('sent_shift_reminders') || '{}'),
    evoParity: { G: 0, P: 0, C: 0, A: 0, E: 0, M: 0, activeLetter: null, extraText: '' },
    evoAltoRiscoSelected: [],
    evoAltoRiscoOutros: '',
    evoInternacaoSelected: '',
    evoInternacaoExtra: '',
    clinicalReminders: JSON.parse(localStorage.getItem('maternity_clinical_reminders') || '[]'),
    viewingProfileDoctorId: null,
    deferredPwaPrompt: null
  },

  async init() {
    if (sessionStorage.getItem('escala_editor_authorized') === 'true') {
      this.state.isEditorMode = true;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr.startsWith('2026-11')) {
      this.state.selectedDate = todayStr;
    }

    this.initPwaInstallSupport();
    this.setupDatePickers();
    this.updateModeUI();
    this.startClockAndCountdown();
    this.populateEvolutionLeitoSelect();
    this.renderMaternityView();
    this.updateReminderActiveDot();

    await this.initFirebase();
    await this.loadAllData();
    this.syncMaternityFromGoogleSheet();
    this.checkAndTriggerOneHourShiftReminders();
    this.checkClinicalReminders();

    this.switchView(this.state.currentView);

    window.addEventListener('resize', () => {
      this.updateTableColumnMetrics();
    });

    const reminderTimeInput = document.getElementById('evo-reminder-time-input');
    if (reminderTimeInput) {
      reminderTimeInput.addEventListener('input', () => this.updateReminderDoctorPreview());
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.table-fullscreen-active').forEach(el => {
          el.classList.remove('table-fullscreen-active');
          this.updateTableColumnMetrics();
        });
      }
      if (!this.state.isEditorMode || this.state.currentView !== 'spreadsheet') return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.requestUndoShiftAction();
      } else if ((e.metaKey || e.ctrlKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        this.redoShiftAction();
      }
    });

    setInterval(() => {
      this.loadNowStatus();
      this.checkAndTriggerOneHourShiftReminders();
    }, 60000);

    setInterval(() => {
      this.checkClinicalReminders();
    }, 20000);

    setInterval(() => {
      this.syncMaternityFromGoogleSheet();
    }, 12000);
  },

  // ================= SALVAR NA TELA DE INÍCIO (PWA STANDALONE) =================
  isRunningStandalone() {
    return Boolean(
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true
    );
  },

  initPwaInstallSupport() {
    this.updatePwaInstallButtonsVisibility();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.state.deferredPwaPrompt = e;
      this.updatePwaInstallButtonsVisibility();
    });

    window.addEventListener('appinstalled', () => {
      this.state.deferredPwaPrompt = null;
      this.updatePwaInstallButtonsVisibility();
      this.closeInstallPwaModal();
      this.showToast('WebApp salvo na Tela de Início com sucesso!', 'success');
    });
  },

  updatePwaInstallButtonsVisibility() {
    const standalone = this.isRunningStandalone();
    const ids = ['btn-install-pwa-mobile', 'btn-install-pwa-reminder', 'profile-modal-btn-install-pwa'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', standalone);
    });

    const nativeBtn = document.getElementById('btn-native-pwa-install');
    if (nativeBtn) {
      nativeBtn.classList.toggle('hidden', !this.state.deferredPwaPrompt);
    }
  },

  async openInstallPwaModal() {
    if (this.state.deferredPwaPrompt) {
      await this.triggerNativePwaInstall();
      return;
    }
    this.updatePwaInstallButtonsVisibility();
    const modal = document.getElementById('modal-install-pwa');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeInstallPwaModal() {
    const modal = document.getElementById('modal-install-pwa');
    if (modal) modal.classList.add('hidden');
  },

  async triggerNativePwaInstall() {
    const promptEvent = this.state.deferredPwaPrompt;
    if (!promptEvent) return;
    try {
      promptEvent.prompt();
      await promptEvent.userChoice;
      this.state.deferredPwaPrompt = null;
      this.updatePwaInstallButtonsVisibility();
      this.closeInstallPwaModal();
    } catch (e) {}
  },

  // ================= FIREBASE CLOUD FIRESTORE INTEGRATION =================
  async initFirebase() {
    const config = window.FIREBASE_CONFIG;
    if (window.firebase && config && config.projectId && config.projectId !== "" && config.projectId !== "SEU_PROJETO") {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        this.state.firestoreDb = firebase.firestore();
        this.state.firebaseActive = true;
        this.updateCloudStatusBadge(true);
        console.log("✓ Firebase Cloud Firestore conectado:", config.projectId);

        this.setupFirestoreListeners();
      } catch (e) {
        console.warn("Aviso ao conectar ao Firebase, usando modo local:", e);
        this.state.firebaseActive = false;
        this.updateCloudStatusBadge(false);
      }
    } else {
      this.state.firebaseActive = false;
      this.updateCloudStatusBadge(false);
    }
  },

  updateCloudStatusBadge(active) {
    const settingsBadge = document.getElementById('settings-firebase-badge');
    if (settingsBadge) {
      if (active) {
        settingsBadge.textContent = "Conectado ao Firebase";
        settingsBadge.className = "text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900";
      } else {
        settingsBadge.textContent = "Modo Local";
        settingsBadge.className = "text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-950";
      }
    }
  },

  setupFirestoreListeners() {
    if (!this.state.firestoreDb) return;

    this.state.firestoreDb.collection('doctors').onSnapshot(snapshot => {
      if (!snapshot.empty) {
        const docs = [];
        snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.state.doctors = docs;
        this.updateDoctorsCount();
        this.populateDoctorSelect();
        this.render();
      }
    });

    this.state.firestoreDb.collection('shifts').onSnapshot(snapshot => {
      if (!snapshot.empty) {
        const shifts = [];
        snapshot.forEach(doc => shifts.push({ id: doc.id, ...doc.data() }));
        this.state.shifts = shifts;
        this.calculateNowStatusFromState();
        this.render();
      }
    });

    this.state.firestoreDb.collection('maternity_patients').onSnapshot(snapshot => {
      const map = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.leito) {
          map[String(data.leito).trim().toUpperCase()] = { id: doc.id, ...data };
        }
      });
      this.state.maternityFirebaseMap = map;
      this.renderMaternityView();
      if (this.state.currentView === 'stats') {
        const picker = document.getElementById('stats-month-picker');
        this.renderPatientStats((picker && picker.value) ? picker.value : this.state.currentMonth);
      }
    });

    this.state.firestoreDb.collection('maternity_admissions').onSnapshot(snapshot => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      this.state.maternityAdmissions = list;
      try {
        localStorage.setItem('maternity_admissions_cache', JSON.stringify(list));
      } catch (e) {}
      if (this.state.currentView === 'stats') {
        const picker = document.getElementById('stats-month-picker');
        this.renderPatientStats((picker && picker.value) ? picker.value : this.state.currentMonth);
      }
    });

    this.state.firestoreDb.collection('settings').doc('maternity_sheet_sync').onSnapshot(doc => {
      if (doc && doc.exists) {
        const data = doc.data();
        if (data && data.webhook_url) {
          this.state.maternityWebhookUrl = data.webhook_url;
          localStorage.setItem('maternity_sheet_webhook', data.webhook_url);
        }
      }
    });

    this.state.firestoreDb.collection('settings').doc('shift_reminders').onSnapshot(doc => {
      if (doc && doc.exists) {
        const data = doc.data();
        if (data) {
          this.state.shiftReminderConfig = {
            enabled: data.enabled !== false,
            channel: data.channel || 'whatsapp',
            webhook_url: data.webhook_url || ''
          };
          localStorage.setItem('shift_reminder_enabled', String(this.state.shiftReminderConfig.enabled));
          localStorage.setItem('shift_reminder_channel', this.state.shiftReminderConfig.channel);
          localStorage.setItem('shift_reminder_webhook', this.state.shiftReminderConfig.webhook_url);
          this.updateReminderActiveDot();
        }
      }
    });

    this.state.firestoreDb.collection('maternity_clinical_reminders').onSnapshot(snapshot => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      this.state.clinicalReminders = list;
      try {
        localStorage.setItem('maternity_clinical_reminders', JSON.stringify(list));
      } catch (e) {}
    });
  },

  toggleTableFullscreen(cardId) {
    const el = document.getElementById(cardId);
    if (!el) return;
    const isNowFullscreen = !el.classList.contains('table-fullscreen-active');
    document.querySelectorAll('.table-fullscreen-active').forEach(node => {
      node.classList.remove('table-fullscreen-active');
    });
    if (isNowFullscreen) {
      el.classList.add('table-fullscreen-active');
      if (cardId === 'card-stats-professionals') {
        const bodyEl = document.getElementById('body-stats-professionals');
        if (bodyEl) bodyEl.classList.remove('hidden');
      }
    }
    requestAnimationFrame(() => {
      this.updateTableColumnMetrics();
      if (window.lucide) lucide.createIcons();
    });
  },

  formatMonthYearPT(monthStr) {
    if (!monthStr || !monthStr.includes('-')) return monthStr;
    const [y, m] = monthStr.split('-');
    const names = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const mIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
    return `${names[mIdx]} de ${y}`;
  },

  ensureStatsMonthOption(monthStr) {
    const statsPicker = document.getElementById('stats-month-picker');
    if (!statsPicker || !monthStr) return;
    let opt = Array.from(statsPicker.options || []).find(o => o.value === monthStr);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = monthStr;
      opt.textContent = this.formatMonthYearPT(monthStr);
      statsPicker.appendChild(opt);
    }
    statsPicker.value = monthStr;
  },

  stepStatsMonth(delta) {
    const statsPicker = document.getElementById('stats-month-picker');
    const curVal = (statsPicker && statsPicker.value) ? statsPicker.value : this.state.currentMonth;
    const [yStr, mStr] = curVal.split('-');
    let year = parseInt(yStr, 10);
    let month = parseInt(mStr, 10) + delta;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    const nextMonthStr = `${year}-${String(month).padStart(2, '0')}`;
    this.ensureStatsMonthOption(nextMonthStr);
    this.loadStats(nextMonthStr);
  },

  setupDatePickers() {
    const dailyPicker = document.getElementById('daily-picker');
    if (dailyPicker) dailyPicker.value = this.state.selectedDate;

    this.ensureStatsMonthOption(this.state.currentMonth);
  },

  updateDoctorsCount() {
    const countEl = document.getElementById('count-doctors');
    if (countEl) countEl.textContent = this.state.doctors.length;
  },

  // ================= CARREGAMENTO DE DADOS =================
  async loadAllData() {
    if (this.state.firebaseActive && this.state.firestoreDb) {
      await this.loadFirebaseData();
    } else {
      await this.loadLocalServerData();
    }
  },

  async loadLocalServerData() {
    try {
      const [docRes, shiftRes, nowRes] = await Promise.all([
        fetch('/api/doctors'),
        fetch(`/api/shifts?month=${this.state.currentMonth}`),
        fetch('/api/shifts/now')
      ]);

      const docData = await docRes.json();
      const shiftData = await shiftRes.json();
      const nowData = await nowRes.json();

      if (docData.success) {
        this.state.doctors = docData.doctors;
        this.updateDoctorsCount();
        this.populateDoctorSelect();
      }

      if (shiftData.success) {
        this.state.shifts = shiftData.shifts;
      }

      if (nowData.success) {
        this.state.activeShiftNow = nowData;
      }

      this.render();
    } catch (err) {
      this.loadStaticFallbackData();
    }
  },

  loadStaticFallbackData() {
    if (!window.INITIAL_SPREADSHEET_DATA) return;
    const rawDocs = window.INITIAL_SPREADSHEET_DATA.doctors || [];
    this.state.doctors = rawDocs.map((name, idx) => ({
      id: String(idx + 1),
      name: name,
      phone: '',
      crm: '',
      specialty: 'GO',
      photo_url: ''
    }));

    const docIdMap = {};
    this.state.doctors.forEach(d => { docIdMap[d.name] = d.id; });

    const shifts = [];
    const rawShifts = window.INITIAL_SPREADSHEET_DATA.november_2026 || {};
    for (const [dateStr, slots] of Object.entries(rawShifts)) {
      const pushS = (type, role, name) => {
        if (!name) return;
        shifts.push({
          id: `${dateStr}_${type}_${role}`,
          date: dateStr,
          shift_type: type,
          slot_role: role,
          doctor_id: docIdMap[name],
          doctor_name: name
        });
      };
      pushS('routine', 'rotineiro', slots.rotin);
      pushS('morning', 'day_1', slots.m1);
      pushS('morning', 'day_2', slots.m2);
      pushS('afternoon', 'day_1', slots.a1);
      pushS('afternoon', 'day_2', slots.a2);
      pushS('evening', 'shift_19_23', slots.extra);
      pushS('night', 'night_1', slots.n1);
      pushS('night', 'night_2', slots.n2);
    }

    this.state.shifts = shifts;
    this.updateDoctorsCount();
    this.populateDoctorSelect();
    this.calculateNowStatusFromState();
    this.render();
  },

  async loadFirebaseData() {
    const db = this.state.firestoreDb;
    const docSnap = await db.collection('doctors').get();

    if (docSnap.empty) {
      await this.seedFirebaseDefaults();
      return;
    }

    const docs = [];
    docSnap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    this.state.doctors = docs;

    const shiftSnap = await db.collection('shifts').get();
    const shifts = [];
    shiftSnap.forEach(s => shifts.push({ id: s.id, ...s.data() }));
    this.state.shifts = shifts;

    this.updateDoctorsCount();
    this.populateDoctorSelect();
    this.calculateNowStatusFromState();
    this.render();
  },

  async seedFirebaseDefaults() {
    try {
      const db = this.state.firestoreDb;
      if (!db || !window.INITIAL_SPREADSHEET_DATA) return;

      const batch = db.batch();
      const docIdMap = {};

      const rawDocs = window.INITIAL_SPREADSHEET_DATA.doctors;
      rawDocs.forEach((docName, idx) => {
        const idStr = String(idx + 1);
        docIdMap[docName] = idStr;
        const ref = db.collection('doctors').doc(idStr);
        batch.set(ref, {
          id: idStr,
          name: docName,
          phone: "",
          crm: "",
          specialty: "GO",
          photo_url: ""
        });
      });

      const rawShifts = window.INITIAL_SPREADSHEET_DATA.november_2026;
      for (const [dateStr, slots] of Object.entries(rawShifts)) {
        const addShift = (shiftType, slotRole, docName) => {
          if (!docName || !docIdMap[docName]) return;
          const shiftKey = `${dateStr}_${shiftType}_${slotRole}`;
          const shiftRef = db.collection('shifts').doc(shiftKey);
          batch.set(shiftRef, {
            id: shiftKey,
            date: dateStr,
            shift_type: shiftType,
            slot_role: slotRole,
            doctor_id: docIdMap[docName],
            doctor_name: docName
          });
        };

        if (slots.rotin) addShift('routine', 'rotineiro', slots.rotin);
        if (slots.m1) addShift('morning', 'day_1', slots.m1);
        if (slots.m2) addShift('morning', 'day_2', slots.m2);
        if (slots.a1) addShift('afternoon', 'day_1', slots.a1);
        if (slots.a2) addShift('afternoon', 'day_2', slots.a2);
        if (slots.extra) addShift('evening', 'shift_19_23', slots.extra);
        if (slots.n1) addShift('night', 'night_1', slots.n1);
        if (slots.n2) addShift('night', 'night_2', slots.n2);
      }

      await batch.commit();
      this.showToast("Escala sincronizada na nuvem com o Firebase!", "success");
      await this.loadFirebaseData();
    } catch (e) {
      console.warn("Erro ao semear Firebase:", e);
    }
  },

  calculateNowStatusFromState() {
    const now = new Date();
    const realTodayStr = now.toISOString().slice(0, 10);
    const hasRealToday = this.state.shifts.some(s => s.date === realTodayStr);
    const targetDateStr = hasRealToday ? realTodayStr : (this.state.selectedDate || '2026-11-03');
    const hour = now.getHours();

    let activeTypes = ['morning'];
    let shiftLabel = 'Plantão Manhã (07-13h)';
    let start = '07:00';
    let end = '13:00';

    if (hour >= 7 && hour < 13) {
      activeTypes = ['morning'];
      shiftLabel = 'Plantão Manhã (07-13h)';
      start = '07:00';
      end = '13:00';
    } else if (hour >= 13 && hour < 19) {
      activeTypes = ['afternoon'];
      shiftLabel = 'Plantão Tarde (13-19h)';
      start = '13:00';
      end = '19:00';
    } else if (hour >= 19 && hour < 23) {
      activeTypes = ['night', 'evening'];
      shiftLabel = 'Plantão Noturno + Reforço (19-23h)';
      start = '19:00';
      end = '23:00';
    } else {
      activeTypes = ['night'];
      shiftLabel = 'Plantão Noturno (19-07h)';
      start = '19:00';
      end = '07:00';
    }

    const activeShifts = this.state.shifts.filter(s => s.date === targetDateStr && activeTypes.includes(s.shift_type));
    activeShifts.forEach(s => {
      s.start_time = s.shift_type === 'morning' ? '07:00' : s.shift_type === 'afternoon' ? '13:00' : '19:00';
      s.end_time = s.shift_type === 'morning' ? '13:00' : s.shift_type === 'afternoon' ? '19:00' : s.shift_type === 'evening' ? '23:00' : '07:00';
    });

    const isRoutineHours = (hour >= 7 && hour < 13);
    const routineDoctor = isRoutineHours
      ? this.state.shifts.find(s => s.date === targetDateStr && s.shift_type === 'routine')
      : null;

    this.state.activeShiftNow = {
      success: true,
      date: targetDateStr,
      shift_label: shiftLabel,
      shift_start: start,
      shift_end: end,
      routine_active: isRoutineHours,
      active_shifts: activeShifts,
      routine_doctor: routineDoctor || null
    };

    this.renderNowView();
  },

  async loadNowStatus() {
    if (this.state.firebaseActive || this.state.shifts.length > 0) {
      this.calculateNowStatusFromState();
    } else {
      try {
        const res = await fetch('/api/shifts/now');
        const data = await res.json();
        if (data.success) {
          this.state.activeShiftNow = data;
          this.renderNowView();
        }
      } catch (e) {}
    }
  },

  // ================= CONTROLE DE MODO (SWITCH ÚNICO CONSULTA / EDITOR) =================
  handleModeToggleClick() {
    if (this.state.isEditorMode) {
      this.state.isEditorMode = false;
      sessionStorage.removeItem('escala_editor_authorized');
      this.updateModeUI();
      this.render();
      this.showToast('Modo Consulta ativado (Ver Somente)', 'info');
    } else {
      this.openPinModal();
    }
  },

  openPinModal() {
    const modal = document.getElementById('modal-pin-auth');
    const pinInput = document.getElementById('pin-input');
    const err = document.getElementById('pin-error-msg');
    if (err) err.classList.add('hidden');
    if (pinInput) pinInput.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 100);
  },

  closePinModal() {
    document.getElementById('modal-pin-auth').classList.add('hidden');
  },

  getEditorPin() {
    const raw = localStorage.getItem('escala_editor_pin');
    if (raw && /^\d{6}$/.test(raw)) {
      return raw;
    }
    return '123456';
  },

  async handlePinSubmit(e) {
    e.preventDefault();
    const pinInput = document.getElementById('pin-input');
    const pin = pinInput.value.trim();
    const err = document.getElementById('pin-error-msg');

    const savedPin = this.getEditorPin();

    if (pin === savedPin) {
      this.state.isEditorMode = true;
      sessionStorage.setItem('escala_editor_authorized', 'true');
      this.closePinModal();
      this.updateModeUI();
      this.render();
      this.showToast('Modo Editor desbloqueado!', 'success');
    } else {
      err.textContent = 'Senha incorreta (digite os 6 números).';
      err.classList.remove('hidden');
      pinInput.select();
    }
  },

  updateModeUI() {
    const optConsulta = document.getElementById('switch-opt-consulta');
    const optEditor = document.getElementById('switch-opt-editor');
    const btnSettings = document.getElementById('btn-settings');

    const mobOptConsulta = document.getElementById('mobile-switch-opt-consulta');
    const mobOptEditor = document.getElementById('mobile-switch-opt-editor');
    const mobBtnSettings = document.getElementById('mobile-btn-settings');

    const editorDocTabAction = document.getElementById('editor-doc-tab-action');
    const editorUndoRedoBar = document.getElementById('editor-undo-redo-bar');

    if (this.state.isEditorMode) {
      if (optConsulta) {
        optConsulta.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 transition-all";
        optConsulta.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5"></i><span>Consulta</span>`;
      }
      if (optEditor) {
        optEditor.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-scred-600 text-white shadow-sm transition-all";
        optEditor.innerHTML = `<i data-lucide="unlock" class="w-3.5 h-3.5"></i><span>Editor</span>`;
      }

      if (mobOptConsulta) {
        mobOptConsulta.className = "flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-semibold text-slate-600 transition-all";
        mobOptConsulta.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5"></i>`;
      }
      if (mobOptEditor) {
        mobOptEditor.className = "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-scred-600 text-white shadow-sm transition-all";
        mobOptEditor.innerHTML = `<i data-lucide="unlock" class="w-3.5 h-3.5"></i><span>Editor</span>`;
      }

      if (btnSettings) btnSettings.classList.remove('hidden');
      if (mobBtnSettings) mobBtnSettings.classList.remove('hidden');
      if (editorDocTabAction) editorDocTabAction.classList.remove('hidden');
      if (editorUndoRedoBar) editorUndoRedoBar.classList.remove('hidden');
    } else {
      if (optConsulta) {
        optConsulta.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-white text-brand-950 shadow-sm transition-all";
        optConsulta.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 text-brand-700"></i><span>Consulta</span>`;
      }
      if (optEditor) {
        optEditor.className = "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 transition-all";
        optEditor.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5"></i><span>Editor</span>`;
      }

      if (mobOptConsulta) {
        mobOptConsulta.className = "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-white text-brand-950 shadow-sm transition-all";
        mobOptConsulta.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 text-brand-700"></i><span>Consulta</span>`;
      }
      if (mobOptEditor) {
        mobOptEditor.className = "flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-semibold text-slate-600 transition-all";
        mobOptEditor.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5"></i>`;
      }

      if (btnSettings) btnSettings.classList.add('hidden');
      if (mobBtnSettings) mobBtnSettings.classList.add('hidden');
      if (editorDocTabAction) editorDocTabAction.classList.add('hidden');
      if (editorUndoRedoBar) editorUndoRedoBar.classList.add('hidden');
    }

    this.updateUndoRedoUI();
    if (window.lucide) lucide.createIcons();
  },

  updateUndoRedoUI() {
    const btnUndo = document.getElementById('btn-undo-shift');
    const btnRedo = document.getElementById('btn-redo-shift');
    const statusText = document.getElementById('undo-redo-status-text');

    if (btnUndo) {
      btnUndo.disabled = (this.state.undoStack.length === 0);
    }
    if (btnRedo) {
      btnRedo.disabled = (this.state.redoStack.length === 0);
    }
    if (statusText) {
      if (this.state.undoStack.length > 0) {
        const last = this.state.undoStack[this.state.undoStack.length - 1];
        statusText.textContent = `Última ação: ${last.label}`;
      } else {
        statusText.textContent = '';
      }
    }
  },

  // ================= NAVEGAÇÃO ENTRE ABAS (M3 EXPRESSIVE) =================
  switchView(viewName) {
    if (viewName === 'daily' || viewName === 'now') {
      viewName = 'spreadsheet';
    }
    this.state.currentView = viewName;

    // Desktop Tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.remove('bg-brand-700', 'text-white', 'shadow-sm', 'font-bold');
      tab.classList.add('text-slate-600', 'hover:text-brand-950', 'hover:bg-white/60');
    });
    const activeTab = document.getElementById(`tab-${viewName}`);
    if (activeTab) {
      activeTab.classList.add('bg-brand-700', 'text-white', 'shadow-sm', 'font-bold');
      activeTab.classList.remove('text-slate-600', 'hover:text-brand-950', 'hover:bg-white/60');
    }

    // Mobile Bottom Navigation Bar (Material 3 Pill Indicators: Escala, Pacientes, Médicos, Fechamento)
    ['spreadsheet', 'maternity', 'doctors', 'stats'].forEach(v => {
      const btn = document.getElementById(`bnav-${v}`);
      if (!btn) return;
      const pill = btn.querySelector('.bnav-pill');
      const label = btn.querySelector('span:last-child');
      if (v === viewName) {
        if (pill) {
          pill.classList.add('bg-brand-100', 'text-brand-950');
          pill.classList.remove('text-slate-600');
        }
        if (label) {
          label.classList.add('font-extrabold', 'text-brand-950');
          label.classList.remove('font-semibold', 'text-slate-600');
        }
      } else {
        if (pill) {
          pill.classList.remove('bg-brand-100', 'text-brand-950');
          pill.classList.add('text-slate-600');
        }
        if (label) {
          label.classList.remove('font-extrabold', 'text-brand-950');
          label.classList.add('font-semibold', 'text-slate-600');
        }
      }
    });

    document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) targetSection.classList.remove('hidden');

    if (viewName === 'spreadsheet') {
      this.renderSpreadsheetView();
      this.loadNowStatus();
    } else if (viewName === 'maternity') {
      this.renderMaternityView();
      this.syncMaternityFromGoogleSheet();
    } else if (viewName === 'doctors') {
      this.renderDoctorsCatalog();
    } else if (viewName === 'stats') {
      this.loadStats(this.state.currentMonth);
    }

    if (window.lucide) lucide.createIcons();
  },

  renderEscalaView() {
    this.renderSpreadsheetView();
  },

  handlePeriodPrev() {
    this.prevMonth();
  },

  handlePeriodNext() {
    this.nextMonth();
  },

  handleArrowPrev() {
    this.prevWeek();
  },

  handleArrowNext() {
    this.nextWeek();
  },

  handleTodayClick() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDate = todayStr.startsWith('2026-11') ? todayStr : '2026-11-03';
    this.state.selectedDate = targetDate;
    this.state.currentMonth = targetDate.slice(0, 7);
    this.scrollToCurrentWeek();
  },

  render() {
    this.updateModeUI();
    this.renderSpreadsheetView();
    this.renderNowView();
    this.renderMaternityView();
    this.renderDoctorsCatalog();
  },

  // =========================================================================
  // 1A. RENDER DA PLANILHA SEMANAL (GOOGLE CALENDAR WEEK VIEW - SCROLLABLE)
  // =========================================================================
  renderSpreadsheetView() {
    const container = document.getElementById('calendar-table-container');
    const titleEl = document.getElementById('calendar-month-title');
    const pillsContainer = document.getElementById('week-nav-pills');
    if (!container) return;

    const [yearStr, monthStr] = this.state.currentMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    if (titleEl && this.state.escalaSubMode === 'week') {
      titleEl.textContent = `${monthNames[month - 1]} ${year}`;
    }

    const shiftMap = {};
    for (const s of this.state.shifts) {
      const key = `${s.date}_${s.shift_type}_${s.slot_role}`;
      shiftMap[key] = s;
    }

    const weeks = this.getWeeksOfMonth(year, month);
    this.state.totalWeeksInMonth = weeks.length;
    if (this.state.currentWeekIndex >= weeks.length) {
      this.state.currentWeekIndex = 0;
    }

    // Iniciais dos dias da semana estilo Google Calendar (Segunda a Domingo)
    const dayInitials = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    const realTodayStr = new Date().toISOString().slice(0, 10);

    // Renderiza pílulas de navegação de semana
    if (pillsContainer) {
      pillsContainer.innerHTML = weeks.map((w, idx) => {
        const firstDay = w.find(d => d.isCurrentMonth) || w[0];
        const lastDay = [...w].reverse().find(d => d.isCurrentMonth) || w[6];
        const rangeLabel = firstDay.day === lastDay.day
          ? `Dia ${String(firstDay.day).padStart(2, '0')}`
          : `${String(firstDay.day).padStart(2, '0')}–${String(lastDay.day).padStart(2, '0')}`;
        const isActive = idx === this.state.currentWeekIndex;
        return `
          <button onclick="app.scrollToWeek(${idx})" id="week-pill-${idx}"
                  class="week-pill shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-brand-700 text-white shadow-sm'
                      : 'bg-m3-containerLow text-slate-600 hover:bg-brand-100 hover:text-brand-950'
                  }">
            Sem ${idx + 1} <span class="opacity-80 font-medium">(${rangeLabel})</span>
          </button>
        `;
      }).join('');
    }

    const prevViewport = document.getElementById('week-scroll-viewport');
    const savedScrollLeft = this.state._preserveScroll ? (prevViewport ? prevViewport.scrollLeft : null) : null;
    this.state._preserveScroll = false;

    // Planilha única com 1ª coluna de horários FIXA (sticky) e dias escroláveis horizontalmente
    let html = `
      <div id="week-scroll-viewport" class="week-scroll-container" onscroll="app.handleWeekScroll(this)">
        <table class="escala-table text-center select-none">
          <thead>
            <!-- CABEÇALHO ESTILO GOOGLE CALENDAR: COLUNA HORÁRIO FIXA + INICIAL DO DIA E NÚMERO ABAIXO -->
            <tr>
              <th id="sticky-header-th" class="sticky-time-col py-2.5 px-1 bg-[#E8ECF7] border-r border-b border-m3-outlineVariant/70 text-[10px] font-extrabold text-brand-700 uppercase tracking-tight">
                <div class="flex flex-col items-center justify-center gap-0.5">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-brand-700"></i>
                  <span>Horário</span>
                </div>
              </th>
    `;

    weeks.forEach((weekDays, weekIndex) => {
      weekDays.forEach((dayInfo, dayIdx) => {
        const initial = dayInitials[dayIdx];
        const isToday = dayInfo.dateStr === realTodayStr || dayInfo.dateStr === this.state.selectedDate;
        const isWeekend = dayIdx >= 5;
        const isWeekStart = (dayIdx === 0 && weekIndex > 0);

        html += `
          <th id="${dayIdx === 0 ? `week-start-th-${weekIndex}` : `day-th-${weekIndex}-${dayIdx}`}"
              onclick="app.selectDateFromCalendar('${dayInfo.dateStr}')"
              class="day-col py-2 px-1 bg-[#F0F2FA] border-b border-r border-m3-outlineVariant/50 ${isWeekStart ? 'border-l-2 border-l-brand-300' : ''} cursor-pointer hover:bg-brand-50 transition"
              title="Selecionar dia ${this.formatDateBR(dayInfo.dateStr)}">
            <div class="flex flex-col items-center justify-center gap-1">
              <span class="text-[11px] font-extrabold uppercase leading-none ${
                isToday ? 'text-scred-600' : isWeekend ? 'text-brand-700' : 'text-slate-500'
              }">
                ${initial}
              </span>
              <span class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-extrabold leading-none transition-all ${
                isToday
                  ? 'bg-brand-700 text-white shadow-sm ring-2 ring-brand-200'
                  : dayInfo.isCurrentMonth
                    ? 'text-brand-950 hover:bg-brand-100'
                    : 'text-slate-300 font-semibold'
              }">
                ${dayInfo.day}
              </span>
            </div>
          </th>
        `;
      });
    });

    html += `</tr></thead><tbody class="text-xs">`;

    // 1. ROTINEIRO (07-13h)
    html += `
      <tr>
        <td class="sticky-time-col py-2 px-1 font-extrabold text-brand-800 bg-[#E6EAFF] border-r border-b border-m3-outlineVariant/60 text-[10px] sm:text-xs leading-tight">
          07-13h<br><span class="text-[9px] sm:text-[10px] font-semibold text-brand-600">Rotineiro</span>
        </td>
    `;
    weeks.forEach((weekDays, weekIndex) => {
      weekDays.forEach((dayInfo, dayIdx) => {
        html += this.renderCellHtml(dayInfo, shiftMap, 'routine', 'rotineiro', 'bg-brand-50/40 text-brand-950 font-bold', dayIdx === 0 && weekIndex > 0);
      });
    });
    html += `</tr>`;

    // 2. MANHÃ (07-13h)
    html += `
      <tr>
        <td class="sticky-time-col py-2 px-1 font-extrabold text-slate-800 bg-[#F0F2FA] border-r border-b border-m3-outlineVariant/60 text-[11px] sm:text-xs leading-tight">
          07-13h
        </td>
    `;
    weeks.forEach((weekDays, weekIndex) => {
      weekDays.forEach((dayInfo, dayIdx) => {
        html += this.renderDualCellHtml(dayInfo, shiftMap, 'morning', 'day_1', 'day_2', 'bg-white', dayIdx === 0 && weekIndex > 0);
      });
    });
    html += `</tr>`;

    // 3. TARDE (13-19h)
    html += `
      <tr>
        <td class="sticky-time-col py-2 px-1 font-extrabold text-slate-800 bg-[#F0F2FA] border-r border-b border-m3-outlineVariant/60 text-[11px] sm:text-xs leading-tight">
          13-19h
        </td>
    `;
    weeks.forEach((weekDays, weekIndex) => {
      weekDays.forEach((dayInfo, dayIdx) => {
        html += this.renderDualCellHtml(dayInfo, shiftMap, 'afternoon', 'day_1', 'day_2', 'bg-white', dayIdx === 0 && weekIndex > 0);
      });
    });
    html += `</tr>`;

    // 4. REFORÇO (19-23h)
    html += `
      <tr>
        <td class="sticky-time-col py-2 px-1 font-extrabold text-scred-700 bg-[#FFE9E7] border-r border-b border-m3-outlineVariant/60 text-[10px] sm:text-xs leading-tight">
          19-23h<br><span class="text-[9px] sm:text-[10px] font-semibold text-scred-600">Reforço</span>
        </td>
    `;
    weeks.forEach((weekDays, weekIndex) => {
      weekDays.forEach((dayInfo, dayIdx) => {
        html += this.renderCellHtml(dayInfo, shiftMap, 'evening', 'shift_19_23', 'bg-scred-50/25 text-scred-900 font-bold', dayIdx === 0 && weekIndex > 0);
      });
    });
    html += `</tr>`;

    // 5. NOTURNO (19-07h)
    html += `
      <tr>
        <td class="sticky-time-col py-2.5 px-1 font-extrabold text-amber-950 bg-[#FEF3C7] border-r border-m3-outlineVariant/60 text-[10px] sm:text-xs leading-tight">
          19-07h<br><span class="text-[9px] sm:text-[10px] font-semibold text-amber-800">Noturno</span>
        </td>
    `;
    weeks.forEach((weekDays, weekIndex) => {
      weekDays.forEach((dayInfo, dayIdx) => {
        html += this.renderDualCellHtml(dayInfo, shiftMap, 'night', 'night_1', 'night_2', 'bg-amber-50/75 text-amber-950 font-bold', dayIdx === 0 && weekIndex > 0);
      });
    });
    html += `</tr>`;

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    this.updateTableColumnMetrics();

    requestAnimationFrame(() => {
      const viewport = document.getElementById('week-scroll-viewport');
      if (viewport && viewport.clientWidth > 0) {
        if (savedScrollLeft !== null) {
          viewport.scrollLeft = savedScrollLeft;
        } else {
          const dayColPx = this.getDayColPx();
          viewport.scrollLeft = this.state.currentWeekIndex * 7 * dayColPx;
        }
        this.updateScrollProgressBar(viewport, 'week-scroll-bar', 'week-scroll-pct');
        if (this.state.escalaSubMode === 'week') {
          this.updateWeekSubtitle(weeks[this.state.currentWeekIndex], this.state.currentWeekIndex, weeks.length);
        }
      }
    });

    if (window.lucide) lucide.createIcons();
  },

  getVisibleDaysCount() {
    if (window.innerWidth < 640) return 3;
    if (window.innerWidth < 768) return 5;
    return 7;
  },

  getStickyColWidth() {
    if (window.innerWidth < 640) return 72;
    if (window.innerWidth < 768) return 84;
    return 88;
  },

  getDayColPx() {
    const container = document.getElementById('calendar-table-container');
    const totalW = (container && container.clientWidth > 0) ? container.clientWidth : (window.innerWidth - 24);
    const stickyW = this.getStickyColWidth();
    const visibleDays = this.getVisibleDaysCount();
    const minPx = window.innerWidth < 640 ? 92 : 100;
    return Math.max(minPx, Math.floor((totalW - stickyW) / visibleDays));
  },

  updateTableColumnMetrics() {
    const viewport = document.getElementById('week-scroll-viewport');
    if (viewport) {
      const dayColPx = this.getDayColPx();
      viewport.style.setProperty('--day-col-px', `${dayColPx}px`);
      this.updateScrollProgressBar(viewport, 'week-scroll-bar', 'week-scroll-pct');
    }
    const statsViewport = document.getElementById('stats-scroll-viewport');
    if (statsViewport) {
      this.updateScrollProgressBar(statsViewport, 'stats-scroll-bar', 'stats-scroll-pct');
    }
  },

  updateScrollProgressBar(viewport, barId, pctId) {
    if (!viewport) return;
    const barEl = document.getElementById(barId);
    const pctEl = document.getElementById(pctId);
    if (!barEl) return;

    const scrollW = viewport.scrollWidth;
    const clientW = viewport.clientWidth;
    if (scrollW <= clientW + 2) {
      barEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      return;
    }

    const pct = Math.min(100, Math.max(8, Math.round(((viewport.scrollLeft + clientW) / scrollW) * 100)));
    barEl.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  },

  handleTrackClick(event, viewportId) {
    const viewport = document.getElementById(viewportId);
    const track = event.currentTarget;
    if (!viewport || !track) return;

    const rect = track.getBoundingClientRect();
    const clickRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollTo({
      left: clickRatio * maxScroll,
      behavior: 'smooth'
    });
  },

  handleStatsScroll(viewport) {
    this.updateScrollProgressBar(viewport, 'stats-scroll-bar', 'stats-scroll-pct');
  },

  handleWeekScroll(viewport) {
    if (!viewport || !viewport.clientWidth) return;
    this.updateScrollProgressBar(viewport, 'week-scroll-bar', 'week-scroll-pct');
    const dayColPx = this.getDayColPx();
    const firstVisibleDayIdx = Math.round(viewport.scrollLeft / dayColPx);
    const idx = Math.min(
      this.state.totalWeeksInMonth - 1,
      Math.max(0, Math.floor((firstVisibleDayIdx + 1) / 7))
    );

    if (idx !== this.state.currentWeekIndex && idx >= 0 && idx < this.state.totalWeeksInMonth) {
      this.state.currentWeekIndex = idx;
      document.querySelectorAll('.week-pill').forEach((pill, i) => {
        if (i === idx) {
          pill.className = "week-pill shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all bg-brand-700 text-white shadow-sm";
        } else {
          pill.className = "week-pill shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all bg-m3-containerLow text-slate-600 hover:bg-brand-100 hover:text-brand-950";
        }
      });

      const [yearStr, monthStr] = this.state.currentMonth.split('-');
      const weeks = this.getWeeksOfMonth(parseInt(yearStr), parseInt(monthStr));
      if (weeks[idx] && this.state.escalaSubMode === 'week') {
        this.updateWeekSubtitle(weeks[idx], idx, weeks.length);
      }
    }
  },

  updateWeekSubtitle(weekDays, idx, total) {
    const sub = document.getElementById('calendar-week-subtitle');
    if (!sub || !weekDays) return;
    const first = weekDays[0];
    const last = weekDays[6];
    sub.textContent = `Semana ${idx + 1} de ${total} • ${this.formatShortDate(first.dateStr)} a ${this.formatShortDate(last.dateStr)}`;
  },

  formatShortDate(dateStr) {
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  },

  scrollToWeek(idx) {
    const viewport = document.getElementById('week-scroll-viewport');
    if (!viewport) return;
    const clamped = Math.max(0, Math.min(idx, this.state.totalWeeksInMonth - 1));
    this.state.currentWeekIndex = clamped;
    const dayColPx = this.getDayColPx();
    viewport.scrollTo({
      left: clamped * 7 * dayColPx,
      behavior: 'smooth'
    });
  },

  prevWeek() {
    const viewport = document.getElementById('week-scroll-viewport');
    if (viewport) {
      const dayColPx = this.getDayColPx();
      const stepCols = this.getVisibleDaysCount();
      const curCol = Math.round(viewport.scrollLeft / dayColPx);
      if (curCol > 0) {
        const nextCol = Math.max(0, curCol - stepCols);
        viewport.scrollTo({ left: nextCol * dayColPx, behavior: 'smooth' });
        return;
      }
    }
    this.prevMonth(true);
  },

  nextWeek() {
    const viewport = document.getElementById('week-scroll-viewport');
    if (viewport) {
      const dayColPx = this.getDayColPx();
      const stepCols = this.getVisibleDaysCount();
      const totalCols = this.state.totalWeeksInMonth * 7;
      const curCol = Math.round(viewport.scrollLeft / dayColPx);
      if (curCol + stepCols < totalCols) {
        const nextCol = Math.min(totalCols - stepCols, curCol + stepCols);
        viewport.scrollTo({ left: nextCol * dayColPx, behavior: 'smooth' });
        return;
      }
    }
    this.nextMonth(true);
  },

  scrollToCurrentWeek() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDate = todayStr.startsWith('2026-11') ? todayStr : '2026-11-03';
    this.state.currentMonth = targetDate.slice(0, 7);
    this.state.selectedDate = targetDate;

    const [y, m] = this.state.currentMonth.split('-').map(Number);
    const weeks = this.getWeeksOfMonth(y, m);
    const foundIdx = weeks.findIndex(w => w.some(d => d && d.dateStr === targetDate));
    this.state.currentWeekIndex = foundIdx >= 0 ? foundIdx : 0;
    this.renderSpreadsheetView();
  },

  selectDateFromCalendar(dateStr) {
    this.state.selectedDate = dateStr;
    this.state._preserveScroll = true;
    this.renderSpreadsheetView();
    this.renderDailyView();
  },

  renderCellHtml(dayInfo, shiftMap, shiftType, slotRole, defaultClass, isWeekStart = false) {
    const weekBorder = isWeekStart ? 'border-l-2 border-l-brand-300' : '';
    if (!dayInfo || !dayInfo.isCurrentMonth) {
      return `<td class="day-col p-1 border-r border-b border-m3-outlineVariant/30 ${weekBorder} bg-m3-containerLow/40"></td>`;
    }

    const key = `${dayInfo.dateStr}_${shiftType}_${slotRole}`;
    const shift = shiftMap[key];

    if (shift) {
      const docName = shift.doctor_name || this.getDoctorNameById(shift.doctor_id);
      return `
        <td class="day-col p-1 border-r border-b border-m3-outlineVariant/40 ${weekBorder} align-middle ${defaultClass}">
          <div onclick="app.handleCellClick('${dayInfo.dateStr}', '${shiftType}', '${slotRole}', '${shift.doctor_id}')"
               title="Ver dados de ${docName}"
               class="px-1 py-1 rounded-lg cursor-pointer hover:ring-2 hover:ring-brand-600 transition-all text-[11px] sm:text-xs leading-tight whitespace-nowrap">
            ${docName}
          </div>
        </td>
      `;
    } else {
      return `
        <td class="day-col p-1 border-r border-b border-m3-outlineVariant/40 ${weekBorder} align-middle ${defaultClass}">
          <div onclick="app.handleCellClick('${dayInfo.dateStr}', '${shiftType}', '${slotRole}', null)"
               class="h-6 rounded-lg flex items-center justify-center text-[10px] ${this.state.isEditorMode ? 'hover:bg-brand-100 cursor-pointer text-brand-700 font-bold' : 'text-transparent'}">
            ${this.state.isEditorMode ? '+' : ''}
          </div>
        </td>
      `;
    }
  },

  renderDualCellHtml(dayInfo, shiftMap, shiftType, slot1, slot2, defaultClass, isWeekStart = false) {
    const weekBorder = isWeekStart ? 'border-l-2 border-l-brand-300' : '';
    if (!dayInfo || !dayInfo.isCurrentMonth) {
      return `<td class="day-col p-1 border-r border-b border-m3-outlineVariant/30 ${weekBorder} bg-m3-containerLow/40"></td>`;
    }

    const shiftA = shiftMap[`${dayInfo.dateStr}_${shiftType}_${slot1}`];
    const shiftB = shiftMap[`${dayInfo.dateStr}_${shiftType}_${slot2}`];
    const isNight = (shiftType === 'night');

    const nameA = shiftA ? (shiftA.doctor_name || this.getDoctorNameById(shiftA.doctor_id)) : '';
    const nameB = shiftB ? (shiftB.doctor_name || this.getDoctorNameById(shiftB.doctor_id)) : '';

    return `
      <td class="day-col p-1 border-r border-b border-m3-outlineVariant/40 ${weekBorder} align-middle ${defaultClass}">
        <div class="space-y-1">
          ${shiftA ? `
            <div onclick="app.handleCellClick('${dayInfo.dateStr}', '${shiftType}', '${slot1}', '${shiftA.doctor_id}')"
                 title="Ver dados de ${nameA}"
                 class="px-1 py-0.5 rounded-md cursor-pointer hover:ring-2 hover:ring-brand-600 transition-all text-[11px] sm:text-xs leading-tight whitespace-nowrap ${isNight ? 'font-extrabold text-amber-950 hover:bg-amber-200/70' : 'font-semibold text-slate-800 hover:bg-brand-50'}">
              ${nameA}
            </div>
          ` : `
            <div onclick="app.handleCellClick('${dayInfo.dateStr}', '${shiftType}', '${slot1}', null)"
                 class="h-4 rounded flex items-center justify-center text-[10px] ${this.state.isEditorMode ? 'hover:bg-brand-100 cursor-pointer text-brand-700 font-bold' : 'text-transparent'}">
              ${this.state.isEditorMode ? '+' : ''}
            </div>
          `}

          <div class="border-t border-m3-outlineVariant/25"></div>

          ${shiftB ? `
            <div onclick="app.handleCellClick('${dayInfo.dateStr}', '${shiftType}', '${slot2}', '${shiftB.doctor_id}')"
                 title="Ver dados de ${nameB}"
                 class="px-1 py-0.5 rounded-md cursor-pointer hover:ring-2 hover:ring-brand-600 transition-all text-[11px] sm:text-xs leading-tight whitespace-nowrap ${isNight ? 'font-extrabold text-amber-950 hover:bg-amber-200/70' : 'font-semibold text-slate-800 hover:bg-brand-50'}">
              ${nameB}
            </div>
          ` : `
            <div onclick="app.handleCellClick('${dayInfo.dateStr}', '${shiftType}', '${slot2}', null)"
                 class="h-4 rounded flex items-center justify-center text-[10px] ${this.state.isEditorMode ? 'hover:bg-brand-100 cursor-pointer text-brand-700 font-bold' : 'text-transparent'}">
              ${this.state.isEditorMode ? '+' : ''}
            </div>
          `}
        </div>
      </td>
    `;
  },

  getDoctorNameById(id) {
    const doc = this.state.doctors.find(d => String(d.id) === String(id));
    return doc ? doc.name : '';
  },

  getWeeksOfMonth(year, month) {
    const firstOfMonth = new Date(year, month - 1, 1);
    const lastOfMonth = new Date(year, month, 0);

    const firstDayIndex = (firstOfMonth.getDay() + 6) % 7;
    const startDate = new Date(year, month - 1, 1 - firstDayIndex);

    const lastDayIndex = (lastOfMonth.getDay() + 6) % 7;
    const endDate = new Date(year, month - 1, lastOfMonth.getDate() + (6 - lastDayIndex));

    const weeks = [];
    let cursor = new Date(startDate);

    while (cursor <= endDate) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;
        const d = cursor.getDate();
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        week.push({
          day: d,
          dateStr,
          isCurrentMonth: (y === year && m === month)
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }

    return weeks;
  },

  handleCellClick(date, shiftType, slotRole, doctorId) {
    if (this.state.isEditorMode) {
      this.openShiftModal(date, shiftType, slotRole, doctorId);
    } else {
      if (doctorId) {
        this.openDoctorProfileById(doctorId, { date, shiftType });
      } else {
        this.showToast('Vaga aberta. Entre como Editor para escalar.', 'info');
      }
    }
  },

  prevMonth(fromLastWeek = false) {
    const [y, m] = this.state.currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    this.state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const weeks = this.getWeeksOfMonth(d.getFullYear(), d.getMonth() + 1);
    this.state.currentWeekIndex = fromLastWeek ? Math.max(0, weeks.length - 1) : 0;
    this.renderSpreadsheetView();
  },

  nextMonth(fromFirstWeek = false) {
    const [y, m] = this.state.currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    this.state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.state.currentWeekIndex = fromFirstWeek ? 0 : 0;
    this.renderSpreadsheetView();
  },

  // =========================================================================
  // 1B. RENDER: VISÃO DIÁRIA INTEGRADA DENTRO DE "ESCALA"
  // =========================================================================
  renderDailyView() {
    const dateStr = this.state.selectedDate;
    const dateObj = new Date(dateStr + 'T12:00:00');
    
    const titleEl = document.getElementById('calendar-month-title');
    const subEl = document.getElementById('calendar-week-subtitle');
    const picker = document.getElementById('daily-picker');
    if (picker) picker.value = dateStr;

    const weekdayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    if (this.state.escalaSubMode === 'day') {
      if (titleEl) {
        titleEl.textContent = formattedDate;
      }
      if (subEl) {
        subEl.textContent = `${weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1)} • Visão Diária Detalhada`;
      }
    }

    const dayShifts = this.state.shifts.filter(s => s.date === dateStr);
    const container = document.getElementById('daily-slots-container');
    if (!container) return;

    const sections = [
      { id: 'routine', title: 'Rotineiro', time: '07-13h', type: 'routine', roles: ['rotineiro'], badgeClass: 'bg-brand-100 text-brand-950' },
      { id: 'morning', title: 'Plantão Manhã', time: '07-13h', type: 'morning', roles: ['day_1', 'day_2'], badgeClass: 'bg-m3-container text-slate-800' },
      { id: 'afternoon', title: 'Plantão Tarde', time: '13-19h', type: 'afternoon', roles: ['day_1', 'day_2'], badgeClass: 'bg-m3-container text-slate-800' },
      { id: 'evening', title: 'Reforço Noturno', time: '19-23h', type: 'evening', roles: ['shift_19_23'], badgeClass: 'bg-scred-100 text-scred-900' },
      { id: 'night', title: 'Plantão Noturno', time: '19-07h', type: 'night', roles: ['night_1', 'night_2'], badgeClass: 'bg-amber-100 text-amber-950' }
    ];

    container.innerHTML = sections.map(sec => {
      const shiftsInSec = dayShifts.filter(s => s.shift_type === sec.type);

      return `
        <div class="m3-card overflow-hidden">
          <div class="px-5 py-3 bg-m3-containerLow/60 border-b border-m3-outlineVariant/40 flex items-center justify-between">
            <h3 class="font-extrabold text-brand-950 text-sm sm:text-base">${sec.title}</h3>
            <span class="text-xs ${sec.badgeClass} px-3 py-1 rounded-full font-extrabold">${sec.time}</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${sec.roles.map((role, idx) => {
              const shift = shiftsInSec.find(s => s.slot_role === role);
              const label = sec.roles.length > 1 ? `Plantonista ${idx + 1}` : 'Titular';

              if (shift) {
                const doc = this.state.doctors.find(d => String(d.id) === String(shift.doctor_id)) || shift;
                const docName = doc.name || shift.doctor_name;
                const docPhone = doc.phone || shift.doctor_phone || '';
                const phoneDisplay = docPhone && docPhone.trim() !== '' ? docPhone : 'Não cadastrado';
                const hasPhone = Boolean(docPhone && docPhone.trim() !== '');

                return `
                  <div class="bg-m3-surface rounded-2xl p-3.5 border border-m3-outlineVariant/50 flex items-center justify-between">
                    <div class="flex items-center gap-3 cursor-pointer" onclick="app.openDoctorProfileById('${shift.doctor_id}', { date: '${dateStr}', shiftType: '${sec.type}' })">
                      <div class="w-12 h-12 rounded-2xl overflow-hidden border border-brand-200 shrink-0 bg-brand-50 flex items-center justify-center">
                        ${this.renderAvatar(doc.photo_url || shift.doctor_photo)}
                      </div>
                      <div>
                        <span class="text-[10px] font-bold text-brand-700 uppercase tracking-wider">${label}</span>
                        <h4 class="font-extrabold text-brand-950 text-sm hover:text-brand-700">${docName}</h4>
                        <p class="text-xs font-mono ${hasPhone ? 'text-slate-700 font-bold' : 'text-slate-400 italic'}">${phoneDisplay}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                      ${hasPhone ? `
                        <a href="tel:${this.cleanPhone(docPhone)}" class="w-9 h-9 flex items-center justify-center bg-brand-700 text-white rounded-full shadow-sm" title="Ligar">
                          <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                        </a>
                        <a href="https://wa.me/55${this.cleanPhone(docPhone)}" target="_blank" class="w-9 h-9 flex items-center justify-center bg-emerald-600 text-white rounded-full shadow-sm" title="WhatsApp">
                          <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                        </a>
                      ` : ''}
                      ${this.state.isEditorMode ? `
                        <button onclick="app.openShiftModal('${dateStr}', '${sec.type}', '${role}', '${shift.doctor_id}')" 
                                class="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-100 rounded-full border border-brand-200" title="Editar">
                          <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              } else {
                return `
                  <div class="bg-m3-containerLow/50 rounded-2xl p-3.5 border border-dashed border-m3-outlineVariant flex items-center justify-between">
                    <span class="text-xs text-slate-500 font-semibold">${label}: Vaga aberta</span>
                    ${this.state.isEditorMode ? `
                      <button onclick="app.openShiftModal('${dateStr}', '${sec.type}', '${role}', null)"
                              class="text-xs font-extrabold text-brand-700 bg-brand-100 px-3 py-1 rounded-full hover:bg-brand-200 transition">
                        + Escalar
                      </button>
                    ` : ''}
                  </div>
                `;
              }
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  selectDate(val) {
    if (!val) return;
    this.state.selectedDate = val;
    this.state.currentMonth = val.slice(0, 7);
    this.renderDailyView();
    this.renderSpreadsheetView();
  },

  prevDay() {
    const d = new Date(this.state.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    this.state.selectedDate = d.toISOString().slice(0, 10);
    this.state.currentMonth = this.state.selectedDate.slice(0, 7);
    this.renderDailyView();
  },

  nextDay() {
    const d = new Date(this.state.selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    this.state.selectedDate = d.toISOString().slice(0, 10);
    this.state.currentMonth = this.state.selectedDate.slice(0, 7);
    this.renderDailyView();
  },

  // =========================================================================
  // 2. RENDER: TABELA DE MÉDICOS DE PLANTÃO AGORA (BLOCO ABAIXO DA ESCALA)
  // =========================================================================
  renderNowView() {
    const data = this.state.activeShiftNow;
    if (!data) return;

    const shiftBadge = document.getElementById('now-shift-badge');
    if (shiftBadge) shiftBadge.textContent = data.shift_label || 'Turno Ativo';

    const tbody = document.getElementById('now-doctors-table-body');
    if (!tbody) return;

    const nowHour = new Date().getHours();
    const isRoutineWindow = (nowHour >= 7 && nowHour < 13);

    const rows = [];

    // Rotineiro exibido APENAS entre 07:00 e 13:00
    if (isRoutineWindow && data.routine_doctor) {
      rows.push({
        badgeText: '07-13h',
        subLabel: 'Rotineiro',
        badgeClass: 'bg-brand-100 text-brand-950 border border-brand-200',
        shift: data.routine_doctor
      });
    }

    if (data.active_shifts && data.active_shifts.length > 0) {
      data.active_shifts.forEach(shift => {
        let badgeText = '07-13h';
        let subLabel = 'Plantão Manhã';
        let badgeClass = 'bg-m3-container text-brand-950 border border-m3-outlineVariant/60';

        if (shift.shift_type === 'afternoon') {
          badgeText = '13-19h';
          subLabel = 'Plantão Tarde';
        } else if (shift.shift_type === 'evening') {
          badgeText = '19-23h';
          subLabel = 'Reforço';
          badgeClass = 'bg-scred-50 text-scred-800 border border-scred-200';
        } else if (shift.shift_type === 'night') {
          badgeText = '19-07h';
          subLabel = 'Noturno';
          badgeClass = 'bg-amber-100 text-amber-950 border border-amber-300';
        }

        rows.push({
          badgeText,
          subLabel,
          badgeClass,
          shift
        });
      });
    }

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="2" class="px-4 py-6 text-center text-xs text-slate-500 font-semibold">
            Nenhum plantonista escalado para o horário atual.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(item => {
      const shift = item.shift;
      const doctorObj = this.state.doctors.find(d => String(d.id) === String(shift.doctor_id)) || shift;
      const docName = doctorObj.name || shift.doctor_name || 'Profissional';
      const docPhone = doctorObj.phone || shift.doctor_phone || '';
      const phoneDisplay = docPhone && docPhone.trim() !== '' ? docPhone : 'Não cadastrado';
      const hasPhone = Boolean(docPhone && docPhone.trim() !== '');
      const spec = this.formatSpecialty(doctorObj.specialty);

      return `
        <tr class="hover:bg-brand-50/40 transition">
          <td class="px-3.5 py-2.5 border-r border-m3-outlineVariant/40 align-middle">
            <div class="flex items-center gap-2.5 cursor-pointer group" onclick="app.openDoctorProfileById('${shift.doctor_id}')">
              <div class="w-9 h-9 rounded-xl overflow-hidden border border-brand-200 bg-brand-50 shrink-0 flex items-center justify-center">
                ${this.renderAvatar(doctorObj.photo_url || shift.doctor_photo)}
              </div>
              <div class="min-w-0">
                <div class="font-extrabold text-brand-950 text-xs sm:text-sm group-hover:text-brand-700 group-hover:underline truncate">
                  ${docName}
                </div>
                <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span class="text-[10px] font-bold text-brand-800 bg-brand-100 px-2 py-0.2 rounded-full">${spec}</span>
                  <span class="text-[11px] font-mono ${hasPhone ? 'text-slate-600 font-bold' : 'text-slate-400 italic'}">${phoneDisplay}</span>
                </div>
              </div>
            </div>
          </td>
          <td class="px-3.5 py-2.5 align-middle text-right whitespace-nowrap">
            ${hasPhone ? `
              <div class="inline-flex items-center gap-1.5">
                <a href="tel:${this.cleanPhone(docPhone)}"
                   class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-[11px] font-bold shadow-xs transition"
                   title="Ligar para ${docName}">
                  <i data-lucide="phone" class="w-3 h-3"></i>
                  <span class="hidden sm:inline">Ligar</span>
                </a>
                <a href="https://wa.me/55${this.cleanPhone(docPhone)}" target="_blank"
                   class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition"
                   title="WhatsApp de ${docName}">
                  <i data-lucide="message-circle" class="w-3 h-3"></i>
                  <span class="hidden sm:inline">WhatsApp</span>
                </a>
              </div>
            ` : `
              <span class="text-[11px] text-slate-400 italic">Sem telefone</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  // =========================================================================
  // 2B. PACIENTES NA MATERNIDADE (GOOGLE SHEETS + FIREBASE EM TEMPO REAL)
  // =========================================================================
  getAllMaternityGroups() {
    const groups = MATERNITY_DEFAULT_GROUPS.map(g => ({
      title: g.title,
      beds: [...g.beds]
    }));
    if (this.state.maternityExtraBeds && this.state.maternityExtraBeds.length > 0) {
      groups.push({
        title: 'Outros Leitos',
        beds: [...this.state.maternityExtraBeds]
      });
    }
    return groups;
  },

  getAllMaternityBedsFlat() {
    const list = [];
    this.getAllMaternityGroups().forEach(g => {
      g.beds.forEach(b => list.push(b));
    });
    return list;
  },

  normalizeLeitoKey(leito) {
    return String(leito || '').trim().toUpperCase();
  },

  leitoToDocId(leito) {
    return this.normalizeLeitoKey(leito)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9_-]/g, '_');
  },

  getMaternityBedData(leito) {
    const key = this.normalizeLeitoKey(leito);
    const fb = this.state.maternityFirebaseMap[key];
    const sh = this.state.maternitySheetMap[key];

    const hasFbContent = fb && (fb.nome || fb.paridade || fb.alto_risco || fb.internacao_por || fb.observacoes || fb.cleared_at);
    const hasShContent = sh && (sh.nome || sh.paridade || sh.alto_risco || sh.internacao_por || sh.observacoes);

    if (hasFbContent) {
      return {
        leito,
        nome: fb.nome || '',
        paridade: fb.paridade || '',
        alto_risco: fb.alto_risco || '',
        internacao_por: fb.internacao_por || '',
        observacoes: fb.observacoes || '',
        updated_at: fb.updated_at || ''
      };
    }

    if (hasShContent) {
      return {
        leito,
        nome: sh.nome || '',
        paridade: sh.paridade || '',
        alto_risco: sh.alto_risco || '',
        internacao_por: sh.internacao_por || '',
        observacoes: sh.observacoes || '',
        updated_at: ''
      };
    }

    return {
      leito,
      nome: '',
      paridade: '',
      alto_risco: '',
      internacao_por: '',
      observacoes: '',
      updated_at: ''
    };
  },

  parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          row.push(cur);
          cur = '';
        } else if (ch === '\n') {
          row.push(cur.replace(/\r$/, ''));
          rows.push(row);
          row = [];
          cur = '';
        } else if (ch !== '\r') {
          cur += ch;
        }
      }
    }
    if (cur.length > 0 || row.length > 0) {
      row.push(cur.replace(/\r$/, ''));
      rows.push(row);
    }
    return rows;
  },

  async syncMaternityFromGoogleSheet(showFeedback = false) {
    const url = `https://docs.google.com/spreadsheets/d/${MATERNITY_SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&gid=0&_t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Falha ao consultar planilha');
      const csvText = await res.text();
      const rows = this.parseCSV(csvText);

      const knownSet = new Set();
      MATERNITY_DEFAULT_GROUPS.forEach(g => g.beds.forEach(b => knownSet.add(this.normalizeLeitoKey(b))));

      const extraBeds = [];
      const newSheetMap = {};

      for (let i = 0; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || cols.length === 0) continue;

        const rawLeito = String(cols[0] || '').trim();
        if (!rawLeito) continue;

        const upperLeito = rawLeito.toUpperCase();
        if (
          upperLeito.startsWith('PASSAGEM DE PLANT') ||
          upperLeito === 'LEITO'
        ) {
          continue;
        }

        const entry = {
          leito: rawLeito,
          nome: String(cols[1] || '').trim(),
          paridade: String(cols[2] || '').trim(),
          alto_risco: String(cols[3] || '').trim(),
          internacao_por: String(cols[4] || '').trim(),
          observacoes: String(cols[5] || '').trim()
        };

        newSheetMap[upperLeito] = entry;
        if (!knownSet.has(upperLeito)) {
          knownSet.add(upperLeito);
          extraBeds.push(rawLeito);
        }

        // Se a planilha do Google Docs foi alterada diretamente lá, sincroniza com o Firebase
        const sig = `${entry.nome}|${entry.paridade}|${entry.alto_risco}|${entry.internacao_por}|${entry.observacoes}`;
        const prevSig = this.state.maternityLastSheetHash[upperLeito];
        this.state.maternityLastSheetHash[upperLeito] = sig;

        const hasAnySheetVal = Boolean(entry.nome || entry.paridade || entry.alto_risco || entry.internacao_por || entry.observacoes);
        const fbExisting = this.state.maternityFirebaseMap[upperLeito];

        if (
          this.state.firebaseActive &&
          this.state.firestoreDb &&
          ((prevSig !== undefined && prevSig !== sig) || (hasAnySheetVal && !fbExisting))
        ) {
          const docId = this.leitoToDocId(rawLeito);
          const nowIso = new Date().toISOString();
          const prevAdmittedAt = (fbExisting && fbExisting.admitted_at && fbExisting.nome === entry.nome)
            ? fbExisting.admitted_at
            : (hasAnySheetVal ? nowIso : null);
          this.state.firestoreDb.collection('maternity_patients').doc(docId).set({
            leito: rawLeito,
            nome: entry.nome,
            paridade: entry.paridade,
            alto_risco: entry.alto_risco,
            internacao_por: entry.internacao_por,
            observacoes: entry.observacoes,
            admitted_at: prevAdmittedAt,
            cleared_at: !hasAnySheetVal ? nowIso : null,
            updated_at: nowIso,
            source: 'google_sheets'
          }, { merge: true }).catch(() => {});
        }
      }

      this.state.maternitySheetMap = newSheetMap;
      this.state.maternityExtraBeds = extraBeds;
      this.populateEvolutionLeitoSelect();
      this.renderMaternityView();
      if (this.state.currentView === 'stats') {
        const picker = document.getElementById('stats-month-picker');
        this.renderPatientStats((picker && picker.value) ? picker.value : this.state.currentMonth);
      }

      const statusEl = document.getElementById('maternity-sync-status');
      if (statusEl) {
        const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        statusEl.textContent = `Sincronizado às ${nowStr}`;
      }

      if (showFeedback) {
        this.showToast('Planilha da maternidade sincronizada!', 'success');
      }
    } catch (e) {
      if (showFeedback) {
        this.showToast('Usando dados em tempo real do Firebase.', 'info');
      }
    }
  },

  renderMaternityView() {
    const tbody = document.getElementById('maternity-table-body');
    const badgeEl = document.getElementById('maternity-occupied-badge');
    if (!tbody) return;

    const groups = this.getAllMaternityGroups();
    let occupiedCount = 0;
    let totalBeds = 0;

    let html = '';

    groups.forEach((group, gIdx) => {
      if (gIdx > 0) {
        html += `
          <tr class="bg-[#E8ECF7]/75">
            <td colspan="6" class="px-3 py-1 border-b border-m3-outlineVariant/60 text-[10px] font-extrabold uppercase tracking-wider text-brand-800">
              ${group.title}
            </td>
          </tr>
        `;
      } else {
        html += `
          <tr class="bg-[#E8ECF7]/75">
            <td colspan="6" class="px-3 py-1 border-b border-m3-outlineVariant/60 text-[10px] font-extrabold uppercase tracking-wider text-brand-800">
              ${group.title}
            </td>
          </tr>
        `;
      }

      group.beds.forEach(leito => {
        totalBeds++;
        const data = this.getMaternityBedData(leito);
        const isOccupied = Boolean(
          (data.nome && data.nome.trim() !== '') ||
          (data.internacao_por && data.internacao_por.trim() !== '') ||
          (data.observacoes && data.observacoes.trim() !== '')
        );
        if (isOccupied) occupiedCount++;

        const riskVal = (data.alto_risco || '').trim();
        const isHighRisk = Boolean(
          riskVal !== '' &&
          !['não', 'nao', 'n', '-', 'baixo', 'habitual'].includes(riskVal.toLowerCase())
        );

        const rowBg = isOccupied ? 'bg-white hover:bg-brand-50/60' : 'bg-m3-surface/50 hover:bg-brand-50/40';
        const leitoBg = isOccupied ? 'bg-brand-50 text-brand-950' : 'bg-[#F0F2FA] text-slate-600';
        const safeLeitoAttr = leito.replace(/'/g, "\\'");

        html += `
          <tr onclick="app.openMaternityEvolutionModal('${safeLeitoAttr}')"
              title="Toque para adicionar ou editar evolução do leito ${leito}"
              class="${rowBg} cursor-pointer transition">
            <td class="sticky-maternity-col ${leitoBg} px-2 py-2.5 border-r border-b border-m3-outlineVariant/60 font-extrabold text-center align-middle">
              <div class="inline-flex items-center justify-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${isOccupied ? 'bg-emerald-500' : 'bg-slate-300'} shrink-0"></span>
                <span>${this.escapeHtml(leito)}</span>
              </div>
            </td>
            <td class="px-3 py-2 border-r border-b border-m3-outlineVariant/40 align-middle ${isOccupied ? 'font-extrabold text-brand-950' : 'text-slate-400 italic'}">
              ${data.nome ? this.escapeHtml(data.nome) : 'Livre'}
            </td>
            <td class="px-3 py-2 border-r border-b border-m3-outlineVariant/40 align-middle font-semibold text-slate-700 whitespace-nowrap">
              ${data.paridade ? this.escapeHtml(data.paridade) : '—'}
            </td>
            <td class="px-3 py-2 border-r border-b border-m3-outlineVariant/40 align-middle">
              ${riskVal ? `
                <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                  isHighRisk
                    ? 'bg-scred-100 text-scred-900 border border-scred-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }">
                  ${this.escapeHtml(riskVal)}
                </span>
              ` : '<span class="text-slate-400">—</span>'}
            </td>
            <td class="px-3 py-2 border-r border-b border-m3-outlineVariant/40 align-middle font-semibold text-slate-800">
              ${data.internacao_por ? this.escapeHtml(data.internacao_por) : '<span class="text-slate-400">—</span>'}
            </td>
            <td class="px-3 py-2 border-b border-m3-outlineVariant/40 align-middle text-slate-700 whitespace-pre-line leading-snug">
              ${data.observacoes ? this.escapeHtml(data.observacoes) : '<span class="text-slate-400">—</span>'}
            </td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = html;

    if (badgeEl) {
      badgeEl.textContent = `${occupiedCount} de ${totalBeds} leitos ocupados`;
    }
  },

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  handleMaternityScroll(viewport) {
    if (!viewport) return;
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const bar = document.getElementById('maternity-scroll-bar');
    const pctEl = document.getElementById('maternity-scroll-pct');
    if (maxScroll <= 0) {
      if (bar) bar.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      return;
    }
    const ratio = Math.min(1, Math.max(0, viewport.scrollLeft / maxScroll));
    const pct = Math.round(15 + ratio * 85);
    if (bar) bar.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  },

  populateEvolutionLeitoSelect(selectedLeito = null) {
    const select = document.getElementById('evo-select-leito');
    if (!select) return;

    const currentVal = selectedLeito || select.value || 'PRÉ 1';
    const groups = this.getAllMaternityGroups();

    select.innerHTML = groups.map(group => `
      <optgroup label="${group.title}">
        ${group.beds.map(leito => {
          const bedData = this.getMaternityBedData(leito);
          const suffix = bedData.nome ? ` — ${bedData.nome}` : ' (Livre)';
          return `<option value="${leito}" ${leito === currentVal ? 'selected' : ''}>Leito ${leito}${suffix}</option>`;
        }).join('')}
      </optgroup>
    `).join('');
  },

  openMaternityEvolutionModal(preselectedLeito = null) {
    const defaultLeito = preselectedLeito || 'PRÉ 1';
    this.populateEvolutionLeitoSelect(defaultLeito);

    const select = document.getElementById('evo-select-leito');
    if (select) select.value = defaultLeito;

    this.handleEvolutionLeitoChange(defaultLeito);

    const modal = document.getElementById('modal-maternity-evolution');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeMaternityEvolutionModal() {
    const modal = document.getElementById('modal-maternity-evolution');
    if (modal) modal.classList.add('hidden');
  },

  // ================= BUSCA DE PACIENTE NA MATERNIDADE =================
  openMaternityPatientSearchModal() {
    const modal = document.getElementById('modal-maternity-search');
    const input = document.getElementById('maternity-patient-search-input');
    if (input) input.value = '';
    this.renderMaternityPatientSearchResults('');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      if (input) input.focus();
    }, 60);
  },

  closeMaternityPatientSearchModal() {
    const modal = document.getElementById('modal-maternity-search');
    if (modal) modal.classList.add('hidden');
  },

  selectPatientFromSearch(leito) {
    this.closeMaternityPatientSearchModal();
    this.openMaternityEvolutionModal(leito);
  },

  renderMaternityPatientSearchResults(query = '') {
    const resultsEl = document.getElementById('maternity-patient-search-results');
    if (!resultsEl) return;

    const q = String(query || '').trim().toLowerCase();
    const groups = this.getAllMaternityGroups();
    const matches = [];

    groups.forEach(group => {
      group.beds.forEach(leito => {
        const data = this.getMaternityBedData(leito);
        const isOccupied = Boolean(
          (data.nome && data.nome.trim() !== '') ||
          (data.internacao_por && data.internacao_por.trim() !== '') ||
          (data.observacoes && data.observacoes.trim() !== '')
        );

        if (!q && !isOccupied) return;

        const haystack = `${leito} ${data.nome || ''} ${data.paridade || ''} ${data.alto_risco || ''} ${data.internacao_por || ''} ${data.observacoes || ''}`.toLowerCase();
        if (!q || haystack.includes(q)) {
          matches.push({
            leito,
            groupTitle: group.title,
            isOccupied,
            ...data
          });
        }
      });
    });

    if (matches.length === 0) {
      resultsEl.innerHTML = `
        <div class="py-8 text-center text-xs text-slate-400 font-semibold">
          Nenhuma paciente ou leito encontrado para "${this.escapeHtml(query)}".
        </div>
      `;
      return;
    }

    resultsEl.innerHTML = matches.map(item => {
      const safeLeitoAttr = item.leito.replace(/'/g, "\\'");
      const riskVal = (item.alto_risco || '').trim();
      const isHighRisk = Boolean(
        riskVal !== '' &&
        !['não', 'nao', 'n', '-', 'baixo', 'habitual'].includes(riskVal.toLowerCase())
      );

      return `
        <div onclick="app.selectPatientFromSearch('${safeLeitoAttr}')"
             class="p-3 hover:bg-scred-50/40 rounded-2xl cursor-pointer transition flex items-center justify-between gap-3 group">
          <div class="flex items-start gap-3 min-w-0">
            <div class="px-2.5 py-1.5 rounded-xl ${item.isOccupied ? 'bg-scred-100 text-scred-800 border border-scred-200' : 'bg-m3-container text-slate-600'} font-extrabold text-xs shrink-0 text-center min-w-[54px]">
              ${this.escapeHtml(item.leito)}
            </div>
            <div class="min-w-0">
              <div class="font-extrabold text-brand-950 text-xs sm:text-sm group-hover:text-scred-700 truncate">
                ${item.nome ? this.escapeHtml(item.nome) : '<span class="text-slate-400 italic font-medium">Leito Livre</span>'}
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-600">
                ${item.paridade ? `<span class="font-bold text-brand-800">${this.escapeHtml(item.paridade)}</span>` : ''}
                ${riskVal ? `<span class="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${isHighRisk ? 'bg-scred-100 text-scred-800' : 'bg-slate-100 text-slate-700'}">${this.escapeHtml(riskVal)}</span>` : ''}
                ${item.internacao_por ? `<span class="truncate text-slate-500">• ${this.escapeHtml(item.internacao_por)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="w-7 h-7 rounded-full bg-scred-50 text-scred-600 flex items-center justify-center shrink-0 group-hover:bg-scred-600 group-hover:text-white transition">
            <i data-lucide="chevron-right" class="w-4 h-4"></i>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  // ================= POPUP DE DOWNLOAD DO MÊS (PDF / XLSX) =================
  openDownloadMonthModal() {
    const modal = document.getElementById('modal-download-month');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeDownloadMonthModal() {
    const modal = document.getElementById('modal-download-month');
    if (modal) modal.classList.add('hidden');
  },

  // ================= AVISO AUTOMÁTICO 1H ANTES DO PLANTÃO (WHATSAPP / SMS) =================
  updateReminderActiveDot() {
    const dot = document.getElementById('reminder-active-dot');
    if (!dot) return;
    const isEnabled = this.state.shiftReminderConfig && this.state.shiftReminderConfig.enabled;
    dot.classList.toggle('hidden', !isEnabled);
  },

  getUpcomingShiftInfo() {
    const now = new Date();
    const curHour = now.getHours();
    const curMin = now.getMinutes();
    const curTotalMin = curHour * 60 + curMin;

    let targetDate = new Date(now);
    let shiftTypes = [];
    let shiftLabel = '';
    let startTimeStr = '';
    let minutesUntilStart = 0;

    if (curTotalMin < 7 * 60) {
      shiftTypes = ['routine', 'morning'];
      shiftLabel = 'Manhã e Rotina (07h–13h)';
      startTimeStr = '07:00';
      minutesUntilStart = 7 * 60 - curTotalMin;
    } else if (curTotalMin < 13 * 60) {
      shiftTypes = ['afternoon'];
      shiftLabel = 'Plantão Tarde (13h–19h)';
      startTimeStr = '13:00';
      minutesUntilStart = 13 * 60 - curTotalMin;
    } else if (curTotalMin < 19 * 60) {
      shiftTypes = ['evening', 'night'];
      shiftLabel = 'Plantão Noturno (19h–07h) e Reforço (19h–23h)';
      startTimeStr = '19:00';
      minutesUntilStart = 19 * 60 - curTotalMin;
    } else {
      targetDate.setDate(targetDate.getDate() + 1);
      shiftTypes = ['routine', 'morning'];
      shiftLabel = 'Manhã e Rotina (07h–13h)';
      startTimeStr = '07:00';
      minutesUntilStart = (24 * 60 - curTotalMin) + 7 * 60;
    }

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Se a data real não tiver plantões (ex: ambiente de visualização em outro mês), usa selectedDate como referência
    let matchingShifts = this.state.shifts.filter(s => s.date === dateStr && shiftTypes.includes(s.shift_type));
    let effectiveDateStr = dateStr;
    if (matchingShifts.length === 0 && this.state.selectedDate) {
      matchingShifts = this.state.shifts.filter(s => s.date === this.state.selectedDate && shiftTypes.includes(s.shift_type));
      effectiveDateStr = this.state.selectedDate;
    }

    const doctorsList = matchingShifts.map(s => {
      const docObj = this.state.doctors.find(d => String(d.id) === String(s.doctor_id)) || {};
      const roleMap = {
        routine: 'Rotineiro (07–13h)',
        morning: 'Manhã (07–13h)',
        afternoon: 'Tarde (13–19h)',
        evening: 'Reforço (19–23h)',
        night: 'Noturno (19–07h)'
      };
      const docName = docObj.name || s.doctor_name || 'Médico(a)';
      const docPhone = docObj.phone || s.doctor_phone || '';
      const roleLabel = roleMap[s.shift_type] || shiftLabel;
      const message = `Olá Dr(a). ${docName}, lembrete automático da Maternidade Santa Casa de Ponta Grossa: seu turno (${roleLabel}) inicia em 1 hora, às ${startTimeStr} (${this.formatDateBR(effectiveDateStr)}). Bom plantão!`;

      return {
        shift_id: s.id,
        doctor_id: s.doctor_id,
        doctor_name: docName,
        phone: docPhone,
        role_label: roleLabel,
        start_time: startTimeStr,
        date: effectiveDateStr,
        message
      };
    });

    return {
      dateStr: effectiveDateStr,
      shiftLabel,
      startTimeStr,
      minutesUntilStart,
      isOneHourWindow: minutesUntilStart >= 45 && minutesUntilStart <= 65,
      doctors: doctorsList
    };
  },

  openShiftReminderModal() {
    const modal = document.getElementById('modal-shift-reminders');
    const enabledEl = document.getElementById('reminder-auto-enabled');
    const myDocSelect = document.getElementById('reminder-my-doctor-select');
    const optShift1h = document.getElementById('reminder-opt-shift-1h');
    const optClinical = document.getElementById('reminder-opt-clinical');

    const cfg = this.state.shiftReminderConfig || {};
    if (enabledEl) enabledEl.checked = cfg.enabled !== false;
    if (optShift1h) optShift1h.checked = cfg.notify_shift_1h !== false;
    if (optClinical) optClinical.checked = cfg.notify_clinical !== false;

    if (myDocSelect) {
      const sortedDocs = [...(this.state.doctors || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      myDocSelect.innerHTML = `<option value="ALL">Todos os plantonistas (Receber todos os alertas)</option>` +
        sortedDocs.map(d => `<option value="${d.id}">${this.escapeHtml(d.name)}</option>`).join('');
      myDocSelect.value = cfg.my_doctor_id || 'ALL';
    }

    this.updatePwaInstallButtonsVisibility();
    this.updateDeviceNotificationButtonUI();
    this.renderShiftReminderModal();
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeShiftReminderModal() {
    const modal = document.getElementById('modal-shift-reminders');
    if (modal) modal.classList.add('hidden');
  },

  updateDeviceNotificationButtonUI() {
    const labelEl = document.getElementById('label-browser-notif-status');
    const btnEl = document.getElementById('btn-enable-browser-notif');
    if (!labelEl || !btnEl) return;

    const baseClasses = 'w-full h-11 min-h-[44px] px-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition whitespace-nowrap';

    if (!('Notification' in window)) {
      labelEl.textContent = 'Alerta no App ✓';
      btnEl.className = `${baseClasses} bg-emerald-600 hover:bg-emerald-700 text-white`;
      return;
    }

    if (Notification.permission === 'granted') {
      labelEl.textContent = 'Notificação Ativa ✓';
      btnEl.className = `${baseClasses} bg-emerald-600 hover:bg-emerald-700 text-white`;
    } else if (Notification.permission === 'denied') {
      labelEl.textContent = 'Alerta no App ✓';
      btnEl.className = `${baseClasses} bg-brand-700 hover:bg-brand-800 text-white`;
    } else {
      labelEl.textContent = 'Ativar no Aparelho';
      btnEl.className = `${baseClasses} bg-brand-700 hover:bg-brand-800 text-white`;
    }
  },

  async requestDeviceNotificationPermission() {
    this.playClinicalAlertChime();
    if (!('Notification' in window)) {
      this.showToast('Alertas internos e sonoros ativados no WebApp!', 'success');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      this.updateDeviceNotificationButtonUI();
      if (perm === 'granted') {
        this.triggerNativeDeviceNotification(
          'Santa Casa PG • Notificações Ativas',
          'Você receberá os alertas dos seus plantões e evoluções neste aparelho.'
        );
        this.showToast('Notificações do aparelho ativadas com sucesso!', 'success');
      } else {
        this.showToast('Alerta interno do WebApp ativo!', 'info');
      }
    } catch (e) {
      this.showToast('Alerta interno e sonoro do WebApp ativo!', 'info');
    }
  },

  playClinicalAlertChime() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate([180, 90, 180]);
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      playTone(659.25, now, 0.22);       // E5
      playTone(880.00, now + 0.24, 0.35); // A5
    } catch (e) {}
  },

  async triggerNativeDeviceNotification(title, body) {
    this.playClinicalAlertChime();
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200]
          });
          return;
        }
      }
      new Notification(title, { body, icon: '/icon-192.png' });
    } catch (e) {}
  },

  testInAppDeviceNotification() {
    const cfg = this.state.shiftReminderConfig || {};
    const myDocId = cfg.my_doctor_id || 'ALL';
    const docObj = this.state.doctors.find(d => String(d.id) === String(myDocId));
    const docLabel = docObj ? docObj.name : 'Plantonista Vinculado';

    this.triggerNativeDeviceNotification(
      '🏥 Teste de Alerta • Maternidade Santa Casa PG',
      `Dr(a). ${docLabel}: Notificações de plantão e lembretes de evolução funcionando neste aparelho!`
    );

    this.openClinicalReminderFiredModal(
      { leito: 'PRÉ 1', patient_name: 'Paciente Exemplo (Teste)', text: 'Verificar pressão arterial e BCF', time: new Date().toTimeString().slice(0, 5), date: new Date().toISOString().slice(0, 10) },
      docLabel,
      docObj ? docObj.phone : '',
      `Lembrete de teste no WebApp para Dr(a). ${docLabel}`
    );
  },

  downloadCalendarICS({ title, description, dateStr, timeStr, durationMinutes = 30 }) {
    const [y, m, d] = (dateStr || new Date().toISOString().slice(0, 10)).split('-').map(Number);
    const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm, 0);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const fmt = (dt) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    };

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Santa Casa PG//Maternidade Escala//PT-BR',
      'BEGIN:VEVENT',
      `UID:scpg-${Date.now()}@pago-santacasapg.web.app`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${String(description || '').replace(/\n/g, '\\n')}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT5M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${title}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lembrete-maternidade-santacasapg.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
    this.showToast('Abrindo Calendário/Alarme do aparelho...', 'success');
  },

  downloadReminderICSById(reminderId) {
    const rem = (this.state.clinicalReminders || []).find(r => r.id === reminderId);
    if (!rem) return;
    const docs = this.getDoctorsOnCallAtTime(rem.time, rem.date);
    const docNames = docs.length > 0 ? docs.map(d => d.name).join(', ') : 'Plantonista';
    this.downloadCalendarICS({
      title: `🏥 Leito ${rem.leito}: ${rem.text}`,
      description: `Paciente: ${rem.patient_name || rem.leito}\nLembrete: ${rem.text}\nPlantonista no horário: ${docNames}`,
      dateStr: rem.date || rem.created_date || new Date().toISOString().slice(0, 10),
      timeStr: rem.time,
      durationMinutes: 15
    });
  },

  renderShiftReminderModal() {
    const info = this.getUpcomingShiftInfo();
    const titleEl = document.getElementById('reminder-next-shift-title');
    const badgeEl = document.getElementById('reminder-next-shift-time-badge');
    const listEl = document.getElementById('reminder-upcoming-doctors-list');
    const clinicalListEl = document.getElementById('reminder-modal-clinical-list');
    const myDocId = (this.state.shiftReminderConfig && this.state.shiftReminderConfig.my_doctor_id) || 'ALL';

    if (clinicalListEl) {
      const activeRems = (this.state.clinicalReminders || []).filter(r => !r.fired);
      if (activeRems.length === 0) {
        clinicalListEl.innerHTML = `
          <div class="p-3 rounded-xl bg-white border border-m3-outlineVariant/50 text-center text-slate-400 font-semibold">
            Nenhum lembrete clínico pendente no momento. Adicione em Pacientes → Adicionar evolução.
          </div>
        `;
      } else {
        clinicalListEl.innerHTML = activeRems.map(r => {
          const rDate = r.date || r.created_date || new Date().toISOString().slice(0, 10);
          const docs = this.getDoctorsOnCallAtTime(r.time, rDate);
          const docNames = docs.length > 0 ? docs.map(d => d.name).join(', ') : 'Plantonista';
          const isMe = myDocId !== 'ALL' && docs.some(d => String(d.id) === String(myDocId));

          return `
            <div class="p-3 rounded-xl bg-white border ${isMe ? 'border-scred-300 bg-scred-50/30' : 'border-m3-outlineVariant/60'} flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="px-2 py-0.5 rounded-full bg-scred-100 text-scred-800 font-extrabold text-[11px]">${this.formatShortDate(rDate)} às ${this.escapeHtml(r.time)}</span>
                  <span class="font-extrabold text-brand-950 text-xs">${this.escapeHtml(r.leito)} • ${this.escapeHtml(r.patient_name || '')}</span>
                </div>
                <div class="text-xs font-bold text-slate-800 mt-1">${this.escapeHtml(r.text)}</div>
                <div class="text-[11px] text-slate-500">Plantonista no horário: <strong class="text-brand-900">${this.escapeHtml(docNames)}</strong></div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick="app.downloadReminderICSById('${r.id}')" title="Salvar no Alarme/Calendário do Celular"
                        class="w-8 h-8 rounded-full bg-brand-50 hover:bg-brand-100 text-brand-800 border border-brand-200 flex items-center justify-center transition">
                  <i data-lucide="calendar-plus" class="w-4 h-4"></i>
                </button>
                <button type="button" onclick="app.removeClinicalReminder('${r.id}'); app.renderShiftReminderModal();" title="Remover lembrete"
                        class="w-8 h-8 rounded-full bg-scred-50 hover:bg-scred-100 text-scred-700 border border-scred-200 flex items-center justify-center transition">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (titleEl) {
      titleEl.textContent = `${info.shiftLabel} • ${this.formatDateBR(info.dateStr)}`;
    }
    if (badgeEl) {
      const h = Math.floor(info.minutesUntilStart / 60);
      const m = info.minutesUntilStart % 60;
      badgeEl.textContent = h > 0 ? `Inicia às ${info.startTimeStr} (em ${h}h${m}m)` : `Inicia às ${info.startTimeStr} (em ${m} min)`;
    }
    if (!listEl) return;

    if (info.doctors.length === 0) {
      listEl.innerHTML = `
        <div class="p-3 rounded-xl bg-white border border-m3-outlineVariant/50 text-center text-slate-400 font-semibold">
          Nenhum profissional escalado encontrado para o próximo turno.
        </div>
      `;
      return;
    }

    listEl.innerHTML = info.doctors.map(item => {
      const isSelectedDoc = myDocId !== 'ALL' && String(item.doctor_id) === String(myDocId);
      const safeTitle = `🏥 Plantão Maternidade Santa Casa PG (${item.role_label})`.replace(/'/g, "\\'");
      const safeDesc = `${item.message}`.replace(/'/g, "\\'").replace(/\n/g, ' ');

      return `
        <div class="p-3 rounded-xl bg-white border ${isSelectedDoc ? 'border-2 border-scred-500 bg-scred-50/20' : 'border-m3-outlineVariant/60'} flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-extrabold text-brand-950 text-sm leading-tight">${this.escapeHtml(item.doctor_name)}</span>
              ${isSelectedDoc ? '<span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-scred-600 text-white whitespace-nowrap">Você</span>' : ''}
            </div>
            <span class="inline-flex items-center font-extrabold text-scred-700 bg-scred-50 px-2.5 py-1 rounded-lg border border-scred-200 text-[11px] whitespace-nowrap shrink-0">
              ${this.escapeHtml(item.role_label)}
            </span>
          </div>

          <button type="button"
                  onclick="app.downloadCalendarICS({ title: '${safeTitle}', description: '${safeDesc}', dateStr: '${info.dateStr}', timeStr: '${item.start_time}', durationMinutes: 360 })"
                  class="w-full h-10 min-h-[40px] px-3 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-900 border border-brand-200 text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap transition">
            <i data-lucide="calendar-plus" class="w-4 h-4 text-brand-700 shrink-0"></i>
            <span>Alarme no Celular (Início às ${this.escapeHtml(item.start_time)})</span>
          </button>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  async saveShiftReminderConfig(showFeedback = false) {
    const enabledEl = document.getElementById('reminder-auto-enabled');
    const myDocSelect = document.getElementById('reminder-my-doctor-select');
    const optShift1h = document.getElementById('reminder-opt-shift-1h');
    const optClinical = document.getElementById('reminder-opt-clinical');

    const cfg = {
      enabled: enabledEl ? Boolean(enabledEl.checked) : true,
      my_doctor_id: myDocSelect ? myDocSelect.value : (this.state.shiftReminderConfig.my_doctor_id || 'ALL'),
      notify_shift_1h: optShift1h ? Boolean(optShift1h.checked) : true,
      notify_clinical: optClinical ? Boolean(optClinical.checked) : true,
      channel: 'inapp'
    };

    this.state.shiftReminderConfig = cfg;
    localStorage.setItem('shift_reminder_enabled', String(cfg.enabled));
    localStorage.setItem('shift_reminder_my_doctor_id', cfg.my_doctor_id);
    localStorage.setItem('shift_reminder_notify_1h', String(cfg.notify_shift_1h));
    localStorage.setItem('shift_reminder_notify_clinical', String(cfg.notify_clinical));
    this.updateReminderActiveDot();
    this.renderShiftReminderModal();
    this.renderDoctorsCatalog();
    if (this.state.viewingProfileDoctorId) {
      this.updateProfileNotificationUI(this.state.viewingProfileDoctorId);
    }

    if (showFeedback) {
      const docObj = this.state.doctors.find(d => String(d.id) === String(cfg.my_doctor_id));
      const label = docObj ? `Dr(a). ${docObj.name}` : 'Todos os plantonistas';
      this.showToast(`Notificações no WebApp ativas para: ${label}`, 'success');
    }
  },

  async checkAndTriggerOneHourShiftReminders() {
    const cfg = this.state.shiftReminderConfig;
    if (!cfg || !cfg.enabled || cfg.notify_shift_1h === false) return;

    const info = this.getUpcomingShiftInfo();
    if (!info.isOneHourWindow || info.doctors.length === 0) return;

    const myDocId = cfg.my_doctor_id || 'ALL';

    for (const item of info.doctors) {
      if (myDocId !== 'ALL' && String(item.doctor_id) !== String(myDocId)) continue;

      const reminderKey = `${info.dateStr}_${info.startTimeStr}_${item.doctor_id}_${item.role_label}`;
      if (this.state.sentShiftReminders[reminderKey]) continue;

      this.state.sentShiftReminders[reminderKey] = new Date().toISOString();
      try {
        localStorage.setItem('sent_shift_reminders', JSON.stringify(this.state.sentShiftReminders));
      } catch (e) {}

      await this.triggerNativeDeviceNotification(
        `🏥 Plantão em 1h (${item.start_time})`,
        `Dr(a). ${item.doctor_name}: Seu plantão (${item.role_label}) na Maternidade inicia às ${item.start_time}.`
      );

      this.showToast(`Lembrete de 1h (${item.start_time}): Dr(a). ${item.doctor_name}`, 'info');
    }
  },

  handleEvolutionLeitoChange(leito) {
    const data = this.getMaternityBedData(leito);
    const nomeEl = document.getElementById('evo-input-nome');
    const parEl = document.getElementById('evo-input-paridade');
    const riskEl = document.getElementById('evo-input-altorisco');
    const intEl = document.getElementById('evo-input-internacao');
    const obsEl = document.getElementById('evo-input-observacoes');

    if (nomeEl) nomeEl.value = data.nome || '';
    if (parEl) parEl.value = data.paridade || '';
    if (riskEl) riskEl.value = data.alto_risco || '';
    if (intEl) intEl.value = data.internacao_por || '';
    if (obsEl) obsEl.value = data.observacoes || '';

    this.closeParityWheel();
    this.parseParityToState(data.paridade || '');
    this.renderParityUI();

    this.toggleAltoRiscoDropdown(false);
    this.parseAltoRiscoToState(data.alto_risco || '');
    this.renderAltoRiscoUI();

    this.parseInternacaoToState(data.internacao_por || '');

    this.toggleEvolutionReminderBox(false);
    this.renderEvolutionActiveReminders(leito);
  },

  // =========================================================================
  // 2C. PARIDADE (G P C A E M DE 0 A 20 ESTILO ALARME • 0 OCULTA A LETRA)
  // =========================================================================
  parseParityToState(rawStr) {
    const letters = ['G', 'P', 'C', 'A', 'E', 'M'];
    const nextState = { G: 0, P: 0, C: 0, A: 0, E: 0, M: 0, activeLetter: null, extraText: '' };
    let str = String(rawStr || '').trim();

    if (str) {
      letters.forEach(L => {
        const regex = new RegExp(`\\b${L}\\s*(\\d{1,2})`, 'i');
        const compactRegex = new RegExp(`${L}(\\d{1,2})`, 'i');
        const m = str.match(regex) || str.match(compactRegex);
        if (m) {
          const val = Math.min(20, Math.max(0, parseInt(m[1], 10)));
          nextState[L] = isNaN(val) ? 0 : val;
        }
      });

      // Preserva qualquer complemento adicional que o médico tenha escrito na planilha (ex: "IG 39s", "38s2d")
      let remainder = str
        .replace(/\b[GPCAEM]\s*\d{1,2}\b/gi, '')
        .replace(/[GPCAEM]\d{1,2}/gi, '')
        .replace(/^[\s•,;/\-]+|[\s•,;/\-]+$/g, '')
        .trim();
      nextState.extraText = remainder;
    }

    this.state.evoParity = nextState;
  },

  buildParityStringFromState() {
    const p = this.state.evoParity || { G: 0, P: 0, C: 0, A: 0, E: 0, M: 0, extraText: '' };
    const letters = ['G', 'P', 'C', 'A', 'E', 'M'];
    const activeTokens = [];

    letters.forEach(L => {
      const num = Number(p[L] || 0);
      // Ao selecionar 0, a letra desaparece (não gera P0, A0, E0, M0)
      if (num > 0) {
        activeTokens.push(`${L}${num}`);
      }
    });

    const base = activeTokens.join(' ');
    if (p.extraText && p.extraText.trim() !== '') {
      return base ? `${base} • ${p.extraText.trim()}` : p.extraText.trim();
    }
    return base;
  },

  renderParityUI() {
    const p = this.state.evoParity || { G: 0, P: 0, C: 0, A: 0, E: 0, M: 0 };
    const letters = ['G', 'P', 'C', 'A', 'E', 'M'];

    letters.forEach(L => {
      const val = Number(p[L] || 0);
      const valEl = document.getElementById(`val-parity-${L}`);
      const btnEl = document.getElementById(`btn-parity-${L}`);
      const isWheelOpen = p.activeLetter === L;

      if (valEl) {
        valEl.textContent = val > 0 ? `${L}${val}` : '0';
        valEl.className = val > 0
          ? 'text-base sm:text-sm font-extrabold text-scred-700'
          : 'text-base sm:text-sm font-bold text-slate-300';
      }
      if (btnEl) {
        if (isWheelOpen) {
          btnEl.className = 'flex flex-col items-center justify-center py-3 sm:py-2.5 px-2 min-h-[56px] sm:min-h-[48px] rounded-2xl border-2 border-scred-600 bg-scred-50/70 shadow-xs transition';
        } else if (val > 0) {
          btnEl.className = 'flex flex-col items-center justify-center py-3 sm:py-2.5 px-2 min-h-[56px] sm:min-h-[48px] rounded-2xl border-2 border-brand-600 bg-brand-50/60 transition';
        } else {
          btnEl.className = 'flex flex-col items-center justify-center py-3 sm:py-2.5 px-2 min-h-[56px] sm:min-h-[48px] rounded-2xl border border-m3-outlineVariant bg-white hover:border-brand-500 transition opacity-80';
        }
      }
    });

    const formatted = this.buildParityStringFromState();
    const badgeEl = document.getElementById('evo-parity-preview-badge');
    if (badgeEl) {
      badgeEl.textContent = formatted || 'Nenhuma letra ativa';
    }
  },

  openParityWheel(letter) {
    if (!this.state.evoParity) {
      this.state.evoParity = { G: 0, P: 0, C: 0, A: 0, E: 0, M: 0, activeLetter: null, extraText: '' };
    }
    if (this.state.evoParity.activeLetter === letter) {
      this.closeParityWheel();
      return;
    }

    this.state.evoParity.activeLetter = letter;
    this.renderParityUI();

    const popover = document.getElementById('evo-parity-wheel-popover');
    const titleEl = document.getElementById('evo-parity-wheel-title');
    const listEl = document.getElementById('evo-parity-wheel-list');
    if (!popover || !listEl) return;

    const labelsMap = {
      G: 'G (Gestações)',
      P: 'P (Partos)',
      C: 'C (Cesáreas)',
      A: 'A (Abortos)',
      E: 'E (Ectópicas)',
      M: 'M (Mola / Gemelar)'
    };
    if (titleEl) {
      titleEl.textContent = `Selecionar ${labelsMap[letter] || letter} (0 oculta a letra)`;
    }

    const currentVal = Number(this.state.evoParity[letter] || 0);
    let itemsHtml = '';
    for (let n = 0; n <= 20; n++) {
      const isSelected = n === currentVal;
      const labelText = n === 0
        ? `0 — Ocultar letra ${letter}`
        : `${letter}${n}`;
      itemsHtml += `
        <button type="button" id="parity-wheel-opt-${n}" onclick="app.selectParityNumber('${letter}', ${n})"
                class="alarm-wheel-item w-full py-3 sm:py-2.5 px-4 min-h-[46px] rounded-xl text-center font-extrabold text-sm flex items-center justify-between transition ${
                  isSelected
                    ? 'bg-scred-600 text-white shadow-xs'
                    : 'bg-m3-containerLow/70 hover:bg-brand-50 text-brand-950'
                }">
          <span>${labelText}</span>
          ${isSelected ? '<span class="text-[11px] uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">Selecionado</span>' : ''}
        </button>
      `;
    }

    listEl.innerHTML = itemsHtml;
    popover.classList.remove('hidden');

    requestAnimationFrame(() => {
      const selectedBtn = document.getElementById(`parity-wheel-opt-${currentVal}`);
      if (selectedBtn) {
        selectedBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    });
  },

  closeParityWheel() {
    if (this.state.evoParity) {
      this.state.evoParity.activeLetter = null;
    }
    const popover = document.getElementById('evo-parity-wheel-popover');
    if (popover) popover.classList.add('hidden');
    this.renderParityUI();
  },

  selectParityNumber(letter, num) {
    if (!this.state.evoParity) {
      this.state.evoParity = { G: 0, P: 0, C: 0, A: 0, E: 0, M: 0, activeLetter: null, extraText: '' };
    }
    this.state.evoParity[letter] = Math.min(20, Math.max(0, Number(num || 0)));
    const formatted = this.buildParityStringFromState();
    const parEl = document.getElementById('evo-input-paridade');
    if (parEl) parEl.value = formatted;

    this.closeParityWheel();
  },

  handleManualParityInput(val) {
    this.parseParityToState(val);
    this.renderParityUI();
  },

  // =========================================================================
  // 2D. ALTO RISCO (COMORBIDADES PRÉ-DEFINIDAS + MÚLTIPLA ESCOLHA + OUTROS)
  // =========================================================================
  parseAltoRiscoToState(rawStr) {
    const str = String(rawStr || '').trim();
    if (!str) {
      this.state.evoAltoRiscoSelected = [];
      this.state.evoAltoRiscoOutros = '';
      return;
    }

    const tokens = str.split(/[,;+/\n]+/).map(s => s.trim()).filter(Boolean);
    const selected = new Set();
    const unmatched = [];

    tokens.forEach(tok => {
      const u = tok.toUpperCase();
      if (['NÃO', 'NAO', 'N', 'HABITUAL', 'RISCO HABITUAL', 'BAIXO'].includes(u)) {
        selected.add('NÃO');
      } else if (u === 'DMG' || u.includes('DIABETES GEST')) {
        selected.add('DMG');
      } else if (u.includes('DM1') || u.includes('DM2') || u === 'DM') {
        selected.add('DM1/DM2');
      } else if (u === 'HAC' || u.includes('HIPERTENS')) {
        selected.add('HAC');
      } else if (u.includes('DHEG') || u.includes('PE') || u.includes('ECLÂMPSIA') || u.includes('ECLAMPSIA')) {
        selected.add('DHEG/PE');
      } else if (u.includes('HIPOTIREOID')) {
        selected.add('HIPOTIREOIDISMO');
      } else if (u.includes('OBESIDADE') || u.includes('IMC')) {
        selected.add('OBESIDADE');
      } else if (u.includes('ITERATIV')) {
        selected.add('ITERATIVIDADE');
      } else if (u.includes('TPP') || u.includes('PREMATUR') || u.includes('IIC')) {
        selected.add('TPP');
      } else if (u.includes('RPMO') || u.includes('BOLSA ROTA') || u.includes('AMNIORREXE')) {
        selected.add('RPMO');
      } else if (u.includes('ITU') || u.includes('PIELONEFRITE')) {
        selected.add('ITU');
      } else if (u.includes('RCIU') || u.includes('CIUR') || u.includes('RESTRI')) {
        selected.add('RCIU');
      } else if (u.includes('OLIGODR') || u.includes('POLIDR')) {
        selected.add('OLIGODRAMNIA');
      } else if (u.includes('GEMELAR')) {
        selected.add('GEMELAR');
      } else if (u.includes('IDADE') || u.includes('35')) {
        selected.add('IDADE >= 35A');
      } else if (u.includes('TROMBO') || u.includes('SAF') || u.includes('SAAF')) {
        selected.add('TROMBOFILIA');
      } else if (u.includes('ALOIMUN') || u.includes('RH')) {
        selected.add('ALOIMUNIZAÇÃO RH');
      } else if (u.includes('CARDIO') || u.includes('NEFRO')) {
        selected.add('CARDIOPATIA');
      } else if (u.includes('TABAG') || u.includes('DROG')) {
        selected.add('TABAGISMO');
      } else {
        unmatched.push(tok);
      }
    });

    if (unmatched.length > 0) {
      selected.delete('NÃO');
      selected.add('OUTROS');
      this.state.evoAltoRiscoOutros = unmatched.join(', ');
    } else {
      this.state.evoAltoRiscoOutros = '';
    }

    this.state.evoAltoRiscoSelected = Array.from(selected);
  },

  renderAltoRiscoUI() {
    const listEl = document.getElementById('evo-altorisco-options-list');
    const summaryEl = document.getElementById('evo-altorisco-summary');
    const outrosBox = document.getElementById('evo-altorisco-outros-box');
    const outrosInput = document.getElementById('evo-input-altorisco-outros');
    const hiddenInput = document.getElementById('evo-input-altorisco');

    const selected = this.state.evoAltoRiscoSelected || [];
    const hasOutros = selected.includes('OUTROS');

    if (listEl) {
      listEl.innerHTML = ALTO_RISCO_PRESET_LIST.map(item => {
        const isChecked = selected.includes(item.code);
        const safeCode = item.code.replace(/'/g, "\\'");
        return `
          <button type="button" onclick="app.toggleAltoRiscoItem('${safeCode}')"
                  class="flex items-center justify-between gap-2.5 px-3.5 py-3 sm:py-2.5 min-h-[48px] sm:min-h-[40px] rounded-xl text-left text-sm sm:text-xs font-bold transition ${
                    isChecked
                      ? item.isHabitual
                        ? 'bg-brand-700 text-white shadow-2xs'
                        : 'bg-scred-600 text-white shadow-2xs'
                      : 'bg-m3-containerLow/70 hover:bg-brand-50 text-brand-950'
                  }">
            <span class="truncate">${this.escapeHtml(item.label)}</span>
            <span class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-xs ${
              isChecked ? 'border-white bg-white/20 text-white' : 'border-slate-300 bg-white'
            }">
              ${isChecked ? '✓' : ''}
            </span>
          </button>
        `;
      }).join('');
    }

    if (outrosBox) {
      outrosBox.classList.toggle('hidden', !hasOutros);
    }
    if (outrosInput && outrosInput.value !== (this.state.evoAltoRiscoOutros || '')) {
      outrosInput.value = this.state.evoAltoRiscoOutros || '';
    }

    const finalParts = [];
    selected.forEach(code => {
      if (code === 'OUTROS') {
        const customTxt = (outrosInput ? outrosInput.value : this.state.evoAltoRiscoOutros || '').trim();
        if (customTxt) finalParts.push(customTxt);
      } else {
        finalParts.push(code);
      }
    });

    const finalStr = finalParts.join(' + ');
    if (hiddenInput) hiddenInput.value = finalStr;
    if (summaryEl) {
      summaryEl.textContent = finalStr || 'Selecionar comorbidades...';
      summaryEl.className = finalStr
        ? (selected.includes('NÃO') ? 'text-xs sm:text-sm font-extrabold text-brand-800 truncate' : 'text-xs sm:text-sm font-extrabold text-scred-700 truncate')
        : 'text-xs sm:text-sm font-semibold text-slate-400 truncate';
    }
  },

  toggleAltoRiscoDropdown(forceState = null) {
    const drop = document.getElementById('evo-altorisco-dropdown');
    const chev = document.getElementById('evo-altorisco-chevron');
    if (!drop) return;

    const shouldShow = forceState !== null ? forceState : drop.classList.contains('hidden');
    drop.classList.toggle('hidden', !shouldShow);
    if (chev) {
      chev.style.transform = shouldShow ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  },

  toggleAltoRiscoItem(code) {
    let selected = new Set(this.state.evoAltoRiscoSelected || []);
    if (code === 'NÃO') {
      if (selected.has('NÃO')) {
        selected.delete('NÃO');
      } else {
        selected.clear();
        selected.add('NÃO');
      }
    } else {
      selected.delete('NÃO');
      if (selected.has(code)) {
        selected.delete(code);
      } else {
        selected.add(code);
      }
    }

    this.state.evoAltoRiscoSelected = Array.from(selected);
    this.renderAltoRiscoUI();
  },

  updateAltoRiscoFromUI() {
    const outrosInput = document.getElementById('evo-input-altorisco-outros');
    this.state.evoAltoRiscoOutros = outrosInput ? outrosInput.value : '';
    this.renderAltoRiscoUI();
  },

  // =========================================================================
  // 2E. INTERNAÇÃO POR (PN, PN+DIU, CST, CST+DIU, CST+LTB, TRATAMENTO CLÍNICO
  //     + DATA/HORA DO NASCIMENTO + CONVERSÃO BIDIRECIONAL COM GOOGLE SHEETS)
  // =========================================================================
  parseInternacaoToState(rawStr) {
    const str = String(rawStr || '').trim();
    const upper = str.toUpperCase();

    let matchedOpt = '';
    if (
      upper.includes('CST+LTB') || upper.includes('CST + LTB') ||
      ((upper.includes('CESAREA') || upper.includes('CESÁREA') || upper.includes('CST') || upper.includes('PC')) &&
       (upper.includes('LTB') || upper.includes('LAQUEADURA')))
    ) {
      matchedOpt = 'CST+LTB';
    } else if (
      upper.includes('CST+DIU') || upper.includes('CST + DIU') ||
      ((upper.includes('CESAREA') || upper.includes('CESÁREA') || upper.includes('CST') || upper.includes('PC')) && upper.includes('DIU'))
    ) {
      matchedOpt = 'CST+DIU';
    } else if (
      upper.includes('PN+DIU') || upper.includes('PN + DIU') ||
      ((upper.includes('PARTO NORMAL') || upper.includes('PN') || upper.includes('PARTO VAGINAL')) && upper.includes('DIU'))
    ) {
      matchedOpt = 'PN+DIU';
    } else if (
      upper.startsWith('CST') || upper === 'PC' || upper.includes('CESÁREA') || upper.includes('CESAREA') || upper.includes('CESARIANA')
    ) {
      matchedOpt = 'CST';
    } else if (
      upper.startsWith('PN') || upper.includes('PARTO NORMAL') || upper.includes('PARTO VAGINAL')
    ) {
      matchedOpt = 'PN';
    } else if (
      upper.includes('TRATAMENTO CLÍNICO') || upper.includes('TRATAMENTO CLINICO') || upper.includes('TTO CLÍNICO') || upper.includes('TTO CLINICO')
    ) {
      matchedOpt = 'TRATAMENTO CLÍNICO';
    }

    this.state.evoInternacaoSelected = matchedOpt;

    // Extrai data (DD/MM ou DD/MM/AAAA) e hora (HH:MM ou HHhMM) se o médico digitou na planilha
    const dateInput = document.getElementById('evo-birth-date');
    const timeInput = document.getElementById('evo-birth-time');

    if (dateInput) {
      const dMatch = str.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (dMatch) {
        const day = String(dMatch[1]).padStart(2, '0');
        const month = String(dMatch[2]).padStart(2, '0');
        let year = dMatch[3] ? String(dMatch[3]) : (this.state.currentMonth ? this.state.currentMonth.slice(0, 4) : '2026');
        if (year.length === 2) year = `20${year}`;
        dateInput.value = `${year}-${month}-${day}`;
      } else {
        dateInput.value = '';
      }
    }

    if (timeInput) {
      const tMatch = str.match(/\b(\d{1,2})\s*(?::|h|H)\s*(\d{2})\b/) || str.match(/\b(?:às|as|ÀS|AS)\s*(\d{1,2})[hH]\b/);
      if (tMatch) {
        const hh = String(Math.min(23, parseInt(tMatch[1], 10))).padStart(2, '0');
        const mm = String(Math.min(59, parseInt(tMatch[2] || '0', 10))).padStart(2, '0');
        timeInput.value = `${hh}:${mm}`;
      } else {
        timeInput.value = '';
      }
    }

    this.renderInternacaoControlsUI();
  },

  renderInternacaoControlsUI() {
    const selectedOpt = this.state.evoInternacaoSelected || '';
    const isDelivery = INTERNACAO_DELIVERY_TYPES.includes(selectedOpt);

    document.querySelectorAll('.evo-int-btn').forEach(btn => {
      const opt = btn.getAttribute('data-int-opt');
      const isClinico = opt === 'TRATAMENTO CLÍNICO';
      const fontClass = isClinico ? 'text-xs' : 'text-sm sm:text-xs';
      if (opt === selectedOpt) {
        btn.className = `evo-int-btn py-3 sm:py-2.5 px-2.5 min-h-[46px] rounded-xl border-2 border-scred-600 bg-scred-600 text-white ${fontClass} font-extrabold shadow-xs transition flex items-center justify-center text-center leading-tight`;
      } else {
        btn.className = `evo-int-btn py-3 sm:py-2.5 px-2.5 min-h-[46px] rounded-xl border border-m3-outlineVariant bg-white ${fontClass} font-extrabold text-brand-950 hover:bg-brand-50 transition flex items-center justify-center text-center leading-tight`;
      }
    });

    const birthBox = document.getElementById('evo-birth-datetime-box');
    if (birthBox) {
      birthBox.classList.toggle('hidden', !isDelivery);
    }
  },

  selectInternacaoOption(opt) {
    this.state.evoInternacaoSelected = opt;
    if (INTERNACAO_DELIVERY_TYPES.includes(opt)) {
      const dateInput = document.getElementById('evo-birth-date');
      const timeInput = document.getElementById('evo-birth-time');
      const now = new Date();
      if (dateInput && !dateInput.value) {
        dateInput.value = now.toISOString().slice(0, 10);
      }
      if (timeInput && !timeInput.value) {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        timeInput.value = `${hh}:${mm}`;
      }
    }
    this.renderInternacaoControlsUI();
    this.syncInternacaoTextFromControls();
  },

  syncInternacaoTextFromControls() {
    const opt = this.state.evoInternacaoSelected;
    if (!opt) return;

    const intEl = document.getElementById('evo-input-internacao');
    const dateInput = document.getElementById('evo-birth-date');
    const timeInput = document.getElementById('evo-birth-time');

    if (INTERNACAO_DELIVERY_TYPES.includes(opt)) {
      const dVal = dateInput ? dateInput.value : '';
      const tVal = timeInput ? timeInput.value : '';
      let birthInfo = '';
      if (dVal) {
        const [, m, d] = dVal.split('-');
        birthInfo = `${d}/${m}`;
      }
      if (tVal) {
        birthInfo = birthInfo ? `${birthInfo} às ${tVal}` : `às ${tVal}`;
      }
      if (intEl) {
        intEl.value = birthInfo ? `${opt} (${birthInfo})` : opt;
      }
    } else {
      if (intEl) {
        intEl.value = opt;
      }
    }
  },

  handleManualInternacaoInput(val) {
    this.parseInternacaoToState(val);
  },

  // =========================================================================
  // 2F. LEMBRETE CLÍNICO EM OBSERVAÇÕES (ENVIO WHATSAPP AO MÉDICO DE PLANTÃO)
  // =========================================================================
  toggleEvolutionReminderBox(forceState = null) {
    const box = document.getElementById('evo-reminder-box');
    if (!box) return;
    const shouldShow = forceState !== null ? forceState : box.classList.contains('hidden');
    box.classList.toggle('hidden', !shouldShow);

    const infoText = document.getElementById('evo-reminder-info-text');
    if (infoText && !shouldShow) {
      infoText.classList.add('hidden');
    }

    if (shouldShow) {
      const dateInput = document.getElementById('evo-reminder-date-input');
      const timeInput = document.getElementById('evo-reminder-time-input');
      const nextHour = new Date(Date.now() + 3600000);
      if (dateInput && !dateInput.value) {
        dateInput.value = nextHour.toISOString().slice(0, 10);
      }
      if (timeInput && !timeInput.value) {
        const hh = String(nextHour.getHours()).padStart(2, '0');
        const mm = String(nextHour.getMinutes()).padStart(2, '0');
        timeInput.value = `${hh}:${mm}`;
      }
      this.updateReminderDoctorPreview();
      if (window.lucide) lucide.createIcons();
    }
  },

  toggleEvolutionReminderInfo() {
    const infoEl = document.getElementById('evo-reminder-info-text');
    if (!infoEl) return;
    infoEl.classList.toggle('hidden');
  },

  getDoctorsOnCallAtTime(timeStr, dateStr = null) {
    const [hhStr] = String(timeStr || '12:00').split(':');
    const hour = parseInt(hhStr, 10);

    const now = new Date();
    const targetDateStr = dateStr || this.state.selectedDate || now.toISOString().slice(0, 10);

    // Determina quais turnos estão ativos naquele horário
    let activeTypes = [];
    if (hour >= 7 && hour < 13) {
      activeTypes = ['morning', 'routine'];
    } else if (hour >= 13 && hour < 19) {
      activeTypes = ['afternoon'];
    } else if (hour >= 19 && hour < 23) {
      activeTypes = ['evening', 'night'];
    } else {
      activeTypes = ['night'];
    }

    let matching = this.state.shifts.filter(s => s.date === targetDateStr && activeTypes.includes(s.shift_type));
    if (matching.length === 0 && this.state.selectedDate) {
      matching = this.state.shifts.filter(s => s.date === this.state.selectedDate && activeTypes.includes(s.shift_type));
    }

    const seenDocIds = new Set();
    const doctors = [];
    matching.forEach(s => {
      if (seenDocIds.has(String(s.doctor_id))) return;
      seenDocIds.add(String(s.doctor_id));
      const docObj = this.state.doctors.find(d => String(d.id) === String(s.doctor_id)) || {};
      doctors.push({
        id: s.doctor_id,
        name: docObj.name || s.doctor_name || 'Plantonista',
        phone: docObj.phone || s.doctor_phone || '',
        shift_type: s.shift_type
      });
    });

    return doctors;
  },

  updateReminderDoctorPreview() {
    const dateInput = document.getElementById('evo-reminder-date-input');
    const timeInput = document.getElementById('evo-reminder-time-input');
    const previewEl = document.getElementById('evo-reminder-target-doctor-preview');
    if (!previewEl) return;

    const dateVal = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().slice(0, 10);
    const timeVal = (timeInput && timeInput.value) ? timeInput.value : '12:00';
    const docs = this.getDoctorsOnCallAtTime(timeVal, dateVal);
    const shortDate = this.formatShortDate(dateVal);
    if (docs.length > 0) {
      previewEl.textContent = `Plantonista em ${shortDate} às ${timeVal}: ${docs.map(d => d.name).join(', ')}`;
    } else {
      previewEl.textContent = `Aviso agendado para o plantonista de ${shortDate} às ${timeVal}`;
    }
  },

  async addClinicalReminderToObservation() {
    const leitoSelect = document.getElementById('evo-select-leito');
    const textInput = document.getElementById('evo-reminder-text-input');
    const dateInput = document.getElementById('evo-reminder-date-input');
    const timeInput = document.getElementById('evo-reminder-time-input');
    const obsEl = document.getElementById('evo-input-observacoes');
    const nomeEl = document.getElementById('evo-input-nome');

    const leito = leitoSelect ? leitoSelect.value : 'PRÉ 1';
    const reminderText = (textInput ? textInput.value : '').trim();
    const reminderDate = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().slice(0, 10);
    const reminderTime = (timeInput ? timeInput.value : '').trim();

    if (!reminderText) {
      this.showToast('Digite o texto do lembrete (ex: Verificar pressão).', 'info');
      return;
    }
    if (!reminderTime) {
      this.showToast('Selecione o horário do lembrete.', 'info');
      return;
    }

    // Na tabela do Google Sheets fica APENAS o texto com o lembrete descrito
    if (obsEl) {
      const currentObs = obsEl.value.trim();
      if (!currentObs.toLowerCase().includes(reminderText.toLowerCase())) {
        obsEl.value = currentObs ? `${currentObs}\nLembrete: ${reminderText}` : `Lembrete: ${reminderText}`;
      }
    }

    const reminderObj = {
      id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      leito,
      patient_name: (nomeEl ? nomeEl.value : '').trim() || `Leito ${leito}`,
      text: reminderText,
      date: reminderDate,
      time: reminderTime,
      created_date: reminderDate,
      fired: false,
      created_at: new Date().toISOString()
    };

    if (!this.state.clinicalReminders) this.state.clinicalReminders = [];
    this.state.clinicalReminders.push(reminderObj);

    try {
      localStorage.setItem('maternity_clinical_reminders', JSON.stringify(this.state.clinicalReminders));
    } catch (e) {}

    if (this.state.firebaseActive && this.state.firestoreDb) {
      this.state.firestoreDb.collection('maternity_clinical_reminders').doc(reminderObj.id).set(reminderObj).catch(() => {});
    }

    if (textInput) textInput.value = '';
    this.toggleEvolutionReminderBox(false);
    this.renderEvolutionActiveReminders(leito);
    this.showToast(`Lembrete "${reminderText}" agendado para ${this.formatShortDate(reminderDate)} às ${reminderTime}!`, 'success');
  },

  removeClinicalReminder(reminderId) {
    const leitoSelect = document.getElementById('evo-select-leito');
    const leito = leitoSelect ? leitoSelect.value : 'PRÉ 1';

    this.state.clinicalReminders = (this.state.clinicalReminders || []).filter(r => r.id !== reminderId);
    try {
      localStorage.setItem('maternity_clinical_reminders', JSON.stringify(this.state.clinicalReminders));
    } catch (e) {}

    if (this.state.firebaseActive && this.state.firestoreDb) {
      this.state.firestoreDb.collection('maternity_clinical_reminders').doc(reminderId).delete().catch(() => {});
    }

    this.renderEvolutionActiveReminders(leito);
  },

  renderEvolutionActiveReminders(leito) {
    const container = document.getElementById('evo-active-reminders-pills');
    if (!container) return;

    const targetKey = this.normalizeLeitoKey(leito);
    const list = (this.state.clinicalReminders || []).filter(
      r => this.normalizeLeitoKey(r.leito) === targetKey && !r.fired
    );

    if (list.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = list.map(r => {
      const rDate = r.date || r.created_date || new Date().toISOString().slice(0, 10);
      const docs = this.getDoctorsOnCallAtTime(r.time, rDate);
      const docLabel = docs.length > 0 ? docs[0].name : 'Plantonista';
      const shortDate = this.formatShortDate(rDate);
      return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-scred-50 text-scred-800 border border-scred-200 text-xs font-extrabold">
          <i data-lucide="alarm-clock" class="w-3.5 h-3.5 text-scred-600 shrink-0"></i>
          <span>${shortDate} ${this.escapeHtml(r.time)} • ${this.escapeHtml(r.text)} (${this.escapeHtml(docLabel)})</span>
          <button type="button" onclick="app.downloadReminderICSById('${r.id}')" title="Salvar no Alarme/Calendário do Celular" class="text-brand-700 hover:text-brand-950 ml-0.5">📅</button>
          <button type="button" onclick="app.removeClinicalReminder('${r.id}')" title="Remover" class="hover:text-scred-950 ml-0.5">×</button>
        </span>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  async checkClinicalReminders() {
    const cfg = this.state.shiftReminderConfig || {};
    if (cfg.enabled === false || cfg.notify_clinical === false) return;

    const list = this.state.clinicalReminders || [];
    if (list.length === 0) return;

    const now = new Date();
    const curDateStr = now.toISOString().slice(0, 10);
    const curHH = String(now.getHours()).padStart(2, '0');
    const curMM = String(now.getMinutes()).padStart(2, '0');
    const curTimeStr = `${curHH}:${curMM}`;
    const myDocId = cfg.my_doctor_id || 'ALL';

    for (const rem of list) {
      if (rem.fired) continue;
      const remDate = rem.date || rem.created_date || curDateStr;
      if (remDate !== curDateStr) continue;
      if (rem.time !== curTimeStr) continue;

      const onCallDocs = this.getDoctorsOnCallAtTime(rem.time, remDate);
      // Se o médico selecionou seu nome neste aparelho, filtra para tocar se ele estiver no plantão (ou se não houver ninguém escalado no slot)
      if (myDocId !== 'ALL' && onCallDocs.length > 0) {
        const isOnCall = onCallDocs.some(d => String(d.id) === String(myDocId));
        if (!isOnCall) continue;
      }

      rem.fired = true;
      rem.fired_at = now.toISOString();
      try {
        localStorage.setItem('maternity_clinical_reminders', JSON.stringify(this.state.clinicalReminders));
      } catch (e) {}

      if (this.state.firebaseActive && this.state.firestoreDb) {
        this.state.firestoreDb.collection('maternity_clinical_reminders').doc(rem.id).set({
          fired: true,
          fired_at: rem.fired_at
        }, { merge: true }).catch(() => {});
      }

      const primaryDoc = onCallDocs[0] || { name: 'Plantonista em Turno', phone: '' };
      const allDocNames = onCallDocs.length > 0 ? onCallDocs.map(d => d.name).join(', ') : 'Médico(a) Plantonista';

      const msg = `Olá Dr(a). ${primaryDoc.name}, lembrete clínico agendado (${rem.time}) na Maternidade Santa Casa PG:\n• Leito ${rem.leito} (${rem.patient_name || 'Paciente'}): ${rem.text}`;

      // Dispara Notificação Nativa + Som no Aparelho do Médico
      await this.triggerNativeDeviceNotification(
        `⏰ Lembrete Leito ${rem.leito} (${rem.time})`,
        `${rem.patient_name || 'Paciente'}: ${rem.text} • Plantonista: ${allDocNames}`
      );

      // Exibe o alerta visual na tela do WebApp
      this.openClinicalReminderFiredModal(rem, allDocNames, primaryDoc.phone, msg);
    }
  },

  openClinicalReminderFiredModal(rem, docNames) {
    const modal = document.getElementById('modal-clinical-reminder-fired');
    const badgeEl = document.getElementById('fired-reminder-time-badge');
    const patientEl = document.getElementById('fired-reminder-patient-info');
    const textEl = document.getElementById('fired-reminder-text');
    const docEl = document.getElementById('fired-reminder-doctor-name');

    if (badgeEl) badgeEl.textContent = `Agendado para ${rem.time}`;
    if (patientEl) patientEl.textContent = `Leito ${rem.leito} • ${rem.patient_name || 'Paciente'}`;
    if (textEl) textEl.textContent = `Lembrete: ${rem.text}`;
    if (docEl) docEl.textContent = docNames;

    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeClinicalReminderFiredModal() {
    const modal = document.getElementById('modal-clinical-reminder-fired');
    if (modal) modal.classList.add('hidden');
  },

  async handleSaveMaternityEvolution(e) {
    e.preventDefault();
    const leito = document.getElementById('evo-select-leito').value;
    if (!leito) return;

    const existing = this.getMaternityBedData(leito);
    const key = this.normalizeLeitoKey(leito);
    const fbExisting = this.state.maternityFirebaseMap[key];
    const nowIso = new Date().toISOString();
    const nomeVal = (document.getElementById('evo-input-nome').value || '').trim();
    const parVal = (document.getElementById('evo-input-paridade').value || '').trim();
    const riskVal = (document.getElementById('evo-input-altorisco').value || '').trim();
    const intVal = (document.getElementById('evo-input-internacao').value || '').trim();
    const obsVal = (document.getElementById('evo-input-observacoes').value || '').trim();

    const samePatient = fbExisting && fbExisting.admitted_at &&
      (!existing.nome || existing.nome.trim().toLowerCase() === nomeVal.toLowerCase());

    const payload = {
      leito,
      nome: nomeVal,
      paridade: parVal,
      alto_risco: riskVal,
      internacao_por: intVal,
      observacoes: obsVal,
      admitted_at: samePatient ? fbExisting.admitted_at : nowIso,
      cleared_at: null,
      updated_at: nowIso
    };

    await this.upsertMaternityAdmissionRecord(payload, false);
    await this.saveMaternityBedRecord(payload, 'Evolução salva com sucesso!');
  },

  requestClearMaternityBed() {
    const select = document.getElementById('evo-select-leito');
    const leito = select ? select.value : '';
    if (!leito) return;

    const badge = document.getElementById('discharge-confirm-bed-label');
    const bedData = this.getMaternityBedData(leito);
    if (badge) {
      badge.textContent = bedData && bedData.nome
        ? `Leito ${leito} • ${bedData.nome}`
        : `Leito ${leito}`;
    }

    const modal = document.getElementById('modal-confirm-discharge');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeDischargeConfirmModal() {
    const modal = document.getElementById('modal-confirm-discharge');
    if (modal) modal.classList.add('hidden');
  },

  async confirmClearMaternityBed() {
    this.closeDischargeConfirmModal();
    await this.clearMaternityBed();
  },

  async clearMaternityBed() {
    const leito = document.getElementById('evo-select-leito').value;
    if (!leito) return;

    const currentBedData = this.getMaternityBedData(leito);
    const key = this.normalizeLeitoKey(leito);
    const fbExisting = this.state.maternityFirebaseMap[key];
    const nowIso = new Date().toISOString();

    if (currentBedData && (currentBedData.nome || currentBedData.internacao_por || currentBedData.observacoes)) {
      await this.upsertMaternityAdmissionRecord({
        ...currentBedData,
        leito,
        admitted_at: (fbExisting && fbExisting.admitted_at) ? fbExisting.admitted_at : null,
        discharged_at: nowIso,
        updated_at: nowIso
      }, true);
    }

    const payload = {
      leito,
      nome: '',
      paridade: '',
      alto_risco: '',
      internacao_por: '',
      observacoes: '',
      admitted_at: null,
      cleared_at: nowIso,
      updated_at: nowIso
    };

    await this.saveMaternityBedRecord(payload, `Alta confirmada — Leito ${leito} liberado!`);
  },

  async upsertMaternityAdmissionRecord(bedPayload, isDischarge = false) {
    try {
      const hasPatient = Boolean(bedPayload.nome || bedPayload.internacao_por || bedPayload.observacoes);
      if (!hasPatient) return;

      const now = new Date();
      const nowIso = now.toISOString();
      const monthStr = this.state.currentMonth || nowIso.slice(0, 7);
      const cleanName = (bedPayload.nome || bedPayload.internacao_por || 'paciente')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 24);
      const recordId = `${monthStr}_${this.leitoToDocId(bedPayload.leito)}_${cleanName}`;

      const existingIdx = this.state.maternityAdmissions.findIndex(r => r.id === recordId);
      const prevRec = existingIdx >= 0 ? this.state.maternityAdmissions[existingIdx] : null;

      const admittedAt = (prevRec && prevRec.admitted_at) || bedPayload.admitted_at || nowIso;
      const dischargedAt = isDischarge ? (bedPayload.discharged_at || nowIso) : ((prevRec && prevRec.discharged_at) || null);

      let stayHours = prevRec && prevRec.stay_hours ? prevRec.stay_hours : null;
      if (admittedAt && dischargedAt) {
        const diffMs = Math.max(0, new Date(dischargedAt).getTime() - new Date(admittedAt).getTime());
        stayHours = Math.max(1, Math.round((diffMs / 3600000) * 10) / 10);
      }

      const record = {
        id: recordId,
        month: monthStr,
        leito: bedPayload.leito,
        nome: bedPayload.nome || '',
        paridade: bedPayload.paridade || '',
        alto_risco: bedPayload.alto_risco || '',
        internacao_por: bedPayload.internacao_por || '',
        observacoes: bedPayload.observacoes || '',
        admitted_at: admittedAt,
        discharged_at: dischargedAt,
        stay_hours: stayHours,
        status: isDischarge ? 'discharged' : 'active',
        updated_at: nowIso
      };

      if (existingIdx >= 0) {
        this.state.maternityAdmissions[existingIdx] = record;
      } else {
        this.state.maternityAdmissions.push(record);
      }

      try {
        localStorage.setItem('maternity_admissions_cache', JSON.stringify(this.state.maternityAdmissions));
      } catch (e) {}

      if (this.state.firebaseActive && this.state.firestoreDb) {
        await this.state.firestoreDb.collection('maternity_admissions').doc(recordId).set(record, { merge: true });
      }
    } catch (e) {
      console.warn('Aviso ao registrar histórico mensal da maternidade:', e);
    }
  },

  async saveMaternityBedRecord(payload, successMsg) {
    const key = this.normalizeLeitoKey(payload.leito);
    this.state.maternityFirebaseMap[key] = { ...payload };
    this.renderMaternityView();
    this.populateEvolutionLeitoSelect(payload.leito);
    if (this.state.currentView === 'stats') {
      const picker = document.getElementById('stats-month-picker');
      this.renderPatientStats((picker && picker.value) ? picker.value : this.state.currentMonth);
    }

    try {
      if (this.state.firebaseActive && this.state.firestoreDb) {
        const docId = this.leitoToDocId(payload.leito);
        await this.state.firestoreDb.collection('maternity_patients').doc(docId).set(payload);
      }

      // Envia atualização para a planilha do Google Docs
      await this.pushMaternityRowToGoogleSheet(payload);

      this.closeMaternityEvolutionModal();
      this.showToast(successMsg, 'success');
    } catch (err) {
      this.showToast('Erro ao salvar evolução: ' + err.message, 'error');
    }
  },

  async pushMaternityRowToGoogleSheet(payload) {
    const webhookUrl = (this.state.maternityWebhookUrl || localStorage.getItem('maternity_sheet_webhook') || '').trim();
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Aviso ao enviar para o conector Google Sheets:', e);
    }
  },

  openMaternitySyncConfigModal() {
    const modal = document.getElementById('modal-maternity-sync-config');
    const input = document.getElementById('maternity-webhook-input');
    if (input) {
      input.value = this.state.maternityWebhookUrl || localStorage.getItem('maternity_sheet_webhook') || '';
    }
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeMaternitySyncConfigModal() {
    const modal = document.getElementById('modal-maternity-sync-config');
    if (modal) modal.classList.add('hidden');
  },

  async saveMaternityWebhookUrl() {
    const input = document.getElementById('maternity-webhook-input');
    const url = input ? input.value.trim() : '';
    this.state.maternityWebhookUrl = url;
    localStorage.setItem('maternity_sheet_webhook', url);

    if (this.state.firebaseActive && this.state.firestoreDb) {
      try {
        await this.state.firestoreDb.collection('settings').doc('maternity_sheet_sync').set({
          webhook_url: url,
          updated_at: new Date().toISOString()
        }, { merge: true });
      } catch (e) {}
    }

    this.closeMaternitySyncConfigModal();
    this.showToast('Conector Google Sheets salvo para todos os dispositivos!', 'success');
  },

  copyAppsScriptSnippet() {
    const pre = document.getElementById('apps-script-snippet');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent || '').then(() => {
      this.showToast('Código Apps Script copiado!', 'success');
    }).catch(() => {
      this.showToast('Selecione e copie o código manualmente.', 'info');
    });
  },

  renderAvatar(photoUrl) {
    if (photoUrl && photoUrl.trim() !== '') {
      return `<img src="${photoUrl}" alt="Foto" class="w-full h-full object-cover">`;
    }
    return SILHOUETTE_SVG;
  },

  formatSpecialty(spec) {
    const valid = ['GO', 'Pediatra', 'Anestesista'];
    return valid.includes(spec) ? spec : 'GO';
  },

  // ================= 3. RENDER: CORPO CLÍNICO =================
  renderDoctorsCatalog() {
    const grid = document.getElementById('doctors-catalog-grid');
    if (!grid) return;

    let filtered = this.state.doctors;
    if (this.state.doctorFilter) {
      const q = this.state.doctorFilter.toLowerCase();
      filtered = filtered.filter(d => d.name && d.name.toLowerCase().includes(q));
    }

    const cfg = this.state.shiftReminderConfig || {};
    const activeNotifyDocId = cfg.enabled !== false ? String(cfg.my_doctor_id || '') : '';

    grid.innerHTML = filtered.map(doc => {
      const phoneDisplay = doc.phone && doc.phone.trim() !== '' ? doc.phone : 'Não cadastrado';
      const hasPhone = Boolean(doc.phone && doc.phone.trim() !== '');
      const isReceivingNotif = activeNotifyDocId === String(doc.id);

      return `
        <div class="m3-card m3-card-interactive p-5 flex flex-col justify-between ${isReceivingNotif ? 'ring-2 ring-scred-500' : ''}">
          <div>
            <div class="flex items-center gap-3.5 mb-3 cursor-pointer" onclick="app.openDoctorProfileById('${doc.id}')">
              <div class="w-16 h-16 rounded-2xl overflow-hidden border-2 border-brand-100 shadow-xs bg-brand-50 shrink-0 flex items-center justify-center">
                ${this.renderAvatar(doc.photo_url)}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h4 class="font-extrabold text-brand-950 text-base leading-snug truncate hover:text-brand-700">
                    ${doc.name}
                  </h4>
                  ${isReceivingNotif ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-scred-600 text-white whitespace-nowrap">🔔 Notificando</span>` : ''}
                </div>
                <p class="text-xs text-slate-400 font-medium">${doc.crm ? `CRM ${doc.crm}` : 'CRM não cadastrado'}</p>
                <span class="inline-block mt-1 text-[11px] font-bold text-brand-800 bg-brand-100 px-2.5 py-0.5 rounded-full">
                  ${this.formatSpecialty(doc.specialty)}
                </span>
              </div>
            </div>

            <div class="bg-m3-containerLow rounded-2xl p-3 my-3 flex items-center justify-between text-xs cursor-pointer" onclick="app.openDoctorProfileById('${doc.id}')">
              <span class="text-slate-500 font-bold">Telefone:</span>
              <span class="font-mono ${hasPhone ? 'text-brand-950 font-extrabold' : 'text-slate-400 italic font-medium'}">${phoneDisplay}</span>
            </div>
          </div>

          <div class="space-y-2 pt-1">
            <button type="button" onclick="app.openDoctorProfileById('${doc.id}')"
                    class="w-full py-2 px-3 rounded-xl ${isReceivingNotif ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-scred-50 hover:bg-scred-100 text-scred-700 border border-scred-200'} text-xs font-extrabold flex items-center justify-center gap-1.5 transition">
              <i data-lucide="${isReceivingNotif ? 'bell-ring' : 'bell-plus'}" class="w-3.5 h-3.5 shrink-0"></i>
              <span>${isReceivingNotif ? 'Recebendo notificações ✓' : 'Receber notificações'}</span>
            </button>

            <div class="flex items-center gap-2">
              ${hasPhone ? `
                <a href="tel:${this.cleanPhone(doc.phone)}" 
                   class="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold shadow transition">
                  <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                  <span>Ligar</span>
                </a>
                <a href="https://wa.me/55${this.cleanPhone(doc.phone)}" target="_blank"
                   class="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                  <span>WhatsApp</span>
                </a>
              ` : `
                <span class="flex-1 text-center text-xs text-slate-400 italic py-2 bg-m3-containerLow rounded-full">
                  Telefone não cadastrado
                </span>
              `}
              ${this.state.isEditorMode ? `
                <button onclick="app.openDoctorModal('${doc.id}')" title="Editar Profissional"
                        class="w-9 h-9 flex items-center justify-center text-brand-700 hover:bg-brand-100 rounded-full border border-brand-200 transition shrink-0">
                  <i data-lucide="edit-3" class="w-4 h-4"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  filterDoctors(val) {
    this.state.doctorFilter = val;
    this.renderDoctorsCatalog();
  },

  // ================= 4. RENDER: FECHAMENTO DE HORAS & INDICADORES =================
  toggleStatsSection(section) {
    if (!this.state.statsCollapsed) {
      this.state.statsCollapsed = { professionals: false, patients: false };
    }
    const nextState = !this.state.statsCollapsed[section];
    this.state.statsCollapsed[section] = nextState;

    const bodyEl = document.getElementById(`body-stats-${section}`);
    const chevronEl = document.getElementById(`chevron-stats-${section}`);
    const btnEl = document.getElementById(`btn-collapse-${section}`);

    if (bodyEl) {
      bodyEl.classList.toggle('hidden', nextState);
    }
    if (chevronEl) {
      chevronEl.style.transform = nextState ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
    if (btnEl) {
      btnEl.setAttribute('aria-expanded', String(!nextState));
    }

    if (!nextState && section === 'professionals') {
      requestAnimationFrame(() => {
        const statsViewport = document.getElementById('stats-scroll-viewport');
        if (statsViewport) {
          this.updateScrollProgressBar(statsViewport, 'stats-scroll-bar', 'stats-scroll-pct');
        }
      });
    }
  },

  async loadStats(monthStr) {
    try {
      this.ensureStatsMonthOption(monthStr);
      const stats = this.state.doctors.map(doc => {
        const docShifts = this.state.shifts.filter(s => String(s.doctor_id) === String(doc.id) && s.date.startsWith(monthStr));
        const turnos_6h = docShifts.filter(s => s.shift_type === 'morning' || s.shift_type === 'afternoon').length;
        const plantoes_12h = docShifts.filter(s => s.shift_type === 'night').length;
        const rotinas_6h = docShifts.filter(s => s.shift_type === 'routine').length;
        const reforcos_4h = docShifts.filter(s => s.shift_type === 'evening').length;
        const total_horas = (turnos_6h * 6) + (plantoes_12h * 12) + (rotinas_6h * 6) + (reforcos_4h * 4);

        return {
          id: doc.id,
          name: doc.name,
          phone: doc.phone,
          photo_url: doc.photo_url,
          turnos_6h,
          plantoes_12h,
          rotinas_6h,
          reforcos_4h,
          total_horas
        };
      });

      stats.sort((a, b) => b.total_horas - a.total_horas);

      const tbody = document.getElementById('stats-table-body');
      if (tbody) {
        tbody.innerHTML = stats.map(row => {
          return `
            <tr class="hover:bg-m3-containerLow/60 transition group">
              <td onclick="app.openDoctorProfileById('${row.id}')" title="Ver dados de ${row.name}"
                  class="sticky-stats-col bg-white group-hover:bg-[#F0F2FA] px-3 sm:px-4 py-3 font-extrabold text-brand-950 border-r border-b border-m3-outlineVariant/50 cursor-pointer">
                <div class="flex items-center gap-2.5 whitespace-nowrap">
                  <div class="w-8 h-8 rounded-xl overflow-hidden border border-brand-200 bg-brand-50 flex items-center justify-center shrink-0">
                    ${this.renderAvatar(row.photo_url)}
                  </div>
                  <span class="truncate hover:text-brand-700 hover:underline transition">${row.name}</span>
                </div>
              </td>
              <td class="stats-data-col px-2.5 sm:px-3.5 py-3 border-b border-r border-m3-outlineVariant/30 text-center font-bold text-brand-700">${row.turnos_6h || 0}</td>
              <td class="stats-data-col px-2.5 sm:px-3.5 py-3 border-b border-r border-m3-outlineVariant/30 text-center font-bold text-amber-700">${row.plantoes_12h || 0}</td>
              <td class="stats-data-col px-2.5 sm:px-3.5 py-3 border-b border-r border-m3-outlineVariant/30 text-center font-bold text-sky-700">${row.rotinas_6h || 0}</td>
              <td class="stats-data-col px-2.5 sm:px-3.5 py-3 border-b border-r border-m3-outlineVariant/30 text-center font-bold text-scred-600">${row.reforcos_4h || 0}</td>
              <td class="stats-data-col px-4 py-3 border-b border-m3-outlineVariant/30 text-right font-extrabold text-brand-950 text-sm">${row.total_horas || 0}h</td>
            </tr>
          `;
        }).join('');
      }

      this.renderPatientStats(monthStr);

      requestAnimationFrame(() => {
        const statsViewport = document.getElementById('stats-scroll-viewport');
        if (statsViewport) {
          this.updateScrollProgressBar(statsViewport, 'stats-scroll-bar', 'stats-scroll-pct');
        }
      });
    } catch (e) {
      console.error('Erro ao calcular estatísticas:', e);
    }
  },

  estimateStayHoursFromRecord(rec) {
    if (rec.stay_hours && Number(rec.stay_hours) > 0) {
      return Number(rec.stay_hours);
    }

    const text = `${rec.internacao_por || ''} ${rec.observacoes || ''}`.toUpperCase();

    // Detecta padrões clínicos como "2º DIH", "D2", "3 DPO", "48H", "24H"
    const dihMatch = text.match(/(\d+)\s*(?:º|O|°)?\s*(?:DIH|DPO|DIA|DIAS)\b/) || text.match(/\bD(\d)\b/);
    if (dihMatch && Number(dihMatch[1]) > 0 && Number(dihMatch[1]) <= 30) {
      return Number(dihMatch[1]) * 24;
    }
    const hoursMatch = text.match(/\b(\d{1,3})\s*H(?:ORAS|S)?\b/);
    if (hoursMatch && Number(hoursMatch[1]) >= 2 && Number(hoursMatch[1]) <= 240) {
      return Number(hoursMatch[1]);
    }

    if (rec.admitted_at) {
      const startMs = new Date(rec.admitted_at).getTime();
      const endMs = rec.discharged_at ? new Date(rec.discharged_at).getTime() : Date.now();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        const diffH = (endMs - startMs) / 3600000;
        if (diffH >= 1) return Math.round(diffH * 10) / 10;
      }
    }

    // Estimativa clínica padrão por setor/motivo quando já constava na planilha sem carimbo de hora
    const leitoUpper = String(rec.leito || '').toUpperCase();
    if (leitoUpper.startsWith('PRÉ') || leitoUpper.startsWith('OBS')) return 14;
    if (text.includes('CESAREA') || text.includes('CESÁREA') || text.includes('PC')) return 48;
    if (text.includes('PARTO NORMAL') || text.includes('PN')) return 36;
    return 38;
  },

  renderPatientStats(monthStr) {
    const container = document.getElementById('stats-patients-content');
    if (!container) return;

    const groups = this.getAllMaternityGroups();
    let totalBeds = 0;
    let occupiedBeds = 0;

    const sectorStats = groups.map(g => ({
      title: g.title,
      total: g.beds.length,
      occupied: 0
    }));

    const patientRecordsMap = new Map();

    // 1. Coleta pacientes atualmente internadas na tabela
    groups.forEach((group, gIdx) => {
      group.beds.forEach(leito => {
        totalBeds++;
        const data = this.getMaternityBedData(leito);
        const fbData = this.state.maternityFirebaseMap[this.normalizeLeitoKey(leito)] || {};
        const isOccupied = Boolean(
          (data.nome && data.nome.trim() !== '') ||
          (data.internacao_por && data.internacao_por.trim() !== '') ||
          (data.observacoes && data.observacoes.trim() !== '')
        );
        if (isOccupied) {
          occupiedBeds++;
          sectorStats[gIdx].occupied++;
          const key = `${this.normalizeLeitoKey(leito)}_${(data.nome || data.internacao_por || 'PACIENTE').trim().toUpperCase()}`;
          patientRecordsMap.set(key, {
            leito,
            nome: (data.nome || '').trim(),
            paridade: (data.paridade || '').trim(),
            alto_risco: (data.alto_risco || '').trim(),
            internacao_por: (data.internacao_por || '').trim(),
            observacoes: (data.observacoes || '').trim(),
            admitted_at: fbData.admitted_at || null,
            discharged_at: null,
            stay_hours: null,
            status: 'active'
          });
        }
      });
    });

    // 2. Soma o histórico mensal de internações e altas do mês selecionado
    const targetMonth = monthStr || this.state.currentMonth;
    (this.state.maternityAdmissions || []).forEach(adm => {
      if (!adm) return;
      const admMonth = adm.month || (adm.admitted_at ? String(adm.admitted_at).slice(0, 7) : targetMonth);
      if (admMonth !== targetMonth) return;

      const key = `${this.normalizeLeitoKey(adm.leito)}_${(adm.nome || adm.internacao_por || 'PACIENTE').trim().toUpperCase()}`;
      if (!patientRecordsMap.has(key)) {
        patientRecordsMap.set(key, adm);
      } else {
        const existing = patientRecordsMap.get(key);
        patientRecordsMap.set(key, {
          ...adm,
          ...existing,
          admitted_at: existing.admitted_at || adm.admitted_at,
          stay_hours: existing.stay_hours || adm.stay_hours
        });
      }
    });

    const allPatients = Array.from(patientRecordsMap.values());
    const totalAttended = allPatients.length;
    const dischargedCount = allPatients.filter(p => p.status === 'discharged' || p.discharged_at).length;
    const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // 3. Tempo médio de internação
    let totalStayHours = 0;
    allPatients.forEach(p => {
      totalStayHours += this.estimateStayHoursFromRecord(p);
    });
    const avgStayHours = totalAttended > 0 ? Math.round(totalStayHours / totalAttended) : 0;
    const avgStayDays = totalAttended > 0 ? (totalStayHours / totalAttended / 24).toFixed(1).replace('.', ',') : '0,0';

    // 4. Classificação de Alto Risco e tipos mais relevantes
    let highRiskPatientsCount = 0;
    let habitualRiskPatientsCount = 0;
    const riskTypeCounts = {};

    const normalizeRiskLabel = (rawToken) => {
      const t = rawToken.trim().toUpperCase();
      if (!t) return null;
      if (['NÃO', 'NAO', 'N', '-', 'BAIXO', 'HABITUAL', 'RISCO HABITUAL', 'S/N', 'NENHUM', 'NEGATIVO'].includes(t)) {
        return null;
      }
      if (t.includes('DMG') || t.includes('DIABETES')) return 'Diabetes Gestacional (DMG / DM)';
      if (t.includes('HAC') || t.includes('HIPERTENS')) return 'Hipertensão Arterial (HAC)';
      if (t.includes('DHEG') || t.includes('ECLÂMPSIA') || t.includes('ECLAMPSIA') || t.includes('PE ') || t === 'PE' || t.includes('PRÉ-ECL')) return 'Pré-Eclâmpsia / DHEG';
      if (t.includes('HIPOTIREOID')) return 'Hipotireoidismo';
      if (t.includes('OBESIDADE') || t.includes('IMC')) return 'Obesidade';
      if (t.includes('TPP') || t.includes('PREMATUR') || t.includes('IIC')) return 'Trabalho de Parto Prematuro / IIC';
      if (t.includes('ITERATIV') || t.includes('2 PC') || t.includes('3 PC')) return 'Iteratividade (Cesáreas Prévias)';
      if (t.includes('GEMELAR')) return 'Gestação Gemelar';
      if (t.includes('ITU') || t.includes('INFEC')) return 'Infecção do Trato Urinário (ITU)';
      if (t.includes('CIUR') || t.includes('RCIU') || t.includes('RESTRI')) return 'Restrição de Crescimento Fetal (RCIU)';
      if (t.includes('OLIGODR') || t.includes('POLIDR') || t.includes('ILA')) return 'Alteração de Líquido Amniótico';
      if (t.includes('IDADE') || t.includes('35 ANOS') || t.includes('40 ANOS')) return 'Idade Materna Avançada';
      if (t.includes('TROMBO') || t.includes('SAF') || t.includes('SAAF')) return 'Trombofilia / SAF';
      if (t === 'SIM' || t === 'S' || t === 'ALTO RISCO') return 'Alto Risco Obstétrico (Geral)';
      return rawToken.trim().charAt(0).toUpperCase() + rawToken.trim().slice(1).toLowerCase();
    };

    allPatients.forEach(p => {
      const rawRisk = (p.alto_risco || '').trim();
      const tokens = rawRisk.split(/[,;/+\n]+/).map(s => s.trim()).filter(Boolean);
      const matchedLabels = new Set();

      tokens.forEach(tok => {
        const label = normalizeRiskLabel(tok);
        if (label) matchedLabels.add(label);
      });

      if (matchedLabels.size > 0) {
        highRiskPatientsCount++;
        matchedLabels.forEach(lbl => {
          riskTypeCounts[lbl] = (riskTypeCounts[lbl] || 0) + 1;
        });
      } else {
        habitualRiskPatientsCount++;
      }
    });

    const highRiskPct = totalAttended > 0 ? Math.round((highRiskPatientsCount / totalAttended) * 100) : 0;
    const sortedRiskTypes = Object.entries(riskTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    // 5. Dados de Paridade (Gestações, Partos, Cesáreas, Abortos)
    const parityStats = {
      primigestas: 0,     // G1
      secundigestas: 0,   // G2
      multiparas: 0,      // G3+
      nuliparas: 0,       // P0
      comPartosPrevios: 0,// P1+
      cesareaPrevia: 0,   // C1+ / PC
      abortoPrevio: 0,    // A1+
      naoInformado: 0
    };

    allPatients.forEach(p => {
      const rawP = (p.paridade || '').trim().toUpperCase();
      if (!rawP || rawP === '-' || rawP === '—') {
        parityStats.naoInformado++;
        return;
      }

      // Gestações (G1, G2, G3, I G, II G, PRIMIGESTA, MULTÍPARA)
      const gMatch = rawP.match(/\bG\s*(\d+)/) || rawP.match(/(\d+)\s*G\b/);
      if (gMatch) {
        const gNum = parseInt(gMatch[1], 10);
        if (gNum === 1) parityStats.primigestas++;
        else if (gNum === 2) parityStats.secundigestas++;
        else if (gNum >= 3) parityStats.multiparas++;
      } else if (rawP.includes('PRIMI')) {
        parityStats.primigestas++;
      } else if (rawP.includes('SECUNDI')) {
        parityStats.secundigestas++;
      } else if (rawP.includes('MULTI') || rawP.includes('MULTÍ')) {
        parityStats.multiparas++;
      }

      // Partos (P0, P1, PN, PC)
      const pMatch = rawP.match(/\bP\s*(\d+)/);
      if (pMatch) {
        const pNum = parseInt(pMatch[1], 10);
        if (pNum === 0) parityStats.nuliparas++;
        else if (pNum >= 1) parityStats.comPartosPrevios++;
      } else if (rawP.includes('NULÍ') || rawP.includes('NULI') || (rawP.includes('G1') && !rawP.includes('P1'))) {
        parityStats.nuliparas++;
      }

      // Cesáreas prévias (C1, C2, PC1, 1PC)
      const cMatch = rawP.match(/\b(?:PC|C)\s*(\d+)/) || rawP.match(/(\d+)\s*(?:PC|CES)/);
      if ((cMatch && parseInt(cMatch[1], 10) >= 1) || rawP.includes('CESÁREA') || rawP.includes('CESAREA')) {
        parityStats.cesareaPrevia++;
      }

      // Abortos prévios (A1, A2, 1A)
      const aMatch = rawP.match(/\bA\s*(\d+)/);
      if (aMatch && parseInt(aMatch[1], 10) >= 1) {
        parityStats.abortoPrevio++;
      }
    });

    // 6. Principais Motivos de Internação
    const admissionReasons = {};
    const normalizeReason = (rawReason, rawObs) => {
      const combined = `${rawReason || ''} ${rawObs || ''}`.toUpperCase();
      const r = (rawReason || '').trim();
      if (!r && !rawObs) return null;
      const rUp = r.toUpperCase();

      if (rUp.includes('CESÁREA') || rUp.includes('CESAREA') || rUp.includes('PÓS CES') || rUp.includes('POS CES') || rUp === 'PC') {
        return 'Cesárea / Pós-Operatório de Cesárea';
      }
      if (rUp.includes('PARTO NORMAL') || rUp.includes('PN') || rUp.includes('PÓS PARTO') || rUp.includes('POS PARTO') || rUp.includes('PUERP')) {
        return 'Parto Normal / Puerpério Imediato';
      }
      if (rUp.includes('TP') || rUp.includes('TRABALHO DE PARTO') || rUp.includes('INDUÇÃO') || rUp.includes('INDUCAO') || rUp.includes('PRÓDROMO') || rUp.includes('PRODROMO')) {
        return 'Trabalho de Parto / Indução';
      }
      if (rUp.includes('BOLSA ROTA') || rUp.includes('RPMO') || rUp.includes('AMNIORREXE')) {
        return 'Bolsa Rota / Amniorrexe (RPMO)';
      }
      if (rUp.includes('CONTROLE PA') || rUp.includes('PRESS') || rUp.includes('DHEG') || rUp.includes('PE') || rUp.includes('HAC')) {
        return 'Investigação / Controle Pressórico';
      }
      if (rUp.includes('PERFIL') || rUp.includes('GLIC') || rUp.includes('DMG')) {
        return 'Controle Glicêmico / Perfil Obstétrico';
      }
      if (rUp.includes('ABORTO') || rUp.includes('ABORTAMENTO') || rUp.includes('CTG') || rUp.includes('CURETAGEM') || rUp.includes('AMIU')) {
        return 'Abortamento / Curetagem / AMIU';
      }
      if (rUp.includes('ITU') || rUp.includes('PIELONEFRITE')) {
        return 'Tratamento Clínico / ITU na Gestação';
      }
      if (r) {
        return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
      }
      if (combined.includes('PUERP') || combined.includes('RN')) {
        return 'Alojamento Conjunto / Puerpério';
      }
      return 'Avaliação / Observação Obstétrica';
    };

    allPatients.forEach(p => {
      const reasonLabel = normalizeReason(p.internacao_por, p.observacoes);
      if (reasonLabel) {
        admissionReasons[reasonLabel] = (admissionReasons[reasonLabel] || 0) + 1;
      }
    });

    const sortedReasons = Object.entries(admissionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    container.innerHTML = `
      <!-- LINHA 1: 4 CARDS DE KPI HOSPITALAR -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div class="rounded-2xl bg-m3-containerLow border border-m3-outlineVariant/60 p-3.5 flex flex-col justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Pacientes Atendidas</span>
            <div class="w-8 h-8 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
              <i data-lucide="users" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl sm:text-3xl font-extrabold text-brand-950 leading-none">${totalAttended}</div>
            <p class="text-[11px] font-bold text-slate-600 mt-1.5">
              <span class="text-emerald-700 font-extrabold">${occupiedBeds} internadas</span> • ${dischargedCount} altas no mês
            </p>
          </div>
        </div>

        <div class="rounded-2xl bg-m3-containerLow border border-m3-outlineVariant/60 p-3.5 flex flex-col justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Tempo Médio Internação</span>
            <div class="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
              <i data-lucide="clock" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl sm:text-3xl font-extrabold text-brand-950 leading-none">
              ${avgStayDays} <span class="text-sm font-bold text-slate-600">dias</span>
            </div>
            <p class="text-[11px] font-bold text-slate-600 mt-1.5">
              Média de <span class="text-brand-800 font-extrabold">${avgStayHours}h</span> de permanência hospitalar
            </p>
          </div>
        </div>

        <div class="rounded-2xl bg-m3-containerLow border border-m3-outlineVariant/60 p-3.5 flex flex-col justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Gestantes Alto Risco</span>
            <div class="w-8 h-8 rounded-xl bg-scred-100 text-scred-700 flex items-center justify-center shrink-0">
              <i data-lucide="alert-triangle" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl sm:text-3xl font-extrabold text-scred-700 leading-none">
              ${highRiskPatientsCount} <span class="text-sm font-bold text-slate-600">(${highRiskPct}%)</span>
            </div>
            <p class="text-[11px] font-bold text-slate-600 mt-1.5">
              ${habitualRiskPatientsCount} de risco habitual (${totalAttended > 0 ? (100 - highRiskPct) : 0}%)
            </p>
          </div>
        </div>

        <div class="rounded-2xl bg-m3-containerLow border border-m3-outlineVariant/60 p-3.5 flex flex-col justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Taxa de Ocupação Atual</span>
            <div class="w-8 h-8 rounded-xl bg-scred-100 text-scred-600 flex items-center justify-center shrink-0">
              <i data-lucide="bed" class="w-4 h-4"></i>
            </div>
          </div>
          <div class="mt-2">
            <div class="text-2xl sm:text-3xl font-extrabold text-brand-950 leading-none">
              ${occupancyPct}% <span class="text-xs font-bold text-slate-500">(${occupiedBeds}/${totalBeds})</span>
            </div>
            <div class="w-full h-2 rounded-full bg-slate-200 overflow-hidden mt-2">
              <div class="h-full rounded-full bg-scred-600 transition-all" style="width: ${Math.min(100, occupancyPct)}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- LINHA 2: 3 BLOCOS ANALÍTICOS (ALTO RISCO, PARIDADE, MOTIVOS DE INTERNAÇÃO & SETORES) -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- 1. TIPOS DE ALTO RISCO MAIS RELEVANTES -->
        <div class="rounded-2xl border border-m3-outlineVariant/60 bg-white p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <i data-lucide="heart-pulse" class="w-4 h-4 text-scred-600"></i>
              <h5 class="font-extrabold text-brand-950 text-xs sm:text-sm uppercase tracking-wide">Tipos de Alto Risco Mais Relevantes</h5>
            </div>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-scred-50 text-scred-800 border border-scred-200">
              ${highRiskPatientsCount} casos
            </span>
          </div>

          ${sortedRiskTypes.length > 0 ? `
            <div class="space-y-2.5">
              ${sortedRiskTypes.map(([label, count]) => {
                const pct = highRiskPatientsCount > 0 ? Math.round((count / highRiskPatientsCount) * 100) : 0;
                return `
                  <div>
                    <div class="flex items-center justify-between text-xs mb-1 gap-2">
                      <span class="font-bold text-slate-800 truncate">${this.escapeHtml(label)}</span>
                      <span class="font-extrabold text-scred-700 shrink-0">${count} pac. (${pct}%)</span>
                    </div>
                    <div class="w-full h-2 rounded-full bg-scred-50 overflow-hidden">
                      <div class="h-full rounded-full bg-scred-600" style="width: ${Math.max(8, pct)}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="py-6 text-center text-xs text-slate-400 font-semibold">
              Nenhuma condição de alto risco registrada nos leitos atuais.
            </div>
          `}
        </div>

        <!-- 2. PERFIL OBSTÉTRICO E DADOS DE PARIDADE -->
        <div class="rounded-2xl border border-m3-outlineVariant/60 bg-white p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <i data-lucide="baby" class="w-4 h-4 text-brand-700"></i>
              <h5 class="font-extrabold text-brand-950 text-xs sm:text-sm uppercase tracking-wide">Dados de Paridade</h5>
            </div>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 border border-brand-200">
              Perfil G / P / C / A
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="p-2.5 rounded-xl bg-m3-containerLow border border-m3-outlineVariant/40">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Primigestas (G1)</span>
              <span class="text-lg font-extrabold text-brand-950">${parityStats.primigestas}</span>
              <span class="text-[10px] font-semibold text-slate-500 ml-1">(${totalAttended > 0 ? Math.round((parityStats.primigestas / totalAttended) * 100) : 0}%)</span>
            </div>
            <div class="p-2.5 rounded-xl bg-m3-containerLow border border-m3-outlineVariant/40">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Secundigestas (G2)</span>
              <span class="text-lg font-extrabold text-brand-950">${parityStats.secundigestas}</span>
              <span class="text-[10px] font-semibold text-slate-500 ml-1">(${totalAttended > 0 ? Math.round((parityStats.secundigestas / totalAttended) * 100) : 0}%)</span>
            </div>
            <div class="p-2.5 rounded-xl bg-m3-containerLow border border-m3-outlineVariant/40">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Multíparas (G3+)</span>
              <span class="text-lg font-extrabold text-brand-950">${parityStats.multiparas}</span>
              <span class="text-[10px] font-semibold text-slate-500 ml-1">(${totalAttended > 0 ? Math.round((parityStats.multiparas / totalAttended) * 100) : 0}%)</span>
            </div>
            <div class="p-2.5 rounded-xl bg-m3-containerLow border border-m3-outlineVariant/40">
              <span class="text-[10px] font-bold uppercase text-slate-500 block">Nulíparas (P0)</span>
              <span class="text-lg font-extrabold text-brand-950">${parityStats.nuliparas}</span>
              <span class="text-[10px] font-semibold text-slate-500 ml-1">(${totalAttended > 0 ? Math.round((parityStats.nuliparas / totalAttended) * 100) : 0}%)</span>
            </div>
            <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70">
              <span class="text-[10px] font-bold uppercase text-amber-900 block">Cesárea Prévia (C1+)</span>
              <span class="text-lg font-extrabold text-amber-950">${parityStats.cesareaPrevia}</span>
              <span class="text-[10px] font-semibold text-amber-800 ml-1">pacientes</span>
            </div>
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span class="text-[10px] font-bold uppercase text-slate-600 block">Aborto Prévio (A1+)</span>
              <span class="text-lg font-extrabold text-slate-800">${parityStats.abortoPrevio}</span>
              <span class="text-[10px] font-semibold text-slate-500 ml-1">pacientes</span>
            </div>
          </div>
        </div>

        <!-- 3. PRINCIPAIS MOTIVOS DE INTERNAÇÃO & OCUPAÇÃO POR ALA -->
        <div class="rounded-2xl border border-m3-outlineVariant/60 bg-white p-4 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <i data-lucide="clipboard-list" class="w-4 h-4 text-scred-600"></i>
                <h5 class="font-extrabold text-brand-950 text-xs sm:text-sm uppercase tracking-wide">Motivos de Internação</h5>
              </div>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-scred-50 text-scred-800 border border-scred-200">
                Desfechos
              </span>
            </div>

            ${sortedReasons.length > 0 ? `
              <div class="space-y-2 mb-4">
                ${sortedReasons.map(([reason, count]) => {
                  const pct = totalAttended > 0 ? Math.round((count / totalAttended) * 100) : 0;
                  return `
                    <div class="flex items-center justify-between text-xs py-1 border-b border-m3-outlineVariant/30 last:border-b-0 gap-2">
                      <span class="font-bold text-slate-700 truncate">${this.escapeHtml(reason)}</span>
                      <span class="font-extrabold text-brand-950 bg-m3-container px-2 py-0.5 rounded-full text-[11px] shrink-0">${count} (${pct}%)</span>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="py-4 text-center text-xs text-slate-400 font-semibold">
                Sem motivos de internação registrados.
              </div>
            `}
          </div>

          <div class="pt-2 border-t border-m3-outlineVariant/50">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1.5">Ocupação por Ala da Maternidade</span>
            <div class="grid grid-cols-2 gap-1.5">
              ${sectorStats.map(sec => `
                <div class="px-2.5 py-1.5 rounded-xl bg-m3-containerLow flex items-center justify-between text-[11px]">
                  <span class="font-bold text-slate-700 truncate mr-1.5">${this.escapeHtml(sec.title.split('(')[0].trim())}</span>
                  <span class="font-extrabold text-brand-900 shrink-0">${sec.occupied}/${sec.total}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  exportStatsCSV() {
    const picker = document.getElementById('stats-month-picker');
    const month = (picker && picker.value) ? picker.value : this.state.currentMonth;
    let csv = 'Profissional;Turnos Diurnos (6h);Plantões Noturnos (12h);Rotineiro (6h);Reforços (4h);Total Horas\n';
    
    this.state.doctors.forEach(doc => {
      const docShifts = this.state.shifts.filter(s => String(s.doctor_id) === String(doc.id) && s.date.startsWith(month));
      const turnos_6h = docShifts.filter(s => s.shift_type === 'morning' || s.shift_type === 'afternoon').length;
      const plantoes_12h = docShifts.filter(s => s.shift_type === 'night').length;
      const rotinas_6h = docShifts.filter(s => s.shift_type === 'routine').length;
      const reforcos_4h = docShifts.filter(s => s.shift_type === 'evening').length;
      const total_horas = (turnos_6h * 6) + (plantoes_12h * 12) + (rotinas_6h * 6) + (reforcos_4h * 4);

      csv += `"${doc.name}";${turnos_6h};${plantoes_12h};${rotinas_6h};${reforcos_4h};${total_horas}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Escala_SantaCasaPG_${month}.csv`;
    a.click();
  },

  // ================= MODAL: FICHA DO MÉDICO =================
  openDoctorProfileById(doctorId, shiftContext = null) {
    const doc = this.state.doctors.find(d => String(d.id) === String(doctorId));
    if (!doc) return;

    this.state.viewingProfileDoctorId = String(doc.id);

    const modal = document.getElementById('modal-doctor-profile');
    const avatarBox = document.getElementById('profile-modal-avatar-container');
    const name = document.getElementById('profile-modal-name');
    const crm = document.getElementById('profile-modal-crm');
    const phone = document.getElementById('profile-modal-phone');
    const phoneStatus = document.getElementById('profile-modal-phone-status');
    const btnCall = document.getElementById('profile-modal-btn-call');
    const btnWa = document.getElementById('profile-modal-btn-whatsapp');
    const shiftInfo = document.getElementById('profile-modal-shift-info');
    const shiftText = document.getElementById('profile-modal-shift-text');

    if (avatarBox) avatarBox.innerHTML = this.renderAvatar(doc.photo_url);
    if (name) name.textContent = doc.name;
    const specLabel = this.formatSpecialty(doc.specialty);
    if (crm) crm.textContent = doc.crm ? `${specLabel} • CRM ${doc.crm}` : `${specLabel} • CRM não cadastrado`;

    const hasPhone = Boolean(doc.phone && doc.phone.trim() !== '');
    if (phone) {
      phone.textContent = hasPhone ? doc.phone : 'Não cadastrado';
      phone.className = hasPhone ? 'text-sm font-extrabold text-brand-950 font-mono' : 'text-sm font-medium text-slate-400 italic font-mono';
    }

    if (phoneStatus) {
      if (hasPhone) {
        phoneStatus.textContent = 'Ativo';
        phoneStatus.className = 'text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full';
      } else {
        phoneStatus.textContent = 'Não cadastrado';
        phoneStatus.className = 'text-[11px] font-bold text-slate-500 bg-m3-container px-2.5 py-0.5 rounded-full';
      }
    }

    const cleanNumber = this.cleanPhone(doc.phone);
    if (hasPhone) {
      if (btnCall) {
        btnCall.href = `tel:${cleanNumber}`;
        btnCall.classList.remove('opacity-40', 'pointer-events-none');
      }
      if (btnWa) {
        btnWa.href = `https://wa.me/55${cleanNumber}?text=Ol%C3%A1%20${encodeURIComponent(doc.name)},%20contato%20via%20Escala%20Maternidade%20Santa%20Casa%20PG.`;
        btnWa.classList.remove('opacity-40', 'pointer-events-none');
      }
    } else {
      if (btnCall) {
        btnCall.href = '#';
        btnCall.classList.add('opacity-40', 'pointer-events-none');
      }
      if (btnWa) {
        btnWa.href = '#';
        btnWa.classList.add('opacity-40', 'pointer-events-none');
      }
    }

    if (shiftContext && shiftInfo && shiftText) {
      shiftInfo.classList.remove('hidden');
      const shiftNames = {
        'routine': 'Rotineiro (07-13h)',
        'morning': 'Plantão Manhã (07-13h)',
        'afternoon': 'Plantão Tarde (13-19h)',
        'evening': 'Reforço Noturno (19-23h)',
        'night': 'Plantão Noturno (19-07h)'
      };
      shiftText.textContent = `${this.formatDateBR(shiftContext.date)} • ${shiftNames[shiftContext.shiftType] || ''}`;
    } else if (shiftInfo) {
      shiftInfo.classList.add('hidden');
    }

    this.updateProfileNotificationUI(doc.id);
    this.updatePwaInstallButtonsVisibility();

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  updateProfileNotificationUI(doctorId) {
    const btnEl = document.getElementById('profile-modal-btn-notify');
    const labelEl = document.getElementById('profile-modal-btn-notify-label');
    const subtitleEl = document.getElementById('profile-modal-notify-subtitle');
    if (!btnEl || !labelEl) return;

    const doc = this.state.doctors.find(d => String(d.id) === String(doctorId));
    const docName = doc ? doc.name : 'este profissional';
    const cfg = this.state.shiftReminderConfig || {};
    const isActiveForThisDoc = cfg.enabled !== false && String(cfg.my_doctor_id) === String(doctorId);

    if (isActiveForThisDoc) {
      btnEl.className = 'w-full h-11 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition whitespace-nowrap';
      labelEl.textContent = 'Recebendo notificações deste profissional ✓';
      if (subtitleEl) {
        subtitleEl.textContent = `Este aparelho está configurado para alertar os plantões e evoluções de Dr(a). ${docName}. Toque abaixo para desativar.`;
      }
    } else {
      btnEl.className = 'w-full h-11 min-h-[44px] px-4 rounded-xl bg-scred-600 hover:bg-scred-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition whitespace-nowrap';
      labelEl.textContent = 'Receber notificações deste profissional';
      if (subtitleEl) {
        subtitleEl.textContent = `Ative para receber alertas no WebApp 1h antes dos plantões e lembretes de evoluções de Dr(a). ${docName}.`;
      }
    }
  },

  async toggleProfileDoctorNotifications() {
    const doctorId = this.state.viewingProfileDoctorId;
    if (!doctorId) return;

    const doc = this.state.doctors.find(d => String(d.id) === String(doctorId));
    const docName = doc ? doc.name : 'Profissional';
    const cfg = this.state.shiftReminderConfig || {};
    const isCurrentlyActive = cfg.enabled !== false && String(cfg.my_doctor_id) === String(doctorId);

    if (isCurrentlyActive) {
      this.state.shiftReminderConfig = {
        ...cfg,
        my_doctor_id: 'ALL'
      };
      localStorage.setItem('shift_reminder_my_doctor_id', 'ALL');
      this.updateProfileNotificationUI(doctorId);
      this.updateReminderActiveDot();
      this.renderDoctorsCatalog();
      this.showToast(`Filtro individual de notificações de Dr(a). ${docName} desativado.`, 'info');
    } else {
      this.state.shiftReminderConfig = {
        enabled: true,
        my_doctor_id: String(doctorId),
        notify_shift_1h: true,
        notify_clinical: true,
        channel: 'inapp'
      };
      localStorage.setItem('shift_reminder_enabled', 'true');
      localStorage.setItem('shift_reminder_my_doctor_id', String(doctorId));
      localStorage.setItem('shift_reminder_notify_1h', 'true');
      localStorage.setItem('shift_reminder_notify_clinical', 'true');

      this.updateProfileNotificationUI(doctorId);
      this.updateReminderActiveDot();
      this.renderDoctorsCatalog();

      await this.requestDeviceNotificationPermission();
      this.showToast(`Notificações ativadas neste aparelho para Dr(a). ${docName}!`, 'success');
    }
  },

  closeDoctorProfileModal() {
    document.getElementById('modal-doctor-profile').classList.add('hidden');
  },

  // ================= MODAL: GERENCIAR PROFISSIONAIS =================
  openManageDoctorsModal() {
    const modal = document.getElementById('modal-manage-doctors');
    this.renderManageList();
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeManageDoctorsModal() {
    document.getElementById('modal-manage-doctors').classList.add('hidden');
  },

  filterManageList(val) {
    this.state.manageFilter = val;
    this.renderManageList();
  },

  renderManageList() {
    const list = document.getElementById('manage-doctors-list');
    if (!list) return;

    let filtered = this.state.doctors;
    if (this.state.manageFilter) {
      const q = this.state.manageFilter.toLowerCase();
      filtered = filtered.filter(d => d.name && d.name.toLowerCase().includes(q));
    }

    list.innerHTML = filtered.map(doc => {
      const phoneDisplay = doc.phone && doc.phone.trim() !== '' ? doc.phone : 'Não cadastrado';
      const hasPhone = Boolean(doc.phone && doc.phone.trim() !== '');
      const specLabel = this.formatSpecialty(doc.specialty);

      return `
        <div class="py-3 flex items-center justify-between gap-3 hover:bg-m3-containerLow/70 px-3 rounded-2xl transition">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl overflow-hidden border border-brand-200 bg-brand-50 flex items-center justify-center shrink-0">
              ${this.renderAvatar(doc.photo_url)}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-extrabold text-brand-950 text-sm">${doc.name}</h4>
                <span class="text-[10px] font-bold text-brand-800 bg-brand-100 px-2 py-0.5 rounded-full">${specLabel}</span>
              </div>
              <p class="text-xs font-mono ${hasPhone ? 'text-slate-700 font-bold' : 'text-slate-400 italic'}">${phoneDisplay}${doc.crm ? ` • CRM ${doc.crm}` : ''}</p>
            </div>
          </div>
          <button onclick="app.openDoctorModal('${doc.id}')" 
                  class="flex items-center gap-1.5 text-xs bg-brand-100 hover:bg-brand-200 text-brand-950 font-bold px-3.5 py-2 rounded-full transition">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            <span>Editar</span>
          </button>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  // ================= MODAL: CADASTRO / EDIÇÃO DE PROFISSIONAL =================
  openDoctorModal(doctorId = null) {
    this.state.editingDoctorId = doctorId;
    const modal = document.getElementById('modal-doctor-form');
    const title = document.getElementById('doctor-form-title');
    const form = document.getElementById('form-doctor');
    const btnDelete = document.getElementById('btn-delete-doctor');
    const avatarBox = document.getElementById('doc-photo-preview-container');
    const specSelect = document.getElementById('doc-specialty');

    if (form) form.reset();

    if (doctorId) {
      const doc = this.state.doctors.find(d => String(d.id) === String(doctorId));
      if (!doc) return;
      if (title) title.textContent = `Editar ${doc.name}`;
      document.getElementById('doc-id').value = doc.id;
      document.getElementById('doc-name').value = doc.name;
      document.getElementById('doc-phone').value = doc.phone || '';
      document.getElementById('doc-crm').value = doc.crm || '';
      if (specSelect) specSelect.value = this.formatSpecialty(doc.specialty);
      document.getElementById('doc-photo-url').value = doc.photo_url || '';
      if (avatarBox) avatarBox.innerHTML = this.renderAvatar(doc.photo_url);
      if (btnDelete) btnDelete.classList.remove('hidden');
    } else {
      if (title) title.textContent = 'Novo Profissional';
      document.getElementById('doc-id').value = '';
      if (specSelect) specSelect.value = 'GO';
      document.getElementById('doc-photo-url').value = '';
      if (avatarBox) avatarBox.innerHTML = SILHOUETTE_SVG;
      if (btnDelete) btnDelete.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeDoctorModal() {
    document.getElementById('modal-doctor-form').classList.add('hidden');
  },

  handlePhotoUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const urlInput = document.getElementById('doc-photo-url');
      if (urlInput) urlInput.value = dataUrl;
      this.updatePhotoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  },

  updatePhotoPreview(url) {
    const avatarBox = document.getElementById('doc-photo-preview-container');
    if (avatarBox) {
      avatarBox.innerHTML = this.renderAvatar(url);
    }
  },

  clearDoctorPhoto() {
    const urlInput = document.getElementById('doc-photo-url');
    if (urlInput) urlInput.value = '';
    this.updatePhotoPreview('');
  },

  async handleSaveDoctor(e) {
    e.preventDefault();
    const id = document.getElementById('doc-id').value;
    const name = document.getElementById('doc-name').value.trim();
    const phone = document.getElementById('doc-phone').value.trim();
    const crm = document.getElementById('doc-crm').value.trim();
    const specSelect = document.getElementById('doc-specialty');
    const specialty = this.formatSpecialty(specSelect ? specSelect.value : 'GO');
    const photo_url = document.getElementById('doc-photo-url').value.trim();

    const payload = { name, phone, crm, specialty, photo_url };

    try {
      if (this.state.firebaseActive && this.state.firestoreDb) {
        const db = this.state.firestoreDb;
        if (id) {
          await db.collection('doctors').doc(String(id)).set(payload, { merge: true });
        } else {
          const newDocRef = db.collection('doctors').doc();
          await newDocRef.set({ id: newDocRef.id, ...payload });
        }
      } else {
        if (id) {
          await fetch(`/api/doctors/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          await fetch('/api/doctors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        await this.loadAllData();
      }

      this.closeDoctorModal();
      this.render();
      this.renderManageList();
      this.showToast('Profissional salvo com sucesso!', 'success');
    } catch (err) {
      this.showToast('Erro ao salvar: ' + err.message, 'error');
    }
  },

  async handleDeleteDoctor() {
    const id = this.state.editingDoctorId;
    if (!id) return;

    if (!confirm('Deseja realmente excluir este profissional da escala?')) return;

    try {
      if (this.state.firebaseActive && this.state.firestoreDb) {
        await this.state.firestoreDb.collection('doctors').doc(String(id)).delete();
      } else {
        await fetch(`/api/doctors/${id}`, { method: 'DELETE' });
        await this.loadAllData();
      }

      this.closeDoctorModal();
      this.render();
      this.renderManageList();
      this.showToast('Profissional removido', 'info');
    } catch (e) {
      this.showToast('Erro ao excluir profissional', 'error');
    }
  },

  // ================= MODAL: ATRIBUIÇÃO DE ESCALA =================
  openShiftModal(date, shiftType, slotRole, currentDoctorId) {
    this.state.selectedShiftSlot = { date, shiftType, slotRole, currentDoctorId };

    const modal = document.getElementById('modal-assign-shift');
    const title = document.getElementById('shift-modal-title');
    const badge = document.getElementById('shift-modal-badge');
    const docSelect = document.getElementById('shift-select-doctor');

    this.populateDoctorSelect();
    if (docSelect) docSelect.value = currentDoctorId ? String(currentDoctorId) : '';

    const shiftNames = {
      'routine': 'Rotineiro (07-13h)',
      'morning': 'Plantão Manhã (07-13h)',
      'afternoon': 'Plantão Tarde (13-19h)',
      'evening': 'Reforço (19-23h)',
      'night': 'Plantão Noturno (19-07h)'
    };

    if (badge) badge.textContent = shiftNames[shiftType] || 'Turno';
    if (title) title.textContent = `Escalar • ${this.formatDateBR(date)}`;

    const radioSingle = document.querySelector('input[name="shift_duration"][value="single"]');
    if (radioSingle) radioSingle.checked = true;

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeShiftModal() {
    document.getElementById('modal-assign-shift').classList.add('hidden');
  },

  populateDoctorSelect() {
    const select = document.getElementById('shift-select-doctor');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Selecione o profissional --</option>' + 
      this.state.doctors.map(d => `
        <option value="${d.id}">${d.name}</option>
      `).join('');
  },

  async handleSaveShiftAssignment(e) {
    e.preventDefault();
    const slot = this.state.selectedShiftSlot;
    if (!slot) return;

    const { date, shiftType, slotRole } = slot;
    const doctorId = document.getElementById('shift-select-doctor').value;

    const durationRadio = document.querySelector('input[name="shift_duration"]:checked');
    const duration = durationRadio ? durationRadio.value : 'single';

    if (!doctorId) {
      this.showToast('Selecione um profissional', 'warning');
      return;
    }

    const doctorObj = this.state.doctors.find(d => String(d.id) === String(doctorId));
    const doctorName = doctorObj ? doctorObj.name : '';

    try {
      const batch = [];
      const baseDate = new Date(date + 'T12:00:00');

      if (duration === 'single') {
        batch.push({ date, shift_type: shiftType, slot_role: slotRole, doctor_id: doctorId, doctor_name: doctorName });
      } else if (duration === 'day_full') {
        const targetRole = (slotRole === 'day_2') ? 'day_2' : 'day_1';
        batch.push({ date, shift_type: 'morning', slot_role: targetRole, doctor_id: doctorId, doctor_name: doctorName });
        batch.push({ date, shift_type: 'afternoon', slot_role: targetRole, doctor_id: doctorId, doctor_name: doctorName });
      } else if (duration === '24h_sameday') {
        batch.push({ date, shift_type: 'morning', slot_role: 'day_1', doctor_id: doctorId, doctor_name: doctorName });
        batch.push({ date, shift_type: 'afternoon', slot_role: 'day_1', doctor_id: doctorId, doctor_name: doctorName });
        batch.push({ date, shift_type: 'night', slot_role: 'night_1', doctor_id: doctorId, doctor_name: doctorName });
      } else if (duration === '24h_nextday') {
        const nextDay = new Date(baseDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDateStr = nextDay.toISOString().slice(0, 10);
        batch.push({ date, shift_type: 'night', slot_role: 'night_1', doctor_id: doctorId, doctor_name: doctorName });
        batch.push({ date: nextDateStr, shift_type: 'morning', slot_role: 'day_1', doctor_id: doctorId, doctor_name: doctorName });
        batch.push({ date: nextDateStr, shift_type: 'afternoon', slot_role: 'day_1', doctor_id: doctorId, doctor_name: doctorName });
      }

      // Captura estado anterior para Desfazer (Undo)
      const beforeSnapshots = batch.map(item => this.getShiftSnapshot(item.date, item.shift_type, item.slot_role));
      const afterSnapshots = batch.map(item => ({ ...item }));

      await this.applyShiftSnapshots(afterSnapshots);

      this.state.undoStack.push({
        label: `Escalar ${doctorName}`,
        before: beforeSnapshots,
        after: afterSnapshots
      });
      this.state.redoStack = [];
      this.updateUndoRedoUI();

      this.closeShiftModal();
      this.renderSpreadsheetView();
      this.renderDailyView();
      this.showToast('Escala atualizada!', 'success');
    } catch (err) {
      this.showToast('Erro ao salvar escala: ' + err.message, 'error');
    }
  },

  async removeCurrentShift() {
    const slot = this.state.selectedShiftSlot;
    if (!slot) return;

    try {
      const beforeSnap = this.getShiftSnapshot(slot.date, slot.shiftType, slot.slotRole);
      const afterSnap = {
        date: slot.date,
        shift_type: slot.shiftType,
        slot_role: slot.slotRole,
        doctor_id: null,
        doctor_name: ''
      };

      await this.applyShiftSnapshots([afterSnap]);

      this.state.undoStack.push({
        label: `Remover ${beforeSnap.doctor_name || 'plantonista'}`,
        before: [beforeSnap],
        after: [afterSnap]
      });
      this.state.redoStack = [];
      this.updateUndoRedoUI();

      this.closeShiftModal();
      this.renderSpreadsheetView();
      this.renderDailyView();
      this.showToast('Vaga liberada', 'info');
    } catch (e) {
      this.showToast('Erro ao remover', 'error');
    }
  },

  // ================= DESFAZER / AVANÇAR (UNDO / REDO) =================
  getShiftSnapshot(date, shift_type, slot_role) {
    const existing = this.state.shifts.find(
      s => s.date === date && s.shift_type === shift_type && s.slot_role === slot_role
    );
    if (existing && existing.doctor_id) {
      return {
        date,
        shift_type,
        slot_role,
        doctor_id: existing.doctor_id,
        doctor_name: existing.doctor_name || this.getDoctorNameById(existing.doctor_id) || ''
      };
    }
    return {
      date,
      shift_type,
      slot_role,
      doctor_id: null,
      doctor_name: ''
    };
  },

  async applyShiftSnapshots(snapshots) {
    if (!snapshots || snapshots.length === 0) return;

    // Atualiza o estado local imediatamente para resposta instantânea na tabela
    for (const item of snapshots) {
      this.state.shifts = this.state.shifts.filter(
        s => !(s.date === item.date && s.shift_type === item.shift_type && s.slot_role === item.slot_role)
      );
      if (item.doctor_id) {
        this.state.shifts.push({
          date: item.date,
          shift_type: item.shift_type,
          slot_role: item.slot_role,
          doctor_id: item.doctor_id,
          doctor_name: item.doctor_name || this.getDoctorNameById(item.doctor_id) || ''
        });
      }
    }

    if (this.state.firebaseActive && this.state.firestoreDb) {
      const firestoreBatch = this.state.firestoreDb.batch();
      for (const item of snapshots) {
        const docKey = `${item.date}_${item.shift_type}_${item.slot_role}`;
        const ref = this.state.firestoreDb.collection('shifts').doc(docKey);
        if (item.doctor_id) {
          firestoreBatch.set(ref, {
            date: item.date,
            shift_type: item.shift_type,
            slot_role: item.slot_role,
            doctor_id: item.doctor_id,
            doctor_name: item.doctor_name || this.getDoctorNameById(item.doctor_id) || ''
          });
        } else {
          firestoreBatch.delete(ref);
        }
      }
      await firestoreBatch.commit();
    } else {
      for (const item of snapshots) {
        await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: item.date,
            shift_type: item.shift_type,
            slot_role: item.slot_role,
            doctor_id: item.doctor_id || null
          })
        });
      }
      await this.loadAllData();
      // Atualiza a tabela de médicos de plantão agora imediatamente
      this.calculateNowStatusFromState();
    }
  },

  requestUndoShiftAction() {
    if (!this.state.isEditorMode) return;
    if (!this.state.undoStack || this.state.undoStack.length === 0) return;

    const lastAction = this.state.undoStack[this.state.undoStack.length - 1];
    const descEl = document.getElementById('confirm-undo-description');
    if (descEl) {
      descEl.textContent = `Deseja desfazer a última alteração ("${lastAction.label}")?`;
    }

    const modal = document.getElementById('modal-confirm-undo');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  closeUndoConfirmModal() {
    const modal = document.getElementById('modal-confirm-undo');
    if (modal) modal.classList.add('hidden');
  },

  async confirmUndoShiftAction() {
    this.closeUndoConfirmModal();
    await this.undoShiftAction();
  },

  async undoShiftAction() {
    if (!this.state.isEditorMode) return;
    if (!this.state.undoStack || this.state.undoStack.length === 0) return;

    const action = this.state.undoStack.pop();
    try {
      await this.applyShiftSnapshots(action.before);
      this.state.redoStack.push(action);
      this.updateUndoRedoUI();
      this.renderSpreadsheetView();
      this.showToast(`Desfeito: ${action.label}`, 'info');
    } catch (err) {
      this.state.undoStack.push(action);
      this.updateUndoRedoUI();
      this.showToast('Erro ao desfazer: ' + err.message, 'error');
    }
  },

  async redoShiftAction() {
    if (!this.state.isEditorMode) return;
    if (!this.state.redoStack || this.state.redoStack.length === 0) return;

    const action = this.state.redoStack.pop();
    try {
      await this.applyShiftSnapshots(action.after);
      this.state.undoStack.push(action);
      this.updateUndoRedoUI();
      this.renderSpreadsheetView();
      this.renderDailyView();
      this.showToast(`Refeito: ${action.label}`, 'info');
    } catch (err) {
      this.state.redoStack.push(action);
      this.updateUndoRedoUI();
      this.showToast('Erro ao avançar: ' + err.message, 'error');
    }
  },

  // ================= EXPORTAÇÃO MENSAL COMPLETA (PDF / XLSX) =================
  getSlotDoctorName(dateStr, shiftType, slotRole) {
    const s = this.state.shifts.find(
      item => item.date === dateStr && item.shift_type === shiftType && item.slot_role === slotRole
    );
    if (!s || !s.doctor_id) return '';
    return s.doctor_name || this.getDoctorNameById(s.doctor_id) || '';
  },

  exportFullMonthXLSX() {
    if (typeof XLSX === 'undefined') {
      this.showToast('Biblioteca Excel ainda carregando. Tente novamente em instantes.', 'warning');
      return;
    }

    const [year, month] = this.state.currentMonth.split('-').map(Number);
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthName = monthNames[month - 1];
    const weeks = this.getWeeksOfMonth(year, month);
    const weekdayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

    const rows = [
      ['SANTA CASA DE PONTA GROSSA — ESCALA DE PLANTÃO OBSTETRÍCIA (PAGO)'],
      [`MÊS DE REFERÊNCIA: ${monthName.toUpperCase()} DE ${year}`],
      []
    ];

    weeks.forEach((weekDays, wIdx) => {
      rows.push([
        `SEMANA ${wIdx + 1} (${ String(weekDays[0].day).padStart(2, '0') }/${ String(Number(weekDays[0].dateStr.slice(5, 7))).padStart(2, '0') } a ${ String(weekDays[6].day).padStart(2, '0') }/${ String(Number(weekDays[6].dateStr.slice(5, 7))).padStart(2, '0') })`
      ]);

      const headerRow = [
        'Horário / Turno',
        ...weekDays.map((d, idx) => {
          const mNum = d.dateStr.slice(5, 7);
          const suffix = d.isCurrentMonth ? '' : ' (Outro mês)';
          return `${weekdayNames[idx]} (${String(d.day).padStart(2, '0')}/${mNum})${suffix}`;
        })
      ];
      rows.push(headerRow);

      const slotDefinitions = [
        { label: '07-13h (Rotineiro)', type: 'routine', role: 'rotineiro' },
        { label: '07-13h (Plantonista 1)', type: 'morning', role: 'day_1' },
        { label: '07-13h (Plantonista 2)', type: 'morning', role: 'day_2' },
        { label: '13-19h (Plantonista 1)', type: 'afternoon', role: 'day_1' },
        { label: '13-19h (Plantonista 2)', type: 'afternoon', role: 'day_2' },
        { label: '19-23h (Reforço)', type: 'evening', role: 'shift_19_23' },
        { label: '19-07h (Noturno 1)', type: 'night', role: 'night_1' },
        { label: '19-07h (Noturno 2)', type: 'night', role: 'night_2' }
      ];

      slotDefinitions.forEach(def => {
        const line = [def.label];
        weekDays.forEach(d => {
          const docName = this.getSlotDoctorName(d.dateStr, def.type, def.role);
          line.push(docName || '—');
        });
        rows.push(line);
      });

      rows.push([]);
    });

    const wb = XLSX.utils.book_new();
    const wsEscala = XLSX.utils.aoa_to_sheet(rows);
    wsEscala['!cols'] = [
      { wch: 24 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, wsEscala, `Escala ${monthName}`);

    // Aba 2: Resumo do Fechamento Mensal
    const monthShifts = this.state.shifts.filter(s => s.date && s.date.startsWith(this.state.currentMonth));
    const statsRows = [
      [`FECHAMENTO MENSAL — ${monthName.toUpperCase()} / ${year}`],
      [],
      ['Profissional', 'Especialidade', 'CRM', 'Manhã/Tarde (6h)', 'Reforço 19-23h (4h)', 'Noturno 19-07h (12h)', 'Rotineiro (6h)', 'Total Plantões', 'TOTAL (H)']
    ];

    this.state.doctors.forEach(doc => {
      const myShifts = monthShifts.filter(s => String(s.doctor_id) === String(doc.id));
      const cDay = myShifts.filter(s => s.shift_type === 'morning' || s.shift_type === 'afternoon').length;
      const cEve = myShifts.filter(s => s.shift_type === 'evening').length;
      const cNight = myShifts.filter(s => s.shift_type === 'night').length;
      const cRoutine = myShifts.filter(s => s.shift_type === 'routine').length;
      const totalShifts = myShifts.length;
      const totalHours = (cDay * 6) + (cEve * 4) + (cNight * 12) + (cRoutine * 6);

      if (totalShifts > 0) {
        statsRows.push([
          doc.name,
          this.normalizeSpecialty(doc.specialty),
          doc.crm || '—',
          cDay,
          cEve,
          cNight,
          cRoutine,
          totalShifts,
          totalHours
        ]);
      }
    });

    const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
    wsStats['!cols'] = [
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsStats, 'Fechamento Mensal');

    const safeMonth = monthName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    XLSX.writeFile(wb, `Escala_SantaCasaPG_${safeMonth}_${year}.xlsx`);
    this.showToast(`Planilha XLSX de ${monthName}/${year} baixada!`, 'success');
  },

  exportFullMonthPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      this.showToast('Biblioteca PDF ainda carregando. Tente novamente em instantes.', 'warning');
      return;
    }

    const [year, month] = this.state.currentMonth.split('-').map(Number);
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthName = monthNames[month - 1];
    const weeks = this.getWeeksOfMonth(year, month);
    const weekdayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Cabeçalho institucional
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(12, 46, 89);
    doc.text('SANTA CASA DE PONTA GROSSA — ESCALA MENSAL DE PLANTÃO (PAGO)', 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Mês de Referência: ${monthName} de ${year}  •  Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 17);

    let currentY = 21;

    weeks.forEach((weekDays, wIdx) => {
      const head = [[
        `Horário (Sem. ${wIdx + 1})`,
        ...weekDays.map((d, idx) => {
          const mNum = d.dateStr.slice(5, 7);
          return `${weekdayNames[idx]}\n${String(d.day).padStart(2, '0')}/${mNum}`;
        })
      ]];

      const getDualCell = (dStr, type, r1, r2) => {
        const n1 = this.getSlotDoctorName(dStr, type, r1) || '—';
        const n2 = this.getSlotDoctorName(dStr, type, r2) || '—';
        return `${n1}\n${n2}`;
      };

      const body = [
        [
          '07-13h\nRotineiro',
          ...weekDays.map(d => this.getSlotDoctorName(d.dateStr, 'routine', 'rotineiro') || '—')
        ],
        [
          '07-13h',
          ...weekDays.map(d => getDualCell(d.dateStr, 'morning', 'day_1', 'day_2'))
        ],
        [
          '13-19h',
          ...weekDays.map(d => getDualCell(d.dateStr, 'afternoon', 'day_1', 'day_2'))
        ],
        [
          '19-23h\nReforço',
          ...weekDays.map(d => this.getSlotDoctorName(d.dateStr, 'evening', 'shift_19_23') || '—')
        ],
        [
          '19-07h\nNoturno',
          ...weekDays.map(d => getDualCell(d.dateStr, 'night', 'night_1', 'night_2'))
        ]
      ];

      doc.autoTable({
        startY: currentY,
        head,
        body,
        theme: 'grid',
        margin: { left: 10, right: 10 },
        styles: {
          fontSize: 7.5,
          cellPadding: 1.4,
          valign: 'middle',
          halign: 'center',
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          textColor: [30, 41, 59]
        },
        headStyles: {
          fillColor: [18, 70, 128],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.8,
          cellPadding: 1.6
        },
        columnStyles: {
          0: { cellWidth: 25, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [12, 46, 89] }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.row.index === 0) {
              data.cell.styles.fillColor = [238, 246, 255];
            } else if (data.row.index === 3) {
              data.cell.styles.fillColor = [254, 242, 242];
            } else if (data.row.index === 4) {
              data.cell.styles.fillColor = [254, 252, 232];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        pageBreak: 'avoid'
      });

      currentY = doc.lastAutoTable.finalY + 4;
    });

    const safeMonth = monthName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    doc.save(`Escala_SantaCasaPG_${safeMonth}_${year}.pdf`);
    this.showToast(`PDF da escala de ${monthName}/${year} baixado!`, 'success');
  },

  // ================= CONFIGURAÇÕES E FIREBASE =================
  openSettingsModal() {
    document.getElementById('modal-settings').classList.remove('hidden');
    const input = document.getElementById('settings-firebase-input');
    const saved = localStorage.getItem('escala_firebase_config');
    if (input) {
      input.value = saved || JSON.stringify(window.FIREBASE_CONFIG || {}, null, 2);
    }
  },

  closeSettingsModal() {
    document.getElementById('modal-settings').classList.add('hidden');
  },

  async saveFirebaseConfig() {
    const text = document.getElementById('settings-firebase-input').value.trim();
    if (!text) {
      this.showToast("Cole as credenciais do seu Web App do Firebase", "warning");
      return;
    }

    try {
      let configObj;
      if (text.startsWith('{')) {
        configObj = JSON.parse(text);
      } else {
        const clean = text.replace(/const\s+firebaseConfig\s*=\s*/, '').replace(/;\s*$/, '');
        configObj = JSON.parse(clean);
      }

      if (!configObj.projectId) {
        throw new Error("Objeto de configuração não contém projectId");
      }

      localStorage.setItem('escala_firebase_config', JSON.stringify(configObj));
      window.FIREBASE_CONFIG = configObj;

      await this.initFirebase();
      await this.loadAllData();

      this.showToast("Firebase conectado e sincronizado com sucesso!", "success");
    } catch (err) {
      this.showToast("Formato de configuração inválido. Cole o objeto JSON do console.", "error");
    }
  },

  async handleChangePin() {
    const current_pin = document.getElementById('settings-current-pin').value.trim();
    const new_pin = document.getElementById('settings-new-pin').value.trim();

    const savedPin = this.getEditorPin();

    if (current_pin !== savedPin) {
      this.showToast('Senha atual incorreta', 'error');
      return;
    }
    if (!/^\d{6}$/.test(new_pin)) {
      this.showToast('A nova senha deve ter exatamente 6 dígitos numéricos', 'warning');
      return;
    }

    localStorage.setItem('escala_editor_pin', new_pin);
    document.getElementById('settings-current-pin').value = '';
    document.getElementById('settings-new-pin').value = '';
    this.showToast('Senha de 6 dígitos alterada com sucesso!', 'success');
  },

  async reloadSeedData() {
    if (!confirm('Deseja recarregar a escala original da planilha?')) return;
    try {
      if (this.state.firebaseActive) {
        await this.seedFirebaseDefaults();
      } else {
        await fetch('/api/seed', { method: 'POST' });
        await this.loadAllData();
      }
      this.closeSettingsModal();
      this.showToast('Escala recarregada com sucesso!', 'success');
    } catch (e) {
      this.showToast('Erro ao recarregar dados', 'error');
    }
  },

  cleanPhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  },

  formatDateBR(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  },

  startClockAndCountdown() {
    const updateTime = () => {
      const now = new Date();
      const clockEl = document.getElementById('live-clock');
      if (clockEl) clockEl.textContent = now.toLocaleTimeString('pt-BR');
      this.updateCountdownDisplay();
    };

    updateTime();
    setInterval(updateTime, 1000);
  },

  updateCountdownDisplay() {
    const now = new Date();
    const hour = now.getHours();

    let targetHour = 19;
    let label = '19:00';

    if (hour >= 7 && hour < 19) {
      targetHour = 19;
      label = '19:00 (Passagem Noturno)';
    } else {
      targetHour = 7;
      label = '07:00 (Passagem Diurno)';
    }

    const target = new Date(now);
    if (targetHour === 19) {
      target.setHours(19, 0, 0, 0);
    } else {
      if (hour >= 19) {
        target.setDate(target.getDate() + 1);
      }
      target.setHours(7, 0, 0, 0);
    }

    const diffMs = target - now;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);

    const countdownEl = document.getElementById('countdown-text');
    if (countdownEl) countdownEl.textContent = `em ${h}h ${m}m`;

    const handoverEl = document.getElementById('now-next-handover');
    if (handoverEl) handoverEl.textContent = `${label} — faltam ${h}h ${m}min`;
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
      success: 'bg-brand-900 text-white border-brand-700',
      error: 'bg-scred-600 text-white border-scred-700',
      warning: 'bg-amber-600 text-white border-amber-700',
      info: 'bg-brand-700 text-white border-brand-800'
    };

    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-full shadow-lg border text-xs font-bold flex items-center gap-2 transition-all duration-300 pointer-events-auto ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
