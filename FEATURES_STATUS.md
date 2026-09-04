# TrailNav - Estado de features

Ultima revision: 2026-09-04

Este archivo es la fuente de verdad del progreso. Una feature solo pasa a **Completada** cuando existe una implementacion funcional y una comprobacion verificable.

Estados: **Completada**, **En progreso**, **Pendiente**.

## Analisis de rutas

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Importacion | GPX | Completada | Parser local y persistencia IndexedDB |
| Importacion | FIT | Pendiente | Requiere parser binario |
| Importacion | KML | Pendiente | Dependencia disponible, falta pipeline |
| Analisis | Distancia y desnivel bruto | Completada | Calculado al importar |
| Analisis | Perfil altimetrico | Completada | Canvas en detalle de ruta; ahora con relleno por pendiente por tramo y opciones de visualización |
| Analisis | Suavizado de elevacion | Completada | Media movil local para el analisis |
| Analisis | Segmentos de subida y bajada | Completada | Umbral configurable en motor local |
| Analisis | Ficha de segmentos significativos | Completada | Visible en Route Details |
| Analisis | Pendiente por segmento coloreada | Completada | Tramos significativos coloreados en Map Explorer y perfil (fill por tramo) |
| Analisis | Perfil interactivo sincronizado | En progreso | Vista en modo navegación muestra solo la gráfica con la posición del usuario; falta integración completa mapa↔perfil |
| Terreno | Superficie OSM | Pendiente | Falta enriquecimiento previo |
| Terreno | `sac_scale` y `mtb:scale` | Pendiente | Falta modelo de dificultad |

## Navegacion y mapas

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Navegacion | GPS en vivo | Completada | Hook de geolocalizacion y pantalla activa |
| Navegacion | Map matching | Completada | Proyeccion GPS sobre la polilinea para distancia restante |
| Navegacion | Desvio con histeresis/cooldown | En progreso | Hay alerta visual; faltan reglas completas |
| Navegacion | North-Up / Heading-Up | En progreso | Existe orientacion; falta selector integrado |
| Navegacion | Maniobras desde geometria | Pendiente | Falta detector de giros |
| Mapas | Explorador MapLibre | Completada | Mapa y estilos base |
| Mapas | Capas topografica/hillshade/pendiente | Pendiente | Falta pipeline DEM local |
| Mapas | Catalogo regional Catalunya | Completada | Ejemplos Catalunya, Pirineu catala y Montseny/Montserrat |
| Mapas | Mapas regionales offline reales | Pendiente | La interfaz no descarga aun teselas vectoriales ni DEM |
| POIs | POIs offline | Pendiente | Falta almacenamiento y capa visual |

## ETA y actividad

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| ETA | Naismith | Completada | Estimacion inicial en Route Details |
| ETA | Tobler, Munter, Swiss, Petzoldt | Completada | Motor local modular visible en Route Details |
| ETA | Mediana + MAD | Completada | Consenso robusto con modelos aceptados y rango |
| ETA | Adaptacion al rendimiento | Pendiente | Falta historial de actividad |
| Actividad | Sesion y puntos GPS | Pendiente | Falta persistencia de actividad |
| Actividad | Tiempo en movimiento | En progreso | Se muestran datos basicos en navegacion |
| Meteorologia | Proveedor Open-Meteo | Completada | Consulta sin API key desde la preparacion de ruta |
| Meteorologia | Timeline espacial/temporal offline | En progreso | Inicio, mitad y final segun ETA con cache local; falta muestreo horario completo |

## Plataforma

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Offline-first | Rutas en IndexedDB | Completada | Persistencia local implementada |
| Offline-first | Service worker de la PWA | En progreso | Configurado, falta prueba de instalacion |
| Android | Wake lock, vibracion, bateria | En progreso | APIs disponibles con soporte del navegador |
| Calidad | TypeScript sin errores | En progreso | Verificar despues de cada bloque |
| Calidad | Pruebas automatizadas de motores | Pendiente | Prioridad para los algoritmos nuevos |
| UX | Navegacion centrada en rutas | Completada | Tabs Rutas, Mapas y Ajustes; importar es una accion contextual |
| UX | Centro de preparacion de ruta | Completada | Accesos a mapa, analisis, meteo y navegacion desde la ruta |

## Siguiente bloque recomendado

1. Añadir perfil interactivo sincronizado con la posicion proyectada.
2. Completar desvio con cooldown e histéresis configurable.
3. Añadir pruebas de los motores de analisis, ETA y map matching.
4. Implementar importacion KML y FIT.
