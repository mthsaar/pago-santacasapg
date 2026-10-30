# 🏥 Escala Maternidade - Sistema de Plantões Médicos

Aplicativo web moderno, adaptativo (mobile-first e desktop) e responsivo, desenvolvido para substituir planilhas manuais (Google Docs/Excel) no controle da escala de plantão de médicos em maternidades e centros obstétricos.

---

## ☁️ Publicação na Internet com Firebase (Hosting + Firestore)

O webapp foi preparado com integração completa ao **Firebase**:
* **Firebase Hosting:** Hospedagem global com HTTPS gratuito e domínio próprio ou `.web.app` (ex: `https://escala-maternidade.web.app`), acessível de qualquer celular ou computador 24h por dia.
* **Cloud Firestore (Banco em Tempo Real):** Todas as alterações de escala e cadastro feitas pelo editor são sincronizadas instantaneamente na nuvem para todos os médicos em menos de 1 segundo (plano gratuito Spark, sem necessidade de cartão de crédito).

### Passo a Passo para Publicar:

#### 1. Criar o Projeto no Firebase (1 minuto, Gratuito)
1. Acesse [https://console.firebase.google.com](https://console.firebase.google.com) com sua conta Google.
2. Clique em **"Adicionar projeto"** e dê um nome (ex: `escala-maternidade`).
3. No menu lateral, vá em **Criação > Firestore Database** e clique em **Criar banco de dados** (escolha *Iniciar no modo de teste*).
4. Na página inicial do projeto, clique no ícone da Web `</>` para registrar o aplicativo:
   - Dê um apelido (ex: `Escala Web`).
   - Copie o bloco `const firebaseConfig = { ... }`.

#### 2. Conectar o Aplicativo
Você pode conectar de duas formas super fáceis:
* **Pelo próprio aplicativo:** Abra o sistema, entre como Editor (PIN: `1234`), clique na engrenagem (⚙️) no canto superior direito, cole o seu `firebaseConfig` no campo e clique em **"Salvar e Conectar"**.
* **Ou pelo arquivo:** Cole as credenciais diretamente em `public/firebase-config.js`.

#### 3. Publicar com o Script Automático
No terminal, execute o script de deploy:
```bash
./deploy.sh
```
O script fará o login no Firebase e publicará o site na internet instantaneamente.

---

## 🚀 Como Executar Localmente

```bash
# Iniciar o servidor local
./start.sh
# ou
python3 server.py
```
- **No Computador:** [http://localhost:8000](http://localhost:8000)
- **No Celular (mesmo Wi-Fi):** Acesse pelo IP local indicado no terminal (ex: `http://192.168.x.x:8000`).
