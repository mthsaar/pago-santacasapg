import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'firebase_options.dart';
import 'models/clinical_models.dart';
import 'services/maternity_data_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
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
  void initState() {
    super.initState();
    service.initFirebaseAuth();
  }

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
/// 1. Autenticação Firebase (Google ou Cadastro/Login com E-mail e Senha)
/// 2. Digitar CRM (até 10 dígitos) e sistema identifica quem é o(a) médico(a)
/// 3. Pop-up "Bem-vindo(a) Dr(a) [nome], deseja ativar as notificações?"
/// ============================================================================
class OnboardingFlowScreen extends StatefulWidget {
  final MaternityDataService service;

  const OnboardingFlowScreen({super.key, required this.service});

  @override
  State<OnboardingFlowScreen> createState() => _OnboardingFlowScreenState();
}

class _OnboardingFlowScreenState extends State<OnboardingFlowScreen> {
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _passwordCtrl = TextEditingController();
  final TextEditingController _crmCtrl = TextEditingController();

  bool _isSignUpMode = false;
  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorText;

  MaternityDataService get svc => widget.service;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _crmCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleGoogleFirebaseLogin() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    final err = await svc.signInWithGoogleFirebase();
    if (!mounted) return;
    setState(() {
      _isLoading = false;
      _errorText = err;
    });
  }

  Future<void> _handleEmailPasswordAuth() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    final err = await svc.signInOrSignUpWithEmailPassword(
      email: _emailCtrl.text,
      password: _passwordCtrl.text,
      isSignUp: _isSignUpMode,
    );
    if (!mounted) return;
    setState(() {
      _isLoading = false;
      _errorText = err;
    });
  }

  Future<void> _handleVerifyCrmAndPromptNotifications() async {
    final crmDigits = _crmCtrl.text.replaceAll(RegExp(r'\D'), '');
    if (crmDigits.isEmpty || crmDigits.length > 10) {
      setState(() {
        _errorText = 'Digite o número do seu CRM (até 10 dígitos).';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorText = null;
    });

    final matchedDoc = await svc.verifyAndClaimDoctorByCrm(crmDigits);
    if (!mounted) return;

    setState(() {
      _isLoading = false;
    });

    if (matchedDoc == null) {
      setState(() {
        _errorText =
            'CRM $crmDigits não encontrado no Corpo Clínico cadastrado. Confira o número ou solicite o cadastro do CRM à coordenação.';
      });
      return;
    }

    // Pop-up de boas-vindas com o nome identificado pelo CRM e ativação das notificações
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
            Expanded(
              child: Text(
                'Bem-vindo(a) Dr(a). ${matchedDoc.name}',
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: kBrand950,
                ),
              ),
            ),
          ],
        ),
        content: Text(
          'Bem-vindo(a) Dr(a). ${matchedDoc.name} (CRM ${matchedDoc.crm}), deseja ativar as notificações deste aparelho para receber:\n\n'
          '• Avisos automáticos 1h antes dos seus plantões\n'
          '• Alertas agendados nas observações de pacientes internadas',
          style: const TextStyle(fontSize: 13, height: 1.4),
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
              await svc.requestNativeNotificationPermission(doctor: matchedDoc);
              setState(() => svc.hasCompletedOnboarding = true);
            },
            icon: const Icon(Icons.check_circle_outline, size: 18),
            label: const Text('Ativar Notificações'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isSignedIn = svc.firebaseUid != null ||
        (svc.googleUserEmail != null && svc.googleUserEmail!.isNotEmpty);

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
                          errorBuilder: (_, _, _) => const Icon(
                              Icons.local_hospital,
                              color: kBrand700),
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

                  if (!isSignedIn) ...[
                    // Botão Oficial Google Auth Firebase
                    SizedBox(
                      height: 48,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: kBrand950,
                          side: const BorderSide(
                              color: Color(0xFFC5C6D4), width: 1.5),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        onPressed:
                            _isLoading ? null : _handleGoogleFirebaseLogin,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 22,
                              height: 22,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: kScRed50,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'G',
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 14,
                                  color: kScRed600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            const Text(
                              'Entrar com Google',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Row(
                        children: [
                          Expanded(child: Divider()),
                          Padding(
                            padding: EdgeInsets.symmetric(horizontal: 10),
                            child: Text(
                              'ou use e-mail e senha',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.black54,
                              ),
                            ),
                          ),
                          Expanded(child: Divider()),
                        ],
                      ),
                    ),

                    // Alternador Entrar vs Cadastrar-se
                    Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _isSignUpMode = false;
                                _errorText = null;
                              }),
                              child: Container(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 8),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: !_isSignUpMode
                                      ? Colors.white
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(9),
                                ),
                                child: Text(
                                  'Já tenho conta',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                    color: !_isSignUpMode
                                        ? kBrand950
                                        : Colors.black54,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _isSignUpMode = true;
                                _errorText = null;
                              }),
                              child: Container(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 8),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: _isSignUpMode
                                      ? Colors.white
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(9),
                                ),
                                child: Text(
                                  'Criar cadastro',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 12,
                                    color: _isSignUpMode
                                        ? kBrand950
                                        : Colors.black54,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    TextField(
                      controller: _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      decoration: InputDecoration(
                        labelText: 'E-mail',
                        hintText: 'seunome@exemplo.com',
                        prefixIcon: const Icon(Icons.mail_outline),
                        filled: true,
                        fillColor: kContainerLow,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _passwordCtrl,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'Senha (mín. 6 caracteres)',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          onPressed: () => setState(
                              () => _obscurePassword = !_obscurePassword),
                          icon: Icon(_obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined),
                        ),
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
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: kBrand700,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        onPressed:
                            _isLoading ? null : _handleEmailPasswordAuth,
                        child: _isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white),
                              )
                            : Text(
                                _isSignUpMode
                                    ? 'Cadastrar com E-mail e Senha'
                                    : 'Entrar com E-mail e Senha',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w900, fontSize: 14),
                              ),
                      ),
                    ),
                  ] else ...[
                    // Passo 2: Usuário autenticado no Firebase -> Digitar CRM (até 10 dígitos)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: kBrand50,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: kBrand100),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.verified_user, color: kBrand700),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  svc.googleUserEmail ?? 'Conta Autenticada',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                    color: kBrand950,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const Text(
                                  'Agora digite seu CRM para identificarmos seu perfil médico.',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.black54,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: _isLoading
                                ? null
                                : () async {
                                    await svc.signOutFirebase();
                                    setState(() => _errorText = null);
                                  },
                            child: const Text(
                              'Trocar',
                              style: TextStyle(
                                  fontSize: 11, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _crmCtrl,
                      keyboardType: TextInputType.number,
                      maxLength: 10,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                      onSubmitted: (_) {
                        if (!_isLoading) {
                          _handleVerifyCrmAndPromptNotifications();
                        }
                      },
                      decoration: InputDecoration(
                        labelText: 'Número do CRM',
                        hintText: 'Digite até 10 números (ex: 34669)',
                        prefixIcon: const Icon(Icons.badge_outlined),
                        filled: true,
                        fillColor: kContainerLow,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 48,
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: kScRed600,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        onPressed: _isLoading
                            ? null
                            : _handleVerifyCrmAndPromptNotifications,
                        icon: _isLoading
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.check_circle),
                        label: const Text(
                          'Verificar CRM e Entrar',
                          style: TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 14),
                        ),
                      ),
                    ),
                  ],

                  if (_errorText != null) ...[
                    const SizedBox(height: 12),
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
              : (_currentTab == 2 && svc.isEditorMode
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
      // Barra inferior compacta: contorno da aba selecionada afastado do topo e ícone próximo ao texto
      bottomNavigationBar: (!isMobile || _isTableFullscreen)
          ? null
          : Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Color(0xFFD5D7E5))),
              ),
              child: SafeArea(
                top: false,
                child: SizedBox(
                  height: 54,
                  child: Row(
                    children: [
                      for (final item in const [
                        (
                          idx: 0,
                          label: 'Escala',
                          icon: Icons.calendar_month_outlined,
                          activeIcon: Icons.calendar_month,
                        ),
                        (
                          idx: 1,
                          label: 'Pacientes',
                          icon: Icons.bed_outlined,
                          activeIcon: Icons.bed,
                        ),
                        (
                          idx: 2,
                          label: 'Médicos',
                          icon: Icons.people_outline,
                          activeIcon: Icons.people,
                        ),
                        (
                          idx: 3,
                          label: 'Fechamento',
                          icon: Icons.bar_chart_outlined,
                          activeIcon: Icons.bar_chart,
                        ),
                      ])
                        Expanded(
                          child: InkWell(
                            onTap: () =>
                                setState(() => _currentTab = item.idx),
                            child: Padding(
                              padding: const EdgeInsets.only(top: 6, bottom: 4),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                mainAxisSize: MainAxisSize.max,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 14, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: _currentTab == item.idx
                                          ? kBrand100
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Icon(
                                      _currentTab == item.idx
                                          ? item.activeIcon
                                          : item.icon,
                                      size: 19,
                                      color: _currentTab == item.idx
                                          ? kBrand950
                                          : Colors.black87,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    item.label,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 11,
                                      height: 1.05,
                                      fontWeight: _currentTab == item.idx
                                          ? FontWeight.w900
                                          : FontWeight.w700,
                                      color: _currentTab == item.idx
                                          ? kBrand950
                                          : Colors.black87,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
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
  /// ABA 1: ESCALA SEMANAL + COLUNA "TURNO" FIXA + MONTH/YEAR PICKER
  /// ==========================================================================
  Widget _buildEscalaTab(BuildContext context, bool isMobile) {
    final weeks = svc.getWeeksOfMonth(svc.currentYearInt, svc.currentMonthInt);
    final wkIdx = svc.currentWeekIndex.clamp(0, weeks.length - 1);
    final weekDays = weeks[wkIdx];

    final firstDay = weekDays.first;
    final lastDay = weekDays.last;
    final rangeLabel =
        '${firstDay.day.toString().padLeft(2, '0')}/${firstDay.month.toString().padLeft(2, '0')} a '
        '${lastDay.day.toString().padLeft(2, '0')}/${lastDay.month.toString().padLeft(2, '0')}';

    final onCallNow = svc.getDoctorsOnCallNow();

    const slotSpecs = <Map<String, String>>[
      {'label': 'ROTINEIRO', 'hours': '07-13h', 'type': 'routine', 'role': 'rotin'},
      {'label': 'MANHÃ 1', 'hours': '07-13h', 'type': 'morning', 'role': 'm1'},
      {'label': 'MANHÃ 2', 'hours': '07-13h', 'type': 'morning', 'role': 'm2'},
      {'label': 'TARDE 1', 'hours': '13-19h', 'type': 'afternoon', 'role': 'a1'},
      {'label': 'TARDE 2', 'hours': '13-19h', 'type': 'afternoon', 'role': 'a2'},
      {'label': 'REFORÇO', 'hours': '19-23h', 'type': 'evening', 'role': 'extra'},
      {'label': 'NOITE 1', 'hours': '19-07h', 'type': 'night', 'role': 'n1'},
      {'label': 'NOITE 2', 'hours': '19-07h', 'type': 'night', 'role': 'n2'},
    ];

    const weekdayAbbr = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    final fixedTurnoTable = Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          right: BorderSide(color: Color(0xFFD5D7E5), width: 1.5),
        ),
      ),
      child: DataTable(
        headingRowColor: WidgetStateProperty.all(kContainer),
        headingRowHeight: 42,
        dataRowMinHeight: 46,
        dataRowMaxHeight: 46,
        horizontalMargin: 8,
        columnSpacing: 0,
        columns: const [
          DataColumn(
            label: SizedBox(
              width: 72,
              child: Center(
                child: Text(
                  'TURNO',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 11,
                    color: kBrand950,
                  ),
                ),
              ),
            ),
          ),
        ],
        rows: slotSpecs.map((spec) {
          return DataRow(
            cells: [
              DataCell(
                SizedBox(
                  width: 72,
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text(
                          spec['label']!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 11,
                            color: kBrand950,
                            height: 1.1,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          spec['hours']!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 9.5,
                            color: Colors.black,
                            height: 1.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );

    final scrollableDaysTable = DataTable(
      headingRowColor: WidgetStateProperty.all(kContainer),
      headingRowHeight: 42,
      dataRowMinHeight: 46,
      dataRowMaxHeight: 46,
      horizontalMargin: 10,
      columnSpacing: 12,
      columns: weekDays.map((day) {
        final isToday = day.year == 2026 && day.month == 11 && day.day == 20;
        final wName = weekdayAbbr[(day.weekday - 1).clamp(0, 6)];
        final dText =
            '${day.day.toString().padLeft(2, '0')}/${day.month.toString().padLeft(2, '0')}';
        return DataColumn(
          label: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                wName,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 9.5,
                  color: isToday ? kScRed600 : Colors.black54,
                  height: 1.1,
                ),
              ),
              Text(
                dText,
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 11,
                  color: isToday ? kScRed700 : kBrand950,
                  height: 1.1,
                ),
              ),
            ],
          ),
        );
      }).toList(),
      rows: slotSpecs.map((spec) {
        return _buildScheduleDaysRow(
          spec['type']!,
          spec['role']!,
          weekDays,
        );
      }).toList(),
    );

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
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                fixedTurnoTable,
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: scrollableDaysTable,
                  ),
                ),
              ],
            ),
          ),
        ),
        // Botão de Tela Cheia Flutuante Fixo no Canto Superior Direito da Planilha (não se move com as células!)
        Positioned(
          top: 5,
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
        // Caixa compacta com Month & Year Picker + Hoje + Navegação de semanas
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFD5D7E5)),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) => FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.center,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: constraints.maxWidth),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Month & Year Picker Clicável
                        InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => _openMonthYearPickerDialog(context),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: kContainerLow,
                              borderRadius: BorderRadius.circular(10),
                              border:
                                  Border.all(color: const Color(0xFFD5D7E5)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  svc.formatMonthYearPt(svc.currentMonth),
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                    color: kBrand950,
                                  ),
                                ),
                                const SizedBox(width: 2),
                                const Icon(Icons.arrow_drop_down,
                                    size: 18, color: kBrand700),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        InkWell(
                          borderRadius: BorderRadius.circular(999),
                          onTap: () => svc.jumpToToday(),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
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
                      ],
                    ),
                    const SizedBox(width: 6),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints:
                              const BoxConstraints(minWidth: 26, minHeight: 26),
                          onPressed: wkIdx > 0
                              ? () =>
                                  setState(() => svc.currentWeekIndex = wkIdx - 1)
                              : null,
                          icon: const Icon(Icons.chevron_left, size: 19),
                        ),
                        Text(
                          rangeLabel,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 11,
                            color: kBrand950,
                          ),
                        ),
                        IconButton(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          constraints:
                              const BoxConstraints(minWidth: 26, minHeight: 26),
                          onPressed: wkIdx < weeks.length - 1
                              ? () =>
                                  setState(() => svc.currentWeekIndex = wkIdx + 1)
                              : null,
                          icon: const Icon(Icons.chevron_right, size: 19),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
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
        Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFD5D7E5)),
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

  DataRow _buildScheduleDaysRow(
    String shiftType,
    String slotRole,
    List<DateTime> weekDays,
  ) {
    return DataRow(
      cells: weekDays.map((day) {
        final dateStr =
            '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
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
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
      }).toList(),
    );
  }

  /// Picker de Mês e Ano em Português para consulta de qualquer mês/ano
  void _openMonthYearPickerDialog(BuildContext context) {
    int selectedYear = svc.currentYearInt;
    int selectedMonth = svc.currentMonthInt;
    const monthAbbr = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];

    showDialog(
      context: context,
      builder: (dCtx) {
        return StatefulBuilder(
          builder: (dCtx, setDialogState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22)),
              title: const Text(
                'Selecionar Mês e Ano',
                style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                    color: kBrand950),
              ),
              content: SizedBox(
                width: 300,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Seletor de Ano (< 2026 >)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: kContainerLow,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFD5D7E5)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            onPressed: () =>
                                setDialogState(() => selectedYear--),
                            icon: const Icon(Icons.chevron_left,
                                color: kBrand700),
                          ),
                          Text(
                            '$selectedYear',
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 17,
                              color: kBrand950,
                            ),
                          ),
                          IconButton(
                            onPressed: () =>
                                setDialogState(() => selectedYear++),
                            icon: const Icon(Icons.chevron_right,
                                color: kBrand700),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Grade dos 12 Meses
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: 12,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        childAspectRatio: 2.1,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      itemBuilder: (_, idx) {
                        final mNum = idx + 1;
                        final isSel = mNum == selectedMonth;
                        return InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () =>
                              setDialogState(() => selectedMonth = mNum),
                          child: Container(
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: isSel ? kBrand700 : kContainerLow,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: isSel
                                    ? kBrand700
                                    : const Color(0xFFD5D7E5),
                              ),
                            ),
                            child: Text(
                              monthAbbr[idx],
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 13,
                                color: isSel ? Colors.white : kBrand950,
                              ),
                            ),
                          ),
                        );
                      },
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
                  style: FilledButton.styleFrom(backgroundColor: kBrand700),
                  onPressed: () {
                    svc.setMonthYear(selectedYear, selectedMonth);
                    Navigator.pop(dCtx);
                  },
                  child: const Text('Aplicar'),
                ),
              ],
            );
          },
        );
      },
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
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      onChanged: (v) => setState(() => _doctorSearchQuery = v),
                      decoration: InputDecoration(
                        hintText: 'Buscar médico (${svc.doctors.length})...',
                        prefixIcon: const Icon(Icons.search, size: 18),
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
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
              if (svc.googleUserEmail != null &&
                  svc.googleUserEmail!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.verified_user,
                        size: 14, color: kBrand700),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Logado: ${svc.googleUserEmail}',
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: kBrand950),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    TextButton(
                      style: TextButton.styleFrom(
                        visualDensity: VisualDensity.compact,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                      onPressed: () => svc.signOutFirebase(),
                      child: const Text(
                        'Sair / Trocar conta',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: kScRed600),
                      ),
                    ),
                  ],
                ),
              ],
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
              final hasChosenProfile =
                  svc.selectedNotificationDoctorId.isNotEmpty &&
                      svc.selectedNotificationDoctorId != 'ALL';
              final isOwnProfile = hasChosenProfile &&
                  svc.selectedNotificationDoctorId == doc.id;
              final isNotifying = svc.notificationsEnabled && isOwnProfile;
              final showNotifAction = !hasChosenProfile || isOwnProfile;
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
                        if (svc.isEditorMode)
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
                    if (showNotifAction) ...[
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
                          onPressed: () =>
                              _openDoctorProfileModal(context, doc),
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
                            maxLength: 10,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                            ],
                            decoration: const InputDecoration(
                              labelText: 'CRM (até 10 díg.)',
                              counterText: '',
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

  Widget _buildClosingSectionCard({
    required IconData icon,
    required Color iconColor,
    required Color iconBgColor,
    required String title,
    required String subtitle,
    required bool isCollapsed,
    required VoidCallback onToggle,
    required Widget expandedContent,
  }) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFD5D7E5)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onToggle,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 74),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: iconBgColor,
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Icon(icon, color: iconColor, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                              color: kBrand950,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: Colors.black54,
                              fontWeight: FontWeight.w600,
                              height: 1.15,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      isCollapsed ? Icons.expand_more : Icons.expand_less,
                      color: kBrand950,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (!isCollapsed) ...[
            const Divider(height: 1, color: Color(0xFFE7E9F4)),
            expandedContent,
          ],
        ],
      ),
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
      padding: const EdgeInsets.only(top: 2, bottom: 16),
      children: [
        // Título diferenciado próximo à barra superior com seletor de mês
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 2, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'FECHAMENTO MENSAL',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.9,
                        color: kBrand700,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      svc.formatMonthYearPt(svc.currentMonth),
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: kBrand950,
                        height: 1.1,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => _openMonthYearPickerDialog(context),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                  decoration: BoxDecoration(
                    color: kBrand50,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: kBrand100),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.calendar_month, size: 14, color: kBrand700),
                      SizedBox(width: 5),
                      Text(
                        'Período',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: kBrand700,
                        ),
                      ),
                      SizedBox(width: 2),
                      Icon(Icons.arrow_drop_down, size: 17, color: kBrand700),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // 1. Fechamento dos Profissionais (Horas)
        _buildClosingSectionCard(
          icon: Icons.medical_services,
          iconColor: kBrand700,
          iconBgColor: kBrand50,
          title: 'Fechamento dos Profissionais',
          subtitle: 'Plantões e carga horária no mês',
          isCollapsed: svc.statsProfessionalsCollapsed,
          onToggle: () => setState(() => svc.statsProfessionalsCollapsed =
              !svc.statsProfessionalsCollapsed),
          expandedContent: SingleChildScrollView(
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
                    .where((s) =>
                        s.doctorId == doc.id &&
                        s.date.startsWith(svc.currentMonth))
                    .toList();
                final d6 = docShifts
                    .where((s) =>
                        s.shiftType == 'morning' || s.shiftType == 'afternoon')
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
        ),

        const SizedBox(height: 10),

        // 2. Indicadores Mensais de Pacientes
        _buildClosingSectionCard(
          icon: Icons.analytics,
          iconColor: kScRed600,
          iconBgColor: kScRed50,
          title: 'Indicadores Mensais de Pacientes',
          subtitle:
              '${occupiedBeds.length} internadas • $occupancyPct% de ocupação',
          isCollapsed: svc.statsPatientsCollapsed,
          onToggle: () => setState(
              () => svc.statsPatientsCollapsed = !svc.statsPatientsCollapsed),
          expandedContent: Padding(
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
        ),

        const SizedBox(height: 10),

        // 3. PRONTUÁRIOS (Cadastrados por Nome, com Data de Inserção e de Alta, Protegido por Senha)
        _buildClosingSectionCard(
          icon: svc.isProntuariosUnlocked ? Icons.folder_shared : Icons.lock,
          iconColor: kBrand700,
          iconBgColor: kBrand50,
          title: 'Prontuários (${svc.allMedicalRecordsSorted.length} pacientes)',
          subtitle: svc.isProntuariosUnlocked
              ? 'Histórico nominal com inserção e alta'
              : 'Protegido por senha • Toque para abrir',
          isCollapsed: svc.statsProntuariosCollapsed,
          onToggle: () => setState(() =>
              svc.statsProntuariosCollapsed = !svc.statsProntuariosCollapsed),
          expandedContent: Padding(
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

            DateTime parseIsoDateOrNow(String iso) {
              final parts = iso.trim().split('-');
              if (parts.length == 3) {
                final y = int.tryParse(parts[0]);
                final m = int.tryParse(parts[1]);
                final d = int.tryParse(parts[2]);
                if (y != null && m != null && d != null) {
                  return DateTime(y, m, d);
                }
              }
              return DateTime.now();
            }

            TimeOfDay parseTimeOrDefault(String hhmm,
                {int fallbackHour = 12}) {
              final parts = hhmm.trim().split(':');
              if (parts.length == 2) {
                final h = int.tryParse(parts[0]);
                final m = int.tryParse(parts[1]);
                if (h != null && m != null && h >= 0 && h < 24 && m >= 0 && m < 60) {
                  return TimeOfDay(hour: h, minute: m);
                }
              }
              return TimeOfDay(hour: fallbackHour, minute: 0);
            }

            String formatIsoDateBr(String iso) {
              final parts = iso.trim().split('-');
              if (parts.length == 3) {
                return '${parts[2].padLeft(2, '0')}/${parts[1].padLeft(2, '0')}/${parts[0]}';
              }
              return 'Selecionar data';
            }

            Widget buildPreviewBox(String rawValue,
                {String emptyText = 'Nenhum dado preenchido'}) {
              final text = rawValue.trim();
              return Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFD5D7E5)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'PRÉ-VISUALIZAÇÃO NA PLANILHA',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.4,
                        color: Colors.black45,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      text.isNotEmpty ? text : emptyText,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: text.isNotEmpty ? kBrand950 : Colors.black38,
                      ),
                    ),
                  ],
                ),
              );
            }

            Widget buildNativePickerTile({
              required IconData icon,
              required String label,
              required String valueText,
              required VoidCallback onTap,
            }) {
              return InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: onTap,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFC5C6D4)),
                  ),
                  child: Row(
                    children: [
                      Icon(icon, size: 18, color: kBrand700),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              label,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: Colors.black54,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 1),
                            Text(
                              valueText,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                color: kBrand950,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.expand_more,
                          size: 18, color: Colors.black45),
                    ],
                  ),
                ),
              );
            }

            Widget buildParityTile(String letter) {
              final v = parsedParity.values[letter] ?? 0;
              final isOpen = activeParityLetter == letter;
              return Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => setModalState(() {
                    activeParityLetter = isOpen ? null : letter;
                  }),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
                    decoration: BoxDecoration(
                      color: isOpen
                          ? kBrand100
                          : (v > 0 ? kBrand50 : Colors.white),
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
                          '$letter ▾',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 13,
                            color: kBrand950,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          v == 0 ? '0' : '$letter$v',
                          style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 15,
                            color: v > 0 ? kBrand700 : Colors.black38,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
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
                          // Grade 2x3 igual ao WebApp para toque fácil no celular
                          Row(
                            children: [
                              buildParityTile('G'),
                              const SizedBox(width: 8),
                              buildParityTile('P'),
                              const SizedBox(width: 8),
                              buildParityTile('C'),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              buildParityTile('A'),
                              const SizedBox(width: 8),
                              buildParityTile('E'),
                              const SizedBox(width: 8),
                              buildParityTile('M'),
                            ],
                          ),
                          if (activeParityLetter != null) ...[
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                    color: kBrand700.withValues(alpha: 0.4)),
                              ),
                              child: Column(
                                children: [
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        'Selecionar $activeParityLetter (role 0–20)',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w900,
                                          fontSize: 12,
                                          color: kBrand950,
                                        ),
                                      ),
                                      TextButton(
                                        style: TextButton.styleFrom(
                                          visualDensity: VisualDensity.compact,
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 10, vertical: 2),
                                        ),
                                        onPressed: () => setModalState(
                                            () => activeParityLetter = null),
                                        child: const Text(
                                          'Concluir',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w900,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  SizedBox(
                                    height: 132,
                                    child: CupertinoPicker(
                                      key: ValueKey<String>(activeParityLetter!),
                                      scrollController:
                                          FixedExtentScrollController(
                                        initialItem: parsedParity
                                                .values[activeParityLetter!] ??
                                            0,
                                      ),
                                      itemExtent: 38,
                                      magnification: 1.12,
                                      useMagnifier: true,
                                      selectionOverlay:
                                          CupertinoPickerDefaultSelectionOverlay(
                                        background:
                                            kBrand50.withValues(alpha: 0.6),
                                      ),
                                      onSelectedItemChanged: (numVal) {
                                        final letter = activeParityLetter!;
                                        setModalState(() {
                                          parsedParity.values[letter] = numVal;
                                          parCtrl.text =
                                              parsedParity.toSheetString();
                                        });
                                      },
                                      children: [
                                        for (int numVal = 0;
                                            numVal <= 20;
                                            numVal++)
                                          Center(
                                            child: Text(
                                              numVal == 0
                                                  ? '0 (oculta ${activeParityLetter!})'
                                                  : '${activeParityLetter!}$numVal',
                                              style: TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w900,
                                                color: numVal == 0
                                                    ? Colors.black45
                                                    : kBrand950,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 8),
                          buildPreviewBox(
                            parCtrl.text,
                            emptyText: 'Nenhuma paridade selecionada',
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
                            Row(
                              children: [
                                Expanded(
                                  child: buildNativePickerTile(
                                    icon: Icons.calendar_today,
                                    label: 'Data do Nascimento',
                                    valueText: formatIsoDateBr(
                                        parsedAdmission.birthDate),
                                    onTap: () async {
                                      final picked = await showDatePicker(
                                        context: ctx,
                                        initialDate: parseIsoDateOrNow(
                                            parsedAdmission.birthDate),
                                        firstDate: DateTime(2020),
                                        lastDate: DateTime(2035),
                                      );
                                      if (picked != null) {
                                        final iso =
                                            '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                                        setModalState(() {
                                          parsedAdmission =
                                              ParsedAdmissionReason(
                                            selectedOption:
                                                parsedAdmission.selectedOption,
                                            birthDate: iso,
                                            birthTime:
                                                parsedAdmission.birthTime,
                                            extraText:
                                                parsedAdmission.extraText,
                                          );
                                          intCtrl.text =
                                              parsedAdmission.toSheetString();
                                        });
                                      }
                                    },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: buildNativePickerTile(
                                    icon: Icons.access_time,
                                    label: 'Hora do Nascimento',
                                    valueText:
                                        parsedAdmission.birthTime.isNotEmpty
                                            ? parsedAdmission.birthTime
                                            : 'Selecionar hora',
                                    onTap: () async {
                                      final picked = await showTimePicker(
                                        context: ctx,
                                        initialTime: parseTimeOrDefault(
                                            parsedAdmission.birthTime),
                                        builder: (timeCtx, child) => MediaQuery(
                                          data: MediaQuery.of(timeCtx).copyWith(
                                              alwaysUse24HourFormat: true),
                                          child: child!,
                                        ),
                                      );
                                      if (picked != null) {
                                        final hhmm =
                                            '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                                        setModalState(() {
                                          parsedAdmission =
                                              ParsedAdmissionReason(
                                            selectedOption:
                                                parsedAdmission.selectedOption,
                                            birthDate:
                                                parsedAdmission.birthDate,
                                            birthTime: hhmm,
                                            extraText:
                                                parsedAdmission.extraText,
                                          );
                                          intCtrl.text =
                                              parsedAdmission.toSheetString();
                                        });
                                      }
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 8),
                          buildPreviewBox(
                            intCtrl.text,
                            emptyText: 'Nenhum motivo de internação selecionado',
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
                            Row(
                              children: [
                                Expanded(
                                  child: buildNativePickerTile(
                                    icon: Icons.event,
                                    label: 'Data do lembrete',
                                    valueText:
                                        formatIsoDateBr(remDateCtrl.text),
                                    onTap: () async {
                                      final picked = await showDatePicker(
                                        context: ctx,
                                        initialDate: parseIsoDateOrNow(
                                            remDateCtrl.text),
                                        firstDate: DateTime(2024),
                                        lastDate: DateTime(2035),
                                      );
                                      if (picked != null) {
                                        setModalState(() {
                                          remDateCtrl.text =
                                              '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                                        });
                                      }
                                    },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: buildNativePickerTile(
                                    icon: Icons.alarm,
                                    label: 'Horário do aviso',
                                    valueText: remTimeCtrl.text.isNotEmpty
                                        ? remTimeCtrl.text
                                        : 'Selecionar hora',
                                    onTap: () async {
                                      final picked = await showTimePicker(
                                        context: ctx,
                                        initialTime: parseTimeOrDefault(
                                            remTimeCtrl.text,
                                            fallbackHour: 14),
                                        builder: (timeCtx, child) => MediaQuery(
                                          data: MediaQuery.of(timeCtx).copyWith(
                                              alwaysUse24HourFormat: true),
                                          child: child!,
                                        ),
                                      );
                                      if (picked != null) {
                                        setModalState(() {
                                          remTimeCtrl.text =
                                              '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                                        });
                                      }
                                    },
                                  ),
                                ),
                              ],
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
            final hasChosenProfile =
                svc.selectedNotificationDoctorId.isNotEmpty &&
                    svc.selectedNotificationDoctorId != 'ALL';
            final isOwnProfile = hasChosenProfile &&
                svc.selectedNotificationDoctorId == doc.id;
            final isNotifying = svc.notificationsEnabled && isOwnProfile;
            final canOfferNotif = !hasChosenProfile || isOwnProfile;
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
                        if (svc.isEditorMode)
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
                    if (canOfferNotif) ...[
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
                                  googleEmail: svc.googleUserEmail ??
                                      'medico@santacasapg.br',
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
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
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
