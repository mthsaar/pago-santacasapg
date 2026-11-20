import 'package:flutter/material.dart';
import 'models/clinical_models.dart';
import 'services/maternity_data_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SantaCasaMaternidadeApp());
}

const Color kBrand950 = Color(0xFF000865);
const Color kBrand800 = Color(0xFF1B2070);
const Color kBrand700 = Color(0xFF23298B);
const Color kBrand100 = Color(0xFFE0E2FF);
const Color kBrand50 = Color(0xFFF0F2FF);
const Color kScRed700 = Color(0xFFB91C1C);
const Color kScRed600 = Color(0xFFE31E24);
const Color kScRed100 = Color(0xFFFFDAD6);
const Color kScRed50 = Color(0xFFFFF1F0);
const Color kSurface = Color(0xFFF7F8FC);
const Color kContainerLow = Color(0xFFF0F2FA);
const Color kContainer = Color(0xFFE8ECF7);

class SantaCasaMaternidadeApp extends StatefulWidget {
  const SantaCasaMaternidadeApp({super.key});

  @override
  State<SantaCasaMaternidadeApp> createState() => _SantaCasaMaternidadeAppState();
}

class _SantaCasaMaternidadeAppState extends State<SantaCasaMaternidadeApp> {
  final MaternityDataService service = MaternityDataService();

  @override
  void dispose() {
    service.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Santa Casa PG - Escala & Maternidade',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: kSurface,
        colorScheme: ColorScheme.fromSeed(
          seedColor: kBrand700,
          primary: kBrand700,
          secondary: kScRed600,
          surface: kSurface,
        ),
        fontFamily: 'Roboto',
      ),
      home: AnimatedBuilder(
        animation: service,
        builder: (context, _) => HomeShellScreen(service: service),
      ),
    );
  }
}

class HomeShellScreen extends StatefulWidget {
  final MaternityDataService service;

  const HomeShellScreen({super.key, required this.service});

  @override
  State<HomeShellScreen> createState() => _HomeShellScreenState();
}

class _HomeShellScreenState extends State<HomeShellScreen> {
  int _currentTab = 0;
  bool _isTableFullscreen = false;
  String _doctorSearchQuery = '';

  MaternityDataService get svc => widget.service;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 768;

    return Scaffold(
      backgroundColor: kSurface,
      appBar: _isTableFullscreen
          ? PreferredSize(
              preferredSize: const Size.fromHeight(48),
              child: Container(
                color: kBrand950,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: SafeArea(
                  bottom: false,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.fullscreen, color: Colors.white, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            _currentTab == 0
                                ? 'Escala Semanal • Tela Cheia'
                                : 'Pacientes na Maternidade • Tela Cheia',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                      TextButton.icon(
                        onPressed: () => setState(() => _isTableFullscreen = false),
                        style: TextButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: 0.16),
                          foregroundColor: Colors.white,
                        ),
                        icon: const Icon(Icons.fullscreen_exit, size: 16),
                        label: const Text(
                          'Sair',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            )
          : PreferredSize(
              preferredSize: Size.fromHeight(isMobile ? 66 : 122),
              child: _buildHeader(context, isMobile),
            ),
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: _isTableFullscreen ? 4 : (isMobile ? 10 : 24),
            vertical: _isTableFullscreen ? 4 : 10,
          ),
          child: IndexedStack(
            index: _currentTab,
            children: [
              _buildEscalaTab(context, isMobile),
              _buildMaternityTab(context, isMobile),
              _buildDoctorsTab(context, isMobile),
              _buildStatsTab(context, isMobile),
            ],
          ),
        ),
      ),
      bottomNavigationBar: (!isMobile || _isTableFullscreen)
          ? null
          : NavigationBar(
              selectedIndex: _currentTab,
              onDestinationSelected: (idx) => setState(() => _currentTab = idx),
              backgroundColor: Colors.white,
              indicatorColor: kBrand100,
              destinations: [
                const NavigationDestination(
                  icon: Icon(Icons.calendar_month_outlined),
                  selectedIcon: Icon(Icons.calendar_month, color: kBrand950),
                  label: 'Escala',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.bed_outlined),
                  selectedIcon: Icon(Icons.bed, color: kBrand950),
                  label: 'Pacientes',
                ),
                NavigationDestination(
                  icon: const Icon(Icons.people_outline),
                  selectedIcon: const Icon(Icons.people, color: kBrand950),
                  label: 'Corpo (${svc.doctors.length})',
                ),
                const NavigationDestination(
                  icon: Icon(Icons.bar_chart_outlined),
                  selectedIcon: Icon(Icons.bar_chart, color: kBrand950),
                  label: 'Fechamento',
                ),
              ],
            ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isMobile) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Color(0xFFD5D7E5))),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: EdgeInsets.symmetric(horizontal: isMobile ? 12 : 24, vertical: 8),
              child: Row(
                children: [
                  Container(
                    width: isMobile ? 42 : 48,
                    height: isMobile ? 42 : 48,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFD5D7E5)),
                      color: Colors.white,
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Image.asset(
                      'assets/images/logo-header.png',
                      fit: BoxFit.cover,
                      filterQuality: FilterQuality.high,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.local_hospital, color: kBrand700),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Santa Casa de Ponta Grossa',
                          style: TextStyle(
                            fontSize: isMobile ? 15 : 18,
                            fontWeight: FontWeight.w900,
                            color: kBrand950,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Maternidade • Escala de Plantão',
                          style: TextStyle(
                            fontSize: isMobile ? 12 : 13,
                            fontWeight: FontWeight.w700,
                            color: kBrand700,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  // Botão de Notificações do Plantonista (Login Google + Duplo Cheque)
                  IconButton(
                    tooltip: 'Notificações no App & Login Google',
                    onPressed: () => _openNotificationsModal(context),
                    icon: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        const Icon(Icons.notifications_active, color: kScRed600),
                        if (svc.selectedNotificationDoctorId != 'ALL')
                          Positioned(
                            right: -2,
                            top: -2,
                            child: Container(
                              width: 9,
                              height: 9,
                              decoration: const BoxDecoration(
                                color: Colors.green,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 4),
                  // Switch Consulta / Editor (Senha de 6 dígitos)
                  InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => _handleModeToggle(context),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: svc.isEditorMode ? kScRed50 : kContainer,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: svc.isEditorMode ? kScRed600 : const Color(0xFFC5C6D4),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            svc.isEditorMode ? Icons.lock_open : Icons.visibility,
                            size: 15,
                            color: svc.isEditorMode ? kScRed600 : kBrand700,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            svc.isEditorMode ? 'Editor' : 'Consulta',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: svc.isEditorMode ? kScRed700 : kBrand950,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (!isMobile)
              Container(
                color: kSurface,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
                child: Row(
                  children: [
                    _buildDesktopTabChip(0, Icons.calendar_month, 'Escala'),
                    const SizedBox(width: 8),
                    _buildDesktopTabChip(1, Icons.bed, 'Pacientes'),
                    const SizedBox(width: 8),
                    _buildDesktopTabChip(
                        2, Icons.people, 'Corpo Clínico (${svc.doctors.length})'),
                    const SizedBox(width: 8),
                    _buildDesktopTabChip(3, Icons.bar_chart, 'Fechamento'),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDesktopTabChip(int index, IconData icon, String label) {
    final selected = _currentTab == index;
    return ChoiceChip(
      selected: selected,
      onSelected: (_) => setState(() => _currentTab = index),
      avatar: Icon(icon, size: 16, color: selected ? Colors.white : kBrand950),
      label: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          color: selected ? Colors.white : kBrand950,
        ),
      ),
      selectedColor: kBrand700,
      backgroundColor: kContainer,
      showCheckmark: false,
    );
  }

  /// ==========================================================================
  /// ABA 1: ESCALA SEMANAL + MÉDICOS DE PLANTÃO AGORA
  /// ==========================================================================
  Widget _buildEscalaTab(BuildContext context, bool isMobile) {
    final weekRanges = <List<int>>[
      [1, 1],
      [2, 8],
      [9, 15],
      [16, 22],
      [23, 29],
      [30, 30],
    ];
    final wkIdx = svc.currentWeekIndex.clamp(0, weekRanges.length - 1);
    final range = weekRanges[wkIdx];
    final daysInWeek = <int>[
      for (int d = range[0]; d <= range[1]; d++) d,
    ];

    final onCallNow = svc.getDoctorsOnCallNow();

    return ListView(
      children: [
        // Barra Superior da Escala
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Novembro 2026',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: kBrand950,
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton.tonalIcon(
                    onPressed: () {
                      setState(() {
                        svc.currentWeekIndex = 3; // Semana de 16/11 a 22/11
                        svc.selectedDate = '2026-11-20';
                      });
                    },
                    icon: const Icon(Icons.today, size: 16),
                    label: const Text(
                      'Hoje',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                    ),
                  ),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Semana anterior',
                    onPressed: wkIdx > 0
                        ? () => setState(() => svc.currentWeekIndex = wkIdx - 1)
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text(
                    '${range[0].toString().padLeft(2, '0')}/11 a ${range[1].toString().padLeft(2, '0')}/11',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: kBrand950,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Próxima semana',
                    onPressed: wkIdx < weekRanges.length - 1
                        ? () => setState(() => svc.currentWeekIndex = wkIdx + 1)
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                  if (isMobile)
                    IconButton(
                      tooltip: 'Tela cheia',
                      onPressed: () =>
                          setState(() => _isTableFullscreen = !_isTableFullscreen),
                      icon: const Icon(Icons.fullscreen, color: kBrand700),
                    ),
                ],
              ),
            ],
          ),
        ),

        // Barra do Modo Editor (Desfazer com confirmação + Avançar)
        if (svc.isEditorMode) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: kBrand50,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: kBrand100),
            ),
            child: Row(
              children: [
                const Icon(Icons.edit_note, color: kBrand700, size: 18),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'Modo Editor Ativo • Toque em uma célula para escalar',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: kBrand950,
                    ),
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: svc.canUndo ? () => _confirmUndoDialog(context) : null,
                  icon: const Icon(Icons.undo, size: 15),
                  label: const Text('Desfazer', style: TextStyle(fontSize: 12)),
                ),
                const SizedBox(width: 6),
                OutlinedButton.icon(
                  onPressed: svc.canRedo ? () => svc.redoShiftAction() : null,
                  icon: const Icon(Icons.redo, size: 15),
                  label: const Text('Avançar', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 10),

        // Tabela Semanal da Escala
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowColor: WidgetStateProperty.all(kContainer),
              columnSpacing: 18,
              columns: [
                const DataColumn(
                  label: Text('TURNO',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                ),
                const DataColumn(
                  label: Text('HORÁRIO',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                ),
                for (final day in daysInWeek)
                  DataColumn(
                    label: Text(
                      '${day.toString().padLeft(2, '0')}/11',
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                        color: kBrand950,
                      ),
                    ),
                  ),
              ],
              rows: [
                _buildScheduleDataRow('ROTINEIRO', '07h - 13h', 'routine', 'rotin', daysInWeek),
                _buildScheduleDataRow('MANHÃ 1', '07h - 13h', 'morning', 'm1', daysInWeek),
                _buildScheduleDataRow('MANHÃ 2', '07h - 13h', 'morning', 'm2', daysInWeek),
                _buildScheduleDataRow('TARDE 1', '13h - 19h', 'afternoon', 'a1', daysInWeek),
                _buildScheduleDataRow('TARDE 2', '13h - 19h', 'afternoon', 'a2', daysInWeek),
                _buildScheduleDataRow('REFORÇO', '19h - 23h', 'evening', 'extra', daysInWeek),
                _buildScheduleDataRow('NOITE 1', '19h - 07h', 'night', 'n1', daysInWeek),
                _buildScheduleDataRow('NOITE 2', '19h - 07h', 'night', 'n2', daysInWeek),
              ],
            ),
          ),
        ),

        const SizedBox(height: 14),

        // Bloco Separado Abaixo da Tabela: Médicos de Plantão Agora (Apenas Nome e Contato)
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                color: kContainerLow,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: const BoxDecoration(
                            color: kScRed600,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Médicos de Plantão Agora',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 15,
                            color: kBrand950,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: kScRed50,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: kScRed100),
                      ),
                      child: Text(
                        '${onCallNow.length} em plantão',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: kScRed700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              for (final s in onCallNow)
                Builder(builder: (context) {
                  final doc = svc.doctors.firstWhere(
                    (d) => d.id == s.doctorId,
                    orElse: () => DoctorModel(id: s.doctorId, name: s.doctorName),
                  );
                  return ListTile(
                    onTap: () => _openDoctorProfileModal(context, doc),
                    leading: CircleAvatar(
                      backgroundColor: kBrand50,
                      child: Text(
                        doc.name.characters.first,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          color: kBrand700,
                        ),
                      ),
                    ),
                    title: Text(
                      doc.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: kBrand950,
                        fontSize: 14,
                      ),
                    ),
                    subtitle: Text(
                      '${doc.specialty} • ${doc.phone.isNotEmpty ? doc.phone : "Telefone não cadastrado"}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right, color: kBrand700),
                  );
                }),
            ],
          ),
        ),
      ],
    );
  }

  DataRow _buildScheduleDataRow(
    String label,
    String hours,
    String shiftType,
    String slotRole,
    List<int> daysInWeek,
  ) {
    return DataRow(
      cells: [
        DataCell(Text(
          label,
          style: const TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 11,
            color: kBrand950,
          ),
        )),
        DataCell(Text(
          hours,
          style: const TextStyle(fontSize: 11, color: Colors.black54),
        )),
        ...daysInWeek.map((day) {
          final dateStr = '2026-11-${day.toString().padLeft(2, '0')}';
          final match = svc.shifts.where(
            (s) =>
                s.date == dateStr &&
                s.shiftType == shiftType &&
                s.slotRole == slotRole,
          );
          final entry = match.isNotEmpty ? match.first : null;
          return DataCell(
            InkWell(
              onTap: () {
                if (svc.isEditorMode) {
                  _openAssignShiftDialog(context, dateStr, shiftType, slotRole, entry);
                } else if (entry != null) {
                  final doc = svc.doctors.firstWhere(
                    (d) => d.id == entry.doctorId,
                    orElse: () => DoctorModel(id: entry.doctorId, name: entry.doctorName),
                  );
                  _openDoctorProfileModal(context, doc);
                }
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: entry != null ? kBrand50 : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  entry?.doctorName ?? '—',
                  style: TextStyle(
                    fontWeight: entry != null ? FontWeight.w800 : FontWeight.w500,
                    fontSize: 12,
                    color: entry != null ? kBrand950 : Colors.black38,
                  ),
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  /// ==========================================================================
  /// ABA 2: PACIENTES NA MATERNIDADE (GOOGLE SHEETS ⇄ FIREBASE EM TEMPO REAL)
  /// ==========================================================================
  Widget _buildMaternityTab(BuildContext context, bool isMobile) {
    final allBeds = svc.getAllMaternityBedsFlat();
    final occupiedCount = allBeds.where((b) => svc.getBedData(b).isOccupied).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Cabeçalho de Sincronização + Busca + Tela Cheia
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'Passagem de Plantão • Maternidade',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                          color: kBrand950,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: kBrand100,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '$occupiedCount de ${allBeds.length} leitos',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: kBrand950,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    svc.lastSyncLabel,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: kScRed700,
                    ),
                  ),
                ],
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  FilledButton.tonalIcon(
                    onPressed: () =>
                        svc.syncFromGoogleSheetAndFirestore(forceSheetPriority: true),
                    icon: const Icon(Icons.sync, size: 16),
                    label: const Text(
                      'Sincronizar',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filledTonal(
                    tooltip: 'Buscar paciente por nome ou leito',
                    style: IconButton.styleFrom(
                      backgroundColor: kScRed50,
                      foregroundColor: kScRed700,
                    ),
                    onPressed: () => _openPatientSearchModal(context),
                    icon: const Icon(Icons.search, size: 18),
                  ),
                  if (isMobile) ...[
                    const SizedBox(width: 4),
                    IconButton.filledTonal(
                      tooltip: 'Ver tabela em tela cheia',
                      onPressed: () =>
                          setState(() => _isTableFullscreen = !_isTableFullscreen),
                      icon: const Icon(Icons.fullscreen, size: 18),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 8),

        // Tabela 2D com rolagem vertical e horizontal (7 Colunas: LEITO, NOME, PARIDADE, T.S., ALTO RISCO, INTERNAÇÃO POR, OBSERVAÇÕES)
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFD5D7E5)),
            ),
            clipBehavior: Clip.antiAlias,
            child: SingleChildScrollView(
              scrollDirection: Axis.vertical,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  headingRowColor: WidgetStateProperty.all(kContainer),
                  columnSpacing: 16,
                  dataRowMinHeight: 46,
                  dataRowMaxHeight: 74,
                  columns: const [
                    DataColumn(
                        label: Text('LEITO',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    DataColumn(
                        label: Text('NOME',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    DataColumn(
                        label: Text('PARIDADE',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    DataColumn(
                        label: Text('T.S.',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    DataColumn(
                        label: Text('ALTO RISCO',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    DataColumn(
                        label: Text('INTERNAÇÃO POR',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    DataColumn(
                        label: Text('OBSERVAÇÕES',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                  ],
                  rows: allBeds.map((leito) {
                    final bed = svc.getBedData(leito);
                    final occ = bed.isOccupied;
                    return DataRow(
                      onSelectChanged: (_) => _openEvolutionModal(context, leito),
                      cells: [
                        DataCell(
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: occ ? Colors.green : Colors.grey.shade400,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                leito,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                  color: kBrand950,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 175,
                            child: Text(
                              bed.nome.isNotEmpty ? bed.nome : 'Livre',
                              style: TextStyle(
                                fontWeight: occ ? FontWeight.w800 : FontWeight.w400,
                                fontStyle: occ ? FontStyle.normal : FontStyle.italic,
                                color: occ ? kBrand950 : Colors.black38,
                                fontSize: 12,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        DataCell(Text(
                          bed.paridade.isNotEmpty ? bed.paridade : '—',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 12),
                        )),
                        DataCell(
                          bed.tipoSanguineo.isNotEmpty
                              ? Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: kBrand50,
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: kBrand100),
                                  ),
                                  child: Text(
                                    bed.tipoSanguineo,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 11,
                                      color: kBrand950,
                                    ),
                                  ),
                                )
                              : const Text('—',
                                  style: TextStyle(color: Colors.black38)),
                        ),
                        DataCell(
                          SizedBox(
                            width: 155,
                            child: bed.altoRisco.isNotEmpty
                                ? Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: kScRed50,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: kScRed100),
                                    ),
                                    child: Text(
                                      bed.altoRisco,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 11,
                                        color: kScRed700,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  )
                                : const Text('—',
                                    style: TextStyle(color: Colors.black38)),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 195,
                            child: Text(
                              bed.internacaoPor.isNotEmpty ? bed.internacaoPor : '—',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 250,
                            child: Text(
                              bed.observacoes.isNotEmpty ? bed.observacoes : '—',
                              style: const TextStyle(fontSize: 12),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    );
                  }).toList(),
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 8),

        // Botão Adicionar Evolução abaixo da tabela
        SizedBox(
          width: double.infinity,
          height: 48,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: kBrand700,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            onPressed: () => _openEvolutionModal(context, 'PRÉ 1'),
            icon: const Icon(Icons.note_add),
            label: const Text(
              'Adicionar Evolução',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
            ),
          ),
        ),
      ],
    );
  }

  /// ==========================================================================
  /// ABA 3: CORPO CLÍNICO (COM OPÇÃO DE RECEBER NOTIFICAÇÕES + DUPLO CHEQUE)
  /// ==========================================================================
  Widget _buildDoctorsTab(BuildContext context, bool isMobile) {
    final filtered = svc.doctors.where((d) {
      if (_doctorSearchQuery.trim().isEmpty) return true;
      return d.name.toLowerCase().contains(_doctorSearchQuery.toLowerCase());
    }).toList();

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  onChanged: (v) => setState(() => _doctorSearchQuery = v),
                  decoration: InputDecoration(
                    hintText: 'Buscar profissional no corpo clínico...',
                    prefixIcon: const Icon(Icons.search, size: 18),
                    isDense: true,
                    filled: true,
                    fillColor: kContainerLow,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(999),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: ListView.separated(
            itemCount: filtered.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, idx) {
              final doc = filtered[idx];
              final isNotifying =
                  svc.notificationsEnabled && svc.selectedNotificationDoctorId == doc.id;
              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: isNotifying ? kScRed600 : const Color(0xFFD5D7E5),
                    width: isNotifying ? 2 : 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    InkWell(
                      onTap: () => _openDoctorProfileModal(context, doc),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 24,
                            backgroundColor: kBrand50,
                            child: Text(
                              doc.name.characters.first,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                color: kBrand700,
                                fontSize: 18,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Flexible(
                                      child: Text(
                                        doc.name,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 15,
                                          color: kBrand950,
                                        ),
                                      ),
                                    ),
                                    if (isNotifying) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: kScRed600,
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: const Text(
                                          '🔔 Notificando',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                Text(
                                  '${doc.specialty} • ${doc.crm.isNotEmpty ? "CRM ${doc.crm}" : "CRM não cadastrado"}',
                                  style: const TextStyle(
                                      fontSize: 12, color: Colors.black54),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 40,
                      child: FilledButton.tonalIcon(
                        style: FilledButton.styleFrom(
                          backgroundColor:
                              isNotifying ? Colors.green.shade50 : kScRed50,
                          foregroundColor:
                              isNotifying ? Colors.green.shade800 : kScRed700,
                        ),
                        onPressed: () => _openDoctorProfileModal(context, doc),
                        icon: Icon(
                          isNotifying
                              ? Icons.notifications_active
                              : Icons.notification_add,
                          size: 16,
                        ),
                        label: Text(
                          isNotifying
                              ? 'Recebendo notificações deste profissional ✓'
                              : 'Receber notificações deste profissional',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  /// ==========================================================================
  /// ABA 4: FECHAMENTO (PROFISSIONAIS & PACIENTES COLAPSÁVEIS EM PORTUGUÊS)
  /// ==========================================================================
  Widget _buildStatsTab(BuildContext context, bool isMobile) {
    final allBeds = svc.getAllMaternityBedsFlat();
    final occupiedBeds =
        allBeds.map((b) => svc.getBedData(b)).where((b) => b.isOccupied).toList();
    final occupancyPct =
        allBeds.isNotEmpty ? ((occupiedBeds.length / allBeds.length) * 100).round() : 0;

    return ListView(
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Fechamento Mensal • Novembro de 2026',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: kBrand950,
                ),
              ),
              Chip(
                label: Text(
                  'Novembro de 2026',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // 1. Seção Colapsável: Fechamento dos Profissionais
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Column(
            children: [
              ListTile(
                onTap: () => setState(() =>
                    svc.statsProfessionalsCollapsed = !svc.statsProfessionalsCollapsed),
                leading: const Icon(Icons.medical_services, color: kBrand700),
                title: const Text(
                  'Fechamento dos Profissionais (Horas Mensais)',
                  style: TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 14, color: kBrand950),
                ),
                trailing: Icon(svc.statsProfessionalsCollapsed
                    ? Icons.expand_more
                    : Icons.expand_less),
              ),
              if (!svc.statsProfessionalsCollapsed)
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    headingRowColor: WidgetStateProperty.all(kContainer),
                    columns: const [
                      DataColumn(
                          label: Text('PROFISSIONAL',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('DIURNOS (6h)',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('NOTURNOS (12h)',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('ROTINA (6h)',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('REFORÇO (4h)',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('TOTAL',
                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 11))),
                    ],
                    rows: svc.doctors.map((doc) {
                      final docShifts =
                          svc.shifts.where((s) => s.doctorId == doc.id).toList();
                      final d6 = docShifts
                          .where((s) =>
                              s.shiftType == 'morning' ||
                              s.shiftType == 'afternoon')
                          .length;
                      final n12 =
                          docShifts.where((s) => s.shiftType == 'night').length;
                      final r6 =
                          docShifts.where((s) => s.shiftType == 'routine').length;
                      final e4 =
                          docShifts.where((s) => s.shiftType == 'evening').length;
                      final totalH = (d6 * 6) + (n12 * 12) + (r6 * 6) + (e4 * 4);
                      return DataRow(
                        cells: [
                          DataCell(Text(doc.name,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 12))),
                          DataCell(Text('$d6')),
                          DataCell(Text('$n12')),
                          DataCell(Text('$r6')),
                          DataCell(Text('$e4')),
                          DataCell(Text('${totalH}h',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w900, color: kBrand950))),
                        ],
                      );
                    }).toList(),
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // 2. Seção Colapsável: Indicadores Mensais de Pacientes da Maternidade
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Column(
            children: [
              ListTile(
                onTap: () => setState(
                    () => svc.statsPatientsCollapsed = !svc.statsPatientsCollapsed),
                leading: const Icon(Icons.analytics, color: kScRed600),
                title: const Text(
                  'Indicadores Mensais de Pacientes • Maternidade',
                  style: TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 14, color: kBrand950),
                ),
                trailing: Icon(svc.statsPatientsCollapsed
                    ? Icons.expand_more
                    : Icons.expand_less),
              ),
              if (!svc.statsPatientsCollapsed)
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      _buildKpiCard(
                        'Pacientes Internadas Agora',
                        '${occupiedBeds.length} / ${allBeds.length}',
                        'Taxa de ocupação: $occupancyPct%',
                      ),
                      _buildKpiCard(
                        'Tempo Médio Estimado',
                        '42h (1,8 dias)',
                        'Parto Normal / Cesárea / Alto Risco',
                      ),
                      _buildKpiCard(
                        'Gestantes de Alto Risco',
                        '${occupiedBeds.where((b) => b.altoRisco.trim().isNotEmpty).length} pacientes',
                        'Principais: HAC, DMG, ITU, RCIU, PE',
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildKpiCard(String title, String value, String subtitle) {
    return Container(
      width: 240,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD5D7E5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w800, color: Colors.black54)),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  fontSize: 20, fontWeight: FontWeight.w900, color: kBrand950)),
          const SizedBox(height: 2),
          Text(subtitle,
              style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700, color: kBrand700)),
        ],
      ),
    );
  }

  /// ==========================================================================
  /// MODAL: ADICIONAR EVOLUÇÃO (PARIDADE 0-20, ALTO RISCO, INTERNAÇÃO POR,
  ///        LEMBRETE CLÍNICO COM BOTÃO "i", E ALTA EM LARGURA TOTAL)
  /// ==========================================================================
  void _openEvolutionModal(BuildContext context, String initialLeito) {
    var currentLeito = initialLeito;
    var bed = svc.getBedData(currentLeito);

    final nomeCtrl = TextEditingController(text: bed.nome);
    final tsCtrl = TextEditingController(text: bed.tipoSanguineo);
    final parCtrl = TextEditingController(text: bed.paridade);
    final intCtrl = TextEditingController(text: bed.internacaoPor);
    final obsCtrl = TextEditingController(text: bed.observacoes);

    var parsedParity = ParsedParity.parse(bed.paridade);
    var parsedRisk = ParsedHighRisk.parse(bed.altoRisco);
    var parsedAdmission = ParsedAdmissionReason.parse(bed.internacaoPor);

    final outrosRiskCtrl = TextEditingController(text: parsedRisk.otherText);
    String? activeParityLetter;
    bool showReminderBox = false;
    bool showReminderInfo = false;
    final remTextCtrl = TextEditingController();
    final remDateCtrl = TextEditingController(text: '2026-11-20');
    final remTimeCtrl = TextEditingController(text: '14:00');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            void loadBed(String newLeito) {
              currentLeito = newLeito;
              bed = svc.getBedData(newLeito);
              nomeCtrl.text = bed.nome;
              tsCtrl.text = bed.tipoSanguineo;
              parCtrl.text = bed.paridade;
              intCtrl.text = bed.internacaoPor;
              obsCtrl.text = bed.observacoes;
              parsedParity = ParsedParity.parse(bed.paridade);
              parsedRisk = ParsedHighRisk.parse(bed.altoRisco);
              parsedAdmission = ParsedAdmissionReason.parse(bed.internacaoPor);
              outrosRiskCtrl.text = parsedRisk.otherText;
              activeParityLetter = null;
            }

            return DraggableScrollableSheet(
              expand: false,
              initialChildSize: 0.9,
              maxChildSize: 0.96,
              minChildSize: 0.6,
              builder: (_, scrollCtrl) {
                return ListView(
                  controller: scrollCtrl,
                  padding: const EdgeInsets.all(18),
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Adicionar Evolução • Maternidade',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 17,
                            color: kBrand950,
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const Divider(),

                    // Seletor de Quarto / Leito
                    const Text('Quarto / Leito *',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      initialValue: currentLeito,
                      items: [
                        for (final b in svc.getAllMaternityBedsFlat())
                          DropdownMenuItem(
                            value: b,
                            child: Text(
                              'Leito $b — ${svc.getBedData(b).nome.isNotEmpty ? svc.getBedData(b).nome : "Livre"}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 13),
                            ),
                          ),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setModalState(() => loadBed(val));
                        }
                      },
                    ),

                    const SizedBox(height: 12),

                    // NOME & T.S.
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextField(
                            controller: nomeCtrl,
                            decoration: const InputDecoration(
                              labelText: 'NOME',
                              filled: true,
                              fillColor: kContainerLow,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: tsCtrl,
                            decoration: const InputDecoration(
                              labelText: 'T.S. (Ex: A+, O-)',
                              filled: true,
                              fillColor: kContainerLow,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // PARIDADE: G P C A E M (0 a 20 estilo alarme; 0 oculta letra)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'PARIDADE (0 a 20 • 0 oculta a letra)',
                                style: TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 12,
                                    color: kBrand950),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(
                                  color: kBrand100,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  parCtrl.text.isNotEmpty ? parCtrl.text : '—',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 12,
                                      color: kBrand950),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final letter in ParsedParity.letters)
                                Builder(builder: (context) {
                                  final v = parsedParity.values[letter] ?? 0;
                                  final isOpen = activeParityLetter == letter;
                                  return InkWell(
                                    onTap: () => setModalState(() {
                                      activeParityLetter = isOpen ? null : letter;
                                    }),
                                    child: Container(
                                      width: 92,
                                      height: 54,
                                      decoration: BoxDecoration(
                                        color: v > 0 ? kBrand50 : Colors.white,
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                          color: isOpen || v > 0
                                              ? kBrand700
                                              : const Color(0xFFC5C6D4),
                                          width: isOpen || v > 0 ? 2 : 1,
                                        ),
                                      ),
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            '$letter ▼',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w900,
                                                fontSize: 12,
                                                color: kBrand950),
                                          ),
                                          Text(
                                            v == 0 ? '0 (oculto)' : '$letter$v',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w900,
                                              fontSize: 13,
                                              color:
                                                  v > 0 ? kBrand700 : Colors.black38,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                }),
                            ],
                          ),
                          if (activeParityLetter != null) ...[
                            const SizedBox(height: 10),
                            SizedBox(
                              height: 54,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: 21,
                                separatorBuilder: (_, _) => const SizedBox(width: 6),
                                itemBuilder: (_, numVal) {
                                  final letter = activeParityLetter!;
                                  final selected =
                                      (parsedParity.values[letter] ?? 0) == numVal;
                                  return ChoiceChip(
                                    selected: selected,
                                    label: Text(
                                      numVal == 0
                                          ? '0 (Ocultar $letter)'
                                          : '$letter$numVal',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800),
                                    ),
                                    onSelected: (_) {
                                      setModalState(() {
                                        parsedParity.values[letter] = numVal;
                                        parCtrl.text = parsedParity.toSheetString();
                                      });
                                    },
                                  );
                                },
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          TextField(
                            controller: parCtrl,
                            onChanged: (v) {
                              setModalState(() {
                                parsedParity = ParsedParity.parse(v);
                              });
                            },
                            decoration: const InputDecoration(
                              labelText: 'Texto na planilha (preserva complemento)',
                              isDense: true,
                              filled: true,
                              fillColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // ALTO RISCO: Múltipla Escolha + Outros
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'ALTO RISCO (Múltipla escolha + Outros compatível com planilha)',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                color: kBrand950),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final preset in kAltoRiscoPresets)
                                FilterChip(
                                  selected:
                                      parsedRisk.selectedCodes.contains(preset.code),
                                  label: Text(
                                    preset.code,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800, fontSize: 12),
                                  ),
                                  onSelected: (sel) {
                                    setModalState(() {
                                      final set =
                                          Set<String>.from(parsedRisk.selectedCodes);
                                      if (preset.code == 'NÃO') {
                                        set
                                          ..clear()
                                          ..add('NÃO');
                                      } else {
                                        set.remove('NÃO');
                                        if (sel) {
                                          set.add(preset.code);
                                        } else {
                                          set.remove(preset.code);
                                        }
                                      }
                                      parsedRisk = ParsedHighRisk(
                                        selectedCodes: set.toList(),
                                        otherText: outrosRiskCtrl.text,
                                      );
                                    });
                                  },
                                ),
                            ],
                          ),
                          if (parsedRisk.selectedCodes.contains('OUTROS')) ...[
                            const SizedBox(height: 8),
                            TextField(
                              controller: outrosRiskCtrl,
                              onChanged: (v) {
                                setModalState(() {
                                  parsedRisk = ParsedHighRisk(
                                    selectedCodes: parsedRisk.selectedCodes,
                                    otherText: v,
                                  );
                                });
                              },
                              decoration: const InputDecoration(
                                labelText: 'Outras comorbidades (texto livre)',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // INTERNAÇÃO POR + DATA E HORA DO NASCIMENTO
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'INTERNAÇÃO POR',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                color: kBrand950),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final opt in kInternacaoOptions)
                                ChoiceChip(
                                  selected: parsedAdmission.selectedOption == opt,
                                  label: Text(
                                    opt,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w900, fontSize: 12),
                                  ),
                                  onSelected: (_) {
                                    setModalState(() {
                                      parsedAdmission = ParsedAdmissionReason(
                                        selectedOption: opt,
                                        birthDate: parsedAdmission.birthDate.isNotEmpty
                                            ? parsedAdmission.birthDate
                                            : '2026-11-20',
                                        birthTime: parsedAdmission.birthTime.isNotEmpty
                                            ? parsedAdmission.birthTime
                                            : '12:00',
                                        extraText: parsedAdmission.extraText,
                                      );
                                      intCtrl.text = parsedAdmission.toSheetString();
                                    });
                                  },
                                ),
                            ],
                          ),
                          if (parsedAdmission.isDelivery) ...[
                            const SizedBox(height: 10),
                            TextField(
                              controller: TextEditingController(
                                  text: parsedAdmission.birthDate),
                              onChanged: (v) {
                                parsedAdmission = ParsedAdmissionReason(
                                  selectedOption: parsedAdmission.selectedOption,
                                  birthDate: v,
                                  birthTime: parsedAdmission.birthTime,
                                  extraText: parsedAdmission.extraText,
                                );
                                intCtrl.text = parsedAdmission.toSheetString();
                              },
                              decoration: const InputDecoration(
                                labelText: 'Data do Nascimento (AAAA-MM-DD)',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: TextEditingController(
                                  text: parsedAdmission.birthTime),
                              onChanged: (v) {
                                parsedAdmission = ParsedAdmissionReason(
                                  selectedOption: parsedAdmission.selectedOption,
                                  birthDate: parsedAdmission.birthDate,
                                  birthTime: v,
                                  extraText: parsedAdmission.extraText,
                                );
                                intCtrl.text = parsedAdmission.toSheetString();
                              },
                              decoration: const InputDecoration(
                                labelText: 'Hora do Nascimento (HH:MM)',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          TextField(
                            controller: intCtrl,
                            onChanged: (v) {
                              setModalState(() {
                                parsedAdmission = ParsedAdmissionReason.parse(v);
                              });
                            },
                            decoration: const InputDecoration(
                              labelText: 'Texto na planilha (preserva peso/Apgar)',
                              filled: true,
                              fillColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // OBSERVAÇÕES + ADICIONAR LEMBRETE CLÍNICO (COM BOTÃO "i")
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'OBSERVAÇÕES',
                          style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 12,
                              color: kBrand950),
                        ),
                        TextButton.icon(
                          onPressed: () => setModalState(
                              () => showReminderBox = !showReminderBox),
                          icon: const Icon(Icons.alarm_add,
                              size: 16, color: kScRed600),
                          label: const Text(
                            'Adicionar lembrete',
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 12,
                                color: kScRed700),
                          ),
                        ),
                      ],
                    ),

                    if (showReminderBox)
                      Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: kScRed50,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: kScRed100),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'Agendar Lembrete ao Plantonista',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 12,
                                      color: kScRed700),
                                ),
                                IconButton(
                                  tooltip: 'Informação sobre o alerta',
                                  onPressed: () => setModalState(
                                      () => showReminderInfo = !showReminderInfo),
                                  icon: const Icon(Icons.info_outline,
                                      size: 18, color: kBrand700),
                                ),
                              ],
                            ),
                            if (showReminderInfo)
                              Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Text(
                                  'No dia e horário escolhidos, o sistema identifica automaticamente o médico de plantão na escala e dispara a notificação no aplicativo. Na planilha ficará registrado apenas o texto do lembrete.',
                                  style: TextStyle(fontSize: 11),
                                ),
                              ),
                            TextField(
                              controller: remTextCtrl,
                              decoration: const InputDecoration(
                                labelText: 'Descrição (Ex: Verificar pressão)',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: remDateCtrl,
                              decoration: const InputDecoration(
                                labelText: 'Data do lembrete (AAAA-MM-DD)',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: remTimeCtrl,
                              decoration: const InputDecoration(
                                labelText: 'Horário do aviso (HH:MM)',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            FilledButton.icon(
                              style: FilledButton.styleFrom(
                                  backgroundColor: kScRed600),
                              onPressed: () {
                                if (remTextCtrl.text.trim().isEmpty) return;
                                svc.addClinicalReminder(
                                  leito: currentLeito,
                                  patientName: nomeCtrl.text.trim(),
                                  text: remTextCtrl.text.trim(),
                                  date: remDateCtrl.text.trim(),
                                  time: remTimeCtrl.text.trim(),
                                );
                                final curObs = obsCtrl.text.trim();
                                obsCtrl.text = curObs.isNotEmpty
                                    ? '$curObs\nLembrete: ${remTextCtrl.text.trim()}'
                                    : 'Lembrete: ${remTextCtrl.text.trim()}';
                                remTextCtrl.clear();
                                setModalState(() => showReminderBox = false);
                              },
                              icon: const Icon(Icons.add_alarm, size: 16),
                              label: const Text('Incluir Lembrete'),
                            ),
                          ],
                        ),
                      ),

                    TextField(
                      controller: obsCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'Evolução clínica, conduta e pendências...',
                        filled: true,
                        fillColor: kContainerLow,
                      ),
                    ),

                    const SizedBox(height: 16),

                    // 1ª Linha: Cancelar e Salvar Evolução
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Cancelar'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                                backgroundColor: kBrand700),
                            onPressed: () async {
                              await svc.saveBedEvolution(MaternityBedModel(
                                leito: currentLeito,
                                nome: nomeCtrl.text.trim(),
                                paridade: parCtrl.text.trim(),
                                tipoSanguineo: tsCtrl.text.trim(),
                                altoRisco: parsedRisk.toSheetString(),
                                internacaoPor: intCtrl.text.trim(),
                                observacoes: obsCtrl.text.trim(),
                              ));
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            icon: const Icon(Icons.check, size: 16),
                            label: const Text('Salvar Evolução'),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 10),

                    // 2ª Linha: Botão Limpar Leito (Alta) em tom de vermelho ocupando toda a largura
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          backgroundColor: kScRed50,
                          foregroundColor: kScRed700,
                          side: const BorderSide(color: kScRed600, width: 1.5),
                        ),
                        onPressed: () =>
                            _confirmDischargeDialog(ctx, currentLeito),
                        icon: const Icon(Icons.delete_forever),
                        label: const Text(
                          'Limpar Leito (Alta)',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  void _confirmDischargeDialog(BuildContext parentCtx, String leito) {
    showDialog(
      context: parentCtx,
      builder: (dCtx) => AlertDialog(
        title: const Text(
          'Confirmar a alta, limpar dados de leito? Essa ação não podera ser desfeita.',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15),
        ),
        content: Text('Leito $leito'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dCtx),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: kScRed600),
            onPressed: () async {
              await svc.dischargeBed(leito);
              if (dCtx.mounted) Navigator.pop(dCtx);
              if (parentCtx.mounted) Navigator.pop(parentCtx);
            },
            child: const Text('Confirmar Alta'),
          ),
        ],
      ),
    );
  }

  /// ==========================================================================
  /// MODAL: FICHA DO MÉDICO + DUPLO CHEQUE DE NOTIFICAÇÕES COM CONTA GOOGLE
  /// ==========================================================================
  void _openDoctorProfileModal(BuildContext context, DoctorModel doc) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        final isNotifying =
            svc.notificationsEnabled && svc.selectedNotificationDoctorId == doc.id;
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: kBrand50,
                    child: Text(
                      doc.name.characters.first,
                      style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 20,
                          color: kBrand700),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          doc.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 18,
                              color: kBrand950),
                        ),
                        Text(
                          '${doc.specialty} • ${doc.crm.isNotEmpty ? "CRM ${doc.crm}" : "CRM não cadastrado"}',
                          style: const TextStyle(
                              fontSize: 12, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: kScRed50,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: kScRed100),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Notificações no App (Protegido por Login Google & Duplo Cheque)',
                      style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 12,
                          color: kBrand950),
                    ),
                    const SizedBox(height: 8),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor:
                            isNotifying ? Colors.green.shade700 : kScRed600,
                      ),
                      onPressed: () {
                        Navigator.pop(ctx);
                        _openDoubleCheckClaimDialog(context, doc);
                      },
                      icon: Icon(isNotifying
                          ? Icons.verified_user
                          : Icons.notification_add),
                      label: Text(
                        isNotifying
                            ? 'Recebendo notificações deste profissional ✓'
                            : 'Receber notificações deste profissional',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        );
      },
    );
  }

  /// Modal de Duplo Cheque para evitar que o médico Henrique ative por engano
  /// as notificações da médica Jéssica
  void _openDoubleCheckClaimDialog(BuildContext context, DoctorModel doc) {
    final gNameCtrl = TextEditingController(text: svc.googleUserName ?? '');
    final gEmailCtrl = TextEditingController(text: svc.googleUserEmail ?? '');
    final secretCtrl = TextEditingController();
    bool confirmedCheckbox = false;
    String? errorMsg;

    showDialog(
      context: context,
      builder: (dCtx) {
        return StatefulBuilder(
          builder: (dCtx, setDialogState) {
            final mismatch = svc.isNameMismatchWithGoogle(doc, gNameCtrl.text);
            return AlertDialog(
              title: Row(
                children: [
                  const Icon(Icons.verified_user, color: kScRed600),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Duplo Cheque • Dr(a). ${doc.name}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 15),
                    ),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: gNameCtrl,
                      onChanged: (_) => setDialogState(() {}),
                      decoration: const InputDecoration(
                        labelText: 'Seu Nome na Conta Google',
                        hintText: 'Ex: Henrique H',
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: gEmailCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Seu E-mail Google',
                        hintText: 'seuemail@gmail.com',
                      ),
                    ),
                    if (mismatch) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: kScRed50,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: kScRed600),
                        ),
                        child: Text(
                          'Atenção: Sua conta Google ("${gNameCtrl.text}") tem nome diferente do perfil selecionado ("Dr(a). ${doc.name}"). Para evitar receber alertas de outro colega, o código de verificação abaixo é obrigatório.',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: kScRed700,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    TextField(
                      controller: secretCtrl,
                      decoration: InputDecoration(
                        labelText:
                            '4 últimos dígitos do telefone de ${doc.name} (ou PIN)',
                      ),
                    ),
                    const SizedBox(height: 8),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: confirmedCheckbox,
                      onChanged: (v) =>
                          setDialogState(() => confirmedCheckbox = v ?? false),
                      title: Text(
                        'Confirmo que sou Dr(a). ${doc.name} e desejo receber meus alertas de plantão neste aparelho.',
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (errorMsg != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          errorMsg!,
                          style: const TextStyle(
                              color: kScRed600,
                              fontWeight: FontWeight.w800,
                              fontSize: 12),
                        ),
                      ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dCtx),
                  child: const Text('Cancelar'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: kScRed600),
                  onPressed: () {
                    final err = svc.verifyAndClaimDoctorProfile(
                      doctor: doc,
                      googleName: gNameCtrl.text,
                      googleEmail: gEmailCtrl.text,
                      secretInput: secretCtrl.text,
                      personalConfirmationChecked: confirmedCheckbox,
                    );
                    if (err != null) {
                      setDialogState(() => errorMsg = err);
                    } else {
                      Navigator.pop(dCtx);
                    }
                  },
                  child: const Text('Confirmar Duplo Cheque'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _openNotificationsModal(BuildContext context) {
    final doc = svc.doctors.firstWhere(
      (d) => d.id == svc.selectedNotificationDoctorId,
      orElse: () => svc.doctors.first,
    );
    _openDoubleCheckClaimDialog(context, doc);
  }

  void _openPatientSearchModal(BuildContext context) {
    String q = '';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            final occupied = svc
                .getAllMaternityBedsFlat()
                .map((b) => svc.getBedData(b))
                .where((b) =>
                    b.isOccupied &&
                    (q.isEmpty ||
                        b.nome.toLowerCase().contains(q.toLowerCase()) ||
                        b.leito.toLowerCase().contains(q.toLowerCase())))
                .toList();
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    autofocus: true,
                    onChanged: (v) => setModalState(() => q = v),
                    decoration: const InputDecoration(
                      hintText: 'Buscar paciente por nome ou leito...',
                      prefixIcon: Icon(Icons.search, color: kScRed600),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 300,
                    child: ListView.builder(
                      itemCount: occupied.length,
                      itemBuilder: (_, i) {
                        final b = occupied[i];
                        return ListTile(
                          title: Text('${b.leito} • ${b.nome}',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${b.paridade} • ${b.internacaoPor}'),
                          onTap: () {
                            Navigator.pop(ctx);
                            _openEvolutionModal(context, b.leito);
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _handleModeToggle(BuildContext context) {
    if (svc.isEditorMode) {
      setState(() => svc.isEditorMode = false);
      return;
    }
    final pinCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (dCtx) => AlertDialog(
        title: const Text('Acesso ao Modo Editor (6 dígitos)'),
        content: TextField(
          controller: pinCtrl,
          obscureText: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(hintText: 'Senha de 6 dígitos'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dCtx),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              if (pinCtrl.text.trim() == svc.editorPin) {
                setState(() => svc.isEditorMode = true);
                Navigator.pop(dCtx);
              }
            },
            child: const Text('Desbloquear'),
          ),
        ],
      ),
    );
  }

  void _confirmUndoDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dCtx) => AlertDialog(
        title: const Text('Deseja desfazer?'),
        content:
            const Text('A última alteração realizada na escala será revertida.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dCtx),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              svc.undoShiftAction();
              Navigator.pop(dCtx);
            },
            child: const Text('Sim, desfazer'),
          ),
        ],
      ),
    );
  }

  void _openAssignShiftDialog(
    BuildContext context,
    String date,
    String shiftType,
    String slotRole,
    ShiftEntryModel? currentEntry,
  ) {
    String? selectedDocId = currentEntry?.doctorId;
    showDialog(
      context: context,
      builder: (dCtx) => AlertDialog(
        title: Text('Escalar • $date'),
        content: DropdownButtonFormField<String>(
          initialValue: selectedDocId,
          items: [
            const DropdownMenuItem(value: '', child: Text('-- Limpar turno --')),
            for (final d in svc.doctors)
              DropdownMenuItem(value: d.id, child: Text(d.name)),
          ],
          onChanged: (v) => selectedDocId = v,
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dCtx),
              child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              svc.assignDoctorToShift(
                date: date,
                shiftType: shiftType,
                slotRole: slotRole,
                doctorId: selectedDocId,
              );
              Navigator.pop(dCtx);
            },
            child: const Text('Salvar'),
          ),
        ],
      ),
    );
  }
}
