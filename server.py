#!/usr/bin/env python3
"""
EscalaMaternidade - Servidor Backend & Servidor de Arquivos Estáticos
Zero dependências externas (utiliza apenas a biblioteca padrão do Python 3).
"""

import http.server
import socketserver
import json
import sqlite3
import os
import sys
import mimetypes
import socket
import urllib.parse
from datetime import datetime

PORT = 8000
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "escala_maternidade.db")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Tabela de Médicos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS doctors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        short_name TEXT,
        crm TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        photo_url TEXT DEFAULT '',
        specialty TEXT DEFAULT 'Obstetrícia',
        color TEXT DEFAULT '#0284c7',
        email TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Tabela de Plantões / Escala
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        shift_type TEXT NOT NULL,
        slot_role TEXT NOT NULL DEFAULT 'day_1',
        doctor_id INTEGER NOT NULL,
        consecutive_group_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE,
        UNIQUE(date, shift_type, slot_role)
    )
    """)
    
    # Tabela de Configurações
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    
    default_settings = {
        "editor_pin": "1234",
        "hospital_name": "Maternidade - Centro Obstétrico",
        "unit_name": "Escala de Plantão e Rotina Médica",
        "default_month": "2026-11"
    }
    
    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))
        
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) as count FROM doctors")
    count = cursor.fetchone()["count"]
    if count == 0:
        seed_real_maternity_data(conn)
    else:
        conn.close()

def seed_real_maternity_data(conn):
    cursor = conn.cursor()
    
    # Nomes exatamente como estão na planilha, telefones vazios (Não cadastrado) e fotos vazias (silhueta)
    real_doctors = [
        "Henrique H",
        "Tainá",
        "Severino",
        "Jéssica",
        "Ianara",
        "Aline",
        "Rodolfo",
        "Kauana",
        "Vanessa",
        "Fernanda",
        "Bruno",
        "Yohanna",
        "Edson",
        "Francine",
        "Karoline",
        "Edy Felipe",
        "Henrique T",
        "Celso",
        "Virgínia",
        "William",
        "Ana Carol",
        "Nicolli",
        "Cristhyan",
        "Camila"
    ]
    
    doc_id_map = {}
    for name in real_doctors:
        cursor.execute("""
            INSERT INTO doctors (name, short_name, crm, phone, photo_url, specialty, color)
            VALUES (?, ?, '', '', '', 'Obstetrícia', '#0284c7')
        """, (name, name))
        doc_id_map[name] = cursor.lastrowid

    # Alias para Jessica sem acento
    if "Jéssica" in doc_id_map:
        doc_id_map["Jessica"] = doc_id_map["Jéssica"]

    # Escala de Novembro de 2026 com os nomes exatos
    schedule_data = {
        1: {
            "m1": "Cristhyan", "m2": "Camila",
            "a1": "Cristhyan", "a2": "Camila",
            "n1": "Cristhyan", "n2": "Camila"
        },
        2: {
            "rotin": "Henrique H",
            "m1": "Ianara", "m2": "Aline",
            "a1": "Ianara", "a2": "Aline",
            "n1": "Bruno"
        },
        3: {
            "rotin": "Henrique H",
            "m1": "Tainá", "m2": "Rodolfo",
            "a1": "Vanessa", "a2": "Rodolfo",
            "extra": "Ianara",
            "n1": "Henrique H"
        },
        4: {
            "rotin": "Tainá",
            "m1": "Severino", "m2": "Kauana",
            "a1": "Severino", "a2": "Kauana",
            "extra": "Jéssica"
        },
        5: {
            "rotin": "Henrique H",
            "m1": "Jéssica", "m2": "Kauana",
            "a1": "Jéssica", "a2": "Kauana",
            "n1": "Severino", "n2": "Fernanda"
        },
        6: {
            "rotin": "Henrique H",
            "m1": "Jessica", "m2": "Fernanda",
            "a1": "Jessica", "a2": "Fernanda",
            "n1": "Yohanna"
        },
        7: {
            "m1": "Jéssica", "m2": "Aline",
            "a1": "Jéssica", "a2": "Aline"
        },
        8: {
            "m1": "Fernanda", "m2": "Vanessa",
            "a1": "Fernanda", "a2": "Vanessa",
            "n1": "Fernanda", "n2": "Severino"
        },
        9: {
            "rotin": "Henrique H",
            "m1": "Edson", "m2": "Rodolfo",
            "a1": "Francine", "a2": "Karoline",
            "n1": "Henrique T"
        },
        10: {
            "rotin": "Henrique H",
            "m1": "Tainá", "m2": "Rodolfo",
            "a1": "Vanessa", "a2": "Rodolfo",
            "n1": "Edson", "n2": "Edy Felipe"
        },
        11: {
            "rotin": "Tainá",
            "m1": "Severino", "m2": "Kauana",
            "a1": "Severino", "a2": "Kauana",
            "extra": "Jéssica",
            "n1": "Yohanna"
        },
        12: {
            "rotin": "Henrique H",
            "m1": "Jéssica", "m2": "Kauana",
            "a1": "Jéssica", "a2": "Kauana",
            "n1": "Celso"
        },
        13: {
            "rotin": "Henrique H",
            "m1": "Jessica",
            "a1": "Jessica"
        },
        14: {
            "n1": "Severino", "n2": "Virgínia"
        },
        15: {
            "m1": "Severino", "m2": "Cristhyan",
            "a1": "Severino", "a2": "Cristhyan",
            "extra": "Vanessa",
            "n1": "Edson"
        },
        16: {
            "rotin": "Henrique H",
            "m1": "Edson", "m2": "Aline",
            "a1": "Francine", "a2": "Aline",
            "extra": "Ianara",
            "n1": "Henrique T", "n2": "Henrique H"
        },
        17: {
            "rotin": "Henrique H",
            "m1": "Tainá", "m2": "Rodolfo",
            "a1": "Vanessa", "a2": "Rodolfo",
            "n1": "Nicolli", "n2": "Henrique H"
        },
        18: {
            "rotin": "Tainá",
            "m1": "Severino", "m2": "Kauana",
            "a1": "Severino", "a2": "Kauana",
            "n1": "Nicolli", "n2": "Ianara"
        },
        19: {
            "rotin": "Henrique H",
            "m1": "Jéssica", "m2": "Kauana",
            "a1": "Jéssica", "a2": "Kauana",
            "n1": "Severino", "n2": "Fernanda"
        },
        20: {
            "rotin": "Henrique H",
            "m1": "Jessica", "m2": "Aline",
            "a1": "Jessica", "a2": "Aline",
            "n1": "Bruno", "n2": "Nicolli"
        },
        21: {
            "m1": "William", "m2": "Ana Carol",
            "a1": "William", "a2": "Ana Carol",
            "n1": "William", "n2": "Ana Carol"
        },
        22: {
            "m1": "William", "m2": "Ana Carol",
            "a1": "William", "a2": "Ana Carol"
        },
        23: {
            "rotin": "Henrique H",
            "m1": "Edson", "m2": "Rodolfo",
            "a1": "Francine", "a2": "Karoline",
            "n1": "Henrique T"
        },
        24: {
            "rotin": "Henrique H",
            "m1": "Tainá", "m2": "Rodolfo",
            "a1": "Vanessa", "a2": "Rodolfo",
            "n1": "Edson", "n2": "Edy Felipe"
        },
        25: {
            "rotin": "Tainá",
            "m1": "Severino", "m2": "Kauana",
            "a1": "Severino", "a2": "Kauana",
            "n1": "Nicolli"
        },
        26: {
            "rotin": "Henrique H",
            "m1": "Jéssica", "m2": "Kauana",
            "a1": "Jéssica", "a2": "Kauana",
            "n1": "Nicolli"
        },
        27: {
            "rotin": "Henrique H",
            "m1": "Jessica", "m2": "Aline",
            "a1": "Jessica", "a2": "Aline",
            "n1": "Nicolli"
        },
        28: {
            "m1": "Bruno", "m2": "Nicolli",
            "a1": "Bruno", "a2": "Nicolli",
            "n1": "Bruno"
        },
        29: {
            "m1": "Vanessa", "m2": "Nicolli",
            "a1": "Vanessa", "a2": "Nicolli",
            "n1": "Cristhyan", "n2": "Edson"
        },
        30: {
            "rotin": "Henrique H",
            "m1": "Edson", "m2": "Aline",
            "a1": "Francine", "a2": "Aline",
            "n1": "Henrique T"
        }
    }

    year = 2026
    month = 11

    for day, slots in schedule_data.items():
        date_str = f"{year:04d}-{month:02d}-{day:02d}"

        def insert_shift(shift_type, slot_role, doc_name, group_id=None):
            if not doc_name:
                return
            d_id = doc_id_map.get(doc_name)
            if d_id:
                cursor.execute("""
                    INSERT OR REPLACE INTO shifts (date, shift_type, slot_role, doctor_id, consecutive_group_id)
                    VALUES (?, ?, ?, ?, ?)
                """, (date_str, shift_type, slot_role, d_id, group_id))

        if "rotin" in slots:
            insert_shift("routine", "rotineiro", slots["rotin"])

        if "m1" in slots:
            insert_shift("morning", "day_1", slots["m1"])
        if "m2" in slots:
            insert_shift("morning", "day_2", slots["m2"])

        if "a1" in slots:
            insert_shift("afternoon", "day_1", slots["a1"])
        if "a2" in slots:
            insert_shift("afternoon", "day_2", slots["a2"])

        if "extra" in slots:
            insert_shift("evening", "shift_19_23", slots["extra"])

        if "n1" in slots:
            insert_shift("night", "night_1", slots["n1"])
        if "n2" in slots:
            insert_shift("night", "night_2", slots["n2"])

    conn.commit()
    conn.close()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def read_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            raw_data = self.rfile.read(content_length)
            return json.loads(raw_data.decode('utf-8'))
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/api/'):
            conn = get_db()
            cursor = conn.cursor()
            
            try:
                # 1. Lista de Médicos
                if path == '/api/doctors':
                    cursor.execute("""
                        SELECT d.*, 
                               COUNT(s.id) as total_shifts
                        FROM doctors d
                        LEFT JOIN shifts s ON d.id = s.doctor_id
                        GROUP BY d.id
                        ORDER BY d.name ASC
                    """)
                    doctors = [dict(row) for row in cursor.fetchall()]
                    self.send_json({"success": True, "doctors": doctors})
                    return

                # 2. Plantões por Mês ou Data
                elif path == '/api/shifts':
                    month = query.get('month', [None])[0]
                    date = query.get('date', [None])[0]
                    
                    sql = """
                        SELECT s.*, 
                               d.name as doctor_name, 
                               d.short_name as doctor_short_name,
                               d.crm as doctor_crm, 
                               d.phone as doctor_phone, 
                               d.photo_url as doctor_photo, 
                               d.specialty as doctor_specialty, 
                               d.color as doctor_color
                        FROM shifts s
                        JOIN doctors d ON s.doctor_id = d.id
                    """
                    params = []
                    if date:
                        sql += " WHERE s.date = ?"
                        params.append(date)
                    elif month:
                        sql += " WHERE s.date LIKE ?"
                        params.append(f"{month}-%")
                    
                    sql += " ORDER BY s.date ASC, s.shift_type ASC, s.slot_role ASC"
                    cursor.execute(sql, params)
                    shifts = [dict(row) for row in cursor.fetchall()]
                    self.send_json({"success": True, "shifts": shifts})
                    return

                # 3. Status de Plantão Atual (Tempo Real)
                elif path == '/api/shifts/now':
                    now = datetime.now()
                    today_str = now.strftime('%Y-%m-%d')
                    hour = now.hour
                    
                    cursor.execute("SELECT COUNT(*) as c FROM shifts WHERE date = ?", (today_str,))
                    has_today = cursor.fetchone()["c"] > 0
                    if not has_today:
                        today_str = "2026-11-03" # Data demonstrativa de referência

                    if 7 <= hour < 13:
                        active_shift_types = ["morning"]
                        shift_label = "Plantão Manhã (07:00 às 13:00)"
                        shift_start = "07:00"
                        shift_end = "13:00"
                    elif 13 <= hour < 19:
                        active_shift_types = ["afternoon"]
                        shift_label = "Plantão Tarde (13:00 às 19:00)"
                        shift_start = "13:00"
                        shift_end = "19:00"
                    elif 19 <= hour < 23:
                        active_shift_types = ["night", "evening"]
                        shift_label = "Plantão Noturno + Reforço (19:00 às 23:00)"
                        shift_start = "19:00"
                        shift_end = "23:00"
                    else:
                        active_shift_types = ["night"]
                        shift_label = "Plantão Noturno (19:00 às 07:00)"
                        shift_start = "19:00"
                        shift_end = "07:00"

                    routine_active = (7 <= hour < 13)

                    placeholders = ','.join(['?'] * len(active_shift_types))
                    cursor.execute(f"""
                        SELECT s.*, 
                               d.name as doctor_name, 
                               d.short_name as doctor_short_name,
                               d.crm as doctor_crm, 
                               d.phone as doctor_phone, 
                               d.photo_url as doctor_photo, 
                               d.specialty as doctor_specialty, 
                               d.color as doctor_color
                        FROM shifts s
                        JOIN doctors d ON s.doctor_id = d.id
                        WHERE s.date = ? AND s.shift_type IN ({placeholders})
                        ORDER BY s.slot_role ASC
                    """, [today_str] + active_shift_types)
                    active_shifts = [dict(row) for row in cursor.fetchall()]

                    # Atribui horários de início e fim calculados para cada plantão
                    for item in active_shifts:
                        st = item.get("shift_type")
                        if st == "morning":
                            item["start_time"] = "07:00"
                            item["end_time"] = "13:00"
                        elif st == "afternoon":
                            item["start_time"] = "13:00"
                            item["end_time"] = "19:00"
                        elif st == "evening":
                            item["start_time"] = "19:00"
                            item["end_time"] = "23:00"
                        elif st == "night":
                            item["start_time"] = "19:00"
                            item["end_time"] = "07:00"
                        else:
                            item["start_time"] = "07:00"
                            item["end_time"] = "13:00"

                    cursor.execute("""
                        SELECT s.*, 
                               d.name as doctor_name, 
                               d.short_name as doctor_short_name,
                               d.crm as doctor_crm, 
                               d.phone as doctor_phone, 
                               d.photo_url as doctor_photo, 
                               d.specialty as doctor_specialty, 
                               d.color as doctor_color
                        FROM shifts s
                        JOIN doctors d ON s.doctor_id = d.id
                        WHERE s.date = ? AND s.shift_type = 'routine'
                    """, (today_str,))
                    routine_row = cursor.fetchone()
                    routine_dict = dict(routine_row) if routine_row else None
                    if routine_dict:
                        routine_dict["start_time"] = "07:00"
                        routine_dict["end_time"] = "13:00"

                    self.send_json({
                        "success": True,
                        "server_time": now.strftime('%Y-%m-%d %H:%M:%S'),
                        "active_date": today_str,
                        "shift_label": shift_label,
                        "shift_start": shift_start,
                        "shift_end": shift_end,
                        "routine_active": routine_active,
                        "active_shifts": active_shifts,
                        "routine_doctor": routine_dict
                    })
                    return

                # 4. Configurações
                elif path == '/api/settings':
                    cursor.execute("SELECT key, value FROM settings")
                    settings = {row["key"]: row["value"] for row in cursor.fetchall()}
                    settings["has_pin"] = bool(settings.get("editor_pin"))
                    settings.pop("editor_pin", None)
                    self.send_json({"success": True, "settings": settings})
                    return

                # 5. Fechamento de Horas
                elif path == '/api/stats':
                    month = query.get('month', ['2026-11'])[0]
                    cursor.execute("""
                        SELECT d.id, d.name, d.short_name, d.crm, d.specialty, d.color, d.phone, d.photo_url,
                               COUNT(CASE WHEN s.shift_type IN ('morning', 'afternoon') THEN 1 END) as turnos_6h,
                               COUNT(CASE WHEN s.shift_type = 'night' THEN 1 END) as plantoes_12h,
                               COUNT(CASE WHEN s.shift_type = 'routine' THEN 1 END) as rotinas_6h,
                               COUNT(CASE WHEN s.shift_type = 'evening' THEN 1 END) as reforcos_4h,
                               COUNT(s.id) as total_turnos,
                               (COUNT(CASE WHEN s.shift_type IN ('morning', 'afternoon') THEN 1 END) * 6 +
                                COUNT(CASE WHEN s.shift_type = 'night' THEN 1 END) * 12 +
                                COUNT(CASE WHEN s.shift_type = 'routine' THEN 1 END) * 6 +
                                COUNT(CASE WHEN s.shift_type = 'evening' THEN 1 END) * 4) as total_horas
                        FROM doctors d
                        LEFT JOIN shifts s ON d.id = s.doctor_id AND s.date LIKE ?
                        GROUP BY d.id
                        ORDER BY total_horas DESC, d.name ASC
                    """, (f"{month}-%",))
                    stats = [dict(row) for row in cursor.fetchall()]
                    self.send_json({"success": True, "month": month, "stats": stats})
                    return

                else:
                    self.send_json({"error": "Endpoint não encontrado"}, 404)
                    return
            finally:
                conn.close()

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_body()
        conn = get_db()
        cursor = conn.cursor()

        try:
            # Autenticação de PIN do Editor
            if path == '/api/auth/verify-pin':
                pin = str(body.get('pin', '')).strip()
                cursor.execute("SELECT value FROM settings WHERE key = 'editor_pin'")
                row = cursor.fetchone()
                correct_pin = row["value"] if row else "1234"
                if pin == correct_pin:
                    self.send_json({"success": True, "authorized": True})
                else:
                    self.send_json({"success": False, "error": "PIN incorreto"}, 401)
                return

            # Alterar PIN
            elif path == '/api/settings/pin':
                current_pin = str(body.get('current_pin', '')).strip()
                new_pin = str(body.get('new_pin', '')).strip()
                cursor.execute("SELECT value FROM settings WHERE key = 'editor_pin'")
                row = cursor.fetchone()
                saved_pin = row["value"] if row else "1234"
                if current_pin != saved_pin:
                    self.send_json({"success": False, "error": "PIN atual incorreto"}, 401)
                    return
                cursor.execute("UPDATE settings SET value = ? WHERE key = 'editor_pin'", (new_pin,))
                conn.commit()
                self.send_json({"success": True, "message": "PIN alterado com sucesso"})
                return

            # Cadastrar Novo Profissional (ou atualizar)
            elif path == '/api/doctors':
                name = body.get('name', '').strip()
                crm = body.get('crm', '').strip()
                phone = body.get('phone', '').strip()
                photo_url = body.get('photo_url', '').strip()
                specialty = body.get('specialty', 'Obstetrícia').strip()
                color = body.get('color', '#0284c7').strip()
                notes = body.get('notes', '').strip()

                if not name:
                    self.send_json({"success": False, "error": "Nome é obrigatório"}, 400)
                    return

                cursor.execute("""
                    INSERT INTO doctors (name, short_name, crm, phone, photo_url, specialty, color, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (name, name, crm, phone, photo_url, specialty, color, notes))
                conn.commit()
                self.send_json({"success": True, "id": cursor.lastrowid, "message": "Profissional cadastrado!"})
                return

            # Salvar / Atualizar Plantão Único
            elif path == '/api/shifts':
                date = body.get('date')
                shift_type = body.get('shift_type')
                slot_role = body.get('slot_role')
                doctor_id = body.get('doctor_id')
                notes = body.get('notes', '')

                if not date or not shift_type or not slot_role:
                    self.send_json({"success": False, "error": "Dados incompletos"}, 400)
                    return

                if not doctor_id:
                    cursor.execute("DELETE FROM shifts WHERE date = ? AND shift_type = ? AND slot_role = ?", (date, shift_type, slot_role))
                else:
                    cursor.execute("""
                        INSERT OR REPLACE INTO shifts (date, shift_type, slot_role, doctor_id, notes)
                        VALUES (?, ?, ?, ?, ?)
                    """, (date, shift_type, slot_role, doctor_id, notes))
                
                conn.commit()
                self.send_json({"success": True, "message": "Escala salva!"})
                return

            # Atribuição em Lote / Turnos Consecutivos
            elif path == '/api/shifts/batch':
                shifts = body.get('shifts', [])
                for item in shifts:
                    s_date = item.get('date')
                    s_type = item.get('shift_type')
                    s_role = item.get('slot_role')
                    s_doc = item.get('doctor_id')
                    s_group = item.get('consecutive_group_id')
                    s_notes = item.get('notes', '')

                    if not s_doc:
                        cursor.execute("DELETE FROM shifts WHERE date = ? AND shift_type = ? AND slot_role = ?", (s_date, s_type, s_role))
                    else:
                        cursor.execute("""
                            INSERT OR REPLACE INTO shifts (date, shift_type, slot_role, doctor_id, consecutive_group_id, notes)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (s_date, s_type, s_role, s_doc, s_group, s_notes))

                conn.commit()
                self.send_json({"success": True, "count": len(shifts), "message": "Turnos salvos!"})
                return

            # Recarregar escala inicial da planilha
            elif path == '/api/seed':
                seed_real_maternity_data(conn)
                self.send_json({"success": True, "message": "Escala da planilha recarregada!"})
                return

            else:
                self.send_json({"error": "Endpoint não encontrado"}, 404)
        finally:
            conn.close()

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_body()
        conn = get_db()
        cursor = conn.cursor()

        try:
            if path.startswith('/api/doctors/'):
                doc_id = path.split('/')[-1]
                name = body.get('name')
                crm = body.get('crm', '')
                phone = body.get('phone', '')
                photo_url = body.get('photo_url', '')
                specialty = body.get('specialty', 'Obstetrícia')
                color = body.get('color', '#0284c7')
                notes = body.get('notes', '')

                cursor.execute("""
                    UPDATE doctors 
                    SET name = ?, short_name = ?, crm = ?, phone = ?, photo_url = ?, 
                        specialty = ?, color = ?, notes = ?
                    WHERE id = ?
                """, (name, name, crm, phone, photo_url, specialty, color, notes, doc_id))
                conn.commit()
                self.send_json({"success": True, "message": "Profissional atualizado com sucesso"})
                return
            else:
                self.send_json({"error": "Endpoint não encontrado"}, 404)
        finally:
            conn.close()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        conn = get_db()
        cursor = conn.cursor()

        try:
            if path.startswith('/api/doctors/'):
                doc_id = path.split('/')[-1]
                cursor.execute("DELETE FROM doctors WHERE id = ?", (doc_id,))
                conn.commit()
                self.send_json({"success": True, "message": "Profissional excluído"})
                return
            else:
                self.send_json({"error": "Endpoint não encontrado"}, 404)
        finally:
            conn.close()

def run_server():
    init_db()
    if not os.path.exists(STATIC_DIR):
        os.makedirs(STATIC_DIR)
        
    local_ip = get_local_ip()
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), AppRequestHandler) as httpd:
        print("=" * 65)
        print("  🏥 ESCALA MATERNIDADE - SISTEMA DE PLANTÕES MÉDICOS")
        print("=" * 65)
        print(f"  ➜ Computador (Desktop):  http://localhost:{PORT}")
        print(f"  ➜ Celular (Mesmo Wi-Fi): http://{local_ip}:{PORT}")
        print("-" * 65)
        print("  ✓ Modo Consulta: Ver foto e telefone dos plantonistas")
        print("  ✓ Modo Editor: PIN padrão '1234' (personalizável)")
        print("=" * 65)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")

if __name__ == '__main__':
    run_server()
