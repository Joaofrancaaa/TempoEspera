import pandas as pd
import json

# 1. Carregar os dados
df = pd.read_csv('eleitorado_local_votacao_2026_MA.csv', sep=';', encoding='latin1')

# Filtrar para Imperatriz
if 'NM_MUNICIPIO' in df.columns:
    df = df[df['NM_MUNICIPIO'].str.upper() == 'IMPERATRIZ']

# 2. Conversão de Latitude/Longitude
def parse_coord(val):
    if pd.isna(val): return None
    v = str(val).strip().replace(',', '.')
    if v in ('', '-1', '-1.0'): return None
    try: return float(v)
    except: return None

df['lat'] = df['NR_LATITUDE'].apply(parse_coord)
df['lng'] = df['NR_LONGITUDE'].apply(parse_coord)

# 3. Regra de Bounding Box para Imperatriz
def is_valid_coord(lat, lng):
    if lat is None or lng is None: return False
    return -5.75 <= lat <= -5.35 and -47.65 <= lng <= -47.25

df['coord_valida'] = df.apply(lambda row: is_valid_coord(row['lat'], row['lng']), axis=1)

# 4. Formatação em Title Case
def to_title_case(text):
    if pd.isna(text): return ""
    exceptions = ['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'com']
    words = str(text).lower().split()
    result = [w.capitalize() if w not in exceptions else w for w in words]
    if result: result[0] = result[0].capitalize()
    return " ".join(result)

for col in ['NM_LOCAL_VOTACAO', 'NM_BAIRRO', 'DS_ENDERECO']:
    if col in df.columns:
        df[col] = df[col].apply(to_title_case)

df['id_base'] = 'z' + df['NR_ZONA'].astype(str) + '-l' + df['NR_LOCAL_VOTACAO'].astype(str)

agrupamento = {}
sem_coordenada = {}

for _, row in df.iterrows():
    nome = row['NM_LOCAL_VOTACAO']
    bairro = row.get('NM_BAIRRO', '')
    endereco = row.get('DS_ENDERECO', '')
    zona = str(row['NR_ZONA'])
    id_base = row['id_base']
    
    col_eleitor = 'QT_ELEITOR_SECAO' if 'QT_ELEITOR_SECAO' in df.columns else 'QT_ELEITOR'
    eleitores = int(row[col_eleitor]) if pd.notna(row.get(col_eleitor, 0)) else 0

    # ----- Formatação das Seções (Novo) -----
    secao_int = row.get('NR_SECAO', '')
    secao_str = str(secao_int).zfill(4) if pd.notna(secao_int) and str(secao_int).strip() != '' else ''
    
    principal_raw = row.get('NR_SECAO_PRINCIPAL', '')
    principal_str = str(principal_raw).strip()
    
    # Substituir vazio, 0 ou -1 pelo próprio número da seção
    if principal_str in ('', '0', '-1', '-1.0', 'nan', 'None'):
        principal = secao_str
    else:
        try:
            p_int = int(float(principal_str))
            principal = str(p_int).zfill(4)
        except:
            principal = secao_str

    chave = nome

    if row['coord_valida']:
        if chave not in agrupamento:
            agrupamento[chave] = {
                "id": id_base,
                "name": nome,
                "bairro": bairro,
                "endereco": endereco,
                "lat_list": [row['lat']],
                "lng_list": [row['lng']],
                "zonas": set(),
                "secoes": [], # Lista de objetos
                "secoes_distintas": set(), # Set de controle para a contagem
                "eleitores": 0
            }
        agrupamento[chave]["zonas"].add(zona)
        agrupamento[chave]["secoes_distintas"].add(f"{zona}-{secao_str}")
        agrupamento[chave]["eleitores"] += eleitores
        agrupamento[chave]["lat_list"].append(row['lat'])
        agrupamento[chave]["lng_list"].append(row['lng'])
        
        # Inclusão da seção na lista
        agrupamento[chave]["secoes"].append({
            "zona": zona,
            "secao": secao_str,
            "eleitores": eleitores,
            "principal": principal
        })
    else:
        if chave not in sem_coordenada:
            sem_coordenada[chave] = {
                "nome": nome,
                "endereco": f"{endereco}, {bairro}"
            }

locais_validos = []
for data in agrupamento.values():
    avg_lat = sum(data["lat_list"]) / len(data["lat_list"])
    avg_lng = sum(data["lng_list"]) / len(data["lng_list"])
    
    # Ordenar o array de seções por zona e depois por secao
    secoes_ordenadas = sorted(data["secoes"], key=lambda x: (x["zona"], x["secao"]))
    
    locais_validos.append({
        "id": data["id"],
        "name": data["name"],
        "bairro": data["bairro"],
        "endereco": data["endereco"],
        "lat": round(avg_lat, 7),
        "lng": round(avg_lng, 7),
        "zonas": sorted(list(data["zonas"])),
        "totalSecoes": len(data["secoes_distintas"]),
        "eleitores": data["eleitores"],
        "secoes": secoes_ordenadas
    })

# Ordenar locais por quantidade de eleitores decrescente
locais_validos.sort(key=lambda x: x["eleitores"], reverse=True)
lista_sem_coordenada = list(sem_coordenada.values())

# Exportando os arquivos
with open('locais.json', 'w', encoding='utf-8') as f:
    json.dump(locais_validos, f, ensure_ascii=False, indent=2)

with open('sem_coordenada.json', 'w', encoding='utf-8') as f:
    json.dump(lista_sem_coordenada, f, ensure_ascii=False, indent=2)

print("PROCESSAMENTO CONCLUÍDO COM SUCESSO")
print(f"(C) Total de Locais Válidos (Prédios): {len(locais_validos)}")
print(f"(C) Total de Eleitores: {sum(item['eleitores'] for item in locais_validos)}")
print(f"(C) Locais Descartados (Sem Coord.): {len(lista_sem_coordenada)}")