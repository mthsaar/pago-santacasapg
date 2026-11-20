// Modelos Clínicos e Parsers Bidirecionais Não-Destrutivos
// Santa Casa de Ponta Grossa - Maternidade (Web, iOS e Android)

const String kProvisionalSheetId = '1Vrv-BaXEsZtSsB6G3Ix-eK3Xk4rcos-HYp9zQJVVcM0';
const String kOfficialSheetId = '1i82ITSC-qZ564ABUo4bz0ejQKpnwO1kjUnlshivXTk0';

class MaternityBedGroup {
  final String title;
  final List<String> beds;

  const MaternityBedGroup({required this.title, required this.beds});
}

const List<MaternityBedGroup> kDefaultMaternityGroups = [
  MaternityBedGroup(
    title: 'Pré-Parto & Observação',
    beds: ['PRÉ 1', 'PRÉ 2', 'PRÉ 3', 'OBS 1', 'OBS 2'],
  ),
  MaternityBedGroup(
    title: 'Apartamentos / Quartos (301 a 310)',
    beds: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310'],
  ),
  MaternityBedGroup(
    title: 'Enfermarias (319 a 326)',
    beds: [
      '319-1', '319-2', '321-1', '321-2', '323-1',
      '323-2', '325-1', '325-2', '326-1', '326-2'
    ],
  ),
  MaternityBedGroup(
    title: 'Enfermarias & Quartos (327 a 336)',
    beds: [
      '327-1', '327-2', '328-1', '328-2', '329-1', '329-2',
      '330-1', '330-2', '331-1', '331-2', '332', '333',
      '334', '335-1', '335-2', '336'
    ],
  ),
];

class HighRiskPreset {
  final String code;
  final String label;
  final bool isHabitual;
  final bool isOther;

  const HighRiskPreset({
    required this.code,
    required this.label,
    this.isHabitual = false,
    this.isOther = false,
  });
}

const List<HighRiskPreset> kAltoRiscoPresets = [
  HighRiskPreset(code: 'NÃO', label: 'Habitual / Sem Alto Risco (Não)', isHabitual: true),
  HighRiskPreset(code: 'DMG', label: 'DMG (Diabetes Gestacional)'),
  HighRiskPreset(code: 'DM1/DM2', label: 'DM1 / DM2 (Diabetes Prévio)'),
  HighRiskPreset(code: 'HAC', label: 'HAC (Hipertensão Crônica)'),
  HighRiskPreset(code: 'DHEG/PE', label: 'DHEG / Pré-Eclâmpsia'),
  HighRiskPreset(code: 'HIPOTIREOIDISMO', label: 'Hipotireoidismo'),
  HighRiskPreset(code: 'OBESIDADE', label: 'Obesidade'),
  HighRiskPreset(code: 'ITERATIVIDADE', label: 'Iteratividade (2+ Cesáreas)'),
  HighRiskPreset(code: 'TPP', label: 'TPP / Prematuridade / IIC'),
  HighRiskPreset(code: 'RPMO', label: 'RPMO / Bolsa Rota'),
  HighRiskPreset(code: 'ITU', label: 'ITU / Pielonefrite'),
  HighRiskPreset(code: 'RCIU', label: 'RCIU / Restrição Crescimento'),
  HighRiskPreset(code: 'OLIGODRAMNIA', label: 'Oligodramnia / Polidramnia'),
  HighRiskPreset(code: 'GEMELAR', label: 'Gestação Gemelar'),
  HighRiskPreset(code: 'IDADE >= 35A', label: 'Idade Materna ≥ 35 anos'),
  HighRiskPreset(code: 'TROMBOFILIA', label: 'Trombofilia / SAF'),
  HighRiskPreset(code: 'ALOIMUNIZAÇÃO RH', label: 'Aloimunização Rh'),
  HighRiskPreset(code: 'CARDIOPATIA', label: 'Cardiopatia / Nefropatia'),
  HighRiskPreset(code: 'TABAGISMO', label: 'Tabagismo / Drogadição'),
  HighRiskPreset(code: 'OUTROS', label: 'Outros (Texto livre da planilha)', isOther: true),
];

const List<String> kInternacaoOptions = [
  'PN',
  'PN+DIU',
  'CST',
  'CST+DIU',
  'CST+LTB',
  'TRATAMENTO CLÍNICO',
];

const List<String> kDeliveryOptions = [
  'PN',
  'PN+DIU',
  'CST',
  'CST+DIU',
  'CST+LTB',
];

class DoctorModel {
  final String id;
  String name;
  String phone;
  String crm;
  String specialty;
  String photoUrl;
  String linkedGoogleEmail;
  String linkedGoogleName;

  DoctorModel({
    required this.id,
    required this.name,
    this.phone = '',
    this.crm = '',
    this.specialty = 'GO',
    this.photoUrl = '',
    this.linkedGoogleEmail = '',
    this.linkedGoogleName = '',
  });

  DoctorModel copyWith({
    String? name,
    String? phone,
    String? crm,
    String? specialty,
    String? photoUrl,
    String? linkedGoogleEmail,
    String? linkedGoogleName,
  }) {
    return DoctorModel(
      id: id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      crm: crm ?? this.crm,
      specialty: specialty ?? this.specialty,
      photoUrl: photoUrl ?? this.photoUrl,
      linkedGoogleEmail: linkedGoogleEmail ?? this.linkedGoogleEmail,
      linkedGoogleName: linkedGoogleName ?? this.linkedGoogleName,
    );
  }
}

class ShiftEntryModel {
  final String id;
  final String date; // YYYY-MM-DD
  final String shiftType; // routine, morning, afternoon, evening, night
  final String slotRole; // rotin, m1, m2, a1, a2, extra, n1, n2
  final String doctorId;
  final String doctorName;

  const ShiftEntryModel({
    required this.id,
    required this.date,
    required this.shiftType,
    required this.slotRole,
    required this.doctorId,
    required this.doctorName,
  });
}

class MaternityBedModel {
  final String leito;
  final String nome;
  final String paridade;
  final String tipoSanguineo;
  final String altoRisco;
  final String internacaoPor;
  final String observacoes;
  final String updatedAt;
  final String source;
  final String sheetBaselineSig;

  const MaternityBedModel({
    required this.leito,
    this.nome = '',
    this.paridade = '',
    this.tipoSanguineo = '',
    this.altoRisco = '',
    this.internacaoPor = '',
    this.observacoes = '',
    this.updatedAt = '',
    this.source = 'google_sheets',
    this.sheetBaselineSig = '',
  });

  bool get isOccupied =>
      nome.trim().isNotEmpty ||
      internacaoPor.trim().isNotEmpty ||
      observacoes.trim().isNotEmpty;

  String get signature => [
        nome.trim(),
        paridade.trim(),
        tipoSanguineo.trim(),
        altoRisco.trim(),
        internacaoPor.trim(),
        observacoes.trim(),
      ].join('|');

  MaternityBedModel copyWith({
    String? leito,
    String? nome,
    String? paridade,
    String? tipoSanguineo,
    String? altoRisco,
    String? internacaoPor,
    String? observacoes,
    String? updatedAt,
    String? source,
    String? sheetBaselineSig,
  }) {
    return MaternityBedModel(
      leito: leito ?? this.leito,
      nome: nome ?? this.nome,
      paridade: paridade ?? this.paridade,
      tipoSanguineo: tipoSanguineo ?? this.tipoSanguineo,
      altoRisco: altoRisco ?? this.altoRisco,
      internacaoPor: internacaoPor ?? this.internacaoPor,
      observacoes: observacoes ?? this.observacoes,
      updatedAt: updatedAt ?? this.updatedAt,
      source: source ?? this.source,
      sheetBaselineSig: sheetBaselineSig ?? this.sheetBaselineSig,
    );
  }
}

class ClinicalReminderModel {
  final String id;
  final String leito;
  final String patientName;
  final String text;
  final String date; // YYYY-MM-DD
  final String time; // HH:MM
  bool fired;

  ClinicalReminderModel({
    required this.id,
    required this.leito,
    required this.patientName,
    required this.text,
    required this.date,
    required this.time,
    this.fired = false,
  });
}

/// ============================================================================
/// 1. PARSER NÃO-DESTRUTIVO DE PARIDADE (G P C A E M de 0 a 20 • 0 oculta letra)
/// ============================================================================
class ParsedParity {
  final Map<String, int> values; // G, P, C, A, E, M -> 0..20
  final String extraText; // Texto livre adicional da planilha (ex: "IG 38s")

  ParsedParity({
    required this.values,
    this.extraText = '',
  });

  static const List<String> letters = ['G', 'P', 'C', 'A', 'E', 'M'];

  factory ParsedParity.parse(String rawText) {
    final map = <String, int>{'G': 0, 'P': 0, 'C': 0, 'A': 0, 'E': 0, 'M': 0};
    final str = rawText.trim();
    if (str.isEmpty) {
      return ParsedParity(values: map, extraText: '');
    }

    for (final letter in letters) {
      final rx = RegExp('(?:\\b|$letter)\\s*(\\d{1,2})', caseSensitive: false);
      final compactRx = RegExp('$letter\\s*(\\d{1,2})', caseSensitive: false);
      final m = compactRx.firstMatch(str) ?? rx.firstMatch(str);
      if (m != null) {
        final v = int.tryParse(m.group(1) ?? '0') ?? 0;
        map[letter] = v.clamp(0, 20);
      }
    }

    final leftover = str
        .replaceAll(RegExp(r'[GPCAEMgpcaem]\s*\d{1,2}'), '')
        .replaceAll(RegExp(r'^[\s,/;-]+|[\s,/;-]+$'), '')
        .trim();

    return ParsedParity(values: map, extraText: leftover);
  }

  /// Gera a string compatível com a planilha: letras com valor 0 desaparecem
  /// automaticamente (ex: G2 P0 C1 -> "G2C1") e o texto extra é preservado.
  String toSheetString() {
    final activeParts = <String>[];
    for (final letter in letters) {
      final v = values[letter] ?? 0;
      if (v > 0) {
        activeParts.add('$letter$v');
      }
    }
    final codeStr = activeParts.join('');
    if (codeStr.isNotEmpty && extraText.trim().isNotEmpty) {
      return '$codeStr ${extraText.trim()}';
    }
    return codeStr.isNotEmpty ? codeStr : extraText.trim();
  }
}

/// ============================================================================
/// 2. PARSER NÃO-DESTRUTIVO DE ALTO RISCO (Múltipla escolha + Outros)
/// ============================================================================
class ParsedHighRisk {
  final List<String> selectedCodes;
  final String otherText;

  const ParsedHighRisk({
    required this.selectedCodes,
    this.otherText = '',
  });

  factory ParsedHighRisk.parse(String rawText) {
    final str = rawText.trim();
    if (str.isEmpty) {
      return const ParsedHighRisk(selectedCodes: [], otherText: '');
    }

    final lower = str.toLowerCase();
    if (['não', 'nao', 'n', '-', 'habitual', 'baixo', 'baixo risco'].contains(lower)) {
      return const ParsedHighRisk(selectedCodes: ['NÃO'], otherText: '');
    }

    final tokens = str
        .split(RegExp(r'[,;+/]+|\s+\+\s+|\s+e\s+', caseSensitive: false))
        .map((t) => t.trim())
        .where((t) => t.isNotEmpty)
        .toList();

    final selected = <String>{};
    final otherParts = <String>[];

    for (final token in tokens) {
      final u = token.toUpperCase();
      if (u.contains('DMG') || u.contains('DIABETES GEST')) {
        selected.add('DMG');
        if (u.replaceAll('DMG', '').trim().isNotEmpty) {
          // Caso tenha especificação como "DMG A2 ID", preserva se desejar ou marca DMG
        }
      } else if (u.contains('DM1') || u.contains('DM2') || u.contains('DM ') || u == 'DM') {
        selected.add('DM1/DM2');
      } else if (u == 'HAC' || u.contains('HAS') || u.contains('HIPERTENS') || u == 'HAG') {
        selected.add('HAC');
      } else if (u.contains('DHEG') || u == 'PE' || u.startsWith('PE ') || u.contains('ECLÂMPSIA') || u.contains('ECLAMPSIA')) {
        selected.add('DHEG/PE');
      } else if (u.contains('HIPOTIREOID')) {
        selected.add('HIPOTIREOIDISMO');
      } else if (u.contains('OBES')) {
        selected.add('OBESIDADE');
      } else if (u.contains('ITERATIV')) {
        selected.add('ITERATIVIDADE');
      } else if (u.contains('TPP') || u.contains('PREMATUR') || u.contains('IIC')) {
        selected.add('TPP');
      } else if (u.contains('RPMO') || u.contains('RPPMO') || u.contains('BOLSA ROTA')) {
        selected.add('RPMO');
      } else if (u.contains('ITU') || u.contains('PIELONEFRITE') || u == 'PNA') {
        selected.add('ITU');
      } else if (u.contains('RCIU') || u.contains('RESTRI')) {
        selected.add('RCIU');
      } else if (u.contains('OLIGODRAM') || u.contains('POLIDRAM') || u.contains('ANIDR')) {
        selected.add('OLIGODRAMNIA');
      } else if (u.contains('GEMELAR')) {
        selected.add('GEMELAR');
      } else if (u.contains('35') || u.contains('IDADE') || u == 'IMA') {
        selected.add('IDADE >= 35A');
      } else if (u.contains('TROMBOFILIA') || u.contains('SAF') || u.contains('SAAF')) {
        selected.add('TROMBOFILIA');
      } else if (u.contains('ALOIMUN') || u.contains('RH')) {
        selected.add('ALOIMUNIZAÇÃO RH');
      } else if (u.contains('CARDIOPAT') || u.contains('NEFROPAT') || u.contains('NEFROLIT')) {
        selected.add('CARDIOPATIA');
      } else if (u.contains('TABAG') || u == 'TAB' || u.contains('DROG')) {
        selected.add('TABAGISMO');
      } else {
        selected.add('OUTROS');
        otherParts.add(token);
      }
    }

    return ParsedHighRisk(
      selectedCodes: selected.toList(),
      otherText: otherParts.join(' + '),
    );
  }

  String toSheetString() {
    if (selectedCodes.contains('NÃO')) return 'Não';
    final parts = selectedCodes.where((c) => c != 'OUTROS' && c != 'NÃO').toList();
    if (selectedCodes.contains('OUTROS') && otherText.trim().isNotEmpty) {
      parts.add(otherText.trim());
    }
    return parts.join(' + ');
  }
}

/// ============================================================================
/// 3. PARSER NÃO-DESTRUTIVO DE INTERNAÇÃO POR (+ Data/Hora do Parto)
/// ============================================================================
class ParsedAdmissionReason {
  final String selectedOption; // PN, PN+DIU, CST, CST+DIU, CST+LTB, TRATAMENTO CLÍNICO ou ''
  final String birthDate; // YYYY-MM-DD ou ''
  final String birthTime; // HH:MM ou ''
  final String extraText; // Peso RN / Apgar / Observação da internação

  const ParsedAdmissionReason({
    this.selectedOption = '',
    this.birthDate = '',
    this.birthTime = '',
    this.extraText = '',
  });

  bool get isDelivery => kDeliveryOptions.contains(selectedOption);

  factory ParsedAdmissionReason.parse(String rawText) {
    final str = rawText.trim();
    final upper = str.toUpperCase();

    String matchedOpt = '';
    if (upper.contains('CST+LTB') ||
        upper.contains('CST + LTB') ||
        ((upper.contains('CESAREA') || upper.contains('CESÁREA') || upper.contains('CST')) &&
            (upper.contains('LTB') || upper.contains('LAQUEADURA')))) {
      matchedOpt = 'CST+LTB';
    } else if (upper.contains('CST+DIU') ||
        upper.contains('CST + DIU') ||
        ((upper.contains('CESAREA') || upper.contains('CESÁREA') || upper.contains('CST')) &&
            upper.contains('DIU'))) {
      matchedOpt = 'CST+DIU';
    } else if (upper.contains('PN+DIU') ||
        upper.contains('PN + DIU') ||
        ((upper.contains('PARTO NORMAL') || upper.contains('PN')) && upper.contains('DIU'))) {
      matchedOpt = 'PN+DIU';
    } else if (upper.startsWith('CST') ||
        upper == 'PC' ||
        upper.contains('CESÁREA') ||
        upper.contains('CESAREA')) {
      matchedOpt = 'CST';
    } else if (upper.startsWith('PN') ||
        upper.contains('PARTO NORMAL') ||
        upper.contains('PARTO VAGINAL')) {
      matchedOpt = 'PN';
    } else if (upper.contains('TRATAMENTO CLÍNICO') ||
        upper.contains('TRATAMENTO CLINICO') ||
        upper.contains('INTERNOU POR') ||
        upper.contains('INTERNOU PARA') ||
        upper.contains('INDUÇÃO') ||
        upper.contains('INDUCAO')) {
      matchedOpt = 'TRATAMENTO CLÍNICO';
    }

    String birthDate = '';
    final dMatch = RegExp(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b').firstMatch(str);
    if (dMatch != null) {
      final day = (dMatch.group(1) ?? '01').padLeft(2, '0');
      final month = (dMatch.group(2) ?? '11').padLeft(2, '0');
      var year = dMatch.group(3) ?? '2026';
      if (year.length == 2) year = '20$year';
      birthDate = '$year-$month-$day';
    }

    String birthTime = '';
    final tMatch = RegExp(r'\b(\d{1,2})\s*(?::|h|H)\s*(\d{2})\b').firstMatch(str);
    if (tMatch != null) {
      final hh = (int.tryParse(tMatch.group(1) ?? '0') ?? 0).clamp(0, 23).toString().padLeft(2, '0');
      final mm = (int.tryParse(tMatch.group(2) ?? '0') ?? 0).clamp(0, 59).toString().padLeft(2, '0');
      birthTime = '$hh:$mm';
    }

    String extra = str;
    if (kDeliveryOptions.contains(matchedOpt)) {
      extra = extra
          .replaceFirst(
              RegExp(r'^(?:CST\s*\+\s*LTB|CST\s*\+\s*DIU|PN\s*\+\s*DIU|CST|PN|PARTO\s+NORMAL|CES[ÁA]REA)\b',
                  caseSensitive: false),
              '')
          .replaceFirst(RegExp(r'\b(?:em|no dia)\s+\d{1,2}/\d{1,2}(?:/\d{2,4})?\b', caseSensitive: false), '')
          .replaceFirst(RegExp(r'\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b'), '')
          .replaceFirst(RegExp(r'\b(?:[àa]s|as)?\s*\d{1,2}\s*(?::|h|H)\s*\d{2}\.?\b', caseSensitive: false), '')
          .replaceFirst(RegExp(r'\b(?:[àa]s|as)\s*$', caseSensitive: false), '')
          .replaceAll(RegExp(r'^[\s.,;-]+|[\s.,;-]+$'), '')
          .trim();
    }

    return ParsedAdmissionReason(
      selectedOption: matchedOpt,
      birthDate: birthDate,
      birthTime: birthTime,
      extraText: extra,
    );
  }

  String toSheetString() {
    if (selectedOption.isEmpty) return extraText.trim();
    if (kDeliveryOptions.contains(selectedOption)) {
      String birthInfo = '';
      if (birthDate.isNotEmpty && birthDate.contains('-')) {
        final parts = birthDate.split('-');
        if (parts.length >= 3) {
          birthInfo = 'em ${parts[2]}/${parts[1]}';
        }
      }
      if (birthTime.isNotEmpty) {
        birthInfo = birthInfo.isNotEmpty ? '$birthInfo às $birthTime' : 'às $birthTime';
      }
      var res = birthInfo.isNotEmpty ? '$selectedOption $birthInfo' : selectedOption;
      if (extraText.trim().isNotEmpty) {
        res = '$res ${extraText.trim()}';
      }
      return res;
    } else {
      if (extraText.trim().isNotEmpty &&
          !extraText.toUpperCase().contains('TRATAMENTO CL')) {
        return '$selectedOption • ${extraText.trim()}';
      }
      return selectedOption;
    }
  }
}
