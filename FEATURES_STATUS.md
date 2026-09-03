# TrailNav - Estado de features

Ultima revision: 2026-09-03

Este archivo es la fuente de verdad del progreso. Una feature solo pasa a **Completada** cuando existe una implementacion funcional y una comprobacion verificable.

Estados: **Completada**, **En progreso**, **Pendiente**.

## Analisis de rutas

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Importacion | GPX | Completada | Parser local y persistencia IndexedDB |
| Importacion | FIT | Pendiente | Requiere parser binario |
| Importacion | KML | Pendiente | Dependencia disponible, falta pipeline |
| Analisis | Distancia y desnivel bruto | Completada | Calculado al importar |
| Analisis | Perfil altimetrico | Completada | Canvas en detalle de ruta |
| Analisis | Suavizado de elevacion | Completada | Media movil local para el analisis |
| Analisis | Segmentos de subida y bajada | Completada | Umbral configurable en motor local |
| Analisis | Ficha de segmentos significativos | Completada | Visible en Route Details |
| Analisis | Pendiente por segmento coloreada | Pendiente | Falta pintar la geometria por tramos |
| Analisis | Perfil interactivo sincronizado | Pendiente | Falta seleccion mapa/perfil |
| Terreno | Superficie OSM | Pendiente | Falta enriquecimiento previo |
| Terreno | `sac_scale` y `mtb:scale` | Pendiente | Falta modelo de dificultad |

## Navegacion y mapas

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Navegacion | GPS en vivo | Completada | Hook de geolocalizacion y pantalla activa |
| Navegacion | Map matching | Pendiente | Falta proyeccion sobre la polilinea |
| Navegacion | Desvio con histeresis/cooldown | En progreso | Hay alerta visual; faltan reglas completas |
| Navegacion | North-Up / Heading-Up | En progreso | Existe orientacion; falta selector integrado |
| Navegacion | Maniobras desde geometria | Pendiente | Falta detector de giros |
| Mapas | Explorador MapLibre | Completada | Mapa y estilos base |
| Mapas | Capas topografica/hillshade/pendiente | Pendiente | Falta pipeline DEM local |
| Mapas | Mapas regionales offline reales | Pendiente | El gestor aun es interfaz base |
| POIs | POIs offline | Pendiente | Falta almacenamiento y capa visual |

## ETA y actividad

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| ETA | Naismith | Completada | Estimacion inicial en Route Details |
| ETA | Tobler, Munter, Swiss, Petzoldt | Pendiente | Falta motor modular multimodelo |
| ETA | Mediana + MAD | Pendiente | Falta consenso robusto |
| ETA | Adaptacion al rendimiento | Pendiente | Falta historial de actividad |
| Actividad | Sesion y puntos GPS | Pendiente | Falta persistencia de actividad |
| Actividad | Tiempo en movimiento | En progreso | Se muestran datos basicos en navegacion |
| Meteorologia | Proveedor Open-Meteo | Pendiente | Falta interfaz y cache |
| Meteorologia | Timeline espacial/temporal offline | Pendiente | Depende del motor ETA y cache local |

## Plataforma

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Offline-first | Rutas en IndexedDB | Completada | Persistencia local implementada |
| Offline-first | Service worker de la PWA | En progreso | Configurado, falta prueba de instalacion |
| Android | Wake lock, vibracion, bateria | En progreso | APIs disponibles con soporte del navegador |
| Calidad | TypeScript sin errores | En progreso | Verificar despues de cada bloque |
| Calidad | Pruebas automatizadas de motores | Pendiente | Prioridad para los algoritmos nuevos |

## Siguiente bloque recomendado

1. Pintar el track por pendiente en mapa y perfil.
2. Extraer un modulo comun de geometrias para map matching.
3. Implementar ETA multimodelo con pruebas de casos conocidos.
4. Añadir cache de meteorologia antes de iniciar una actividad.
