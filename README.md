# Flytzi — Plataforma de Optimización de Tarifas Aéreas Privadas

¡Bienvenido a **Flytzi**! Una plataforma web minimalista, moderna y de alta confianza diseñada para una agencia digital boutique de optimización de tarifas aéreas privadas internacionales.

El sitio opera bajo una lógica híbrida exclusiva de metabúsqueda y cotización algorítmica dinámica en dólares americanos (USD), con integración completa de reserva de pasajeros, directivas de confidencialidad de datos y pasarela de pago Stripe (modo simulación).

---

## 🛠️ Tecnologías y Características Core

*   **Servidor Backend:** Node.js + Express.js con APIs de autocompletado y cotización dinâmica.
*   **Diseño Visual Premium:** Vanilla CSS con variables HSL adaptativas, glassmorphism, tipografía moderna (`Outfit` e `Inter`) y micro-animaciones fluidas.
*   **Simulador Alaska Airlines & OneWorld:** Genera rutas reales, escalas de conexión e itinerarios de códigos compartidos con aerolíneas OneWorld (Iberia, British Airways).
*   **Módulo de Reserva e Inputs Stripe:** Formulario blindado de pasaporte y datos de contacto del pasajero, con formateadores automáticos para tarjeta de crédito e integración de pago seguro simulado.
*   **Conversión Directa:** Botón final que estructura las confirmaciones de Stripe, localizadores GDS e información encriptada para el Concierge por WhatsApp.
*   **Seguridad Flotante:** Botón interactivo fijo de **Privacidad de Datos** que abre la directiva de confidencialidad militar de Flytzi.

---

## 📁 Estructura de Carpetas

```text
FLAYTZI/
├── data/
│   ├── airports.json       # Base de datos estática de hubs internacionales y regiones
│   └── mock_flights.json   # Plantillas dinámicas de vuelos de Alaska Airlines
├── public/
│   ├── index.html          # Interfaz semántica SEO-Friendly con módulos de Stripe y Privacidad
│   ├── style.css           # Estilos de fintech, carrusel y animaciones de checkmark
│   └── app.js              # Controlador interactivo SPA, formateadores y disparadores de checkout
├── .gitignore              # Exclusiones de Git (node_modules, configuraciones locales)
├── package.json            # Metadatos del proyecto y dependencias de npm
├── server.js               # Servidor de producción express con motor de tarifas de equipajes
└── .env.example            # Plantilla de variables de entorno para APIs reales
```

---

## 💻 Ejecución Local

1.  Asegúrate de tener instalado [Node.js](https://nodejs.org/).
2.  Instala las dependencias del proyecto en la carpeta raíz:
    ```bash
    npm install
    ```
3.  Inicia el servidor local de desarrollo:
    ```bash
    npm start
    ```
4.  Abre en tu navegador la dirección local:
    👉 **http://localhost:3000**

---

## 🚀 Guía de Subida a tu Repositorio de GitHub

Sigue estos pasos en tu terminal para crear tu repositorio oficial en GitHub y subir los archivos de forma limpia (excluyendo automáticamente archivos temporales y `node_modules` pesados gracias al archivo `.gitignore` configurado):

1.  **Crea un repositorio vacío en GitHub:**
    *   Inicia sesión en [GitHub](https://github.com/).
    *   Haz clic en **New** (Nuevo Repositorio).
    *   Nómbralo como prefieras (ej: `flytzi-platform`).
    *   Déjalo **sin** inicializar con README, `.gitignore` o licencia (ya los tenemos incluidos localmente).
    *   Haz clic en **Create repository**.

2.  **Ejecuta estos comandos en tu terminal local (dentro de la carpeta del proyecto):**
    ```bash
    # 1. Inicializa el repositorio Git en la carpeta raíz (si no está inicializado)
    git init

    # 2. Agrega todos los archivos al área de preparación (ignora node_modules automáticamente)
    git add .

    # 3. Registra tu primer commit con la descripción del desarrollo
    git commit -m "feat: modulo de reserva, checkout stripe simulado y red alaska airlines"

    # 4. Renombra la rama principal por defecto a 'main'
    git branch -M main

    # 5. Vincula tu repositorio local con tu repositorio remoto de GitHub
    # (Reemplaza TU_USUARIO y TU_REPOSITORIO con los tuyos reales que te da GitHub)
    git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git

    # 6. Sube los archivos a la rama main de GitHub
    git push -u origin main
    ```

---

## 🌐 Recomendaciones para el Despliegue en Servidores

Dado que el proyecto cuenta con un servidor backend en **Node.js/Express**, para que esté visible públicamente en internet puedes desplegarlo de manera gratuita o a bajo costo en:

*   **Render (Recomendado & Gratis):**
    1. Regístrate en [Render.js](https://render.com/) y vincula tu cuenta de GitHub.
    2. Crea un **New Web Service**.
    3. Conecta el repositorio de `flytzi-platform` que subiste.
    4. Define el *Start Command* como `npm start` y el *Build Command* como `npm install`.
    5. Render te dará un dominio público seguro (HTTPS) de forma automática.

*   **Heroku o Railway:**
    *   Ideales para servidores Node.js con integración directa a GitHub.
