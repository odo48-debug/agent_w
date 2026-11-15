# Agente IA de WhatsApp para Sociedades de Tasación (SaaS B2B)

Plataforma inteligente para la **coordinación y seguimiento automático de encargos de tasación inmobiliaria con tasadores a través de WhatsApp**, utilizando Inteligencia Artificial (**Anthropic Claude**) con llamadas a herramientas (*Tool Calling*), **Twilio WhatsApp API** y un **Panel Web de Control en tiempo real**.

El sistema actúa como **Valentina** (coordinadora de operaciones de la sociedad de tasación), eliminando el cuello de botella de tener que perseguir manualmente a cada técnico para conocer el estado de sus expedientes.

---

## 🎯 ¿Qué hace la aplicación actualmente?

### 1. Un solo número de WhatsApp para múltiples tasadores (Aislamiento Total)
- La empresa utiliza **un único número de WhatsApp** (Twilio).
- El sistema identifica automáticamente a cada tasador por su número de teléfono entrante (`From: whatsapp:+34...`).
- **Privacidad estricta:** Cada tasador solo ve, consulta y actualiza **sus propios encargos asignados**. Las conversaciones y los contextos de IA están 100% aislados entre sí (por ejemplo, Jose y Beatriz interactúan con sus respectivos lotes de trabajo sin ver los del otro).

### 2. Comprensión de lenguaje natural y acciones automáticas (Tool Calling)
Los tasadores responden con mensajes rápidos desde el coche o la calle, y Claude interpreta la intención ejecutando cambios directos en la base de datos:

| Mensaje real del Tasador | Herramienta ejecutada | Acción en el sistema |
| :--- | :--- | :--- |
| *"El de Urzaiz lo visito mañana a las 11"* | `agendar_visita` | Asocia el expediente, cambia el estado a `VISITA_CONCERTADA` y guarda fecha/hora y notas. |
| *"El de Pizarro lo envío hoy"* | `comprometer_entrega` | Registra el compromiso de entrega de informe para *Hoy* y calcula plazos. |
| *"Si se puede reasignar mejor, hasta el viernes no puedo visitar"* | `solicitar_reasignacion` | Marca el encargo con alerta roja `REASIGNACION_SOLICITADA`, anota el motivo y sugiere al tasador agendar la cita si es urgente. |
| *"El contacto no contesta al teléfono"* | `reportar_incidencia` | Cambia el estado a `INCIDENCIA` (`CONTACTO_ILOCALIZABLE`) para intervención de la coordinación. |
| *"¿Qué encargos tengo pendientes?"* | *Consulta de contexto* | Valentina resume los expedientes abiertos del tasador ordenados por urgencia y fecha límite. |

### 3. Panel de Control de Coordinación en Vivo (`/admin`)
- Accesible en `http://localhost:3000/admin`.
- **Métricas globales:** Total de encargos, Urgentes, Visitas agendadas, En redacción, Reasignaciones e Informes entregados.
- **Tabla interactiva:** Muestra el tasador asignado (Jose, Beatriz...), expediente, dirección, municipio, contacto con teléfono, plazos y el último evento detectado por la IA.
- **Auto-refresco:** Se actualiza automáticamente cada 5 segundos para supervisar en vivo los avances mientras los tasadores chatean por WhatsApp.

---

## 🏗️ Arquitectura del Sistema

```
                  ┌──────────────────────────────────────────────┐
                  │          WhatsApp de la Empresa              │
                  │             (+1 415 523 8886)                │
                  └──────────────────────┬───────────────────────┘
                                         │ Webhook HTTP POST
                                         ▼
                                 ┌──────────────┐
                                 │    ngrok     │
                                 └───────┬──────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Servidor Express (Node.js)                      │
│                                                                        │
│  1. Identifica al tasador por su teléfono                              │
│  2. Carga sus encargos específicos (tasacionesStore.js)                │
│  3. Invoca a Claude Haiku con Tool Calling                             │
│  4. Ejecuta transacciones (agendar, comprometer entrega, reasignar)    │
│  5. Guarda cambios en data/tasaciones.json                             │
│  6. Responde por WhatsApp vía Twilio REST API                          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌───────────────────────┐                 ┌───────────────────────┐
   │    WhatsApp Móvil     │                 │   Panel Web Admin     │
   │  (Jose / Beatriz...)  │                 │ (http://localhost/admin│
   └───────────────────────┘                 └───────────────────────┘
```

---

## 🚀 Puesta en marcha rápida

### 1. Requisitos previos
- **Node.js** (v18+)
- Cuenta en **Twilio** (con acceso a WhatsApp Sandbox)
- Clave de API de **Anthropic** (`sk-ant-...`)
- **ngrok** instalado

### 2. Instalación de dependencias
```bash
npm install
```

### 3. Variables de Entorno (`.env`)
Configura tu archivo `.env` con los siguientes parámetros:

```env
PORT=3000

# URL pública de ngrok (actualizada en cada sesión de túnel)
PUBLIC_WEBHOOK_URL=https://TU_SUBDOMINIO.ngrok-free.app/twilio/whatsapp

# Credenciales de Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_MODEL=claude-haiku-5-5
```

### 4. Iniciar el servidor
```bash
npm run dev
```

### 5. Iniciar el túnel de ngrok
En otra ventana de terminal:
```bash
ngrok http 3000
```
Copia la URL `https://...` generada, actualízala en tu `.env` (`PUBLIC_WEBHOOK_URL`) y pégala en la consola de Twilio (**Messaging > Try it out > Send a WhatsApp message > Sandbox Settings** en *"When a message comes in"*).

---

## 👥 Tasadores y Datos de Prueba Iniciales

En `data/tasaciones.json` están precargados los tasadores y encargos de ejemplo:

### Jose (`whatsapp:+34678885650`)
- `70380/18` — RÚA DE PIZARRO 16, VIGO (En redacción)
- `165948/16` — SAMUELLE-TEBRA 00032, TOMIÑO (En redacción)
- `GH 297191` — IGREXA 11, FORNELOS DE MONTES (Asignado, pendiente de visita)
- `166074/16` — REVOLTA PARDERRUBIAS 58, SALCEDA (Asignado, **URGENTE**)

### Beatriz (`whatsapp:+34619076032`)
- `80512/20` — CALLE URZAIZ 45, VIGO (Asignado)
- `204510/19` — AVDA DE CASTELAO 18, CANGAS (Asignado, **URGENTE**)
- `GH 310892` — RÚA DO MAR 5, BUEU (Asignado)

---

## 📱 Cómo probar desde WhatsApp

1. Vincula tu número al Sandbox enviando el mensaje `join <código>` al número del Sandbox de Twilio (`+1 415 523 8886`).
2. Abre en tu navegador el panel de control: **[http://localhost:3000/admin](http://localhost:3000/admin)**.
3. Envía mensajes reales desde WhatsApp como si fueras el tasador:
   - *"Hola Valentina, ¿qué encargos tengo pendientes?"*
   - *"El de Urzaiz lo visito mañana a las 11"*
   - *"El de Pizarro lo envío hoy"*
   - *"El de Revolta si se puede reasignar mejor, hasta el viernes no puedo visitar"*
4. Observa cómo Valentina te responde de forma profesional y cómo los estados, fechas y alertas se actualizan instantáneamente en el panel web.

---

## 📂 Estructura del Proyecto

```text
├── data/
│   └── tasaciones.json         # Base de datos JSON de tasadores, encargos y eventos
├── src/
│   ├── server.js               # Servidor Express, Webhook de Twilio y Dashboard /admin
│   ├── agent.js                # Cerebro IA con Claude (Anthropic SDK + Tool Calling)
│   ├── tasacionesStore.js      # Capa de datos y lógica de negocio de los encargos
│   └── twilio.js               # Cliente y validador de firmas criptográficas de Twilio
├── .env                        # Credenciales y configuración local
├── package.json                # Dependencias y scripts
└── readme.md                   # Documentación del proyecto
```
