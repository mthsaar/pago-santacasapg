import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import '../models/clinical_models.dart';

const String kFirebaseProjectId = 'pago---santa-casa-pg';
const String kGoogleWebClientId =
    '702434023267-5hn9uq2kage6b1m0vcaui61f67qasn8c.apps.googleusercontent.com';

class MaternityDataService extends ChangeNotifier {
  static const MethodChannel _notifChannel =
      MethodChannel('br.com.santacasapg/notifications');

  bool isEditorMode = false;
  String editorPin = '123456';
  String currentMonth = '2026-11';
  int currentWeekIndex = 3; // Semana atual (16/11 a 22/11)
  String selectedDate = '2026-11-20';

  String activeSheetId = kProvisionalSheetId;
  String appsScriptWebhookUrl = '';
  String lastSyncLabel = 'Sincronizando...';

  // Fluxo Firebase Auth (Google ou E-mail/Senha) > CRM > Boas-vindas & Notificações
  bool hasCompletedOnboarding = false;
  bool firebaseAuthInitialized = false;
  String? firebaseUid;
  String? googleUserName;
  String? googleUserEmail;
  String selectedNotificationDoctorId = 'ALL';
  bool notificationsEnabled = true;
  bool notifyOneHourBeforeShift = true;
  bool notifyClinicalReminders = true;

  // Seções colapsáveis e Prontuários protegidos por senha no Fechamento
  bool statsProfessionalsCollapsed = false;
  bool statsPatientsCollapsed = false;
  bool statsProntuariosCollapsed = false;
  bool isProntuariosUnlocked = false;

  final List<DoctorModel> doctors = [];
  final List<ShiftEntryModel> shifts = [];
  final Map<String, MaternityBedModel> sheetBedsMap = {};
  final Map<String, MaternityBedModel> firebaseBedsMap = {};
  final Map<String, PatientMedicalRecordModel> medicalRecordsByName = {};
  final List<String> extraBeds = [];
  bool sheetLoaded = false;

  final List<ClinicalReminderModel> clinicalReminders = [];
  final List<List<ShiftEntryModel>> _undoStack = [];
  final List<List<ShiftEntryModel>> _redoStack = [];
  final List<Map<String, dynamic>> auditHistoryLogs = [];

  Timer? _pollingTimer;

  bool get canUndo => _undoStack.isNotEmpty;
  bool get canRedo => _redoStack.isNotEmpty;

  List<PatientMedicalRecordModel> get allMedicalRecordsSorted {
    final list = medicalRecordsByName.values.toList();
    list.sort((a, b) => a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));
    return list;
  }

  MaternityDataService() {
    _seedInitialDoctorsAndSchedule();
    _seedInitialProvisionalMaternitySnapshot();
    initSync();
  }

  Future<void> initSync() async {
    await syncAllWithCloud();
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      syncAllWithCloud();
    });
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  Future<void> syncAllWithCloud({bool forceSheetPriority = false}) async {
    await Future.wait([
      _pullDoctorsFromFirestoreRest(),
      _pullShiftsFromFirestoreRest(),
      _pullMedicalRecordsFromFirestoreRest(),
      syncFromGoogleSheetAndFirestore(forceSheetPriority: forceSheetPriority),
    ]);
  }

  static const List<String> kMonthNamesPt = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  int get currentYearInt {
    final parts = currentMonth.split('-');
    return int.tryParse(parts.first) ?? 2026;
  }

  int get currentMonthInt {
    final parts = currentMonth.split('-');
    return (parts.length > 1 ? int.tryParse(parts[1]) : null) ?? 11;
  }

  String formatMonthYearPt(String yyyyMm) {
    final parts = yyyyMm.split('-');
    final y = int.tryParse(parts.first) ?? 2026;
    final m = (parts.length > 1 ? int.tryParse(parts[1]) : null) ?? 11;
    final idx = (m - 1).clamp(0, 11);
    return '${kMonthNamesPt[idx]} $y';
  }

  List<List<DateTime>> getWeeksOfMonth(int year, int month) {
    final firstOfMonth = DateTime(year, month, 1);
    final lastOfMonth = DateTime(year, month + 1, 0);

    final firstDayIndex = firstOfMonth.weekday - 1; // 0 = Seg .. 6 = Dom
    final startDate = firstOfMonth.subtract(Duration(days: firstDayIndex));

    final lastDayIndex = lastOfMonth.weekday - 1;
    final endDate = lastOfMonth.add(Duration(days: 6 - lastDayIndex));

    final weeks = <List<DateTime>>[];
    var cursor = startDate;

    while (!cursor.isAfter(endDate)) {
      final week = <DateTime>[];
      for (int i = 0; i < 7; i++) {
        week.add(cursor);
        cursor = cursor.add(const Duration(days: 1));
      }
      weeks.add(week);
    }
    return weeks;
  }

  void setMonthYear(int year, int month) {
    final mStr = month.toString().padLeft(2, '0');
    currentMonth = '$year-$mStr';
    currentWeekIndex = 0;
    notifyListeners();
  }

  void jumpToToday() {
    final now = DateTime.now();
    final targetDate =
        (now.year >= 2026) ? now : DateTime(2026, 11, 20);
    final mStr = targetDate.month.toString().padLeft(2, '0');
    final dStr = targetDate.day.toString().padLeft(2, '0');
    currentMonth = '${targetDate.year}-$mStr';
    selectedDate = '${targetDate.year}-$mStr-$dStr';

    final weeks = getWeeksOfMonth(targetDate.year, targetDate.month);
    int foundIdx = 0;
    for (int i = 0; i < weeks.length; i++) {
      for (final day in weeks[i]) {
        if (day.year == targetDate.year &&
            day.month == targetDate.month &&
            day.day == targetDate.day) {
          foundIdx = i;
          break;
        }
      }
    }
    currentWeekIndex = foundIdx;
    notifyListeners();
  }

  /// Solicita permissão nativa de notificações ao Android (API 33+) e iOS
  Future<void> requestNativeNotificationPermission({DoctorModel? doctor}) async {
    notificationsEnabled = true;
    notifyOneHourBeforeShift = true;
    notifyClinicalReminders = true;
    try {
      await _notifChannel.invokeMethod('requestPermission');
      if (doctor != null) {
        await _notifChannel.invokeMethod('showNotification', {
          'title': 'Santa Casa PG • Notificações Ativas',
          'body':
              'Dr(a). ${doctor.name}: Alertas de plantão (1h antes) e lembretes de pacientes ativados neste aparelho.',
        });
      }
    } catch (_) {}
    notifyListeners();
  }

  Future<void> triggerNativeNotification(String title, String body) async {
    if (!notificationsEnabled) return;
    try {
      await _notifChannel.invokeMethod('showNotification', {
        'title': title,
        'body': body,
      });
    } catch (_) {}
  }

  void _seedInitialDoctorsAndSchedule() {
    const initialNames = [
      'Henrique H', 'Tainá', 'Severino', 'Jéssica', 'Ianara', 'Aline',
      'Rodolfo', 'Kauana', 'Vanessa', 'Fernanda', 'Bruno', 'Yohanna',
      'Edson', 'Francine', 'Karoline', 'Edy Felipe', 'Henrique T', 'Celso',
      'Virgínia', 'William', 'Ana Carol', 'Nicolli', 'Cristhyan', 'Camila'
    ];

    doctors.clear();
    final nameToId = <String, String>{};
    for (int i = 0; i < initialNames.length; i++) {
      final id = '${i + 1}';
      nameToId[initialNames[i]] = id;
      doctors.add(DoctorModel(
        id: id,
        name: initialNames[i],
        specialty: 'GO',
      ));
    }

    const rawSchedule = <int, Map<String, String>>{
      1: {'m1': 'Cristhyan', 'm2': 'Camila', 'a1': 'Cristhyan', 'a2': 'Camila', 'n1': 'Cristhyan', 'n2': 'Camila'},
      2: {'rotin': 'Henrique H', 'm1': 'Ianara', 'm2': 'Aline', 'a1': 'Ianara', 'a2': 'Aline', 'n1': 'Bruno'},
      3: {'rotin': 'Henrique H', 'm1': 'Tainá', 'm2': 'Rodolfo', 'a1': 'Vanessa', 'a2': 'Rodolfo', 'extra': 'Ianara', 'n1': 'Henrique H'},
      4: {'rotin': 'Tainá', 'm1': 'Severino', 'm2': 'Kauana', 'a1': 'Severino', 'a2': 'Kauana', 'extra': 'Jéssica'},
      5: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Kauana', 'a1': 'Jéssica', 'a2': 'Kauana', 'n1': 'Severino', 'n2': 'Fernanda'},
      6: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Fernanda', 'a1': 'Jéssica', 'a2': 'Fernanda', 'n1': 'Yohanna'},
      7: {'m1': 'Jéssica', 'm2': 'Aline', 'a1': 'Jéssica', 'a2': 'Aline'},
      8: {'m1': 'Fernanda', 'm2': 'Vanessa', 'a1': 'Fernanda', 'a2': 'Vanessa', 'n1': 'Fernanda', 'n2': 'Severino'},
      9: {'rotin': 'Henrique H', 'm1': 'Edson', 'm2': 'Rodolfo', 'a1': 'Francine', 'a2': 'Karoline', 'n1': 'Henrique T'},
      10: {'rotin': 'Henrique H', 'm1': 'Tainá', 'm2': 'Rodolfo', 'a1': 'Vanessa', 'a2': 'Rodolfo', 'n1': 'Edson', 'n2': 'Edy Felipe'},
      11: {'rotin': 'Tainá', 'm1': 'Severino', 'm2': 'Kauana', 'a1': 'Severino', 'a2': 'Kauana', 'extra': 'Jéssica', 'n1': 'Yohanna'},
      12: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Kauana', 'a1': 'Jéssica', 'a2': 'Kauana', 'n1': 'Celso'},
      13: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'a1': 'Jéssica'},
      14: {'n1': 'Severino', 'n2': 'Virgínia'},
      15: {'m1': 'Severino', 'm2': 'Cristhyan', 'a1': 'Severino', 'a2': 'Cristhyan', 'extra': 'Vanessa', 'n1': 'Edson'},
      16: {'rotin': 'Henrique H', 'm1': 'Edson', 'm2': 'Aline', 'a1': 'Francine', 'a2': 'Aline', 'extra': 'Ianara', 'n1': 'Henrique T', 'n2': 'Henrique H'},
      17: {'rotin': 'Henrique H', 'm1': 'Tainá', 'm2': 'Rodolfo', 'a1': 'Vanessa', 'a2': 'Rodolfo', 'n1': 'Nicolli', 'n2': 'Henrique H'},
      18: {'rotin': 'Tainá', 'm1': 'Severino', 'm2': 'Kauana', 'a1': 'Severino', 'a2': 'Kauana', 'n1': 'Nicolli', 'n2': 'Ianara'},
      19: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Kauana', 'a1': 'Jéssica', 'a2': 'Kauana', 'n1': 'Severino', 'n2': 'Fernanda'},
      20: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Aline', 'a1': 'Jéssica', 'a2': 'Aline', 'n1': 'Bruno', 'n2': 'Nicolli'},
      21: {'m1': 'William', 'm2': 'Ana Carol', 'a1': 'William', 'a2': 'Ana Carol', 'n1': 'William', 'n2': 'Ana Carol'},
      22: {'m1': 'William', 'm2': 'Ana Carol', 'a1': 'William', 'a2': 'Ana Carol'},
      23: {'rotin': 'Henrique H', 'm1': 'Edson', 'm2': 'Rodolfo', 'a1': 'Francine', 'a2': 'Karoline', 'n1': 'Henrique T'},
      24: {'rotin': 'Henrique H', 'm1': 'Tainá', 'm2': 'Rodolfo', 'a1': 'Vanessa', 'a2': 'Rodolfo', 'n1': 'Edson', 'n2': 'Edy Felipe'},
      25: {'rotin': 'Tainá', 'm1': 'Severino', 'm2': 'Kauana', 'a1': 'Severino', 'a2': 'Kauana', 'n1': 'Nicolli'},
      26: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Kauana', 'a1': 'Jéssica', 'a2': 'Kauana', 'n1': 'Nicolli'},
      27: {'rotin': 'Henrique H', 'm1': 'Jéssica', 'm2': 'Aline', 'a1': 'Jéssica', 'a2': 'Aline', 'n1': 'Nicolli'},
      28: {'m1': 'Bruno', 'm2': 'Nicolli', 'a1': 'Bruno', 'a2': 'Nicolli', 'n1': 'Bruno'},
      29: {'m1': 'Vanessa', 'm2': 'Nicolli', 'a1': 'Vanessa', 'a2': 'Nicolli', 'n1': 'Cristhyan', 'n2': 'Edson'},
      30: {'rotin': 'Henrique H', 'm1': 'Edson', 'm2': 'Aline', 'a1': 'Francine', 'a2': 'Aline', 'n1': 'Henrique T'},
    };

    const roleToShiftType = <String, String>{
      'rotin': 'routine',
      'm1': 'morning',
      'm2': 'morning',
      'a1': 'afternoon',
      'a2': 'afternoon',
      'extra': 'evening',
      'n1': 'night',
      'n2': 'night',
    };

    shifts.clear();
    rawSchedule.forEach((day, dayMap) {
      final dateStr = '2026-11-${day.toString().padLeft(2, '0')}';
      dayMap.forEach((slotRole, docName) {
        final docId = nameToId[docName] ?? '1';
        final shiftType = roleToShiftType[slotRole] ?? 'morning';
        shifts.add(ShiftEntryModel(
          id: '${dateStr}_${shiftType}_$slotRole',
          date: dateStr,
          shiftType: shiftType,
          slotRole: slotRole,
          doctorId: docId,
          doctorName: docName,
        ));
      });
    });

    doctors.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  }

  Future<void> _pullShiftsFromFirestoreRest() async {
    try {
      final url = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/shifts?pageSize=300',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 7));
      if (res.statusCode != 200) return;

      final decoded = jsonDecode(res.body) as Map<String, dynamic>;
      final docs = decoded['documents'] as List<dynamic>? ?? [];
      if (docs.isEmpty) return;

      final fetched = <ShiftEntryModel>[];
      for (final d in docs) {
        final map = d as Map<String, dynamic>;
        final docId = (map['name']?.toString() ?? '').split('/').last;
        final fields = map['fields'] as Map<String, dynamic>? ?? {};

        String strField(String k) {
          final f = fields[k] as Map<String, dynamic>?;
          if (f == null) return '';
          return (f['stringValue'] ?? f['integerValue'] ?? '').toString();
        }

        final date = strField('date').trim();
        final shiftType = strField('shift_type').trim();
        final slotRole = strField('slot_role').trim();
        final doctorId = strField('doctor_id').trim();
        final doctorName = strField('doctor_name').trim();
        if (date.isEmpty || shiftType.isEmpty) continue;

        fetched.add(ShiftEntryModel(
          id: docId,
          date: date,
          shiftType: shiftType,
          slotRole: slotRole,
          doctorId: doctorId,
          doctorName: doctorName,
        ));
      }

      if (fetched.isNotEmpty) {
        final byId = <String, ShiftEntryModel>{
          for (final s in shifts) s.id: s,
        };
        for (final s in fetched) {
          byId[s.id] = s;
        }
        shifts
          ..clear()
          ..addAll(byId.values);
        notifyListeners();
      }
    } catch (_) {}
  }

  /// Sincroniza a coleção `doctors` do Firebase Firestore para que qualquer médico
  /// adicionado na Web apareça imediatamente no app Android/iOS e vice-versa.
  Future<void> _pullDoctorsFromFirestoreRest() async {
    try {
      final url = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/doctors?pageSize=200',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 7));
      if (res.statusCode != 200) return;

      final decoded = jsonDecode(res.body) as Map<String, dynamic>;
      final docs = decoded['documents'] as List<dynamic>? ?? [];
      if (docs.isEmpty) return;

      final fetchedDoctors = <DoctorModel>[];
      for (final d in docs) {
        final map = d as Map<String, dynamic>;
        final fullPath = map['name']?.toString() ?? '';
        final docIdFromPath = fullPath.split('/').last;
        final fields = map['fields'] as Map<String, dynamic>? ?? {};

        String strField(String k) {
          final f = fields[k] as Map<String, dynamic>?;
          if (f == null) return '';
          return (f['stringValue'] ?? f['integerValue'] ?? '').toString();
        }

        final name = strField('name').trim();
        if (name.isEmpty) continue;
        final id = strField('id').trim().isNotEmpty ? strField('id').trim() : docIdFromPath;

        fetchedDoctors.add(DoctorModel(
          id: id,
          name: name,
          phone: strField('phone'),
          crm: strField('crm'),
          specialty: strField('specialty').isNotEmpty ? strField('specialty') : 'GO',
          photoUrl: strField('photo_url'),
          linkedGoogleEmail: strField('linked_google_email'),
          linkedGoogleName: strField('linked_google_name'),
        ));
      }

      if (fetchedDoctors.isNotEmpty) {
        // Mescla por ID e Nome para manter médicos do Firebase e locais sincronizados
        final byId = <String, DoctorModel>{};
        for (final fd in fetchedDoctors) {
          byId[fd.id] = fd;
        }
        doctors
          ..clear()
          ..addAll(byId.values);
        doctors.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        notifyListeners();
      }
    } catch (_) {}
  }

  /// Adiciona ou edita um médico e salva diretamente no Firebase Firestore
  Future<void> saveOrUpdateDoctorToCloud(DoctorModel doc) async {
    final idx = doctors.indexWhere((d) => d.id == doc.id);
    if (idx >= 0) {
      doctors[idx] = doc;
    } else {
      doctors.add(doc);
    }
    doctors.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    notifyListeners();

    try {
      final fsUrl = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/doctors/${doc.id}',
      );
      await http.patch(
        fsUrl,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'fields': {
            'id': {'stringValue': doc.id},
            'name': {'stringValue': doc.name},
            'phone': {'stringValue': doc.phone},
            'crm': {'stringValue': doc.crm},
            'specialty': {'stringValue': doc.specialty},
            'photo_url': {'stringValue': doc.photoUrl},
            'linked_google_email': {'stringValue': doc.linkedGoogleEmail},
            'linked_google_name': {'stringValue': doc.linkedGoogleName},
          }
        }),
      );
    } catch (_) {}
  }

  Future<void> deleteDoctorFromCloud(String doctorId) async {
    doctors.removeWhere((d) => d.id == doctorId);
    notifyListeners();
    try {
      final fsUrl = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/doctors/$doctorId',
      );
      await http.delete(fsUrl);
    } catch (_) {}
  }

  void _seedInitialProvisionalMaternitySnapshot() {
    final seedRows = <MaternityBedModel>[
      const MaternityBedModel(
        leito: 'PRÉ 1',
        nome: '(PAS) Amanda Dallazoana Langue',
        paridade: 'G3P1A1',
        tipoSanguineo: 'O+',
        altoRisco: 'DMGA2 mau controle',
        internacaoPor: 'CST em 20/11 às',
      ),
      const MaternityBedModel(
        leito: 'PRÉ 3',
        nome: 'Leticia Vitoria Vieiras Rosas',
        paridade: 'G1',
        tipoSanguineo: 'O+',
        altoRisco: 'HAC',
        internacaoPor: 'indução de parto',
      ),
      const MaternityBedModel(
        leito: '302',
        nome: 'Karen Naomi Morais',
        paridade: 'G4P4',
        tipoSanguineo: 'A+',
        altoRisco: 'HAC + Obesidade',
        internacaoPor: 'PN em 20/11 às 02h18 (mas. 4270 9/10)',
        observacoes: 'Mantenho sem antiHAS e observar',
      ),
      const MaternityBedModel(
        leito: '303',
        nome: 'Brenda Eduarda Sampaio Vicente',
        paridade: 'G4P1C2',
        tipoSanguineo: 'O-',
        altoRisco: 'ITU repetição',
        internacaoPor: 'IG 24 sem | Internou por suspeita de colestase intra-hepática',
        observacoes:
            'Iniciado Ursacol | Aval. Clinica | D2 nitrofurantoína por ITU (uroc externa). Aguardo alta de CM // Candidíase -> nistatina',
      ),
      const MaternityBedModel(
        leito: '304',
        nome: 'Carolina Baniski Costa Mendes',
        paridade: 'G3P1C2',
        tipoSanguineo: 'O+',
        altoRisco: 'DMG ID + HAC',
        internacaoPor: 'CST em 18/11 às 15h59 (fem 3190 8/9)',
      ),
      const MaternityBedModel(
        leito: '305',
        nome: 'Beatriz Dalvana Santos Pradro',
        paridade: 'G3C2',
        tipoSanguineo: 'A+',
        altoRisco: 'Obesidade + DMG A2',
        internacaoPor: 'IGe 33+6 sem | Internou para controle glicêmico',
        observacoes: 'Ajuste da NPH noite // provável alta amanhã se controle top top',
      ),
      const MaternityBedModel(
        leito: '306',
        nome: 'Kelly Cristini Leodoro Machado',
        paridade: 'G3P1A1',
        tipoSanguineo: 'O+',
        altoRisco: 'Nefrolitíase + PNA + TPP nesta gestação',
        internacaoPor: 'IGe 34+6 | Inernou por RPPMO',
        observacoes: 'D1 de 2 de ampicilina, amanhã trocar para amoxicilina | Central de leitos',
      ),
      const MaternityBedModel(
        leito: '307',
        nome: 'Danielle Cristina de Farias Martins',
        paridade: 'G3P2',
        tipoSanguineo: 'O+',
        altoRisco: 'Nefrolitíase',
        internacaoPor: 'IGe 27+5 | Internou por nefrolitíase + PNA?',
        observacoes: 'D2 ceftriaxona EV // hoje à noite 48h de ATB, provável alta amanhã',
      ),
      const MaternityBedModel(
        leito: '308',
        nome: 'Maria Eduarda Alves Batistel',
        paridade: 'G1',
        tipoSanguineo: 'A+',
        altoRisco: 'RCIU E3',
        internacaoPor: 'IGe 25+3 sem | Internou por anidrânio e alteração de Doppler',
        observacoes:
            'Betametasona 18 e 19/11 às 13h30. Diástole reversa na AU. Ducto venoso onda A positiva | Pedi USG Doppler hoje | Central de leitos',
      ),
      const MaternityBedModel(
        leito: '309',
        nome: 'Edina Leite da Rosa',
        paridade: 'G5C4A1',
        tipoSanguineo: 'A+',
        altoRisco: 'DMG + Anemia',
        internacaoPor: 'CST + LTB em 18/11 às 10h31',
        observacoes: 'RN na UTI neo',
      ),
      const MaternityBedModel(
        leito: '319-1',
        nome: 'Isabela Cristaldo de Souza',
        paridade: 'G1',
        tipoSanguineo: 'O+',
        altoRisco: 'RCIU precoce + PTI (SAAF?)',
        internacaoPor: 'IGe 31+3 | Internou para realizar enoxaparina profilática',
        observacoes: 'Pedi USG Doppler hoje',
      ),
      const MaternityBedModel(
        leito: '319-2',
        nome: 'Ocalina Aparecida Fatima Rocha',
        paridade: 'G3C2',
        tipoSanguineo: 'A+',
        altoRisco: 'Obesidade + DM2 ID + IMA + HAC',
        internacaoPor: 'IGe 34+2 sem | Internou por colelitíase sintomática',
      ),
      const MaternityBedModel(
        leito: '321-1',
        nome: 'Dircelia Aparecida de Melo',
        paridade: 'G5P4A1',
        tipoSanguineo: 'O+',
        altoRisco: 'DM2 ID c/ repercussão + CIV mínima',
        internacaoPor: 'PN em 19/11 20:52 (fem 4170 g 9/10)',
      ),
      const MaternityBedModel(
        leito: '321-2',
        nome: 'Gabriela Ramos de Carvalho',
        paridade: 'G5P1C4',
        tipoSanguineo: 'B+',
        altoRisco: 'Iteratividade + PNA + TPP nesta gestação',
        internacaoPor: 'CST+DIU 19/11 às 10:40. (fem 3135 g 9/10)',
        observacoes: '* Restrição judicial *',
      ),
      const MaternityBedModel(
        leito: '323-1',
        nome: 'Pamela Goncalves Safraide',
        paridade: 'G2C2',
        tipoSanguineo: 'O+',
        altoRisco: 'HAC + PE',
        internacaoPor: 'CST em 19/11 às 12:05',
        observacoes: 'Prescrevi enalapril 10 mg 12/12 horas + metildopa 750 mg/d',
      ),
      const MaternityBedModel(
        leito: '325-2',
        nome: 'Angélica Morais do Nascimento',
        paridade: 'G5P3C1',
        tipoSanguineo: 'A+',
        altoRisco: 'DMG A2 ID + ITU de repetição + TAG',
        internacaoPor: 'CST + LTB em 19/11 às 13:05',
      ),
    ];

    for (final row in seedRows) {
      sheetBedsMap[normalizeLeitoKey(row.leito)] = row;
      _upsertMedicalRecordFromBed(row, isDischarge: false, syncCloud: false);
    }
    sheetLoaded = true;
  }

  String normalizeLeitoKey(String leito) => leito.trim().toUpperCase();

  String leitoToDocId(String leito) {
    return normalizeLeitoKey(leito)
        .replaceAll('É', 'E')
        .replaceAll(RegExp(r'[^A-Z0-9_-]'), '_');
  }

  String _patientNameKey(String name) {
    return name
        .trim()
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9À-Ú]'), '_')
        .replaceAll(RegExp(r'_+'), '_');
  }

  void _upsertMedicalRecordFromBed(
    MaternityBedModel bed, {
    required bool isDischarge,
    bool syncCloud = true,
  }) {
    final cleanName = bed.nome.trim();
    if (cleanName.isEmpty) return;

    final key = _patientNameKey(cleanName);
    final existing = medicalRecordsByName[key];
    final nowIso = DateTime.now().toIso8601String();

    final record = PatientMedicalRecordModel(
      id: existing?.id ?? 'pront_${bed.leito.replaceAll(' ', '_')}_$key',
      nome: cleanName,
      leito: bed.leito,
      paridade: bed.paridade.isNotEmpty ? bed.paridade : (existing?.paridade ?? ''),
      tipoSanguineo:
          bed.tipoSanguineo.isNotEmpty ? bed.tipoSanguineo : (existing?.tipoSanguineo ?? ''),
      altoRisco: bed.altoRisco.isNotEmpty ? bed.altoRisco : (existing?.altoRisco ?? ''),
      internacaoPor:
          bed.internacaoPor.isNotEmpty ? bed.internacaoPor : (existing?.internacaoPor ?? ''),
      observacoes:
          bed.observacoes.isNotEmpty ? bed.observacoes : (existing?.observacoes ?? ''),
      admittedAt: existing?.admittedAt.isNotEmpty == true ? existing!.admittedAt : nowIso,
      dischargedAt: isDischarge ? nowIso : (existing?.dischargedAt ?? ''),
      status: isDischarge ? 'discharged' : 'active',
    );

    medicalRecordsByName[key] = record;

    if (syncCloud) {
      _pushMedicalRecordToFirestore(record);
    }
  }

  Future<void> _pullMedicalRecordsFromFirestoreRest() async {
    try {
      final url = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/maternity_admissions?pageSize=300',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 7));
      if (res.statusCode != 200) return;

      final decoded = jsonDecode(res.body) as Map<String, dynamic>;
      final docs = decoded['documents'] as List<dynamic>? ?? [];
      for (final d in docs) {
        final map = d as Map<String, dynamic>;
        final docId = (map['name']?.toString() ?? '').split('/').last;
        final fields = map['fields'] as Map<String, dynamic>? ?? {};

        String strField(String k) =>
            (fields[k] as Map<String, dynamic>?)?['stringValue']?.toString() ?? '';

        final nome = strField('nome').trim();
        if (nome.isEmpty) continue;
        final key = _patientNameKey(nome);
        medicalRecordsByName[key] = PatientMedicalRecordModel(
          id: strField('id').isNotEmpty ? strField('id') : docId,
          nome: nome,
          leito: strField('leito'),
          paridade: strField('paridade'),
          tipoSanguineo: strField('tipo_sanguineo'),
          altoRisco: strField('alto_risco'),
          internacaoPor: strField('internacao_por'),
          observacoes: strField('observacoes'),
          admittedAt: strField('admitted_at'),
          dischargedAt: strField('discharged_at'),
          status: strField('status').isNotEmpty ? strField('status') : 'active',
        );
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> _pushMedicalRecordToFirestore(PatientMedicalRecordModel rec) async {
    try {
      final safeDocId = rec.id.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
      final url = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/maternity_admissions/$safeDocId',
      );
      await http.patch(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'fields': {
            'id': {'stringValue': safeDocId},
            'nome': {'stringValue': rec.nome},
            'leito': {'stringValue': rec.leito},
            'paridade': {'stringValue': rec.paridade},
            'tipo_sanguineo': {'stringValue': rec.tipoSanguineo},
            'alto_risco': {'stringValue': rec.altoRisco},
            'internacao_por': {'stringValue': rec.internacaoPor},
            'observacoes': {'stringValue': rec.observacoes},
            'admitted_at': {'stringValue': rec.admittedAt},
            'discharged_at': {'stringValue': rec.dischargedAt},
            'status': {'stringValue': rec.status},
            'month': {'stringValue': currentMonth},
          }
        }),
      );
    } catch (_) {}
  }

  List<MaternityBedGroup> getAllMaternityGroups() {
    final list = List<MaternityBedGroup>.from(kDefaultMaternityGroups);
    if (extraBeds.isNotEmpty) {
      list.add(MaternityBedGroup(title: 'Outros Leitos', beds: List<String>.from(extraBeds)));
    }
    return list;
  }

  List<String> getAllMaternityBedsFlat() {
    final beds = <String>[];
    for (final g in getAllMaternityGroups()) {
      beds.addAll(g.beds);
    }
    return beds;
  }

  MaternityBedModel getBedData(String leito) {
    final key = normalizeLeitoKey(leito);
    final sh = sheetBedsMap[key];
    final fb = firebaseBedsMap[key];

    if (sheetLoaded) {
      final sheetEntry = sh ?? MaternityBedModel(leito: leito);
      final shSig = sheetEntry.signature;
      final hasWebAppOverride = fb != null &&
          fb.source == 'webapp' &&
          fb.sheetBaselineSig.isNotEmpty &&
          fb.sheetBaselineSig == shSig;
      if (hasWebAppOverride) {
        return fb;
      }
      return sheetEntry;
    }

    if (fb != null && fb.isOccupied) return fb;
    if (sh != null && sh.isOccupied) return sh;
    return MaternityBedModel(leito: leito);
  }

  Future<bool> syncFromGoogleSheetAndFirestore({bool forceSheetPriority = false}) async {
    try {
      final url = Uri.parse(
        'https://docs.google.com/spreadsheets/d/$activeSheetId/gviz/tq?tqx=out:csv&headers=0&gid=0&_t=${DateTime.now().millisecondsSinceEpoch}',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 9));
      if (res.statusCode == 200 && res.body.isNotEmpty) {
        final rows = _parseCsv(res.body);
        _processGoogleSheetRows(rows, forceSheetPriority: forceSheetPriority);
        final now = DateTime.now();
        final hh = now.hour.toString().padLeft(2, '0');
        final mm = now.minute.toString().padLeft(2, '0');
        final ss = now.second.toString().padLeft(2, '0');
        lastSyncLabel = 'Sincronizado às $hh:$mm:$ss';
        notifyListeners();
        return true;
      }
    } catch (_) {
      await _pullBedsFromFirestoreRest();
    }
    final now = DateTime.now();
    lastSyncLabel =
        'Sincronizado às ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
    notifyListeners();
    return false;
  }

  void _processGoogleSheetRows(List<List<String>> rows, {bool forceSheetPriority = false}) {
    final knownSet = <String>{};
    for (final g in kDefaultMaternityGroups) {
      for (final b in g.beds) {
        knownSet.add(normalizeLeitoKey(b));
      }
    }

    bool hasTsColumn = true;
    for (int i = 0; i < rows.length && i < 5; i++) {
      final c0 = (rows[i].isNotEmpty ? rows[i][0] : '').trim().toUpperCase();
      if (c0 == 'LEITO' && rows[i].length > 3) {
        final c3 = rows[i][3].trim().toUpperCase();
        hasTsColumn = c3.startsWith('T.S') || c3.contains('SANGU') || !c3.contains('RISCO');
        break;
      }
    }

    final newSheetMap = <String, MaternityBedModel>{};
    final newExtraBeds = <String>[];

    for (final cols in rows) {
      if (cols.isEmpty) continue;
      var rawLeito = cols[0].trim();
      if (rawLeito.isEmpty) continue;

      var upperLeito = rawLeito.toUpperCase();
      if (upperLeito.startsWith('PASSAGEM DE PLANT') || upperLeito == 'LEITO') {
        continue;
      }

      if (newSheetMap.containsKey(upperLeito) && newSheetMap[upperLeito]!.isOccupied) {
        if (upperLeito.endsWith('-1')) {
          final twin = upperLeito.replaceAll(RegExp(r'-1$'), '-2');
          if (!newSheetMap.containsKey(twin) || !newSheetMap[twin]!.isOccupied) {
            rawLeito = twin;
            upperLeito = twin;
          }
        }
      }

      String getCol(int idx) => idx < cols.length ? cols[idx].trim() : '';

      final entry = MaternityBedModel(
        leito: rawLeito,
        nome: getCol(1),
        paridade: getCol(2),
        tipoSanguineo: hasTsColumn ? getCol(3) : '',
        altoRisco: getCol(hasTsColumn ? 4 : 3),
        internacaoPor: getCol(hasTsColumn ? 5 : 4),
        observacoes: getCol(hasTsColumn ? 6 : 5),
        updatedAt: DateTime.now().toIso8601String(),
        source: 'google_sheets',
      );

      // Se havia uma paciente neste leito antes e agora o leito esvaziou na planilha, registra a alta no Prontuário!
      final prevInSheet = sheetBedsMap[upperLeito];
      if (prevInSheet != null &&
          prevInSheet.nome.trim().isNotEmpty &&
          entry.nome.trim().isEmpty) {
        _upsertMedicalRecordFromBed(prevInSheet, isDischarge: true, syncCloud: true);
      } else if (entry.nome.trim().isNotEmpty) {
        _upsertMedicalRecordFromBed(entry, isDischarge: false, syncCloud: false);
      }

      newSheetMap[upperLeito] = entry;
      if (!knownSet.contains(upperLeito)) {
        knownSet.add(upperLeito);
        newExtraBeds.add(rawLeito);
      }
    }

    sheetBedsMap
      ..clear()
      ..addAll(newSheetMap);
    extraBeds
      ..clear()
      ..addAll(newExtraBeds);
    sheetLoaded = true;

    if (forceSheetPriority) {
      firebaseBedsMap.clear();
    }
  }

  Future<void> _pullBedsFromFirestoreRest() async {
    try {
      final url = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/maternity_patients?pageSize=100',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 7));
      if (res.statusCode != 200) return;

      final decoded = jsonDecode(res.body) as Map<String, dynamic>;
      final docs = decoded['documents'] as List<dynamic>? ?? [];
      for (final d in docs) {
        final fields = (d as Map<String, dynamic>)['fields'] as Map<String, dynamic>? ?? {};
        String strField(String k) =>
            (fields[k] as Map<String, dynamic>?)?['stringValue']?.toString() ?? '';

        final leito = strField('leito');
        if (leito.isEmpty) continue;
        final model = MaternityBedModel(
          leito: leito,
          nome: strField('nome'),
          paridade: strField('paridade'),
          tipoSanguineo: strField('tipo_sanguineo'),
          altoRisco: strField('alto_risco'),
          internacaoPor: strField('internacao_por'),
          observacoes: strField('observacoes'),
          updatedAt: strField('updated_at'),
          source: strField('source'),
          sheetBaselineSig: strField('sheet_baseline_sig'),
        );
        firebaseBedsMap[normalizeLeitoKey(leito)] = model;
        if (model.nome.trim().isNotEmpty) {
          _upsertMedicalRecordFromBed(model, isDischarge: false, syncCloud: false);
        }
      }
    } catch (_) {}
  }

  Future<void> saveBedEvolution(MaternityBedModel updatedBed) async {
    final key = normalizeLeitoKey(updatedBed.leito);
    final prevBed = getBedData(updatedBed.leito);
    final baselineSheetSig =
        (sheetBedsMap[key] ?? MaternityBedModel(leito: updatedBed.leito)).signature;
    final nowIso = DateTime.now().toIso8601String();

    auditHistoryLogs.add({
      'timestamp': nowIso,
      'leito': updatedBed.leito,
      'previous': prevBed.signature,
      'updated': updatedBed.signature,
    });

    if (updatedBed.nome.trim().isNotEmpty) {
      _upsertMedicalRecordFromBed(updatedBed, isDischarge: false, syncCloud: true);
    } else if (prevBed.nome.trim().isNotEmpty) {
      _upsertMedicalRecordFromBed(prevBed, isDischarge: true, syncCloud: true);
    }

    final record = updatedBed.copyWith(
      updatedAt: nowIso,
      source: 'webapp',
      sheetBaselineSig: baselineSheetSig,
    );

    firebaseBedsMap[key] = record;
    sheetBedsMap[key] = record;
    notifyListeners();

    try {
      final docId = leitoToDocId(record.leito);
      final fsUrl = Uri.parse(
        'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/maternity_patients/$docId',
      );
      await http.patch(
        fsUrl,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'fields': {
            'leito': {'stringValue': record.leito},
            'nome': {'stringValue': record.nome},
            'paridade': {'stringValue': record.paridade},
            'tipo_sanguineo': {'stringValue': record.tipoSanguineo},
            'alto_risco': {'stringValue': record.altoRisco},
            'internacao_por': {'stringValue': record.internacaoPor},
            'observacoes': {'stringValue': record.observacoes},
            'updated_at': {'stringValue': record.updatedAt},
            'source': {'stringValue': 'webapp'},
            'sheet_baseline_sig': {'stringValue': record.sheetBaselineSig},
          }
        }),
      );
    } catch (_) {}

    if (appsScriptWebhookUrl.trim().isNotEmpty) {
      try {
        await http.post(
          Uri.parse(appsScriptWebhookUrl.trim()),
          headers: {'Content-Type': 'text/plain;charset=utf-8'},
          body: jsonEncode({
            'sheet_id': activeSheetId,
            'leito': record.leito,
            'nome': record.nome,
            'paridade': record.paridade,
            'tipo_sanguineo': record.tipoSanguineo,
            'alto_risco': record.altoRisco,
            'internacao_por': record.internacaoPor,
            'observacoes': record.observacoes,
          }),
        );
      } catch (_) {}
    }
  }

  Future<void> dischargeBed(String leito) async {
    final prev = getBedData(leito);
    if (prev.nome.trim().isNotEmpty) {
      _upsertMedicalRecordFromBed(prev, isDischarge: true, syncCloud: true);
    }
    await saveBedEvolution(MaternityBedModel(leito: leito));
  }

  /// ==========================================================================
  /// AUTENTICAÇÃO FIREBASE (GOOGLE + E-MAIL/SENHA) E VERIFICAÇÃO POR CRM
  /// ==========================================================================
  Future<void> initFirebaseAuth() async {
    if (firebaseAuthInitialized) return;
    firebaseAuthInitialized = true;

    try {
      if (!kIsWeb) {
        await GoogleSignIn.instance.initialize(
          serverClientId: kGoogleWebClientId,
        );
      }

      final current = FirebaseAuth.instance.currentUser;
      if (current != null) {
        firebaseUid = current.uid;
        googleUserEmail = current.email?.toLowerCase();
        googleUserName = current.displayName ?? current.email;
        _tryMatchDoctorFromAuthenticatedEmail();
      }

      FirebaseAuth.instance.authStateChanges().listen((User? user) {
        if (user != null) {
          firebaseUid = user.uid;
          googleUserEmail = user.email?.toLowerCase();
          googleUserName = user.displayName ?? user.email;
          _tryMatchDoctorFromAuthenticatedEmail();
        } else {
          firebaseUid = null;
          googleUserEmail = null;
          googleUserName = null;
        }
        notifyListeners();
      });
    } catch (_) {}
  }

  void _tryMatchDoctorFromAuthenticatedEmail() {
    final email = googleUserEmail?.trim().toLowerCase() ?? '';
    if (email.isEmpty) return;
    final match = doctors.where(
      (d) => d.linkedGoogleEmail.trim().toLowerCase() == email,
    );
    if (match.isNotEmpty) {
      selectedNotificationDoctorId = match.first.id;
    }
  }

  Future<String?> signInWithGoogleFirebase() async {
    try {
      UserCredential cred;
      if (kIsWeb) {
        final provider = GoogleAuthProvider();
        provider.setCustomParameters({'prompt': 'select_account'});
        cred = await FirebaseAuth.instance.signInWithPopup(provider);
      } else {
        final GoogleSignInAccount googleUser =
            await GoogleSignIn.instance.authenticate();
        final GoogleSignInAuthentication googleAuth = googleUser.authentication;
        final idToken = googleAuth.idToken;
        if (idToken == null || idToken.isEmpty) {
          return 'Não foi possível obter o token de autenticação do Google.';
        }
        final AuthCredential credential = GoogleAuthProvider.credential(
          idToken: idToken,
        );
        cred = await FirebaseAuth.instance.signInWithCredential(credential);
      }

      final user = cred.user;
      if (user != null) {
        firebaseUid = user.uid;
        googleUserEmail = (user.email ?? '').toLowerCase();
        googleUserName = user.displayName ?? user.email;
        await _pullDoctorsFromFirestoreRest();
        _tryMatchDoctorFromAuthenticatedEmail();
        notifyListeners();
        return null;
      }
      return 'Autenticação não concluída.';
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return 'Login com Google cancelado.';
      }
      return 'Erro no login com Google (${e.code.name}): ${e.description ?? ''}';
    } on FirebaseAuthException catch (e) {
      return _mapFirebaseAuthError(e);
    } catch (e) {
      return 'Falha ao autenticar com Google: $e';
    }
  }

  Future<String?> signInOrSignUpWithEmailPassword({
    required String email,
    required String password,
    required bool isSignUp,
  }) async {
    final cleanEmail = email.trim();
    if (cleanEmail.isEmpty || !cleanEmail.contains('@')) {
      return 'Digite um e-mail válido.';
    }
    if (password.length < 6) {
      return 'A senha deve ter no mínimo 6 caracteres.';
    }

    try {
      UserCredential cred;
      if (isSignUp) {
        cred = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: cleanEmail,
          password: password,
        );
      } else {
        cred = await FirebaseAuth.instance.signInWithEmailAndPassword(
          email: cleanEmail,
          password: password,
        );
      }

      final user = cred.user;
      if (user != null) {
        firebaseUid = user.uid;
        googleUserEmail = (user.email ?? cleanEmail).toLowerCase();
        googleUserName = user.displayName ?? cleanEmail.split('@').first;
        await _pullDoctorsFromFirestoreRest();
        _tryMatchDoctorFromAuthenticatedEmail();
        notifyListeners();
        return null;
      }
      return 'Autenticação não concluída.';
    } on FirebaseAuthException catch (e) {
      return _mapFirebaseAuthError(e);
    } catch (e) {
      return 'Erro ao autenticar: $e';
    }
  }

  String _mapFirebaseAuthError(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-email':
        return 'E-mail inválido.';
      case 'user-not-found':
      case 'wrong-password':
      case 'invalid-credential':
        return 'E-mail ou senha incorretos.';
      case 'email-already-in-use':
        return 'Este e-mail já está cadastrado. Use "Entrar".';
      case 'weak-password':
        return 'Senha muito fraca. Use ao menos 6 caracteres.';
      case 'too-many-requests':
        return 'Muitas tentativas. Aguarde alguns instantes.';
      case 'network-request-failed':
        return 'Sem conexão com a internet.';
      default:
        return e.message ?? 'Erro na autenticação (${e.code}).';
    }
  }

  Future<void> signOutFirebase() async {
    try {
      if (!kIsWeb) {
        await GoogleSignIn.instance.signOut();
      }
    } catch (_) {}
    try {
      await FirebaseAuth.instance.signOut();
    } catch (_) {}
    firebaseUid = null;
    googleUserEmail = null;
    googleUserName = null;
    selectedNotificationDoctorId = 'ALL';
    hasCompletedOnboarding = false;
    notifyListeners();
  }

  /// Verifica de qual profissional cadastrado pertence o CRM digitado (até 10 dígitos)
  Future<DoctorModel?> verifyAndClaimDoctorByCrm(String rawCrm) async {
    final cleanInput = rawCrm.replaceAll(RegExp(r'\D'), '');
    if (cleanInput.isEmpty || cleanInput.length > 10) return null;

    await _pullDoctorsFromFirestoreRest();

    DoctorModel? matched;
    for (final d in doctors) {
      final docCrm = d.crm.replaceAll(RegExp(r'\D'), '');
      if (docCrm.isEmpty) continue;
      if (docCrm == cleanInput ||
          docCrm.replaceFirst(RegExp(r'^0+'), '') ==
              cleanInput.replaceFirst(RegExp(r'^0+'), '')) {
        matched = d;
        break;
      }
    }

    if (matched == null) return null;

    final email = (googleUserEmail ?? '').trim().toLowerCase();
    final name = (googleUserName ?? '').trim();
    if (email.isNotEmpty) {
      matched.linkedGoogleEmail = email;
    }
    if (name.isNotEmpty) {
      matched.linkedGoogleName = name;
    }
    selectedNotificationDoctorId = matched.id;
    await saveOrUpdateDoctorToCloud(matched);
    notifyListeners();
    return matched;
  }

  String? confirmProfileWithCrm({
    required DoctorModel doctor,
    required String googleEmail,
    required String googleName,
    required String crmInput,
  }) {
    final cleanInputCrm = crmInput.replaceAll(RegExp(r'\D'), '');
    if (cleanInputCrm.isEmpty || cleanInputCrm.length > 10) {
      return 'Digite o número do seu CRM (até 10 dígitos) para confirmar o perfil.';
    }

    final existingCrm = doctor.crm.replaceAll(RegExp(r'\D'), '');
    if (existingCrm.isNotEmpty && existingCrm != cleanInputCrm) {
      return 'CRM informado ($cleanInputCrm) não confere com o CRM cadastrado para Dr(a). ${doctor.name}.';
    }

    // Se o médico ainda não tinha CRM salvo no cadastro, já grava o CRM no perfil dele no Firebase
    doctor.crm = cleanInputCrm;
    doctor.linkedGoogleEmail = googleEmail.trim().toLowerCase();
    doctor.linkedGoogleName = googleName.trim().isNotEmpty ? googleName.trim() : doctor.name;
    googleUserEmail = doctor.linkedGoogleEmail;
    googleUserName = doctor.linkedGoogleName;
    selectedNotificationDoctorId = doctor.id;

    saveOrUpdateDoctorToCloud(doctor);
    notifyListeners();
    return null;
  }

  List<ShiftEntryModel> getDoctorsOnCallNow() {
    final now = DateTime.now();
    final hour = now.hour;
    List<String> activeTypes;
    if (hour >= 7 && hour < 13) {
      activeTypes = ['morning', 'routine'];
    } else if (hour >= 13 && hour < 19) {
      activeTypes = ['afternoon'];
    } else if (hour >= 19 && hour < 23) {
      activeTypes = ['evening', 'night'];
    } else {
      activeTypes = ['night'];
    }

    var matching = shifts
        .where((s) => s.date == selectedDate && activeTypes.contains(s.shiftType))
        .toList();
    if (matching.isEmpty) {
      matching = shifts
          .where((s) => s.date == '2026-11-20' && activeTypes.contains(s.shiftType))
          .toList();
    }

    final seen = <String>{};
    final unique = <ShiftEntryModel>[];
    for (final s in matching) {
      if (seen.add(s.doctorId)) {
        unique.add(s);
      }
    }
    return unique;
  }

  Future<void> assignDoctorToShift({
    required String date,
    required String shiftType,
    required String slotRole,
    required String? doctorId,
  }) async {
    _undoStack.add(List<ShiftEntryModel>.from(shifts));
    _redoStack.clear();

    shifts.removeWhere(
      (s) => s.date == date && s.shiftType == shiftType && s.slotRole == slotRole,
    );

    final docIdKey = '${date}_${shiftType}_$slotRole';

    if (doctorId != null && doctorId.isNotEmpty) {
      final doc = doctors.firstWhere((d) => d.id == doctorId);
      final entry = ShiftEntryModel(
        id: docIdKey,
        date: date,
        shiftType: shiftType,
        slotRole: slotRole,
        doctorId: doc.id,
        doctorName: doc.name,
      );
      shifts.add(entry);
      notifyListeners();
      try {
        final fsUrl = Uri.parse(
          'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/shifts/$docIdKey',
        );
        await http.patch(
          fsUrl,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'fields': {
              'date': {'stringValue': date},
              'shift_type': {'stringValue': shiftType},
              'slot_role': {'stringValue': slotRole},
              'doctor_id': {'stringValue': doc.id},
              'doctor_name': {'stringValue': doc.name},
            }
          }),
        );
      } catch (_) {}
    } else {
      notifyListeners();
      try {
        final fsUrl = Uri.parse(
          'https://firestore.googleapis.com/v1/projects/$kFirebaseProjectId/databases/(default)/documents/shifts/$docIdKey',
        );
        await http.delete(fsUrl);
      } catch (_) {}
    }
  }

  void undoShiftAction() {
    if (_undoStack.isEmpty) return;
    _redoStack.add(List<ShiftEntryModel>.from(shifts));
    final prev = _undoStack.removeLast();
    shifts
      ..clear()
      ..addAll(prev);
    notifyListeners();
  }

  void redoShiftAction() {
    if (_redoStack.isEmpty) return;
    _undoStack.add(List<ShiftEntryModel>.from(shifts));
    final next = _redoStack.removeLast();
    shifts
      ..clear()
      ..addAll(next);
    notifyListeners();
  }

  void addClinicalReminder({
    required String leito,
    required String patientName,
    required String text,
    required String date,
    required String time,
  }) {
    clinicalReminders.add(ClinicalReminderModel(
      id: 'rem_${DateTime.now().millisecondsSinceEpoch}',
      leito: leito,
      patientName: patientName.isNotEmpty ? patientName : 'Leito $leito',
      text: text,
      date: date,
      time: time,
    ));
    notifyListeners();
  }

  List<List<String>> _parseCsv(String text) {
    final rows = <List<String>>[];
    var row = <String>[];
    final cur = StringBuffer();
    var inQuotes = false;

    for (int i = 0; i < text.length; i++) {
      final ch = text[i];
      final next = i + 1 < text.length ? text[i + 1] : '';

      if (inQuotes) {
        if (ch == '"' && next == '"') {
          cur.write('"');
          i++;
        } else if (ch == '"') {
          inQuotes = false;
        } else {
          cur.write(ch);
        }
      } else {
        if (ch == '"') {
          inQuotes = true;
        } else if (ch == ',') {
          row.add(cur.toString());
          cur.clear();
        } else if (ch == '\n') {
          row.add(cur.toString().replaceAll('\r', ''));
          rows.add(row);
          row = <String>[];
          cur.clear();
        } else if (ch != '\r') {
          cur.write(ch);
        }
      }
    }
    if (cur.isNotEmpty || row.isNotEmpty) {
      row.add(cur.toString().replaceAll('\r', ''));
      rows.add(row);
    }
    return rows;
  }
}
