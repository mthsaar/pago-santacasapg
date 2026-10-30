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

const app = {
  state: {
    isEditorMode: false,
    currentView: 'spreadsheet',
    escalaSubMode: 'week', // 'week' (Semana) ou 'day' (Visão Diária integrada)
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
    firestoreDb: null
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

    await this.initFirebase();
    await this.loadAllData();

    this.switchView(this.state.currentView);

    window.addEventListener('resize', () => {
      this.updateTableColumnMetrics();
    });

    setInterval(() => {
      this.loadNowStatus();
    }, 60000);
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
    }

    if (window.lucide) lucide.createIcons();
  },

  // ================= NAVEGAÇÃO ENTRE ABAS (M3 EXPRESSIVE) =================
  switchView(viewName) {
    // Se alguém chamar 'daily', redireciona para 'spreadsheet' em modo 'day'
    if (viewName === 'daily') {
      this.state.currentView = 'spreadsheet';
      this.setEscalaSubMode('day');
      viewName = 'spreadsheet';
    } else {
      this.state.currentView = viewName;
    }

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

    // Mobile Bottom Navigation Bar (Material 3 Pill Indicators: Escala, Agora, Médicos, Fechamento)
    ['spreadsheet', 'now', 'doctors', 'stats'].forEach(v => {
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
      this.renderEscalaView();
    } else if (viewName === 'now') {
      this.loadNowStatus();
    } else if (viewName === 'doctors') {
      this.renderDoctorsCatalog();
    } else if (viewName === 'stats') {
      this.loadStats(this.state.currentMonth);
    }

    if (window.lucide) lucide.createIcons();
  },

  // ================= SUB-MODO DA PÁGINA "ESCALA": SEMANA VS DIA =================
  setEscalaSubMode(mode) {
    this.state.escalaSubMode = mode;

    const btnWeek = document.getElementById('escala-mode-week');
    const btnDay = document.getElementById('escala-mode-day');
    const weekWrapper = document.getElementById('escala-week-wrapper');
    const dayWrapper = document.getElementById('escala-day-wrapper');
    const weekPills = document.getElementById('week-nav-pills');
    const dayPickerBar = document.getElementById('day-picker-bar');

    if (mode === 'day') {
      if (btnDay) {
        btnDay.className = "px-3 py-1 rounded-full text-xs font-extrabold transition-all bg-brand-700 text-white shadow-sm";
      }
      if (btnWeek) {
        btnWeek.className = "px-3 py-1 rounded-full text-xs font-bold transition-all text-slate-600 hover:text-brand-950";
      }
      if (weekWrapper) weekWrapper.classList.add('hidden');
      if (dayWrapper) dayWrapper.classList.remove('hidden');
      if (weekPills) weekPills.classList.add('hidden');
      if (dayPickerBar) dayPickerBar.classList.remove('hidden');
    } else {
      if (btnWeek) {
        btnWeek.className = "px-3 py-1 rounded-full text-xs font-extrabold transition-all bg-brand-700 text-white shadow-sm";
      }
      if (btnDay) {
        btnDay.className = "px-3 py-1 rounded-full text-xs font-bold transition-all text-slate-600 hover:text-brand-950";
      }
      if (weekWrapper) weekWrapper.classList.remove('hidden');
      if (dayWrapper) dayWrapper.classList.add('hidden');
      if (weekPills) weekPills.classList.remove('hidden');
      if (dayPickerBar) dayPickerBar.classList.add('hidden');
    }

    this.renderEscalaView();
  },

  renderEscalaView() {
    if (this.state.escalaSubMode === 'day') {
      this.renderDailyView();
    } else {
      this.renderSpreadsheetView();
    }
  },

  handlePeriodPrev() {
    if (this.state.escalaSubMode === 'day') {
      this.prevDay();
    } else {
      this.prevMonth();
    }
  },

  handlePeriodNext() {
    if (this.state.escalaSubMode === 'day') {
      this.nextDay();
    } else {
      this.nextMonth();
    }
  },

  handleArrowPrev() {
    if (this.state.escalaSubMode === 'day') {
      this.prevDay();
    } else {
      this.prevWeek();
    }
  },

  handleArrowNext() {
    if (this.state.escalaSubMode === 'day') {
      this.nextDay();
    } else {
      this.nextWeek();
    }
  },

  handleTodayClick() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDate = todayStr.startsWith('2026-11') ? todayStr : '2026-11-03';
    this.state.selectedDate = targetDate;
    this.state.currentMonth = targetDate.slice(0, 7);

    if (this.state.escalaSubMode === 'day') {
      this.renderDailyView();
    } else {
      this.scrollToCurrentWeek();
    }
  },

  render() {
    this.updateModeUI();
    this.renderSpreadsheetView();
    this.renderDailyView();
    this.renderNowView();
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
  // 2. RENDER: PLANTÃO AGORA (ROTINEIRO APENAS ENTRE 07h E 13h)
  // =========================================================================
  renderNowView() {
    const data = this.state.activeShiftNow;
    if (!data) return;

    const shiftBadge = document.getElementById('now-shift-badge');
    const shiftTitle = document.getElementById('now-shift-title');

    if (shiftBadge) shiftBadge.textContent = data.shift_label || 'Turno Ativo';
    if (shiftTitle) shiftTitle.textContent = 'Equipe Plantonista em Serviço';

    // REQUISITO: Exibir o Rotineiro APENAS entre as 07:00 e as 13:00
    const nowHour = new Date().getHours();
    const isRoutineWindow = (nowHour >= 7 && nowHour < 13);

    const routineContainer = document.getElementById('now-routine-container');
    if (routineContainer) {
      if (isRoutineWindow && data.routine_doctor) {
        const doc = data.routine_doctor;
        const doctorObj = this.state.doctors.find(d => String(d.id) === String(doc.doctor_id)) || doc;
        const docName = doctorObj.name || doc.doctor_name;
        const docPhone = doctorObj.phone || doc.doctor_phone || '';
        const phoneDisplay = docPhone && docPhone.trim() !== '' ? docPhone : 'Não cadastrado';
        const hasPhone = Boolean(docPhone && docPhone.trim() !== '');

        routineContainer.innerHTML = `
          <div class="m3-card bg-gradient-to-r from-brand-50 via-white to-brand-50/50 border-2 border-brand-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-brand-300 shadow-sm bg-brand-50 shrink-0 flex items-center justify-center cursor-pointer"
                   onclick="app.openDoctorProfileById('${doc.doctor_id}')">
                ${this.renderAvatar(doctorObj.photo_url || doc.doctor_photo)}
              </div>
              <div>
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-brand-700 text-white">
                  🩺 ROTINEIRO (07-13h)
                </span>
                <h3 class="text-lg sm:text-xl font-extrabold text-brand-950 mt-1 cursor-pointer hover:text-brand-700"
                    onclick="app.openDoctorProfileById('${doc.doctor_id}')">
                  ${docName}
                </h3>
                
                <!-- Horário de Início e Término ACIMA do campo de telefone -->
                <div class="mt-2 bg-brand-100/80 border border-brand-200 px-3 py-1 rounded-xl text-xs font-extrabold text-brand-950 inline-block">
                  Início: 07:00 • Fim: 13:00
                </div>

                <div class="text-xs text-slate-600 font-mono mt-1.5">
                  Telefone: <span class="${hasPhone ? 'text-brand-950 font-bold' : 'italic text-slate-400'}">${phoneDisplay}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              ${hasPhone ? `
                <a href="tel:${this.cleanPhone(docPhone)}" 
                   class="flex items-center gap-1.5 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow transition">
                  <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                  <span>Ligar</span>
                </a>
                <a href="https://wa.me/55${this.cleanPhone(docPhone)}" target="_blank"
                   class="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow transition">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                  <span>WhatsApp</span>
                </a>
              ` : `
                <span class="text-xs text-slate-400 italic bg-m3-containerLow px-3.5 py-2 rounded-full border border-m3-outlineVariant/50">
                  Telefone não cadastrado
                </span>
              `}
            </div>
          </div>
        `;
      } else {
        // Fora do horário 07h–13h, exibe apenas os plantonistas
        routineContainer.innerHTML = '';
      }
    }

    // Grid dos Plantonistas Ativos
    const grid = document.getElementById('now-doctors-grid');
    if (grid) {
      if (data.active_shifts && data.active_shifts.length > 0) {
        grid.innerHTML = data.active_shifts.map(shift => {
          const doctorObj = this.state.doctors.find(d => String(d.id) === String(shift.doctor_id)) || shift;
          const docName = doctorObj.name || shift.doctor_name;
          const docPhone = doctorObj.phone || shift.doctor_phone || '';
          const phoneDisplay = docPhone && docPhone.trim() !== '' ? docPhone : 'Não cadastrado';
          const hasPhone = Boolean(docPhone && docPhone.trim() !== '');
          const startTime = shift.start_time || '07:00';
          const endTime = shift.end_time || '19:00';

          return `
            <div class="m3-card m3-card-interactive p-5 flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-3.5 mb-3.5">
                  <div class="w-16 h-16 rounded-2xl overflow-hidden border-2 border-brand-100 shadow-sm bg-brand-50 shrink-0 flex items-center justify-center cursor-pointer"
                       onclick="app.openDoctorProfileById('${shift.doctor_id}')">
                    ${this.renderAvatar(doctorObj.photo_url || shift.doctor_photo)}
                  </div>

                  <div class="flex-1 min-w-0">
                    <h4 class="font-extrabold text-brand-950 text-base leading-snug truncate cursor-pointer hover:text-brand-700"
                        onclick="app.openDoctorProfileById('${shift.doctor_id}')">
                      ${docName}
                    </h4>
                    <span class="inline-block mt-1 text-[11px] font-bold text-brand-800 bg-brand-100 px-2.5 py-0.5 rounded-full">
                      ${this.formatSpecialty(doctorObj.specialty)}
                    </span>
                  </div>
                </div>

                <!-- Horário de início e término do plantão ACIMA do campo de telefone -->
                <div class="bg-brand-50 rounded-2xl p-3 border border-brand-200/80 text-xs mb-2.5">
                  <span class="text-brand-700 font-bold block text-[10px] uppercase tracking-wider">Horário do Plantão</span>
                  <span class="font-extrabold text-brand-950 text-sm">Início: ${startTime} • Fim: ${endTime}</span>
                </div>

                <!-- Campo de Telefone -->
                <div class="bg-m3-containerLow rounded-2xl p-3 flex items-center justify-between text-xs border border-m3-outlineVariant/40 my-2">
                  <span class="text-slate-500 font-bold">Telefone:</span>
                  <span class="font-mono ${hasPhone ? 'text-brand-950 font-extrabold' : 'text-slate-400 italic font-medium'}">${phoneDisplay}</span>
                </div>
              </div>

              <!-- Botões de Ação M3 Pill -->
              <div class="grid grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-slate-100">
                ${hasPhone ? `
                  <a href="tel:${this.cleanPhone(docPhone)}" 
                     class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold shadow transition">
                    <i data-lucide="phone" class="w-3.5 h-3.5"></i>
                    <span>Ligar</span>
                  </a>
                  <a href="https://wa.me/55${this.cleanPhone(docPhone)}" target="_blank"
                     class="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition">
                    <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                    <span>WhatsApp</span>
                  </a>
                ` : `
                  <div class="col-span-2 text-center text-xs text-slate-400 italic py-2 bg-m3-containerLow rounded-full">
                    Telefone não cadastrado
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('');
      } else {
        grid.innerHTML = `
          <div class="col-span-full m3-card p-8 text-center">
            <i data-lucide="info" class="w-10 h-10 text-brand-400 mx-auto mb-2"></i>
            <h4 class="font-extrabold text-brand-950">Escala deste horário aberta</h4>
            <p class="text-xs text-slate-500 mt-1">Utilize a aba Escala para visualizar todos os dias do mês.</p>
          </div>
        `;
      }
    }

    if (window.lucide) lucide.createIcons();
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

      if (this.state.firebaseActive && this.state.firestoreDb) {
        const firestoreBatch = this.state.firestoreDb.batch();
        for (const item of batch) {
          const docKey = `${item.date}_${item.shift_type}_${item.slot_role}`;
          const ref = this.state.firestoreDb.collection('shifts').doc(docKey);
          firestoreBatch.set(ref, item);
        }
        await firestoreBatch.commit();
      } else {
        await fetch('/api/shifts/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shifts: batch })
        });
        await this.loadAllData();
      }

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
      if (this.state.firebaseActive && this.state.firestoreDb) {
        const docKey = `${slot.date}_${slot.shiftType}_${slot.slotRole}`;
        await this.state.firestoreDb.collection('shifts').doc(docKey).delete();
      } else {
        await fetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: slot.date,
            shift_type: slot.shiftType,
            slot_role: slot.slotRole,
            doctor_id: null
          })
        });
        await this.loadAllData();
      }

      this.closeShiftModal();
      this.renderSpreadsheetView();
      this.renderDailyView();
      this.showToast('Vaga liberada', 'info');
    } catch (e) {
      this.showToast('Erro ao remover', 'error');
    }
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
