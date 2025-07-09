import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const BOT_PASSWORD = process.env.BOT_PASSWORD;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE_URL = 'https://v3.football.api-sports.io';

// En memoria: lista de usuarios autorizados (temporal, no usa sqlite)
const usuariosAutorizados = new Set();

// Comando para introducir la clave
bot.command('clave', async (ctx) => {
  const input = ctx.message.text.split(' ')[1];
  if (input === BOT_PASSWORD) {
    usuariosAutorizados.add(ctx.from.id);
    ctx.reply('🔓 Acceso concedido. Ya puedes usar los comandos del bot.');
  } else {
    ctx.reply('❌ Clave incorrecta.');
  }
});

// Middleware para verificar si el usuario está autorizado
async function autorizado(ctx, next) {
  if (!usuariosAutorizados.has(ctx.from.id)) {
    return ctx.reply('🔒 Este bot está protegido. Usa /clave [contraseña] para acceder.');
  }
  return next();
}

// Comando para encontrar el mejor partido para apostar
bot.command('mejorpartido', autorizado, async (ctx) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const response = await axios.get(`${API_BASE_URL}/fixtures`, {
      params: { date: today, status: 'NS' },
      headers: { 'x-apisports-key': API_FOOTBALL_KEY }
    });

    const partidos = response.data.response;
    if (!partidos.length) return ctx.reply('⚠️ No se encontraron partidos para hoy.');

    for (let partido of partidos) {
      const oddsResponse = await axios.get(`${API_BASE_URL}/odds`, {
        params: {
          fixture: partido.fixture.id,
          bookmaker: 1
        },
        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
      });

      const odds = oddsResponse.data.response;
      const apuestas = odds[0]?.bookmakers[0]?.bets[0]?.values || [];

      const seleccion = apuestas.find(opt => parseFloat(opt.odd) >= 1.5);
      if (seleccion) {
        return ctx.reply(`📌 Partido sugerido: ${partido.teams.home.name} vs ${partido.teams.away.name}
🎯 Pronóstico: *${seleccion.value}* @ cuota ${seleccion.odd}`, { parse_mode: 'Markdown' });
      }
    }

    ctx.reply('🔍 No se encontró un partido con cuotas adecuadas.');
  } catch (error) {
    console.error('Error al buscar partidos:', error.message);
    ctx.reply('❌ Error al buscar partidos. Intenta más tarde.');
  }
});

// Respuesta genérica SOLO si no es comando
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return; // Ignora comandos
  ctx.reply('🟢 Soy Odran. Cada día publico un pick gratis...');
});

bot.launch();
console.log('🤖 Bot de apuestas deportivas en marcha...');
