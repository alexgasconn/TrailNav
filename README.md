# TrailNav

Aplicacion web instalable (PWA) de navegacion para senderismo y trail. Importa rutas GPX, KML y GeoJSON, prepara el recorrido y sigue la posicion GPS con cartografia descargada. No necesita cuenta ni servidor propio.

## Empezar

Recomendado: Node.js 22 LTS y npm. Ejecutar desde la raiz del repositorio:

```sh
npm ci
npm run dev
```

Abrir <http://localhost:5173>. No hacen falta claves de API ni archivos de entorno para las funciones actuales. Si el puerto esta ocupado, Vite muestra el puerto alternativo.

```sh
npm run check
npm run preview
```

`check` ejecuta TypeScript, pruebas y compilacion PWA. `preview` sirve el resultado de produccion en <http://localhost:4173> por defecto; no es un servidor de despliegue. Los instaladores [SETUP.bat](SETUP.bat) y [SETUP.sh](SETUP.sh) automatizan la instalacion reproducible y estas comprobaciones.

## Usar La Aplicacion

1. Importar un archivo local desde Rutas; tambien admite una URL HTTPS directa si el servidor permite CORS.
2. Revisar distancia, desnivel, perfil y estimaciones de tiempo. Las ediciones por recorte o simplificacion guardan una copia.
3. Descargar la zona y el estilo necesarios desde Offline antes de salir.
4. Iniciar la navegacion y conceder ubicacion. La sesion sigue activa al cambiar de pantalla.
5. Exportar el recorrido real antes de finalizar si se quiere conservarlo como archivo GPX.

Tambien se puede abrir Mapa sin ruta para consultar la posicion. La meteorologia de Open-Meteo necesita red para actualizarse; los tiempos estimados no sustituyen la planificacion personal.

## Offline Y Seguridad

- La primera carga necesita conexion. El service worker solo se genera en produccion; probar offline con `build` y `preview`, no con `dev`.
- Las rutas, ajustes y teselas descargadas viven en IndexedDB del navegador. La sesion activa y su recorrido usan localStorage. No hay sincronizacion ni copia remota.
- El navegador puede borrar estos datos. Exportar rutas importantes; limpiar datos del sitio o desinstalar puede hacerlos desaparecer.
- OpenStreetMap es el estilo predeterminado. Tambien hay OpenTopoMap, Esri y CARTO. La cobertura detallada sin red depende de las regiones guardadas, no de haber abierto el mapa una vez.
- [public/maps/catalunya.json](public/maps/catalunya.json) es una referencia Natural Earth 1:10M incluida en la PWA. No contiene senderos, curvas de nivel ni detalle para orientacion de seguridad. Fuente: <https://www.naturalearthdata.com/about/terms-of-use/>.
- Respetar atribuciones, licencias y condiciones de descarga de cada proveedor. La existencia de una opcion de descarga no autoriza usos masivos.
- GPS, brujula, audio, vibracion y pantalla encendida dependen del navegador y los permisos. HTTPS o localhost son necesarios para APIs sensibles. No se garantiza seguimiento con el telefono bloqueado ni una autonomia determinada.
- La app no sustituye cartografia de seguridad ni servicios de emergencia. SOS prepara acciones que debe confirmar la persona; no envia ni llama automaticamente.

Instalacion y comprobacion en telefono: [GUIA_RAPIDA_ANDROID.md](GUIA_RAPIDA_ANDROID.md).

## Para Contribuir

- [CONTRIBUTING.md](CONTRIBUTING.md): arquitectura, convenciones, pruebas y entrega.
- [FEATURES_STATUS.md](FEATURES_STATUS.md): funciones implementadas, limitaciones y trabajo pendiente. Es la unica fuente de estado funcional.
- [Especificacion de producto.txt](Especificacion%20de%20producto.txt): referencia de producto, no certificacion de funciones implementadas.

No hay una certificacion publicada de accesibilidad, seguridad, autonomia o compatibilidad con todos los dispositivos. Consultar el estado y ejecutar las comprobaciones antes de dar una capacidad por validada.