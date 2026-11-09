# Léxico · Sistema de palabras (Fase 1)

Objetivo: encontrar **todas** las palabras del español que son cultas pero útiles
(se pueden decir en una conversación o escribir en un correo de trabajo), clasificarlas
y dejarlas listas para generar fichas y ejercicios automáticamente.

## Cómo funciona

`candidatos.py` cruza tres fuentes abiertas y aplica un embudo de filtros:

| Fuente | Para qué | Licencia |
|---|---|---|
| Wikcionario en español (volcado de [kaikki.org](https://kaikki.org/dictionary/rawdata.html)) | lemas, categoría, acepciones, marcas (desuso, regionalismo, tecnicismo), sinónimos, formas flexionadas, etimología | CC BY-SA 4.0 |
| Subtítulos OpenSubtitles 2018 ([FrequencyWords](https://github.com/hermitdave/FrequencyWords)) | frecuencia en el **habla** | uso de investigación |
| Prensa en español 2023 ([Leipzig Corpora](https://wortschatz.uni-leipzig.de/en/download/Spanish), 1 M de frases) | frecuencia en la **escritura** y detección de nombres propios | CC BY |
| [`wordfreq`](https://pypi.org/project/wordfreq/) | frecuencia general multi-fuente (escala Zipf) | Apache 2.0 / CC BY-SA |

**Calibración con datos, no a ojo.** Las 36 palabras elegidas a mano para la app son el
conjunto de referencia. Su frecuencia fija la «franja culta» (Zipf 2,03–3,95, aprox.
entre la palabra nº 20.000 y la nº 80.000 del idioma), y el sistema se evalúa por cuántas
recupera y en qué posición las coloca.

**Señales que calcula para cada palabra**
- `zipf`: frecuencia sumando todas sus formas (diáfano, diáfana, diáfanos…).
- `registro`: log10(prensa / habla). Positivo = más escrita que hablada.
- `equivalentes`: sinónimos o palabras de su definición que son mucho más comunes
  (el «en vez de *claro*, di *diáfano*»).
- `derivado_obvio`: derivados transparentes de una palabra común (efectivo → efectividad)
  y compuestos tipo *socio-*, *multi-*; se penalizan porque aportan poco.
- `puntuacion` y `nivel` (A = núcleo, B, C).

## Resultados (`informe.json`)

| Paso del embudo | Palabras |
|---|---:|
| Lemas del Wikcionario (adjetivo, verbo, sustantivo, adverbio; una palabra) | 104.915 |
| con al menos una acepción de uso general | 80.785 |
| en la franja culta (ni rarísimas ni comunes) | 25.559 |
| sin nombres propios, préstamos recientes ni gentilicios | 23.000 |
| con un equivalente común al que sustituir | 13.061 |
| vivas en la escritura | **12.288 candidatas** |

**Validación**
- Recupera **30 de las 36** palabras de referencia (83 %), con mediana en el percentil 79
  de la lista.
- Precisión medida a mano sobre 150 palabras al azar (`evaluacion_muestra.csv`):
  nivel A 44 %, B 22 %, C 10 %.

**Estimación:** 3.687 × 0,44 + 4.301 × 0,22 + 4.300 × 0,10 ≈ **3.000 palabras útiles
detectadas**, y **~3.500** corrigiendo lo que el filtro aún pierde. El núcleo de más valor
(nivel A útil) ronda las **1.600**.

## Siguiente paso: filtro fino con IA

Las reglas sirven para no perder palabras (recall). La precisión del 44 % del nivel A la sube
un clasificador con IA que, para cada candidata, responde en JSON:
¿es culta y útil?, campo temático, función comunicativa (elogiar, criticar, negociar,
consolar, persuadir…), contextos (correo, conversación, discurso, poema), variante regional.
Después se revisa a mano una muestra de cada lote.

## Costes estimados (precios de la API de Claude, Batch API con 50 % de descuento)

| Tarea | Volumen | Haiku 5.5 | Sonnet 5.5 |
|---|---|---:|---:|
| Clasificar 12.288 candidatas (50 por petición) | ~0,9 M tokens de entrada / ~0,6 M de salida | ~0,20 $ | ~4 $ |
| Generar 3.500 fichas completas con ejercicios | ~7 M / ~4,2 M | ~1,40 $ | ~28 $ |
| Prueba piloto: 36 palabras de referencia en ambos modelos | — | < 0,10 $ | < 0,50 $ |
| Corregir una frase del usuario (en vivo, sin batch) | ~900 / ~350 por corrección | ~0,0003 $ | ~0,005 $ |

Supuestos: salida con esfuerzo bajo; las cifras son estimaciones a validar con la prueba piloto.

**Plan dentro de un tope de 30 $:**
1. Piloto (≤ 1 $): generar las 36 fichas de referencia con Haiku 5.5 y Sonnet 5.5 y
   compararlas con las escritas a mano.
2. Clasificación de las 12.288 candidatas (0,20–4 $).
3. Fichas: Sonnet 5.5 para el núcleo de ~1.000 (~8 $) y Haiku 5.5 para el resto (~1 $),
   o todo con Haiku si el piloto lo justifica (~1,50 $).
4. El resto del presupuesto cubre la corrección en vivo con Haiku 5.5: ~3.500 correcciones
   por dólar; con 1.000 usuarios haciendo una al día, ~8 $ al mes.

Alojamiento: la app sigue siendo estática (GitHub Pages) y un *worker* gratuito
(p. ej. Cloudflare Workers) guarda la clave de la API y limita el uso por persona.

## Reproducir

```bash
pip install wordfreq
mkdir -p data && cd data
curl -LO https://kaikki.org/dictionary/downloads/es/es-extract.jsonl.gz
curl -L -o es_full.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_full.txt
curl -LO https://downloads.wortschatz-leipzig.de/corpora/spa_news_2023_1M.tar.gz
tar -xzf spa_news_2023_1M.tar.gz --wildcards '*-words.txt' && mv spa_news_2023_1M/*-words.txt news-words.txt
cd .. && python3 candidatos.py data .
```

`candidatos.csv` incluye glosas tomadas del Wikcionario (CC BY-SA 4.0). Las definiciones
de la app deben ser propias: no se copian las del diccionario académico.
