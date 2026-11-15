import Anthropic from "@anthropic-ai/sdk";
import {
	getOrCreateTasador,
	getEncargosActivos,
	agendarVisita,
	comprometerEntrega,
	solicitarReasignacion,
	reportarIncidencia,
	marcarInformeEntregado
} from "./tasacionesStore.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function mustHaveEnv(name) {
	if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const TOOLS_CONFIG = [
	{
		name: "agendar_visita",
		description: "Registra la fecha y hora concertada para la visita del inmueble de un encargo.",
		input_schema: {
			type: "object",
			properties: {
				num_expediente: {
					type: "string",
					description: "Número de expediente o palabra clave de la dirección (ej: 'GH 297191', 'Igrexa', 'Pizarro', '70380/18')"
				},
				fecha_hora_visita: {
					type: "string",
					description: "Día y hora de la visita concertada (ej: 'Jueves a las 16:30', 'Mañana a las 10:00')"
				},
				notas: {
					type: "string",
					description: "Observaciones relevantes (ej: 'A petición del contacto', 'Llaves en portería')"
				}
			},
			required: ["num_expediente", "fecha_hora_visita"]
		}
	},
	{
		name: "comprometer_entrega",
		description: "Registra el compromiso o estimación de entrega del informe de tasación por parte del tasador.",
		input_schema: {
			type: "object",
			properties: {
				num_expediente: {
					type: "string",
					description: "Número de expediente o dirección (ej: '70380/18', 'Pizarro')"
				},
				fecha_entrega: {
					type: "string",
					description: "Cuándo se entregará el informe (ej: 'Hoy', 'Mañana por la mañana', 'El viernes antes de las 14h')"
				},
				notas: {
					type: "string",
					description: "Notas o comentarios adicionales"
				}
			},
			required: ["num_expediente", "fecha_entrega"]
		}
	},
	{
		name: "solicitar_reasignacion",
		description: "Registra la solicitud del tasador para que el encargo sea reasignado a otro técnico por falta de disponibilidad o imposibilidad de cumplir plazos.",
		input_schema: {
			type: "object",
			properties: {
				num_expediente: {
					type: "string",
					description: "Número de expediente o dirección (ej: '166074/16', 'Revolta')"
				},
				motivo: {
					type: "string",
					description: "Motivo por el que no puede realizarlo a tiempo"
				},
				disponibilidad: {
					type: "string",
					description: "Cuándo podría en caso de no reasignarse (ej: 'Hasta el viernes no puedo visitar')"
				}
			},
			required: ["num_expediente", "motivo"]
		}
	},
	{
		name: "reportar_incidencia",
		description: "Registra un problema o incidencia con el encargo (ej. contacto no responde al teléfono, error en catastro, acceso denegado).",
		input_schema: {
			type: "object",
			properties: {
				num_expediente: {
					type: "string",
					description: "Número de expediente o dirección"
				},
				tipo: {
					type: "string",
					enum: ["CONTACTO_ILOCALIZABLE", "ACCESO_DENEGADO", "FALTA_DOCUMENTACION", "OTRO"],
					description: "Tipo de incidencia"
				},
				descripcion: {
					type: "string",
					description: "Detalle de lo ocurrido"
				}
			},
			required: ["num_expediente", "tipo", "descripcion"]
		}
	},
	{
		name: "marcar_informe_entregado",
		description: "Registra que el tasador ha finalizado y enviado el informe de valoración.",
		input_schema: {
			type: "object",
			properties: {
				num_expediente: {
					type: "string",
					description: "Número de expediente o dirección"
				},
				notas: {
					type: "string",
					description: "Detalles del envío"
				}
			},
			required: ["num_expediente"]
		}
	}
];

function executeTool(name, input, phone) {
	console.log(`[Tool Call] Executing ${name}:`, input);
	switch (name) {
		case "agendar_visita":
			return agendarVisita({
				numExpediente: input.num_expediente,
				fechaHora: input.fecha_hora_visita,
				notas: input.notas,
				phone
			});
		case "comprometer_entrega":
			return comprometerEntrega({
				numExpediente: input.num_expediente,
				fechaCompromiso: input.fecha_entrega,
				notas: input.notas,
				phone
			});
		case "solicitar_reasignacion":
			return solicitarReasignacion({
				numExpediente: input.num_expediente,
				motivo: input.motivo,
				disponibilidad: input.disponibilidad,
				phone
			});
		case "reportar_incidencia":
			return reportarIncidencia({
				numExpediente: input.num_expediente,
				tipo: input.tipo,
				descripcion: input.descripcion,
				phone
			});
		case "marcar_informe_entregado":
			return marcarInformeEntregado({
				numExpediente: input.num_expediente,
				notas: input.notas,
				phone
			});
		default:
			return { success: false, message: `Herramienta desconocida ${name}` };
	}
}

export async function runAgent({ from, userText, session }) {
	mustHaveEnv("ANTHROPIC_API_KEY");
	const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

	// 1. Identificar al tasador y cargar sus encargos específicos
	const tasador = getOrCreateTasador(from);
	const encargos = getEncargosActivos(from);

	const encargosContext = encargos.length > 0
		? encargos.map(e => (
			`• Expediente: ${e.num_expediente} | Dirección: ${e.direccion}, ${e.municipio} | Estado: ${e.estado} | Urgente: ${e.es_urgente ? "SÍ" : "NO"} | Contacto: ${e.contacto_nombre} (${e.contacto_telefono}) | Límite: ${e.fecha_limite_entrega} | Visita pactada: ${e.fecha_visita_concertada || "Pendiente"} | Entrega estimada: ${e.fecha_estimada_entrega || "Pendiente"}`
		)).join("\n")
		: "No hay encargos asignados actualmente a este tasador.";

	const systemPrompt = `
Eres Valentina, coordinadora de operaciones en la sociedad de tasación (Krata / Tinsa).
Tu labor es coordinar a los tasadores vía WhatsApp para asegurar que las visitas se conciertan con rapidez y los informes se entregan en plazo.
Te comunicas de manera profesional, cercana, concisa y directa, como en el día a día real de un gabinete de tasación.

ESTÁS HABLANDO CON EL/LA TASADOR/A: ${tasador.nombre}. Trátale por su nombre de forma natural.

INSTRUCCIONES CLAVE:
1. Cuando el tasador te indique una fecha u hora de visita, usa la herramienta "agendar_visita".
2. Cuando el tasador indique cuándo entregará el informe (ej. "el de Pizarro lo envío hoy", "mañana por la mañana"), usa la herramienta "comprometer_entrega".
3. Cuando el tasador no pueda cumplir y pida reasignar o no tenga disponibilidad, usa "solicitar_reasignacion". En esos casos, si es muy urgente, pídele amablemente si al menos puede dejar la visita agendada con el contacto.
4. Cuando el tasador reporte un problema (contacto no atiende el teléfono, llaves no disponibles), usa "reportar_incidencia".
5. Si el tasador pregunta por sus encargos, respóndele de forma sintética indicando los expedientes pendientes o las prioridades.
6. Mantén tus mensajes breves y naturales (adecuados para WhatsApp). No uses saludos formales excesivos si ya estás en una conversación en curso.

ENCARGOS ASIGNADOS A ESTE TASADOR:
${encargosContext}
`.trim();

	const history = (session.history || []).map(m => ({
		role: m.role,
		content: m.content
	}));

	// Primera llamada a Claude con herramientas
	const currentMessages = [
		...history,
		{ role: "user", content: userText }
	];

	let response = await anthropic.messages.create({
		model,
		max_tokens: 1024,
		system: systemPrompt,
		messages: currentMessages,
		tools: TOOLS_CONFIG
	});

	let toolResults = [];

	// Si Claude decide ejecutar herramientas
	if (response.stop_reason === "tool_use") {
		const assistantContent = response.content;
		const toolCalls = assistantContent.filter(c => c.type === "tool_use");

		for (const call of toolCalls) {
			const res = executeTool(call.name, call.input, from);
			toolResults.push({
				type: "tool_result",
				tool_use_id: call.id,
				content: JSON.stringify(res)
			});
		}

		// Segunda llamada a Claude para que genere la respuesta natural tras ejecutar las herramientas
		const followUpMessages = [
			...currentMessages,
			{ role: "assistant", content: assistantContent },
			{ role: "user", content: toolResults }
		];

		const followUpResponse = await anthropic.messages.create({
			model,
			max_tokens: 1024,
			system: systemPrompt,
			messages: followUpMessages
		});

		const replyText = followUpResponse.content
			.filter(c => c.type === "text")
			.map(c => c.text)
			.join("\n");

		const newSession = {
			...session,
			history: [
				...history,
				{ role: "user", content: userText },
				{ role: "assistant", content: replyText }
			].slice(-20)
		};

		return { reply: replyText, newSession };
	}

	// Si no hubo tool calls, extraer la respuesta de texto directa
	const replyText = response.content
		.filter(c => c.type === "text")
		.map(c => c.text)
		.join("\n") || "Entendido.";

	const newSession = {
		...session,
		history: [
			...history,
			{ role: "user", content: userText },
			{ role: "assistant", content: replyText }
		].slice(-20)
	};

	return { reply: replyText, newSession };
}
