import express from 'express';
import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';
import path from 'path';

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ ERROR CRÍTICO: La variable GEMINI_API_KEY no está definida en el archivo .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELO_IA = "gemini-2.5-flash";

const app = express();
app.use(express.static(path.resolve()));
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  next();
});

let historialConversacion = [];
let respuestaPendiente = null; 
let modoHumano = false; 
let esperandoResolucion = false;   
let esperandoCalificacion = false; 

// --- FUNCIÓN PARA NOTIFICACIONES TELEGRAM ---
async function avisarAlHumano(mensaje, esContinuacion = false) {
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const prefijo = esContinuacion ? "💬 *Cliente dice:* " : "🚨 *Alerta en CHATBOT:* ";
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(prefijo + mensaje)}`;
  
  try { await fetch(url); } catch (err) { console.error("Error Telegram:", err); }
}

let ultimoUpdateId = 0;

// --- ESCUCHA ACTIVA DE TELEGRAM ---
setInterval(async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${ultimoUpdateId + 1}&limit=1`;  
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.result && data.result.length > 0) {
      const update = data.result[0];
      ultimoUpdateId = update.update_id;
      const msg = update.message ? update.message.text : null;
      
      if (msg) {
        if (msg.startsWith("/r ")) {
          respuestaPendiente = msg.replace("/r ", ""); 
        }
        else if (msg.trim() === "/bot") {
          modoHumano = false;
          esperandoCalificacion = false;
          respuestaPendiente = "🤖 *El sistema automático ha sido reactivado. ¿En qué más puedo ayudarte?*";
        }
        else if (msg.trim() === "/adios" || msg.trim() === "/cerrar") {
          modoHumano = false; 
          esperandoCalificacion = true; 
          respuestaPendiente = "FORZAR_ENCUESTA"; 
        }
      }
    }
  } catch (error) {
    console.error("Error leyendo actualizaciones de Telegram:", error);
  }
}, 3000);

// --- ENDPOINT PARA QUE LA WEB CONSULTE ESTADOS ---
app.get('/api/v1/chequear-humano', (req, res) => {
  if (respuestaPendiente === "FORZAR_ENCUESTA") {
    res.json({ tipo: "encuesta" });
  } else {
    res.json({ tipo: "texto", respuesta: respuestaPendiente });
  }
  respuestaPendiente = null; 
});

const INSTRUCCION_SISTEMA = `
  Eres un experto de élite en Informática, Ciberseguridad y Tecnología, actuando como el Agente de Soporte Premium de NortonCompany.
  
  Tus directrices absolutas de conocimiento y comportamiento son:
  1. CONOCIMIENTO TOTAL EN TECNOLOGÍA: Tienes autorización total para responder de manera avanzada y completa cualquier pregunta sobre desarrollo de software, hardware, redes, sistemas operativos (Windows, Mac, Linux), bases de datos, inteligencia artificial, infraestructura, automatización y solución de errores técnicos. No te limites solo a productos Norton.
  2. IDENTIDAD Y TONO: Eres sumamente amable, carismático, dynamic y empático. Usa emojis de forma natural (pero profesional) para que la lectura sea agradable.
  3. ESTRUCTURA: Entrega respuestas concisas, estructuradas con viñetas o negritas, fáciles de digerir. Evita bloques de texto gigantescos.
  4. CUÁNDO SUGERIR UN HUMANO: 
     - Si el usuario explícitamente pide hablar con una persona.
     - Si el problema requiere accesos internos de facturación o licencias específicas de Norton que tú no puedas validar.
     - Fuera de esos casos, resuelve tú mismo cualquier duda técnica o informática con tu amplio conocimiento.
`;

// --- FRONTEND EMBEDIDO ---
app.get('/api/v1/chat', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>ChatBot de Norton</title>

      <link rel="icon" type="image/jpeg" href="/images.jpg">
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    </head>
    <body class="bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-800 font-sans h-screen relative overflow-hidden select-none">

      <div id="fondoBienvenida" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-11/12 max-w-xl transition-all duration-300 pointer-events-none drop-shadow-md">
        <h1 class="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">
          Bienvenido al ChatBot de <span class="text-cyan-400">Lucas Norton</span>
        </h1>
        <p class="text-lg text-cyan-200/80 font-medium">
          Haz clic en el robot abajo a la derecha para iniciar una conversación 
        </p>
      </div>

      <div id="chatWrapper" class="hidden fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 transition-all duration-300">
        <div class="w-[480px] h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          
          <div class="bg-neutral-900 text-white p-5 text-center font-bold text-lg tracking-wide border-b-4 border-cyan-500">
            🤖 NORTON´S ChatBot
          </div>
          
          <div id="chatBox" class="p-5 flex-1 overflow-y-auto flex flex-col gap-3 bg-slate-50">
            <div class="p-3 px-4 rounded-xl max-w-[80%] break-words line-clamp-none bg-white text-slate-800 self-start border border-slate-200 rounded-bl-none text-[0.95em] leading-relaxed">
              ¡Hola! ¿En qué puedo colaborar contigo hoy? ✨
            </div>
          </div>
          
          <div class="flex border-t border-slate-100 p-4 bg-white gap-3">
            <input type="text" id="userInput" placeholder="Escribe tu mensaje..." onkeypress="if(event.key === 'Enter') enviar()" class="flex-1 p-3.5 border border-slate-200 rounded-lg outline-none focus:border-cyan-500 transition-colors">
            <button onclick="enviar()" class="bg-cyan-500 hover:bg-cyan-600 text-white font-bold px-6 rounded-lg transition-colors">Enviar</button>
          </div>

        </div>
      </div>

      <button id="chatLauncher" onclick="toggleChat()" class="fixed bottom-6 right-8 w-16 h-16 rounded-full flex justify-center items-center shadow-2xl hover:scale-110 active:scale-95 animate-bounce transition-all duration-200 z-50 border-2 border-cyan-400 outline-none overflow-hidden p-0 bg-black">
        <img id="launcherIcon" src="/autobot.jpg" alt="Robot" class="w-full h-full object-cover scale-125">
      </button>

      <script>
        function toggleChat() {
          const wrapper = document.getElementById('chatWrapper');
          const fondo = document.getElementById('fondoBienvenida');
          const launcher = document.getElementById('chatLauncher');
          
          if (wrapper.classList.contains('hidden')) {
            wrapper.classList.remove('hidden');
            fondo.classList.add('opacity-0', 'scale-95');
            launcher.classList.remove('animate-bounce');
            
            // Reemplaza todo el interior por una cruz blanca estilizada limpia
            launcher.innerHTML = '<span class="text-white text-4xl font-light leading-none">×</span>'; 
            
            const box = document.getElementById('chatBox');
            box.scrollTop = box.scrollHeight;
          } else {
            wrapper.classList.add('hidden');
            fondo.classList.remove('opacity-0', 'scale-95');
            launcher.classList.add('animate-bounce');
            
            launcher.classList.remove('bg-neutral-900', 'p-3.5');
            launcher.classList.add('bg-black');
            launcher.innerHTML = '<img id="launcherIcon" src="/autobot.jpg" alt="Robot" class="w-full h-full object-cover scale-125">';
            
          }
        }

        // Monitoreo constante del estado del backend
        setInterval(() => {
          fetch('/api/v1/chequear-humano')
          .then(res => res.json())
          .then(data => {
            const box = document.getElementById('chatBox');
            
            if (data.tipo === "encuesta") {
              let botonesHTML = \`
                <div class="p-3 px-4 rounded-xl max-w-[80%] break-words line-clamp-none self-start border border-orange-200 text-[0.95em] leading-relaxed bg-orange-50 text-slate-800 rounded-bl-none">
                  🤖 <b>Norton Asistente:</b> Para finalizar, ¿qué te pareció la atención del agente del 1 al 10? Tu opinión nos ayuda muchísimo. ⭐
                  <div class="flex flex-wrap gap-1.5 mt-3">
              \`;
              for (let i = 1; i <= 10; i++) {
                botonesHTML += \`<button onclick="enviarNota('\${i}')" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-sm font-semibold rounded shadow-sm transition-colors">\${i}</button>\`;
              }
              botonesHTML += \`</div></div>\`;
              
              box.innerHTML += botonesHTML;
              box.scrollTop = box.scrollHeight;
            } 
            else if (data.tipo === "texto" && data.respuesta) {
              box.innerHTML += \`
                <div class="p-3 px-4 rounded-xl max-w-[80%] break-words line-clamp-none self-start text-[0.95em] leading-relaxed border border-cyan-200 bg-cyan-50 text-slate-800 font-medium rounded-bl-none">
                  \${data.respuesta.startsWith('🤖') ? '' : '👤 <b>Lucas Norton:</b> '}\${data.respuesta}
                </div>\`;
              box.scrollTop = box.scrollHeight;
            }
          });
        }, 2000);

        function enviarNota(valor) {
          const input = document.getElementById('userInput');
          input.value = valor;
          enviar();
        }

        function enviar() {
          const input = document.getElementById('userInput');
          const box = document.getElementById('chatBox');
          const textoRaw = input.value.trim();
          if(!textoRaw) return;

          const texto = textoRaw.charAt(0).toUpperCase() + textoRaw.slice(1).toLowerCase();

          box.innerHTML += \`<div class="p-3 px-4 rounded-xl max-w-[80%] break-words line-clamp-none bg-cyan-500 text-white self-end rounded-br-none text-[0.95em] leading-relaxed">\${texto}</div>\`;
          input.value = '';
          const thinkingId = 'think-' + Date.now();
          box.innerHTML += \`<div class="p-3 px-4 rounded-xl max-w-[80%] break-words line-clamp-none bg-white text-slate-400 self-start border border-slate-200 rounded-bl-none text-[0.95em] leading-relaxed" id="\${thinkingId}">⏳ Procesando...</div>\`;
          box.scrollTop = box.scrollHeight;
          
          fetch('/api/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensaje: texto })
          })
          .then(res => res.json())
          .then(json => {
            const thinkElem = document.getElementById(thinkingId);
            if (json.bypassia) {
              thinkElem.remove(); 
            } else {
              thinkElem.classList.remove('text-slate-400');
              thinkElem.classList.add('text-slate-800');
              thinkElem.innerHTML = marked.parse(json.data.respuesta);
            }
            box.scrollTop = box.scrollHeight;
          });
        }
      </script>
    </body>
    </html>
  `);
});

// ==========================================
// ENDPOINT POST PRINCIPAL (TODO JUNTO)
// ==========================================
app.post('/api/v1/chat', async (req, res) => {
  const { mensaje } = req.body;

  if (!mensaje || mensaje.trim() === '') return res.status(400).json({ status: "error", message: "Mensaje vacío." });

  if (esperandoResolucion) {
    const respuesta = mensaje.trim().toLowerCase();
    if (respuesta === "sí" || respuesta === "si") {
      esperandoResolucion = false;
      esperandoCalificacion = true;
      return res.status(200).json({
        status: "success",
        data: { respuesta: "🎉 ¡Excelente! Nos alegra mucho que tu problema haya quedado resuelto. Ahora, del 1 al 10, ¿qué tan satisfactorio fue el trato del agente?" }
      });
    } else if (respuesta === "no") {
      esperandoResolucion = false;
      esperandoCalificacion = true;
      return res.status(200).json({
        status: "success",
        data: { respuesta: "🙏 Lamentamos que aún no esté solucionado. Queremos mejorar. Por favor, del 1 al 10, ¿qué tan satisfactorio fue el trato del agente?" }
      });
    } else {
      return res.status(200).json({
        status: "success",
        data: { respuesta: "Por favor responde con 'sí' o 'no' para continuar con la encuesta. 😊" }
      });
    }
  }

  if (esperandoCalificacion) {
    const nota = parseInt(mensaje.trim());
    if (!isNaN(nota) && nota >= 1 && nota <= 10) {
      esperandoCalificacion = false; 
      historialConversacion = []; 
      await avisarAlHumano(`⭐ El cliente calificó tu atención con un: ${nota}/10`);
      return res.status(200).json({
        status: "success",
        data: { respuesta: "✨ ¡Muchas gracias por tu calificación! Tu opinión nos ayuda a mejorar. ¡Hasta la próxima! 👋" }
      });
    } else {
      return res.status(200).json({
        status: "success",
        data: { respuesta: "Por favor, selecciona un número válido del 1 al 10. 😊" }
      });
    }
  }

  if (modoHumano) {
    await avisarAlHumano(mensaje, true);
    return res.status(200).json({ status: "success", bypassia: true, data: { respuesta: "" } });
  }

  const palabrasEscalado = ['humano', 'agente', 'hablar con alguien', 'operador', 'ayuda real', 'queja', 'persona', 'asesor','gerente','lucas norton','necesito asesoramiento de una persona','norton'];
  const esSolicitudDeHumano = palabrasEscalado.some(palabra => mensaje.toLowerCase().includes(palabra));

  if (esSolicitudDeHumano) {
    modoHumano = true;
    await avisarAlHumano(mensaje, false); 
    return res.status(200).json({
      status: "success",
      data: { respuesta: "Entendido. ✨ He detectado que necesitas asistencia personalizada. Estoy notificando a un equipo humano de NortonCompany para que se una a la conversación. ¡Por favor, aguarda un momento! 👤💬" }
    });
  }

  try {
    historialConversacion.push({ role: "user", parts: [{ text: mensaje.trim() }] });

    const response = await ai.models.generateContent({
      model: MODELO_IA,
      contents: historialConversacion, 
      config: { systemInstruction: INSTRUCCION_SISTEMA }
    });
    
    const respuestaIA = response.text;

    if (respuestaIA.toLowerCase().includes("no sé") || respuestaIA.toLowerCase().includes("no tengo información")) {
      modoHumano = true;
      await avisarAlHumano(`La IA no supo responder a: "${mensaje}"`);
      return res.status(200).json({
        status: "success",
        data: { respuesta: respuestaIA + "\n\n💡 *Nota:* He derivado tu consulta con nuestro equipo de soporte humano de NortonCompany. En breve te responderán por acá. ¡Por favor aguarda! 👤" }
      });
    }

    historialConversacion.push({ role: "model", parts: [{ text: respuestaIA }] });
    if (historialConversacion.length > 40) historialConversacion = historialConversacion.slice(-40);

    return res.status(200).json({ status: "success", data: { respuesta: respuestaIA } });

  } catch (error) {
     console.error("Error en generateContent:", error);
      return res.status(500).json({ status: "error", message: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.clear();
  console.log("=================================================");
  console.log("    🚀 SERVIDOR NORTON con su ChatBot   ");
  console.log("=================================================");
  console.log(`🤖 Chat en vivo: http://localhost:${PORT}/api/v1/chat`);
  console.log("=================================================");
});