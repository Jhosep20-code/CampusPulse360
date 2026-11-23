# Guía de instalación de Unity para la TA5 (acciones del equipo)

Todo es gratuito: Unity Personal está pensado para ingresos y fondos menores de 200.000 USD en 12 meses. La creación de cuentas y la aceptación de licencias las hace el equipo.

1. **Unity Hub:** descargarlo desde unity.com/download e iniciar sesión con una cuenta Unity ID.
2. **Editor:** en Hub, Installs > Install Editor > **Unity 6.3 LTS** (la versión LTS actual; anotar el número exacto 6000.3.x para el informe). Módulos:
   - **Windows Build Support** (normalmente se incluye).
   - Microsoft Visual Studio Community: ya está instalada la versión 2026; no hace falta reinstalarla.
   - Android Build Support: solo si más adelante se prueba en un visor Meta Quest físico. No hace falta para el simulador.
3. **Proyecto FPS:** en Hub, New project > plantilla **Universal 3D** > nombre `unity-fps` > ubicación `C:\Proyectos\CampusPulse360\apps\`.
4. **Proyecto VR:** en Hub, New project > plantilla **VR** (si se ofrece; trae XR Plug-in Management, OpenXR y XR Interaction Toolkit) > nombre `unity-vr` > misma ubicación.
5. **Meta XR Simulator:** instalador para Windows desde developers.meta.com (sección Meta XR Simulator). Según Meta, ya no se instala como paquete dentro del proyecto.
6. **Meta XR Core SDK:** en la Asset Store, con la misma cuenta. **Antes de añadirlo, revisar y aceptar su licencia**, y avisar a Claude.
7. Cerrar Unity después de crear los proyectos: Claude añadirá el paquete compartido `com.campuspulse.campus` y ejecutará la construcción, la validación y las capturas en modo batch.

Al terminar, indica la ruta de `Unity.exe`, normalmente `C:\Program Files\Unity\Hub\Editor\6000.3.x\Editor\Unity.exe`.
