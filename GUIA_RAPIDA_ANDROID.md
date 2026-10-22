# TrailNav En Android

## Instalar

1. Abrir la direccion HTTPS donde se haya desplegado TrailNav en Chrome compatible.
2. Desde el menu del navegador, elegir instalar o anadir a la pantalla de inicio. La opcion exacta depende del dispositivo y de que el navegador considere instalable la PWA.
3. Abrir la app y conceder ubicacion al iniciar el mapa o la navegacion.

No hacen falta permisos de camara ni microfono. La app guarda rutas y mapas en el almacenamiento del sitio, no en una carpeta de la tarjeta SD. Mantener la pantalla encendida requiere soporte de Wake Lock y no siempre se concede.

## Antes De Salir

1. Importar la ruta y revisar sentido, distancia, desnivel y estimaciones.
2. Descargar en Offline la zona y el estilo que se van a utilizar; esperar a que termine.
3. Sin conexion, cerrar y volver a abrir la app para verificar la ruta y el mapa descargado.
4. Recuperar conexion si se necesita actualizar la meteorologia.
5. Probar ubicacion y precision en el exterior y llevar una alternativa de orientacion.

La referencia incluida de Catalunya no contiene senderos ni curvas de nivel. El mapa detallado solo esta disponible sin red donde se ha guardado. Los proveedores pueden limitar las descargas.

## Durante Y Despues

- Cambiar de pestana no detiene la sesion. Usar pausa/reanudar para controlar el tiempo de actividad.
- Una precision GPS mala limita las alertas; no interpretar la ausencia de avisos como garantia de estar en la ruta.
- La brujula, vibracion, voz y Wake Lock dependen del telefono, navegador y permisos. Android puede suspender la app al bloquear la pantalla.
- Exportar el recorrido real antes de finalizar para conservar un GPX. No hay historial remoto ni copia automatica.
- SOS muestra posicion y prepara acciones de compartir o llamar que debe confirmar la persona.

No borrar datos del navegador ni desinstalar sin exportar las rutas importantes. El sistema tambien puede liberar almacenamiento bajo presion de espacio.

## Si Algo Falla

- Ubicacion: comprobar permiso del sitio, ubicacion del sistema y que la direccion sea HTTPS. Una IP de red local con HTTP no equivale a localhost del telefono.
- Mapa sin red: comprobar que se descargo esa region y ese estilo. Haber visto una zona online no garantiza su descarga completa.
- Instalacion o compartir desde otra app: dependen del navegador/SO; usar importacion local de archivos como alternativa.
- Version antigua: volver a abrir con conexion para permitir la actualizacion. No limpiar datos del sitio como primer recurso.

Para informar de un fallo, indicar dispositivo, Android/navegador, pasos, conexion, permisos y mensaje visible. No publicar trazas GPS personales sin revisar su contenido.

Configuracion del proyecto: [README.md](README.md). Capacidades y limites: [FEATURES_STATUS.md](FEATURES_STATUS.md).