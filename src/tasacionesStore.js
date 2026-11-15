import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/tasaciones.json");

function readData() {
	try {
		if (!fs.existsSync(DATA_FILE)) {
			return { tasadores: [], encargos: [] };
		}
		const raw = fs.readFileSync(DATA_FILE, "utf-8");
		return JSON.parse(raw);
	} catch (err) {
		console.error("Error reading tasaciones.json:", err);
		return { tasadores: [], encargos: [] };
	}
}

function writeData(data) {
	try {
		fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
	} catch (err) {
		console.error("Error writing tasaciones.json:", err);
	}
}

/**
 * Obtiene o asocia el tasador por su teléfono WhatsApp.
 * Si es un número nuevo en pruebas, lo asocia al tasador principal para facilitar el test.
 */
export function getOrCreateTasador(phone) {
	const data = readData();
	const cleanPhone = phone.replace("whatsapp:", "").trim();
	
	let tasador = data.tasadores.find(t => {
		const tPhone = t.telefono.replace("whatsapp:", "").trim();
		return tPhone === cleanPhone || phone.includes(tPhone) || t.telefono === phone;
	});

	if (!tasador) {
		tasador = {
			id: `tas-${Date.now()}`,
			nombre: `Tasador (${cleanPhone.slice(-4)})`,
			telefono: phone
		};
		data.tasadores.push(tasador);
		writeData(data);
	}
	return tasador;
}

export function getEncargosActivos(phone) {
	const data = readData();
	const tasador = getOrCreateTasador(phone);
	return data.encargos.filter(e => e.tasador_id === tasador.id || e.tasador_nombre.toLowerCase() === tasador.nombre.toLowerCase());
}

export function getAllEncargos() {
	return readData().encargos;
}

/**
 * Búsqueda inteligente por número de expediente o por trozos de dirección (ej: "Pizarro", "70380", "GH", "Revolta")
 */
export function findEncargo(query, phone) {
	if (!query) return null;
	const encargos = getEncargosActivos(phone);
	const clean = query.trim().toLowerCase();

	// 1. Coincidencia exacta o parcial de número de expediente
	let match = encargos.find(e => e.num_expediente.toLowerCase().includes(clean) || clean.includes(e.num_expediente.toLowerCase()));
	if (match) return match;

	// 2. Coincidencia por partes de la dirección o municipio
	match = encargos.find(e => {
		const dir = e.direccion.toLowerCase();
		const mun = e.municipio.toLowerCase();
		return dir.includes(clean) || clean.includes(dir) || mun.includes(clean);
	});
	if (match) return match;

	// 3. Coincidencia por palabras clave significativas (ej. "Pizarro", "Tebra", "Igrexa", "Salceda")
	const words = clean.split(/\s+/).filter(w => w.length > 3);
	for (const word of words) {
		match = encargos.find(e => e.direccion.toLowerCase().includes(word) || e.num_expediente.toLowerCase().includes(word) || e.municipio.toLowerCase().includes(word));
		if (match) return match;
	}

	return null;
}

export function agendarVisita({ numExpediente, fechaHora, notas, phone }) {
	const data = readData();
	const encargo = findEncargo(numExpediente, phone);
	if (!encargo) return { success: false, message: `No se encontró el encargo ${numExpediente}` };

	const target = data.encargos.find(e => e.id === encargo.id);
	target.fecha_visita_concertada = fechaHora;
	target.estado = "VISITA_CONCERTADA";
	target.historial_eventos.push({
		fecha: new Date().toISOString(),
		tipo: "VISITA_CONCERTADA",
		detalle: `Visita agendada para: ${fechaHora}. Notas: ${notas || "Ninguna"}`
	});

	writeData(data);
	return {
		success: true,
		encargo: target,
		message: `Visita para ${target.num_expediente} (${target.direccion}) registrada para ${fechaHora}.`
	};
}

export function comprometerEntrega({ numExpediente, fechaCompromiso, notas, phone }) {
	const data = readData();
	const encargo = findEncargo(numExpediente, phone);
	if (!encargo) return { success: false, message: `No se encontró el encargo ${numExpediente}` };

	const target = data.encargos.find(e => e.id === encargo.id);
	target.fecha_estimada_entrega = fechaCompromiso;
	if (target.estado === "ASIGNADO") {
		target.estado = "VISITADO_EN_REDACCION";
	}
	target.historial_eventos.push({
		fecha: new Date().toISOString(),
		tipo: "COMPROMISO_ENTREGA",
		detalle: `Compromiso de entrega de informe: ${fechaCompromiso}. Notas: ${notas || ""}`
	});

	writeData(data);
	return {
		success: true,
		encargo: target,
		message: `Compromiso de entrega de informe para ${target.num_expediente} registrado: ${fechaCompromiso}.`
	};
}

export function solicitarReasignacion({ numExpediente, motivo, disponibilidad, phone }) {
	const data = readData();
	const encargo = findEncargo(numExpediente, phone);
	if (!encargo) return { success: false, message: `No se encontró el encargo ${numExpediente}` };

	const target = data.encargos.find(e => e.id === encargo.id);
	target.estado = "REASIGNACION_SOLICITADA";
	target.historial_eventos.push({
		fecha: new Date().toISOString(),
		tipo: "SOLICITUD_REASIGNACION",
		detalle: `Motivo: ${motivo}. Disponibilidad indicada: ${disponibilidad || "Sin disponibilidad"}`
	});

	writeData(data);
	return {
		success: true,
		encargo: target,
		message: `Solicitud de reasignación para ${target.num_expediente} registrada. Motivo: ${motivo}`
	};
}

export function reportarIncidencia({ numExpediente, tipo, descripcion, phone }) {
	const data = readData();
	const encargo = findEncargo(numExpediente, phone);
	if (!encargo) return { success: false, message: `No se encontró el encargo ${numExpediente}` };

	const target = data.encargos.find(e => e.id === encargo.id);
	target.estado = "INCIDENCIA";
	target.historial_eventos.push({
		fecha: new Date().toISOString(),
		tipo: `INCIDENCIA_${tipo || "GENERAL"}`,
		detalle: descripcion
	});

	writeData(data);
	return {
		success: true,
		encargo: target,
		message: `Incidencia registrada en ${target.num_expediente}: ${descripcion}`
	};
}

export function marcarInformeEntregado({ numExpediente, notas, phone }) {
	const data = readData();
	const encargo = findEncargo(numExpediente, phone);
	if (!encargo) return { success: false, message: `No se encontró el encargo ${numExpediente}` };

	const target = data.encargos.find(e => e.id === encargo.id);
	target.estado = "ENTREGADO";
	target.historial_eventos.push({
		fecha: new Date().toISOString(),
		tipo: "INFORME_ENTREGADO",
		detalle: `Informe entregado por el tasador. ${notas || ""}`
	});

	writeData(data);
	return {
		success: true,
		encargo: target,
		message: `Informe del encargo ${target.num_expediente} marcado como entregado.`
	};
}

