# Contribuir A TrailNav

Esta guia sirve para personas y asistentes de codigo. Mantener la experiencia existente; corregir problemas demostrables antes de introducir abstracciones o funciones nuevas. El estado funcional vive exclusivamente en [FEATURES_STATUS.md](FEATURES_STATUS.md).

## Mapa Del Codigo

| Responsabilidad | Punto de entrada |
| --- | --- |
| Montaje de React | [src/main.tsx](src/main.tsx) |
| Pantallas, pestanas e historial | [src/App.tsx](src/App.tsx) |
| GPS de navegacion, pausas, alertas, restauracion y Wake Lock | [src/state/navigationSession.tsx](src/state/navigationSession.tsx) |
| Pantalla de navegacion utilizada | [src/screens/NavigationScreen.tsx](src/screens/NavigationScreen.tsx) |
| Explorador y navegacion sin ruta | [src/screens/MapExplorerScreen.tsx](src/screens/MapExplorerScreen.tsx) |
| Modelo persistido, migraciones y ajustes | [src/lib/db.ts](src/lib/db.ts) |
| Importacion y exportacion | [src/lib/gpx.ts](src/lib/gpx.ts) |
| Perfil compartido y muestreo | [src/lib/routeProfile.ts](src/lib/routeProfile.ts) |
| Analisis y tiempos estimados | [src/lib/routeAnalysis.ts](src/lib/routeAnalysis.ts), [src/lib/eta.ts](src/lib/eta.ts) |
| Progreso GPS sobre la ruta | [src/lib/mapMatching.ts](src/lib/mapMatching.ts) |
| Recorrido realmente grabado | [src/lib/actualTrack.ts](src/lib/actualTrack.ts) |
| Edicion no destructiva y sentido | [src/lib/routeTools.ts](src/lib/routeTools.ts), [src/lib/reverseRoute.ts](src/lib/reverseRoute.ts) |
| Waypoints y giros orientativos | [src/lib/routePoints.ts](src/lib/routePoints.ts) |
| Estilos y protocolo de teselas offline | [src/lib/mapStyles.ts](src/lib/mapStyles.ts), [src/lib/offlineTiles.ts](src/lib/offlineTiles.ts) |
| Meteorologia | [src/lib/routeWeather.ts](src/lib/routeWeather.ts) |
| Formato de numeros, fechas y duraciones | [src/lib/format.ts](src/lib/format.ts) |
| Componentes compartidos y tokens visuales | [src/components/UI.tsx](src/components/UI.tsx), [src/index.css](src/index.css) |
| PWA y recepcion de archivos compartidos | [vite.config.ts](vite.config.ts), [public/share-target.js](public/share-target.js), [public/manifest.webmanifest](public/manifest.webmanifest) |

No deducir que una pantalla esta activa por su nombre: seguir los imports de App. Las variantes historicas no son un contrato ni una recomendacion de integracion.

## Contratos Que Hay Que Preservar

- Coordenadas internas: longitud, latitud y altitud opcional, en ese orden. Distancias de los motores en metros, altitud/desnivel en metros; convertir a kilometros solo donde lo indique el consumidor. La velocidad de sesion se expresa en km/h.
- La geometria actual de `Route.geoJson` es la fuente para editar y exportar. `gpxData` conserva el texto importado, que puede ser KML o JSON y quedar desactualizado tras una edicion.
- El perfil compartido calcula las metricas de ruta; no duplicar calculos diferentes en cada pantalla. Las metricas del recorrido real no son las metricas planificadas del GPX.
- El proveedor de sesion posee el seguimiento de una ruta activa para que cambiar de pestana no lo reinicie. No mover ese seguimiento a la pantalla.
- Mantener operaciones de recorte/simplificacion no destructivas y conservar identificadores de rutas ya guardadas salvo al duplicar.
- `trailnav-db`, version 2, contiene `routes`, `maps`, `tiles` y `settings`. Una migracion futura debe incrementar la version, conservar rutas/ajustes y probar datos previos. La migracion v1 a v2 elimina los registros de mapas antiguos sin teselas reales.
- La conexion IndexedDB se comparte, pero se descarta si falla, termina de forma inesperada o bloquea una actualizacion. No almacenar una promesa rechazada indefinidamente.
- `trailnav-active-session` y `trailnav-active-track` son datos de localStorage, no entradas fiables. Conservar las guardas de lectura, escritura y recuperacion. No prometer un archivo historico de actividades finalizadas.
- Las teselas de una region se guardan en IndexedDB; la cache del service worker no equivale a una region descargada completa. No borrar datos de usuario para solucionar un problema de cache.
- Mantener los tokens cartograficos existentes y el formato es-ES centralizado. No redisenar ni cambiar algoritmos de desnivel sin una necesidad y una prueba concretas.
- Los contenedores MapLibre necesitan dimensiones estables dentro de las pantallas con pestanas; probar redimensionado y entrada/salida de pantalla tras cualquier cambio de layout.
- No introducir secretos en el cliente. Actualmente no se necesita backend ni clave de API.

## Verificacion

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run check` agrupa los tres ultimos pasos y se detiene si alguno falla. `npm run lint` se conserva por compatibilidad, pero solo ejecuta TypeScript: no hay ESLint configurado. `npm run clean` borra unicamente `dist` y funciona tambien en Windows.

Las pruebas estan en [scripts/mobile-features.test.ts](scripts/mobile-features.test.ts) y usan `node:test`, `tsx` y `fake-indexeddb`. Cubren importacion/exportacion, edicion, UTM, rechazo de posiciones GPS invalidas, recuperacion parcial de trazas y persistencia/reconexion de IndexedDB. TypeScript incluye este archivo de pruebas. Ampliarlo antes de crear otra infraestructura.

`fake-indexeddb` no certifica cuotas, permisos ni fallos de disco reales. Faltan pruebas dedicadas de ETA/map matching y de migracion v1. Un resultado verde no certifica sensores, autonomia, instalacion Android o funcionamiento en segundo plano.

Para cambios de mapa, sesion o PWA, comprobar tambien:

1. Importar una ruta y abrir analisis, mapa y navegacion en escritorio y movil.
2. Cambiar de pantalla con sesion activa, pausar/reanudar y recargar; comprobar que no se reinicia silenciosamente.
3. Con `npm run preview`, descargar una zona, recargar sin red y comprobar rutas y cobertura guardada.
4. Validar en telefono real ubicacion, Wake Lock, bloqueo/desbloqueo, instalacion e importacion compartida cuando afecten al cambio.
5. Comprobar consola, legibilidad, controles y ausencia de solapamientos. Los sensores simulados no sustituyen la prueba de campo.

La compilacion avisa del tamano del modulo de MapLibre. No ocultar el aviso aumentando el umbral: medir antes de proponer una division de codigo.

## Dependencias Y Entrega

Usar npm y mantener `package-lock.json` junto a `package.json`. `npm ci` es la instalacion reproducible; usar `npm install` solo para cambios deliberados de dependencias. Declarar herramientas utilizadas directamente, como Terser, sin depender de que otro paquete las instale de forma transitiva.

Ejecutar `npm audit` despues de modificar dependencias. No usar `npm audit fix --force` sin revisar migraciones y probar el comportamiento. A 2026-10-22 quedan dos avisos: uno bajo de esbuild y uno critico de MapLibre, cuya correccion propuesta exige migrar a una version mayor. El aviso critico es trabajo prioritario pendiente, no una certificacion de seguridad; evaluar exposicion y validar mapas, protocolos, popups y offline al migrar.

Desplegar el contenido de `dist` en la raiz de un sitio HTTPS. El manifiesto usa rutas absolutas y scope `/`; alojar en un subdirectorio requiere adaptar tambien la PWA, no solo la opcion `base` de Vite. Configurar cabeceras de seguridad en el hosting: las de `server` en Vite solo sirven durante desarrollo. Revisar que todos los iconos declarados en el manifiesto existan antes de certificar instalacion.

Antes de entregar: ejecutar `npm run check`, explicar que se ha comprobado y que no, actualizar solo la documentacion afectada y no cambiar el estado de una funcion a completada sin evidencia. No crear otro resumen de progreso: README explica el uso, esta guia el mantenimiento y FEATURES_STATUS el estado.