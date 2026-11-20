import 'package:flutter/material.dart';
import 'models/clinical_models.dart';
import 'services/maternity_data_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Evita qualquer tarja amarela/preta de debug em telas compactas
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return const SizedBox.shrink();
  };
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
      title: 'Santa Casa PG - Maternidade',
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
        builder: (context, _) {
          if (!service.hasCompletedOnboarding) {
            return OnboardingFlowScreen(service: service);
          }
          return HomeShellScreen(service: service);
        },
      ),
    );
  }
}

/// ============================================================================
/// FLUXO DE ENTRADA:
/// 1. Login pelo Google > 2. Seleciona Perfil no Corpo Clínico >
/// 3. Confirma com CRM > 4. Pop-up Deseja Receber Notificações (Android/iOS) > Abre App
/// ============================================================================
class OnboardingFlowScreen extends StatefulWidget {
  final MaternityDataService service;

  const OnboardingFlowScreen({super.key, required this.service});

  @override
  State<OnboardingFlowScreen> createState() => _OnboardingFlowScreenState();
}

class _OnboardingFlowScreenState extends State<OnboardingFlowScreen> {
  int _step = 0; // 0 = Google Login, 1 = Selecionar Perfil + Confirmar CRM
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _crmCtrl = TextEditingController();
  String? _selectedDoctorId;
  String? _errorText;
  bool _isSigningInGoogle = false;

  MaternityDataService get svc => widget.service;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _nameCtrl.dispose();
    _crmCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleGoogleSignInStep() async {
    setState(() {
      _isSigningInGoogle = true;
      _errorText = null;
    });
    await svc.syncAllWithCloud();
    if (!mounted) return;

    final email = _emailCtrl.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() {
        _isSigningInGoogle = false;
        _errorText = 'Informe seu e-mail da conta Google para continuar.';
      });
      return;
    }

    svc.googleUserEmail = email.toLowerCase();
    svc.googleUserName = _nameCtrl.text.trim().isNotEmpty
        ? _nameCtrl.text.trim()
        : email.split('@').first;

    // Pré-seleciona o médico caso o nome ou e-mail já coincida
    if (svc.doctors.isNotEmpty) {
      final match = svc.doctors.where((d) =>
          d.linkedGoogleEmail.toLowerCase() == svc.googleUserEmail ||
          d.name.toLowerCase().contains(svc.googleUserName!.toLowerCase()));
      _selectedDoctorId =
          match.isNotEmpty ? match.first.id : svc.doctors.first.id;
      final doc = svc.doctors.firstWhere((d) => d.id == _selectedDoctorId);
      _crmCtrl.text = doc.crm;
    }

    setState(() {
      _isSigningInGoogle = false;
      _step = 1;
    });
  }

  void _handleConfirmCrmAndPromptNotifications() {
    if (_selectedDoctorId == null) {
      setState(() => _errorText = 'Selecione seu perfil na lista.');
      return;
    }
    final doc = svc.doctors.firstWhere((d) => d.id == _selectedDoctorId);
    final err = svc.confirmProfileWithCrm(
      doctor: doc,
      googleEmail: svc.googleUserEmail ?? _emailCtrl.text.trim(),
      googleName: svc.googleUserName ?? doc.name,
      crmInput: _crmCtrl.text,
    );

    if (err != null) {
      setState(() => _errorText = err);
      return;
    }

    // Passo 4: Pop-up "Deseja receber notificação?" (solicita permissão ao Android/iOS)
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: kScRed50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.notifications_active, color: kScRed600),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'Deseja receber notificações?',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: kBrand950,
                ),
              ),
            ),
          ],
        ),
        content: Text(
          'Dr(a). ${doc.name} (CRM ${doc.crm}), deseja ativar as notificações deste aparelho para:\n\n'
          '• Aviso automático 1h antes do seu plantão\n'
          '• Alertas agendados nas observações de pacientes internadas',
          style: const TextStyle(fontSize: 13, height: 1.35),
        ),
        actions: [
          TextButton(
            onPressed: () {
              svc.notificationsEnabled = false;
              Navigator.pop(dCtx);
              setState(() => svc.hasCompletedOnboarding = true);
            },
            child: const Text('Agora não'),
          ),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: kScRed600),
            onPressed: () async {
              Navigator.pop(dCtx);
              await svc.requestNativeNotificationPermission(doctor: doc);
              setState(() => svc.hasCompletedOnboarding = true);
            },
            icon: const Icon(Icons.check_circle_outline, size: 18),
            label: const Text('Permitir Notificações'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kBrand950,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 420),
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(26),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFD5D7E5)),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Image.asset(
                          'assets/images/logo-header.png',
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) =>
                              const Icon(Icons.local_hospital, color: kBrand700),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Santa Casa de Ponta Grossa',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 16,
                                color: kBrand950,
                              ),
                            ),
                            Text(
                              'Maternidade • Acesso do Corpo Clínico',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                                color: kBrand700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),

                  if (_step == 0) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kBrand50,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.account_circle, color: kBrand700),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Passo 1 de 2: Faça login com sua conta Google para identificar seu perfil médico.',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: kBrand950,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      decoration: InputDecoration(
                        labelText: 'E-mail da Conta Google',
                        hintText: 'seunome@gmail.com',
                        prefixIcon: const Icon(Icons.mail_outline),
                        filled: true,
                        fillColor: kContainerLow,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: kBrand700,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        onPressed:
                            _isSigningInGoogle ? null : _handleGoogleSignInStep,
                        icon: _isSigningInGoogle
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.login),
                        label: const Text(
                          'Continuar com Google',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 14),
                        ),
                      ),
                    ),
                  ] else ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kBrand50,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.verified_user, color: kBrand700),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Conta: ${svc.googleUserEmail}\nPasso 2 de 2: Selecione seu perfil e confirme com seu CRM.',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: kBrand950,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Selecione seu Perfil no Corpo Clínico:',
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                          color: kBrand950),
                    ),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _selectedDoctorId,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: kContainerLow,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      items: svc.doctors
                          .map((d) => DropdownMenuItem(
                                value: d.id,
                                child: Text(
                                  '${d.name} (${d.specialty}${d.crm.isNotEmpty ? " • CRM ${d.crm}" : ""})',
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w800, fontSize: 13),
                                ),
                              ))
                          .toList(),
                      onChanged: (val) {
                        setState(() {
                          _selectedDoctorId = val;
                          if (val != null) {
                            final doc =
                                svc.doctors.firstWhere((d) => d.id == val);
                            _crmCtrl.text = doc.crm;
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _crmCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'Confirme seu CRM',
                        hintText: 'Digite os números do seu CRM',
                        prefixIcon: const Icon(Icons.badge_outlined),
                        filled: true,
                        fillColor: kContainerLow,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: kScRed600,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        onPressed: _handleConfirmCrmAndPromptNotifications,
                        icon: const Icon(Icons.check_circle),
                        label: const Text(
                          'Confirmar CRM e Avançar',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 14),
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _step = 0),
                      child: const Text('Voltar para login Google'),
                    ),
                  ],

                  if (_errorText != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _errorText!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: kScRed600,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// ============================================================================
/// TELA PRINCIPAL DO APLICATIVO
/// ============================================================================
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
  String _prontuarioSearchQuery = '';

  MaternityDataService get svc => widget.service;

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 768;

    return Scaffold(
      backgroundColor: kSurface,
      // Em modo tela cheia NÃO exibe nenhuma barra superior!
      appBar: _isTableFullscreen
          ? null
          : PreferredSize(
              preferredSize: Size.fromHeight(isMobile ? 54 : 108),
              child: _buildHeader(context, isMobile),
            ),
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: _isTableFullscreen ? 0 : (isMobile ? 8 : 20),
            vertical: _isTableFullscreen ? 0 : 6,
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
      // Floating Action Button para Adicionar Evolução (aba Pacientes) ou Adicionar Médico (aba Médicos)
      floatingActionButton: _isTableFullscreen
          ? null
          : (_currentTab == 1
              ? FloatingActionButton.extended(
                  backgroundColor: kBrand700,
                  foregroundColor: Colors.white,
                  onPressed: () => _openEvolutionModal(context, 'PRÉ 1'),
                  icon: const Icon(Icons.note_add, size: 20),
                  label: const Text(
                    'Adicionar Evolução',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                )
              : (_currentTab == 2
                  ? FloatingActionButton.extended(
                      backgroundColor: kBrand700,
                      foregroundColor: Colors.white,
                      onPressed: () => _openAddOrEditDoctorModal(context, null),
                      icon: const Icon(Icons.person_add, size: 19),
                      label: const Text(
                        'Novo Médico',
                        style:
                            TextStyle(fontWeight: FontWeight.w900, fontSize: 12),
                      ),
                    )
                  : null)),
      // Barra inferior mais baixa (52px) e com "Médicos" no lugar de "Corpo"
      bottomNavigationBar: (!isMobile || _isTableFullscreen)
          ? null
          : NavigationBarTheme(
              data: NavigationBarThemeData(
                height: 52,
                labelTextStyle: WidgetStateProperty.all(
                  const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                ),
                iconTheme: WidgetStateProperty.all(
                  const IconThemeData(size: 19),
                ),
              ),
              child: NavigationBar(
                height: 52,
                selectedIndex: _currentTab,
                onDestinationSelected: (idx) =>
                    setState(() => _currentTab = idx),
                backgroundColor: Colors.white,
                indicatorColor: kBrand100,
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.calendar_month_outlined),
                    selectedIcon: Icon(Icons.calendar_month, color: kBrand950),
                    label: 'Escala',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.bed_outlined),
                    selectedIcon: Icon(Icons.bed, color: kBrand950),
                    label: 'Pacientes',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.people_outline),
                    selectedIcon: Icon(Icons.people, color: kBrand950),
                    label: 'Médicos',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.bar_chart_outlined),
                    selectedIcon: Icon(Icons.bar_chart, color: kBrand950),
                    label: 'Fechamento',
                  ),
                ],
              ),
            ),
    );
  }

  /// Barra superior limpa: apenas o nome do app à esquerda e o switch de
  /// olho/cadeado no canto direito (sem sino e sem texto "Consulta"/"Editor").
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
              padding: EdgeInsets.symmetric(
                  horizontal: isMobile ? 10 : 20, vertical: 6),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFD5D7E5)),
                      color: Colors.white,
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Image.asset(
                      'assets/images/logo-header.png',
                      fit: BoxFit.cover,
                      filterQuality: FilterQuality.high,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.local_hospital, color: kBrand700, size: 20),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Santa Casa de Ponta Grossa',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            color: kBrand950,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Maternidade • Escala de Plantão',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: kBrand700,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  // Switch compacto apenas com Olho / Cadeado no canto direito
                  InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => _handleModeToggle(context),
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: kContainer,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: const Color(0xFFC5C6D4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 28,
                            height: 26,
                            decoration: BoxDecoration(
                              color: !svc.isEditorMode
                                  ? Colors.white
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Icon(
                              Icons.visibility,
                              size: 15,
                              color:
                                  !svc.isEditorMode ? kBrand700 : Colors.black45,
                            ),
                          ),
                          Container(
                            width: 28,
                            height: 26,
                            decoration: BoxDecoration(
                              color: svc.isEditorMode
                                  ? kScRed600
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Icon(
                              svc.isEditorMode ? Icons.lock_open : Icons.lock,
                              size: 14,
                              color:
                                  svc.isEditorMode ? Colors.white : Colors.black45,
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
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                child: Row(
                  children: [
                    _buildDesktopTabChip(0, Icons.calendar_month, 'Escala'),
                    const SizedBox(width: 8),
                    _buildDesktopTabChip(1, Icons.bed, 'Pacientes'),
                    const SizedBox(width: 8),
                    _buildDesktopTabChip(2, Icons.people, 'Médicos'),
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
      avatar: Icon(icon, size: 15, color: selected ? Colors.white : kBrand950),
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
  /// ABA 1: ESCALA SEMANAL + BOTÃO DE TELA CHEIA FLUTUANTE FIXO NO CANTO DA TABELA
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

    final scheduleTableStack = Stack(
      children: [
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(_isTableFullscreen ? 0 : 16),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            scrollDirection: Axis.vertical,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(kContainer),
                headingRowHeight: 38,
                dataRowMinHeight: 38,
                dataRowMaxHeight: 46,
                columnSpacing: 14,
                columns: [
                  const DataColumn(
                    label: Text('TURNO',
                        style: TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 11)),
                  ),
                  const DataColumn(
                    label: Text('HORÁRIO',
                        style: TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 11)),
                  ),
                  for (final day in daysInWeek)
                    DataColumn(
                      label: Text(
                        '${day.toString().padLeft(2, '0')}/11',
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 11,
                          color: kBrand950,
                        ),
                      ),
                    ),
                ],
                rows: [
                  _buildScheduleDataRow(
                      'ROTINEIRO', '07-13h', 'routine', 'rotin', daysInWeek),
                  _buildScheduleDataRow(
                      'MANHÃ 1', '07-13h', 'morning', 'm1', daysInWeek),
                  _buildScheduleDataRow(
                      'MANHÃ 2', '07-13h', 'morning', 'm2', daysInWeek),
                  _buildScheduleDataRow(
                      'TARDE 1', '13-19h', 'afternoon', 'a1', daysInWeek),
                  _buildScheduleDataRow(
                      'TARDE 2', '13-19h', 'afternoon', 'a2', daysInWeek),
                  _buildScheduleDataRow(
                      'REFORÇO', '19-23h', 'evening', 'extra', daysInWeek),
                  _buildScheduleDataRow(
                      'NOITE 1', '19-07h', 'night', 'n1', daysInWeek),
                  _buildScheduleDataRow(
                      'NOITE 2', '19-07h', 'night', 'n2', daysInWeek),
                ],
              ),
            ),
          ),
        ),
        // Botão de Tela Cheia Flutuante Fixo no Canto Superior Direito da Planilha (não se move com as células!)
        Positioned(
          top: 6,
          right: 6,
          child: Material(
            color: kBrand950.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(10),
            elevation: 3,
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () =>
                  setState(() => _isTableFullscreen = !_isTableFullscreen),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _isTableFullscreen
                          ? Icons.fullscreen_exit
                          : Icons.fullscreen,
                      color: Colors.white,
                      size: 16,
                    ),
                    if (_isTableFullscreen) ...[
                      const SizedBox(width: 4),
                      const Text(
                        'Sair',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );

    if (_isTableFullscreen) {
      return SizedBox.expand(child: scheduleTableStack);
    }

    return ListView(
      children: [
        // Caixa compacta onde está o mês e navegação de semanas
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Row(
            children: [
              const Text(
                'Novembro 2026',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  color: kBrand950,
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: () {
                  setState(() {
                    svc.currentWeekIndex = 3;
                    svc.selectedDate = '2026-11-20';
                  });
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: kBrand50,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: kBrand100),
                  ),
                  child: const Text(
                    'Hoje',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                        color: kBrand700),
                  ),
                ),
              ),
              const Spacer(),
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                onPressed: wkIdx > 0
                    ? () => setState(() => svc.currentWeekIndex = wkIdx - 1)
                    : null,
                icon: const Icon(Icons.chevron_left, size: 20),
              ),
              Text(
                '${range[0].toString().padLeft(2, '0')}/11 a ${range[1].toString().padLeft(2, '0')}/11',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                  color: kBrand950,
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                onPressed: wkIdx < weekRanges.length - 1
                    ? () => setState(() => svc.currentWeekIndex = wkIdx + 1)
                    : null,
                icon: const Icon(Icons.chevron_right, size: 20),
              ),
            ],
          ),
        ),

        if (svc.isEditorMode) ...[
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: kBrand50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kBrand100),
            ),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Modo Editor • Toque para escalar',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: kBrand950,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                TextButton.icon(
                  style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact),
                  onPressed:
                      svc.canUndo ? () => _confirmUndoDialog(context) : null,
                  icon: const Icon(Icons.undo, size: 14),
                  label: const Text('Desfazer', style: TextStyle(fontSize: 11)),
                ),
                TextButton.icon(
                  style: TextButton.styleFrom(
                      visualDensity: VisualDensity.compact),
                  onPressed: svc.canRedo ? () => svc.redoShiftAction() : null,
                  icon: const Icon(Icons.redo, size: 14),
                  label: const Text('Avançar', style: TextStyle(fontSize: 11)),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 8),

        scheduleTableStack,

        const SizedBox(height: 10),

        // Médicos de Plantão Agora (Apenas Nome e Contato)
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                color: kContainerLow,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
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
                            fontSize: 13,
                            color: kBrand950,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      '${onCallNow.length} em plantão',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: kScRed700,
                      ),
                    ),
                  ],
                ),
              ),
              for (final s in onCallNow)
                Builder(builder: (context) {
                  final doc = svc.doctors.firstWhere(
                    (d) => d.id == s.doctorId,
                    orElse: () =>
                        DoctorModel(id: s.doctorId, name: s.doctorName),
                  );
                  return ListTile(
                    dense: true,
                    onTap: () => _openDoctorProfileModal(context, doc),
                    leading: CircleAvatar(
                      radius: 16,
                      backgroundColor: kBrand50,
                      child: Text(
                        doc.name.characters.first,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          color: kBrand700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    title: Text(
                      doc.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: kBrand950,
                        fontSize: 13,
                      ),
                    ),
                    subtitle: Text(
                      '${doc.specialty} • ${doc.phone.isNotEmpty ? doc.phone : "Sem telefone"}',
                      style: const TextStyle(fontSize: 11),
                    ),
                    trailing: const Icon(Icons.chevron_right,
                        color: kBrand700, size: 18),
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
          style: const TextStyle(fontSize: 10, color: Colors.black54),
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
                  _openAssignShiftDialog(
                      context, dateStr, shiftType, slotRole, entry);
                } else if (entry != null) {
                  final doc = svc.doctors.firstWhere(
                    (d) => d.id == entry.doctorId,
                    orElse: () => DoctorModel(
                        id: entry.doctorId, name: entry.doctorName),
                  );
                  _openDoctorProfileModal(context, doc);
                }
              },
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: entry != null ? kBrand50 : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  entry?.doctorName ?? '—',
                  style: TextStyle(
                    fontWeight:
                        entry != null ? FontWeight.w800 : FontWeight.w500,
                    fontSize: 11,
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
  /// ABA 2: PACIENTES NA MATERNIDADE (COM TELA CHEIA FLUTUANTE FIXA E FAB)
  /// ==========================================================================
  Widget _buildMaternityTab(BuildContext context, bool isMobile) {
    final allBeds = svc.getAllMaternityBedsFlat();
    final occupiedCount =
        allBeds.where((b) => svc.getBedData(b).isOccupied).length;

    final maternityTableStack = Stack(
      children: [
        Container(
          width: double.infinity,
          height: double.infinity,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(_isTableFullscreen ? 0 : 16),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          clipBehavior: Clip.antiAlias,
          child: SingleChildScrollView(
            scrollDirection: Axis.vertical,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(kContainer),
                headingRowHeight: 38,
                columnSpacing: 14,
                dataRowMinHeight: 42,
                dataRowMaxHeight: 68,
                columns: const [
                  DataColumn(
                      label: Text('LEITO',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
                  DataColumn(
                      label: Text('NOME',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
                  DataColumn(
                      label: Text('PARIDADE',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
                  DataColumn(
                      label: Text('T.S.',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
                  DataColumn(
                      label: Text('ALTO RISCO',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
                  DataColumn(
                      label: Text('INTERNAÇÃO POR',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
                  DataColumn(
                      label: Text('OBSERVAÇÕES',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 11))),
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
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                color: occ
                                    ? Colors.green
                                    : Colors.grey.shade400,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 5),
                            Text(
                              leito,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                color: kBrand950,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      DataCell(
                        SizedBox(
                          width: 165,
                          child: Text(
                            bed.nome.isNotEmpty ? bed.nome : 'Livre',
                            style: TextStyle(
                              fontWeight:
                                  occ ? FontWeight.w800 : FontWeight.w400,
                              fontStyle:
                                  occ ? FontStyle.normal : FontStyle.italic,
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
                            fontWeight: FontWeight.w700, fontSize: 11),
                      )),
                      DataCell(
                        bed.tipoSanguineo.isNotEmpty
                            ? Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
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
                          width: 145,
                          child: bed.altoRisco.isNotEmpty
                              ? Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: kScRed50,
                                    borderRadius: BorderRadius.circular(8),
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
                          width: 185,
                          child: Text(
                            bed.internacaoPor.isNotEmpty
                                ? bed.internacaoPor
                                : '—',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 11,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                      DataCell(
                        SizedBox(
                          width: 230,
                          child: Text(
                            bed.observacoes.isNotEmpty ? bed.observacoes : '—',
                            style: const TextStyle(fontSize: 11),
                            maxLines: 2,
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
        // Botão de Tela Cheia Flutuante Fixo no Canto Superior Direito da Planilha
        Positioned(
          top: 6,
          right: 6,
          child: Material(
            color: kBrand950.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(10),
            elevation: 3,
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () =>
                  setState(() => _isTableFullscreen = !_isTableFullscreen),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _isTableFullscreen
                          ? Icons.fullscreen_exit
                          : Icons.fullscreen,
                      color: Colors.white,
                      size: 16,
                    ),
                    if (_isTableFullscreen) ...[
                      const SizedBox(width: 4),
                      const Text(
                        'Sair',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );

    if (_isTableFullscreen) {
      return SizedBox.expand(child: maternityTableStack);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Barra compacta de sincronização e busca
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Flexible(
                          child: Text(
                            'Pacientes • Maternidade',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              color: kBrand950,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: kBrand100,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            '$occupiedCount/${allBeds.length}',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              color: kBrand950,
                            ),
                          ),
                        ),
                      ],
                    ),
                    Text(
                      svc.lastSyncLabel,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: kScRed700,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Sincronizar agora',
                onPressed: () =>
                    svc.syncAllWithCloud(forceSheetPriority: true),
                icon: const Icon(Icons.sync, size: 18, color: kBrand700),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Buscar paciente',
                onPressed: () => _openPatientSearchModal(context),
                icon: const Icon(Icons.search, size: 18, color: kScRed600),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Expanded(child: maternityTableStack),
      ],
    );
  }

  /// ==========================================================================
  /// ABA 3: MÉDICOS (CORPO CLÍNICO COM ADIÇÃO/EDIÇÃO SINCRONIZADA NA NUVEM)
  /// ==========================================================================
  Widget _buildDoctorsTab(BuildContext context, bool isMobile) {
    final filtered = svc.doctors.where((d) {
      if (_doctorSearchQuery.trim().isEmpty) return true;
      return d.name.toLowerCase().contains(_doctorSearchQuery.toLowerCase());
    }).toList();

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  onChanged: (v) => setState(() => _doctorSearchQuery = v),
                  decoration: InputDecoration(
                    hintText: 'Buscar médico (${svc.doctors.length})...',
                    prefixIcon: const Icon(Icons.search, size: 18),
                    isDense: true,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    filled: true,
                    fillColor: kContainerLow,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(999),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Sincronizar médicos com a Web',
                onPressed: () => svc.syncAllWithCloud(),
                icon: const Icon(Icons.sync, color: kBrand700, size: 19),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.only(bottom: 72),
            itemCount: filtered.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, idx) {
              final doc = filtered[idx];
              final isNotifying = svc.notificationsEnabled &&
                  svc.selectedNotificationDoctorId == doc.id;
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isNotifying ? kScRed600 : const Color(0xFFD5D7E5),
                    width: isNotifying ? 2 : 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        InkWell(
                          onTap: () => _openDoctorProfileModal(context, doc),
                          child: CircleAvatar(
                            radius: 20,
                            backgroundColor: kBrand50,
                            child: Text(
                              doc.name.characters.first,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                color: kBrand700,
                                fontSize: 16,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: InkWell(
                            onTap: () => _openDoctorProfileModal(context, doc),
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
                                          fontSize: 14,
                                          color: kBrand950,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    if (isNotifying) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: kScRed600,
                                          borderRadius:
                                              BorderRadius.circular(6),
                                        ),
                                        child: const Text(
                                          '🔔 Ativo',
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
                                  '${doc.specialty} • ${doc.crm.isNotEmpty ? "CRM ${doc.crm}" : "CRM não informado"} • ${doc.phone.isNotEmpty ? doc.phone : "Sem tel."}',
                                  style: const TextStyle(
                                      fontSize: 11, color: Colors.black54),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          tooltip: 'Editar Médico',
                          onPressed: () =>
                              _openAddOrEditDoctorModal(context, doc),
                          icon: const Icon(Icons.edit_outlined,
                              size: 18, color: kBrand700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 36,
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
                          size: 15,
                        ),
                        label: Text(
                          isNotifying
                              ? 'Recebendo notificações ✓'
                              : 'Receber notificações deste profissional',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 11),
                          overflow: TextOverflow.ellipsis,
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

  /// Modal para Adicionar ou Editar Médico no Corpo Clínico (sincronizado com Firebase)
  void _openAddOrEditDoctorModal(BuildContext context, DoctorModel? existing) {
    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final crmCtrl = TextEditingController(text: existing?.crm ?? '');
    final phoneCtrl = TextEditingController(text: existing?.phone ?? '');
    String specialty = existing?.specialty ?? 'GO';
    if (!['GO', 'Pediatra', 'Anestesista'].contains(specialty)) {
      specialty = 'GO';
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 18,
                right: 18,
                top: 18,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 18,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      existing == null
                          ? 'Novo Médico • Corpo Clínico'
                          : 'Editar ${existing.name}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                          color: kBrand950),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Nome do Profissional *',
                        filled: true,
                        fillColor: kContainerLow,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: crmCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'CRM',
                              filled: true,
                              fillColor: kContainerLow,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            isExpanded: true,
                            initialValue: specialty,
                            decoration: const InputDecoration(
                              labelText: 'Especialidade',
                              filled: true,
                              fillColor: kContainerLow,
                            ),
                            items: const [
                              DropdownMenuItem(value: 'GO', child: Text('GO')),
                              DropdownMenuItem(
                                  value: 'Pediatra', child: Text('Pediatra')),
                              DropdownMenuItem(
                                  value: 'Anestesista',
                                  child: Text('Anestesista')),
                            ],
                            onChanged: (v) {
                              if (v != null) {
                                setModalState(() => specialty = v);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: phoneCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Telefone / Celular',
                        filled: true,
                        fillColor: kContainerLow,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        if (existing != null) ...[
                          IconButton(
                            tooltip: 'Excluir médico',
                            onPressed: () async {
                              await svc.deleteDoctorFromCloud(existing.id);
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            icon: const Icon(Icons.delete_outline,
                                color: kScRed600),
                          ),
                        ],
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Cancelar'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                                backgroundColor: kBrand700),
                            onPressed: () async {
                              final name = nameCtrl.text.trim();
                              if (name.isEmpty) return;
                              final model = DoctorModel(
                                id: existing?.id ??
                                    'doc_${DateTime.now().millisecondsSinceEpoch}',
                                name: name,
                                crm: crmCtrl.text.trim(),
                                phone: phoneCtrl.text.trim(),
                                specialty: specialty,
                                photoUrl: existing?.photoUrl ?? '',
                                linkedGoogleEmail:
                                    existing?.linkedGoogleEmail ?? '',
                                linkedGoogleName:
                                    existing?.linkedGoogleName ?? '',
                              );
                              await svc.saveOrUpdateDoctorToCloud(model);
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            child: const Text('Salvar'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// ==========================================================================
  /// ABA 4: FECHAMENTO (PROFISSIONAIS, PACIENTES E PRONTUÁRIOS COM SENHA)
  /// ==========================================================================
  Widget _buildStatsTab(BuildContext context, bool isMobile) {
    final allBeds = svc.getAllMaternityBedsFlat();
    final occupiedBeds = allBeds
        .map((b) => svc.getBedData(b))
        .where((b) => b.isOccupied)
        .toList();
    final occupancyPct = allBeds.isNotEmpty
        ? ((occupiedBeds.length / allBeds.length) * 100).round()
        : 0;

    final prontuarios = svc.allMedicalRecordsSorted.where((r) {
      if (_prontuarioSearchQuery.trim().isEmpty) return true;
      final q = _prontuarioSearchQuery.toLowerCase();
      return r.nome.toLowerCase().contains(q) ||
          r.leito.toLowerCase().contains(q) ||
          r.internacaoPor.toLowerCase().contains(q);
    }).toList();

    return ListView(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: const Row(
            children: [
              Icon(Icons.calendar_today, size: 16, color: kBrand700),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Fechamento Mensal • Novembro de 2026',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 14,
                    color: kBrand950,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 10),

        // 1. Fechamento dos Profissionais (Colapsável)
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Column(
            children: [
              ListTile(
                dense: true,
                onTap: () => setState(() => svc.statsProfessionalsCollapsed =
                    !svc.statsProfessionalsCollapsed),
                leading:
                    const Icon(Icons.medical_services, color: kBrand700, size: 20),
                title: const Text(
                  'Fechamento dos Profissionais (Horas)',
                  style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: kBrand950),
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
                    headingRowHeight: 36,
                    dataRowMinHeight: 34,
                    dataRowMaxHeight: 40,
                    columnSpacing: 14,
                    columns: const [
                      DataColumn(
                          label: Text('PROFISSIONAL',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('DIURNOS',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('NOTURNOS',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('ROTINA',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('REFORÇO',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 11))),
                      DataColumn(
                          label: Text('TOTAL',
                              style: TextStyle(
                                  fontWeight: FontWeight.w900, fontSize: 11))),
                    ],
                    rows: svc.doctors.map((doc) {
                      final docShifts = svc.shifts
                          .where((s) => s.doctorId == doc.id)
                          .toList();
                      final d6 = docShifts
                          .where((s) =>
                              s.shiftType == 'morning' ||
                              s.shiftType == 'afternoon')
                          .length;
                      final n12 = docShifts
                          .where((s) => s.shiftType == 'night')
                          .length;
                      final r6 = docShifts
                          .where((s) => s.shiftType == 'routine')
                          .length;
                      final e4 = docShifts
                          .where((s) => s.shiftType == 'evening')
                          .length;
                      final totalH =
                          (d6 * 6) + (n12 * 12) + (r6 * 6) + (e4 * 4);
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
                                  fontWeight: FontWeight.w900,
                                  color: kBrand950))),
                        ],
                      );
                    }).toList(),
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: 10),

        // 2. Indicadores Mensais de Pacientes (Colapsável)
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Column(
            children: [
              ListTile(
                dense: true,
                onTap: () => setState(() =>
                    svc.statsPatientsCollapsed = !svc.statsPatientsCollapsed),
                leading: const Icon(Icons.analytics, color: kScRed600, size: 20),
                title: const Text(
                  'Indicadores Mensais de Pacientes',
                  style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: kBrand950),
                ),
                trailing: Icon(svc.statsPatientsCollapsed
                    ? Icons.expand_more
                    : Icons.expand_less),
              ),
              if (!svc.statsPatientsCollapsed)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildKpiCard(
                        'Pacientes Atendidas / Internadas',
                        '${svc.allMedicalRecordsSorted.length} registradas (${occupiedBeds.length} internadas)',
                        'Taxa de ocupação atual: $occupancyPct%',
                      ),
                      const SizedBox(height: 8),
                      _buildKpiCard(
                        'Tempo Médio Estimado de Internação',
                        '42h (1,8 dias)',
                        'Parto Normal / Cesárea / Tratamento Clínico',
                      ),
                      const SizedBox(height: 8),
                      _buildKpiCard(
                        'Gestantes de Alto Risco',
                        '${occupiedBeds.where((b) => b.altoRisco.trim().isNotEmpty).length} pacientes ativas',
                        'Principais: HAC, DMG, ITU, RCIU, Pré-eclâmpsia',
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: 10),

        // 3. PRONTUÁRIOS (Cadastrados por Nome, com Data de Inserção e de Alta, Protegido por Senha)
        Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListTile(
                dense: true,
                onTap: () => setState(() => svc.statsProntuariosCollapsed =
                    !svc.statsProntuariosCollapsed),
                leading: Icon(
                  svc.isProntuariosUnlocked ? Icons.folder_shared : Icons.lock,
                  color: kBrand700,
                  size: 20,
                ),
                title: Text(
                  'Prontuários (${svc.allMedicalRecordsSorted.length} pacientes)',
                  style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: kBrand950),
                ),
                subtitle: Text(
                  svc.isProntuariosUnlocked
                      ? 'Histórico nominal com data de inserção e alta'
                      : 'Protegido por senha • Toque para desbloquear',
                  style: const TextStyle(fontSize: 11),
                ),
                trailing: Icon(svc.statsProntuariosCollapsed
                    ? Icons.expand_more
                    : Icons.expand_less),
              ),
              if (!svc.statsProntuariosCollapsed)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: !svc.isProntuariosUnlocked
                      ? Column(
                          children: [
                            const Icon(Icons.lock_outline,
                                size: 32, color: kBrand700),
                            const SizedBox(height: 6),
                            const Text(
                              'Os prontuários nominais das pacientes com data de inserção e de alta são protegidos por senha.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 12),
                            ),
                            const SizedBox(height: 10),
                            FilledButton.icon(
                              style: FilledButton.styleFrom(
                                  backgroundColor: kBrand700),
                              onPressed: () =>
                                  _unlockProntuariosDialog(context),
                              icon: const Icon(Icons.key, size: 16),
                              label: const Text('Desbloquear Prontuários'),
                            ),
                          ],
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    onChanged: (v) => setState(
                                        () => _prontuarioSearchQuery = v),
                                    decoration: InputDecoration(
                                      hintText:
                                          'Buscar prontuário por nome da paciente...',
                                      prefixIcon:
                                          const Icon(Icons.search, size: 18),
                                      isDense: true,
                                      filled: true,
                                      fillColor: kContainerLow,
                                      border: OutlineInputBorder(
                                        borderRadius:
                                            BorderRadius.circular(999),
                                        borderSide: BorderSide.none,
                                      ),
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Bloquear prontuários',
                                  onPressed: () => setState(
                                      () => svc.isProntuariosUnlocked = false),
                                  icon: const Icon(Icons.lock_open,
                                      color: kScRed600, size: 18),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            for (final rec in prontuarios)
                              Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: kContainerLow,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                      color: const Color(0xFFD5D7E5)),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            rec.nome,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w900,
                                              fontSize: 13,
                                              color: kBrand950,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 7, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: rec.isDischarged
                                                ? kScRed50
                                                : Colors.green.shade50,
                                            borderRadius:
                                                BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            rec.isDischarged
                                                ? 'Alta'
                                                : 'Internada (${rec.leito})',
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              color: rec.isDischarged
                                                  ? kScRed700
                                                  : Colors.green.shade800,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Inserção: ${_formatIsoDateTime(rec.admittedAt)} • '
                                      'Alta: ${rec.dischargedAt.isNotEmpty ? _formatIsoDateTime(rec.dischargedAt) : "Em internação"}',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        color: kBrand700,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Leito: ${rec.leito} • Paridade: ${rec.paridade.isNotEmpty ? rec.paridade : "—"} • T.S.: ${rec.tipoSanguineo.isNotEmpty ? rec.tipoSanguineo : "—"}',
                                      style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700),
                                    ),
                                    if (rec.altoRisco.isNotEmpty)
                                      Text(
                                        'Alto Risco: ${rec.altoRisco}',
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: kScRed700,
                                            fontWeight: FontWeight.w700),
                                      ),
                                    if (rec.internacaoPor.isNotEmpty)
                                      Text(
                                        'Internação por: ${rec.internacaoPor}',
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                    if (rec.observacoes.isNotEmpty)
                                      Text(
                                        'Observações: ${rec.observacoes}',
                                        style: const TextStyle(
                                            fontSize: 11,
                                            color: Colors.black87),
                                      ),
                                  ],
                                ),
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

  String _formatIsoDateTime(String iso) {
    if (iso.isEmpty) return '—';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    final d = dt.day.toString().padLeft(2, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final y = dt.year;
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '$d/$m/$y $hh:$mm';
  }

  void _unlockProntuariosDialog(BuildContext context) {
    final pinCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (dCtx) => AlertDialog(
        title: const Text('Senha dos Prontuários',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
        content: TextField(
          controller: pinCtrl,
          obscureText: true,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(
            hintText: 'Digite a senha de 6 dígitos',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dCtx),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              if (pinCtrl.text.trim() == svc.editorPin) {
                setState(() => svc.isProntuariosUnlocked = true);
                Navigator.pop(dCtx);
              }
            },
            child: const Text('Liberar'),
          ),
        ],
      ),
    );
  }

  Widget _buildKpiCard(String title, String value, String subtitle) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kContainerLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFD5D7E5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: Colors.black54)),
          const SizedBox(height: 2),
          Text(value,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w900, color: kBrand950)),
          Text(subtitle,
              style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700, color: kBrand700)),
        ],
      ),
    );
  }

  /// ==========================================================================
  /// MODAL: ADICIONAR EVOLUÇÃO (BOTÃO "SALVAR" E ALTA EM LARGURA TOTAL)
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
                  padding: const EdgeInsets.all(16),
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Adicionar Evolução • Maternidade',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                              color: kBrand950,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.pop(ctx),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const Divider(),

                    // Seletor de Quarto / Leito (isExpanded: true para nunca estourar a largura no S10e!)
                    const Text('Quarto / Leito *',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 12)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: currentLeito,
                      items: [
                        for (final b in svc.getAllMaternityBedsFlat())
                          DropdownMenuItem(
                            value: b,
                            child: Text(
                              'Leito $b — ${svc.getBedData(b).nome.isNotEmpty ? svc.getBedData(b).nome : "Livre"}',
                              overflow: TextOverflow.ellipsis,
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
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: tsCtrl,
                            decoration: const InputDecoration(
                              labelText: 'T.S.',
                              filled: true,
                              fillColor: kContainerLow,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 12),

                    // PARIDADE: G P C A E M (0 a 20 estilo alarme; 0 oculta letra)
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'PARIDADE (0 a 20 • 0 oculta a letra)',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 12,
                                      color: kBrand950),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: kBrand100,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  parCtrl.text.isNotEmpty ? parCtrl.text : '—',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w900,
                                      fontSize: 11,
                                      color: kBrand950),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final letter in ParsedParity.letters)
                                Builder(builder: (context) {
                                  final v = parsedParity.values[letter] ?? 0;
                                  final isOpen = activeParityLetter == letter;
                                  return InkWell(
                                    onTap: () => setModalState(() {
                                      activeParityLetter =
                                          isOpen ? null : letter;
                                    }),
                                    child: Container(
                                      width: 88,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 7),
                                      decoration: BoxDecoration(
                                        color: v > 0 ? kBrand50 : Colors.white,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: isOpen || v > 0
                                              ? kBrand700
                                              : const Color(0xFFC5C6D4),
                                          width: isOpen || v > 0 ? 2 : 1,
                                        ),
                                      ),
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            '$letter ▼',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w900,
                                                fontSize: 12,
                                                color: kBrand950),
                                          ),
                                          Text(
                                            v == 0 ? '0' : '$letter$v',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w900,
                                              fontSize: 12,
                                              color: v > 0
                                                  ? kBrand700
                                                  : Colors.black38,
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
                            const SizedBox(height: 8),
                            SizedBox(
                              height: 46,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: 21,
                                separatorBuilder: (_, _) =>
                                    const SizedBox(width: 6),
                                itemBuilder: (_, numVal) {
                                  final letter = activeParityLetter!;
                                  final selected =
                                      (parsedParity.values[letter] ?? 0) ==
                                          numVal;
                                  return ChoiceChip(
                                    selected: selected,
                                    label: Text(
                                      numVal == 0
                                          ? '0 (Ocultar $letter)'
                                          : '$letter$numVal',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 12),
                                    ),
                                    onSelected: (_) {
                                      setModalState(() {
                                        parsedParity.values[letter] = numVal;
                                        parCtrl.text =
                                            parsedParity.toSheetString();
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
                              labelText: 'Texto na planilha',
                              isDense: true,
                              filled: true,
                              fillColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // ALTO RISCO
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'ALTO RISCO (Múltipla escolha + Outros)',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                color: kBrand950),
                          ),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final preset in kAltoRiscoPresets)
                                FilterChip(
                                  selected: parsedRisk.selectedCodes
                                      .contains(preset.code),
                                  label: Text(
                                    preset.code,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 11),
                                  ),
                                  onSelected: (sel) {
                                    setModalState(() {
                                      final set = Set<String>.from(
                                          parsedRisk.selectedCodes);
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
                                labelText: 'Outras comorbidades',
                                filled: true,
                                fillColor: Colors.white,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // INTERNAÇÃO POR
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(14),
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
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              for (final opt in kInternacaoOptions)
                                ChoiceChip(
                                  selected:
                                      parsedAdmission.selectedOption == opt,
                                  label: Text(
                                    opt,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w900,
                                        fontSize: 11),
                                  ),
                                  onSelected: (_) {
                                    setModalState(() {
                                      parsedAdmission = ParsedAdmissionReason(
                                        selectedOption: opt,
                                        birthDate:
                                            parsedAdmission.birthDate.isNotEmpty
                                                ? parsedAdmission.birthDate
                                                : '2026-11-20',
                                        birthTime:
                                            parsedAdmission.birthTime.isNotEmpty
                                                ? parsedAdmission.birthTime
                                                : '12:00',
                                        extraText: parsedAdmission.extraText,
                                      );
                                      intCtrl.text =
                                          parsedAdmission.toSheetString();
                                    });
                                  },
                                ),
                            ],
                          ),
                          if (parsedAdmission.isDelivery) ...[
                            const SizedBox(height: 8),
                            TextField(
                              controller: TextEditingController(
                                  text: parsedAdmission.birthDate),
                              onChanged: (v) {
                                parsedAdmission = ParsedAdmissionReason(
                                  selectedOption:
                                      parsedAdmission.selectedOption,
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
                                  selectedOption:
                                      parsedAdmission.selectedOption,
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
                                parsedAdmission =
                                    ParsedAdmissionReason.parse(v);
                              });
                            },
                            decoration: const InputDecoration(
                              labelText: 'Texto na planilha',
                              filled: true,
                              fillColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 12),

                    // OBSERVAÇÕES + LEMBRETE CLÍNICO
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'OBSERVAÇÕES',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                color: kBrand950),
                          ),
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
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: kScRed50,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: kScRed100),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                const Expanded(
                                  child: Text(
                                    'Agendar Lembrete ao Plantonista',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w900,
                                        fontSize: 12,
                                        color: kScRed700),
                                  ),
                                ),
                                IconButton(
                                  visualDensity: VisualDensity.compact,
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
                                  'No horário escolhido, o app notifica o plantonista em turno. Na planilha fica apenas o texto do lembrete.',
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
                                svc.triggerNativeNotification(
                                  '⏰ Lembrete Agendado • Leito $currentLeito',
                                  '${remTextCtrl.text.trim()} às ${remTimeCtrl.text.trim()}',
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

                    const SizedBox(height: 14),

                    // 1ª Linha: Cancelar e Salvar (apenas "Salvar")
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
                            label: const Text(
                              'Salvar',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 10),

                    // 2ª Linha: Botão Limpar Leito (Alta) em vermelho de largura total
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

  /// Modal de Perfil do Médico com confirmação simples por CRM + Notificações
  void _openDoctorProfileModal(BuildContext context, DoctorModel doc) {
    final crmInputCtrl = TextEditingController(text: doc.crm);
    String? errorMsg;

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
            final isNotifying = svc.notificationsEnabled &&
                svc.selectedNotificationDoctorId == doc.id;
            return Padding(
              padding: EdgeInsets.only(
                left: 18,
                right: 18,
                top: 18,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 18,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 24,
                          backgroundColor: kBrand50,
                          child: Text(
                            doc.name.characters.first,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 18,
                                color: kBrand700),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                doc.name,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 16,
                                    color: kBrand950),
                              ),
                              Text(
                                '${doc.specialty} • ${doc.crm.isNotEmpty ? "CRM ${doc.crm}" : "CRM não informado"} • ${doc.phone.isNotEmpty ? doc.phone : "Sem telefone"}',
                                style: const TextStyle(
                                    fontSize: 12, color: Colors.black54),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: 'Editar cadastro',
                          onPressed: () {
                            Navigator.pop(ctx);
                            _openAddOrEditDoctorModal(context, doc);
                          },
                          icon: const Icon(Icons.edit, color: kBrand700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kScRed50,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: kScRed100),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Receber Notificações deste Profissional (Confirme com CRM)',
                            style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                color: kBrand950),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: crmInputCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'CRM do Profissional',
                              isDense: true,
                              filled: true,
                              fillColor: Colors.white,
                            ),
                          ),
                          if (errorMsg != null) ...[
                            const SizedBox(height: 6),
                            Text(
                              errorMsg!,
                              style: const TextStyle(
                                  color: kScRed600,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800),
                            ),
                          ],
                          const SizedBox(height: 10),
                          FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: isNotifying
                                  ? Colors.green.shade700
                                  : kScRed600,
                            ),
                            onPressed: () async {
                              final err = svc.confirmProfileWithCrm(
                                doctor: doc,
                                googleEmail:
                                    svc.googleUserEmail ?? 'medico@santacasapg.br',
                                googleName: svc.googleUserName ?? doc.name,
                                crmInput: crmInputCtrl.text,
                              );
                              if (err != null) {
                                setModalState(() => errorMsg = err);
                                return;
                              }
                              await svc.requestNativeNotificationPermission(
                                  doctor: doc);
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                            icon: Icon(isNotifying
                                ? Icons.notifications_active
                                : Icons.notification_add),
                            label: Text(
                              isNotifying
                                  ? 'Recebendo notificações ✓'
                                  : 'Confirmar CRM e Receber Notificações',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
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
                    height: 280,
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
        title: const Text('Modo Editor (6 dígitos)',
            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
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
        content: const Text(
            'A última alteração realizada na escala será revertida.'),
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
        title: Text('Escalar • $date',
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
        content: DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: selectedDocId,
          items: [
            const DropdownMenuItem(value: '', child: Text('-- Limpar turno --')),
            for (final d in svc.doctors)
              DropdownMenuItem(
                value: d.id,
                child: Text(d.name, overflow: TextOverflow.ellipsis),
              ),
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
