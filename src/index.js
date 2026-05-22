require('dotenv').config();

const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');

const {
  Client,
  GatewayIntentBits
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const FILE = './src/games.json';

function loadGames() {
  return JSON.parse(fs.readFileSync(FILE));
}

function saveGames(games) {
  fs.writeFileSync(FILE, JSON.stringify(games, null, 2));
}

function getAppId(url) {
  const match = url.match(/app\/(\d+)/);
  return match ? match[1] : null;
}

async function getGame(appId) {
  const url =
    `https://store.steampowered.com/api/appdetails?appids=${appId}`;

  const res = await axios.get(url);

  return res.data[appId].data;
}

client.once('clientReady', () => {
  console.log(`Bot connecté : ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {

  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("Pong !");
  }

  // Ajouter un jeu
  if (message.content.startsWith('!add')) {

    const steamUrl = message.content.split(' ')[1];

    if (!steamUrl) {
      return message.reply('Ajoute une URL Steam.');
    }

    const appId = getAppId(steamUrl);

    if (!appId) {
      return message.reply('URL Steam invalide.');
    }

    const data = await getGame(appId);

    let games = loadGames();

    games.push({
      appId,
      name: data.name,
      released: false
    });

    saveGames(games);

    message.reply(`✅ ${data.name} ajouté.`);
  }

  // Liste des jeux
  if (message.content === '!list') {

    const games = loadGames();

    if (games.length === 0) {
      return message.reply('Aucun jeu.');
    }

    let txt = games
      .map(g => `• ${g.name}`)
      .join('\n');

    message.reply(txt);
  }
});

// Vérification toutes les heures
cron.schedule('0 * * * *', async () => {

  console.log('Check Steam...');

  const channel =
    await client.channels.fetch(process.env.CHANNEL_ID);

  let games = loadGames();

  for (let game of games) {

    const data = await getGame(game.appId);

    const released =
      !data.release_date.coming_soon;

    if (released && !game.released) {

      game.released = true;

      await channel.send(
        `🎮 ${data.name} vient de sortir !\n` +
        `https://store.steampowered.com/app/${game.appId}`
      );
    }
  }

  saveGames(games);

});

client.login(process.env.TOKEN);
