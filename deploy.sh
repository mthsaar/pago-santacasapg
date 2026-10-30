#!/bin/bash
# ==============================================================
# Script de Publicação Automática no Firebase Hosting & Firestore
# Projeto: pago---santa-casa-pg
# ==============================================================

set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"

echo "=========================================================="
echo "  🚀 PUBLICANDO ESCALA MATERNIDADE NO FIREBASE"
echo "  Projeto: pago---santa-casa-pg"
echo "=========================================================="
echo ""

# 1. Autenticação no Firebase (abre o navegador se necessário)
echo "🔐 1/2 Verificando login no Firebase..."
firebase login --reauth 2>/dev/null || firebase login

# 2. Deploy no Hosting e Firestore Rules
echo ""
echo "🚀 2/2 Enviando arquivos para a nuvem global do Firebase..."
firebase deploy --only hosting,firestore:rules

echo ""
echo "=========================================================="
echo "  ✅ PUBLICADO COM SUCESSO!"
echo "=========================================================="
echo "Acesse agora em qualquer celular ou computador:"
echo "👉 https://pago---santa-casa-pg.web.app"
echo "👉 https://pago---santa-casa-pg.firebaseapp.com"
echo "=========================================================="
