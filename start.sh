#!/bin/bash
# Script de Inicialização da Escala de Maternidade
cd "$(dirname "$0")"
echo "Iniciando o servidor da Escala Maternidade..."
python3 server.py
