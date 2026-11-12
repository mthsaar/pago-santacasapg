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
    maternityWebhookUrl: localStorage.getItem('maternity_sheet_webhook') || ''
  },

  async init() {
    if (sessionStorage.getItem('escala_editor_authorized') === 'true') {
      this.state.isEditorMode = true;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr.startsWith('2026-11')) {
      this.state.selectedDate = todayStr;
    }

    this.setupDatePickers();
    this.updateModeUI();
    this.startClockAndCountdown();
    this.populateEvolutionLeitoSelect();
    this.renderMaternityView();

    await this.initFirebase();
    await this.loadAllData();
    this.syncMaternityFromGoogleSheet();

    this.switchView(this.state.currentView);

    window.addEventListener('resize', () => {
      this.updateTableColumnMetrics();
    });

    window.addEventListener('keydown', (e) => {
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
    }, 60000);

    setInterval(() => {
      this.syncMaternityFromGoogleSheet();
    }, 12000);
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
  },

  setupDatePickers() {
    const dailyPicker = document.getElementById('daily-picker');
    if (dailyPicker) dailyPicker.value = this.state.selectedDate;

    const statsPicker = document.getElementById('stats-month-picker');
    if (statsPicker) statsPicker.value = this.state.currentMonth;
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
          <td colspan="3" class="px-4 py-6 text-center text-xs text-slate-500 font-semibold">
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
          <td class="px-3.5 py-2.5 border-r border-m3-outlineVariant/40 align-middle whitespace-nowrap">
            <div class="inline-flex flex-col items-start px-2.5 py-1 rounded-xl ${item.badgeClass}">
              <span class="text-xs font-extrabold leading-none">${item.badgeText}</span>
              <span class="text-[10px] font-bold opacity-85 mt-0.5 leading-none">${item.subLabel}</span>
            </div>
          </td>
          <td class="px-3.5 py-2.5 border-r border-m3-outlineVariant/40 align-middle">
            <div class="flex items-center gap-2.5 cursor-pointer group" onclick="app.openDoctorProfileById('${shift.doctor_id}')">
              <div class="w-9 h-9 rounded-xl overflow-hidden border border-brand-200 bg-brand-50 shrink-0 flex items-center justify-center">
                ${this.renderAvatar(doctorObj.photo_url || shift.doctor_photo)}
              </div>
              <div class="min-w-0">
                <div class="font-extrabold text-brand-950 text-xs sm:text-sm group-hover:text-brand-700 group-hover:underline truncate">
                  ${docName}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
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
          this.state.firestoreDb.collection('maternity_patients').doc(docId).set({
            leito: rawLeito,
            nome: entry.nome,
            paridade: entry.paridade,
            alto_risco: entry.alto_risco,
            internacao_por: entry.internacao_por,
            observacoes: entry.observacoes,
            cleared_at: !hasAnySheetVal ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
            source: 'google_sheets'
          }, { merge: true }).catch(() => {});
        }
      }

      this.state.maternitySheetMap = newSheetMap;
      this.state.maternityExtraBeds = extraBeds;
      this.populateEvolutionLeitoSelect();
      this.renderMaternityView();

      const statusEl = document.getElementById('maternity-sync-status');
      if (statusEl) {
        const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        statusEl.textContent = `Sincronizado em tempo real (Firebase + Google Docs às ${nowStr})`;
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
  },

  async handleSaveMaternityEvolution(e) {
    e.preventDefault();
    const leito = document.getElementById('evo-select-leito').value;
    if (!leito) return;

    const payload = {
      leito,
      nome: (document.getElementById('evo-input-nome').value || '').trim(),
      paridade: (document.getElementById('evo-input-paridade').value || '').trim(),
      alto_risco: (document.getElementById('evo-input-altorisco').value || '').trim(),
      internacao_por: (document.getElementById('evo-input-internacao').value || '').trim(),
      observacoes: (document.getElementById('evo-input-observacoes').value || '').trim(),
      cleared_at: null,
      updated_at: new Date().toISOString()
    };

    await this.saveMaternityBedRecord(payload, 'Evolução salva com sucesso!');
  },

  async clearMaternityBed() {
    const leito = document.getElementById('evo-select-leito').value;
    if (!leito) return;

    const payload = {
      leito,
      nome: '',
      paridade: '',
      alto_risco: '',
      internacao_por: '',
      observacoes: '',
      cleared_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.saveMaternityBedRecord(payload, `Leito ${leito} liberado!`);
  },

  async saveMaternityBedRecord(payload, successMsg) {
    const key = this.normalizeLeitoKey(payload.leito);
    this.state.maternityFirebaseMap[key] = { ...payload };
    this.renderMaternityView();
    this.populateEvolutionLeitoSelect(payload.leito);

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

    grid.innerHTML = filtered.map(doc => {
      const phoneDisplay = doc.phone && doc.phone.trim() !== '' ? doc.phone : 'Não cadastrado';
      const hasPhone = Boolean(doc.phone && doc.phone.trim() !== '');

      return `
        <div class="m3-card m3-card-interactive p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-3.5 mb-3">
              <div class="w-16 h-16 rounded-2xl overflow-hidden border-2 border-brand-100 shadow-xs bg-brand-50 shrink-0 flex items-center justify-center cursor-pointer"
                   onclick="app.openDoctorProfileById('${doc.id}')">
                ${this.renderAvatar(doc.photo_url)}
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-extrabold text-brand-950 text-base leading-snug truncate cursor-pointer hover:text-brand-700"
                    onclick="app.openDoctorProfileById('${doc.id}')">
                  ${doc.name}
                </h4>
                <p class="text-xs text-slate-400 font-medium">${doc.crm ? `CRM ${doc.crm}` : 'CRM não cadastrado'}</p>
                <span class="inline-block mt-1 text-[11px] font-bold text-brand-800 bg-brand-100 px-2.5 py-0.5 rounded-full">
                  ${this.formatSpecialty(doc.specialty)}
                </span>
              </div>
            </div>

            <div class="bg-m3-containerLow rounded-2xl p-3 my-3 flex items-center justify-between text-xs">
              <span class="text-slate-500 font-bold">Telefone:</span>
              <span class="font-mono ${hasPhone ? 'text-brand-950 font-extrabold' : 'text-slate-400 italic font-medium'}">${phoneDisplay}</span>
            </div>
          </div>

          <div class="pt-2 flex items-center gap-2">
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
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  },

  filterDoctors(val) {
    this.state.doctorFilter = val;
    this.renderDoctorsCatalog();
  },

  // ================= 4. RENDER: FECHAMENTO DE HORAS =================
  async loadStats(monthStr) {
    try {
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

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
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
