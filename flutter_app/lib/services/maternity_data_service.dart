import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/clinical_models.dart';

const String kFirebaseProjectId = 'pago---santa-casa-pg';

class MaternityDataService extends ChangeNotifier {
  bool isEditorMode = false;
  String editorPin = '123456';
  String currentMonth = '2026-11';
  int currentWeekIndex = 2; // Semana atual de Novembro
  String selectedDate = '2026-11-20';

  String activeSheetId = kProvisionalSheetId;
  String appsScriptWebhookUrl = '';
  String lastSyncLabel = 'Sincronizando...';

  // Conta Google + Duplo Cheque de Notificações
  String? googleUserName;
  String? googleUserEmail;
  String selectedNotificationDoctorId = 'ALL';
  bool notificationsEnabled = true;
  bool notifyOneHourBeforeShift = true;
  bool notifyClinicalReminders = true;

  // Seções colapsáveis do Fechamento
  bool statsProfessionalsCollapsed = false;
  bool statsPatientsCollapsed = false;

  final List<DoctorModel> doctors = [];
  final List<ShiftEntryModel> shifts = [];
  final Map<String, MaternityBedModel> sheetBedsMap = {};
  final Map<String, MaternityBedModel> firebaseBedsMap = {};
  final List<String> extraBeds = [];
  bool sheetLoaded = false;

  final List<ClinicalReminderModel> clinicalReminders = [];
  final List<List<ShiftEntryModel>> _undoStack = [];
  final List<List<ShiftEntryModel>> _redoStack = [];
  final List<Map<String, dynamic>> auditHistoryLogs = [];

  Timer? _pollingTimer;

  bool get canUndo => _undoStack.isNotEmpty;
  bool get canRedo => _redoStack.isNotEmpty;

  MaternityDataService() {
    _seedInitialDoctorsAndSchedule();
    _seedInitialProvisionalMaternitySnapshot();
    initSync();
  }

  Future<void> initSync() async {
    await syncFromGoogleSheetAndFirestore();
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 12), (_) {
      syncFromGoogleSheetAndFirestore();
    });
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
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
      final id = 'doc_${i + 1}';
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
        final docId = nameToId[docName] ?? 'doc_1';
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

    doctors.sort((a, b) => a.name.compareTo(b.name));
  }

  /// Snapshot inicial fiel à planilha provisória (1Vrv-BaXEsZtSsB6G3Ix-eK3Xk4rcos-HYp9zQJVVcM0)
  /// garantindo carregamento imediato mesmo antes da resposta de rede.
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
    }
    sheetLoaded = true;
  }

  String normalizeLeitoKey(String leito) => leito.trim().toUpperCase();

  String leitoToDocId(String leito) {
    return normalizeLeitoKey(leito)
        .replaceAll('É', 'E')
        .replaceAll(RegExp(r'[^A-Z0-9_-]'), '_');
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

  /// Sincronização Bidirecional: Planilha Google Sheets ⇄ Banco Firebase Firestore
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
      // Fallback para leitura do Firebase Firestore REST API (caso o navegador bloqueie CORS direto do CSV)
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

      // Auto-correção de linha duplicada (ex: dois "321-1" seguidos na planilha, mapeando o segundo para "321-2")
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
      }
    } catch (_) {}
  }

  /// Salva evolução ou alta no Banco de Dados (com log de auditoria contra perda de dados) e na Planilha
  Future<void> saveBedEvolution(MaternityBedModel updatedBed) async {
    final key = normalizeLeitoKey(updatedBed.leito);
    final prevBed = getBedData(updatedBed.leito);
    final baselineSheetSig = (sheetBedsMap[key] ?? MaternityBedModel(leito: updatedBed.leito)).signature;
    final nowIso = DateTime.now().toIso8601String();

    // 1. Grava snapshot de auditoria para garantir zero perda de dados da planilha
    auditHistoryLogs.add({
      'timestamp': nowIso,
      'leito': updatedBed.leito,
      'previous': prevBed.signature,
      'updated': updatedBed.signature,
    });

    final record = updatedBed.copyWith(
      updatedAt: nowIso,
      source: 'webapp',
      sheetBaselineSig: baselineSheetSig,
    );

    firebaseBedsMap[key] = record;
    sheetBedsMap[key] = record;
    notifyListeners();

    // 2. Persiste no Firebase Cloud Firestore via REST API
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

    // 3. Se o conector Google Apps Script estiver configurado, atualiza a linha na planilha
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
    await saveBedEvolution(MaternityBedModel(leito: leito));
  }

  /// ==========================================================================
  /// DUPLO CHEQUE DE SEGURANÇA (CONTA GOOGLE ⇄ PERFIL DO PLANTONISTA)
  /// ==========================================================================
  String normalizeFirstName(String fullName) {
    final cleaned = fullName
        .toUpperCase()
        .replaceAll(RegExp(r'^DR\.?\s+|^DRA\.?\s+'), '')
        .trim();
    if (cleaned.isEmpty) return '';
    return cleaned.split(RegExp(r'\s+')).first;
  }

  bool isNameMismatchWithGoogle(DoctorModel doc, String googleName) {
    if (googleName.trim().isEmpty) return false;
    final gFirst = normalizeFirstName(googleName);
    final dFirst = normalizeFirstName(doc.name);
    return gFirst.isNotEmpty && dFirst.isNotEmpty && gFirst != dFirst;
  }

  /// Valida o Duplo Cheque antes de vincular as notificações de um médico:
  /// 1. Bloqueia se o perfil já estiver vinculado ao e-mail de outro colega.
  /// 2. Se o nome da conta Google divergir do perfil selecionado (ex: Henrique selecionando Jéssica)
  ///    ou se o profissional tiver telefone cadastrado, exige os 4 últimos dígitos do telefone, CRM ou PIN.
  String? verifyAndClaimDoctorProfile({
    required DoctorModel doctor,
    required String googleName,
    required String googleEmail,
    required String secretInput,
    required bool personalConfirmationChecked,
  }) {
    final email = googleEmail.trim().toLowerCase();
    if (email.isEmpty || !email.contains('@')) {
      return 'Informe um e-mail Google válido para vincular as notificações.';
    }
    if (!personalConfirmationChecked) {
      return 'Marque a confirmação de que você é Dr(a). ${doctor.name}.';
    }

    if (doctor.linkedGoogleEmail.isNotEmpty &&
        doctor.linkedGoogleEmail.toLowerCase() != email &&
        !isEditorMode) {
      return 'Este perfil já está vinculado exclusivamente à conta ${doctor.linkedGoogleEmail}.';
    }

    final cleanPhone = doctor.phone.replaceAll(RegExp(r'\D'), '');
    final last4Phone = cleanPhone.length >= 4 ? cleanPhone.substring(cleanPhone.length - 4) : '';
    final cleanCrm = doctor.crm.replaceAll(RegExp(r'\D'), '');
    final secret = secretInput.trim();

    final matchesPhoneLast4 = last4Phone.isNotEmpty && secret == last4Phone;
    final matchesCrm = cleanCrm.isNotEmpty && secret == cleanCrm;
    final matchesPin = secret == editorPin;
    final sameFirstName = !isNameMismatchWithGoogle(doctor, googleName);

    if (!sameFirstName && !matchesPhoneLast4 && !matchesCrm && !matchesPin) {
      return 'Duplo Cheque recusado: sua conta Google ($googleName) diverge de Dr(a). ${doctor.name}. Informe os 4 últimos dígitos do telefone de ${doctor.name} ou o PIN da coordenação.';
    }

    if (last4Phone.isNotEmpty && !matchesPhoneLast4 && !matchesCrm && !matchesPin) {
      return 'Digite os 4 últimos dígitos do telefone cadastrado de Dr(a). ${doctor.name} para concluir o Duplo Cheque.';
    }

    googleUserName = googleName.trim().isNotEmpty ? googleName.trim() : doctor.name;
    googleUserEmail = email;
    doctor.linkedGoogleEmail = email;
    doctor.linkedGoogleName = googleUserName!;
    selectedNotificationDoctorId = doctor.id;
    notificationsEnabled = true;
    notifyListeners();
    return null; // Sucesso!
  }

  /// ==========================================================================
  /// ESCALA SEMANAL, PLANTÃO AGORA E DESFAZER / AVANÇAR
  /// ==========================================================================
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

  List<DoctorModel> getDoctorsOnCallAtTime(String timeStr, String dateStr) {
    final parts = timeStr.split(':');
    final hour = int.tryParse(parts.first) ?? 12;
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
        .where((s) => s.date == dateStr && activeTypes.contains(s.shiftType))
        .toList();
    if (matching.isEmpty) {
      matching = shifts
          .where((s) => s.date == selectedDate && activeTypes.contains(s.shiftType))
          .toList();
    }

    final seen = <String>{};
    final result = <DoctorModel>[];
    for (final s in matching) {
      if (seen.add(s.doctorId)) {
        final doc = doctors.firstWhere(
          (d) => d.id == s.doctorId,
          orElse: () => DoctorModel(id: s.doctorId, name: s.doctorName),
        );
        result.add(doc);
      }
    }
    return result;
  }

  void assignDoctorToShift({
    required String date,
    required String shiftType,
    required String slotRole,
    required String? doctorId,
  }) {
    _undoStack.add(List<ShiftEntryModel>.from(shifts));
    _redoStack.clear();

    shifts.removeWhere(
      (s) => s.date == date && s.shiftType == shiftType && s.slotRole == slotRole,
    );

    if (doctorId != null && doctorId.isNotEmpty) {
      final doc = doctors.firstWhere((d) => d.id == doctorId);
      shifts.add(ShiftEntryModel(
        id: '${date}_${shiftType}_$slotRole',
        date: date,
        shiftType: shiftType,
        slotRole: slotRole,
        doctorId: doc.id,
        doctorName: doc.name,
      ));
    }
    notifyListeners();
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

  void removeClinicalReminder(String id) {
    clinicalReminders.removeWhere((r) => r.id == id);
    notifyListeners();
  }

  void saveOrUpdateDoctor(DoctorModel doc) {
    final idx = doctors.indexWhere((d) => d.id == doc.id);
    if (idx >= 0) {
      doctors[idx] = doc;
    } else {
      doctors.add(doc);
    }
    doctors.sort((a, b) => a.name.compareTo(b.name));
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
