# TrailNav - Estado de features

Ultima revision: 2026-10-22

Este archivo es la fuente de verdad del progreso. Una feature solo pasa a **Completada** cuando existe una implementacion funcional y una comprobacion verificable.

Estados: **Completada**, **En progreso**, **Pendiente**.

## Experiencia movil: ampliacion de octubre

OpenStreetMap es la opcion predeterminada. Catalunya queda como mapa de referencia opcional, no como sustituto del mapa detallado.

| Funcion solicitada | Estado actual y limites |
| --- | --- |
| GPX, KML y GeoJSON | Importacion local, validacion de coordenadas y limite de 20 MB |
| Compartir desde otras apps | Receptor POST del service worker; probado con un archivo compartido simulado. Requiere PWA instalada y soporte del SO; comprobar en Android real |
| Abrir con | Declaracion file_handlers y launchQueue; depende del navegador/SO, no disponible universalmente en moviles |
| Importar URL | Enlace HTTPS directo; sujeto a CORS del servidor. Sin proxy ni extraccion de paginas de terceros |
| Mapas offline | Descarga de rectangulo personalizado a IndexedDB; estimacion de MB antes y tamaño real despues. No hay acceso directo a tarjeta SD |
| Motor de mapa | MapLibre para gestos y trazas vectoriales; las bases actuales son raster, no paquetes vectoriales offline |
| Perfil tactil | Arrastre y teclado en explorador; marcador sincronizado sobre el mapa. El perfil de navegacion conserva la posicion GPS en vivo |
| Ficha tecnica | Distancia, D+, D-, altitudes maxima/minima y estimaciones de tiempo |
| Pendiente sobre ruta | Subidas por intensidad, llano verde y bajadas azules, calculadas con elevacion suavizada. No es inclinacion lateral del terreno |
| Waypoints | Pulsacion larga o boton en el centro del mapa, tipo/icono y notas; persistentes y exportables. Maximo 250 m del track |
| Invertir / duplicar | Acciones desde analisis; duplicado con identificador nuevo |
| Recorte / limpieza | Inicio/final por distancia y simplificacion aproximada 3/5/10 m usando Turf; siempre guarda una copia |
| Exportar GPX | Generado desde la geometria actual, incluidos sentido y waypoints, no desde el archivo original sin editar |
| Capas | OSM, topografico, satelite y CARTO existentes. Heatmaps pendientes de proveedor/licencia |
| ETA ajustable | Naismith, Tobler y otros modelos, forma fisica y ritmos de senderismo/trail. Modelos especificos BTT/gravel pendientes |
| Pantalla inclinada | Perspectiva del mapa disponible; NO es relieve 3D con DEM |
| Navegacion offline | Rutas, calculos y GPS sin red con la PWA y cartografia previamente descargadas. El navegador/SO controla el GPS real |
| Posicion y orientacion | Marcador con precision, rumbo GPS y cono de brujula; requiere sensores/permisos compatibles |
| Desvio de ruta | Umbral configurable, alerta visual, vibracion y sonido/voz opcionales. No se avisa con precision GPS peor que 50 m |
| Alta visibilidad | Paneles de metricas, modo luz solar y mayor contraste del raster |
| Bateria | Solicitud GPS menos exigente opcional y menor frecuencia de actualizacion de brujula; autonomia de 8-10 h NO garantizada |
| Norte / rumbo | Conmutador durante la navegacion |
| Pantalla encendida | Preferencia y boton rapido mediante Wake Lock, sujeto a disponibilidad y permisos del navegador |
| Proximidad | Avisos visuales, vibracion y sonido/voz opcionales; radio configurable; evita repetir el mismo punto durante una sesion |
| Grabacion simultanea | Recorrido real persistido y exportacion GPX durante la actividad o antes de finalizar. No garantiza ejecucion con Android bloqueado |
| Auto-pausa | Opcional, 15 s bajo el umbral configurable; mantiene GPS para reanudar. Si falta velocidad GPS, intenta estimarla entre posiciones fiables |
| Giros | Indicaciones orientativas por geometria del track y voz opcional. No es enrutamiento giro a giro basado en cruces y nombres de senderos |
| SOS | Lat/lon, UTM WGS84, precision y aviso de posicion antigua; copiar, compartir, preparar SMS y acceso al 112. No envia ni llama sin accion del usuario |
| Auto-zoom | Opcional por velocidad durante el seguimiento |
| Una mano | Barra de navegacion con objetivos de 48 px en el tercio inferior; parte de los controles del explorador siguen arriba |
| Baliza | Compartir posicion puntual por SMS/datos disponible desde SOS; seguimiento continuo con servidor/contacto pendiente |
| Pendientes >30 grados | Pendiente de DEM y tratamiento de inclinacion del terreno; no confundir con pendiente del track en porcentaje |
| Cuadriculas | UTM disponible en SOS; superposicion UTM/MGRS/lat-lon pendiente |
| Edicion con snap-to-trail | Pendiente de motor de rutas/red de caminos, no se simula un ajuste inexistente |
| Fotos georreferenciadas | Pendiente de captura, almacenamiento y gestion de fotos |

Comprobaciones: TypeScript, compilacion PWA y seis pruebas en `scripts/mobile-features.test.ts`. Navegador con GPS simulado: importacion, arrastre del perfil, SOS, exportacion grabada, auto-pausa/reanudacion y recepcion de archivo compartido. Las pruebas del navegador no certifican sensores ni bateria Android.

Limitaciones de plataforma: HTTPS o localhost para APIs sensibles; PWA instalada para integracion con el SO; audio activado mediante gesto del usuario; voz offline dependiente de las voces instaladas. El almacenamiento web puede ser eliminado por el SO/navegador. No se ha añadido un servidor de localizacion.

Dependencias: npm informa de 19 vulnerabilidades (incluida una critica) en el arbol instalado. Pendiente de auditoria separada, sin aplicar actualizaciones masivas incompatibles.

## Analisis de rutas

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Importacion | GPX | Completada | Parser local y persistencia IndexedDB |
| Importacion | FIT | Pendiente | Requiere parser binario |
| Importacion | KML / GeoJSON | Completada | Pipeline local compartido con GPX y pruebas automatizadas |
| Analisis | Distancia y desnivel bruto | Completada | Calculado al importar |
| Analisis | Perfil altimetrico | Completada | Canvas en detalle de ruta; ahora con relleno por pendiente por tramo y opciones de visualización |
| Analisis | Suavizado de elevacion | Completada | Media movil local para el analisis |
| Analisis | Segmentos de subida y bajada | Completada | Umbral configurable en motor local |
| Analisis | Ficha de segmentos significativos | Completada | Visible en Route Details |
| Analisis | Pendiente por segmento coloreada | Completada | Tramos significativos coloreados en Map Explorer y perfil (fill por tramo) |
| Analisis | Perfil interactivo sincronizado | Completada | Arrastre tactil/teclado en explorador marca la coordenada en mapa; perfil GPS en navegacion |
| Terreno | Superficie OSM | Pendiente | Falta enriquecimiento previo |
| Terreno | `sac_scale` y `mtb:scale` | Pendiente | Falta modelo de dificultad |

## Navegacion y mapas

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Navegacion | GPS en vivo | Completada | Hook de geolocalizacion y pantalla activa |
| Navegacion | Map matching | Completada | Proyeccion GPS sobre la polilinea para distancia restante |
| Navegacion | Desvio con histeresis/cooldown | En progreso | Hay alerta visual; faltan reglas completas |
| Navegacion | North-Up / Heading-Up | Completada | Selector integrado en mapa y navegacion |
| Navegacion | Maniobras desde geometria | En progreso | Detector y avisos orientativos; falta contexto de cruces cartograficos |
| Mapas | Explorador MapLibre | Completada | Mapa y estilos base |
| Mapas | Capas topografica/hillshade/pendiente | Pendiente | Falta pipeline DEM local |
| Mapas | Catalogo regional Catalunya | Completada | Ejemplos Catalunya, Pirineu catala y Montseny/Montserrat |
| Mapas | Mapas regionales offline reales | En progreso | Teselas raster reales en IndexedDB; vectoriales y DEM pendientes |
| POIs | POIs offline | Completada | Waypoints en la ruta almacenada y marcadores locales |

## ETA y actividad

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| ETA | Naismith | Completada | Estimacion inicial en Route Details |
| ETA | Tobler, Munter, Swiss, Petzoldt | Completada | Motor local modular visible en Route Details |
| ETA | Media / mediana y rango | Completada | Seleccion segun divergencia de los modelos; no implementa MAD |
| ETA | Adaptacion al rendimiento | Pendiente | Falta historial de actividad |
| Actividad | Sesion y puntos GPS | Completada | Persistencia de sesion activa y exportacion del recorrido; sin archivo historico de actividades finalizadas |
| Actividad | Tiempo en movimiento | Completada | Pausa manual y auto-pausa configurable |
| Meteorologia | Proveedor Open-Meteo | Completada | Consulta sin API key desde la preparacion de ruta |
| Meteorologia | Timeline espacial/temporal offline | En progreso | Inicio, mitad y final segun ETA con cache local; falta muestreo horario completo |

## Plataforma

| Feature | Subfeature | Estado | Nota |
| --- | --- | --- | --- |
| Offline-first | Rutas en IndexedDB | Completada | Persistencia local implementada |
| Offline-first | Service worker de la PWA | En progreso | Configurado, falta prueba de instalacion |
| Android | Wake lock, vibracion, bateria | En progreso | APIs disponibles con soporte del navegador |
| Calidad | TypeScript sin errores | Completada | Comprobacion tsc --noEmit; tipos React instalados |
| Calidad | Pruebas automatizadas de motores | En progreso | Seis pruebas de importacion, exportacion, edicion y UTM; falta ampliar ETA/map matching |
| UX | Navegacion centrada en rutas | Completada | Tabs Rutas, Mapas y Ajustes; importar es una accion contextual |
| UX | Centro de preparacion de ruta | Completada | Accesos a mapa, analisis, meteo y navegacion desde la ruta |

## Siguiente bloque recomendado

1. Certificar sensores, comparticion de archivos y autonomia en Android real.
2. Completar desvio con cooldown e histéresis configurable.
3. Añadir pruebas de los motores de analisis, ETA y map matching.
4. Elegir proveedor de mapas vectoriales/DEM y motor snap-to-trail; despues abordar BTT/gravel, cuadrículas, fotos y baliza continua.
