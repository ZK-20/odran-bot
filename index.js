import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import axios from 'axios';
import cron from 'node-cron';

dotenv.config();

// Configuración inicial
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE_URL = 'https://v3.football.api-sports.io';
const GRUPO_PREMIUM_ID = process.env.GRUPO_PREMIUM_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o";

// Función para buscar un partido con cuota entre 1.5 y 1.95
async function buscarPartido() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await axios.get(`${API_BASE_URL}/fixtures`, {
      params: { date: today, status: 'NS' },
      headers: { 'x-apisports-key': API_FOOTBALL_KEY }
    });

    const partidos = res.data.response;
    if (!partidos.length) return null;

    for (const partido of partidos) {
      const oddsRes = await axios.get(`${API_BASE_URL}/odds`, {
        params: { fixture: partido.fixture.id, bookmaker: 1 },
        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
      });

      const bets = oddsRes.data.response[0]?.bookmakers[0]?.bets || [];
      for (const mercado of bets) {
        const seleccion = mercado.values.find(opt => {
          const odd = parseFloat(opt.odd);
          return odd >= 1.5 && odd <= 1.95;
        });
        if (seleccion) {
          return {
            home: partido.teams.home.name,
            away: partido.teams.away.name,
            mercado: mercado.name,
            pick: seleccion.value,
            cuota: seleccion.odd
          };
        }
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Error al buscar partido:', error.message);
    return null;
  }
}

// Función para pedir a ChatGPT un análisis persuasivo
async function generarAnalisis(partido) {
  try {
    const prompt = `
Eres un experto en apuestas deportivas. Analiza el siguiente partido y genera un pronóstico razonado, breve, claro, persuasivo y que genere confianza.
Incluye una justificación estadística y psicológica, y presenta el pick final.

📊 Partido: ${partido.home} vs ${partido.away}
🎯 Pick: ${partido.pick}
💰 Cuota: ${partido.cuota}
🏆 Mercado: ${partido.mercado}

Escribe como un tipster profesional, en español, en máximo 4-5 líneas.
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: OPENROUTER_MODEL,
        messages: [
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const mensaje = response.data.choices[0].message.content;
    return mensaje;
  } catch (error) {
    console.error('❌ Error al generar análisis con ChatGPT:', error.message);
    return null;
  }
}

// Cron: todos los días a las 9 a.m. envía pronóstico con análisis
cron.schedule('0 9 * * *', async () => {
  const partido = await buscarPartido();
  if (!partido) {
    console.log('⚠️ No se encontró partido para hoy.');
    return;
  }

  const analisis = await generarAnalisis(partido);
  if (analisis) {
    await bot.telegram.sendMessage(
      GRUPO_PREMIUM_ID,
      `📌 *Fija diaria gratuita*:

${analisis}

✅ Cuota: ${partido.cuota}
🏆 Mercado: ${partido.mercado}`,
      { parse_mode: 'Markdown' }
    );
    console.log('✅ Fija diaria con análisis publicada.');
  } else {
    console.log('⚠️ No se pudo generar análisis.');
  }
}, { timezone: 'America/Lima' });

// Permitir a ti mismo enviar manualmente un pick
bot.command('publicarfija', async (ctx) => {
  const texto = ctx.message.text.split(' ').slice(1).join(' ');
  if (!texto) return ctx.reply('Uso: /publicarfija [texto]');
  await bot.telegram.sendMessage(GRUPO_PREMIUM_ID, `📌 Fija especial:\n\n${texto}`);
  ctx.reply('✅ Fija publicada.');
});

// Mensaje por defecto
bot.on('text', ctx => {
  ctx.reply('🟢 Soy Odran, cada día publico un pick gratis con análisis.');
});

// Lanzar bot
bot.launch();
console.log('🤖 Bot de Odran activo, publicando fijas con análisis inteligente...');
