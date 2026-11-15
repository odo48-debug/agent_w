import "dotenv/config";
import express from "express";
import morgan from "morgan";

import { validateTwilioWebhook, sendWhatsAppMessage } from "./twilio.js";
import { hasProcessed, markProcessed, getSession, setSession } from "./store.js";
import { runAgent } from "./agent.js";
import { getAllEncargos } from "./tasacionesStore.js";

const app = express();
app.use(morgan("dev"));

// Twilio sends application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => {
	res.status(200).send("ok");
});

app.get("/api/encargos", (req, res) => {
	res.json(getAllEncargos());
});

app.get("/admin", (req, res) => {
	const encargos = getAllEncargos();
	const stats = {
		total: encargos.length,
		urgentes: encargos.filter(e => e.es_urgente).length,
		visitaConcertada: encargos.filter(e => e.estado === "VISITA_CONCERTADA").length,
		enRedaccion: encargos.filter(e => e.estado === "VISITADO_EN_REDACCION").length,
		reasignar: encargos.filter(e => e.estado === "REASIGNACION_SOLICITADA").length,
		entregados: encargos.filter(e => e.estado === "ENTREGADO").length
	};

	const getBadgeClass = (estado) => {
		switch (estado) {
			case "VISITA_CONCERTADA": return "bg-primary";
			case "VISITADO_EN_REDACCION": return "bg-info text-dark";
			case "REASIGNACION_SOLICITADA": return "bg-danger";
			case "INCIDENCIA": return "bg-warning text-dark";
			case "ENTREGADO": return "bg-success";
			default: return "bg-secondary";
		}
	};

	const rows = encargos.map(e => `
		<tr class="${e.es_urgente ? 'table-warning' : ''}">
			<td>
				<span class="badge ${e.tasador_nombre === 'Beatriz' ? 'bg-purple text-white' : 'bg-primary'}">${e.tasador_nombre}</span>
			</td>
			<td>
				<strong>${e.num_expediente}</strong>
				${e.es_urgente ? '<span class="badge bg-danger ms-1">URGENTE</span>' : ''}
			</td>
			<td>
				<div><strong>${e.direccion}</strong></div>
				<small class="text-muted">${e.municipio} (${e.provincia}) - ${e.tipo_inmueble}</small>
			</td>
			<td>
				<span class="badge ${getBadgeClass(e.estado)}">${e.estado}</span>
			</td>
			<td>
				<div><small><strong>Visita:</strong> ${e.fecha_visita_concertada || '<span class="text-muted">Sin agendar</span>'}</small></div>
				<div><small><strong>Entrega:</strong> ${e.fecha_estimada_entrega || '<span class="text-muted">Sin compromiso</span>'}</small></div>
			</td>
			<td>
				<div>${e.contacto_nombre}</div>
				<small class="text-muted">${e.contacto_telefono}</small>
			</td>
			<td>
				<small class="text-muted">
					${e.historial_eventos.length > 0 ? e.historial_eventos[e.historial_eventos.length - 1].detalle : 'Sin actividad'}
				</small>
			</td>
		</tr>
	`).join("");

	const html = `
<!DOCTYPE html>
<html lang="es">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Panel de Coordinación de Tasaciones | SaaS</title>
	<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
	<meta http-equiv="refresh" content="5">
</head>
<body class="bg-light">
	<nav class="navbar navbar-dark bg-dark px-4 py-3">
		<span class="navbar-brand mb-0 h1">🏢 Coordinación de Tasaciones (Krata / Valentina)</span>
		<span class="text-white small">⚡ Actualización automática cada 5s</span>
	</nav>

	<div class="container-fluid py-4 px-4">
		<div class="row g-3 mb-4">
			<div class="col-md-2">
				<div class="card shadow-sm border-0 bg-white p-3 text-center">
					<div class="text-muted small">Total Encargos</div>
					<div class="fs-3 fw-bold text-dark">${stats.total}</div>
				</div>
			</div>
			<div class="col-md-2">
				<div class="card shadow-sm border-0 bg-white p-3 text-center">
					<div class="text-muted small">Urgentes</div>
					<div class="fs-3 fw-bold text-danger">${stats.urgentes}</div>
				</div>
			</div>
			<div class="col-md-2">
				<div class="card shadow-sm border-0 bg-white p-3 text-center">
					<div class="text-muted small">Visita Agendada</div>
					<div class="fs-3 fw-bold text-primary">${stats.visitaConcertada}</div>
				</div>
			</div>
			<div class="col-md-2">
				<div class="card shadow-sm border-0 bg-white p-3 text-center">
					<div class="text-muted small">En Redacción</div>
					<div class="fs-3 fw-bold text-info">${stats.enRedaccion}</div>
				</div>
			</div>
			<div class="col-md-2">
				<div class="card shadow-sm border-0 bg-white p-3 text-center">
					<div class="text-muted small">Reasignar / Incidencias</div>
					<div class="fs-3 fw-bold text-warning">${stats.reasignar}</div>
				</div>
			</div>
			<div class="col-md-2">
				<div class="card shadow-sm border-0 bg-white p-3 text-center">
					<div class="text-muted small">Entregados</div>
					<div class="fs-3 fw-bold text-success">${stats.entregados}</div>
				</div>
			</div>
		</div>

		<div class="card shadow-sm border-0">
			<div class="card-header bg-white py-3 d-flex justify-content-between align-items-center">
				<h5 class="mb-0 fw-bold">Encargos Activos del Tasador</h5>
				<span class="badge bg-dark">Tasador: Jose</span>
			</div>
			<div class="table-responsive">
				<table class="table table-hover align-middle mb-0">
					<thead class="table-light">
						<tr>
							<th>Tasador/a</th>
							<th>Expediente</th>
							<th>Inmueble / Dirección</th>
							<th>Estado</th>
							<th>Plazos / Fechas</th>
							<th>Contacto Visita</th>
							<th>Última Actualización IA</th>
						</tr>
					</thead>
					<tbody>
						${rows}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</body>
</html>
	`;
	res.send(html);
});

app.post("/twilio/whatsapp", async (req, res) => {
	try {
		const publicUrl = process.env.PUBLIC_WEBHOOK_URL;
		if (!publicUrl) return res.status(500).send("Missing PUBLIC_WEBHOOK_URL");

		const valid = validateTwilioWebhook({ req, publicUrl });
		if (!valid) return res.status(403).send("Invalid Twilio signature");

		const messageSid = req.body.MessageSid;
		const from = req.body.From; // "whatsapp:+1..."
		const body = (req.body.Body || "").trim();

		if (!messageSid || !from) return res.status(400).send("Bad request");

		// Idempotency: Twilio may retry webhooks
		if (hasProcessed(messageSid)) return res.status(200).send("duplicate");
		markProcessed(messageSid);

		if (!body) {
			await sendWhatsAppMessage({ to: from, body: "Hola, ¿en qué puedo ayudarte con los encargos?" });
			return res.status(200).send("ok");
		}

		const session = getSession(from);
		const { reply, newSession } = await runAgent({ from, userText: body, session });

		setSession(from, newSession);
		await sendWhatsAppMessage({ to: from, body: reply });

		res.status(200).send("ok");
	} catch (err) {
		console.error("Error handling WhatsApp webhook:", err);
		res.status(500).send("server error");
	}
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Listening on :${port}`));
